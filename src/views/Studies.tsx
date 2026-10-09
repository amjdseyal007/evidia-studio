import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type ProductEntitlement, type StudySummary } from '../lib/api';
import { useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import {
  DataTable,
  EmptyState,
  Meter,
  Pill,
  SectionTitle,
  SkeletonRows,
  Sparkline,
  fmtDate,
  fmtNum,
  toneForStatus,
  useToasts,
  type Column,
} from '../components/ui';

interface StudiesProps {
  tenantId: string;
  actor: string;
  role: Role;
}

type StudyRow = {
  [key: string]: unknown;
  study_id: string;
  name: string;
  status: string;
  cohort_final_count: number | null;
  updated_at: string;
};

interface ControlArmStatus {
  headline: string;
  detail: string;
  progress: number;
}

const STATUS_LABEL: Record<string, string> = {
  dossier_draft: 'Dossier draft', feasibility: 'Feasibility', qa_review: 'QA review',
  in_progress: 'In progress', delivered: 'Delivered',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

function controlArmFor(study: StudySummary): ControlArmStatus {
  const status = study.status.toLowerCase();
  if (status.includes('dossier')) {
    return { headline: 'Control arm generated — dossier in draft', progress: 70,
      detail: 'Synthetic / external control arm generated. Dossier is in draft and needs biostatistician review before sign-off.' };
  }
  if (status.includes('feasibility')) {
    return { headline: 'Feasibility stage — control arm not yet generated', progress: 25,
      detail: 'Still in feasibility. No control arm generated yet; generation starts once the cohort is finalised.' };
  }
  if (status.includes('qa')) {
    return { headline: 'QA review — control arm under review', progress: 85,
      detail: 'Control arm generated and in QA review. Balance diagnostics and provenance are being checked.' };
  }
  if (status.includes('delivered')) {
    return { headline: 'Delivered — control arm finalised', progress: 100,
      detail: 'Synthetic / external control arm finalised and delivered with its evidence package.' };
  }
  return { headline: `Control arm status follows study status (${statusLabel(study.status)})`, progress: 45,
    detail: 'No dedicated control-arm milestone recorded yet; status is derived from the study lifecycle state.' };
}

function sparkPoints(progress: number): number[] {
  return [8, Math.max(12, Math.round(progress * 0.35)), Math.max(18, Math.round(progress * 0.6)), progress];
}

function runTimelineClass(status: string): string {
  if (status === 'succeeded') return 't-ok';
  if (status === 'running') return 't-run';
  return 't-err';
}

export default function Studies({ tenantId, actor, role }: StudiesProps) {
  const store = useStore();
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { push } = useToasts();
  const [entitlements, setEntitlements] = useState<ProductEntitlement[] | null>(null);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(null);
  const [loadingEntitlements, setLoadingEntitlements] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingEntitlements(true); setEntitlements(null); setEntitlementsError(null);
    api.listEntitlements(tenantId)
      .then((rows) => { if (alive) setEntitlements(rows); })
      .catch((err: unknown) => { if (alive) setEntitlementsError(err instanceof Error ? err.message : 'Failed to load product entitlements.'); })
      .finally(() => { if (alive) setLoadingEntitlements(false); });
    return () => { alive = false; };
  }, [tenantId]);

  const tenantStudies = useMemo(() => store.studies.filter((s) => s.tenant_id === tenantId), [store.studies, tenantId]);
  const studyRows: StudyRow[] = useMemo(() => tenantStudies.map((s) => ({
    study_id: s.study_id, name: s.name, status: s.status, cohort_final_count: s.cohort_final_count, updated_at: s.updated_at,
  })), [tenantStudies]);
  const agentDefsByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of store.agentDefs) map.set(def.name, def.display_name);
    return map;
  }, [store.agentDefs]);
  const study: StudySummary | undefined = useMemo(
    () => (studyId ? tenantStudies.find((s) => s.study_id === studyId) : undefined), [tenantStudies, studyId]);
  const studyRuns = useMemo(
    () => (study ? store.agentRuns.filter((r) => r.study_id === study.study_id) : []), [store.agentRuns, study]);
  const entitledCount = entitlements?.filter((e) => e.entitled).length ?? 0;
  const totalCohort = tenantStudies.reduce((sum, s) => sum + (s.cohort_final_count ?? 0), 0);
  const canEditCohorts = can(role, 'cohorts:edit');
  const canRunAgents = can(role, 'agents:run');
  const canViewAgents = can(role, 'agents:view');
  const canViewEvidence = can(role, 'evidence:view');
  const canSignEvidence = can(role, 'evidence:sign');

  const studyColumns: Array<Column<StudyRow>> = [
    {
      key: 'name',
      label: 'Study',
      sortValue: (r) => r.name,
      render: (r) => (
        <span>
          <strong>{r.name}</strong>
          <br />
          <span className="mono muted">{r.study_id}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <Pill tone={toneForStatus(r.status)}>{statusLabel(r.status)}</Pill>,
    },
    {
      key: 'cohort',
      label: 'Cohort n',
      sortValue: (r) => r.cohort_final_count ?? -1,
      render: (r) => (r.cohort_final_count === null ? '—' : fmtNum(r.cohort_final_count)),
    },
    {
      key: 'updated',
      label: 'Updated',
      sortValue: (r) => r.updated_at,
      render: (r) => fmtDate(r.updated_at),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => navigate(`/studies/${r.study_id}`)}
        >
          Open
        </button>
      ),
    },
  ];

  // ------------------------------------------------------------------ detail
  if (studyId) {
    if (!study) {
      return (
        <section>
          <SectionTitle title="Products & Studies" sub={`Portfolio P0–P3 with entitlements for tenant ${tenantId}`} />
          <div className="card" data-testid="study-detail">
            <EmptyState title="Study not found"
              body={`No study ${studyId} exists for tenant ${tenantId}. It may belong to another tenant or may not have been created yet.`} />
            <div className="row" style={{ marginTop: 12 }}>
              <Link to="/studies" className="btn btn-sm">← Back to studies</Link>
            </div>
          </div>
        </section>
      );
    }

    const controlArm = controlArmFor(study);
    return (
      <section data-testid="study-detail">
        <SectionTitle title={study.name}
          sub={`Study ${study.study_id} · tenant ${tenantId} · viewing as ${actor} (${role})`}
          actions={<Link to="/studies" className="btn btn-ghost btn-sm">← Back to studies</Link>} />
        <div className="row" style={{ marginBottom: 14 }}>
          <Pill tone={toneForStatus(study.status)}>{statusLabel(study.status)}</Pill>
          <span className="muted">Updated {fmtDate(study.updated_at)}</span>
          <span className="mono muted">{study.study_id}</span>
        </div>

        <div className="grid-2">
          <div className="card">
            <h3>Cohort summary</h3>
            <div className="kpi-value">{study.cohort_final_count === null ? '—' : fmtNum(study.cohort_final_count)}</div>
            <p className="muted">{study.cohort_final_count === null
              ? 'No final cohort count recorded yet for this study.'
              : 'Final cohort count feeding the synthetic / external control arm.'}</p>
            <p className="muted">Tenant <span className="mono">{tenantId}</span> · total across tenant studies: {fmtNum(totalCohort)}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <Link
                to="/cohorts"
                className="btn btn-primary btn-sm"
                title={
                  canEditCohorts
                    ? undefined
                    : 'View only for your role — editing requires cohorts:edit'
                }
              >
                Open cohort builder
              </Link>
              {!canEditCohorts ? (
                <Pill tone="neutral">View only — cohorts:edit required to edit</Pill>
              ) : null}
            </div>
          </div>

          <div className="card">
            <h3>Synthetic / external control arm</h3>
            <p style={{ marginTop: 8 }}><strong>{controlArm.headline}</strong></p>
            <p className="muted">{controlArm.detail}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <Meter value={controlArm.progress} max={100} label="Control arm progress" />
              <span className="muted">{controlArm.progress}%</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="muted">Progress trend </span>
              <Sparkline points={sparkPoints(controlArm.progress)} />
            </div>
          </div>

          <div className="card">
            <h3>Analysis runs</h3>
            <p className="muted">Agent runs against this study{canRunAgents ? ' · your role can start new runs from the Agent Console.' : '.'}</p>
            {studyRuns.length === 0 ? (
              <EmptyState title="No analysis runs yet" body="Runs started from the Agent Console against this study will appear here." />
            ) : (
              <ul className="timeline" style={{ marginTop: 10 }}>
                {studyRuns.map((run) => (
                  <li key={run.run_id} className={runTimelineClass(run.status)}>
                    <span className="mono">{run.run_id}</span> <Pill tone={toneForStatus(run.status)}>{run.status}</Pill>
                    <br />
                    <span>{agentDefsByName.get(run.agent_name) ?? run.agent_name} <span className="mono muted">{run.agent_name}</span></span>
                    <br />
                    <span className="muted">Started {fmtDate(run.started_at)} · tokens {fmtNum(run.input_tokens)} in / {fmtNum(run.output_tokens)} out</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              {canViewAgents ? (
                <Link to="/agents" className="btn btn-sm">
                  Open Agent Console
                </Link>
              ) : (
                <Pill tone="neutral">Agent Console requires agents:view</Pill>
              )}
              {canRunAgents ? <Pill tone="info">agents:run enabled for {role}</Pill> : null}
            </div>
          </div>

          <div className="card">
            <h3>Evidence</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              The Part 11 evidence package collects the provenance chain, cohort and control-arm
              artefacts, and the hash-linked signature record. Packages are tenant-scoped and
              verified before signing.
            </p>
            <div className="row" style={{ marginTop: 8 }}>
              <Pill tone={canSignEvidence ? 'ok' : 'neutral'}>{canSignEvidence ? 'Your role can sign evidence' : 'Signing requires evidence:sign'}</Pill>
              <Pill tone="neutral">{statusLabel(study.status)}</Pill>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {canViewEvidence ? (
                <Link to="/evidence" className="btn btn-primary btn-sm">
                  Open evidence package
                </Link>
              ) : (
                <Pill tone="neutral">Evidence requires evidence:view</Pill>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------------- list
  return (
    <section>
      <SectionTitle title="Products & Studies"
        sub={`Portfolio P0–P3 with entitlements for tenant ${tenantId} · signed in as ${actor} (${role})`} />

      {loadingEntitlements ? (
        <div className="card"><SkeletonRows n={4} /></div>
      ) : entitlementsError ? (
        <div className="card"><EmptyState title="Could not load entitlements" body={entitlementsError} /></div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <Pill tone={entitledCount > 0 ? 'ok' : 'neutral'}>{entitledCount} of {entitlements?.length ?? 0} products entitled</Pill>
            <Pill tone="neutral">{tenantStudies.length} studies</Pill>
            <Pill tone="neutral">Cohort total {fmtNum(totalCohort)}</Pill>
          </div>
          <div className="card-grid" data-testid="products-grid">
            {(entitlements ?? []).map(({ product, entitled, note }) => (
              <article key={product.product_id} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Pill tone="info">{product.product_id}</Pill>
                  <Pill tone={entitled ? 'ok' : 'neutral'}>{entitled ? 'Entitled' : 'Not entitled'}</Pill>
                </div>
                <h3 style={{ marginTop: 8 }}>{product.name}</h3>
                <p className="muted">{product.tagline}</p>
                <div className="mono" style={{ margin: '6px 0' }}>{product.pricing}</div>
                <ul className="list">
                  {product.includes.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="muted" style={{ marginTop: 8 }}>{note}</p>
                {!entitled ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() =>
                      push({
                        title: 'Not entitled (demo)',
                        tone: 'info',
                        body: `${product.name} is not in the ${tenantId} contract. In production this opens the upgrade flow.`,
                      })
                    }
                  >
                    Talk to sales
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <SectionTitle title="Studies" sub={`${tenantStudies.length} for tenant ${tenantId}`} />
        {tenantStudies.length === 0 ? (
          <EmptyState title="No studies yet" body="Studies appear here once a cohort and feasibility pass exist. Start in the cohort builder." />
        ) : (
          <DataTable<StudyRow> rows={studyRows} columns={studyColumns} rowKey={(r) => r.study_id}
            testId="studies-table" emptyText="No studies for this tenant." pageSize={8} />
        )}
      </div>
    </section>
  );
}
