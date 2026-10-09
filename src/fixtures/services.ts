/**
 * Per-tenant service catalog fixtures for the enterprise console.
 *
 * All demo data. Models which platform services a tenant has enabled in
 * this demo console; dependency rules are evaluated purely client-side
 * by the helpers below and are not an entitlement or security boundary.
 */

export type ServiceKey = 'pipeline' | 'deid' | 'dq' | 'ontology' | 'cohorts' | 'agents' | 'benchmarking' | 'part11' | 'connectors' | 'evidence' | 'billing';

export interface ServiceDef {
  key: ServiceKey;
  name: string;
  description: string;
  entitlement: 'included' | 'addon';
  depends_on: ServiceKey[];
}

export type TenantServiceStates = Record<ServiceKey, boolean>;

export const SERVICE_CATALOG: ServiceDef[] = [
  { key: 'pipeline', name: 'Data Pipeline', description: 'Demo pipeline runs that land and harmonize tenant datasets.', entitlement: 'included', depends_on: [] },
  { key: 'deid', name: 'De-identification Engine', description: 'Demo de-identification step applied to landed datasets.', entitlement: 'included', depends_on: [] },
  { key: 'dq', name: 'Data Quality Scoring', description: 'Demo data-quality scores and conformance check results.', entitlement: 'included', depends_on: [] },
  { key: 'ontology', name: 'Ontology & Semantic Layer', description: 'Demo ontology browsing, mappings, and semantic lookup.', entitlement: 'included', depends_on: [] },
  { key: 'cohorts', name: 'Cohort Builder', description: 'Demo cohort definitions built over ontology concepts.', entitlement: 'included', depends_on: ['ontology'] },
  { key: 'agents', name: 'Agent Suite', description: 'Demo agent catalog and runs grounded in the ontology.', entitlement: 'included', depends_on: ['ontology'] },
  { key: 'benchmarking', name: 'Federated Benchmarking', description: 'Demo cross-tenant benchmark aggregates over DQ-scored data.', entitlement: 'addon', depends_on: ['dq'] },
  { key: 'part11', name: 'Part 11 E-Signatures', description: 'Demo e-signature workflow surface for evidence packages.', entitlement: 'addon', depends_on: ['evidence'] },
  { key: 'connectors', name: 'Connectors', description: 'Demo connector catalog for landing or virtualizing source data.', entitlement: 'included', depends_on: [] },
  { key: 'evidence', name: 'Evidence Packages', description: 'Demo evidence package assembly and review surface.', entitlement: 'included', depends_on: [] },
  { key: 'billing', name: 'Usage Billing', description: 'Demo usage records and billing summaries for the tenant.', entitlement: 'included', depends_on: [] },
];

export function serviceDef(key: ServiceKey): ServiceDef {
  const def = SERVICE_CATALOG.find((service) => service.key === key);
  if (!def) throw new Error(`Unknown service: ${key}`);
  return def;
}

export function isServiceEnabled(states: TenantServiceStates, key: ServiceKey): boolean {
  if (!states[key]) return false;
  return serviceDef(key).depends_on.every((dep) => isServiceEnabled(states, dep));
}

export function serviceBlockers(states: TenantServiceStates, key: ServiceKey): ServiceKey[] {
  return serviceDef(key).depends_on.filter((dep) => !isServiceEnabled(states, dep));
}

export function defaultServiceStates(): TenantServiceStates {
  return {
    pipeline: true,
    deid: true,
    dq: true,
    ontology: true,
    cohorts: true,
    agents: true,
    benchmarking: true,
    part11: true,
    connectors: true,
    evidence: true,
    billing: true,
  };
}

export const AGENT_NAMES = ['study_design', 'cohort_qa', 'dossier_drafting', 'targeting_strategist', 'feasibility'] as const;

export function defaultAgentStates(): Record<string, boolean> {
  return {
    study_design: true,
    cohort_qa: true,
    dossier_drafting: true,
    targeting_strategist: true,
    feasibility: true,
  };
}

export const SERVICE_SEED_STATES: Record<string, TenantServiceStates> = {
  platform: defaultServiceStates(),
  acme_rare: defaultServiceStates(),
  beacon_bio: { ...defaultServiceStates(), part11: false, benchmarking: false },
  corvus_tx: { ...defaultServiceStates(), ontology: false, benchmarking: false, part11: false, agents: true, cohorts: true },
};

export const AGENT_SERVICE_SEED: Record<string, Record<string, boolean>> = {
  platform: defaultAgentStates(),
  acme_rare: defaultAgentStates(),
  beacon_bio: { ...defaultAgentStates(), targeting_strategist: false },
  corvus_tx: defaultAgentStates(),
};
