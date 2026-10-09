/**
 * Tenant team fixtures for the enterprise console.
 *
 * All demo data. Teams group existing fixture users under a tenant with
 * a demo role and scoped dataset/study access lists; ids reference the
 * user, dataset, and study fixtures.
 */
import type { Role } from '../lib/permissions';

export interface TeamRecord {
  team_id: string;
  tenant_id: string;
  name: string;
  description: string;
  role: Role;
  member_ids: string[];
  access_datasets: string[];
  access_studies: string[];
  created_at: string;
}

export const teamSeed: TeamRecord[] = [
  {
    team_id: 'team-clinical-science',
    tenant_id: 'acme_rare',
    name: 'Clinical Science',
    description: 'Biostatistics team running studies over the Acme claims cohort.',
    role: 'Biostatistician',
    member_ids: ['user-002'],
    access_datasets: ['ds-acme-claims'],
    access_studies: ['study-acme-001'],
    created_at: '2026-09-15T09:15:00Z',
  },
  {
    team_id: 'team-data-engineering',
    tenant_id: 'acme_rare',
    name: 'Data Engineering',
    description: 'Engineering team landing and harmonizing Acme source extracts.',
    role: 'Data Engineer',
    member_ids: ['user-003'],
    access_datasets: ['ds-acme-ehr', 'ds-acme-ref'],
    access_studies: [],
    created_at: '2026-09-16T11:45:00Z',
  },
  {
    team_id: 'team-registry-ops',
    tenant_id: 'beacon_bio',
    name: 'Registry Operations',
    description: 'Operations team maintaining the Beacon disease registry feed.',
    role: 'Data Engineer',
    member_ids: ['user-005'],
    access_datasets: ['ds-beacon-registry'],
    access_studies: ['study-beacon-001'],
    created_at: '2026-09-29T10:15:00Z',
  },
];
