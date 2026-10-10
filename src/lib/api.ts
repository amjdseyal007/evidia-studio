/**
 * Evidia Studio platform-console API client — the single backend seam.
 *
 * Modes (VITE_EVIDIA_API_MODE, read from import.meta.env):
 *
 * - `mock` (DEFAULT): fixtures + fake-JWT seam, no network. Every method
 *   resolves fixture data (src/fixtures/) shaped exactly like the real
 *   backend payloads. This is the only mode ever run against a backend
 *   while the live backend is not deployed.
 * - `live`: fetch-based client for the FastAPI Studio API
 *   (Cognito JWT with custom:tenant_id claim). Requires
 *   VITE_EVIDIA_API_BASE_URL, VITE_COGNITO_USER_POOL_ID,
 *   VITE_COGNITO_CLIENT_ID — misconfiguration throws StudioConfigError
 *   at startup naming the missing vars; the root render path surfaces it
 *   as a visible configuration-error state. Live mode is code-ready
 *   and has NEVER been run against a deployed backend.
 *
 * Mock fixture shapes mirror the real Python payloads:
 * - Cohort: engine/cohort_api.py (POST /cohorts/validate|count|
 *   export/atlas|import/atlas) + engine/cohort_schema.json shapes.
 * - Agents: ai/agents/product_agents.py (5 agents); ontology tools
 *   from ai/ontology_mcp.py (list_metrics, describe_schema, query,
 *   translate_sparql, rag_retrieval, graph_traversal).
 * - Billing: ai/billing.py UsageRecord dicts + invoice_report().
 * - Tenants: governance/tenant_admin.py tenant_plan() /
 *   evaluate_offboard() output shapes.
 * - DQ: dataquality/core.py QualityResult.to_dict() (score 0-100).
 * - Part 11: governance/part11.py SignatureRecord dicts.
 */
import { agentFixtures, agentRunFixtures } from '../fixtures/agents';
import { atlasExportFixture, cohortCountFixture, sampleCohortDefinition } from '../fixtures/cohort';
import { dqFixtureByTenant, invoiceReportFixture, studyFixtures, usageRecordFixtures } from '../fixtures/dashboard';
import { evidenceFixture } from '../fixtures/evidence';
import type { EngagementHealth, EngagementPhase, EngagementRecord } from '../fixtures/engagements';
import { defaultAgentStates, defaultServiceStates } from '../fixtures/services';
import type { ServiceKey, TenantServiceStates } from '../fixtures/services';
import type { TeamRecord } from '../fixtures/teams';
import { tenantFixtures } from '../fixtures/tenants';
import { classParentSeed, classSynonymSeed, mcpToolSeed, ontologyClassSeed, ontologyExtensionClassSeed, ontologyNamespaceSeed, ontologyPropertySeed, pipelineStages, semanticSearchOntology } from '../fixtures/ontology';
import type { ChangeProposal, ConceptMapping, OntologyVersion, SemanticHit } from '../fixtures/ontology';
export type { ChangeProposal, ConceptMapping, OntologyVersion, SemanticHit };
import type {
  ActivityItem, ApiKeyRecord, ConnectorRecord, ControlTenant, DatasetRecord,
  EnvironmentRecord, NotificationItem, PipelineRun, ProductRecord,
  ServiceHealth, UserRecord,
} from '../fixtures/platform';
import type { ConnectorCapability, FieldMapping } from '../fixtures/platform';
import * as store from './store';
import type { AuditEntry, BudgetSetting, EvidenceExportRecord, SavedCohort, StudyClassification, StudyTask, WebhookRecord } from './store';
import type { CustomRoleDef, AccessRequest } from '../fixtures/access';
import type { Permission, Role } from './permissions';
import { currentTenant, getToken } from './auth';

export type {
  ActivityItem, ApiKeyRecord, ConnectorRecord, ControlTenant, DatasetRecord,
  EnvironmentRecord, NotificationItem, PipelineRun, ProductRecord,
  ServiceHealth, UserRecord, AuditEntry, SavedCohort, ConnectorCapability,
  FieldMapping, ServiceKey, TenantServiceStates, TeamRecord, EngagementRecord,
  EngagementPhase, EngagementHealth, EvidenceExportRecord, StudyClassification,
  StudyTask, BudgetSetting, WebhookRecord,
  CustomRoleDef, AccessRequest, Permission,
};

// ---------------------------------------------------------------------------
// Mode configuration (env-based switch)
// ---------------------------------------------------------------------------

export type ApiMode = 'mock' | 'live';

/** Vite env values (only VITE_-prefixed vars reach the browser). */
export interface StudioEnv {
  VITE_EVIDIA_API_MODE?: string;
  VITE_EVIDIA_API_BASE_URL?: string;
  VITE_COGNITO_USER_POOL_ID?: string;
  VITE_COGNITO_CLIENT_ID?: string;
  [key: string]: string | undefined;
}

export interface ApiConfig {
  mode: ApiMode;
  /** Base URL of the FastAPI Studio API (live mode only; null in mock). */
  apiBaseUrl: string | null;
  /** Cognito user pool id (live mode only; surfaced for diagnostics). */
  cognitoUserPoolId: string | null;
  /** Cognito app client id (live mode only; surfaced for diagnostics). */
  cognitoClientId: string | null;
}

export const REQUIRED_LIVE_VARS = [
  'VITE_EVIDIA_API_BASE_URL',
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_CLIENT_ID',
] as const;

export class StudioConfigError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'StudioConfigError';
    this.missing = missing;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function trimmedOrNull(value: string | undefined): string | null {
  return isBlank(value) ? null : (value as string).trim();
}

/**
 * Resolve the API mode from Vite env vars.
 *
 * - Unset/empty VITE_EVIDIA_API_MODE -> `mock` (fixtures; current behavior).
 * - VITE_EVIDIA_API_MODE=live requires all of REQUIRED_LIVE_VARS; any
 *   missing/empty var throws StudioConfigError naming exactly what's
 *   missing (no silent fall back to mock).
 * - Any other VITE_EVIDIA_API_MODE value throws StudioConfigError.
 *
 * Injectable for tests: pass an explicit env object instead of
 * import.meta.env.
 */
export function resolveApiModeConfig(
  env: StudioEnv = import.meta.env as StudioEnv,
): ApiConfig {
  const rawMode = env.VITE_EVIDIA_API_MODE;
  const normalized = isBlank(rawMode) ? 'mock' : (rawMode as string).trim().toLowerCase();

  if (normalized !== 'mock' && normalized !== 'live') {
    throw new StudioConfigError(
      `Evidia Studio misconfiguration: VITE_EVIDIA_API_MODE must be "mock" or "live" (got "${String(rawMode)}"). ` +
        'Set VITE_EVIDIA_API_MODE=mock for local fixtures.',
      ['VITE_EVIDIA_API_MODE'],
    );
  }

  const mode = normalized as ApiMode;
  const apiBaseUrl = trimmedOrNull(env.VITE_EVIDIA_API_BASE_URL);
  const cognitoUserPoolId = trimmedOrNull(env.VITE_COGNITO_USER_POOL_ID);
  const cognitoClientId = trimmedOrNull(env.VITE_COGNITO_CLIENT_ID);

  if (mode === 'live') {
    const missing: string[] = [];
    if (!apiBaseUrl) missing.push('VITE_EVIDIA_API_BASE_URL');
    if (!cognitoUserPoolId) missing.push('VITE_COGNITO_USER_POOL_ID');
    if (!cognitoClientId) missing.push('VITE_COGNITO_CLIENT_ID');
    if (missing.length > 0) {
      throw new StudioConfigError(
        `Evidia Studio live mode misconfiguration: missing required environment variable(s): ${missing.join(', ')}. ` +
          `Provide ${missing.join(', ')} (see .env.example), or set VITE_EVIDIA_API_MODE=mock for local fixtures.`,
        missing,
      );
    }
  }

  return { mode, apiBaseUrl, cognitoUserPoolId, cognitoClientId };
}

/**
 * Resolved config for the running app. Resolving at import time is the
 * "fail loudly at startup" behavior: a live-misconfigured bundle throws
 * before any view renders, and the root render path (src/main.tsx)
 * displays StudioConfigError as a visible configuration-error state.
 */
export const API_CONFIG: ApiConfig = resolveApiModeConfig();
export const MODE: ApiMode = API_CONFIG.mode;

// ---------------------------------------------------------------------------
// Cohort (engine/cohort_schema.json + engine/cohort.py)
// ---------------------------------------------------------------------------
export interface Concept {
  concept_id: number;
  concept_name: string;
  domain_id: string;
  vocabulary_id: string;
  concept_code: string;
  standard_concept: string;
  include_descendants: boolean;
  include_mapped: boolean;
  is_excluded: boolean;
}
export interface ConceptSet { id: number; name: string; domain: string; concepts: Concept[] }
export interface Criterion { concept_set_id: number; domain: string }
export interface ObservationWindow { prior_days: number; post_days: number }
export interface InclusionRule {
  name: string;
  type: string;
  age_min: number | null;
  age_max: number | null;
  gender_concept_ids: number[];
  min_prior_observation_days: number | null;
  min_post_observation_days: number | null;
  criteria: Criterion[];
}
export interface EndStrategy {
  strategy_type: string;
  date_offset_days: number | null;
  drug_concept_set_id: number | null;
  gap_days: number | null;
  era_length_days: number | null;
}
export interface CollapseSettings { collapse_type: string; era_pad_days: number }
export interface CohortDefinition {
  name: string;
  description: string;
  concept_sets: ConceptSet[];
  primary_criteria: Criterion[];
  entry_observation_window: ObservationWindow;
  inclusion_rules: InclusionRule[];
  end_strategy: EndStrategy;
  collapse_settings: CollapseSettings;
  qualified_limit: string;
  expression_limit: string;
}
export interface ValidateResult { valid: boolean; errors: string[] }
export interface AttritionStep { step: string; n_remaining: number; n_excluded: number }
export interface CohortCountResult {
  total_persons: number;
  entry_count: number;
  final_count: number;
  person_ids: number[];
  attrition: AttritionStep[];
  data_note: string;
  synthetic_disclosure?: boolean;
}
/** ATLAS cohort-definition JSON document (to_atlas_json output). */
export interface AtlasDocument {
  name: string;
  description: string;
  ConceptSets: unknown[];
  PrimaryCriteria: unknown;
  InclusionRules: unknown[];
  QualifiedLimit: unknown;
  ExpressionLimit: unknown;
  EndStrategy: unknown;
  CensoringCriteria: unknown[];
  CollapseSettings: unknown;
}

// ---------------------------------------------------------------------------
// Data quality (dataquality/core.py)
// ---------------------------------------------------------------------------
export interface DqCheck {
  check_id: string;
  family: string;
  table: string;
  description: string;
  status: 'pass' | 'fail' | 'warn';
  numerator: number;
  denominator: number;
  threshold: { fail_offending_rate_gt: number; warn_offending_rate_gt: number };
  offending_count: number;
  offending_rate: number;
}
export interface DqProvenance {
  tenant_id: string;
  dataset_fingerprint: string;
  source_description: string;
  tool: string;
  tool_version: string;
  check_suite_version: string;
  generated_at: string;
  run_id: string;
  score: number;
  counts: Record<string, unknown>;
  dataset_reference: string | null;
  config_snapshot: Record<string, unknown>;
  label: string;
}
export interface QualityResult {
  run_id: string;
  tenant_id: string;
  score: number;
  label: string;
  summary: {
    total_checks: number; passed: number; failed: number; warned: number;
    tables_evaluated: string[]; rows_by_table: Record<string, number>; total_rows: number;
  };
  checks: DqCheck[];
  provenance: DqProvenance;
}

// ---------------------------------------------------------------------------
// Studies / billing (ai/billing.py)
// ---------------------------------------------------------------------------
export interface StudySummary {
  study_id: string;
  tenant_id: string;
  name: string;
  status: string;
  updated_at: string;
  cohort_final_count: number | null;
  /** R3 classification. Undefined = Standard (pre-classification studies). */
  classification?: 'standard' | 'regulatory';
  /** Ontology version pinned at classification (Regulatory only). */
  ontology_version?: string | null;
  /** Retention lock applied by Regulatory classification. */
  retention_locked?: boolean;
}
export interface UsageRecord {
  tenant_id: string;
  study_id: string | null;
  event_type: 'agent_invocation' | 'ontology_query' | 'deid_run' | 'batch_job';
  timestamp_utc: string;
  quantity: number;
  unit: string;
  input_tokens: number | null;
  output_tokens: number | null;
  model_id: string | null;
  unit_price_ref: string | null;
  input_price_per_1m_usd: number | null;
  output_price_per_1m_usd: number | null;
  line_total_usd: number | null;
  priced: boolean;
  pricing_version: string;
  metadata: Record<string, unknown>;
}
export interface InvoiceLineItem {
  study_id: string | null;
  event_type: string;
  model_id: string | null;
  unit: string;
  quantity: number;
  input_tokens: number;
  output_tokens: number;
  record_count: number;
  unit_price_ref: string | null;
  input_price_per_1m_usd: number | null;
  output_price_per_1m_usd: number | null;
  line_total_usd: number | null;
  priced: boolean;
}
export interface InvoiceReport {
  tenant_id: string;
  period_start: string;
  period_end: string;
  generated_at_utc: string;
  pricing_version: string;
  currency: string;
  record_count: number;
  line_items: InvoiceLineItem[];
  by_study: Array<{ study_id: string | null; line_items: InvoiceLineItem[]; record_count: number; subtotal_usd: number; has_unpriced: boolean }>;
  totals: { record_count: number; priced_record_count: number; unpriced_record_count: number; priced_total_usd: number; total_usd: number; quantity_by_unit: Record<string, number> };
  unpriced: { record_count: number; quantity_by_unit: Record<string, number>; line_items: InvoiceLineItem[] };
}

// ---------------------------------------------------------------------------
// Agents (ai/agents/product_agents.py + ai/ontology_mcp.py)
// ---------------------------------------------------------------------------
export type OntologyToolName = 'list_metrics' | 'describe_schema' | 'query' | 'translate_sparql' | 'rag_retrieval' | 'graph_traversal' | 'resolve_concept' | 'describe_concept' | 'semantic_search';
export interface AgentDefinition {
  name: string;
  display_name: string;
  description: string;
  prompt_name: string;
  ontology_agent_key: string;
  allowed_ontology_tools: OntologyToolName[];
  /** Catalog metadata (agent catalog): packaged version. */
  version: string;
  /** Data-handling disclosure: what the agent can read / what crosses the tenant boundary. */
  data_handling: string;
}
export interface OntologyToolCall { tool: OntologyToolName; args_summary: string; latency_ms: number; status: string }
export interface AgentRun {
  run_id: string;
  agent_name: string;
  tenant_id: string;
  study_id: string | null;
  status: 'succeeded' | 'failed' | 'running';
  started_at: string;
  finished_at: string | null;
  input_tokens: number;
  output_tokens: number;
  model_id: string;
  prompt_name: string;
  goal: string;
  ontology_tool_calls: OntologyToolCall[];
}

// ---------------------------------------------------------------------------
// Evidence package / Part 11 (governance/part11.py)
// ---------------------------------------------------------------------------
export interface ProvenanceStep { stage: string; label: string; status: string; at: string; detail: string }
export interface SignatureRecord {
  sequence: number;
  signer_id: string;
  signer_name: string;
  signer_role: string;
  tenant_id: string;
  meaning: string;
  attestation: string;
  artifact_sha256: string;
  signed_at_utc: string;
  previous_hash: string;
  record_hash: string;
}
export interface EvidencePackage {
  study_id: string;
  tenant_id: string;
  title: string;
  chain: ProvenanceStep[];
  signatures: SignatureRecord[];
  chain_intact: boolean;
  chain_head_hash: string;
}

// ---------------------------------------------------------------------------
// Tenants (governance/tenant_admin.py)
// ---------------------------------------------------------------------------
export interface TenantResources {
  kms_alias: string;
  kms_key_construct_id: string;
  s3_buckets: Record<string, string>;
  s3_prefixes: Record<string, string>;
  task_role_name: string;
  task_role_construct_id: string;
  batch_queue_name: string;
  batch_queue_construct_id: string;
  cognito_group_name: string;
  cognito_group_construct_id: string;
  cognito_tenant_attribute: string;
  lakeformation_tenant_tag_value: string;
  ontology_namespace: string;
}
export interface TenantPlan {
  tenant_id: string;
  env_name: string;
  namespace_prefix: string;
  is_new: boolean;
  existing_tenants: string[];
  tenants_after: string[];
  resources: TenantResources;
  dry_run: boolean;
  action_taken: string;
  next_steps: string[];
}
export interface OffboardSource { status: 'clean' | 'data_found' | 'unverifiable'; detail: string; hits: number }
export interface OffboardVerdict {
  tenant_id: string;
  allowed: boolean;
  blocked_reasons: string[];
  evidence: { billing: OffboardSource; dataquality: OffboardSource; studio: OffboardSource };
  dry_run: boolean;
  action_taken: string;
}
export interface TenantUser { user_id: string; email: string; groups: string[] }
export interface TenantAdminEntry {
  tenant_id: string;
  display_name: string;
  plan: TenantPlan;
  provisioning_status: 'active' | 'provisioning';
  groups: string[];
  users: TenantUser[];
  offboard: OffboardVerdict;
}

// ---------------------------------------------------------------------------
// Shared client contract — the exact surface the views consume. Mock and
// live implementations are interchangeable behind this interface.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Enterprise console extension (control plane, pipeline, connectors,
// users, products, ontology, tenant services, teams, delivery & support).
// Mock implementations delegate to the stateful demo store
// (src/lib/store.ts); live implementations fail loudly (endpoints not
// mounted on studio/api yet).
// ---------------------------------------------------------------------------
export interface OntologyBundle {
  classes: typeof ontologyClassSeed;
  properties: typeof ontologyPropertySeed;
  namespaces: typeof ontologyNamespaceSeed;
  pipelineStages: typeof pipelineStages;
  mcpTools: typeof mcpToolSeed;
  mappings: ConceptMapping[];
  versions: OntologyVersion[];
  proposals: ChangeProposal[];
  parents: typeof classParentSeed;
  synonyms: typeof classSynonymSeed;
}
export interface ProductEntitlement { product: ProductRecord; entitled: boolean; note: string }
export interface OffboardCheck { allowed: boolean; blocked_reasons: string[] }
export interface ConnectorTestResult { ok: boolean; latency_ms: number; message: string }

export interface StudioApi {
  mode: ApiMode;
  listTenants(): Promise<TenantAdminEntry[]>;
  getTenantAdmin(tenantId: string): Promise<TenantAdminEntry | null>;
  getDqResult(tenantId: string): Promise<QualityResult>;
  listStudies(tenantId: string): Promise<StudySummary[]>;
  getInvoiceReport(tenantId: string): Promise<InvoiceReport>;
  listUsageRecords(tenantId: string): Promise<UsageRecord[]>;
  validateCohort(definition: CohortDefinition): Promise<ValidateResult>;
  countCohort(definition: CohortDefinition): Promise<CohortCountResult>;
  exportAtlas(definition: CohortDefinition): Promise<AtlasDocument>;
  getSampleDefinition(): Promise<CohortDefinition>;
  getEvidencePackage(studyId: string): Promise<EvidencePackage>;
  listAgents(): Promise<AgentDefinition[]>;
  listAgentRuns(tenantId?: string): Promise<AgentRun[]>;

  // --- enterprise console extension ---
  listCpTenants(): Promise<ControlTenant[]>;
  provisionTenant(input: store.ProvisionTenantInput): Promise<ControlTenant>;
  evaluateOffboard(tenantId: string): Promise<OffboardCheck>;
  offboardTenant(tenantId: string, actor: string): Promise<OffboardCheck>;
  getEnvironments(): Promise<EnvironmentRecord[]>;
  listServices(): Promise<ServiceHealth[]>;
  listAudit(tenantId?: string): Promise<AuditEntry[]>;
  listUsers(tenantId?: string): Promise<UserRecord[]>;
  inviteUser(input: store.InviteUserInput): Promise<UserRecord>;
  setUserStatus(userId: string, status: UserRecord['status'], actor: string): Promise<void>;
  setUserRole(userId: string, role: Role, actor: string): Promise<void>;
  listDatasets(tenantId?: string): Promise<DatasetRecord[]>;
  addDataset(input: { name: string; tenant_id: string; layer: DatasetRecord['layer']; source: string; actor: string }): Promise<DatasetRecord>;
  listPipelineRuns(tenantId?: string): Promise<PipelineRun[]>;
  startPipelineRun(datasetId: string, actor: string): Promise<PipelineRun>;
  listConnectors(tenantId?: string): Promise<ConnectorRecord[]>;
  addConnector(input: store.AddConnectorInput): Promise<ConnectorRecord>;
  testConnector(connectorId: string, actor: string): Promise<ConnectorTestResult>;
  setConnectorEnabled(connectorId: string, enabled: boolean, actor: string): Promise<void>;
  deleteConnector(connectorId: string, actor: string): Promise<void>;
  listProducts(): Promise<ProductRecord[]>;
  listEntitlements(tenantId: string): Promise<ProductEntitlement[]>;
  listSavedCohorts(tenantId?: string): Promise<SavedCohort[]>;
  saveCohort(name: string, definition: CohortDefinition, finalCount: number | null, tenantId: string, author: string): Promise<SavedCohort>;
  deleteCohort(id: string, actor: string): Promise<void>;
  startAgentRun(agentName: string, tenantId: string, studyId: string | null, actor: string): Promise<AgentRun>;
  listEvidencePackages(tenantId: string): Promise<EvidencePackage[]>;
  listApiKeys(tenantId: string): Promise<ApiKeyRecord[]>;
  createApiKey(name: string, tenantId: string, actor: string, scopes?: string[]): Promise<{ record: ApiKeyRecord; secret: string }>;
  revokeApiKey(keyId: string, actor: string): Promise<void>;
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  listActivity(tenantId?: string): Promise<ActivityItem[]>;
  getOntology(): Promise<OntologyBundle>;
  listConceptMappings(): Promise<ConceptMapping[]>;
  mapCodes(codesText: string, tenantId: string, actor: string): Promise<store.MapCodesResult>;
  reviewMapping(id: string, decision: 'approved' | 'rejected', tenantId: string, actor: string): Promise<void>;
  decideProposal(id: string, decision: 'approved' | 'rejected', tenantId: string, actor: string): Promise<void>;
  submitProposal(input: { title: string; kind: ChangeProposal['kind']; detail: string }, tenantId: string, actor: string): Promise<ChangeProposal>;
  semanticSearch(query: string): Promise<SemanticHit[]>;
  signEvidence(tenantId: string, signerName: string, signerId: string, meaning: string): Promise<void>;

  // --- tenant services, teams, delivery & support extension ---
  getTenantServices(tenantId: string): Promise<TenantServiceStates>;
  setServiceEnabled(tenantId: string, key: ServiceKey, enabled: boolean, actor: string): Promise<void>;
  getAgentServices(tenantId: string): Promise<Record<string, boolean>>;
  setAgentEnabled(tenantId: string, agentName: string, enabled: boolean, actor: string): Promise<void>;
  listTeams(tenantId?: string): Promise<TeamRecord[]>;
  createTeam(input: store.CreateTeamInput): Promise<TeamRecord>;
  deleteTeam(teamId: string, actor: string): Promise<void>;
  addTeamMember(teamId: string, userId: string, actor: string): Promise<void>;
  removeTeamMember(teamId: string, userId: string, actor: string): Promise<void>;
  setTeamRole(teamId: string, role: Role, actor: string): Promise<void>;
  listEngagements(): Promise<EngagementRecord[]>;
  setEngagementPhase(tenantId: string, phase: EngagementPhase, actor: string): Promise<void>;
  setEngagementHealth(tenantId: string, health: EngagementHealth, actor: string): Promise<void>;
  toggleEngagementMilestone(tenantId: string, milestone: string, actor: string): Promise<void>;
  startSupportSession(tenantId: string, actor: string): Promise<void>;
  endSupportSession(tenantId: string, actor: string): Promise<void>;
  activateBreakGlass(tenantId: string, actor: string, reason: string): Promise<void>;

  // --- maturation backlog: R3 classification/exports, R5 roles,
  //     R7 scoped keys (in createApiKey above), R8 governance decisions ---
  classifyStudy(studyId: string, level: StudyClassification, actor: string): Promise<StudySummary>;
  createStudy(input: { name: string; tenant_id: string; classification: StudyClassification }, actor: string): Promise<StudySummary>;
  exportEvidencePackage(studyId: string, actor: string): Promise<EvidenceExportRecord>;
  listEvidenceExports(tenantId: string): Promise<EvidenceExportRecord[]>;
  verifyEvidenceExport(exportId: string): Promise<boolean>;
  decideOntologyVersion(version: string, decision: 'approved' | 'rejected', tenantId: string, actor: string): Promise<OntologyVersion>;
  listCustomRoles(tenantId?: string): Promise<CustomRoleDef[]>;
  createCustomRole(input: { name: string; description?: string; tenant_id: string; cloned_from: Role; permissions: Permission[] }, actor: string): Promise<CustomRoleDef>;
  updateCustomRole(id: string, patch: { name?: string; description?: string; permissions?: Permission[] }, actor: string): Promise<void>;
  deleteCustomRole(id: string, actor: string): Promise<void>;
  assignCustomRole(userId: string, customRoleId: string | null, actor: string): Promise<void>;
  listAccessRequests(tenantId?: string): Promise<AccessRequest[]>;
  requestAccess(input: { tenant_id: string; user_id: string | null; requester_name: string; requester_email: string; requested_role: string; is_custom: boolean; reason: string }, actor: string): Promise<AccessRequest>;
  decideAccessRequest(id: string, decision: 'approved' | 'rejected', actor: string): Promise<void>;

  // --- console completion pass: study lifecycle/tasks, budgets, webhooks ---
  setStudyStatus(studyId: string, status: string, actor: string): Promise<StudySummary>;
  addStudyTask(input: { study_id: string; title: string; owner: string; due: string | null }, actor: string): Promise<store.StudyTask>;
  toggleStudyTask(id: string, actor: string): Promise<void>;
  deleteStudyTask(id: string, actor: string): Promise<void>;
  setBudget(tenantId: string, monthlyUsd: number, alertThresholdPct: number, actor: string): Promise<store.BudgetSetting>;
  sendUsageReport(tenantId: string, actor: string): Promise<void>;
  createWebhook(input: { tenant_id: string; url: string; events: string[] }, actor: string): Promise<store.WebhookRecord>;
  deleteWebhook(webhookId: string, actor: string): Promise<void>;
  setWebhookEnabled(webhookId: string, enabled: boolean, actor: string): Promise<void>;
  testWebhook(webhookId: string, actor: string): Promise<{ ok: boolean; status_code: number; latency_ms: number; message: string }>;
  resendInvite(userId: string, actor: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mock client — resolves fixtures after a tick. No network, ever (MODE=mock).
// ---------------------------------------------------------------------------
function tick<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 10));
}

export function createMockApi(): StudioApi {
  return {
    mode: 'mock' as const,

    async listTenants(): Promise<TenantAdminEntry[]> {
      return tick(tenantFixtures);
    },
    async getTenantAdmin(tenantId: string): Promise<TenantAdminEntry | null> {
      return tick(tenantFixtures.find((t) => t.tenant_id === tenantId) ?? null);
    },
    async getDqResult(tenantId: string): Promise<QualityResult> {
      return tick(dqFixtureByTenant[tenantId] ?? dqFixtureByTenant.acme_rare);
    },
    async listStudies(tenantId: string): Promise<StudySummary[]> {
      return tick(store.getState().studies.filter((s) => s.tenant_id === tenantId));
    },
    async getInvoiceReport(tenantId: string): Promise<InvoiceReport> {
      // Fixture report is authored for acme_rare; re-stamp the tenant id so
      // the demo switcher still renders a coherent (still fixture) summary.
      return tick({ ...invoiceReportFixture, tenant_id: tenantId });
    },
    async listUsageRecords(tenantId: string): Promise<UsageRecord[]> {
      return tick(usageRecordFixtures.filter((r) => r.tenant_id === tenantId));
    },

    // Cohort endpoints (engine/cohort_api.py shapes)
    async validateCohort(definition: CohortDefinition): Promise<ValidateResult> {
      const errors: string[] = [];
      if (!definition.name) errors.push('name: Field required');
      const known = new Set((definition.concept_sets ?? []).map((c) => c.id));
      (definition.primary_criteria ?? []).forEach((c, i) => {
        if (known.size && !known.has(c.concept_set_id)) {
          errors.push(`primary_criteria[${i}].concept_set_id ${c.concept_set_id} does not match any concept set id (known: ${[...known].sort()})`);
        }
      });
      return tick({ valid: errors.length === 0, errors });
    },
    async countCohort(_definition: CohortDefinition): Promise<CohortCountResult> {
      return tick(cohortCountFixture);
    },
    async exportAtlas(_definition: CohortDefinition): Promise<AtlasDocument> {
      return tick(atlasExportFixture);
    },
    async getSampleDefinition(): Promise<CohortDefinition> {
      return tick(sampleCohortDefinition);
    },

    async getEvidencePackage(studyId: string): Promise<EvidencePackage> {
      return tick({ ...evidenceFixture, study_id: studyId });
    },
    async listAgents(): Promise<AgentDefinition[]> {
      return tick(agentFixtures);
    },
    async listAgentRuns(tenantId?: string): Promise<AgentRun[]> {
      return tick(tenantId ? agentRunFixtures.filter((r) => r.tenant_id === tenantId) : agentRunFixtures);
    },

    // --- enterprise console extension (demo store backed) ---
    async listCpTenants() {
      return tick(store.getState().tenants);
    },
    async provisionTenant(input) {
      return tick(store.provisionTenant(input));
    },
    async evaluateOffboard(tenantId) {
      return tick(store.evaluateOffboard(tenantId));
    },
    async offboardTenant(tenantId, actor) {
      return tick(store.offboardTenant(tenantId, actor));
    },
    async getEnvironments() {
      return tick(store.getState().environments);
    },
    async listServices() {
      return tick(store.getState().services);
    },
    async listAudit(tenantId) {
      const all = store.getState().audit;
      return tick(tenantId ? all.filter((a) => a.tenant_id === tenantId) : all);
    },
    async listUsers(tenantId) {
      const all = store.getState().users;
      return tick(tenantId ? all.filter((u) => u.tenant_id === tenantId) : all);
    },
    async inviteUser(input) {
      return tick(store.inviteUser(input));
    },
    async setUserStatus(userId, status, actor) {
      store.setUserStatus(userId, status, actor); return tick(undefined);
    },
    async setUserRole(userId, role, actor) {
      store.setUserRole(userId, role, actor); return tick(undefined);
    },
    async listDatasets(tenantId) {
      const all = store.getState().datasets;
      return tick(tenantId ? all.filter((d) => d.tenant_id === tenantId) : all);
    },
    async addDataset(input) {
      return tick(store.addDataset(input));
    },
    async listPipelineRuns(tenantId) {
      const all = store.getState().pipelineRuns;
      return tick(tenantId ? all.filter((r) => r.tenant_id === tenantId) : all);
    },
    async startPipelineRun(datasetId, actor) {
      return tick(store.startPipelineRun(datasetId, actor));
    },
    async listConnectors(tenantId) {
      const all = store.getState().connectors;
      return tick(tenantId ? all.filter((c) => c.tenant_id === tenantId) : all);
    },
    async addConnector(input) {
      return tick(store.addConnector(input));
    },
    async testConnector(connectorId, actor) {
      return store.testConnector(connectorId, actor);
    },
    async setConnectorEnabled(connectorId, enabled, actor) {
      store.setConnectorEnabled(connectorId, enabled, actor); return tick(undefined);
    },
    async deleteConnector(connectorId, actor) {
      store.deleteConnector(connectorId, actor); return tick(undefined);
    },
    async listProducts() {
      return tick(store.getState().products);
    },
    async listEntitlements(tenantId) {
      const notes: Record<string, string> = {
        P0: 'Platform subscription — active',
        P1: tenantId === 'acme_rare' ? '2 studies under contract' : 'Not contracted',
        P2: 'Cycle 3 window opens Nov 1, 2026',
        P3: 'Add-on — not enabled',
      };
      return tick(store.getState().products.map((p) => ({
        product: p,
        entitled: p.product_id === 'P0' || (tenantId === 'acme_rare' && p.product_id === 'P1'),
        note: notes[p.product_id],
      })));
    },
    async listSavedCohorts(tenantId) {
      const all = store.getState().savedCohorts;
      return tick(tenantId ? all.filter((c) => c.tenant_id === tenantId) : all);
    },
    async saveCohort(name, definition, finalCount, tenantId, author) {
      return tick(store.saveCohort(name, definition, finalCount, tenantId, author));
    },
    async deleteCohort(id, actor) {
      store.deleteCohort(id, actor); return tick(undefined);
    },
    async startAgentRun(agentName, tenantId, studyId, actor) {
      return tick(store.startAgentRun(agentName, tenantId, studyId, actor));
    },
    async listEvidencePackages(tenantId) {
      return tick([{ ...store.getState().evidence, tenant_id: tenantId }]);
    },
    async listApiKeys(tenantId) {
      return tick(store.getState().apiKeys.filter((k) => k.tenant_id === tenantId));
    },
    async createApiKey(name, tenantId, actor, scopes = []) {
      return tick(store.createApiKey(name, tenantId, actor, scopes));
    },
    async revokeApiKey(keyId, actor) {
      store.revokeApiKey(keyId, actor); return tick(undefined);
    },
    async listNotifications() {
      return tick(store.getState().notifications);
    },
    async markNotificationRead(id) {
      store.markNotificationRead(id); return tick(undefined);
    },
    async markAllNotificationsRead() {
      store.markAllNotificationsRead(); return tick(undefined);
    },
    async listActivity(tenantId) {
      const all = store.getState().activity;
      return tick(tenantId ? all.filter((a) => a.tenant_id === tenantId) : all);
    },
    async getOntology() {
      const s = store.getState();
      return tick({
        classes: [...ontologyClassSeed, ...ontologyExtensionClassSeed], properties: ontologyPropertySeed,
        namespaces: ontologyNamespaceSeed, pipelineStages, mcpTools: mcpToolSeed,
        mappings: s.mappings, versions: s.ontologyVersions, proposals: s.proposals,
        parents: classParentSeed, synonyms: classSynonymSeed,
      });
    },
    async listConceptMappings() {
      return tick(store.getState().mappings);
    },
    async mapCodes(codesText, tenantId, actor) {
      return tick(store.mapCodes(codesText, tenantId, actor));
    },
    async reviewMapping(id, decision, tenantId, actor) {
      store.reviewMapping(id, decision, tenantId, actor); return tick(undefined);
    },
    async decideProposal(id, decision, tenantId, actor) {
      store.decideProposal(id, decision, tenantId, actor); return tick(undefined);
    },
    async submitProposal(input, tenantId, actor) {
      return tick(store.submitProposal(input, tenantId, actor));
    },
    async semanticSearch(query) {
      return tick(semanticSearchOntology(query, [...ontologyClassSeed, ...ontologyExtensionClassSeed], ontologyPropertySeed, store.getState().mappings));
    },
    async signEvidence(tenantId, signerName, signerId, meaning) {
      store.signEvidence(tenantId, signerName, signerId, meaning);
      return tick(undefined);
    },

    // --- tenant services, teams, delivery & support (demo store backed) ---
    async getTenantServices(tenantId) {
      return tick(store.getState().tenantServices[tenantId] ?? defaultServiceStates());
    },
    async setServiceEnabled(tenantId, key, enabled, actor) {
      store.setServiceEnabled(tenantId, key, enabled, actor); return tick(undefined);
    },
    async getAgentServices(tenantId) {
      return tick(store.getState().agentServices[tenantId] ?? defaultAgentStates());
    },
    async setAgentEnabled(tenantId, agentName, enabled, actor) {
      store.setAgentEnabled(tenantId, agentName, enabled, actor); return tick(undefined);
    },
    async listTeams(tenantId) {
      const all = store.getState().teams;
      return tick(tenantId ? all.filter((t) => t.tenant_id === tenantId) : all);
    },
    async createTeam(input) {
      return tick(store.createTeam(input));
    },
    async deleteTeam(teamId, actor) {
      store.deleteTeam(teamId, actor); return tick(undefined);
    },
    async addTeamMember(teamId, userId, actor) {
      store.addTeamMember(teamId, userId, actor); return tick(undefined);
    },
    async removeTeamMember(teamId, userId, actor) {
      store.removeTeamMember(teamId, userId, actor); return tick(undefined);
    },
    async setTeamRole(teamId, role, actor) {
      store.setTeamRole(teamId, role, actor); return tick(undefined);
    },
    async listEngagements() {
      return tick(store.getState().engagements);
    },
    async setEngagementPhase(tenantId, phase, actor) {
      store.setEngagementPhase(tenantId, phase, actor); return tick(undefined);
    },
    async setEngagementHealth(tenantId, health, actor) {
      store.setEngagementHealth(tenantId, health, actor); return tick(undefined);
    },
    async toggleEngagementMilestone(tenantId, milestone, actor) {
      store.toggleEngagementMilestone(tenantId, milestone, actor); return tick(undefined);
    },
    async startSupportSession(tenantId, actor) {
      store.startSupportSession(tenantId, actor); return tick(undefined);
    },
    async endSupportSession(tenantId, actor) {
      store.endSupportSession(tenantId, actor); return tick(undefined);
    },
    async activateBreakGlass(tenantId, actor, reason) {
      store.activateBreakGlass(tenantId, actor, reason); return tick(undefined);
    },

    // --- maturation backlog (demo store backed) ---
    async classifyStudy(studyId, level, actor) {
      return tick(store.classifyStudy(studyId, level, actor));
    },
    async createStudy(input, actor) {
      return tick(store.createStudy(input, actor));
    },
    async exportEvidencePackage(studyId, actor) {
      return tick(store.exportEvidencePackage(studyId, actor));
    },
    async listEvidenceExports(tenantId) {
      return tick(store.getState().evidenceExports.filter((e) => e.tenant_id === tenantId));
    },
    async verifyEvidenceExport(exportId) {
      return tick(store.verifyEvidenceExport(exportId));
    },
    async decideOntologyVersion(version, decision, tenantId, actor) {
      return tick(store.decideOntologyVersion(version, decision, tenantId, actor));
    },
    async listCustomRoles(tenantId) {
      const all = store.getState().customRoles;
      return tick(tenantId ? all.filter((r) => r.tenant_id === tenantId) : all);
    },
    async createCustomRole(input, actor) {
      return tick(store.createCustomRole(input, actor));
    },
    async updateCustomRole(id, patch, actor) {
      store.updateCustomRole(id, patch, actor); return tick(undefined);
    },
    async deleteCustomRole(id, actor) {
      store.deleteCustomRole(id, actor); return tick(undefined);
    },
    async assignCustomRole(userId, customRoleId, actor) {
      store.assignCustomRole(userId, customRoleId, actor); return tick(undefined);
    },
    async listAccessRequests(tenantId) {
      const all = store.getState().accessRequests;
      return tick(tenantId ? all.filter((r) => r.tenant_id === tenantId) : all);
    },
    async requestAccess(input, actor) {
      return tick(store.requestAccess(input, actor));
    },
    async decideAccessRequest(id, decision, actor) {
      store.decideAccessRequest(id, decision, actor); return tick(undefined);
    },

    // --- console completion pass (demo store backed) ---
    async setStudyStatus(studyId, status, actor) {
      return tick(store.setStudyStatus(studyId, status, actor));
    },
    async addStudyTask(input, actor) {
      return tick(store.addStudyTask(input, actor));
    },
    async toggleStudyTask(id, actor) {
      store.toggleStudyTask(id, actor); return tick(undefined);
    },
    async deleteStudyTask(id, actor) {
      store.deleteStudyTask(id, actor); return tick(undefined);
    },
    async setBudget(tenantId, monthlyUsd, alertThresholdPct, actor) {
      return tick(store.setBudget(tenantId, monthlyUsd, alertThresholdPct, actor));
    },
    async sendUsageReport(tenantId, actor) {
      store.sendUsageReport(tenantId, actor); return tick(undefined);
    },
    async createWebhook(input, actor) {
      return tick(store.createWebhook(input, actor));
    },
    async deleteWebhook(webhookId, actor) {
      store.deleteWebhook(webhookId, actor); return tick(undefined);
    },
    async setWebhookEnabled(webhookId, enabled, actor) {
      store.setWebhookEnabled(webhookId, enabled, actor); return tick(undefined);
    },
    async testWebhook(webhookId, actor) {
      return tick(store.testWebhook(webhookId, actor));
    },
    async resendInvite(userId, actor) {
      store.resendInvite(userId, actor); return tick(undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Live client — fetch-based, same StudioApi contract. Authorization uses
// the existing auth seam (src/lib/auth.ts getToken/currentTenant); the
// backend is the FastAPI Studio API behind a Cognito JWT authorizer whose
// payload carries custom:tenant_id.
// ---------------------------------------------------------------------------

export interface LiveApiDeps {
  /** fetch implementation (injectable for tests); defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Token source; defaults to the mock/Cognito seam (auth.ts). */
  getAuthToken?: () => string | null;
  /** Tenant source for X-Tenant-Id; defaults to the JWT claim. */
  getTenantId?: () => string | null;
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function unwrapList<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const rec = asRecord(payload);
  if (rec) {
    for (const key of keys) {
      if (Array.isArray(rec[key])) return rec[key] as T[];
    }
  }
  return [];
}

function offboardBlockedPlaceholder(tenantId: string): OffboardVerdict {
  return {
    tenant_id: tenantId,
    allowed: false,
    blocked_reasons: ['offboard evidence not exposed by the live API yet'],
    evidence: {
      billing: { status: 'unverifiable', detail: 'live billing evidence endpoint not exposed yet', hits: 0 },
      dataquality: { status: 'unverifiable', detail: 'live DQ evidence endpoint not exposed yet', hits: 0 },
      studio: { status: 'unverifiable', detail: 'live studio evidence endpoint not exposed yet', hits: 0 },
    },
    dry_run: true,
    action_taken: 'none',
  };
}

function toTenantAdminEntry(payload: Record<string, unknown>): TenantAdminEntry {
  // Already in console shape (e.g. a future console-adapter endpoint).
  if (asRecord(payload.plan) && typeof payload.display_name === 'string') {
    return payload as unknown as TenantAdminEntry;
  }
  // FastAPI /admin shape: the payload IS a TenantPlan (governance/tenant_admin).
  const plan = payload as unknown as TenantPlan;
  const tenantId = typeof payload.tenant_id === 'string' ? payload.tenant_id : 'unknown';
  return {
    tenant_id: tenantId,
    display_name: tenantId,
    plan,
    provisioning_status: 'provisioning',
    groups: [],
    users: [],
    offboard: offboardBlockedPlaceholder(tenantId),
  };
}

function normalizeStudy(raw: Record<string, unknown>): StudySummary {
  return {
    study_id: String(raw.study_id ?? ''),
    tenant_id: String(raw.tenant_id ?? raw.tenant ?? ''),
    name: String(raw.name ?? ''),
    status: String(raw.status ?? ''),
    updated_at: String(raw.updated_at ?? raw.created_utc ?? ''),
    cohort_final_count:
      typeof raw.cohort_final_count === 'number' ? raw.cohort_final_count : null,
    classification: raw.classification === 'regulatory' ? 'regulatory' : 'standard',
    ontology_version: typeof raw.ontology_version === 'string' ? raw.ontology_version : null,
    retention_locked: raw.retention_locked === true,
  };
}

export function createLiveApi(config: ApiConfig, deps: LiveApiDeps = {}): StudioApi {
  if (config.mode !== 'live' || !config.apiBaseUrl) {
    throw new StudioConfigError(
      'Evidia Studio live client requires VITE_EVIDIA_API_MODE=live with VITE_EVIDIA_API_BASE_URL set. ' +
        `Missing: ${!config.apiBaseUrl ? 'VITE_EVIDIA_API_BASE_URL' : ''}`.trim(),
      !config.apiBaseUrl ? ['VITE_EVIDIA_API_BASE_URL'] : [],
    );
  }
  const baseUrl = config.apiBaseUrl as string;
  const fetchFn = deps.fetchFn ?? (globalThis.fetch as typeof fetch);
  if (typeof fetchFn !== 'function') {
    throw new StudioConfigError('Evidia Studio live client requires global fetch.');
  }
  const getAuthToken = deps.getAuthToken ?? getToken;
  const getTenantId = deps.getTenantId ?? currentTenant;

  async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const tenant = getTenantId();
    if (tenant) headers['X-Tenant-Id'] = tenant;
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    let response: Response;
    try {
      response = await fetchFn(joinUrl(baseUrl, path), {
        method: init?.method ?? 'GET',
        headers,
        ...(body !== undefined ? { body } : {}),
      });
    } catch (err) {
      throw new ApiError(
        `Evidia Studio API request failed (${init?.method ?? 'GET'} ${path}): ${(err as Error).message}`,
        0,
      );
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const rec = asRecord(parsed);
      const detail =
        (typeof rec?.detail === 'string' && rec.detail) ||
        (typeof rec?.message === 'string' && rec.message) ||
        response.statusText;
      throw new ApiError(
        `Evidia Studio API error ${response.status} (${init?.method ?? 'GET'} ${path}): ${detail}`,
        response.status,
        parsed,
      );
    }
    return parsed as T;
  }

  return {
    mode: 'live' as const,

    async listTenants(): Promise<TenantAdminEntry[]> {
      const payload = await request<unknown>('/admin/tenants');
      return unwrapList<Record<string, unknown>>(payload, ['tenants', 'items']).map(toTenantAdminEntry);
    },

    async getTenantAdmin(tenantId: string): Promise<TenantAdminEntry | null> {
      try {
        const payload = await request<Record<string, unknown>>(
          `/admin/tenants/${encodeURIComponent(tenantId)}/plan`,
        );
        return toTenantAdminEntry(payload);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },

    async getDqResult(tenantId: string): Promise<QualityResult> {
      // FastAPI dataquality router: GET /dq/runs?tenant_id= lists summaries;
      // GET /dq/runs/{run_id} returns the full QualityResult.
      const payload = await request<unknown>(`/dq/runs?tenant_id=${encodeURIComponent(tenantId)}`);
      if (asRecord(payload) && Array.isArray(asRecord(payload)?.checks)) {
        return payload as QualityResult;
      }
      const runs = unwrapList<Record<string, unknown>>(payload, ['runs', 'items']);
      const first = runs[0];
      if (!first || typeof first.run_id !== 'string') {
        throw new ApiError(
          `Evidia Studio API returned no data-quality runs for tenant ${tenantId}`,
          404,
          payload,
        );
      }
      return request<QualityResult>(`/dq/runs/${encodeURIComponent(first.run_id)}`);
    },

    async listStudies(tenantId: string): Promise<StudySummary[]> {
      const payload = await request<unknown>(`/api/studies`);
      return unwrapList<Record<string, unknown>>(payload, ['studies', 'items']).map((r) =>
        normalizeStudy({ ...r, tenant_id: (r.tenant_id as string) ?? (r.tenant as string) ?? tenantId }),
      );
    },

    async getInvoiceReport(tenantId: string): Promise<InvoiceReport> {
      // Billing invoice report (ai/billing.py invoice_report shape).
      // Not mounted on studio/api yet — fails loudly until the endpoint lands.
      return request<InvoiceReport>(
        `/api/billing/invoice-report?tenant_id=${encodeURIComponent(tenantId)}`,
      );
    },

    async listUsageRecords(tenantId: string): Promise<UsageRecord[]> {
      const payload = await request<unknown>(
        `/api/billing/usage-records?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      return unwrapList<UsageRecord>(payload, ['records', 'usage_records', 'items']);
    },

    // Cohort endpoints (engine/cohort_api.py — mounted at /cohorts).
    async validateCohort(definition: CohortDefinition): Promise<ValidateResult> {
      return request<ValidateResult>('/cohorts/validate', {
        method: 'POST',
        body: { definition },
      });
    },
    async countCohort(definition: CohortDefinition): Promise<CohortCountResult> {
      return request<CohortCountResult>('/cohorts/count', {
        method: 'POST',
        body: { definition, omop_data: {} },
      });
    },
    async exportAtlas(definition: CohortDefinition): Promise<AtlasDocument> {
      return request<AtlasDocument>('/cohorts/export/atlas', {
        method: 'POST',
        body: { definition },
      });
    },
    async getSampleDefinition(): Promise<CohortDefinition> {
      // Sample/template definitions are not exposed by the backend yet.
      return request<CohortDefinition>('/cohorts/sample-definition');
    },

    async getEvidencePackage(studyId: string): Promise<EvidencePackage> {
      // Evidence package (study dossier + Part 11 signatures) is not
      // mounted on studio/api yet — fails loudly until the endpoint lands.
      return request<EvidencePackage>(`/api/studies/${encodeURIComponent(studyId)}/evidence`);
    },

    async listAgents(): Promise<AgentDefinition[]> {
      const payload = await request<unknown>('/api/ai/agents');
      return unwrapList<AgentDefinition>(payload, ['agents', 'items']);
    },
    async listAgentRuns(tenantId?: string): Promise<AgentRun[]> {
      const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
      const payload = await request<unknown>(`/api/ai/runs${qs}`);
      return unwrapList<AgentRun>(payload, ['runs', 'items']);
    },

    // --- enterprise console extension: not mounted on studio/api yet.
    // These fail loudly (never fixture fallback) until endpoint parity lands.
    ...enterpriseNotMounted(),
  };
}

const ENTERPRISE_LIVE_METHODS = [
  'listCpTenants', 'provisionTenant', 'evaluateOffboard', 'offboardTenant',
  'getEnvironments', 'listServices', 'listAudit', 'listUsers', 'inviteUser',
  'setUserStatus', 'setUserRole', 'listDatasets', 'addDataset',
  'listPipelineRuns', 'startPipelineRun', 'listConnectors', 'addConnector',
  'testConnector', 'setConnectorEnabled', 'deleteConnector', 'listProducts',
  'listEntitlements', 'listSavedCohorts', 'saveCohort', 'deleteCohort',
  'startAgentRun', 'listEvidencePackages', 'listApiKeys', 'createApiKey',
  'revokeApiKey', 'listNotifications', 'markNotificationRead',
  'markAllNotificationsRead', 'listActivity', 'getOntology',
  'listConceptMappings', 'mapCodes', 'reviewMapping', 'decideProposal',
  'submitProposal', 'semanticSearch', 'signEvidence',
  'getTenantServices', 'setServiceEnabled', 'getAgentServices',
  'setAgentEnabled', 'listTeams', 'createTeam', 'deleteTeam',
  'addTeamMember', 'removeTeamMember', 'setTeamRole', 'listEngagements',
  'setEngagementPhase', 'setEngagementHealth', 'toggleEngagementMilestone',
  'startSupportSession', 'endSupportSession', 'activateBreakGlass',
  'classifyStudy', 'createStudy', 'exportEvidencePackage',
  'listEvidenceExports', 'verifyEvidenceExport', 'decideOntologyVersion',
  'listCustomRoles', 'createCustomRole', 'updateCustomRole',
  'deleteCustomRole', 'assignCustomRole', 'listAccessRequests',
  'requestAccess', 'decideAccessRequest',
  'setStudyStatus', 'addStudyTask', 'toggleStudyTask', 'deleteStudyTask',
  'setBudget', 'sendUsageReport', 'createWebhook', 'deleteWebhook',
  'setWebhookEnabled', 'testWebhook', 'resendInvite',
] as const;

type EnterpriseNotMounted = Pick<StudioApi, (typeof ENTERPRISE_LIVE_METHODS)[number]>;

function enterpriseNotMounted(): EnterpriseNotMounted {
  const fail = (name: string) => async (): Promise<never> => {
    throw new ApiError(`Evidia Studio API: ${name} is not exposed by the live API yet (enterprise console endpoint parity pending)`, 501);
  };
  return Object.fromEntries(ENTERPRISE_LIVE_METHODS.map((n) => [n, fail(n)])) as unknown as EnterpriseNotMounted;
}

/** Factory behind the same StudioApi surface the views consume. */
export function createStudioApi(config: ApiConfig, deps: LiveApiDeps = {}): StudioApi {
  return config.mode === 'live' ? createLiveApi(config, deps) : createMockApi();
}

/**
 * The running client. In mock mode (default) this is exactly the previous
 * fixture client; in live mode it is the fetch client above. Constructing
 * it at import time is what makes a live misconfiguration fail at startup.
 */
export const api: StudioApi = createStudioApi(API_CONFIG);
