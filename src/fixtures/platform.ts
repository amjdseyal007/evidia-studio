/**
 * Platform fixtures for the enterprise console rebuild.
 *
 * All demo data. Shapes mirror the real platform payloads where they
 * exist (tenant_admin plans, billing usage records); control-plane-only
 * shapes (datasets, connectors, environments) are forward-looking demo
 * models labeled as such in the UI.
 */
import type { Role } from '../lib/permissions';

export interface ControlTenant {
  tenant_id: string;
  display_name: string;
  status: 'active' | 'provisioning' | 'offboarded';
  isolation: 'pooled' | 'silo' | 'client-cloud';
  region: string;
  kms_key_id: string;
  created_at: string;
  users: number;
  datasets: number;
  active_studies: number;
  usage: {
    datasets: number; datasets_quota: number;
    agent_runs: number; agent_runs_quota: number;
    storage_gb: number; storage_quota_gb: number;
  };
}

export interface UserRecord {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  tenant_id: string;
  status: 'active' | 'invited' | 'deactivated';
  cognito_groups: string[];
  last_login: string | null;
  created_at: string;
}

export interface DatasetRecord {
  dataset_id: string;
  tenant_id: string;
  name: string;
  layer: 'bronze' | 'silver' | 'gold';
  source: string;
  rows: number;
  dq_score: number | null;
  last_run_at: string | null;
  updated_at: string;
}

export interface PipelineStep {
  name: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  logs: string[];
}
export interface PipelineRun {
  run_id: string;
  tenant_id: string;
  dataset_id: string;
  dataset_name: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  steps: PipelineStep[];
}

export type ConnectorCapability = 'pushdown' | 'virtual' | 'incremental' | 'cdc';
export interface ConnectorRecord {
  connector_id: string;
  tenant_id: string;
  name: string;
  type: 'snowflake' | 'databricks' | 'foundry' | 'rest';
  mode: 'land' | 'virtual';
  status: 'connected' | 'error' | 'unknown';
  enabled: boolean;
  capabilities: ConnectorCapability[];
  config: Record<string, string>;
  last_test: { at: string; ok: boolean; latency_ms: number } | null;
  created_at: string;
}

export interface ProductRecord {
  product_id: 'P0' | 'P1' | 'P2' | 'P3';
  name: string;
  tagline: string;
  pricing: string;
  includes: string[];
}

export interface EnvironmentRecord {
  env: 'dev' | 'staging' | 'prod';
  status: 'healthy' | 'degraded' | 'not-deployed';
  modules: Array<{ name: string; status: 'deployed' | 'synth-only' | 'planned'; version: string }>;
  last_deploy: string | null;
}

export interface ServiceHealth {
  name: string;
  category: string;
  status: 'operational' | 'degraded' | 'not-deployed';
  detail: string;
}

export interface ApiKeyRecord {
  key_id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used: string | null;
  status: 'active' | 'revoked';
}

export interface NotificationItem {
  id: string;
  at: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'pipeline' | 'agent' | 'tenant' | 'user' | 'connector' | 'evidence' | 'system';
  text: string;
  tenant_id: string;
}

const d = (s: string) => s;

export const tenantCpSeed: ControlTenant[] = [
  {
    tenant_id: 'platform', display_name: 'Evidia Platform (operator)', status: 'active',
    isolation: 'pooled', region: 'us-east-1', kms_key_id: 'alias/ef-platform-dev',
    created_at: d('2026-08-20T10:00:00Z'), users: 6, datasets: 0, active_studies: 0,
    usage: { datasets: 0, datasets_quota: 100, agent_runs: 58, agent_runs_quota: 10000, storage_gb: 12, storage_quota_gb: 1000 },
  },
  {
    tenant_id: 'acme_rare', display_name: 'Meridian Bio (rare disease)', status: 'active',
    isolation: 'pooled', region: 'us-east-1', kms_key_id: 'alias/ef-tenant-acme_rare-dev',
    created_at: d('2026-09-14T10:00:00Z'), users: 14, datasets: 6, active_studies: 2,
    usage: { datasets: 6, datasets_quota: 25, agent_runs: 342, agent_runs_quota: 2000, storage_gb: 182, storage_quota_gb: 500 },
  },
  {
    tenant_id: 'beacon_bio', display_name: 'Beacon Bio', status: 'active',
    isolation: 'pooled', region: 'us-east-1', kms_key_id: 'alias/ef-tenant-beacon_bio-dev',
    created_at: d('2026-09-28T09:30:00Z'), users: 8, datasets: 3, active_studies: 1,
    usage: { datasets: 3, datasets_quota: 25, agent_runs: 121, agent_runs_quota: 2000, storage_gb: 64, storage_quota_gb: 500 },
  },
  {
    tenant_id: 'corvus_tx', display_name: 'Corvus Therapeutics', status: 'active',
    isolation: 'silo', region: 'us-east-1', kms_key_id: 'alias/ef-tenant-corvus_tx-dev',
    created_at: d('2026-10-02T14:15:00Z'), users: 5, datasets: 0, active_studies: 0,
    usage: { datasets: 0, datasets_quota: 10, agent_runs: 4, agent_runs_quota: 500, storage_gb: 0, storage_quota_gb: 250 },
  },
];

export const userSeed: UserRecord[] = [
  { user_id: 'user-001', name: 'Amjad Seyal', email: 'amjad@evidia.example', role: 'Platform Admin', tenant_id: 'acme_rare', status: 'active', cognito_groups: ['tenant-acme_rare', 'role-platform-admin'], last_login: '2026-10-08T18:52:00Z', created_at: '2026-09-14T10:05:00Z' },
  { user_id: 'user-008', name: 'Sarah Kim', email: 'sarah.kim@meridian.example', role: 'Tenant Admin', tenant_id: 'acme_rare', status: 'active', cognito_groups: ['tenant-acme_rare', 'role-tenant-admin'], last_login: '2026-10-08T17:31:00Z', created_at: '2026-09-14T10:20:00Z' },
  { user_id: 'user-002', name: 'Priya Nair', email: 'priya.nair@acme.example', role: 'Biostatistician', tenant_id: 'acme_rare', status: 'active', cognito_groups: ['tenant-acme_rare', 'role-biostatistician'], last_login: '2026-10-08T16:20:00Z', created_at: '2026-09-15T09:00:00Z' },
  { user_id: 'user-003', name: 'Tom Alvarez', email: 'tom.alvarez@acme.example', role: 'Data Engineer', tenant_id: 'acme_rare', status: 'active', cognito_groups: ['tenant-acme_rare', 'role-data-engineer'], last_login: '2026-10-08T15:44:00Z', created_at: '2026-09-16T11:30:00Z' },
  { user_id: 'user-004', name: 'Dana Whitfield', email: 'dana.whitfield@acme.example', role: 'Auditor', tenant_id: 'acme_rare', status: 'active', cognito_groups: ['tenant-acme_rare', 'role-auditor'], last_login: '2026-10-07T13:10:00Z', created_at: '2026-09-20T08:45:00Z' },
  { user_id: 'user-005', name: 'Marcus Webb', email: 'marcus.webb@beacon.example', role: 'Data Engineer', tenant_id: 'beacon_bio', status: 'active', cognito_groups: ['tenant-beacon_bio', 'role-data-engineer'], last_login: '2026-10-08T10:02:00Z', created_at: '2026-09-29T10:00:00Z' },
  { user_id: 'user-006', name: 'Lena Hoff', email: 'lena.hoff@beacon.example', role: 'Biostatistician', tenant_id: 'beacon_bio', status: 'invited', cognito_groups: ['tenant-beacon_bio', 'role-biostatistician'], last_login: null, created_at: '2026-10-05T12:00:00Z' },
  { user_id: 'user-007', name: 'Owen Park', email: 'owen.park@corvus.example', role: 'Auditor', tenant_id: 'corvus_tx', status: 'deactivated', cognito_groups: ['tenant-corvus_tx', 'role-auditor'], last_login: '2026-10-03T09:41:00Z', created_at: '2026-10-02T15:00:00Z' },
  { user_id: 'user-009', name: 'Grace Liu', email: 'grace.liu@evidia.example', role: 'Platform Admin', tenant_id: 'platform', status: 'active', cognito_groups: ['tenant-platform', 'role-platform-admin'], last_login: '2026-10-08T18:02:00Z', created_at: '2026-08-20T10:05:00Z' },
];

export const datasetSeed: DatasetRecord[] = [
  { dataset_id: 'ds-acme-claims', tenant_id: 'acme_rare', name: 'Acme claims extract 2026-Q3', layer: 'gold', source: 'S3 landing (BYOD)', rows: 1482043, dq_score: 86.5, last_run_at: '2026-10-08T13:58:00Z', updated_at: '2026-10-08T14:02:00Z' },
  { dataset_id: 'ds-acme-ehr', tenant_id: 'acme_rare', name: 'Acme EHR registry extract', layer: 'silver', source: 'Snowflake connector (LAND)', rows: 402118, dq_score: 82.4, last_run_at: '2026-10-07T09:12:00Z', updated_at: '2026-10-07T09:20:00Z' },
  { dataset_id: 'ds-acme-ref', tenant_id: 'acme_rare', name: 'Reference vocabularies 2026.09', layer: 'bronze', source: 'S3 landing (BYOD)', rows: 51233, dq_score: null, last_run_at: null, updated_at: '2026-10-01T08:00:00Z' },
  { dataset_id: 'ds-beacon-registry', tenant_id: 'beacon_bio', name: 'Beacon disease registry', layer: 'gold', source: 'Databricks (VIRTUAL)', rows: 964400, dq_score: 91.2, last_run_at: '2026-10-08T08:41:00Z', updated_at: '2026-10-08T08:45:00Z' },
  { dataset_id: 'ds-beacon-lab', tenant_id: 'beacon_bio', name: 'Beacon lab results feed', layer: 'silver', source: 'Custom REST connector', rows: 210905, dq_score: 78.9, last_run_at: '2026-10-06T22:03:00Z', updated_at: '2026-10-06T22:10:00Z' },
];

export const pipelineRunSeed: PipelineRun[] = [
  {
    run_id: 'run-20261008-004', tenant_id: 'acme_rare', dataset_id: 'ds-acme-claims', dataset_name: 'Acme claims extract 2026-Q3',
    status: 'succeeded', started_at: '2026-10-08T13:41:00Z', finished_at: '2026-10-08T13:58:00Z',
    steps: [
      { name: 'Ingest', status: 'succeeded', logs: ['Opening source extract', 'Schema snapshot recorded', 'Row counts reconciled: 1,482,043'] },
      { name: 'De-identification', status: 'succeeded', logs: ['Safe Harbor identifier scan: 18/18 classes checked', 'Date shifting applied (per-patient offset)', 'Tokenization vault write complete'] },
      { name: 'OMOP harmonization', status: 'succeeded', logs: ['Vocabulary mapping (Athena 2026.09)', 'Domain routing: condition/drug/measurement', 'Era construction finished'] },
      { name: 'Data quality', status: 'succeeded', logs: ['55 OMOP conformance checks queued', '48 pass · 5 warn · 2 fail', 'Provenance record signed'] },
      { name: 'Gold publish', status: 'succeeded', logs: ['Gold tables materialized', 'Dataset fingerprint updated', 'Catalog entry refreshed'] },
    ],
  },
  {
    run_id: 'run-20261007-002', tenant_id: 'acme_rare', dataset_id: 'ds-acme-ehr', dataset_name: 'Acme EHR registry extract',
    status: 'succeeded', started_at: '2026-10-07T08:55:00Z', finished_at: '2026-10-07T09:12:00Z',
    steps: [
      { name: 'Ingest', status: 'succeeded', logs: ['Opening source extract', 'Row counts reconciled: 402,118'] },
      { name: 'De-identification', status: 'succeeded', logs: ['Safe Harbor identifier scan: 18/18 classes checked', 'Expert-cert queue: not requested'] },
      { name: 'OMOP harmonization', status: 'succeeded', logs: ['Vocabulary mapping (Athena 2026.09)', 'Domain routing finished'] },
      { name: 'Data quality', status: 'succeeded', logs: ['55 checks: 45 pass · 7 warn · 3 fail'] },
      { name: 'Gold publish', status: 'succeeded', logs: ['Silver tables materialized (gold promotion manual)'] },
    ],
  },
  {
    run_id: 'run-20261006-001', tenant_id: 'beacon_bio', dataset_id: 'ds-beacon-lab', dataset_name: 'Beacon lab results feed',
    status: 'failed', started_at: '2026-10-06T21:58:00Z', finished_at: '2026-10-06T22:03:00Z',
    steps: [
      { name: 'Ingest', status: 'succeeded', logs: ['Opening source extract', 'Row counts reconciled: 210,905'] },
      { name: 'De-identification', status: 'failed', logs: ['Safe Harbor identifier scan: 18/18 classes checked', 'FAILED: free-text note field flagged for manual review'] },
      { name: 'OMOP harmonization', status: 'queued', logs: [] },
      { name: 'Data quality', status: 'queued', logs: [] },
      { name: 'Gold publish', status: 'queued', logs: [] },
    ],
  },
];

export const connectorSeed: ConnectorRecord[] = [
  { connector_id: 'conn-snowflake-acme', tenant_id: 'acme_rare', name: 'Acme Snowflake warehouse', type: 'snowflake', mode: 'land', status: 'connected', enabled: true, capabilities: ['pushdown', 'incremental'], config: { account: 'acme-rare.us-east-1', warehouse: 'EVIDIA_WH', database: 'RWE_PROD', secret_ref: 'evidia/tenants/acme_rare/snowflake (Secrets Manager)' }, last_test: { at: '2026-10-08T07:30:00Z', ok: true, latency_ms: 388 }, created_at: '2026-09-20T10:00:00Z' },
  { connector_id: 'conn-databricks-beacon', tenant_id: 'beacon_bio', name: 'Beacon Databricks workspace', type: 'databricks', mode: 'virtual', status: 'connected', enabled: true, capabilities: ['virtual', 'pushdown'], config: { workspace: 'beacon.cloud.databricks.com', catalog: 'rwe_catalog', secret_ref: 'evidia/tenants/beacon_bio/databricks (Secrets Manager)' }, last_test: { at: '2026-10-08T08:12:00Z', ok: true, latency_ms: 441 }, created_at: '2026-09-30T09:00:00Z' },
  { connector_id: 'conn-foundry-acme', tenant_id: 'acme_rare', name: 'Acme Foundry (ontology sync)', type: 'foundry', mode: 'virtual', status: 'unknown', enabled: false, capabilities: ['virtual'], config: { stack: 'acme.palantirfoundry.com', secret_ref: 'evidia/tenants/acme_rare/foundry (Secrets Manager)' }, last_test: null, created_at: '2026-10-05T13:00:00Z' },
  { connector_id: 'conn-rest-beacon', tenant_id: 'beacon_bio', name: 'Beacon lab REST feed', type: 'rest', mode: 'land', status: 'error', enabled: true, capabilities: ['incremental'], config: { base_url: 'https://labs.beacon.example/api/v2', secret_ref: 'evidia/tenants/beacon_bio/labs-rest (Secrets Manager)' }, last_test: { at: '2026-10-06T21:58:00Z', ok: false, latency_ms: 1204 }, created_at: '2026-10-01T16:20:00Z' },
];

export const productSeed: ProductRecord[] = [
  { product_id: 'P0', name: 'Evidence Platform', tagline: 'Governed BYOD platform — pooled SaaS, private silo, or client-cloud.', pricing: 'Annual platform fee', includes: ['OMOP harmonization', 'De-identification engine', 'DQ + provenance scoring', 'Agent suite access', 'Tenant control plane'] },
  { product_id: 'P1', name: 'External Control Arm Dossiers', tagline: 'Regulator-grade synthetic/external control arms, audit-ready. (Flagship)', pricing: '$150k–300k per study', includes: ['Cohort + feasibility analysis', 'Control-arm generation', 'Part 11 evidence package', 'Biostatistician sign-off'] },
  { product_id: 'P2', name: 'IRA Dossier Agents', tagline: 'Agentic evidence dossiers for IRA negotiation cycles.', pricing: 'Per-cycle engagement', includes: ['Evidence gap analysis', 'Dossier drafting agents', 'Cycle 3 finals support (Nov 1, 2026)'] },
  { product_id: 'P3', name: 'Autonomous Commercial Targeting', tagline: 'Explainable targeting agents over your harmonized data.', pricing: 'Annual add-on', includes: ['Targeting strategist agent', 'Ontology-grounded rationale', 'Audit trail per decision'] },
];

export const environmentSeed: EnvironmentRecord[] = [
  {
    env: 'dev', status: 'not-deployed', last_deploy: null,
    modules: [
      { name: 'network', status: 'synth-only', version: '0.2.0' },
      { name: 'security_baseline', status: 'synth-only', version: '0.2.0' },
      { name: 'data_lake', status: 'synth-only', version: '0.2.0' },
      { name: 'identity', status: 'synth-only', version: '0.2.0' },
      { name: 'compute', status: 'synth-only', version: '0.2.0' },
      { name: 'ontology', status: 'synth-only', version: '0.2.0' },
      { name: 'connectors', status: 'synth-only', version: '0.2.0' },
      { name: 'apps', status: 'synth-only', version: '0.2.0' },
      { name: 'observability', status: 'synth-only', version: '0.2.0' },
    ],
  },
  {
    env: 'staging', status: 'not-deployed', last_deploy: null,
    modules: [
      { name: 'network', status: 'synth-only', version: '0.2.0' },
      { name: 'security_baseline', status: 'synth-only', version: '0.2.0' },
      { name: 'data_lake', status: 'synth-only', version: '0.2.0' },
      { name: 'identity', status: 'synth-only', version: '0.2.0' },
      { name: 'compute', status: 'synth-only', version: '0.2.0' },
      { name: 'ontology', status: 'planned', version: '—' },
      { name: 'connectors', status: 'planned', version: '—' },
      { name: 'apps', status: 'planned', version: '—' },
      { name: 'observability', status: 'planned', version: '—' },
    ],
  },
  {
    env: 'prod', status: 'not-deployed', last_deploy: null,
    modules: [
      { name: 'network', status: 'planned', version: '—' },
      { name: 'security_baseline', status: 'planned', version: '—' },
      { name: 'data_lake', status: 'planned', version: '—' },
      { name: 'identity', status: 'planned', version: '—' },
      { name: 'compute', status: 'planned', version: '—' },
      { name: 'ontology', status: 'planned', version: '—' },
      { name: 'connectors', status: 'planned', version: '—' },
      { name: 'apps', status: 'planned', version: '—' },
      { name: 'observability', status: 'planned', version: '—' },
    ],
  },
];

export const serviceSeed: ServiceHealth[] = [
  { name: 'Studio API', category: 'Control plane', status: 'not-deployed', detail: 'Mock mode in this demo; live FastAPI not deployed' },
  { name: 'Bedrock agent runtime', category: 'AI plane', status: 'not-deployed', detail: '5 agents defined; live invocation pending AWS account' },
  { name: 'Ontology MCP server', category: 'AI plane', status: 'not-deployed', detail: '6 MCP tools; AgentCore hosting pending deployment' },
  { name: 'Batch scientific engine', category: 'Data plane', status: 'not-deployed', detail: 'AWS Batch queues defined per tenant' },
  { name: 'De-identification engine', category: 'Data plane', status: 'not-deployed', detail: 'Safe Harbor pipeline implemented; certification pending' },
  { name: 'Neptune ontology graph', category: 'Data plane', status: 'not-deployed', detail: 'Graph store for W3C ontology (Scan→Model→Serve)' },
];

export const apiKeySeed: ApiKeyRecord[] = [
  { key_id: 'key-seed-1', tenant_id: 'acme_rare', name: 'CI automation (demo)', prefix: 'evk_live_a1b2', created_at: '2026-09-22T10:00:00Z', last_used: '2026-10-08T06:12:00Z', status: 'active' },
  { key_id: 'key-seed-2', tenant_id: 'acme_rare', name: 'Analyst workstation (demo)', prefix: 'evk_live_c3d4', created_at: '2026-10-01T09:30:00Z', last_used: null, status: 'active' },
];

export const notificationSeed: NotificationItem[] = [
  { id: 'notif-1', at: '2026-10-08T13:58:00Z', title: 'Pipeline run completed', body: 'Acme claims extract 2026-Q3 finished with DQ 86.5.', severity: 'info', read: false },
  { id: 'notif-2', at: '2026-10-06T22:03:00Z', title: 'Pipeline run failed', body: 'Beacon lab results feed: de-identification flagged a free-text field.', severity: 'warning', read: false },
  { id: 'notif-3', at: '2026-10-05T09:00:00Z', title: 'Part 11 signing ceremony pending', body: 'Evidence package pkg-acme-001 awaits the two-component signing ceremony (largest known Part 11 gap).', severity: 'warning', read: true },
];

export const activitySeed: ActivityItem[] = [
  { id: 'act-1', at: '2026-10-08T13:58:00Z', kind: 'pipeline', text: 'Pipeline run-20261008-004 completed for Acme claims extract (DQ 86.5)', tenant_id: 'acme_rare' },
  { id: 'act-2', at: '2026-10-08T12:20:00Z', kind: 'evidence', text: 'Evidence package pkg-acme-001 signed by Priya Nair (author attestation)', tenant_id: 'acme_rare' },
  { id: 'act-3', at: '2026-10-08T10:40:00Z', kind: 'agent', text: 'FeasibilityAgent run-feas-20261007-001 succeeded', tenant_id: 'acme_rare' },
  { id: 'act-4', at: '2026-10-07T16:41:00Z', kind: 'connector', text: 'Snowflake connector test passed (412 ms) for Beacon Bio', tenant_id: 'beacon_bio' },
  { id: 'act-5', at: '2026-10-07T09:12:00Z', kind: 'pipeline', text: 'Acme EHR registry extract promoted silver → gold review', tenant_id: 'acme_rare' },
];
