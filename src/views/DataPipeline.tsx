/**
 * Data Pipeline view — dataset catalog + pipeline runs for one tenant.
 *
 * Reactive state comes from the demo store (`useStore`); every mutation
 * goes through the API seam (`api`) so mock and live clients stay
 * interchangeable. RBAC gates use `can(role, …)` from lib/permissions.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type DatasetRecord, type PipelineRun, type QualityResult } from '../lib/api';
import { useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import { isServiceEnabled } from '../fixtures/services';
import {
  DataTable, EmptyState, Modal, Pill, SectionTitle,
  fmtDate, fmtNum, toneForStatus, useToasts, type Column, type Tone,
} from '../components/ui';

const LAYER_TONES: Record<DatasetRecord['layer'], Tone> = {
  bronze: 'warn',
  silver: 'neutral',
  gold: 'ok',
};

const SOURCE_OPTIONS = [
  'S3 landing (BYOD)',
  'Snowflake connector (LAND)',
  'Databricks (VIRTUAL)',
  'Custom REST connector',
] as const;

function fmtDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function stepToneClass(status: PipelineRun['steps'][number]['status']): string {
  if (status === 'succeeded') return 't-ok';
  if (status === 'running') return 't-run';
  if (status === 'failed') return 't-err';
  return '';
}

export default function DataPipeline({
  tenantId, actor, role,
}: {
  tenantId: string;
  actor: string;
  role: Role;
}) {
  const store = useStore();
  const { push } = useToasts();

  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState<{ name: string; layer: DatasetRecord['layer']; source: string }>({
    name: '', layer: 'bronze', source: SOURCE_OPTIONS[0],
  });
  const [nameError, setNameError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [datasetFilter, setDatasetFilter] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dq, setDq] = useState<QualityResult | null>(null);
  const [scheduleState, setScheduleState] = useState<Record<string, { cadence: string; paused: boolean }>>({});

  useEffect(() => {
    let cancelled = false;
    api.getDqResult(tenantId).then((r) => { if (!cancelled) setDq(r); }).catch(() => { /* DQ panel is additive */ });
    return () => { cancelled = true; };
  }, [tenantId]);

  const canRun = can(role, 'pipeline:run');
  const svcStates = store.tenantServices[tenantId];
  const deidOff = svcStates ? !isServiceEnabled(svcStates, 'deid') : false;
  const dqOff = svcStates ? !isServiceEnabled(svcStates, 'dq') : false;
  const runBlocked = deidOff || dqOff;

  // Spread into fresh object types — DataTable requires an index signature,
  // which fixture interfaces do not carry.
  const datasets = useMemo(
    () => store.datasets.filter((d) => d.tenant_id === tenantId).map((d) => ({ ...d })),
    [store.datasets, tenantId],
  );
  type DatasetRow = (typeof datasets)[number];

  const runs = useMemo(
    () => store.pipelineRuns.filter((r) => r.tenant_id === tenantId).map((r) => ({ ...r })),
    [store.pipelineRuns, tenantId],
  );
  type RunRow = (typeof runs)[number];

  const filteredRuns = useMemo(
    () => (datasetFilter ? runs.filter((r) => r.dataset_id === datasetFilter) : runs),
    [runs, datasetFilter],
  );

  const goldCount = datasets.filter((d) => d.layer === 'gold').length;
  const scored = datasets.filter((d) => d.dq_score != null);
  const avgDq = scored.length
    ? (scored.reduce((sum, d) => sum + (d.dq_score ?? 0), 0) / scored.length).toFixed(1)
    : '—';
  const failedRuns = runs.filter((r) => r.status === 'failed').length;

  const selectedRun = runs.find((r) => r.run_id === selectedRunId) ?? null;
  const filterDataset = datasets.find((d) => d.dataset_id === datasetFilter) ?? null;

  async function onRunPipeline(ds: DatasetRow) {
    if (runBlocked) {
      push({ title: 'Run blocked', body: 'De-identification / Data Quality service is disabled for this tenant.', tone: 'err' });
      return;
    }
    setStartingId(ds.dataset_id);
    try {
      const run = await api.startPipelineRun(ds.dataset_id, actor);
      push({ title: 'Pipeline started', body: `${ds.name} · run ${run.run_id}`, tone: 'info' });
      setSelectedRunId(run.run_id);
      setDatasetFilter(null);
    } catch (err) {
      push({ title: 'Pipeline failed to start', body: (err as Error).message, tone: 'err' });
    } finally {
      setStartingId(null);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameError('Dataset name is required.');
      return;
    }
    setNameError('');
    setRegistering(true);
    try {
      const ds = await api.addDataset({
        name, tenant_id: tenantId, layer: form.layer, source: form.source, actor,
      });
      push({ title: 'Dataset registered', body: `${ds.name} (${ds.layer}) added to the catalog.`, tone: 'ok' });
      setShowRegister(false);
      setForm({ name: '', layer: 'bronze', source: SOURCE_OPTIONS[0] });
    } catch (err) {
      push({ title: 'Could not register dataset', body: (err as Error).message, tone: 'err' });
    } finally {
      setRegistering(false);
    }
  }

  const datasetColumns: Array<Column<DatasetRow>> = [
    {
      key: 'name', label: 'Dataset',
      render: (r) => (<><strong>{r.name}</strong><br /><span className="muted mono">{r.dataset_id}</span></>),
      sortValue: (r) => r.name,
    },
    {
      key: 'layer', label: 'Layer',
      render: (r) => <Pill tone={LAYER_TONES[r.layer]}>{r.layer.toUpperCase()}</Pill>,
      sortValue: (r) => r.layer,
    },
    { key: 'source', label: 'Source', render: (r) => r.source, sortValue: (r) => r.source },
    { key: 'rows', label: 'Rows', render: (r) => fmtNum(r.rows), sortValue: (r) => r.rows },
    {
      key: 'dq', label: 'DQ score',
      render: (r) => (r.dq_score == null
        ? '—'
        : <Pill tone={r.dq_score >= 85 ? 'ok' : r.dq_score >= 75 ? 'warn' : 'err'}>{r.dq_score.toFixed(1)}</Pill>),
      sortValue: (r) => r.dq_score ?? -1,
    },
    { key: 'last_run', label: 'Last run', render: (r) => fmtDate(r.last_run_at), sortValue: (r) => r.last_run_at ?? '' },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="row">
          <button
            type="button" className="btn btn-primary btn-sm"
            disabled={!canRun || runBlocked || startingId === r.dataset_id}
            title={runBlocked ? 'Blocked: a required service is disabled for this tenant' : canRun ? 'Start a new pipeline run for this dataset' : 'Requires the pipeline:run permission'}
            onClick={() => void onRunPipeline(r)}
          >
            {startingId === r.dataset_id ? 'Starting…' : 'Run pipeline'}
          </button>
          <button
            type="button" className="btn btn-sm"
            title="Show pipeline runs for this dataset"
            onClick={() => { setDatasetFilter(r.dataset_id); setSelectedRunId(null); }}
          >
            View runs
          </button>
        </div>
      ),
    },
  ];

  const runColumns: Array<Column<RunRow>> = [
    {
      key: 'run_id', label: 'Run',
      render: (r) => (
        <button type="button" className="btn btn-ghost btn-sm mono" title="Open run detail"
          onClick={() => setSelectedRunId(r.run_id === selectedRunId ? null : r.run_id)}>
          {r.run_id}
        </button>
      ),
      sortValue: (r) => r.run_id,
    },
    { key: 'dataset', label: 'Dataset', render: (r) => r.dataset_name, sortValue: (r) => r.dataset_name },
    {
      key: 'status', label: 'Status',
      render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill>,
      sortValue: (r) => r.status,
    },
    { key: 'started', label: 'Started', render: (r) => fmtDate(r.started_at), sortValue: (r) => r.started_at },
    {
      key: 'finished', label: 'Finished / duration',
      render: (r) => (r.finished_at
        ? <>{fmtDate(r.finished_at)} <span className="muted">({fmtDuration(r.started_at, r.finished_at)})</span></>
        : <span className="muted">in progress · {fmtDuration(r.started_at, null)}</span>),
      sortValue: (r) => r.finished_at ?? r.started_at,
    },
    {
      key: 'detail', label: '',
      render: (r) => (
        <button type="button" className="btn btn-sm" title="Open run detail"
          onClick={() => setSelectedRunId(r.run_id === selectedRunId ? null : r.run_id)}>
          {r.run_id === selectedRunId ? 'Hide detail' : 'Detail'}
        </button>
      ),
    },
  ];

  return (
    <section>
      <SectionTitle
        title="Data Pipeline"
        sub="Bronze → silver → gold over BYOD sources. Runs execute ingest, de-identification, OMOP harmonization, data-quality scoring, and gold publish; progress streams live from the run simulator."
        actions={(
          <button
            type="button" className="btn btn-primary" data-testid="register-dataset-btn"
            disabled={!canRun}
            title={canRun ? 'Register a new dataset for this tenant' : 'Requires the pipeline:run permission'}
            onClick={() => setShowRegister(true)}
          >
            Register dataset
          </button>
        )}
      />

      <div className="card-grid" data-testid="pipeline-kpis">
        <div className="card">
          <div className="kpi-label">Datasets</div>
          <div className="kpi-value">{fmtNum(datasets.length)}</div>
          <div className="muted">cataloged for this tenant</div>
        </div>
        <div className="card">
          <div className="kpi-label">Gold datasets</div>
          <div className="kpi-value">{fmtNum(goldCount)}</div>
          <div className="muted">published to the gold layer</div>
        </div>
        <div className="card">
          <div className="kpi-label">Avg DQ score</div>
          <div className="kpi-value">{avgDq}</div>
          <div className="muted">across {scored.length} scored dataset{scored.length === 1 ? '' : 's'} (0–100)</div>
        </div>
        <div className="card">
          <div className="kpi-label">Failed runs</div>
          <div className="kpi-value">{fmtNum(failedRuns)}</div>
          <div className="muted">of {fmtNum(runs.length)} total run{runs.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {runBlocked ? (
        <div className="card" data-testid="pipeline-service-notice" style={{ marginBottom: 14 }}>
          ⚠ {[deidOff && 'De-identification Engine', dqOff && 'Data Quality Scoring'].filter(Boolean).join(' and ')} disabled for this tenant — pipeline runs are blocked until an admin re-enables the service in Control Plane → Tenant services.
        </div>
      ) : null}

      <h3 style={{ margin: '18px 0 10px' }}>Dataset catalog</h3>
      {datasets.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No datasets yet"
            body="Register the first dataset to start landing BYOD data into the bronze layer."
          />
        </div>
      ) : (
        <DataTable
          rows={datasets}
          columns={datasetColumns}
          rowKey={(r) => r.dataset_id}
          testId="dataset-table"
          emptyText="No datasets match the filter."
        />
      )}

      <div className="section-head" style={{ marginTop: 22 }}>
        <div>
          <h3>Pipeline runs</h3>
          {filterDataset ? (
            <p className="muted">
              Filtered to <strong>{filterDataset.name}</strong>{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDatasetFilter(null)}>
                Clear filter ✕
              </button>
            </p>
          ) : (
            <p className="muted">Click a run to inspect step-by-step logs; running pipelines update live.</p>
          )}
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No pipeline runs yet"
            body="Use “Run pipeline” on a dataset to start the first ingest → gold run."
          />
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No runs for this dataset"
            body="This dataset has not been run yet. Clear the filter to see all runs for the tenant."
          />
        </div>
      ) : (
        <DataTable
          rows={filteredRuns}
          columns={runColumns}
          rowKey={(r) => r.run_id}
          testId="pipeline-runs-table"
          emptyText="No runs match the filter."
        />
      )}

      {selectedRun ? (
        <div className="card" style={{ marginTop: 14 }} data-testid="run-detail">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Run <span className="mono">{selectedRun.run_id}</span></h3>
            <div className="row">
              <Pill tone={toneForStatus(selectedRun.status)}>{selectedRun.status}</Pill>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedRunId(null)} aria-label="Close run detail">
                ✕
              </button>
            </div>
          </div>
          <p className="muted">
            {selectedRun.dataset_name} · started {fmtDate(selectedRun.started_at)}
            {selectedRun.finished_at
              ? <> · finished {fmtDate(selectedRun.finished_at)} ({fmtDuration(selectedRun.started_at, selectedRun.finished_at)})</>
              : <> · running for {fmtDuration(selectedRun.started_at, null)}</>}
          </p>
          <ol className="timeline">
            {selectedRun.steps.map((step) => (
              <li key={step.name} className={stepToneClass(step.status)}>
                <div className="row">
                  <strong>{step.name}</strong>
                  <Pill tone={toneForStatus(step.status)}>{step.status}</Pill>
                </div>
                {step.logs.length > 0 ? (
                  <div className="log-box" style={{ marginTop: 6 }}>{step.logs.join('\n')}</div>
                ) : (
                  <div className="muted" style={{ marginTop: 4 }}>Queued — waiting for the previous step.</div>
                )}
              </li>
            ))}
          </ol>
          {selectedRun.status === 'failed' ? (
            <p className="muted">
              This run stopped at the failed step above; downstream steps stayed queued. Fix the flagged
              source issue, then re-run the pipeline from the dataset catalog.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14 }} data-testid="pipeline-schedules">
        <h3>Schedules</h3>
        <p className="muted">Recurring refresh cadences per dataset (demo schedules — no live scheduler is attached). Changing a cadence or pausing is a local demo action; in production this writes the scheduler config and is audited.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Dataset</th><th>Cadence</th><th>Next run</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {datasets.map((ds, i) => {
                const sched = scheduleState[ds.dataset_id] ?? {
                  cadence: ['Daily 06:00 UTC', 'Weekly Mon 05:00 UTC', 'On demand'][i % 3],
                  paused: i % 3 === 2,
                };
                return (
                  <tr key={ds.dataset_id}>
                    <td>{ds.name}</td>
                    <td>
                      <select className="select input-sm" aria-label={`Cadence for ${ds.name}`} data-testid={`sched-cadence-${ds.dataset_id}`}
                        value={sched.cadence} disabled={!canRun}
                        onChange={(e) => {
                          setScheduleState((prev) => ({ ...prev, [ds.dataset_id]: { cadence: e.target.value, paused: e.target.value === 'On demand' ? true : sched.paused } }));
                          push({ title: 'Schedule updated (demo)', body: `${ds.name} → ${e.target.value}. No live scheduler is attached.`, tone: 'info' });
                        }}>
                        {['Daily 06:00 UTC', 'Weekly Mon 05:00 UTC', 'Hourly', 'On demand'].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>{sched.paused || sched.cadence === 'On demand' ? '—' : fmtDate(new Date(Date.now() + (i + 1) * 36e5).toISOString())}</td>
                    <td><Pill tone={sched.paused ? 'neutral' : 'ok'}>{sched.paused ? 'paused' : 'active'}</Pill></td>
                    <td>
                      <button type="button" className="btn btn-sm" disabled={!canRun} data-testid={`sched-toggle-${ds.dataset_id}`}
                        onClick={() => {
                          setScheduleState((prev) => ({ ...prev, [ds.dataset_id]: { ...sched, paused: !sched.paused } }));
                          push({ title: sched.paused ? 'Schedule resumed (demo)' : 'Schedule paused (demo)', body: ds.name, tone: 'ok' });
                        }}>
                        {sched.paused ? 'Resume' : 'Pause'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {datasets.length === 0 && <tr><td colSpan={5}><div className="empty-state">No datasets to schedule.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }} data-testid="dq-panel">
        <div className="section-head">
          <div>
            <h3>Data quality — 55-check OMOP suite</h3>
            <p className="muted">Latest scored run for this tenant. Failed checks block gold publish; every score carries provenance.</p>
          </div>
          {dq ? <Pill tone={dq.score >= 85 ? 'ok' : dq.score >= 70 ? 'warn' : 'err'}>{dq.score.toFixed(1)} / 100</Pill> : null}
        </div>
        {dq ? (
          <>
            <p className="muted">
              Run <span className="mono">{dq.run_id}</span> · {dq.summary.passed} pass · {dq.summary.warned} warn · {dq.summary.failed} fail
              of {dq.summary.total_checks} checks · {fmtNum(dq.summary.total_rows)} rows · fingerprint <span className="mono">{dq.provenance.dataset_fingerprint.slice(0, 12)}…</span>
            </p>
            <DataTable
              rows={dq.checks.map((c) => ({ ...c }))}
              columns={[
                { key: 'check_id', label: 'Check', render: (r) => <span className="mono">{r.check_id}</span>, sortValue: (r) => r.check_id },
                { key: 'family', label: 'Family', render: (r) => r.family, sortValue: (r) => r.family },
                { key: 'table', label: 'Table', render: (r) => r.table, sortValue: (r) => r.table },
                { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'pass' ? 'ok' : r.status === 'warn' ? 'warn' : 'err'}>{r.status}</Pill>, sortValue: (r) => r.status },
                { key: 'offending', label: 'Offending', render: (r) => `${fmtNum(r.offending_count)} (${(r.offending_rate * 100).toFixed(3)}%)`, sortValue: (r) => r.offending_count },
                { key: 'description', label: 'Description', render: (r) => r.description },
              ]}
              rowKey={(r) => r.check_id}
              pageSize={10}
              testId="dq-checks"
              emptyText="No check rows in the latest run."
            />
          </>
        ) : (
          <p className="muted">Loading DQ results…</p>
        )}
      </div>

      {showRegister ? (
        <Modal title="Register dataset" onClose={() => setShowRegister(false)} testId="register-dataset-modal">
          <form onSubmit={(e) => void onRegister(e)}>
            <div className="field">
              <label htmlFor="ds-name">Dataset name</label>
              <input
                id="ds-name" className="input" type="text" value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
                placeholder="e.g. Acme claims extract 2026-Q4"
              />
              {nameError ? <div className="field-error" role="alert">{nameError}</div> : null}
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ds-layer">Layer</label>
                <select
                  id="ds-layer" className="select" value={form.layer}
                  onChange={(e) => setForm((f) => ({ ...f, layer: e.target.value as DatasetRecord['layer'] }))}
                >
                  <option value="bronze">bronze — raw landing</option>
                  <option value="silver">silver — harmonized</option>
                  <option value="gold">gold — analysis-ready</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ds-source">Source</label>
                <select
                  id="ds-source" className="select" value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                >
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <p className="muted">
              Registration only catalogs the dataset (0 rows until the first run). “Run pipeline” then
              executes ingest → de-identification → OMOP → DQ → gold publish.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowRegister(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={registering}>
                {registering ? 'Registering…' : 'Register dataset'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
