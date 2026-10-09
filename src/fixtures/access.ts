/**
 * Composable-role fixtures (R5): custom roles cloned from preset roles,
 * plus the access-request queue. Demo data only — the live platform
 * enforces roles server-side from Cognito groups; this module models the
 * admin surface for composing and granting them.
 */
import type { Permission, Role } from '../lib/permissions';

export interface CustomRoleDef {
  id: string;
  name: string;
  description: string;
  tenant_id: string;
  cloned_from: Role | null;
  permissions: Permission[];
  created_at: string;
  created_by: string;
}

export interface AccessRequest {
  id: string;
  tenant_id: string;
  /** Directory user the grant applies to on approval (null = new user). */
  user_id: string | null;
  requester_name: string;
  requester_email: string;
  /** Preset role name or custom role name being requested. */
  requested_role: string;
  is_custom: boolean;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export const customRoleSeed: CustomRoleDef[] = [
  {
    id: 'crole-evidence-reviewer',
    name: 'Evidence Reviewer',
    description: 'Reviews and signs evidence packages; no agent runs, no user admin. Cloned from Biostatistician.',
    tenant_id: 'acme_rare',
    cloned_from: 'Biostatistician',
    permissions: ['dashboard:view', 'ontology:view', 'mappings:view', 'cohorts:view', 'studies:view', 'agents:view', 'evidence:view', 'evidence:sign', 'audit:view'],
    created_at: '2026-10-05T10:00:00Z',
    created_by: 'sarah.kim@meridian.example',
  },
  {
    id: 'crole-data-ops-viewer',
    name: 'Data Ops Viewer',
    description: 'Read-only pipeline/connector observability for the platform ops rotation. Cloned from Data Engineer.',
    tenant_id: 'acme_rare',
    cloned_from: 'Data Engineer',
    permissions: ['dashboard:view', 'pipeline:view', 'connectors:view', 'ontology:view', 'mappings:view', 'studies:view', 'evidence:view', 'audit:view'],
    created_at: '2026-10-06T09:30:00Z',
    created_by: 'sarah.kim@meridian.example',
  },
];

export const accessRequestSeed: AccessRequest[] = [
  {
    id: 'areq-001',
    tenant_id: 'acme_rare',
    user_id: 'user-004',
    requester_name: 'Dana Whitfield',
    requester_email: 'dana.whitfield@acme.example',
    requested_role: 'Evidence Reviewer',
    is_custom: true,
    reason: 'Joining the dossier QA rotation — need evidence sign-off rights for study-acme-001 review.',
    status: 'pending',
    created_at: '2026-10-08T09:12:00Z',
    decided_by: null,
    decided_at: null,
  },
  {
    id: 'areq-002',
    tenant_id: 'acme_rare',
    user_id: 'user-003',
    requester_name: 'Tom Alvarez',
    requester_email: 'tom.alvarez@acme.example',
    requested_role: 'Biostatistician',
    is_custom: false,
    reason: 'Covering feasibility reviews while Priya is on leave (two weeks).',
    status: 'pending',
    created_at: '2026-10-08T11:47:00Z',
    decided_by: null,
    decided_at: null,
  },
];
