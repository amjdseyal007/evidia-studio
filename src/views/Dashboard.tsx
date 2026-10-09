import { useEffect, useState } from 'react';
import { api, type InvoiceReport, type QualityResult, type StudySummary, type TenantAdminEntry } from '../lib/api';
import DqGauge from '../components/DqGauge';
import MockBanner from '../components/MockBanner';

export default function Dashboard({ tenantId }: { tenantId: string }) {
  const [tenants, setTenants] = useState<TenantAdminEntry[]>([]);
  const [dq, setDq] = useState<QualityResult | null>(null);
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [report, setReport] = useState<InvoiceReport | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.listTenants(), api.getDqResult(tenantId), api.listStudies(tenantId), api.getInvoiceReport(tenantId)]).then(
      ([t, d, s, r]) => { if (live) { setTenants(t); setDq(d); setStudies(s); setReport(r); } },
    );
    return () => { live = false; };
  }, [tenantId]);

  return (
    <section>
      <MockBanner />
      <h2>Dashboard</h2>
      <p className="muted">Tenant overview for <code>{tenantId}</code> (from the DEMO tenant claim). Fixture data only.</p>

      <div className="card-grid" data-testid="tenant-cards">
        {tenants.map((t) => (
          <article key={t.tenant_id} className="card">
            <h3>{t.display_name}</h3>
            <p><code>{t.tenant_id}</code> · {t.provisioning_status}</p>
            <p className="muted">Ontology namespace: {t.plan.resources.ontology_namespace}<br />Batch queue: {t.plan.resources.batch_queue_name}</p>
          </article>
        ))}
      </div>

      {dq ? <DqGauge result={dq} /> : <p>Loading DQ score…</p>}

      <h3>Recent studies</h3>
      {studies.length ? (
        <ul className="list" data-testid="recent-studies">
          {studies.map((s) => (
            <li key={s.study_id}><strong>{s.name}</strong> — {s.status} · updated {s.updated_at}{s.cohort_final_count != null ? ` · cohort n=${s.cohort_final_count}` : ''}</li>
          ))}
        </ul>
      ) : <p className="muted">No fixture studies for this tenant yet.</p>}

      <h3>Usage / billing summary (fixture invoice report)</h3>
      {report ? (
        <div data-testid="billing-summary">
          <p>
            Period {report.period_start} → {report.period_end} · {report.record_count} records ·{' '}
            priced total ${report.totals.priced_total_usd.toFixed(3)} {report.currency} ·{' '}
            {report.totals.unpriced_record_count} unpriced records (honest quantities, no invented prices)
          </p>
          <table className="table">
            <thead><tr><th>Study</th><th>Event</th><th>Model</th><th>Qty</th><th>Line total</th></tr></thead>
            <tbody>
              {report.line_items.map((li, i) => (
                <tr key={i}><td>{li.study_id ?? '(tenant-level)'}</td><td>{li.event_type}</td><td>{li.model_id ?? '—'}</td><td>{li.quantity.toLocaleString()} {li.unit}</td><td>{li.priced && li.line_total_usd != null ? `$${li.line_total_usd.toFixed(3)}` : 'unpriced'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>Loading billing summary…</p>}
    </section>
  );
}
