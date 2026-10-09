import type { EvidencePackage } from '../lib/api';

/**
 * Evidence package fixture: provenance chain dataset → de-id gate →
 * DQ checks → study run → dossier, plus governance/part11.py
 * SignatureRecord dicts (sequence, signer_*, tenant_id, meaning,
 * attestation, artifact_sha256, signed_at_utc, previous_hash,
 * record_hash). Hashes below are fixture strings, not real digests
 * of any artifact.
 */
export const evidenceFixture: EvidencePackage = {
  study_id: 'study-acme-001',
  tenant_id: 'acme_rare',
  title: 'Evidence package — study-acme-001 (fixture)',
  chain: [
    { stage: 'dataset', label: 'Dataset ingested (fixture OMOP extract)', status: 'complete', at: '2026-10-06T09:58:00Z', detail: 's3://ef-bronze-dev/tenants/acme_rare/fixture-extract/ — synthetic rows only' },
    { stage: 'deid_gate', label: 'De-identification gate (silver → gold)', status: 'complete', at: '2026-10-06T10:00:00Z', detail: 'deid_run fixture: 40,870 rows processed; Safe Harbor gate default ON' },
    { stage: 'dq_checks', label: 'Data-quality checks', status: 'complete', at: '2026-10-07T14:22:00Z', detail: 'DQ run dq_fixture_acme_001 — score 86.5/100 (47 pass, 6 warn, 2 fail of 55)' },
    { stage: 'study_run', label: 'Study run (feasibility + cohort)', status: 'complete', at: '2026-10-07T14:59:12Z', detail: 'Agent run run-feas-20261007-001 — cohort final count 187 (fixture count)' },
    { stage: 'dossier', label: 'Dossier drafted', status: 'pending_review', at: '2026-10-07T16:05:00Z', detail: 'Dossier sections drafted (fixture); awaiting Part 11 sign-off below' },
  ],
  signatures: [
    {
      sequence: 0,
      signer_id: 'biostat@acme-rare.example',
      signer_name: 'Fixture Biostatistician',
      signer_role: 'biostatistician',
      tenant_id: 'acme_rare',
      meaning: 'approved for release',
      attestation: 'I attest this fixture evidence package was reviewed (demo attestation).',
      artifact_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signed_at_utc: '2026-10-07T16:20:00Z',
      previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
      record_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      sequence: 1,
      signer_id: 'pi@acme-rare.example',
      signer_name: 'Fixture Principal Investigator',
      signer_role: 'principal_investigator',
      tenant_id: 'acme_rare',
      meaning: 'approved for release',
      attestation: 'I attest to the fixture dossier contents (demo attestation).',
      artifact_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signed_at_utc: '2026-10-07T16:45:00Z',
      previous_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      record_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
  ],
  chain_intact: true,
  chain_head_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
};
