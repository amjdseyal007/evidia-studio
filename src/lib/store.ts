/**
 * Stateful demo store for the Studio mock layer.
 *
 * In mock mode this module is the single source of truth: fixtures seed
 * it once, and every CRUD action the UI performs mutates it (immutably)
 * and notifies subscribers. The API seam (src/lib/api.ts) delegates here
 * in mock mode, so views never touch the store directly.
 *
 * In live mode none of this is used — the fetch client talks to the
 * FastAPI backend. Everything here is fixture/demo data.
 */
import { useSyncExternalStore } from 'react';
import { agentFixtures, agentRunFixtures } from '../fixtures/agents';
import { sampleCohortDefinition } from '../fixtures/cohort';
import { invoiceReportFixture, studyFixtures, usageRecordFixtures } from '../fixtures/dashboard';
import { evidenceFixture } from '../fixtures/evidence';
import {
  engagementSeed,
  type EngagementHealth, type EngagementPhase, type EngagementRecord,
} from '../fixtures/engagements';
import {
  changeProposalSeed, conceptMappingSeed, mappingCandidateSeed, ontologyVersionSeed,
  type ChangeProposal, type ConceptMapping, type OntologyVersion,
} from '../fixtures/ontology';
import { accessRequestSeed, customRoleSeed, type AccessRequest, type CustomRoleDef } from '../fixtures/access';
import {
  AGENT_SERVICE_SEED, SERVICE_SEED_STATES,
  defaultAgentStates, defaultServiceStates, serviceDef,
  type ServiceKey, type TenantServiceStates,
} from '../fixtures/services';
import { teamSeed, type TeamRecord } from '../fixtures/teams';
import {
  activitySeed,
  apiKeySeed,
  connectorSeed,
  datasetSeed,
  environmentSeed,
  notificationSeed,
  pipelineRunSeed,
  productSeed,
  serviceSeed,
  tenantCpSeed,
  userSeed,
  type ActivityItem,
  type ApiKeyRecord,
  type ConnectorRecord,
  type ControlTenant,
  type DatasetRecord,
  type EnvironmentRecord,
  type NotificationItem,
  type PipelineRun,
  type ProductRecord,
  type ServiceHealth,
  type UserRecord,
} from '../fixtures/platform';
import type { AgentDefinition, AgentRun, CohortDefinition, EvidencePackage, InvoiceReport, StudySummary, UsageRecord } from './api';
import { isPresetRole, type Permission, type Role } from './permissions';

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  tenant_id: string;
  action: string;
  target: string;
  detail: string;
  result: 'success' | 'blocked' | 'info';
  /** Optional before → after delta (e.g. "on → off", "standard → regulatory"). */
  delta?: string | null;
}

export type StudyClassification = 'standard' | 'regulatory';

export interface EvidenceExportItem {
  item: string;
  status: 'included' | 'pending';
  detail: string;
}

export interface EvidenceExportRecord {
  export_id: string;
  study_id: string;
  tenant_id: string;
  generated_at: string;
  generated_by: string;
  classification: StudyClassification;
  ontology_version: string | null;
  /** Demo fingerprint over study + chain head + signature count + ontology version. */
  fingerprint: string;
  items: EvidenceExportItem[];
  signature_count: number;
  chain_head_hash: string;
}

export interface SavedCohort {
  id: string;
  name: string;
  tenant_id: string;
  definition: CohortDefinition;
  final_count: number | null;
  updated_at: string;
  author: string;
}

export interface StoreState {
  tenants: ControlTenant[];
  users: UserRecord[];
  datasets: DatasetRecord[];
  pipelineRuns: PipelineRun[];
  connectors: ConnectorRecord[];
  products: ProductRecord[];
  studies: StudySummary[];
  evidence: EvidencePackage;
  agentRuns: AgentRun[];
  savedCohorts: SavedCohort[];
  audit: AuditEntry[];
  apiKeys: ApiKeyRecord[];
  notifications: NotificationItem[];
  activity: ActivityItem[];
  environments: EnvironmentRecord[];
  services: ServiceHealth[];
  usageRecords: UsageRecord[];
  invoice: InvoiceReport;
  agentDefs: AgentDefinition[];
  mappings: ConceptMapping[];
  ontologyVersions: OntologyVersion[];
  proposals: ChangeProposal[];
  tenantServices: Record<string, TenantServiceStates>;
  agentServices: Record<string, Record<string, boolean>>;
  teams: TeamRecord[];
  engagements: EngagementRecord[];
  customRoles: CustomRoleDef[];
  accessRequests: AccessRequest[];
  evidenceExports: EvidenceExportRecord[];
}

const now = () => new Date().toISOString();
let seq = 1000;
const uid = (p: string) => `${p}-${(++seq).toString(36)}-${Date.now().toString(36).slice(-4)}`;

/** Deterministic demo hash (display/verify demo only — not cryptographic). */
export function demoHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return `sha256:demo-${h.toString(16).padStart(8, '0')}${(h ^ 0x9e3779b9).toString(16).padStart(8, '0')}`;
}

function seedState(): StoreState {
  return {
    tenants: tenantCpSeed.map((t) => ({ ...t })),
    users: userSeed.map((u) => ({ ...u })),
    datasets: datasetSeed.map((d) => ({ ...d })),
    pipelineRuns: pipelineRunSeed.map((r) => ({ ...r, steps: r.steps.map((s) => ({ ...s, logs: [...s.logs] })) })),
    connectors: connectorSeed.map((c) => ({ ...c, capabilities: [...c.capabilities], config: { ...c.config } })),
    products: productSeed.map((p) => ({ ...p, includes: [...p.includes] })),
    studies: studyFixtures.map((s) => ({ ...s })),
    evidence: { ...evidenceFixture },
    agentRuns: agentRunFixtures.map((r) => ({ ...r, ontology_tool_calls: r.ontology_tool_calls.map((c) => ({ ...c })) })),
    savedCohorts: [
      {
        id: 'cohort-saved-001',
        name: sampleCohortDefinition.name,
        tenant_id: 'acme_rare',
        definition: sampleCohortDefinition,
        final_count: 1284,
        updated_at: '2026-10-06T15:40:00Z',
        author: 'Priya Nair',
      },
      {
        id: 'cohort-saved-002',
        name: 'SMA natural-history comparison cohort',
        tenant_id: 'acme_rare',
        definition: { ...sampleCohortDefinition, name: 'SMA natural-history comparison cohort' },
        final_count: 342,
        updated_at: '2026-10-04T11:02:00Z',
        author: 'Tom Alvarez',
      },
    ],
    audit: [
      { id: 'audit-seed-1', at: '2026-10-08T13:58:12Z', actor: 'system', tenant_id: 'acme_rare', action: 'pipeline.run.completed', target: 'run-20261008-004', detail: 'Gold publish finished; DQ 88.1', result: 'success' },
      { id: 'audit-seed-2', at: '2026-10-08T12:20:44Z', actor: 'priya.nair@acme.example', tenant_id: 'acme_rare', action: 'evidence.signed', target: 'pkg-acme-001', detail: 'Part 11 signature #4 (author attestation)', result: 'success' },
      { id: 'audit-seed-3', at: '2026-10-08T09:14:03Z', actor: 'admin@evidia.example', tenant_id: 'corvus_tx', action: 'tenant.offboard.attempt', target: 'corvus_tx', detail: 'Dry-run evaluation only', result: 'info' },
      { id: 'audit-seed-4', at: '2026-10-07T16:41:55Z', actor: 'system', tenant_id: 'beacon_bio', action: 'connector.test', target: 'conn-snowflake-beacon', detail: 'Connection test passed (412 ms)', result: 'success' },
    ],
    apiKeys: apiKeySeed.map((k) => ({ ...k })),
    notifications: notificationSeed.map((n) => ({ ...n })),
    activity: activitySeed.map((a) => ({ ...a })),
    environments: environmentSeed.map((e) => ({ ...e, modules: e.modules.map((m) => ({ ...m })) })),
    services: serviceSeed.map((s) => ({ ...s })),
    usageRecords: usageRecordFixtures.map((r) => ({ ...r })),
    invoice: invoiceReportFixture,
    agentDefs: agentFixtures,
    mappings: conceptMappingSeed.map((m) => ({ ...m })),
    ontologyVersions: ontologyVersionSeed.map((v) => ({ ...v })),
    proposals: changeProposalSeed.map((p) => ({ ...p })),
    tenantServices: Object.fromEntries(Object.entries(SERVICE_SEED_STATES).map(([k, v]) => [k, { ...v }])),
    agentServices: Object.fromEntries(Object.entries(AGENT_SERVICE_SEED).map(([k, v]) => [k, { ...v }])),
    teams: teamSeed.map((t) => ({ ...t, member_ids: [...t.member_ids], access_datasets: [...t.access_datasets], access_studies: [...t.access_studies] })),
    engagements: Object.values(engagementSeed).map((e) => ({ ...e, milestones: [...e.milestones], completed: [...e.completed] })),
    customRoles: customRoleSeed.map((r) => ({ ...r, permissions: [...r.permissions] })),
    accessRequests: accessRequestSeed.map((r) => ({ ...r })),
    evidenceExports: [],
  };
}

let state: StoreState = seedState();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function update(fn: (s: StoreState) => StoreState) {
  state = fn(state);
  emit();
}

export function getState(): StoreState {
  return state;
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** React binding: re-renders on any store change. */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function pushActivity(kind: ActivityItem['kind'], text: string, tenant_id: string) {
  update((s) => ({
    ...s,
    activity: [{ id: uid('act'), at: now(), kind, text, tenant_id }, ...s.activity].slice(0, 40),
  }));
}
function pushAudit(entry: Omit<AuditEntry, 'id' | 'at'>) {
  update((s) => ({ ...s, audit: [{ ...entry, id: uid('audit'), at: now() }, ...s.audit].slice(0, 200) }));
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------
export interface ProvisionTenantInput {
  name: string;
  tenant_id: string;
  isolation: ControlTenant['isolation'];
  region: string;
  actor: string;
  /** R6 onboarding: preload the synthetic rare-disease demo dataset so
   *  dashboard/DQ/sample cohort are populated on minute one. Default on. */
  preload_demo?: boolean;
}
export function provisionTenant(input: ProvisionTenantInput): ControlTenant {
  const preload = input.preload_demo !== false;
  const t: ControlTenant = {
    tenant_id: input.tenant_id,
    display_name: input.name,
    status: 'provisioning',
    isolation: input.isolation,
    region: input.region,
    kms_key_id: `alias/ef-tenant-${input.tenant_id}-dev`,
    created_at: now(),
    users: 1,
    datasets: preload ? 1 : 0,
    active_studies: 0,
    usage: { datasets: preload ? 1 : 0, datasets_quota: 25, agent_runs: 0, agent_runs_quota: 2000, storage_gb: 0, storage_quota_gb: 500 },
  };
  update((s) => ({
    ...s,
    tenants: [...s.tenants, t],
    tenantServices: { ...s.tenantServices, [input.tenant_id]: defaultServiceStates() },
    agentServices: { ...s.agentServices, [input.tenant_id]: defaultAgentStates() },
    datasets: preload
      ? [{
          dataset_id: `ds-${input.tenant_id.replace(/_/g, '-')}-demo`,
          tenant_id: input.tenant_id,
          name: 'Synthetic rare-disease demo dataset (preloaded)',
          layer: 'gold' as const,
          source: 'Synthetic demo — seeded at provisioning (no real data)',
          rows: 128450,
          dq_score: 88.2,
          last_run_at: now(),
          updated_at: now(),
        }, ...s.datasets]
      : s.datasets,
    savedCohorts: preload
      ? [{
          id: uid('cohort'),
          name: 'Demo starter cohort — rare disease (synthetic)',
          tenant_id: input.tenant_id,
          definition: sampleCohortDefinition,
          final_count: 1284,
          updated_at: now(),
          author: 'system (onboarding)',
        }, ...s.savedCohorts]
      : s.savedCohorts,
  }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'tenant.provision.requested', target: input.tenant_id, detail: `${input.isolation} tenant in ${input.region} (simulated)`, result: 'success' });
  if (preload) {
    pushAudit({ actor: 'system', tenant_id: input.tenant_id, action: 'tenant.demo_data.seeded', target: input.tenant_id, detail: 'Synthetic rare-disease demo dataset + starter cohort preloaded so dashboard, DQ gauge, and cohort builder are populated on minute one (R6)', result: 'success' });
  }
  pushActivity('tenant', `Tenant “${input.name}” provisioning started (${input.isolation}, ${input.region})`, input.tenant_id);
  window.setTimeout(() => {
    update((s) => ({
      ...s,
      tenants: s.tenants.map((x) => (x.tenant_id === t.tenant_id ? { ...x, status: 'active' as const } : x)),
    }));
    pushActivity('tenant', `Tenant “${input.name}” is now active`, input.tenant_id);
    pushAudit({ actor: 'system', tenant_id: input.tenant_id, action: 'tenant.provision.completed', target: input.tenant_id, detail: 'KMS key, buckets, Batch queue, Cognito group ready (simulated)', result: 'success' });
  }, 4000);
  return t;
}

export interface OffboardResult {
  allowed: boolean;
  blocked_reasons: string[];
}
export function evaluateOffboard(tenant_id: string): OffboardResult {
  const t = state.tenants.find((x) => x.tenant_id === tenant_id);
  const reasons: string[] = [];
  if (!t) return { allowed: false, blocked_reasons: ['tenant not found'] };
  if (t.active_studies > 0) reasons.push(`${t.active_studies} active stud${t.active_studies === 1 ? 'y' : 'ies'} still reference tenant data`);
  if (t.datasets > 0) reasons.push(`${t.datasets} datasets not yet exported/deleted`);
  const open = state.pipelineRuns.some((r) => r.tenant_id === tenant_id && r.status === 'running');
  if (open) reasons.push('a pipeline run is in progress');
  return { allowed: reasons.length === 0, blocked_reasons: reasons };
}
export function offboardTenant(tenant_id: string, actor: string): OffboardResult {
  const verdict = evaluateOffboard(tenant_id);
  if (!verdict.allowed) {
    pushAudit({ actor, tenant_id, action: 'tenant.offboard.blocked', target: tenant_id, detail: verdict.blocked_reasons.join('; '), result: 'blocked' });
    return verdict;
  }
  update((s) => ({ ...s, tenants: s.tenants.map((x) => (x.tenant_id === tenant_id ? { ...x, status: 'offboarded' as const } : x)) }));
  pushAudit({ actor, tenant_id, action: 'tenant.offboard.completed', target: tenant_id, detail: 'Data deleted, KMS key scheduled for deletion (simulated)', result: 'success' });
  pushActivity('tenant', `Tenant ${tenant_id} offboarded`, tenant_id);
  return verdict;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export interface InviteUserInput { name: string; email: string; role: Role; tenant_id: string; actor: string }
export function inviteUser(input: InviteUserInput): UserRecord {
  const u: UserRecord = {
    user_id: uid('user'), name: input.name, email: input.email, role: input.role,
    tenant_id: input.tenant_id, status: 'invited',
    cognito_groups: [`tenant-${input.tenant_id}`, `role-${input.role.toLowerCase().replace(/\s+/g, '-')}`],
    last_login: null, created_at: now(),
  };
  update((s) => ({ ...s, users: [...s.users, u] }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'user.invited', target: u.email, detail: `Role: ${input.role}`, result: 'success' });
  pushActivity('user', `Invited ${u.name} (${input.role}) to ${input.tenant_id}`, input.tenant_id);
  return u;
}
export function setUserStatus(user_id: string, status: UserRecord['status'], actor: string): void {
  const u = state.users.find((x) => x.user_id === user_id);
  if (!u) return;
  update((s) => ({ ...s, users: s.users.map((x) => (x.user_id === user_id ? { ...x, status } : x)) }));
  pushAudit({ actor, tenant_id: u.tenant_id, action: status === 'deactivated' ? 'user.deactivated' : 'user.reactivated', target: u.email, detail: '', result: 'success' });
}
export function setUserRole(user_id: string, role: Role, actor: string): void {
  const u = state.users.find((x) => x.user_id === user_id);
  if (!u) return;
  update((s) => ({
    ...s,
    users: s.users.map((x) => (x.user_id === user_id
      ? { ...x, role, custom_role_id: null, cognito_groups: [`tenant-${x.tenant_id}`, `role-${role.toLowerCase().replace(/\s+/g, '-')}`] }
      : x)),
  }));
  pushAudit({ actor, tenant_id: u.tenant_id, action: 'user.role.changed', target: u.email, detail: `New role: ${role}${u.role !== role ? '' : ''}`, delta: `${u.role} → ${role}`, result: 'success' });
}

// ---------------------------------------------------------------------------
// Studies: classification (R3) and creation
// ---------------------------------------------------------------------------
export function classifyStudy(study_id: string, level: StudyClassification, actor: string): StudySummary {
  const study = state.studies.find((s) => s.study_id === study_id);
  if (!study) throw new Error(`Study ${study_id} not found`);
  const prev = study.classification ?? 'standard';
  if (level === 'regulatory') {
    const approved = state.ontologyVersions.find((v) => v.status === 'approved');
    if (!approved) {
      pushAudit({ actor, tenant_id: study.tenant_id, action: 'study.classified', target: study_id, detail: 'BLOCKED: Regulatory classification requires an approved ontology version; none is approved.', delta: `${prev} → regulatory (blocked)`, result: 'blocked' });
      throw new Error('Regulatory classification requires an approved ontology version — none is approved yet. Approve one in Ontology → Governance first.');
    }
    update((s) => ({
      ...s,
      studies: s.studies.map((x) => (x.study_id === study_id
        ? { ...x, classification: 'regulatory' as const, ontology_version: approved.version, retention_locked: true, updated_at: now() }
        : x)),
    }));
    pushAudit({ actor, tenant_id: study.tenant_id, action: 'study.classified', target: study_id, detail: `Classified Regulatory — pinned to approved ontology v${approved.version}; retention locked; Part 11 sign-off chain required for evidence export.`, delta: `${prev} → regulatory`, result: 'success' });
  } else {
    update((s) => ({
      ...s,
      studies: s.studies.map((x) => (x.study_id === study_id
        ? { ...x, classification: 'standard' as const, ontology_version: null, retention_locked: false, updated_at: now() }
        : x)),
    }));
    pushAudit({ actor, tenant_id: study.tenant_id, action: 'study.classified', target: study_id, detail: 'Classified Standard — internal/exploratory use; no retention lock, no ontology pin.', delta: `${prev} → standard`, result: 'success' });
  }
  return state.studies.find((s) => s.study_id === study_id)!;
}

export function createStudy(input: { name: string; tenant_id: string; classification: StudyClassification }, actor: string): StudySummary {
  const study: StudySummary = {
    study_id: uid('study'),
    tenant_id: input.tenant_id,
    name: input.name,
    status: 'feasibility',
    updated_at: now(),
    cohort_final_count: null,
    classification: 'standard',
    ontology_version: null,
    retention_locked: false,
  };
  update((s) => ({ ...s, studies: [study, ...s.studies] }));
  pushAudit({ actor, tenant_id: input.tenant_id, action: 'study.created', target: study.study_id, detail: input.name, result: 'success' });
  if (input.classification === 'regulatory') {
    classifyStudy(study.study_id, 'regulatory', actor);
  }
  return state.studies.find((s) => s.study_id === study.study_id)!;
}

// ---------------------------------------------------------------------------
// Evidence exports (R3): verifiable, read-only packages
// ---------------------------------------------------------------------------
function exportFingerprint(r: Pick<EvidenceExportRecord, 'study_id' | 'tenant_id' | 'generated_at' | 'chain_head_hash' | 'signature_count' | 'ontology_version' | 'classification'>): string {
  return demoHash([r.study_id, r.tenant_id, r.generated_at, r.chain_head_hash, String(r.signature_count), r.ontology_version ?? 'none', r.classification].join('|'));
}

export function exportEvidencePackage(study_id: string, actor: string): EvidenceExportRecord {
  const study = state.studies.find((s) => s.study_id === study_id);
  if (!study) throw new Error(`Study ${study_id} not found`);
  const ev = state.evidence;
  const signatureCount = ev.signatures.length;
  const regulatory = (study.classification ?? 'standard') === 'regulatory';
  const hasCohort = (study.cohort_final_count ?? 0) > 0 || state.savedCohorts.some((c) => c.tenant_id === study.tenant_id);
  const items: EvidenceExportItem[] = [
    { item: 'Study metadata', status: 'included', detail: `${study.name} · status ${study.status} · tenant ${study.tenant_id}` },
    { item: 'Methods & analysis code refs', status: 'included', detail: 'Protocol + code bundle refs pinned at export time (demo refs).' },
    { item: 'Ontology version', status: study.ontology_version ? 'included' : 'pending', detail: study.ontology_version ? `Pinned to approved ontology v${study.ontology_version}` : regulatory ? 'REQUIRED for Regulatory — no pinned version; classify first.' : 'Standard study — no ontology pin.' },
    { item: 'Audit trail', status: 'included', detail: `${state.audit.filter((a) => a.tenant_id === study.tenant_id).length} entries for this tenant (published taxonomy, CSV-ready).` },
    { item: 'Part 11 signatures & chain', status: signatureCount > 0 ? 'included' : 'pending', detail: signatureCount > 0 ? `${signatureCount} signatures; chain head ${ev.chain_head_hash.slice(0, 18)}…` : 'No signatures yet — sign the evidence package before a Regulatory export.' },
    { item: 'Cohort definition snapshot', status: hasCohort ? 'included' : 'pending', detail: hasCohort ? `Final cohort count ${study.cohort_final_count ?? 'from saved cohort'}.` : 'No cohort snapshot recorded yet.' },
    { item: 'QMS summary', status: 'included', detail: 'Change control, validation status, and open CAPAs summarized from the platform audit trail (demo summary).' },
  ];
  const base: EvidenceExportRecord = {
    export_id: uid('export'),
    study_id,
    tenant_id: study.tenant_id,
    generated_at: now(),
    generated_by: actor,
    classification: study.classification ?? 'standard',
    ontology_version: study.ontology_version ?? null,
    fingerprint: '',
    items,
    signature_count: signatureCount,
    chain_head_hash: ev.chain_head_hash,
  };
  const record: EvidenceExportRecord = { ...base, fingerprint: exportFingerprint(base) };
  update((s) => ({ ...s, evidenceExports: [record, ...s.evidenceExports] }));
  pushAudit({ actor, tenant_id: study.tenant_id, action: 'evidence.package.exported', target: record.export_id, detail: `Fingerprint ${record.fingerprint}; ${items.filter((i) => i.status === 'included').length}/${items.length} checklist items included.`, result: 'success' });
  pushActivity('evidence', `Evidence export generated for ${study_id} (${record.fingerprint.slice(0, 22)}…)`, study.tenant_id);
  return record;
}

export function verifyEvidenceExport(export_id: string): boolean {
  const record = state.evidenceExports.find((e) => e.export_id === export_id);
  if (!record) return false;
  return exportFingerprint(record) === record.fingerprint;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
const STEP_DEFS = ['Ingest', 'De-identification', 'OMOP harmonization', 'Data quality', 'Gold publish'] as const;
const STEP_LOGS: Record<string, string[]> = {
  Ingest: ['Opening source extract', 'Schema snapshot recorded', 'Row counts reconciled'],
  'De-identification': ['Safe Harbor identifier scan', 'Date shifting applied (per-patient offset)', 'Tokenization vault write complete'],
  'OMOP harmonization': ['Vocabulary mapping (Athena 2026.09)', 'Domain routing: condition/drug/measurement', 'Era construction finished'],
  'Data quality': ['55 OMOP conformance checks queued', 'Completeness + plausibility evaluated', 'Provenance record signed'],
  'Gold publish': ['Gold tables materialized', 'Dataset fingerprint updated', 'Catalog entry refreshed'],
};

export function startPipelineRun(dataset_id: string, actor: string): PipelineRun {
  const ds = state.datasets.find((d) => d.dataset_id === dataset_id);
  if (!ds) throw new Error(`dataset ${dataset_id} not found`);
  const run: PipelineRun = {
    run_id: uid('run'), tenant_id: ds.tenant_id, dataset_id: ds.dataset_id, dataset_name: ds.name,
    status: 'running', started_at: now(), finished_at: null,
    steps: STEP_DEFS.map((name, i) => ({ name, status: i === 0 ? 'running' : 'queued', logs: i === 0 ? [STEP_LOGS[name][0]] : [] })),
  };
  update((s) => ({ ...s, pipelineRuns: [run, ...s.pipelineRuns] }));
  pushAudit({ actor, tenant_id: ds.tenant_id, action: 'pipeline.run.started', target: run.run_id, detail: ds.name, result: 'success' });
  simulateRun(run.run_id);
  return run;
}

function simulateRun(run_id: string) {
  const advance = () => {
    const run = state.pipelineRuns.find((r) => r.run_id === run_id);
    if (!run || run.status !== 'running') return;
    const idx = run.steps.findIndex((s) => s.status === 'running');
    if (idx === -1) return;
    const step = run.steps[idx];
    const fullLogs = STEP_LOGS[step.name] ?? ['Working'];
    if (step.logs.length < fullLogs.length) {
      const logs = [...step.logs, fullLogs[step.logs.length]];
      update((s) => ({
        ...s,
        pipelineRuns: s.pipelineRuns.map((r) => (r.run_id === run_id
          ? { ...r, steps: r.steps.map((x, i) => (i === idx ? { ...x, logs } : x)) }
          : r)),
      }));
      window.setTimeout(advance, 650);
      return;
    }
    const isLast = idx === run.steps.length - 1;
    update((s) => ({
      ...s,
      pipelineRuns: s.pipelineRuns.map((r) => (r.run_id === run_id
        ? {
            ...r,
            status: isLast ? 'succeeded' : r.status,
            finished_at: isLast ? now() : r.finished_at,
            steps: r.steps.map((x, i) => (i === idx ? { ...x, status: 'succeeded' }
              : i === idx + 1 ? { ...x, status: 'running', logs: [STEP_LOGS[x.name][0]] } : x)),
          }
        : r)),
    }));
    if (isLast) {
      const dq = Math.round((86 + Math.random() * 8) * 10) / 10;
      update((s) => ({
        ...s,
        datasets: s.datasets.map((d) => (d.dataset_id === run.dataset_id
          ? { ...d, dq_score: dq, last_run_at: now(), layer: d.layer === 'bronze' ? 'gold' : d.layer }
          : d)),
      }));
      pushAudit({ actor: 'system', tenant_id: run.tenant_id, action: 'pipeline.run.completed', target: run_id, detail: `DQ ${dq}`, result: 'success' });
      pushActivity('pipeline', `Pipeline run for ${run.dataset_name} completed (DQ ${dq})`, run.tenant_id);
      return;
    }
    window.setTimeout(advance, 650);
  };
  window.setTimeout(advance, 650);
}

export function addDataset(input: { name: string; tenant_id: string; layer: DatasetRecord['layer']; source: string; actor: string }): DatasetRecord {
  const d: DatasetRecord = {
    dataset_id: uid('ds'), tenant_id: input.tenant_id, name: input.name, layer: input.layer,
    source: input.source, rows: 0, dq_score: null, last_run_at: null, updated_at: now(),
  };
  update((s) => ({ ...s, datasets: [d, ...s.datasets] }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'dataset.registered', target: d.dataset_id, detail: input.name, result: 'success' });
  return d;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export interface AddConnectorInput {
  name: string; type: ConnectorRecord['type']; mode: ConnectorRecord['mode'];
  capabilities: ConnectorRecord['capabilities']; config: Record<string, string>;
  tenant_id: string; actor: string;
}
const CONNECTOR_CATALOG: Record<ConnectorRecord['type'], { version: string; data_handling: string }> = {
  snowflake: { version: '1.4.0', data_handling: 'LAND mode: queried rows land in the tenant S3 bronze prefix inside the tenant boundary. Credentials never leave Secrets Manager; only OMOP-harmonized outputs are readable by agents.' },
  databricks: { version: '1.1.2', data_handling: 'VIRTUAL mode: data stays in the tenant Databricks workspace; Evidia issues Delta Sharing / SQL reads and receives aggregates + approved extracts only.' },
  foundry: { version: '0.9.0', data_handling: 'VIRTUAL mode: ontology sync only — class/property metadata crosses to align the Foundry ontology with the approved Evidia ontology. No patient-level data moves.' },
  rest: { version: '2.0.1', data_handling: 'LAND mode: incremental pulls land in the tenant S3 bronze prefix. Payloads are de-identified at the silver gate before any agent can read them.' },
};

export function addConnector(input: AddConnectorInput): ConnectorRecord {
  const c: ConnectorRecord = {
    connector_id: uid('conn'), tenant_id: input.tenant_id, name: input.name, type: input.type,
    mode: input.mode, status: 'unknown', enabled: true, capabilities: input.capabilities,
    config: input.config, last_test: null, created_at: now(),
    version: CONNECTOR_CATALOG[input.type].version,
    data_handling: CONNECTOR_CATALOG[input.type].data_handling,
  };
  update((s) => ({ ...s, connectors: [...s.connectors, c] }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'connector.created', target: c.connector_id, detail: `${input.type} (${input.mode})`, result: 'success' });
  pushActivity('connector', `Connector “${input.name}” added (${input.type})`, input.tenant_id);
  return c;
}
export function testConnector(connector_id: string, actor: string): Promise<{ ok: boolean; latency_ms: number; message: string }> {
  const c = state.connectors.find((x) => x.connector_id === connector_id);
  if (!c) return Promise.resolve({ ok: false, latency_ms: 0, message: 'connector not found' });
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const latency_ms = 180 + Math.floor(Math.random() * 500);
      const result = { ok: true, latency_ms, message: `Handshake OK · auth accepted · ${c.config.database || c.config.account || 'endpoint'} reachable (simulated)` };
      update((s) => ({
        ...s,
        connectors: s.connectors.map((x) => (x.connector_id === connector_id
          ? { ...x, status: 'connected', last_test: { at: now(), ok: true, latency_ms } }
          : x)),
      }));
      pushAudit({ actor, tenant_id: c.tenant_id, action: 'connector.test', target: connector_id, detail: `passed (${latency_ms} ms)`, result: 'success' });
      resolve(result);
    }, 700);
  });
}
export function setConnectorEnabled(connector_id: string, enabled: boolean, actor: string): void {
  const c = state.connectors.find((x) => x.connector_id === connector_id);
  if (!c) return;
  update((s) => ({ ...s, connectors: s.connectors.map((x) => (x.connector_id === connector_id ? { ...x, enabled } : x)) }));
  pushAudit({ actor, tenant_id: c.tenant_id, action: enabled ? 'connector.enabled' : 'connector.disabled', target: connector_id, detail: '', result: 'info' });
}
export function deleteConnector(connector_id: string, actor: string): void {
  const c = state.connectors.find((x) => x.connector_id === connector_id);
  if (!c) return;
  update((s) => ({ ...s, connectors: s.connectors.filter((x) => x.connector_id !== connector_id) }));
  pushAudit({ actor, tenant_id: c.tenant_id, action: 'connector.deleted', target: connector_id, detail: c.name, result: 'success' });
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------
export function saveCohort(name: string, definition: CohortDefinition, final_count: number | null, tenant_id: string, author: string): SavedCohort {
  const c: SavedCohort = { id: uid('cohort'), name, tenant_id, definition, final_count, updated_at: now(), author };
  update((s) => ({ ...s, savedCohorts: [c, ...s.savedCohorts] }));
  pushAudit({ actor: author, tenant_id, action: 'cohort.saved', target: c.id, detail: name, result: 'success' });
  return c;
}
export function deleteCohort(id: string, actor: string): void {
  const c = state.savedCohorts.find((x) => x.id === id);
  if (!c) return;
  update((s) => ({ ...s, savedCohorts: s.savedCohorts.filter((x) => x.id !== id) }));
  pushAudit({ actor, tenant_id: c.tenant_id, action: 'cohort.deleted', target: id, detail: c.name, result: 'info' });
}

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------
export function startAgentRun(agent_name: string, tenant_id: string, study_id: string | null, actor: string): AgentRun {
  const def = state.agentDefs.find((a) => a.name === agent_name);
  const run: AgentRun = {
    run_id: uid('run'), agent_name, tenant_id, study_id, status: 'running',
    started_at: now(), finished_at: null, input_tokens: 0, output_tokens: 0,
    model_id: 'us.anthropic.claude-sonnet-5-5',
    prompt_name: def?.prompt_name ?? agent_name,
    goal: 'Operator-initiated run from Studio console (simulated)',
    ontology_tool_calls: [],
  };
  update((s) => ({ ...s, agentRuns: [run, ...s.agentRuns] }));
  pushAudit({ actor, tenant_id, action: 'agent.run.started', target: run.run_id, detail: agent_name, result: 'success' });
  const tools = def?.allowed_ontology_tools ?? [];
  tools.forEach((tool, i) => {
    window.setTimeout(() => {
      update((s) => ({
        ...s,
        agentRuns: s.agentRuns.map((r) => (r.run_id === run.run_id
          ? { ...r, ontology_tool_calls: [...r.ontology_tool_calls, { tool, args_summary: `tenant=${tenant_id} namespace=${tenant_id} (simulated)`, latency_ms: 120 + i * 47, status: 'ok' }] }
          : r)),
      }));
    }, 500 * (i + 1));
  });
  window.setTimeout(() => {
    update((s) => ({
      ...s,
      agentRuns: s.agentRuns.map((r) => (r.run_id === run.run_id
        ? { ...r, status: 'succeeded', finished_at: now(), input_tokens: 4200 + tools.length * 310, output_tokens: 1800 + tools.length * 120 }
        : r)),
    }));
    pushActivity('agent', `${def?.display_name ?? agent_name} run ${run.run_id} succeeded`, tenant_id);
  }, 500 * (tools.length + 1));
  return run;
}

// ---------------------------------------------------------------------------
// API keys / notifications
// ---------------------------------------------------------------------------
export function createApiKey(name: string, tenant_id: string, actor: string, scopes: string[] = []): { record: ApiKeyRecord; secret: string } {
  const secret = `evk_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}_DEMO`;
  const rec: ApiKeyRecord = {
    key_id: uid('key'), tenant_id, name, prefix: secret.slice(0, 12),
    scopes: [...scopes],
    created_at: now(), last_used: null, status: 'active',
  };
  update((s) => ({ ...s, apiKeys: [...s.apiKeys, rec] }));
  pushAudit({ actor, tenant_id, action: 'apikey.created', target: rec.key_id, detail: `${name} — scopes: ${scopes.length ? scopes.join(', ') : 'none (legacy unscoped demo key)'}`, result: 'success' });
  return { record: rec, secret };
}
export function revokeApiKey(key_id: string, actor: string): void {
  const k = state.apiKeys.find((x) => x.key_id === key_id);
  if (!k) return;
  update((s) => ({ ...s, apiKeys: s.apiKeys.map((x) => (x.key_id === key_id ? { ...x, status: 'revoked' as const } : x)) }));
  pushAudit({ actor, tenant_id: k.tenant_id, action: 'apikey.revoked', target: key_id, detail: k.name, result: 'success' });
}
export function markNotificationRead(id: string): void {
  update((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
}
export function markAllNotificationsRead(): void {
  update((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
}
export function recordAudit(entry: Omit<AuditEntry, 'id' | 'at'>): void {
  pushAudit(entry);
}

// ---------------------------------------------------------------------------
// Ontology & semantic layer (mappings, governance)
// ---------------------------------------------------------------------------
export interface MapCodesResult { mapped: ConceptMapping[]; unmapped: string[] }

/** Paste-codes mapping job: known codes resolve; unknown codes are flagged
 *  unmapped (never guessed). New mappings enter as PENDING review. */
export function mapCodes(codesText: string, tenant_id: string, actor: string): MapCodesResult {
  const codes = codesText.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const mapped: ConceptMapping[] = [];
  const unmapped: string[] = [];
  for (const code of codes) {
    const existing = state.mappings.find((m) => m.source_code.toUpperCase() === code);
    if (existing) { mapped.push(existing); continue; }
    const candidate = mappingCandidateSeed[code];
    if (candidate) {
      const rec: ConceptMapping = {
        ...candidate, id: uid('map'),
        review_status: 'pending', reviewed_by: null, updated_at: now(),
      };
      mapped.push(rec);
      update((s) => ({ ...s, mappings: [rec, ...s.mappings] }));
    } else {
      const rec: ConceptMapping = {
        id: uid('map'), source_code: code, source_system: 'Local',
        source_label: '(unknown source code)', target_concept_id: null, target_label: null,
        target_vocabulary: null, omop_domain: null, confidence: null,
        review_status: 'unmapped', reviewed_by: null, updated_at: now(),
      };
      unmapped.push(code);
      update((s) => ({ ...s, mappings: [rec, ...s.mappings] }));
    }
  }
  pushAudit({
    actor, tenant_id, action: 'ontology.mapping.run', target: 'concept-mappings',
    detail: `${mapped.length} resolved, ${unmapped.length} unmapped (flagged, not guessed)`, result: 'success',
  });
  pushActivity('system', `Concept mapping run: ${mapped.length} resolved · ${unmapped.length} unmapped`, tenant_id);
  return { mapped, unmapped };
}

export function reviewMapping(id: string, decision: 'approved' | 'rejected', tenant_id: string, actor: string): void {
  const m = state.mappings.find((x) => x.id === id);
  if (!m) return;
  update((s) => ({
    ...s,
    mappings: s.mappings.map((x) => (x.id === id ? { ...x, review_status: decision, reviewed_by: actor, updated_at: now() } : x)),
  }));
  pushAudit({ actor, tenant_id, action: `ontology.mapping.${decision}`, target: id, detail: `${m.source_code} → ${m.target_label ?? '—'}`, result: 'success' });
}

export function decideProposal(id: string, decision: 'approved' | 'rejected', tenant_id: string, actor: string): void {
  const p = state.proposals.find((x) => x.id === id);
  if (!p) return;
  update((s) => ({
    ...s,
    proposals: s.proposals.map((x) => (x.id === id ? { ...x, status: decision, decided_by: actor, decided_at: now() } : x)),
  }));
  pushAudit({ actor, tenant_id, action: `ontology.proposal.${decision}`, target: id, detail: p.title, result: 'success' });
  pushActivity('system', `Ontology proposal ${decision}: “${p.title}”`, tenant_id);
}

export function submitProposal(input: { title: string; kind: ChangeProposal['kind']; detail: string }, tenant_id: string, actor: string): ChangeProposal {
  const p: ChangeProposal = {
    id: uid('prop'), title: input.title, kind: input.kind, detail: input.detail,
    author: actor, submitted_at: now(), status: 'pending', decided_by: null, decided_at: null,
  };
  update((s) => ({ ...s, proposals: [p, ...s.proposals] }));
  pushAudit({ actor, tenant_id, action: 'ontology.proposal.submitted', target: p.id, detail: input.title, result: 'success' });
  return p;
}

/**
 * Ontology version governance decision (R8, demo-state only). Approving
 * makes the version the ONLY agent-visible ontology and supersedes the
 * previously approved one. This mirrors the platform governance rules
 * but intentionally does not claim a backend registry write.
 */
export function decideOntologyVersion(version: string, decision: 'approved' | 'rejected', tenant_id: string, actor: string): OntologyVersion {
  const v = state.ontologyVersions.find((x) => x.version === version);
  if (!v) throw new Error(`Ontology version ${version} not found`);
  if (v.status !== 'in-review') throw new Error(`Only an in-review version can be decided (v${version} is ${v.status}).`);
  if (decision === 'approved') {
    update((s) => ({
      ...s,
      ontologyVersions: s.ontologyVersions.map((x) => {
        if (x.version === version) return { ...x, status: 'approved' as const, published_at: now(), decided_by: actor, decided_at: now() };
        if (x.status === 'approved') return { ...x, status: 'superseded' as const };
        return x;
      }),
    }));
    pushAudit({ actor, tenant_id, action: 'ontology.version.approved', target: `ontology-v${version}`, detail: `v${version} approved — agents now see v${version}; previously approved version superseded.`, delta: 'in-review → approved', result: 'success' });
    pushActivity('system', `Ontology v${version} approved — agents now see v${version}`, tenant_id);
  } else {
    update((s) => ({
      ...s,
      ontologyVersions: s.ontologyVersions.map((x) => (x.version === version ? { ...x, status: 'rejected' as const, decided_by: actor, decided_at: now() } : x)),
    }));
    pushAudit({ actor, tenant_id, action: 'ontology.version.rejected', target: `ontology-v${version}`, detail: `v${version} rejected at sign-off — stays invisible to agents.`, delta: 'in-review → rejected', result: 'success' });
    pushActivity('system', `Ontology v${version} rejected at governance sign-off`, tenant_id);
  }
  return state.ontologyVersions.find((x) => x.version === version)!;
}

// ---------------------------------------------------------------------------
// Composable roles (R5) & access requests
// ---------------------------------------------------------------------------
export function createCustomRole(input: { name: string; description?: string; tenant_id: string; cloned_from: Role; permissions: Permission[] }, actor: string): CustomRoleDef {
  const role: CustomRoleDef = {
    id: uid('crole'),
    name: input.name,
    description: input.description ?? '',
    tenant_id: input.tenant_id,
    cloned_from: input.cloned_from,
    permissions: [...input.permissions],
    created_at: now(),
    created_by: actor,
  };
  update((s) => ({ ...s, customRoles: [...s.customRoles, role] }));
  pushAudit({ actor, tenant_id: input.tenant_id, action: 'role.custom.created', target: role.id, detail: `Cloned from ${input.cloned_from} with ${input.permissions.length} permissions.`, result: 'success' });
  return role;
}

export function updateCustomRole(id: string, patch: { name?: string; description?: string; permissions?: Permission[] }, actor: string): void {
  const role = state.customRoles.find((r) => r.id === id);
  if (!role) return;
  const before = role.permissions.length;
  update((s) => ({
    ...s,
    customRoles: s.customRoles.map((r) => (r.id === id
      ? { ...r, name: patch.name ?? r.name, description: patch.description ?? r.description, permissions: patch.permissions ? [...patch.permissions] : r.permissions }
      : r)),
  }));
  pushAudit({ actor, tenant_id: role.tenant_id, action: 'role.custom.updated', target: id, detail: role.name, delta: patch.permissions ? `${before} → ${patch.permissions.length} permissions` : null, result: 'success' });
}

export function deleteCustomRole(id: string, actor: string): void {
  const role = state.customRoles.find((r) => r.id === id);
  if (!role) return;
  update((s) => ({
    ...s,
    customRoles: s.customRoles.filter((r) => r.id !== id),
    users: s.users.map((u) => (u.custom_role_id === id ? { ...u, custom_role_id: null } : u)),
  }));
  pushAudit({ actor, tenant_id: role.tenant_id, action: 'role.custom.deleted', target: id, detail: `${role.name} — assignees fall back to their preset role.`, result: 'success' });
}

export function assignCustomRole(user_id: string, custom_role_id: string | null, actor: string): void {
  const u = state.users.find((x) => x.user_id === user_id);
  if (!u) return;
  const role = custom_role_id ? state.customRoles.find((r) => r.id === custom_role_id) : null;
  update((s) => ({
    ...s,
    users: s.users.map((x) => (x.user_id === user_id ? { ...x, custom_role_id } : x)),
  }));
  pushAudit({ actor, tenant_id: u.tenant_id, action: 'user.custom_role.assigned', target: u.email, detail: role ? `Custom role: ${role.name}` : 'Custom role cleared — preset role applies.', delta: role ? `→ ${role.name}` : '→ preset role', result: 'success' });
}

export function requestAccess(input: { tenant_id: string; user_id: string | null; requester_name: string; requester_email: string; requested_role: string; is_custom: boolean; reason: string }, actor: string): AccessRequest {
  const req: AccessRequest = {
    id: uid('areq'),
    tenant_id: input.tenant_id,
    user_id: input.user_id,
    requester_name: input.requester_name,
    requester_email: input.requester_email,
    requested_role: input.requested_role,
    is_custom: input.is_custom,
    reason: input.reason,
    status: 'pending',
    created_at: now(),
    decided_by: null,
    decided_at: null,
  };
  update((s) => ({ ...s, accessRequests: [req, ...s.accessRequests] }));
  pushAudit({ actor, tenant_id: input.tenant_id, action: 'access.requested', target: req.id, detail: `${input.requester_name} requested ${input.requested_role}: ${input.reason}`, result: 'info' });
  return req;
}

export function decideAccessRequest(id: string, decision: 'approved' | 'rejected', actor: string): void {
  const req = state.accessRequests.find((r) => r.id === id);
  if (!req || req.status !== 'pending') return;
  update((s) => ({
    ...s,
    accessRequests: s.accessRequests.map((r) => (r.id === id ? { ...r, status: decision, decided_by: actor, decided_at: now() } : r)),
  }));
  pushAudit({ actor, tenant_id: req.tenant_id, action: `access.request.${decision}`, target: id, detail: `${req.requester_name} → ${req.requested_role}`, result: 'success' });
  if (decision === 'approved' && req.user_id) {
    if (req.is_custom) {
      const role = state.customRoles.find((r) => r.tenant_id === req.tenant_id && r.name === req.requested_role);
      if (role) assignCustomRole(req.user_id, role.id, actor);
    } else if (isPresetRole(req.requested_role)) {
      setUserRole(req.user_id, req.requested_role, actor);
    }
  }
  pushActivity('user', `Access request ${decision}: ${req.requester_name} → ${req.requested_role}`, req.tenant_id);
}

/** Append a Part 11 signature to the evidence chain (hash-linked, demo). */
export function signEvidence(tenant_id: string, signerName: string, signerId: string, meaning: string): void {
  const ev = state.evidence;
  const seq = ev.signatures.length;
  const prev = ev.chain_head_hash;
  const hash = Array.from({ length: 64 }, (_, i) => '0123456789abcdef'[(seq * 7 + i * 13 + signerName.length) % 16]).join('');
  const sig = {
    sequence: seq,
    signer_id: signerId, signer_name: signerName, signer_role: 'biostatistician', tenant_id,
    meaning, attestation: `Digitally signed in Evidia Studio (demo ceremony) — ${meaning}.`,
    artifact_sha256: ev.signatures[0]?.artifact_sha256 ?? 'a'.repeat(64),
    signed_at_utc: now(), previous_hash: prev, record_hash: hash,
  };
  update((s) => ({
    ...s,
    evidence: { ...s.evidence, signatures: [...s.evidence.signatures, sig], chain_head_hash: hash },
  }));
  pushAudit({ actor: signerId, tenant_id, action: 'evidence.signed', target: ev.study_id, detail: `Signature #${seq} (${meaning})`, result: 'success' });
  pushActivity('evidence', `Evidence package ${ev.study_id} signed by ${signerName}`, tenant_id);
}

// ---------------------------------------------------------------------------
// Services (per-tenant enablement)
// ---------------------------------------------------------------------------
export function setServiceEnabled(tenant_id: string, key: ServiceKey, enabled: boolean, actor: string): void {
  update((s) => {
    const current = s.tenantServices[tenant_id] ?? defaultServiceStates();
    return { ...s, tenantServices: { ...s.tenantServices, [tenant_id]: { ...current, [key]: enabled } } };
  });
  pushAudit({ actor, tenant_id, action: enabled ? 'service.enabled' : 'service.disabled', target: key, detail: serviceDef(key).name, delta: enabled ? 'disabled → enabled' : 'enabled → disabled', result: 'success' });
}
export function setAgentEnabled(tenant_id: string, agent_name: string, enabled: boolean, actor: string): void {
  update((s) => {
    const current = s.agentServices[tenant_id] ?? defaultAgentStates();
    return { ...s, agentServices: { ...s.agentServices, [tenant_id]: { ...current, [agent_name]: enabled } } };
  });
  pushAudit({ actor, tenant_id, action: enabled ? 'service.agent.enabled' : 'service.agent.disabled', target: agent_name, detail: '', delta: enabled ? 'disabled → enabled' : 'enabled → disabled', result: 'success' });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export interface CreateTeamInput {
  name: string;
  description: string;
  role: Role;
  tenant_id: string;
  access_datasets: string[];
  access_studies: string[];
  actor: string;
}
export function createTeam(input: CreateTeamInput): TeamRecord {
  const team: TeamRecord = {
    team_id: uid('team'),
    tenant_id: input.tenant_id,
    name: input.name,
    description: input.description,
    role: input.role,
    member_ids: [],
    access_datasets: [...input.access_datasets],
    access_studies: [...input.access_studies],
    created_at: now(),
  };
  update((s) => ({ ...s, teams: [...s.teams, team] }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'team.created', target: team.team_id, detail: team.name, result: 'success' });
  return team;
}
export function deleteTeam(team_id: string, actor: string): void {
  const team = state.teams.find((x) => x.team_id === team_id);
  if (!team) return;
  update((s) => ({ ...s, teams: s.teams.filter((x) => x.team_id !== team_id) }));
  pushAudit({ actor, tenant_id: team.tenant_id, action: 'team.deleted', target: team_id, detail: team.name, result: 'success' });
}
export function addTeamMember(team_id: string, user_id: string, actor: string): void {
  const team = state.teams.find((x) => x.team_id === team_id);
  if (!team || team.member_ids.includes(user_id)) return;
  update((s) => ({
    ...s,
    teams: s.teams.map((x) => (x.team_id === team_id ? { ...x, member_ids: [...x.member_ids, user_id] } : x)),
  }));
  const user = state.users.find((x) => x.user_id === user_id);
  pushAudit({ actor, tenant_id: team.tenant_id, action: 'team.member.added', target: user?.email ?? user_id, detail: team.name, result: 'success' });
}
export function removeTeamMember(team_id: string, user_id: string, actor: string): void {
  const team = state.teams.find((x) => x.team_id === team_id);
  if (!team) return;
  update((s) => ({
    ...s,
    teams: s.teams.map((x) => (x.team_id === team_id ? { ...x, member_ids: x.member_ids.filter((id) => id !== user_id) } : x)),
  }));
  const user = state.users.find((x) => x.user_id === user_id);
  pushAudit({ actor, tenant_id: team.tenant_id, action: 'team.member.removed', target: user?.email ?? user_id, detail: team.name, result: 'success' });
}
export function setTeamRole(team_id: string, role: Role, actor: string): void {
  const team = state.teams.find((x) => x.team_id === team_id);
  if (!team) return;
  update((s) => ({
    ...s,
    teams: s.teams.map((x) => (x.team_id === team_id ? { ...x, role } : x)),
  }));
  pushAudit({ actor, tenant_id: team.tenant_id, action: 'team.role.changed', target: team_id, detail: `New role: ${role}`, result: 'success' });
}

// ---------------------------------------------------------------------------
// Delivery engagements & support sessions
// ---------------------------------------------------------------------------
export function setEngagementPhase(tenant_id: string, phase: EngagementPhase, actor: string): void {
  const eng = state.engagements.find((x) => x.tenant_id === tenant_id);
  if (!eng) return;
  update((s) => ({
    ...s,
    engagements: s.engagements.map((x) => (x.tenant_id === tenant_id ? { ...x, phase, updated_at: now() } : x)),
  }));
  pushAudit({ actor, tenant_id, action: 'delivery.phase.changed', target: tenant_id, detail: phase, result: 'success' });
}
export function setEngagementHealth(tenant_id: string, health: EngagementHealth, actor: string): void {
  const eng = state.engagements.find((x) => x.tenant_id === tenant_id);
  if (!eng) return;
  update((s) => ({
    ...s,
    engagements: s.engagements.map((x) => (x.tenant_id === tenant_id ? { ...x, health, updated_at: now() } : x)),
  }));
  pushAudit({ actor, tenant_id, action: 'delivery.health.changed', target: tenant_id, detail: health, result: 'success' });
}
export function toggleEngagementMilestone(tenant_id: string, milestone: string, actor: string): void {
  const eng = state.engagements.find((x) => x.tenant_id === tenant_id);
  if (!eng) return;
  const done = eng.completed.includes(milestone);
  update((s) => ({
    ...s,
    engagements: s.engagements.map((x) => (x.tenant_id === tenant_id
      ? { ...x, completed: done ? x.completed.filter((m) => m !== milestone) : [...x.completed, milestone], updated_at: now() }
      : x)),
  }));
  pushAudit({ actor, tenant_id, action: 'delivery.milestone.updated', target: tenant_id, detail: `${milestone} — ${done ? 'pending' : 'done'}`, result: 'success' });
}
export function startSupportSession(tenant_id: string, actor: string): void {
  pushAudit({ actor, tenant_id, action: 'support.view_as.started', target: tenant_id, detail: 'Audited support session started (view as tenant)', result: 'info' });
  pushActivity('system', `Support view-as session started for ${tenant_id}`, tenant_id);
}
export function endSupportSession(tenant_id: string, actor: string): void {
  pushAudit({ actor, tenant_id, action: 'support.view_as.ended', target: tenant_id, detail: 'Audited support session ended (view as tenant)', result: 'info' });
  pushActivity('system', `Support view-as session ended for ${tenant_id}`, tenant_id);
}
export function activateBreakGlass(tenant_id: string, actor: string, reason: string): void {
  pushAudit({ actor, tenant_id, action: 'support.break_glass.activated', target: tenant_id, detail: `BREAK-GLASS elevated access (15 min): ${reason}`, result: 'info' });
  update((s) => ({
    ...s,
    notifications: [{ id: uid('notif'), at: now(), title: 'Break-glass access activated', body: `${actor} activated elevated access on ${tenant_id}: ${reason}`, severity: 'critical' as const, read: false }, ...s.notifications],
  }));
}

/** Test hook: reset to the seeded fixture state. */
export function __resetStore(): void {
  state = seedState();
  emit();
}
