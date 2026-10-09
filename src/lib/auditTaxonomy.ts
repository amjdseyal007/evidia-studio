/**
 * Published audit taxonomy (R7) — every auditable console event has a
 * canonical event name, a human label, and a category. The demo store
 * records dot-namespaced actions; this module is the published mapping
 * (Datadog/Stripe-style named events) used by the audit views and the
 * CSV export. Canonical names follow the pattern
 * `<domain>.<object>.<verb>` (e.g. `evidence.package.signed`).
 */
import type { AuditEntry } from './store';

export interface AuditEventInfo {
  /** Canonical published event name. */
  event: string;
  label: string;
  category: string;
  description: string;
}

const E = (event: string, label: string, category: string, description: string): AuditEventInfo => ({ event, label, category, description });

/** store action -> published event info. */
export const AUDIT_TAXONOMY: Record<string, AuditEventInfo> = {
  'tenant.provision.requested': E('tenant.provision.requested', 'Tenant provisioning requested', 'Tenants', 'A new tenant (pooled/silo/client-cloud) was requested.'),
  'tenant.provision.completed': E('tenant.provision.completed', 'Tenant provisioning completed', 'Tenants', 'Tenant KMS key, buckets, Batch queue, and Cognito group ready.'),
  'tenant.demo_data.seeded': E('tenant.demo_data.seeded', 'Demo dataset preloaded', 'Tenants', 'Synthetic rare-disease demo dataset + starter cohort seeded at provisioning (onboarding first-evidence).'),
  'tenant.offboard.attempt': E('tenant.offboard.attempted', 'Tenant offboard attempted', 'Tenants', 'Offboard evaluation ran (dry-run).'),
  'tenant.offboard.blocked': E('tenant.offboard.blocked', 'Tenant offboard blocked', 'Tenants', 'Fail-closed guard stopped offboarding; reasons recorded.'),
  'tenant.offboard.completed': E('tenant.offboard.completed', 'Tenant offboarded', 'Tenants', 'Tenant data deleted and KMS key scheduled for deletion.'),
  'user.invited': E('user.invited', 'User invited', 'Access', 'A user was invited with a role.'),
  'user.deactivated': E('user.deactivated', 'User deactivated', 'Access', 'User can no longer sign in.'),
  'user.reactivated': E('user.reactivated', 'User reactivated', 'Access', 'User sign-in restored.'),
  'user.role.changed': E('user.role.changed', 'User role changed', 'Access', 'Preset role assignment changed.'),
  'user.custom_role.assigned': E('user.custom_role.assigned', 'Custom role assigned', 'Access', 'A composed (custom) role was assigned to the user.'),
  'role.custom.created': E('role.custom.created', 'Custom role created', 'Access', 'A cloned/edited custom role was created.'),
  'role.custom.updated': E('role.custom.updated', 'Custom role updated', 'Access', 'Custom role permissions or metadata changed.'),
  'role.custom.deleted': E('role.custom.deleted', 'Custom role deleted', 'Access', 'Custom role removed; assignees fall back to their preset role.'),
  'access.requested': E('access.requested', 'Access requested', 'Access', 'A user requested a role (preset or custom).'),
  'access.request.approved': E('access.request.approved', 'Access request approved', 'Access', 'Requested role granted to the user.'),
  'access.request.rejected': E('access.request.rejected', 'Access request rejected', 'Access', 'Requested role not granted.'),
  'team.created': E('team.created', 'Team created', 'Teams', 'A tenant team was created with scoped access.'),
  'team.deleted': E('team.deleted', 'Team deleted', 'Teams', 'Team grouping removed; member accounts unaffected.'),
  'team.member.added': E('team.member.added', 'Team member added', 'Teams', 'User added to a team.'),
  'team.member.removed': E('team.member.removed', 'Team member removed', 'Teams', 'User removed from a team.'),
  'team.role.changed': E('team.role.changed', 'Team role changed', 'Teams', 'Team-level role changed.'),
  'pipeline.run.started': E('pipeline.run.started', 'Pipeline run started', 'Pipeline', 'Ingest → de-id → OMOP → DQ → gold run started.'),
  'pipeline.run.completed': E('pipeline.run.completed', 'Pipeline run completed', 'Pipeline', 'Run finished; DQ score recorded.'),
  'dataset.registered': E('dataset.registered', 'Dataset registered', 'Pipeline', 'A dataset was added to the tenant catalog.'),
  'connector.created': E('connector.created', 'Connector created', 'Connectors', 'A source connector was added.'),
  'connector.test': E('connector.test.completed', 'Connector test completed', 'Connectors', 'Connection test result with latency.'),
  'connector.enabled': E('connector.enabled', 'Connector enabled', 'Connectors', 'Connector turned on for the tenant.'),
  'connector.disabled': E('connector.disabled', 'Connector disabled', 'Connectors', 'Connector turned off for the tenant.'),
  'connector.deleted': E('connector.deleted', 'Connector deleted', 'Connectors', 'Connector removed.'),
  'cohort.saved': E('cohort.saved', 'Cohort saved', 'Cohorts', 'A cohort definition was saved to the library.'),
  'cohort.deleted': E('cohort.deleted', 'Cohort deleted', 'Cohorts', 'A saved cohort was removed.'),
  'agent.run.started': E('agent.run.started', 'Agent run started', 'Agents', 'A governed agent invocation started (ontology-pinned).'),
  'study.created': E('study.created', 'Study created', 'Studies', 'A study record was created.'),
  'study.classified': E('study.classified', 'Study classified', 'Studies', 'Standard vs Regulatory classification set; Regulatory pins the approved ontology version and locks retention.'),
  'evidence.signed': E('evidence.package.signed', 'Evidence package signed', 'Evidence', 'A Part 11 signature was appended to the hash chain.'),
  'evidence.package.exported': E('evidence.package.exported', 'Evidence package exported', 'Evidence', 'A read-only, fingerprint-verifiable evidence export was generated (metadata, methods, ontology version, code, audit trail, QMS summary).'),
  'ontology.mapping.run': E('ontology.mapping.run', 'Concept mapping run', 'Ontology', 'Source codes resolved to standard concepts; unmapped flagged, never guessed.'),
  'ontology.mapping.approved': E('ontology.mapping.approved', 'Concept mapping approved', 'Ontology', 'A mapping entered the approved set.'),
  'ontology.mapping.rejected': E('ontology.mapping.rejected', 'Concept mapping rejected', 'Ontology', 'A mapping was rejected at review.'),
  'ontology.proposal.submitted': E('ontology.proposal.submitted', 'Ontology change proposed', 'Ontology', 'A class/property/mapping change was proposed (draft only).'),
  'ontology.proposal.approved': E('ontology.proposal.approved', 'Ontology proposal approved', 'Ontology', 'Proposal approved into the next draft version.'),
  'ontology.proposal.rejected': E('ontology.proposal.rejected', 'Ontology proposal rejected', 'Ontology', 'Proposal rejected at governance review.'),
  'ontology.version.approved': E('ontology.version.approved', 'Ontology version approved', 'Ontology', 'Sign-off complete: this version becomes the only agent-visible ontology; the previous approved version is superseded.'),
  'ontology.version.rejected': E('ontology.version.rejected', 'Ontology version rejected', 'Ontology', 'Sign-off declined: version stays invisible to agents.'),
  'service.enabled': E('service.enabled', 'Service enabled', 'Services', 'A platform service was enabled for the tenant.'),
  'service.disabled': E('service.disabled', 'Service disabled', 'Services', 'A platform service was disabled for the tenant (impact preview confirmed).'),
  'service.agent.enabled': E('service.agent.enabled', 'Agent enabled', 'Services', 'An individual agent was enabled for the tenant.'),
  'service.agent.disabled': E('service.agent.disabled', 'Agent disabled', 'Services', 'An individual agent was disabled for the tenant.'),
  'delivery.phase.changed': E('delivery.phase.changed', 'Delivery phase changed', 'Delivery & support', 'Engagement phase moved (onboarding → validation → first study → live).'),
  'delivery.health.changed': E('delivery.health.changed', 'Delivery health changed', 'Delivery & support', 'Engagement health status updated by Delivery.'),
  'delivery.milestone.updated': E('delivery.milestone.updated', 'Delivery milestone updated', 'Delivery & support', 'An onboarding milestone was checked/unchecked.'),
  'support.view_as.started': E('delivery.view_as.started', 'Support view-as started', 'Delivery & support', 'Evidia Delivery entered a read-only, time-boxed view-as session; logged in both audit views.'),
  'support.view_as.ended': E('delivery.view_as.ended', 'Support view-as ended', 'Delivery & support', 'View-as session ended or expired.'),
  'support.break_glass.activated': E('delivery.break_glass.activated', 'Break-glass activated', 'Delivery & support', 'Time-boxed elevated access (15 min) with reason recorded; critical notification raised.'),
  'apikey.created': E('apikey.created', 'API key created', 'API keys', 'A scoped service-account key was created; secret shown once.'),
  'apikey.revoked': E('apikey.revoked', 'API key revoked', 'API keys', 'Key immediately stops working.'),
};

export function auditEventInfo(action: string): AuditEventInfo {
  const known = AUDIT_TAXONOMY[action];
  if (known) return known;
  const label = action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return { event: action, label, category: 'System', description: 'Event recorded by the demo store.' };
}

export const AUDIT_CATEGORIES: string[] = [...new Set(Object.values(AUDIT_TAXONOMY).map((i) => i.category))].sort();

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV export of audit rows (published event name + raw action + delta). */
export function auditToCsv(rows: AuditEntry[]): string {
  const head = ['timestamp_utc', 'event', 'action', 'category', 'actor', 'tenant_id', 'target', 'result', 'delta', 'detail'];
  const lines = rows.map((r) => {
    const info = auditEventInfo(r.action);
    return [r.at, info.event, r.action, info.category, r.actor, r.tenant_id, r.target, r.result, r.delta ?? '', r.detail]
      .map((v) => csvCell(String(v)))
      .join(',');
  });
  return [head.join(','), ...lines].join('\n');
}

export function downloadAuditCsv(rows: AuditEntry[], filename = 'audit-export.csv'): void {
  const blob = new Blob([auditToCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
