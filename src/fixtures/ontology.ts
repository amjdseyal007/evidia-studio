/**
 * Ontology fixtures — grounded in ontology/evidia-seed.ttl
 * (15 classes / 20 properties, OMOP mappings), the AWS Context
 * Ontology Accelerator (Scan→Model→Serve), and the 6 MCP tools in
 * ai/ontology_mcp.py. Demo data only.
 */

export interface OntologyClass {
  id: string;
  label: string;
  omop_mapping: string;
  instances_demo: number;
  description: string;
}
export interface OntologyProperty {
  id: string;
  label: string;
  domain: string;
  range: string;
}
export interface OntologyNamespace {
  tenant_id: string;
  namespace: string;
  classes: number;
  triples_demo: number;
  last_scan: string;
}

export const ontologyClassSeed: OntologyClass[] = [
  { id: 'ev:Study', label: 'Study', omop_mapping: '— (protocol-level)', instances_demo: 3, description: 'A clinical or observational study protocol.' },
  { id: 'ev:Patient', label: 'Patient', omop_mapping: 'OMOP PERSON', instances_demo: 128450, description: 'A de-identified person record.' },
  { id: 'ev:Cohort', label: 'Cohort', omop_mapping: 'OMOP COHORT', instances_demo: 12, description: 'A defined set of patients meeting criteria.' },
  { id: 'ev:TreatmentArm', label: 'Treatment Arm', omop_mapping: '— (study-level)', instances_demo: 7, description: 'An arm of a study, incl. synthetic/external control arms.' },
  { id: 'ev:Endpoint', label: 'Endpoint', omop_mapping: 'OMOP MEASUREMENT / OBSERVATION', instances_demo: 26, description: 'A measured outcome definition.' },
  { id: 'ev:AdverseEvent', label: 'Adverse Event', omop_mapping: 'OMOP CONDITION_OCCURRENCE', instances_demo: 8931, description: 'A recorded adverse event.' },
  { id: 'ev:Condition', label: 'Condition', omop_mapping: 'OMOP CONDITION_OCCURRENCE', instances_demo: 45210, description: 'A diagnosed condition.' },
  { id: 'ev:DrugExposure', label: 'Drug Exposure', omop_mapping: 'OMOP DRUG_EXPOSURE', instances_demo: 96477, description: 'A drug exposure interval.' },
  { id: 'ev:Procedure', label: 'Procedure', omop_mapping: 'OMOP PROCEDURE_OCCURRENCE', instances_demo: 38112, description: 'A performed procedure.' },
  { id: 'ev:Measurement', label: 'Measurement', omop_mapping: 'OMOP MEASUREMENT', instances_demo: 210904, description: 'A lab or vital measurement.' },
  { id: 'ev:Visit', label: 'Visit', omop_mapping: 'OMOP VISIT_OCCURRENCE', instances_demo: 301556, description: 'A care-site visit.' },
  { id: 'ev:EvidencePackage', label: 'Evidence Package', omop_mapping: '— (provenance)', instances_demo: 4, description: 'An audit-ready evidence dossier with Part 11 chain.' },
  { id: 'ev:DataSource', label: 'Data Source', omop_mapping: 'OMOP CDM_SOURCE', instances_demo: 5, description: 'A BYOD source system or extract.' },
  { id: 'ev:Dataset', label: 'Dataset', omop_mapping: '— (catalog)', instances_demo: 11, description: 'A bronze/silver/gold dataset in the lake.' },
  { id: 'ev:AgentRun', label: 'Agent Run', omop_mapping: '— (runtime)', instances_demo: 467, description: 'One governed agent invocation with tool-call trace.' },
];

export const ontologyPropertySeed: OntologyProperty[] = [
  { id: 'ev:hasCohort', label: 'has cohort', domain: 'ev:Study', range: 'ev:Cohort' },
  { id: 'ev:hasArm', label: 'has arm', domain: 'ev:Study', range: 'ev:TreatmentArm' },
  { id: 'ev:hasEndpoint', label: 'has endpoint', domain: 'ev:Study', range: 'ev:Endpoint' },
  { id: 'ev:memberOf', label: 'member of', domain: 'ev:Patient', range: 'ev:Cohort' },
  { id: 'ev:assignedTo', label: 'assigned to', domain: 'ev:Patient', range: 'ev:TreatmentArm' },
  { id: 'ev:hasCondition', label: 'has condition', domain: 'ev:Patient', range: 'ev:Condition' },
  { id: 'ev:exposedTo', label: 'exposed to', domain: 'ev:Patient', range: 'ev:DrugExposure' },
  { id: 'ev:underwent', label: 'underwent', domain: 'ev:Patient', range: 'ev:Procedure' },
  { id: 'ev:measuredBy', label: 'measured by', domain: 'ev:Patient', range: 'ev:Measurement' },
  { id: 'ev:hadVisit', label: 'had visit', domain: 'ev:Patient', range: 'ev:Visit' },
  { id: 'ev:experienced', label: 'experienced', domain: 'ev:Patient', range: 'ev:AdverseEvent' },
  { id: 'ev:derivedFrom', label: 'derived from', domain: 'ev:Dataset', range: 'ev:DataSource' },
  { id: 'ev:producedBy', label: 'produced by', domain: 'ev:EvidencePackage', range: 'ev:AgentRun' },
  { id: 'ev:supportsStudy', label: 'supports study', domain: 'ev:EvidencePackage', range: 'ev:Study' },
  { id: 'ev:controlFor', label: 'control for', domain: 'ev:TreatmentArm', range: 'ev:TreatmentArm' },
  { id: 'ev:harmonizedFrom', label: 'harmonized from', domain: 'ev:Dataset', range: 'ev:Dataset' },
  { id: 'ev:hasDqScore', label: 'has DQ score', domain: 'ev:Dataset', range: 'xsd:decimal' },
  { id: 'ev:signedBy', label: 'signed by', domain: 'ev:EvidencePackage', range: 'ev:Patient' },
  { id: 'ev:ranOn', label: 'ran on', domain: 'ev:AgentRun', range: 'ev:Dataset' },
  { id: 'ev:inNamespace', label: 'in namespace', domain: 'ev:Dataset', range: 'xsd:string' },
];

export const ontologyNamespaceSeed: OntologyNamespace[] = [
  { tenant_id: 'acme_rare', namespace: 'evidia/tenants/acme_rare', classes: 15, triples_demo: 1255117, last_scan: '2026-10-08T06:00:00Z' },
  { tenant_id: 'beacon_bio', namespace: 'evidia/tenants/beacon_bio', classes: 15, triples_demo: 812340, last_scan: '2026-10-08T06:05:00Z' },
  { tenant_id: 'corvus_tx', namespace: 'evidia/tenants/corvus_tx', classes: 15, triples_demo: 0, last_scan: 'never' },
];

export const pipelineStages = [
  { stage: 'Scan', detail: 'Catalog + schema discovery across tenant sources; OMOP mapping hints.', status: 'implemented' },
  { stage: 'Model', detail: 'Versioned W3C RDF/OWL ontology (v0.1.0 approved legacy; v0.2.0 full expansion in review) + tenant extensions.', status: 'implemented' },
  { stage: 'Serve', detail: 'MCP server on Bedrock AgentCore Runtime; per-agent tool allow-lists; Cognito JWT + Cedar pre-auth.', status: 'implemented' },
];

export const mcpToolSeed: Array<{ tool: string; description: string; agents: string }> = [
  { tool: 'list_metrics', description: 'List governed metrics available in the tenant namespace.', agents: 'All agents' },
  { tool: 'describe_schema', description: 'Describe ontology classes/properties before querying.', agents: 'All agents' },
  { tool: 'query', description: 'Natural-language → SPARQL query over the tenant graph.', agents: 'Cohort QA, Feasibility' },
  { tool: 'translate_sparql', description: 'Translate/validate SPARQL against the approved ontology.', agents: 'Study Design, Feasibility' },
  { tool: 'rag_retrieval', description: 'Vector retrieval over protocol + evidence documents.', agents: 'Dossier Drafting, Cohort QA' },
  { tool: 'graph_traversal', description: 'Bounded traversal for evidence provenance paths.', agents: 'Dossier Drafting, Targeting' },
  { tool: 'resolve_concept', description: 'Resolve a source code to the approved standard concept (exact or no-match, never guessed).', agents: 'Feasibility, Cohort QA' },
  { tool: 'describe_concept', description: 'Describe one concept: definition, hierarchy, mappings.', agents: 'All agents' },
  { tool: 'semantic_search', description: 'Relationship-aware search over the ontology graph.', agents: 'All agents' },
];

// =====================================================================
// Semantic layer — class hierarchy, synonyms, concept mappings,
// governance (versions + change proposals), relationship-aware search.
// Shapes mirror class/property/mapping triples so a live ontology
// service (Neptune + MCP Serve) can back them without UI changes.
// =====================================================================

/** rdfs:subClassOf edges (child -> parent); null = top-level class. */
export const classParentSeed: Record<string, string | null> = {
  'ev:Study': null,
  'ev:Patient': null,
  'ev:Cohort': null,
  'ev:TreatmentArm': 'ev:Cohort',
  'ev:Endpoint': null,
  'ev:AdverseEvent': 'ev:Condition',
  'ev:Condition': null,
  'ev:DrugExposure': null,
  'ev:Procedure': null,
  'ev:Measurement': null,
  'ev:Visit': null,
  'ev:EvidencePackage': null,
  'ev:DataSource': null,
  'ev:Dataset': null,
  'ev:AgentRun': null,
  'ev:Estimand': 'ev:Study',
  'ev:EligibilityCriterion': 'ev:Cohort',
};

/** Searchable synonyms / lay terms per class (semantic search fuel). */
export const classSynonymSeed: Record<string, string[]> = {
  'ev:Patient': ['person', 'subject', 'individual', 'participant'],
  'ev:Condition': ['diagnosis', 'disease', 'disorder', 'comorbidity'],
  'ev:Measurement': ['lab', 'laboratory', 'renal', 'kidney', 'egfr', 'creatinine', 'biomarker', 'vital'],
  'ev:DrugExposure': ['medication', 'drug', 'therapy', 'treatment exposure', 'rx'],
  'ev:Procedure': ['surgery', 'intervention', 'procedure occurrence'],
  'ev:Visit': ['encounter', 'admission', 'clinic visit', 'hospitalization'],
  'ev:TreatmentArm': ['arm', 'control arm', 'synthetic control', 'external control', 'comparator'],
  'ev:Endpoint': ['outcome', 'primary endpoint', 'secondary endpoint', 'efficacy'],
  'ev:Estimand': ['estimand', 'treatment effect', 'estimand framework', 'ich e9'],
  'ev:AdverseEvent': ['ae', 'safety event', 'side effect', 'toxicity'],
  'ev:Cohort': ['population', 'cohort definition', 'inclusion', 'exclusion'],
  'ev:Study': ['trial', 'protocol', 'investigation'],
  'ev:EvidencePackage': ['dossier', 'evidence', 'submission package', 'audit package'],
  'ev:Dataset': ['extract', 'table', 'data cut'],
  'ev:DataSource': ['source system', 'ehr', 'claims', 'registry feed'],
  'ev:AgentRun': ['agent invocation', 'ai run', 'llm run'],
  'ev:EligibilityCriterion': ['eligibility', 'inclusion criterion', 'exclusion criterion'],
};

export const ontologyExtensionClassSeed: OntologyClass[] = [
  { id: 'ev:Estimand', label: 'Estimand', omop_mapping: '— (study design, ICH E9(R1))', instances_demo: 9, description: 'The precise treatment-effect question: population, variable, intercurrent-event strategy, summary measure.' },
  { id: 'ev:EligibilityCriterion', label: 'Eligibility Criterion', omop_mapping: '— (cohort criteria)', instances_demo: 34, description: 'A single inclusion/exclusion rule evaluated against OMOP domains.' },
];

// ---------------------------------------------------------------------
// Concept mappings: source code -> standard terminology -> OMOP concept
// ---------------------------------------------------------------------
export type MappingReviewStatus = 'approved' | 'pending' | 'rejected' | 'unmapped';
export interface ConceptMapping {
  id: string;
  source_code: string;
  source_system: 'ICD-10' | 'SNOMED CT' | 'RxNorm' | 'LOINC' | 'CPT4' | 'Local';
  source_label: string;
  target_concept_id: number | null;
  target_label: string | null;
  target_vocabulary: string | null;
  omop_domain: string | null;
  confidence: number | null;
  review_status: MappingReviewStatus;
  reviewed_by: string | null;
  updated_at: string;
}

export const conceptMappingSeed: ConceptMapping[] = [
  { id: 'map-001', source_code: 'G12.1', source_system: 'ICD-10', source_label: 'Spinal muscular atrophy (SMA)', target_concept_id: 4044397, target_label: 'Spinal muscular atrophy', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.98, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-02T09:14:00Z' },
  { id: 'map-002', source_code: 'G12.21', source_system: 'ICD-10', source_label: 'Amyotrophic lateral sclerosis (ALS)', target_concept_id: 378001, target_label: 'Amyotrophic lateral sclerosis', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.97, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-02T09:20:00Z' },
  { id: 'map-003', source_code: 'G71.01', source_system: 'ICD-10', source_label: 'Duchenne muscular dystrophy', target_concept_id: 4045742, target_label: 'Duchenne muscular dystrophy', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.96, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-03T11:02:00Z' },
  { id: 'map-004', source_code: '33914-3', source_system: 'LOINC', source_label: 'Glomerular filtration rate (eGFR)', target_concept_id: 3046293, target_label: 'Glomerular filtration rate by MDRD', target_vocabulary: 'LOINC', omop_domain: 'Measurement', confidence: 0.93, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-03T11:40:00Z' },
  { id: 'map-005', source_code: '2160-0', source_system: 'LOINC', source_label: 'Creatinine [Mass/volume] in Serum', target_concept_id: 3016723, target_label: 'Creatinine [Mass/volume] in Serum or Plasma', target_vocabulary: 'LOINC', omop_domain: 'Measurement', confidence: 0.95, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-03T11:41:00Z' },
  { id: 'map-006', source_code: '191361', source_system: 'RxNorm', source_label: 'Nusinersen 12 MG Injection (Spinraza)', target_concept_id: 40171337, target_label: 'nusinersen', target_vocabulary: 'RxNorm', omop_domain: 'Drug', confidence: 0.99, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-04T08:12:00Z' },
  { id: 'map-007', source_code: 'N18.3', source_system: 'ICD-10', source_label: 'Chronic kidney disease, stage 3', target_concept_id: 192359, target_label: 'Chronic kidney disease stage 3', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.88, review_status: 'pending', reviewed_by: null, updated_at: '2026-10-07T15:22:00Z' },
  { id: 'map-008', source_code: '96413', source_system: 'CPT4', source_label: 'Chemotherapy infusion, first hour', target_concept_id: 0, target_label: null, target_vocabulary: null, omop_domain: null, confidence: null, review_status: 'unmapped', reviewed_by: null, updated_at: '2026-10-07T15:23:00Z' },
  { id: 'map-009', source_code: 'EVNT-RENAL-01', source_system: 'Local', source_label: 'Renal composite endpoint (sponsor-defined)', target_concept_id: 0, target_label: null, target_vocabulary: null, omop_domain: null, confidence: null, review_status: 'unmapped', reviewed_by: null, updated_at: '2026-10-07T15:24:00Z' },
  { id: 'map-010', source_code: 'E11.9', source_system: 'ICD-10', source_label: 'Type 2 diabetes mellitus without complications', target_concept_id: 201826, target_label: 'Type 2 diabetes mellitus', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.99, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-01T10:00:00Z' },
  { id: 'map-011', source_code: '6809', source_system: 'RxNorm', source_label: 'Metformin', target_concept_id: 1503297, target_label: 'Metformin', target_vocabulary: 'RxNorm', omop_domain: 'Drug', confidence: 0.99, review_status: 'approved', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-01T10:01:00Z' },
  { id: 'map-012', source_code: 'J44.9', source_system: 'ICD-10', source_label: 'Chronic obstructive pulmonary disease', target_concept_id: 255573, target_label: 'Chronic obstructive lung disease', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.42, review_status: 'rejected', reviewed_by: 'priya.nair@acme.example', updated_at: '2026-10-05T13:30:00Z' },
];

/**
 * Candidate dictionary for the "map new codes" interaction: known source
 * codes resolve to a standard concept; anything else comes back unmapped
 * and is flagged for human review (never silently guessed).
 */
export const mappingCandidateSeed: Record<string, Omit<ConceptMapping, 'id' | 'review_status' | 'reviewed_by' | 'updated_at'>> = {
  'G12.1': { source_code: 'G12.1', source_system: 'ICD-10', source_label: 'Spinal muscular atrophy (SMA)', target_concept_id: 4044397, target_label: 'Spinal muscular atrophy', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.98 },
  'G12.21': { source_code: 'G12.21', source_system: 'ICD-10', source_label: 'Amyotrophic lateral sclerosis (ALS)', target_concept_id: 378001, target_label: 'Amyotrophic lateral sclerosis', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.97 },
  'N18.3': { source_code: 'N18.3', source_system: 'ICD-10', source_label: 'Chronic kidney disease, stage 3', target_concept_id: 192359, target_label: 'Chronic kidney disease stage 3', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.88 },
  'E11.9': { source_code: 'E11.9', source_system: 'ICD-10', source_label: 'Type 2 diabetes mellitus without complications', target_concept_id: 201826, target_label: 'Type 2 diabetes mellitus', target_vocabulary: 'SNOMED CT', omop_domain: 'Condition', confidence: 0.99 },
  '33914-3': { source_code: '33914-3', source_system: 'LOINC', source_label: 'Glomerular filtration rate (eGFR)', target_concept_id: 3046293, target_label: 'Glomerular filtration rate by MDRD', target_vocabulary: 'LOINC', omop_domain: 'Measurement', confidence: 0.93 },
  '2160-0': { source_code: '2160-0', source_system: 'LOINC', source_label: 'Creatinine [Mass/volume] in Serum', target_concept_id: 3016723, target_label: 'Creatinine [Mass/volume] in Serum or Plasma', target_vocabulary: 'LOINC', omop_domain: 'Measurement', confidence: 0.95 },
  '191361': { source_code: '191361', source_system: 'RxNorm', source_label: 'Nusinersen 12 MG Injection (Spinraza)', target_concept_id: 40171337, target_label: 'nusinersen', target_vocabulary: 'RxNorm', omop_domain: 'Drug', confidence: 0.99 },
};

// ---------------------------------------------------------------------
// Ontology governance: versions + change proposals
// ---------------------------------------------------------------------
export interface OntologyVersion {
  version: string;
  status: 'draft' | 'in-review' | 'approved' | 'superseded' | 'rejected';
  published_at: string | null;
  author: string;
  notes: string;
  classes: number;
  properties: number;
  decided_by?: string | null;
  decided_at?: string | null;
}
export interface ChangeProposal {
  id: string;
  title: string;
  kind: 'class' | 'property' | 'mapping' | 'deprecation';
  detail: string;
  author: string;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
}

export const ontologyVersionSeed: OntologyVersion[] = [
  { version: '0.3.0-draft', status: 'draft', published_at: null, author: 'priya.nair@acme.example', notes: 'Next draft: care-site network + payer/claims concepts on top of the 0.2.0 expansion. Not agent-visible.', classes: 44, properties: 71 },
  { version: '0.2.0', status: 'in-review', published_at: null, author: 'priya.nair@acme.example', notes: 'Full ontology expansion: OMOP clinical domains + evidence/estimand + regulatory + commercial classes, SNOMED/RxNorm/LOINC/ICD mappings. Awaiting Biostatistician/Admin sign-off — agents cannot see it yet.', classes: 40, properties: 64, decided_by: null, decided_at: null },
  { version: '0.1.0', status: 'approved', published_at: '2026-09-12T09:00:00Z', author: 'amjad@evidia.example', notes: 'Approved legacy seed ontology (ontology/evidia-seed.ttl). This is the ONLY version agents see today (approved-ontology switch).', classes: 15, properties: 20 },
];

export const changeProposalSeed: ChangeProposal[] = [
  { id: 'prop-101', title: 'Add ev:Estimand class (ICH E9(R1))', kind: 'class', detail: 'New class under ev:Study with population/variable/ICE-strategy attributes so study-design agents can reference the estimand explicitly.', author: 'priya.nair@acme.example', submitted_at: '2026-10-06T10:12:00Z', status: 'pending', decided_by: null, decided_at: null },
  { id: 'prop-102', title: 'Approve renal LOINC mapping pack (7 codes)', kind: 'mapping', detail: 'eGFR, creatinine, cystatin C mappings for the renal safety endpoint workstream. All ≥0.88 confidence.', author: 'tom.alvarez@acme.example', submitted_at: '2026-10-07T09:41:00Z', status: 'pending', decided_by: null, decided_at: null },
  { id: 'prop-103', title: 'Add ev:measuredDuring property (Patient → Visit)', kind: 'property', detail: 'Lets feasibility queries bound measurements to an encounter window without graph gymnastics.', author: 'tom.alvarez@acme.example', submitted_at: '2026-10-07T14:05:00Z', status: 'pending', decided_by: null, decided_at: null },
  { id: 'prop-104', title: 'Deprecate ev:Dataset in favor of ev:DataSource zones', kind: 'deprecation', detail: 'Dataset duplicates DataSource semantics; keep Dataset as catalog alias only.', author: 'amjad@evidia.example', submitted_at: '2026-10-03T16:44:00Z', status: 'approved', decided_by: 'priya.nair@acme.example', decided_at: '2026-10-04T09:02:00Z' },
  { id: 'prop-105', title: 'Map CPT4 96413 (chemo infusion) to Procedure', kind: 'mapping', detail: 'Confidence too low (0.42) and billing-code semantics unclear; rejected pending source-system review.', author: 'tom.alvarez@acme.example', submitted_at: '2026-10-02T12:18:00Z', status: 'rejected', decided_by: 'priya.nair@acme.example', decided_at: '2026-10-05T13:31:00Z' },
];

// ---------------------------------------------------------------------
// Relationship-aware semantic search over the class/property graph.
// "renal" -> Measurement (synonym) + path Patient —measuredBy→ Measurement
// + the renal concept mappings attached to that class's OMOP domain.
// ---------------------------------------------------------------------
export interface SemanticHit {
  class_id: string;
  label: string;
  matched_on: string;
  path: string[];
  related: Array<{ class_id: string; label: string; via: string }>;
}

const DOMAIN_TO_CLASS: Record<string, string> = {
  Condition: 'ev:Condition', Drug: 'ev:DrugExposure', Measurement: 'ev:Measurement',
  Procedure: 'ev:Procedure', Visit: 'ev:Visit', Person: 'ev:Patient',
};

export function semanticSearchOntology(
  query: string,
  classes: OntologyClass[],
  properties: OntologyProperty[],
  mappings: ConceptMapping[],
): SemanticHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byId = new Map(classes.map((c) => [c.id, c]));
  const labelOf = (id: string) => byId.get(id)?.label ?? id;
  const hits: SemanticHit[] = [];
  const seen = new Set<string>();

  const pushHit = (cls: OntologyClass, matchedOn: string, path: string[]) => {
    if (seen.has(cls.id)) return;
    seen.add(cls.id);
    const related: SemanticHit['related'] = [];
    for (const p of properties) {
      if (p.domain === cls.id && byId.has(p.range)) related.push({ class_id: p.range, label: labelOf(p.range), via: p.label });
      if (p.range === cls.id && byId.has(p.domain)) related.push({ class_id: p.domain, label: labelOf(p.domain), via: `inverse of ${p.label}` });
    }
    hits.push({ class_id: cls.id, label: cls.label, matched_on: matchedOn, path, related: related.slice(0, 5) });
  };

  // 1) direct class matches (label, id, synonyms, description)
  for (const cls of classes) {
    const syns = classSynonymSeed[cls.id] ?? [];
    if (cls.label.toLowerCase().includes(q) || cls.id.toLowerCase().includes(q)) pushHit(cls, 'class label', [cls.id]);
    else if (syns.some((s) => s.includes(q) || q.includes(s))) pushHit(cls, `synonym match (${syns.find((s) => s.includes(q) || q.includes(s))})`, [cls.id]);
    else if (cls.description.toLowerCase().includes(q)) pushHit(cls, 'definition text', [cls.id]);
  }
  // 2) mapping matches -> surface the OMOP-domain class with a path
  for (const m of mappings) {
    const hay = `${m.source_code} ${m.source_label} ${m.target_label ?? ''}`.toLowerCase();
    if (!hay.includes(q)) continue;
    const classId = m.omop_domain ? DOMAIN_TO_CLASS[m.omop_domain] : undefined;
    const cls = classId ? byId.get(classId) : undefined;
    if (cls) pushHit(cls, `concept mapping ${m.source_code} (${m.source_system})`, ['ev:Patient', cls.id]);
  }
  // 3) path expansion: for the top hit, add a 2-hop path via properties
  return hits.slice(0, 8).map((h, i) => {
    if (i === 0 && h.path.length === 1) {
      const edge = properties.find((p) => p.range === h.class_id && byId.has(p.domain));
      if (edge) return { ...h, path: [edge.domain, h.class_id] };
    }
    return h;
  });
}

