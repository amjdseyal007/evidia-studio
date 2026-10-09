import type { AtlasDocument, CohortCountResult, CohortDefinition } from '../lib/api';

/** Sample definition in the engine/cohort_schema.json shape. */
export const sampleCohortDefinition: CohortDefinition = {
  name: 'Rare disease external-control cohort (fixture)',
  description: 'Synthetic fixture definition — counts describe fictional data only.',
  concept_sets: [
    {
      id: 0,
      name: 'Index condition (fixture)',
      domain: 'Condition',
      concepts: [
        { concept_id: 201826, concept_name: 'Type 2 diabetes mellitus (fixture label)', domain_id: 'Condition', vocabulary_id: 'SNOMED', concept_code: '44054006', standard_concept: 'S', include_descendants: true, include_mapped: false, is_excluded: false },
      ],
    },
    {
      id: 1,
      name: 'Index drug (fixture)',
      domain: 'Drug',
      concepts: [
        { concept_id: 1503297, concept_name: 'Metformin (fixture label)', domain_id: 'Drug', vocabulary_id: 'RxNorm', concept_code: '6809', standard_concept: 'S', include_descendants: false, include_mapped: false, is_excluded: false },
      ],
    },
  ],
  primary_criteria: [{ concept_set_id: 0, domain: 'Condition' }],
  entry_observation_window: { prior_days: 365, post_days: 0 },
  inclusion_rules: [
    { name: 'Age 18–75 at index', type: 'ALL', age_min: 18, age_max: 75, gender_concept_ids: [], min_prior_observation_days: 365, min_post_observation_days: null, criteria: [] },
    { name: 'Index drug exposure recorded', type: 'ALL', age_min: null, age_max: null, gender_concept_ids: [], min_prior_observation_days: null, min_post_observation_days: null, criteria: [{ concept_set_id: 1, domain: 'Drug' }] },
  ],
  end_strategy: { strategy_type: 'observation_end', date_offset_days: null, drug_concept_set_id: null, gap_days: null, era_length_days: null },
  collapse_settings: { collapse_type: 'ERA', era_pad_days: 0 },
  qualified_limit: 'First',
  expression_limit: 'First',
};

/** count_cohort() result shape (engine/cohort.py) on synthetic rows. */
export const cohortCountFixture: CohortCountResult = {
  total_persons: 1200,
  entry_count: 412,
  final_count: 187,
  person_ids: [1001, 1002, 1003],
  attrition: [
    { step: 'entry (primary criteria)', n_remaining: 412, n_excluded: 38 },
    { step: 'inclusion rule: Age 18–75 at index', n_remaining: 296, n_excluded: 116 },
    { step: 'inclusion rule: Index drug exposure recorded', n_remaining: 187, n_excluded: 109 },
  ],
  data_note: 'Counts computed on caller-supplied rows only; on synthetic rows these describe fictional data, not real epidemiology.',
  synthetic_disclosure: true,
};

/** ATLAS export document shape (engine/cohort.py::to_atlas_json). */
export const atlasExportFixture: AtlasDocument = {
  name: sampleCohortDefinition.name,
  description: sampleCohortDefinition.description,
  ConceptSets: [
    {
      id: 0,
      name: 'Index condition (fixture)',
      expression: {
        items: [
          {
            concept: { CONCEPT_ID: 201826, CONCEPT_NAME: 'Type 2 diabetes mellitus (fixture label)', STANDARD_CONCEPT: 'S', INVALID_REASON: 'V', CONCEPT_CODE: '44054006', DOMAIN_ID: 'Condition', VOCABULARY_ID: 'SNOMED', CONCEPT_CLASS_ID: '' },
            isExcluded: false,
            includeDescendants: true,
            includeMapped: false,
          },
        ],
      },
    },
    {
      id: 1,
      name: 'Index drug (fixture)',
      expression: {
        items: [
          {
            concept: { CONCEPT_ID: 1503297, CONCEPT_NAME: 'Metformin (fixture label)', STANDARD_CONCEPT: 'S', INVALID_REASON: 'V', CONCEPT_CODE: '6809', DOMAIN_ID: 'Drug', VOCABULARY_ID: 'RxNorm', CONCEPT_CLASS_ID: '' },
            isExcluded: false,
            includeDescendants: false,
            includeMapped: false,
          },
        ],
      },
    },
  ],
  PrimaryCriteria: {
    CriteriaList: [{ ConditionOccurrence: { CodesetId: 0 } }],
    ObservationWindow: { PriorDays: 365, PostDays: 0 },
    PrimaryCriteriaLimit: { Type: 'First' },
  },
  InclusionRules: [
    {
      id: 0,
      name: 'Age 18–75 at index',
      expression: {
        Type: 'ALL',
        CriteriaList: [],
        DemographicCriteriaList: [{ Age: { Op: 'bt', Value: 18, Extent: 75 } }],
        Groups: [],
        ObservationWindow: { PriorDays: 365, PostDays: 0 },
      },
    },
    {
      id: 1,
      name: 'Index drug exposure recorded',
      expression: {
        Type: 'ALL',
        CriteriaList: [{ DrugExposure: { CodesetId: 1 } }],
        DemographicCriteriaList: [],
        Groups: [],
      },
    },
  ],
  QualifiedLimit: { Type: 'First' },
  ExpressionLimit: { Type: 'First' },
  EndStrategy: {},
  CensoringCriteria: [],
  CollapseSettings: { CollapseType: 'ERA', EraPad: 0 },
};
