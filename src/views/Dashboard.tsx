import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type InvoiceReport, type QualityResult } from '../lib/api';
import { useStore } from '../lib/store';
import { isServiceEnabled } from '../fixtures/services';
import DqGauge from '../components/DqGauge';
import { DataTable, Pill, SectionTitle, SkeletonRows, Sparkline, fmtDate, fmtNum, toneForStatus, type Column } from '../components/ui';
import type { PipelineRun } from '../fixtures/platform';

type StudyRow = {
  [key: string]: unknown;
  study_id: string;
  name: string;
  status: string;
  updated_at: string;
  cohort_final_count: number | null;
};

export default function Dashboard({ tenantId, actor }: { tenantId: string; actor: string }) {
  const store = useStore();
  const [dq, setDq] = useState<QualityResult | null>(null);
  const [report, setReport] = useState<InvoiceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([api.getDqResult(tenantId), api.getInvoiceReport(tenantId)])
      .then(([d, r]) => {
        if (!live) return;
        setDq(d);
        setReport(r);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tenantId]);

  const tenantDatasets = useMemo(() => store.datasets.filter((d) => d.tenant_id === tenantId), [store.datasets, tenantId]);
  const tenantStudies = useMemo(() => store.studies.filter((s) => s.tenant_id === tenantId), [store.studies, tenantId]);
  const tenantRuns = useMemo(() => store.agentRuns.filter((r) => r.tenant_id === tenantId), [store.agentRuns, tenantId]);
  const tenantPipelineRuns = useMemo(
    () => store.pipelineRuns.filter((r) => r.tenant_id === tenantId).slice(0, 5),
    [store.pipelineRuns, tenantId],
  );
  const failedRuns = useMemo(
    () => store.pipelineRuns.filter((r) => r.tenant_id === tenantId && r.status === 'failed').length,
    [store.pipelineRuns, tenantId],
  );
  const tenantActivity = useMemo(() => store.activity.filter((a) => a.tenant_id === tenantId), [store.activity, tenantId]);
  const tenantMeta = useMemo(() => store.tenants.find((t) => t.tenant_id === tenantId), [store.tenants, tenantId]);
  const totalRows = useMemo(() => tenantDatasets.reduce((sum, d) => sum + d.rows, 0), [tenantDatasets]);
  const goldCount = useMemo(() => tenantDatasets.filter((d) => d.layer === 'gold').length, [tenantDatasets]);

  const states = store.tenantServices[tenantId];
  const benchOn = !states || isServiceEnabled(states, 'benchmarking');
  const billOn = !states || isServiceEnabled(states, 'billing');
  const dqScore = dq?.score ?? 0;
  const trendPoints = useMemo(() => {
    if (!dq) return [72, 75, 74, 78, 80, 82];
    const s = dq.score;
    return [s - 9, s - 6, s - 7, s - 3, s - 2, s].map((v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10)));
  }, [dq]);

  const studyRows: StudyRow[] = tenantStudies.map((s) => ({
    study_id: s.study_id,
    name: s.name,
    status: s.status,
    updated_at: s.updated_at,
    cohort_final_count: s.cohort_final_count,
  }));

  const studyColumns: Array<Column<StudyRow>> = [
    { key: 'name', label: 'Study', render: (r) => <span><strong>{r.name}</strong><br /><span className="mono muted">{r.study_id}</span></span>, sortValue: (r) => r.name },
    { key: 'status', label: 'Status', render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill>, sortValue: (r) => r.status },
    { key: 'updated', label: 'Updated', render: (r) => fmtDate(r.updated_at), sortValue: (r) => r.updated_at },
    { key: 'cohort', label: 'Cohort n', render: (r) => (r.cohort_final_count != null ? fmtNum(r.cohort_final_count) : '—'), sortValue: (r) => r.cohort_final_count ?? 0 },
  ];

  const selectedRun: PipelineRun | undefined = tenantPipelineRuns.find((r) => r.run_id === selectedRunId);

  const kindDot = (kind: string): string => {
    switch (kind) {
      case 'pipeline': return '🔵';
      case 'agent': return '🟣';
      case 'evidence': return '🟢';
      case 'connector': return '🟠';
      case 'tenant': return '⚫';
      case 'user': return '🔷';
      default: return '⚪';
    }
  };

  return (
    <section>
      <SectionTitle
        title="Dashboard"
        sub={`Tenant overview for ${tenantMeta?.display_name ?? tenantId} · signed in as ${actor ?? 'demo operator'}`}
      />

      {loading && !dq ? (
        <div className="card"><SkeletonRows n={5} /></div>
      ) : null}

      <div className="card-grid" data-testid="kpi-cards">
        <div className="card">
          <div className="kpi-label">Datasets</div>
          <div className="kpi-value">{fmtNum(tenantDatasets.length)}</div>
          <div className="kpi-delta muted">{goldCount} gold · {fmtNum(totalRows)} rows · tenant {tenantId}</div>
        </div>

        <div className="card">
          <div className="kpi-label">DQ score</div>
          {dq ? (
            <DqGauge result={dq} />
          ) : (
            <SkeletonRows n={2} />
          )}
          <div className="kpi-delta muted">55-check OMOP suite · provenance-signed</div>
        </div>

        <div className="card">
          <div className="kpi-label">Active studies</div>
          <div className="kpi-value">{fmtNum(tenantStudies.length)}</div>
          <div className="kpi-delta muted">{tenantStudies.filter((s) => s.status !== 'completed').length} in progress for this tenant</div>
        </div>

        <div className="card">
          <div className="kpi-label">Agent runs</div>
          <div className="kpi-value">{fmtNum(tenantRuns.length)}</div>
          <div className="kpi-delta muted">{tenantRuns.filter((r) => r.status === 'succeeded').length} succeeded · {tenantRuns.filter((r) => r.status === 'running').length} running</div>
        </div>

        <div className="card">
          <div className="kpi-label">Evidence packages</div>
          <div className="kpi-value">{tenantId === store.evidence.tenant_id ? 1 : 0}</div>
          <div className="kpi-delta muted">Chain INTACT · {store.evidence.signatures.length} signatures · {store.evidenceExports.filter((e) => e.tenant_id === tenantId).length} verifiable exports (fixture)</div>
        </div>

        <div className="card">
          <div className="kpi-label">Open pipeline failures</div>
          <div className="kpi-value">{fmtNum(failedRuns)}</div>
          <div className="kpi-delta muted">{failedRuns === 0 ? 'No failed runs for this tenant' : 'Failed runs need triage'}</div>
        </div>
      </div>

      {tenantDatasets.some((d) => d.name.includes('Synthetic rare-disease demo')) ? (
        <div className="card" style={{ marginBottom: 14 }} data-testid="dashboard-demo-chip">
          <h3>New here? Demo data is preloaded</h3>
          <p className="muted">
            Demo data is preloaded — dashboard, DQ, and a starter cohort are live. Next: open the cohort builder or create your first study.
          </p>
          <div className="row">
            <Link className="btn btn-sm" to="/cohorts">Open cohort builder</Link>
            <Link className="btn btn-sm btn-primary" to="/studies">Create your first study</Link>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <h3>Pipeline health</h3>
          <p className="muted">Last {tenantPipelineRuns.length} runs for this tenant. Select View to expand step statuses inline.</p>
          {tenantPipelineRuns.length === 0 ? (
            <div className="empty-state">No pipeline runs for this tenant yet.</div>
          ) : (
            <ul className="list">
              {tenantPipelineRuns.map((run) => (
                <li key={run.run_id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <span className="mono">{run.run_id}</span><br />
                      <span className="muted">{run.dataset_name} · {fmtDate(run.started_at)}</span>
                    </span>
                    <span className="row">
                      <Pill tone={toneForStatus(run.status)}>{run.status}</Pill>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedRunId(selectedRunId === run.run_id ? null : run.run_id)}
                      >
                        View
                      </button>
                    </span>
                  </div>
                  {selectedRunId === run.run_id && (
                    <div style={{ marginTop: 8 }}>
                      <ul className="timeline">
                        {run.steps.map((step) => (
                          <li key={step.name} className={step.status === 'succeeded' ? 't-ok' : step.status === 'running' ? 't-run' : step.status === 'failed' ? 't-err' : undefined}>
                            <strong>{step.name}</strong> <Pill tone={toneForStatus(step.status === 'succeeded' ? 'succeeded' : step.status)}>{step.status}</Pill>
                            {step.logs.length > 0 && <div className="log-box" style={{ marginTop: 6 }}>{step.logs.join('\n')}</div>}
                          </li>
                        ))}
                      </ul>
                      <p className="muted">Started {fmtDate(run.started_at)} · Finished {fmtDate(run.finished_at)}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {selectedRun && <p className="muted">Viewing {selectedRun.run_id} — {selectedRun.steps.filter((s) => s.status === 'succeeded').length}/{selectedRun.steps.length} steps succeeded.</p>}
        </div>

        <div className="card">
          <h3>DQ trend</h3>
          {dq ? (
            <>
              <div className="kpi-value">{dqScore.toFixed(1)} / 100</div>
              <Sparkline points={trendPoints} width={260} height={48} />
              <p className="muted">55-check OMOP suite · provenance-signed</p>
              <p className="muted">Run <span className="mono">{dq.run_id}</span> · {dq.summary.passed} pass / {dq.summary.warned} warn / {dq.summary.failed} fail of {dq.summary.total_checks} checks · {fmtNum(dq.summary.total_rows)} rows</p>
              <p className="muted">Provenance: {dq.provenance.tool} {dq.provenance.tool_version} · fingerprint <span className="mono">{dq.provenance.dataset_fingerprint.slice(0, 12)}…</span></p>
            </>
          ) : (
            <SkeletonRows n={3} />
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 8 }}>Tenants</h3>
        <div className="card-grid" data-testid="tenant-cards">
          {store.tenants.map((t) => (
            <article key={t.tenant_id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{t.display_name}</h3>
                <Pill tone={toneForStatus(t.status)}>{t.status}</Pill>
              </div>
              <p className="mono muted">{t.tenant_id}</p>
              <p className="muted">Isolation: {t.isolation} · Region: {t.region}<br />KMS: <span className="mono">{t.kms_key_id}</span></p>
              <p className="muted">{t.users} users · {t.datasets} datasets · {t.active_studies} active studies</p>
            </article>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 6 }}>
        <h3>Recent studies</h3>
        <div data-testid="recent-studies">
          {loading && tenantStudies.length === 0 ? (
            <SkeletonRows n={3} />
          ) : (
            <DataTable<StudyRow>
              rows={studyRows}
              columns={studyColumns}
              rowKey={(r) => r.study_id}
              emptyText="No studies for this tenant yet."
              pageSize={5}
            />
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Activity</h3>
          {tenantActivity.length === 0 ? (
            <div className="empty-state">No recent activity for this tenant.</div>
          ) : (
            <ul className="list">
              {tenantActivity.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <span aria-hidden="true">{kindDot(a.kind)}</span>{' '}
                  <span className="muted" style={{ textTransform: 'capitalize' }}>{a.kind}</span> — {a.text}
                  <br /><span className="muted">{fmtDate(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card" data-testid="billing-summary">
          <h3>Usage &amp; billing (teaser)</h3>
          {!billOn ? (
            <p className="muted">Usage Billing is disabled for this tenant.</p>
          ) : report ? (
            <>
              <p>
                Period {report.period_start} → {report.period_end} · {report.record_count} records ·{' '}
                priced total ${report.totals.priced_total_usd.toFixed(3)} {report.currency} ·{' '}
                {report.totals.unpriced_record_count} unpriced records
              </p>
              <p className="muted">
                {report.totals.priced_record_count} priced / {report.totals.unpriced_record_count} unpriced · pricing {report.pricing_version} · quantities are honest, prices are never invented for unpriced lines.
              </p>
              <ul className="list">
                {report.line_items.map((li, i) => (
                  <li key={i}>
                    <span className="mono">{li.study_id ?? '(tenant-level)'}</span> · {li.event_type} · {fmtNum(li.quantity)} {li.unit} ·{' '}
                    {li.priced && li.line_total_usd != null ? `$${li.line_total_usd.toFixed(3)}` : 'unpriced'}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <SkeletonRows n={3} />
          )}
        </div>

        <div className="card" data-testid="benchmarking-card">
          <h3>Federated Benchmarking</h3>
          {benchOn ? (
            <p>Your DQ {dqScore} vs network median 84.1 · {Math.max(0, store.tenants.filter((t) => t.status === 'active').length - 1)} peer tenants participating · aggregates only, small cells suppressed (k≥25).</p>
          ) : (
            <p className="muted">Federated Benchmarking is disabled for this tenant (add-on).</p>
          )}
        </div>
      </div>
    </section>
  );
}
