import { useState } from 'react';
import { api, type ControlTenant, type EngagementHealth, type EngagementPhase, type EngagementRecord } from '../lib/api';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';
import { can, type Role } from '../lib/permissions';
import { ENGAGEMENT_MILESTONES } from '../fixtures/engagements';
import ServiceCatalog from '../components/ServiceCatalog';
import { DataTable, Pill, SectionTitle, fmtDate, toneForStatus, useToasts, type Column, type Tone } from '../components/ui';

type DeliveryTenantRow = {
  tenant_id: string;
  display_name: string;
  status: ControlTenant['status'];
  isolation: ControlTenant['isolation'];
  phase: EngagementPhase | null;
  health: EngagementHealth | null;
  milestones: string;
};

const PHASE_OPTIONS: Array<{ value: EngagementPhase; label: string }> = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'data-validation', label: 'Data validation' },
  { value: 'first-study', label: 'First study' },
  { value: 'live', label: 'Live' },
];

const HEALTH_OPTIONS: Array<{ value: EngagementHealth; label: string }> = [
  { value: 'on-track', label: 'On track' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'blocked', label: 'Blocked' },
];

function toneForHealth(health: EngagementHealth): Tone {
  if (health === 'on-track') return 'ok';
  if (health === 'at-risk') return 'warn';
  return 'err';
}

export default function Delivery({ actor, role }: { actor: string; role: Role }) {
  const store = useStore();
  const { push } = useToasts();
  const { user, viewAsTenantId, breakGlassUntil, enterViewAs } = useSession();
  void user;

  const elevated = breakGlassUntil != null && breakGlassUntil > Date.now();
  const readOnly = viewAsTenantId != null && !elevated;

  const [selectedTenant, setSelectedTenant] = useState<string>('acme_rare');

  const selectedTenantRecord = store.tenants.find((t) => t.tenant_id === selectedTenant) ?? store.tenants[0];
  const engagement: EngagementRecord | null = store.engagements.find((e) => e.tenant_id === selectedTenant) ?? null;

  async function handleViewAs(row: DeliveryTenantRow) {
    const t = store.tenants.find((x) => x.tenant_id === row.tenant_id);
    if (!t) return;
    await api.startSupportSession(t.tenant_id, actor);
    enterViewAs(t.tenant_id);
    push({ title: 'Support session started', body: `Read-only view of ${t.display_name}; expires in 30 min (demo). Recorded in the tenant audit log.`, tone: 'info' });
    setSelectedTenant(t.tenant_id);
  }

  const tenantRows: DeliveryTenantRow[] = store.tenants.map((t) => {
    const eng = store.engagements.find((e) => e.tenant_id === t.tenant_id);
    return {
      tenant_id: t.tenant_id,
      display_name: t.display_name,
      status: t.status,
      isolation: t.isolation,
      phase: eng ? eng.phase : null,
      health: eng ? eng.health : null,
      milestones: eng ? `${eng.completed.length}/${eng.milestones.length}` : '—',
    };
  });

  const tenantColumns: Array<Column<DeliveryTenantRow>> = [
    {
      key: 'tenant',
      label: 'Tenant',
      sortValue: (r) => r.display_name,
      render: (r) => (
        <span>
          <strong>{r.display_name}</strong>
          <br />
          <span className="mono muted">{r.tenant_id}</span>
        </span>
      ),
    },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill> },
    { key: 'isolation', label: 'Isolation', sortValue: (r) => r.isolation, render: (r) => r.isolation },
    { key: 'phase', label: 'Phase', sortValue: (r) => r.phase ?? '', render: (r) => (r.phase ? r.phase : '—') },
    {
      key: 'health',
      label: 'Health',
      sortValue: (r) => r.health ?? '',
      render: (r) => (r.health ? <Pill tone={toneForHealth(r.health)}>{r.health}</Pill> : '—'),
    },
    { key: 'milestones', label: 'Milestones', sortValue: (r) => r.milestones, render: (r) => r.milestones },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <span className="row">
          <button
            type="button"
            className="btn btn-sm"
            data-testid={`delivery-services-${r.tenant_id}`}
            onClick={() => setSelectedTenant(r.tenant_id)}
          >
            Services
          </button>
          {viewAsTenantId === r.tenant_id ? (
            <Pill tone="warn">support session active</Pill>
          ) : can(role, 'support:viewas') && r.status !== 'offboarded' ? (
            <button
              type="button"
              className="btn btn-sm"
              data-testid={`view-as-${r.tenant_id}`}
              onClick={() => void handleViewAs(r)}
            >
              View as tenant
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  const supportSessions = store.audit.filter((a) => a.action.startsWith('support.')).slice(0, 10);

  return (
    <section data-testid="delivery-view">
      <SectionTitle title="Delivery Admin" sub="Cross-tenant delivery engagements, per-tenant services, and audited support sessions — demo data." />

      {readOnly ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <p>A read-only support session is active — engagement and service edits are paused. Use break-glass from the banner for time-boxed elevated access.</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <DataTable
          rows={tenantRows}
          columns={tenantColumns}
          testId="delivery-tenant-table"
          pageSize={8}
          rowKey={(r) => r.tenant_id}
          emptyText="No tenants."
        />
      </div>

      {engagement && selectedTenantRecord ? (
        <div className="card" data-testid="engagement-panel" style={{ marginBottom: 14 }}>
          <h3>{selectedTenantRecord.display_name} — delivery engagement</h3>
          <div className="row" style={{ alignItems: 'flex-end', gap: 16, marginTop: 12 }}>
            <div className="field" style={{ minWidth: 200, marginBottom: 0 }}>
              <label htmlFor="engagement-phase">Phase</label>
              <select
                id="engagement-phase"
                className="select"
                value={engagement.phase}
                disabled={readOnly}
                onChange={(e) => void api.setEngagementPhase(engagement.tenant_id, e.target.value as EngagementPhase, actor)}
              >
                {PHASE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200, marginBottom: 0 }}>
              <label htmlFor="engagement-health">Health</label>
              <select
                id="engagement-health"
                className="select"
                value={engagement.health}
                disabled={readOnly}
                onChange={(e) => void api.setEngagementHealth(engagement.tenant_id, e.target.value as EngagementHealth, actor)}
              >
                {HEALTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {ENGAGEMENT_MILESTONES.map((m, i) => (
              <label key={m} className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  data-testid={`milestone-${engagement.tenant_id}-${i}`}
                  checked={engagement.completed.includes(m)}
                  disabled={readOnly}
                  onChange={() => void api.toggleEngagementMilestone(engagement.tenant_id, m, actor)}
                />
                {m}
              </label>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 10 }}>Updated at {fmtDate(engagement.updated_at)}</p>
        </div>
      ) : null}

      <SectionTitle
        title={`Services — ${selectedTenantRecord ? selectedTenantRecord.display_name : selectedTenant}`}
        sub="Same catalog as Control Plane → Tenant services. Delivery Admin may toggle for any tenant."
      />
      <ServiceCatalog tenantId={selectedTenant} actor={actor} canManage={can(role, 'services:manage') && !readOnly} />

      <div className="card" data-testid="support-sessions" style={{ marginTop: 14 }}>
        <h3>Support sessions</h3>
        <p className="muted">View-as and break-glass events are written to the target tenant's audit log (Control Plane → Audit log) and listed here.</p>
        {supportSessions.length === 0 ? (
          <p className="muted">No support sessions yet.</p>
        ) : (
          <ul className="list">
            {supportSessions.map((a) => (
              <li key={a.id}>
                {fmtDate(a.at)} · {a.actor} · <span className="mono">{a.tenant_id}</span> · <span className="mono">{a.action}</span> · {a.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
