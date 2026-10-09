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
import type { Role } from './permissions';

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  tenant_id: string;
  action: string;
  target: string;
  detail: string;
  result: 'success' | 'blocked' | 'info';
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
}

const now = () => new Date().toISOString();
let seq = 1000;
const uid = (p: string) => `${p}-${(++seq).toString(36)}-${Date.now().toString(36).slice(-4)}`;

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
}
export function provisionTenant(input: ProvisionTenantInput): ControlTenant {
  const t: ControlTenant = {
    tenant_id: input.tenant_id,
    display_name: input.name,
    status: 'provisioning',
    isolation: input.isolation,
    region: input.region,
    kms_key_id: `alias/ef-tenant-${input.tenant_id}-dev`,
    created_at: now(),
    users: 1,
    datasets: 0,
    active_studies: 0,
    usage: { datasets: 0, datasets_quota: 25, agent_runs: 0, agent_runs_quota: 2000, storage_gb: 0, storage_quota_gb: 500 },
  };
  update((s) => ({
    ...s,
    tenants: [...s.tenants, t],
    tenantServices: { ...s.tenantServices, [input.tenant_id]: defaultServiceStates() },
    agentServices: { ...s.agentServices, [input.tenant_id]: defaultAgentStates() },
  }));
  pushAudit({ actor: input.actor, tenant_id: input.tenant_id, action: 'tenant.provision.requested', target: input.tenant_id, detail: `${input.isolation} tenant in ${input.region} (simulated)`, result: 'success' });
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
      ? { ...x, role, cognito_groups: [`tenant-${x.tenant_id}`, `role-${role.toLowerCase().replace(/\s+/g, '-')}`] }
      : x)),
  }));
  pushAudit({ actor, tenant_id: u.tenant_id, action: 'user.role.changed', target: u.email, detail: `New role: ${role}`, result: 'success' });
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
export function addConnector(input: AddConnectorInput): ConnectorRecord {
  const c: ConnectorRecord = {
    connector_id: uid('conn'), tenant_id: input.tenant_id, name: input.name, type: input.type,
    mode: input.mode, status: 'unknown', enabled: true, capabilities: input.capabilities,
    config: input.config, last_test: null, created_at: now(),
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
export function createApiKey(name: string, tenant_id: string, actor: string): { record: ApiKeyRecord; secret: string } {
  const secret = `evk_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}_DEMO`;
  const rec: ApiKeyRecord = {
    key_id: uid('key'), tenant_id, name, prefix: secret.slice(0, 12),
    created_at: now(), last_used: null, status: 'active',
  };
  update((s) => ({ ...s, apiKeys: [...s.apiKeys, rec] }));
  pushAudit({ actor, tenant_id, action: 'apikey.created', target: rec.key_id, detail: name, result: 'success' });
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
  pushAudit({ actor, tenant_id, action: enabled ? 'service.enabled' : 'service.disabled', target: key, detail: serviceDef(key).name, result: 'success' });
}
export function setAgentEnabled(tenant_id: string, agent_name: string, enabled: boolean, actor: string): void {
  update((s) => {
    const current = s.agentServices[tenant_id] ?? defaultAgentStates();
    return { ...s, agentServices: { ...s.agentServices, [tenant_id]: { ...current, [agent_name]: enabled } } };
  });
  pushAudit({ actor, tenant_id, action: enabled ? 'service.agent.enabled' : 'service.agent.disabled', target: agent_name, detail: '', result: 'success' });
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
