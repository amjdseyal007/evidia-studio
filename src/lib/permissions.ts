/**
 * Demo RBAC — roles, permission matrix, and the `can()` gate.
 *
 * This is a client-side demonstration seam: it mirrors the Cognito-group
 * based authorization the real platform enforces server-side
 * (`tenant-<id>` groups + role groups). Nothing here is a security
 * boundary; the UI labels it DEMO wherever role switching appears.
 */

export const ROLES = ['Platform Admin', 'Tenant Admin', 'Data Engineer', 'Biostatistician', 'Auditor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard:view',
  'pipeline:view',
  'pipeline:run',
  'connectors:view',
  'connectors:manage',
  'ontology:view',
  'ontology:manage',
  'ontology:approve',
  'mappings:view',
  'mappings:manage',
  'cohorts:view',
  'cohorts:edit',
  'studies:view',
  'agents:view',
  'agents:run',
  'evidence:view',
  'evidence:sign',
  'controlplane:view',
  'audit:view',
  'tenants:provision',
  'tenants:offboard',
  'billing:view',
  'users:view',
  'users:manage',
  'settings:manage',
  'apikeys:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Role[] = ['Platform Admin', 'Tenant Admin', 'Data Engineer', 'Biostatistician', 'Auditor'];

const MATRIX: Record<Permission, Role[]> = {
  'dashboard:view': ALL,
  'pipeline:view': ALL,
  'pipeline:run': ['Platform Admin', 'Tenant Admin', 'Data Engineer'],
  'connectors:view': ['Platform Admin', 'Tenant Admin', 'Data Engineer', 'Biostatistician'],
  'connectors:manage': ['Platform Admin', 'Tenant Admin', 'Data Engineer'],
  'ontology:view': ALL,
  'ontology:manage': ['Platform Admin', 'Tenant Admin', 'Data Engineer', 'Biostatistician'],
  'ontology:approve': ['Platform Admin', 'Tenant Admin', 'Biostatistician'],
  'mappings:view': ALL,
  'mappings:manage': ['Platform Admin', 'Tenant Admin', 'Data Engineer', 'Biostatistician'],
  'cohorts:view': ALL,
  'cohorts:edit': ['Platform Admin', 'Tenant Admin', 'Biostatistician'],
  'studies:view': ALL,
  'agents:view': ALL,
  'agents:run': ['Platform Admin', 'Tenant Admin', 'Biostatistician'],
  'evidence:view': ALL,
  'evidence:sign': ['Platform Admin', 'Biostatistician'],
  'controlplane:view': ['Platform Admin', 'Tenant Admin'],
  'audit:view': ALL,
  'tenants:provision': ['Platform Admin'],
  'tenants:offboard': ['Platform Admin'],
  'billing:view': ['Platform Admin', 'Tenant Admin', 'Biostatistician', 'Auditor'],
  'users:view': ['Platform Admin', 'Tenant Admin', 'Auditor'],
  'users:manage': ['Platform Admin', 'Tenant Admin'],
  'settings:manage': ['Platform Admin', 'Tenant Admin'],
  'apikeys:manage': ['Platform Admin', 'Tenant Admin', 'Data Engineer'],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

/** Cognito group names each role maps to (mirrors infra identity module). */
export function cognitoGroupsFor(role: Role, tenantId: string): string[] {
  return [`tenant-${tenantId}`, `role-${role.toLowerCase().replace(/\s+/g, '-')}`];
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard:view': 'View dashboard',
  'pipeline:view': 'View data pipeline',
  'pipeline:run': 'Run pipeline jobs',
  'connectors:view': 'View connectors',
  'connectors:manage': 'Manage connectors',
  'ontology:view': 'View ontology & semantic layer',
  'ontology:manage': 'Propose ontology changes',
  'ontology:approve': 'Approve ontology changes',
  'mappings:view': 'View concept mappings',
  'mappings:manage': 'Run/review concept mappings',
  'cohorts:view': 'View cohorts',
  'cohorts:edit': 'Edit cohorts',
  'studies:view': 'View products & studies',
  'agents:view': 'View agents',
  'agents:run': 'Run agents',
  'evidence:view': 'View evidence & audit',
  'evidence:sign': 'Sign evidence (Part 11)',
  'controlplane:view': 'View control plane',
  'audit:view': 'View audit log',
  'tenants:provision': 'Provision tenants',
  'tenants:offboard': 'Offboard tenants',
  'billing:view': 'View usage & billing',
  'users:view': 'View users & access',
  'users:manage': 'Manage users',
  'settings:manage': 'Manage tenant settings',
  'apikeys:manage': 'Manage API keys',
};
