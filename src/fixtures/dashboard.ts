import type { InvoiceReport, QualityResult, StudySummary, UsageRecord } from '../lib/api';

/** dataquality/core.py::QualityResult.to_dict() shape. Score is 0–100. */
export const dqFixtureByTenant: Record<string, QualityResult> = {
  acme_rare: {
    run_id: 'dq_fixture_acme_001',
    tenant_id: 'acme_rare',
    score: 86.5,
    label: 'evidia-dq-score/v1 (fixture)',
    summary: { total_checks: 55, passed: 47, failed: 2, warned: 6, tables_evaluated: ['condition_occurrence', 'drug_exposure', 'measurement', 'person', 'visit_occurrence'], rows_by_table: { person: 1200, condition_occurrence: 8430, drug_exposure: 5120, measurement: 22140, visit_occurrence: 3980 }, total_rows: 40870 },
    checks: [
      { check_id: 'completeness.dataset.required_tables_present', family: 'completeness', table: 'dataset', description: 'All required OMOP tables are present.', status: 'pass', numerator: 0, denominator: 5, threshold: { fail_offending_rate_gt: 0.05, warn_offending_rate_gt: 0.01 }, offending_count: 0, offending_rate: 0 },
      { check_id: 'completeness.person.person_id_not_null', family: 'completeness', table: 'person', description: 'person.person_id has no null/empty values.', status: 'pass', numerator: 0, denominator: 1200, threshold: { fail_offending_rate_gt: 0.05, warn_offending_rate_gt: 0.01 }, offending_count: 0, offending_rate: 0 },
      { check_id: 'plausibility.measurement.value_as_number_plausible_range', family: 'plausibility', table: 'measurement', description: 'value_as_number lies inside the configured per-concept plausible range.', status: 'warn', numerator: 14, denominator: 22140, threshold: { fail_offending_rate_gt: 0.05, warn_offending_rate_gt: 0.0005 }, offending_count: 14, offending_rate: 0.00063 },
    ],
    provenance: {
      tenant_id: 'acme_rare',
      dataset_fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      source_description: 'Fixture OMOP extract (synthetic rows only)',
      tool: 'evidia-dataquality',
      tool_version: '0.1.0-fixture',
      check_suite_version: 'dq-suite-fixture',
      generated_at: '2026-10-07T14:22:00Z',
      run_id: 'dq_fixture_acme_001',
      score: 86.5,
      counts: { total_checks: 55, passed: 47, failed: 2, warned: 6, total_rows: 40870, rows_by_table: { person: 1200 } },
      dataset_reference: 's3://ef-bronze-dev/tenants/acme_rare/fixture-extract/',
      config_snapshot: {},
      label: 'evidia-dq-score/v1 (fixture)',
    },
  },
  beacon_bio: {
    run_id: 'dq_fixture_beacon_001',
    tenant_id: 'beacon_bio',
    score: 92.25,
    label: 'evidia-dq-score/v1 (fixture)',
    summary: { total_checks: 51, passed: 48, failed: 0, warned: 3, tables_evaluated: ['condition_occurrence', 'drug_exposure', 'measurement', 'person', 'visit_occurrence'], rows_by_table: { person: 640 }, total_rows: 18900 },
    checks: [],
    provenance: {
      tenant_id: 'beacon_bio', dataset_fingerprint: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', source_description: 'Fixture OMOP extract (synthetic rows only)', tool: 'evidia-dataquality', tool_version: '0.1.0-fixture', check_suite_version: 'dq-suite-fixture', generated_at: '2026-10-06T09:10:00Z', run_id: 'dq_fixture_beacon_001', score: 92.25, counts: { total_checks: 51, passed: 48, failed: 0, warned: 3, total_rows: 18900, rows_by_table: { person: 640 } }, dataset_reference: null, config_snapshot: {}, label: 'evidia-dq-score/v1 (fixture)',
    },
  },
  corvus_tx: {
    run_id: 'dq_fixture_corvus_001',
    tenant_id: 'corvus_tx',
    score: 0,
    label: 'evidia-dq-score/v1 (fixture)',
    summary: { total_checks: 0, passed: 0, failed: 0, warned: 0, tables_evaluated: [], rows_by_table: {}, total_rows: 0 },
    checks: [],
    provenance: {
      tenant_id: 'corvus_tx', dataset_fingerprint: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', source_description: 'No dataset connected yet (fixture)', tool: 'evidia-dataquality', tool_version: '0.1.0-fixture', check_suite_version: 'dq-suite-fixture', generated_at: '2026-10-08T12:00:00Z', run_id: 'dq_fixture_corvus_001', score: 0, counts: { total_checks: 0, passed: 0, failed: 0, warned: 0, total_rows: 0, rows_by_table: {} }, dataset_reference: null, config_snapshot: {}, label: 'evidia-dq-score/v1 (fixture)',
    },
  },
};

export const studyFixtures: StudySummary[] = [
  { study_id: 'study-acme-001', tenant_id: 'acme_rare', name: 'External control — rare disease cohort A (fixture)', status: 'dossier_draft', updated_at: '2026-10-07T15:04:00Z', cohort_final_count: 187, classification: 'regulatory', ontology_version: '0.1.0', retention_locked: true },
  { study_id: 'study-acme-002', tenant_id: 'acme_rare', name: 'Feasibility scan — OMOP extract v2 (fixture)', status: 'feasibility', updated_at: '2026-10-06T11:30:00Z', cohort_final_count: null, classification: 'standard', ontology_version: null, retention_locked: false },
  { study_id: 'study-beacon-001', tenant_id: 'beacon_bio', name: 'Benchmarking cohort (fixture)', status: 'qa_review', updated_at: '2026-10-05T08:45:00Z', cohort_final_count: 342, classification: 'standard', ontology_version: null, retention_locked: false },
];

/** ai/billing.py::UsageRecord.to_dict() dicts. */
export const usageRecordFixtures: UsageRecord[] = [
  { tenant_id: 'acme_rare', study_id: 'study-acme-001', event_type: 'agent_invocation', timestamp_utc: '2026-10-07T14:58:00Z', quantity: 18400, unit: 'tokens', input_tokens: 12000, output_tokens: 6400, model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0', unit_price_ref: 'pricing.yaml:anthropic.claude-sonnet-4-5-20250929-v1:0', input_price_per_1m_usd: 3.0, output_price_per_1m_usd: 15.0, line_total_usd: 0.132, priced: true, pricing_version: 'pricing-fixture-v1', metadata: { agent: 'feasibility', purpose: 'study_design' } },
  { tenant_id: 'acme_rare', study_id: 'study-acme-001', event_type: 'ontology_query', timestamp_utc: '2026-10-07T14:59:00Z', quantity: 3, unit: 'calls', input_tokens: null, output_tokens: null, model_id: null, unit_price_ref: null, input_price_per_1m_usd: null, output_price_per_1m_usd: null, line_total_usd: null, priced: false, pricing_version: 'pricing-fixture-v1', metadata: { tool: 'query', agent: 'feasibility' } },
  { tenant_id: 'acme_rare', study_id: null, event_type: 'deid_run', timestamp_utc: '2026-10-06T10:00:00Z', quantity: 40870, unit: 'rows', input_tokens: null, output_tokens: null, model_id: null, unit_price_ref: null, input_price_per_1m_usd: null, output_price_per_1m_usd: null, line_total_usd: null, priced: false, pricing_version: 'pricing-fixture-v1', metadata: { tables: { person: { rows_out: 1200 } } } },
  { tenant_id: 'beacon_bio', study_id: 'study-beacon-001', event_type: 'agent_invocation', timestamp_utc: '2026-10-05T08:40:00Z', quantity: 9200, unit: 'tokens', input_tokens: 6000, output_tokens: 3200, model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0', unit_price_ref: 'pricing.yaml:anthropic.claude-sonnet-4-5-20250929-v1:0', input_price_per_1m_usd: 3.0, output_price_per_1m_usd: 15.0, line_total_usd: 0.066, priced: true, pricing_version: 'pricing-fixture-v1', metadata: { agent: 'cohort_qa', purpose: 'qa' } },
];

/** ai/billing.py::invoice_report() shape for the current tenant (acme_rare). */
export const invoiceReportFixture: InvoiceReport = {
  tenant_id: 'acme_rare',
  period_start: '2026-10-01',
  period_end: '2026-10-08',
  generated_at_utc: '2026-10-08T16:00:00Z',
  pricing_version: 'pricing-fixture-v1',
  currency: 'USD',
  record_count: 3,
  line_items: [
    { study_id: 'study-acme-001', event_type: 'agent_invocation', model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0', unit: 'tokens', quantity: 18400, input_tokens: 12000, output_tokens: 6400, record_count: 1, unit_price_ref: 'pricing.yaml:anthropic.claude-sonnet-4-5-20250929-v1:0', input_price_per_1m_usd: 3.0, output_price_per_1m_usd: 15.0, line_total_usd: 0.132, priced: true },
    { study_id: 'study-acme-001', event_type: 'ontology_query', model_id: null, unit: 'calls', quantity: 3, input_tokens: 0, output_tokens: 0, record_count: 1, unit_price_ref: null, input_price_per_1m_usd: null, output_price_per_1m_usd: null, line_total_usd: null, priced: false },
    { study_id: null, event_type: 'deid_run', model_id: null, unit: 'rows', quantity: 40870, input_tokens: 0, output_tokens: 0, record_count: 1, unit_price_ref: null, input_price_per_1m_usd: null, output_price_per_1m_usd: null, line_total_usd: null, priced: false },
  ],
  by_study: [
    { study_id: 'study-acme-001', line_items: [], record_count: 2, subtotal_usd: 0.132, has_unpriced: true },
    { study_id: null, line_items: [], record_count: 1, subtotal_usd: 0, has_unpriced: true },
  ],
  totals: { record_count: 3, priced_record_count: 1, unpriced_record_count: 2, priced_total_usd: 0.132, total_usd: 0.132, quantity_by_unit: { tokens: 18400, calls: 3, rows: 40870 } },
  unpriced: { record_count: 2, quantity_by_unit: { calls: 3, rows: 40870 }, line_items: [] },
};
