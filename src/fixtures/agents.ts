import type { AgentDefinition, AgentRun } from '../lib/api';

/**
 * The 5 product agents (ai/agents/product_agents.py). Ontology tool
 * names and per-agent allow-lists mirror ai/ontology_mcp.py:
 * TOOLS = list_metrics, describe_schema, query, translate_sparql,
 * rag_retrieval, graph_traversal.
 */
export const agentFixtures: AgentDefinition[] = [
  { name: 'study_design', display_name: 'StudyDesignAgent', description: 'Draft a synthetic-data study Protocol JSON from a goal plus explicit constraints. Synthesis only; no engine tools.', prompt_name: 'study_design', ontology_agent_key: 'study-design', allowed_ontology_tools: ['describe_schema', 'translate_sparql', 'query'] },
  { name: 'cohort_qa', display_name: 'CohortQaAgent', description: 'Interrogate cohort balance from a supplied balance summary. Deterministic QA report; never invents data.', prompt_name: 'cohort_qa', ontology_agent_key: 'cohort-qa', allowed_ontology_tools: ['query', 'list_metrics', 'graph_traversal'] },
  { name: 'dossier_drafting', display_name: 'DossierDraftingAgent', description: 'Draft P2 IRA evidence-package sections via the ira_draft_sections tool; every section carries provenance.', prompt_name: 'agent_synthesize', ontology_agent_key: 'dossier-drafting', allowed_ontology_tools: ['rag_retrieval', 'query', 'describe_schema'] },
  { name: 'targeting_strategist', display_name: 'TargetingStrategistAgent', description: 'Run the P3 weekly targeting cycle and produce call-plan narratives strictly from tool outputs.', prompt_name: 'targeting_strategy', ontology_agent_key: 'targeting-strategist', allowed_ontology_tools: ['list_metrics', 'graph_traversal', 'query'] },
  { name: 'feasibility', display_name: 'FeasibilityAgent', description: "Answer 'can this data answer this question?' from a supplied cohort estimate; deterministic heuristic verdict.", prompt_name: 'feasibility_assessment', ontology_agent_key: 'feasibility', allowed_ontology_tools: ['describe_schema', 'query'] },
];

/** Run-history entries: agent, tenant, study, status, tokens, ontology calls. */
export const agentRunFixtures: AgentRun[] = [
  {
    run_id: 'run-feas-20261007-001',
    agent_name: 'feasibility',
    tenant_id: 'acme_rare',
    study_id: 'study-acme-002',
    status: 'succeeded',
    started_at: '2026-10-07T14:55:00Z',
    finished_at: '2026-10-07T14:59:12Z',
    input_tokens: 12000,
    output_tokens: 6400,
    model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    prompt_name: 'feasibility_assessment',
    goal: 'Can this OMOP extract answer the external-control question? (fixture)',
    ontology_tool_calls: [
      { tool: 'describe_schema', args_summary: '{} (stub OMOP schema summary)', latency_ms: 42, status: 'ok' },
      { tool: 'query', args_summary: '{sparql: "SELECT … LIMIT 0"} (stub — no rows offline)', latency_ms: 58, status: 'ok' },
    ],
  },
  {
    run_id: 'run-design-20261007-002',
    agent_name: 'study_design',
    tenant_id: 'acme_rare',
    study_id: 'study-acme-001',
    status: 'succeeded',
    started_at: '2026-10-07T13:10:00Z',
    finished_at: '2026-10-07T13:12:40Z',
    input_tokens: 8200,
    output_tokens: 4100,
    model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    prompt_name: 'study_design',
    goal: 'Draft Protocol JSON for rare-disease external control (fixture)',
    ontology_tool_calls: [
      { tool: 'translate_sparql', args_summary: '{natural_language: "persons with index condition"}', latency_ms: 51, status: 'ok' },
    ],
  },
  {
    run_id: 'run-qa-20261005-003',
    agent_name: 'cohort_qa',
    tenant_id: 'beacon_bio',
    study_id: 'study-beacon-001',
    status: 'succeeded',
    started_at: '2026-10-05T08:38:00Z',
    finished_at: '2026-10-05T08:40:05Z',
    input_tokens: 6000,
    output_tokens: 3200,
    model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    prompt_name: 'cohort_qa',
    goal: 'Interrogate cohort balance (fixture balance summary)',
    ontology_tool_calls: [
      { tool: 'list_metrics', args_summary: '{} (stub metric catalog)', latency_ms: 37, status: 'ok' },
      { tool: 'graph_traversal', args_summary: '{start: "cohort_balance_smd"} (stub — empty graph offline)', latency_ms: 64, status: 'ok' },
    ],
  },
  {
    run_id: 'run-dossier-20261004-004',
    agent_name: 'dossier_drafting',
    tenant_id: 'acme_rare',
    study_id: 'study-acme-001',
    status: 'failed',
    started_at: '2026-10-04T16:20:00Z',
    finished_at: '2026-10-04T16:21:02Z',
    input_tokens: 3100,
    output_tokens: 0,
    model_id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    prompt_name: 'agent_synthesize',
    goal: 'Draft IRA sections (fixture — failed closed in LOCAL STUB mode)',
    ontology_tool_calls: [
      { tool: 'rag_retrieval', args_summary: '{question: "prior evidence"} (stub — no passages offline)', latency_ms: 49, status: 'ok' },
    ],
  },
];
