import { useEffect, useState } from 'react';
import { api, type ControlTenant, type InvoiceReport, type OffboardCheck, type UsageRecord } from '../lib/api';
import { useStore } from '../lib/store';
import { can } from '../lib/permissions';
import type { Role } from '../lib/permissions';
import { ConfirmDialog, DataTable, Meter, Modal, Pill, SectionTitle, fmtDate, fmtNum, toneForStatus, useToasts, type Column } from '../components/ui';
import { AUDIT_CATEGORIES, auditEventInfo, downloadAuditCsv } from '../lib/auditTaxonomy';
import ServiceCatalog from '../components/ServiceCatalog';

type TenantRow = {
  tenant_id: string;
  display_name: string;
  status: 'active' | 'provisioning' | 'offboarded';
  isolation: string;
  region: string;
  kms_key_id: string;
  created_at: string;
  users: number;
  datasets: number;
  active_studies: number;
  usage: ControlTenant['usage'];
};

type UsageRow = {
  id: string;
  event_type: string;
  study_id: string | null;
  quantity: number;
  unit: string;
  model_id: string | null;
  line_total_usd: number | null;
  priced: boolean;
  raw: UsageRecord;
};

function unitPriceLabel(rec: UsageRecord): string {
  if (rec.input_price_per_1m_usd != null) {
    return `$${rec.input_price_per_1m_usd}/1M input tok · $${rec.output_price_per_1m_usd}/1M output tok`;
  }
  if (rec.unit_price_ref) return rec.unit_price_ref;
  return '—';
}

const SERVICE_LABEL_BY_EVENT: Record<UsageRecord['event_type'], string> = {
  agent_invocation: 'Agent Suite',
  ontology_query: 'Ontology & Semantic Layer',
  deid_run: 'De-identification Engine',
  batch_job: 'Data Pipeline (Batch)',
};

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1'] as const;
const ISOLATION_OPTIONS: Array<{ value: ControlTenant['isolation']; label: string; blurb: string }> = [
  { value: 'pooled', label: 'Pooled', blurb: 'Shared multi-tenant SaaS — lowest cost, logical tenant isolation.' },
  { value: 'silo', label: 'Silo', blurb: 'Dedicated private silo per tenant — strongest isolation, higher cost.' },
  { value: 'client-cloud', label: 'Client-cloud', blurb: 'Deployed in the client AWS account; Evidia operates the control plane.' },
];

function suggestSlug(name: string): string {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '');
  return slug.slice(0, 32);
}

export default function ControlPlane({ tenantId: tenantIdProp, actor, role }: { tenantId?: string; actor: string; role: Role }) {
  const store = useStore();
  const { push } = useToasts();

  const [selectedId, setSelectedId] = useState<string | null>(() => tenantIdProp ?? null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provName, setProvName] = useState('');
  const [provTenantId, setProvTenantId] = useState('');
  const [provTenantIdTouched, setProvTenantIdTouched] = useState(false);
  const [provIsolation, setProvIsolation] = useState<ControlTenant['isolation']>('pooled');
  const [provRegion, setProvRegion] = useState<string>('us-east-1');
  const [provErrors, setProvErrors] = useState<{ name?: string; tenant_id?: string }>({});
  const [provSubmitting, setProvSubmitting] = useState(false);
  const [provPreloadDemo, setProvPreloadDemo] = useState(true);
  const [provStep, setProvStep] = useState<1 | 2>(1);
  const [auditCategory, setAuditCategory] = useState<string>('All');
  const [auditTenant, setAuditTenant] = useState<string>('All');
  const [auditResult, setAuditResult] = useState<string>('All');
  const [budgetMonthly, setBudgetMonthly] = useState('');
  const [budgetThreshold, setBudgetThreshold] = useState('80');
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const [offboardTenantState, setOffboardTenantState] = useState<ControlTenant | null>(null);
  const [offboardVerdict, setOffboardVerdict] = useState<OffboardCheck | null>(null);
  const [offboardChecking, setOffboardChecking] = useState(false);

  const [billingTenant, setBillingTenant] = useState('');
  const [invoice, setInvoice] = useState<InvoiceReport | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);

  const selected: ControlTenant | undefined =
    store.tenants.find((t) => t.tenant_id === selectedId) ?? store.tenants[0];
  const effectiveBillingTenant = billingTenant || store.tenants[0]?.tenant_id || '';
  const billingAllowed = can(role, 'billing:view');

  useEffect(() => {
    if (!billingAllowed || !effectiveBillingTenant) return;
    let live = true;
    setBillingLoading(true);
    Promise.all([api.getInvoiceReport(effectiveBillingTenant), api.listUsageRecords(effectiveBillingTenant)])
      .then(([inv, recs]) => {
        if (!live) return;
        setInvoice(inv);
        setUsageRecords(recs);
      })
      .catch(() => {
        if (!live) return;
        setInvoice(null);
        setUsageRecords([]);
      })
      .finally(() => {
        if (live) setBillingLoading(false);
      });
    return () => {
      live = false;
    };
  }, [billingAllowed, effectiveBillingTenant]);

  const tenantRows: TenantRow[] = store.tenants.map((t) => ({
    tenant_id: t.tenant_id,
    display_name: t.display_name,
    status: t.status,
    isolation: t.isolation,
    region: t.region,
    kms_key_id: t.kms_key_id,
    created_at: t.created_at,
    users: t.users,
    datasets: t.datasets,
    active_studies: t.active_studies,
    usage: t.usage,
  }));

  const tenantColumns: Array<Column<TenantRow>> = [
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
    { key: 'region', label: 'Region', sortValue: (r) => r.region, render: (r) => r.region },
    {
      key: 'kms',
      label: 'KMS key',
      render: (r) => <span className="mono" title={r.kms_key_id}>{r.kms_key_id.length > 30 ? `${r.kms_key_id.slice(0, 30)}…` : r.kms_key_id}</span>,
    },
    { key: 'created', label: 'Created', sortValue: (r) => r.created_at, render: (r) => fmtDate(r.created_at) },
    { key: 'users', label: 'Users', sortValue: (r) => r.users, render: (r) => fmtNum(r.users) },
    { key: 'datasets', label: 'Datasets', sortValue: (r) => r.datasets, render: (r) => fmtNum(r.datasets) },
    { key: 'studies', label: 'Studies', sortValue: (r) => r.active_studies, render: (r) => fmtNum(r.active_studies) },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => {
        const tenant = store.tenants.find((t) => t.tenant_id === r.tenant_id);
        return (
          <span className="row">
            <button type="button" className="btn btn-sm" onClick={() => setSelectedId(r.tenant_id)}>Details</button>
            {can(role, 'tenants:offboard') && tenant && tenant.status !== 'offboarded' ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                data-testid={`offboard-${r.tenant_id}`}
                onClick={() => void openOffboard(tenant)}
              >
                Offboard
              </button>
            ) : null}
          </span>
        );
      },
    },
  ];

  function openProvision() {
    setProvName('');
    setProvTenantId('');
    setProvTenantIdTouched(false);
    setProvIsolation('pooled');
    setProvRegion('us-east-1');
    setProvErrors({});
    setProvPreloadDemo(true);
    setProvStep(1);
    setProvisionOpen(true);
  }

  function onProvNameChange(value: string) {
    setProvName(value);
    if (!provTenantIdTouched) setProvTenantId(suggestSlug(value));
  }

  function validateProvision(): boolean {
    const errors: { name?: string; tenant_id?: string } = {};
    if (!provName.trim()) errors.name = 'Display name is required.';
    const slug = provTenantId.trim();
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(slug)) {
      errors.tenant_id = 'Use 3–32 chars: lowercase letter, then lowercase letters, digits, or underscores.';
    } else if (store.tenants.some((t) => t.tenant_id === slug)) {
      errors.tenant_id = 'Tenant ID already exists — choose a unique slug.';
    }
    setProvErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitProvision() {
    if (!validateProvision()) return;
    setProvSubmitting(true);
    try {
      const created = await api.provisionTenant({
        name: provName.trim(),
        tenant_id: provTenantId.trim(),
        isolation: provIsolation,
        region: provRegion,
        actor,
        preload_demo: provPreloadDemo,
      });
      setProvisionOpen(false);
      setSelectedId(created.tenant_id);
      push({ title: 'Provisioning started', body: `Tenant ${created.tenant_id} is provisioning — it will turn active in a few seconds (demo).`, tone: 'info' });
    } catch {
      push({ title: 'Provisioning failed', body: 'The demo store rejected the request. Check the form and retry.', tone: 'err' });
    } finally {
      setProvSubmitting(false);
    }
  }

  async function openOffboard(tenant: ControlTenant) {
    setOffboardTenantState(tenant);
    setOffboardVerdict(null);
    setOffboardChecking(true);
    try {
      const verdict = await api.evaluateOffboard(tenant.tenant_id);
      setOffboardVerdict(verdict);
    } catch {
      setOffboardVerdict({ allowed: false, blocked_reasons: ['Offboard evaluation failed — treated as blocked (fail-closed).'] });
    } finally {
      setOffboardChecking(false);
    }
  }

  async function confirmOffboard() {
    if (!offboardTenantState || !offboardVerdict?.allowed) return;
    try {
      await api.offboardTenant(offboardTenantState.tenant_id, actor);
      push({ title: 'Tenant offboarded', body: `${offboardTenantState.display_name} (${offboardTenantState.tenant_id}) has been offboarded (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Offboard failed', body: 'The demo store rejected the offboard request.', tone: 'err' });
    } finally {
      setOffboardTenantState(null);
      setOffboardVerdict(null);
    }
  }

  function downloadInvoice() {
    if (!invoice) return;
    const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoice.tenant_id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push({ title: 'Invoice downloaded', body: `invoice-${invoice.tenant_id}.json saved from ${actor}'s browser (demo).`, tone: 'ok' });
  }

  const usageRows: UsageRow[] = usageRecords.map((r, i) => ({
    id: `${r.timestamp_utc}-${r.event_type}-${i}`,
    event_type: r.event_type,
    study_id: r.study_id,
    quantity: r.quantity,
    unit: r.unit,
    model_id: r.model_id,
    line_total_usd: r.line_total_usd,
    priced: r.priced,
    raw: r,
  }));

  const usageColumns: Array<Column<UsageRow>> = [
    { key: 'event', label: 'Event type', sortValue: (r) => r.event_type, render: (r) => r.event_type },
    { key: 'study', label: 'Study', sortValue: (r) => r.study_id ?? '', render: (r) => (r.study_id ? <span className="mono">{r.study_id}</span> : '—') },
    { key: 'qty', label: 'Quantity', sortValue: (r) => r.quantity, render: (r) => `${fmtNum(r.quantity)} ${r.unit}` },
    { key: 'model', label: 'Model', render: (r) => (r.model_id ? <span className="mono">{r.model_id}</span> : '—') },
    { key: 'price', label: 'Unit price (demo)', render: (r) => unitPriceLabel(r.raw) },
    { key: 'total', label: 'Line total', sortValue: (r) => r.line_total_usd ?? -1, render: (r) => (r.priced && r.line_total_usd != null ? `$${r.line_total_usd.toFixed(3)}` : '—') },
    { key: 'priced', label: 'Priced', sortValue: (r) => (r.priced ? 'priced' : 'unpriced'), render: (r) => <Pill tone={r.priced ? 'ok' : 'warn'}>{r.priced ? 'priced' : 'unpriced'}</Pill> },
  ];

  const byServiceGroups = (() => {
    const groups = new Map<string, UsageRecord[]>();
    for (const rec of usageRecords) {
      const existing = groups.get(rec.event_type);
      if (existing) existing.push(rec);
      else groups.set(rec.event_type, [rec]);
    }
    return [...groups.entries()].map(([event_type, records]) => {
      const firstPriced = records.find((r) => r.priced);
      const pricedTotals = records.filter((r) => r.priced && r.line_total_usd != null);
      const lineTotal = pricedTotals.length > 0 ? pricedTotals.reduce((sum, r) => sum + (r.line_total_usd ?? 0), 0) : null;
      return {
        event_type,
        service: SERVICE_LABEL_BY_EVENT[event_type as UsageRecord['event_type']] ?? event_type,
        quantity: records.reduce((sum, r) => sum + r.quantity, 0),
        unit: records[0]?.unit ?? '',
        unitPrice: firstPriced ? unitPriceLabel(firstPriced) : '— (unpriced)',
        lineTotal,
      };
    });
  })();

  const filteredAuditEntries = store.audit.filter(
    (a) => (auditCategory === 'All' || auditEventInfo(a.action).category === auditCategory)
      && (auditTenant === 'All' || a.tenant_id === auditTenant)
      && (auditResult === 'All' || a.result === auditResult),
  );
  const filteredAudit = filteredAuditEntries.map((a) => ({ ...a }));

  const budget = store.budgets[effectiveBillingTenant] ?? null;
  const budgetSpent = invoice?.totals.priced_total_usd ?? 0;
  const budgetPct = budget && budget.monthly_usd > 0 ? Math.round((budgetSpent / budget.monthly_usd) * 100) : 0;
  const budgetAlert = budget != null && budgetPct >= budget.alert_threshold_pct;

  async function handleSaveBudget() {
    const monthly = Number(budgetMonthly);
    const threshold = Number(budgetThreshold);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      setBudgetError('Enter a positive monthly budget (USD).');
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      setBudgetError('Alert threshold must be between 1 and 100 (%).');
      return;
    }
    setBudgetError(null);
    try {
      await api.setBudget(effectiveBillingTenant, monthly, threshold, actor);
      push({ title: 'Budget saved', body: `$${monthly}/month for ${effectiveBillingTenant}, alert at ${threshold}% (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Budget failed', body: 'The demo store rejected the budget.', tone: 'err' });
    }
  }

  return (
    <section>
      <SectionTitle
        title="Control Plane"
        sub="Tenants, environments, platform services, and billing — demo control plane over the mock store."
        actions={
          can(role, 'tenants:provision') ? (
            <button type="button" className="btn btn-primary" onClick={openProvision}>Provision tenant</button>
          ) : null
        }
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Tenants</h3>
        <p className="muted">Select Details on a row for quota usage. Provisioning and offboarding are simulated locally and audited.</p>
        <DataTable rows={tenantRows} columns={tenantColumns} testId="tenant-table" rowKey={(r) => r.tenant_id} emptyText="No tenants." />
      </div>

      {selected ? (
        <div className="card" style={{ marginBottom: 14 }} data-testid="tenant-detail">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{selected.display_name}</h3>
            <Pill tone={toneForStatus(selected.status)}>{selected.status}</Pill>
          </div>
          {store.datasets.some((d) => d.tenant_id === selected.tenant_id && d.name.includes('Synthetic rare-disease demo')) ? (
            <p style={{ marginTop: 6 }}>
              <Pill tone="info" testId={`tenant-demo-data-${selected.tenant_id}`}>Demo data preloaded (R6)</Pill>
            </p>
          ) : null}
          <p className="muted">
            <span className="mono">{selected.tenant_id}</span> · {selected.isolation} · {selected.region} · created {fmtDate(selected.created_at)}
            <br />
            KMS key: <span className="mono">{selected.kms_key_id}</span>
            <br />
            {fmtNum(selected.users)} users · {fmtNum(selected.datasets)} datasets · {fmtNum(selected.active_studies)} active studies
          </p>
          <div className="grid-2">
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Datasets</span><span className="muted">{fmtNum(selected.usage.datasets)} / {fmtNum(selected.usage.datasets_quota)}</span></div>
              <Meter value={selected.usage.datasets} max={selected.usage.datasets_quota} label="Datasets usage" />
            </div>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Agent runs</span><span className="muted">{fmtNum(selected.usage.agent_runs)} / {fmtNum(selected.usage.agent_runs_quota)}</span></div>
              <Meter value={selected.usage.agent_runs} max={selected.usage.agent_runs_quota} label="Agent runs usage" />
            </div>
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Storage</span><span className="muted">{fmtNum(selected.usage.storage_gb)} GB / {fmtNum(selected.usage.storage_quota_gb)} GB</span></div>
              <Meter value={selected.usage.storage_gb} max={selected.usage.storage_quota_gb} label="Storage usage" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Audit log</h3>
        <p className="muted">Every simulated action in this console is recorded here (actor, tenant, target, result). Filter via the table search.</p>
        <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            className={auditCategory === 'All' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
            data-testid="cp-audit-cat-All"
            onClick={() => setAuditCategory('All')}
          >
            All
          </button>
          {AUDIT_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={auditCategory === category ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
              data-testid={`cp-audit-cat-${category}`}
              onClick={() => setAuditCategory(category)}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            data-testid="cp-audit-export-csv"
            onClick={() => downloadAuditCsv(filteredAuditEntries)}
          >
            Export CSV
          </button>
        </div>
        <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cp-audit-tenant">Audit tenant</label>
            <select id="cp-audit-tenant" data-testid="cp-audit-tenant" className="select input-sm" value={auditTenant} onChange={(e) => setAuditTenant(e.target.value)}>
              <option value="All">All tenants</option>
              {store.tenants.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.display_name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cp-audit-result">Result</label>
            <select id="cp-audit-result" data-testid="cp-audit-result" className="select input-sm" value={auditResult} onChange={(e) => setAuditResult(e.target.value)}>
              <option value="All">All results</option>
              <option value="success">success</option>
              <option value="blocked">blocked</option>
              <option value="info">info</option>
            </select>
          </div>
          <span className="muted">{filteredAuditEntries.length} entries</span>
        </div>
        <DataTable
          rows={filteredAudit}
          columns={[
            { key: 'at', label: 'Time', sortValue: (r) => r.at, render: (r) => fmtDate(r.at) },
            { key: 'actor', label: 'Actor', sortValue: (r) => r.actor, render: (r) => r.actor },
            { key: 'tenant', label: 'Tenant', sortValue: (r) => r.tenant_id, render: (r) => <span className="mono">{r.tenant_id}</span> },
            {
              key: 'event', label: 'Event', sortValue: (r) => auditEventInfo(r.action).event,
              render: (r) => {
                const info = auditEventInfo(r.action);
                return (
                  <span>
                    <strong>{info.label}</strong>
                    <br />
                    <span className="mono muted">{info.event}</span>
                  </span>
                );
              },
            },
            { key: 'action', label: 'Action', sortValue: (r) => r.action, render: (r) => <span className="mono">{r.action}</span> },
            { key: 'target', label: 'Target', sortValue: (r) => r.target, render: (r) => <span className="mono">{r.target}</span> },
            { key: 'detail', label: 'Detail', render: (r) => r.detail },
            { key: 'delta', label: 'Delta', render: (r) => r.delta ?? '—' },
            { key: 'result', label: 'Result', sortValue: (r) => r.result, render: (r) => <Pill tone={r.result === 'success' ? 'ok' : r.result === 'blocked' ? 'err' : 'info'}>{r.result}</Pill> },
          ]}
          rowKey={(r) => r.id}
          testId="audit-log"
          emptyText="No audit entries yet."
        />
      </div>

      <SectionTitle title="Environments" sub="CDK synthesis status per environment. Nothing is deployed yet." />
      <div className="card-grid">
        {store.environments.map((env) => (
          <article key={env.env} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ textTransform: 'capitalize' }}>{env.env}</h3>
              <Pill tone={toneForStatus(env.status)}>{env.status}</Pill>
            </div>
            <p className="muted">Last deploy: {env.last_deploy ? fmtDate(env.last_deploy) : 'Never deployed'}</p>
            <ul className="list">
              {env.modules.map((m) => (
                <li key={m.name} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono">{m.name}</span>
                  <span className="row">
                    <span className="muted">{m.version}</span>
                    <Pill tone={toneForStatus(m.status)}>{m.status}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="muted">Synthesis-verified in code; deployment pending AWS account.</p>

      <SectionTitle title="Platform services" sub="Health of the shared platform services (honest demo status)." />
      <div className="card-grid">
        {store.services.map((svc) => (
          <article key={svc.name} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{svc.name}</h3>
              <Pill tone={toneForStatus(svc.status)}>{svc.status}</Pill>
            </div>
            <p className="muted">{svc.category}</p>
            <p>{svc.detail}</p>
          </article>
        ))}
      </div>

      <SectionTitle title="Tenant services" sub="Per-tenant entitlements for the selected tenant above. Toggles gate navigation and actions immediately; every change is audited with actor + timestamp." />
      {selected ? <div style={{ marginBottom: 14 }}><ServiceCatalog tenantId={selected.tenant_id} actor={actor} canManage={can(role, 'services:manage')} /></div> : null}

      <SectionTitle title="Usage & billing" sub="Per-tenant invoice report and raw usage records (fixture pricing)." />
      {!billingAllowed ? (
        <div className="card">
          <h3>Not permitted</h3>
          <p className="muted">Your current demo role ({role}) cannot view billing. The billing:view permission is required — switch to a role that holds it (Platform Admin, Tenant Admin, Biostatistician, or Auditor) in the user menu to preview.</p>
        </div>
      ) : (
        <div className="card" data-testid="billing-summary">
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="billing-tenant">Tenant</label>
            <select id="billing-tenant" className="select" value={effectiveBillingTenant} onChange={(e) => setBillingTenant(e.target.value)}>
              {store.tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.display_name} ({t.tenant_id})</option>
              ))}
            </select>
          </div>

          {billingLoading ? <p className="muted">Loading billing…</p> : null}

          {invoice ? (
            <>
              <p className="muted">
                Period {invoice.period_start} → {invoice.period_end} · pricing {invoice.pricing_version} · {invoice.currency}
              </p>
              <div className="card-grid">
                <div className="card">
                  <div className="kpi-label">Records</div>
                  <div className="kpi-value">{fmtNum(invoice.totals.record_count)}</div>
                  <div className="muted">usage records in period</div>
                </div>
                <div className="card">
                  <div className="kpi-label">Priced total (USD)</div>
                  <div className="kpi-value">${invoice.totals.priced_total_usd.toFixed(3)}</div>
                  <div className="muted">{fmtNum(invoice.totals.priced_record_count)} priced records</div>
                </div>
                <div className="card">
                  <div className="kpi-label">Unpriced</div>
                  <div className="kpi-value">{fmtNum(invoice.totals.unpriced_record_count)}</div>
                  <div className="muted">unpriced records — quantities shown honestly, no invented prices</div>
                </div>
              </div>

              <h3>By service</h3>
              <p className="muted">Demo prices — fixture pricing ({invoice.pricing_version}), shown in-product for illustration; not a rate card.</p>
              <div data-testid="billing-by-service">
                {usageRecords.length === 0 ? (
                  <p className="muted">No usage records for this tenant yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Service</th><th>Event type</th><th>Quantity</th><th>Unit price (demo)</th><th>Line total</th></tr></thead>
                      <tbody>
                        {byServiceGroups.map((g) => (
                          <tr key={g.event_type}>
                            <td>{g.service}</td>
                            <td>{g.event_type}</td>
                            <td>{`${fmtNum(g.quantity)} ${g.unit}`}</td>
                            <td>{g.unitPrice}</td>
                            <td>{g.lineTotal != null ? `$${g.lineTotal.toFixed(3)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <h3>Usage records</h3>
              <DataTable rows={usageRows} columns={usageColumns} rowKey={(r) => r.id} emptyText="No usage records for this tenant." pageSize={8} />

              <h3 style={{ marginTop: 14 }}>By study</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Study</th><th>Records</th><th>Subtotal (USD)</th><th>Unpriced?</th></tr></thead>
                  <tbody>
                    {invoice.by_study.map((s, i) => (
                      <tr key={`${s.study_id ?? 'tenant'}-${i}`}>
                        <td>{s.study_id ? <span className="mono">{s.study_id}</span> : '(tenant-level)'}</td>
                        <td>{fmtNum(s.record_count)}</td>
                        <td>${s.subtotal_usd.toFixed(3)}</td>
                        <td>{s.has_unpriced ? 'includes unpriced' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={downloadInvoice}>Download invoice JSON</button>
                <button type="button" className="btn" data-testid="email-usage-report"
                  onClick={async () => {
                    await api.sendUsageReport(effectiveBillingTenant, actor);
                    push({ title: 'Usage report generated', body: 'Monthly usage report delivered as an in-console notification (demo — no email sent).', tone: 'ok' });
                  }}>
                  Email monthly report (demo)
                </button>
                <span className="muted">Downloads the full invoice report for {invoice.tenant_id}.</span>
              </div>

              <div style={{ marginTop: 18 }} data-testid="billing-budget">
                <h3>Budget & alerts</h3>
                <p className="muted">
                  Set a monthly budget for this tenant. The meter compares it with the priced total above;
                  crossing the alert threshold raises an alert here (and, in production, notifies operators —
                  demo: this panel only).
                </p>
                {budget ? (
                  <div style={{ marginBottom: 10 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span>Priced spend ${budgetSpent.toFixed(3)} of ${budget.monthly_usd}/month</span>
                      <span className="row">
                        <span className="muted">{budgetPct}% · alert at {budget.alert_threshold_pct}%</span>
                        {budgetAlert ? <Pill tone="err" testId="budget-alert">Budget alert</Pill> : <Pill tone="ok">Within budget</Pill>}
                      </span>
                    </div>
                    <Meter value={budgetSpent} max={budget.monthly_usd} label="Budget consumption" />
                    <p className="muted">Set by {budget.updated_by} · {fmtDate(budget.updated_at)}</p>
                  </div>
                ) : (
                  <p className="muted" data-testid="budget-unset">No budget set for this tenant yet.</p>
                )}
                <form onSubmit={(e) => { e.preventDefault(); void handleSaveBudget(); }}>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="budget-monthly">Monthly budget (USD)</label>
                      <input id="budget-monthly" data-testid="budget-monthly" className="input" type="number" min="0" step="any"
                        value={budgetMonthly} onChange={(e) => setBudgetMonthly(e.target.value)}
                        placeholder={budget ? String(budget.monthly_usd) : 'e.g. 500'} />
                    </div>
                    <div className="field">
                      <label htmlFor="budget-threshold">Alert threshold (%)</label>
                      <input id="budget-threshold" data-testid="budget-threshold" className="input" type="number" min="1" max="100"
                        value={budgetThreshold} onChange={(e) => setBudgetThreshold(e.target.value)} />
                    </div>
                  </div>
                  {budgetError ? <span className="field-error">{budgetError}</span> : null}
                  <button type="submit" className="btn btn-primary" data-testid="budget-save">Save budget</button>
                </form>
              </div>
            </>
          ) : !billingLoading ? (
            <p className="muted">No invoice report available for this tenant yet.</p>
          ) : null}
        </div>
      )}

      {provisionOpen ? (
        <Modal title={provStep === 1 ? 'Provision tenant' : 'Review tenant provisioning'} onClose={() => setProvisionOpen(false)} testId="provision-modal">
          {provStep === 2 ? (
            <div data-testid="provision-review">
              <p className="muted">Confirm what will be created. Provisioning is simulated locally; in production this drives the CDK tenant plan.</p>
              <table className="table">
                <tbody>
                  <tr><th style={{ width: '38%' }}>Display name</th><td>{provName.trim()}</td></tr>
                  <tr><th>Tenant ID</th><td className="mono">{provTenantId.trim()}</td></tr>
                  <tr><th>Isolation</th><td>{ISOLATION_OPTIONS.find((o) => o.value === provIsolation)?.label} — {ISOLATION_OPTIONS.find((o) => o.value === provIsolation)?.blurb}</td></tr>
                  <tr><th>Region</th><td>{provRegion}</td></tr>
                  <tr><th>KMS key</th><td className="mono">alias/ef-tenant-{provTenantId.trim()}-dev</td></tr>
                  <tr><th>Demo data preload</th><td>{provPreloadDemo ? 'Yes — synthetic rare-disease dataset + starter cohort (R6)' : 'No — empty workspace'}</td></tr>
                </tbody>
              </table>
              <p className="muted">Also created (simulated): per-tenant S3 prefixes, Batch queue, Cognito tenant group, default service entitlements. The tenant flips from provisioning → active in a few seconds and every step is audited.</p>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setProvStep(1)}>← Back</button>
                <button type="button" className="btn btn-primary" data-testid="provision-confirm" disabled={provSubmitting}
                  onClick={() => void submitProvision()}>
                  {provSubmitting ? 'Provisioning…' : 'Provision tenant'}
                </button>
              </div>
            </div>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (validateProvision()) setProvStep(2);
            }}
          >
            <div className="field">
              <label htmlFor="prov-name">Display name *</label>
              <input id="prov-name" className="input" value={provName} onChange={(e) => onProvNameChange(e.target.value)} placeholder="e.g. Helix Genomics" />
              {provErrors.name ? <span className="field-error">{provErrors.name}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="prov-tenant-id">Tenant ID (slug) *</label>
              <input
                id="prov-tenant-id"
                className="input mono"
                value={provTenantId}
                onChange={(e) => {
                  setProvTenantIdTouched(true);
                  setProvTenantId(e.target.value);
                }}
                placeholder="e.g. helix_genomics"
              />
              <span className="hint">Auto-suggested from the display name. Pattern: lowercase letter, then lowercase letters, digits, underscores (3–32 chars), unique across tenants.</span>
              {provErrors.tenant_id ? <span className="field-error">{provErrors.tenant_id}</span> : null}
            </div>
            <div className="field">
              <span className="hint" style={{ fontWeight: 600, color: 'var(--slate-700)', fontSize: '12.5px' }}>Isolation model</span>
              {ISOLATION_OPTIONS.map((opt) => (
                <label key={opt.value} className="row" style={{ alignItems: 'flex-start' }}>
                  <input type="radio" name="isolation" value={opt.value} checked={provIsolation === opt.value} onChange={() => setProvIsolation(opt.value)} />
                  <span><strong>{opt.label}</strong> — <span className="muted">{opt.blurb}</span></span>
                </label>
              ))}
            </div>
            <div className="field">
              <label htmlFor="prov-region">Region</label>
              <select id="prov-region" className="select" value={provRegion} onChange={(e) => setProvRegion(e.target.value)}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="row" style={{ fontWeight: 400, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  data-testid="provision-preload-demo"
                  checked={provPreloadDemo}
                  onChange={(e) => setProvPreloadDemo(e.target.checked)}
                />
                <span>Preload synthetic demo dataset (recommended) — dashboard, DQ gauge, and a starter cohort are ready on minute one</span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setProvisionOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" data-testid="provision-next">Review →</button>
            </div>
          </form>
          )}
        </Modal>
      ) : null}

      {offboardTenantState && offboardVerdict && !offboardVerdict.allowed ? (
        <Modal title={`Offboard ${offboardTenantState.display_name}?`} onClose={() => { setOffboardTenantState(null); setOffboardVerdict(null); }} testId="confirm-dialog">
          <div className="modal-body-text">
            <p>Offboarding <strong>{offboardTenantState.display_name}</strong> (<span className="mono">{offboardTenantState.tenant_id}</span>) is <strong>blocked</strong> — this guard is fail-closed, so the action cannot proceed while any reason remains:</p>
            <ul className="list">
              {offboardVerdict.blocked_reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <p className="muted">Resolve the items above (finish/export studies and datasets, stop running pipelines), then retry. No data was deleted.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => { setOffboardTenantState(null); setOffboardVerdict(null); }}>Cancel</button>
            <button type="button" className="btn btn-danger" disabled>Offboard tenant</button>
          </div>
        </Modal>
      ) : null}

      {offboardTenantState && offboardVerdict?.allowed ? (
        <ConfirmDialog
          title={`Offboard ${offboardTenantState.display_name}?`}
          body={
            <span>
              This will offboard <strong>{offboardTenantState.display_name}</strong> (<span className="mono">{offboardTenantState.tenant_id}</span>).
              The evaluation passed with no blockers: tenant data will be deleted and the KMS key scheduled for deletion (simulated in this demo). This cannot be undone.
            </span>
          }
          confirmLabel="Offboard tenant"
          danger
          onConfirm={() => void confirmOffboard()}
          onCancel={() => { setOffboardTenantState(null); setOffboardVerdict(null); }}
        />
      ) : null}

      {offboardTenantState && !offboardVerdict ? (
        <Modal title={`Offboard ${offboardTenantState.display_name}?`} onClose={() => setOffboardTenantState(null)} testId="confirm-dialog">
          <p className="muted">{offboardChecking ? 'Evaluating offboard guard…' : 'Preparing evaluation…'}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOffboardTenantState(null)}>Cancel</button>
            <button type="button" className="btn btn-danger" disabled>Offboard tenant</button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
