import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type ProductEntitlement, type StudySummary } from '../lib/api';
import { useStore, type StudyClassification } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import {
  DataTable,
  EmptyState,
  Meter,
  Modal,
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
  classification?: StudyClassification;
  cohort_final_count: number | null;
  updated_at: string;
};

interface ControlArmStatus {
  headline: string;
  detail: string;
  progress: number;
}

const LIFECYCLE = ['feasibility', 'in_progress', 'qa_review', 'dossier_draft', 'delivered'] as const;

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
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createClass, setCreateClass] = useState<StudyClassification>('standard');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [classifyLevel, setClassifyLevel] = useState<StudyClassification>('standard');
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskOwner, setTaskOwner] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingEntitlements(true); setEntitlements(null); setEntitlementsError(null);
    api.listEntitlements(tenantId)
      .then((rows) => { if (alive) setEntitlements(rows); })
      .catch((err: unknown) => { if (alive) setEntitlementsError(err instanceof Error ? err.message : 'Failed to load product entitlements.'); })
      .finally(() => { if (alive) setLoadingEntitlements(false); });
    return () => { alive = false; };
  }, [tenantId]);

  const approvedVersion = useMemo(() => store.ontologyVersions.find((v) => v.status === 'approved') ?? null, [store.ontologyVersions]);
  const tenantStudies = useMemo(() => store.studies.filter((s) => s.tenant_id === tenantId), [store.studies, tenantId]);
  const studyRows: StudyRow[] = useMemo(() => tenantStudies.map((s) => ({
    study_id: s.study_id, name: s.name, status: s.status, classification: s.classification, cohort_final_count: s.cohort_final_count, updated_at: s.updated_at,
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
  const canClassify = can(role, 'evidence:sign') || can(role, 'agents:run');
  const canCreateStudy = can(role, 'cohorts:edit') || can(role, 'agents:run');

  async function handleCreateStudy() {
    const name = createName.trim();
    if (!name) {
      setCreateError('Study name is required.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const created = await api.createStudy({ name, tenant_id: tenantId, classification: createClass }, actor);
      push({ title: 'Study created', body: `${created.name} · ${created.classification ?? createClass}`, tone: 'ok' });
      setCreateOpen(false);
      setCreateName('');
      setCreateClass('standard');
      setCreateError(null);
      navigate(`/studies/${created.study_id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create study.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleClassifyStudy(studyIdToClassify: string) {    setClassifyBusy(true);
    setClassifyError(null);
    try {
      const updated = await api.classifyStudy(studyIdToClassify, classifyLevel, actor);
      push({
        title: 'Study classified',
        body: classifyLevel === 'regulatory'
          ? `Regulatory — pinned to ontology v${updated.ontology_version ?? approvedVersion?.version ?? ''}; retention locked.`
          : 'Standard classification applied.',
        tone: 'ok',
      });
      setClassifyOpen(false);
      setClassifyError(null);
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : 'Failed to classify study.');
    } finally {
      setClassifyBusy(false);
    }
  }

  async function handleAdvanceStatus(studyIdToAdvance: string, next: string) {
    try {
      await api.setStudyStatus(studyIdToAdvance, next, actor);
      push({ title: 'Study advanced', body: `Status moved to ${statusLabel(next)} (demo).`, tone: 'ok' });
    } catch (err) {
      push({ title: 'Status change failed', body: err instanceof Error ? err.message : 'Failed to change status.', tone: 'err' });
    }
  }

  async function handleAddTask(studyIdForTask: string) {
    const title = taskTitle.trim();
    if (!title) {
      setTaskError('Task title is required.');
      return;
    }
    try {
      await api.addStudyTask({ study_id: studyIdForTask, title, owner: taskOwner.trim() || actor, due: taskDue || null }, actor);
      setTaskTitle('');
      setTaskOwner('');
      setTaskDue('');
      setTaskError(null);
      push({ title: 'Task added', body: title, tone: 'ok' });
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Failed to add task.');
    }
  }

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
      key: 'classification',
      label: 'Classification',
      sortValue: (r) => r.classification ?? 'standard',
      render: (r) => {
        const isReg = (r.classification ?? 'standard') === 'regulatory';
        return <Pill tone={isReg ? 'warn' : 'neutral'} testId={`study-classification-${r.study_id}`}>{isReg ? 'Regulatory' : 'Standard'}</Pill>;
      },
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
    const studyClassification: StudyClassification = study.classification ?? 'standard';
    const isRegulatory = studyClassification === 'regulatory';
    const hasTenantData = store.datasets.some((d) => d.tenant_id === tenantId) || store.connectors.some((c) => c.tenant_id === tenantId);
    const hasSavedCohort = store.savedCohorts.some((c) => c.tenant_id === tenantId);
    const feasibilityDone = study.status !== 'feasibility' || study.cohort_final_count != null;
    const controlArmDone = ['dossier_draft', 'qa_review', 'delivered'].includes(study.status);
    const evidenceSigned = store.evidence.signatures.length > 0;
    const classifiedDone = study.classification === 'regulatory';
    const checklistItems: Array<{ key: string; label: string; hint: string; done: boolean; to?: string; isClassify?: boolean }> = [
      { key: 'data', label: 'Data loaded or connected', hint: 'Load a dataset or connect a source to start the pipeline.', done: hasTenantData, to: '/pipeline' },
      { key: 'cohort', label: 'Cohort built & saved', hint: 'Build and save a cohort definition for this tenant.', done: hasSavedCohort, to: '/cohorts' },
      { key: 'feasibility', label: 'Feasibility run', hint: 'Run a feasibility pass to size the cohort before generation.', done: feasibilityDone, to: '/agents' },
      { key: 'control', label: 'Control arm generated', hint: 'Generate the synthetic / external control arm for this study.', done: controlArmDone, to: '/agents' },
      { key: 'evidence', label: 'Evidence package signed', hint: 'Sign the Part 11 evidence package so it can be exported.', done: evidenceSigned, to: '/evidence' },
      { key: 'classified', label: 'Classified (Regulatory ready)', hint: isRegulatory ? 'Regulatory classification pinned to the approved ontology with retention lock.' : 'Optional for Standard studies — classify as Regulatory when ready for submission.', done: classifiedDone, isClassify: true },
    ];
    const checklistDoneCount = checklistItems.filter((i) => i.done).length;
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

          <div className="card" data-testid="study-lifecycle">
            <h3>Lifecycle</h3>
            <ol className="lifecycle-steps">
              {LIFECYCLE.map((stage) => {
                const currentIdx = LIFECYCLE.indexOf(study.status as (typeof LIFECYCLE)[number]);
                const idx = LIFECYCLE.indexOf(stage);
                const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : 'todo';
                return (
                  <li key={stage} className={`lc-${state}`} data-testid={`lc-${stage}`}>
                    <span aria-hidden="true">{state === 'done' ? '✓' : state === 'current' ? '●' : '○'}</span> {statusLabel(stage)}
                  </li>
                );
              })}
            </ol>
            {(() => {
              const idx = LIFECYCLE.indexOf(study.status as (typeof LIFECYCLE)[number]);
              const next = idx >= 0 && idx < LIFECYCLE.length - 1 ? LIFECYCLE[idx + 1] : null;
              if (!next) return <p className="muted">Final lifecycle stage reached.</p>;
              return canCreateStudy ? (
                <button type="button" className="btn btn-primary btn-sm" data-testid="advance-status-btn"
                  onClick={() => void handleAdvanceStatus(study.study_id, next)}>
                  Advance to {statusLabel(next)}
                </button>
              ) : (
                <Pill tone="neutral">Status changes require an editor role</Pill>
              );
            })()}
            <p className="muted" style={{ marginTop: 8 }}>Advancing is recorded in the audit log (study.status.changed, demo state only).</p>
          </div>

          <div className="card" data-testid="study-tasks">
            <h3>Tasks & milestones</h3>
            {(() => {
              const tasks = store.studyTasks.filter((t) => t.study_id === study.study_id);
              const openCount = tasks.filter((t) => !t.done).length;
              return (
                <>
                  <p className="muted">{tasks.length} tasks · {openCount} open. Checking a task writes to the audit log.</p>
                  {tasks.length === 0 ? (
                    <EmptyState title="No tasks yet" body="Add the first task below to track milestones for this study." />
                  ) : (
                    <ul className="checklist">
                      {tasks.map((t) => (
                        <li key={t.id} data-testid={`task-${t.id}`}>
                          <input type="checkbox" checked={t.done} disabled={!canCreateStudy}
                            aria-label={`Complete task: ${t.title}`}
                            onChange={() => void api.toggleStudyTask(t.id, actor)} />
                          <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : undefined }}>
                            <strong>{t.title}</strong>
                            <br />
                            <span className="muted">{t.owner}{t.due ? ` · due ${t.due}` : ''}</span>
                          </span>
                          {canCreateStudy ? (
                            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Delete task ${t.title}`}
                              onClick={() => void api.deleteStudyTask(t.id, actor)}>✕</button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canCreateStudy ? (
                    <form onSubmit={(e) => { e.preventDefault(); void handleAddTask(study.study_id); }} style={{ marginTop: 10 }}>
                      <div className="field">
                        <label htmlFor="task-title">New task</label>
                        <input id="task-title" data-testid="task-title-input" className="input" value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Review propensity balance" />
                        {taskError ? <span className="field-error">{taskError}</span> : null}
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor="task-owner">Owner</label>
                          <input id="task-owner" className="input" value={taskOwner} onChange={(e) => setTaskOwner(e.target.value)} placeholder={actor} />
                        </div>
                        <div className="field">
                          <label htmlFor="task-due">Due (optional)</label>
                          <input id="task-due" className="input" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-sm btn-primary" data-testid="add-task-btn">Add task</button>
                    </form>
                  ) : (
                    <p className="muted">Task editing requires an editor role.</p>
                  )}
                </>
              );
            })()}
          </div>

          <div className="card" data-testid="study-classification-card">
            <h3>Regulatory classification</h3>
            <div className="row" style={{ marginTop: 8 }}>
              <Pill tone={isRegulatory ? 'warn' : 'neutral'} testId="study-classification-pill">{isRegulatory ? 'Regulatory' : 'Standard'}</Pill>
              <Pill tone={study.retention_locked ? 'warn' : 'neutral'}>{study.retention_locked ? 'Retention locked' : 'Standard retention'}</Pill>
            </div>
            <p style={{ marginTop: 8 }}>{study.ontology_version ? `Pinned ontology: v${study.ontology_version} (approved)` : 'Not pinned'}</p>
            <p className="muted">Classification decides how the study is handled for evidence export and retention.</p>
            <ul className="list" style={{ marginTop: 8 }}>
              <li>Approved ontology version — Regulatory pins {approvedVersion ? `v${approvedVersion.version}` : 'the currently approved version'} at classification time.</li>
              <li>Retention lock — Regulatory locks retention; Standard keeps standard retention.</li>
              <li>Part 11 sign-off chain — Regulatory exports require the signed hash-chain to be complete.</li>
            </ul>
            <div className="row" style={{ marginTop: 12 }}>
              {canClassify ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="classify-btn"
                  onClick={() => { setClassifyLevel(studyClassification); setClassifyError(null); setClassifyOpen(true); }}
                >
                  {study.classification ? 'Change classification' : 'Classify study'}
                </button>
              ) : (
                <span className="muted">Classification changes require a privileged role</span>
              )}
            </div>
          </div>

          <div className="card" data-testid="study-checklist">
            <h3>Getting started — {checklistDoneCount} of 6</h3>
            <div className="row" style={{ marginTop: 8 }}>
              <Meter value={checklistDoneCount} max={6} label="Getting started progress" />
              <span className="muted">{checklistDoneCount} of 6 complete</span>
            </div>
            <ul className="checklist" style={{ marginTop: 10 }}>
              {checklistItems.map((item) => (
                <li key={item.key}>
                  <span className={item.done ? 'check' : ''}>{item.done ? '✓' : '○'}</span>
                  <span style={{ flex: 1 }}>
                    <strong>{item.label}</strong>
                    <br />
                    <span className="muted">{item.hint}</span>
                  </span>
                  {item.isClassify ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => { if (canClassify) { setClassifyLevel(studyClassification); setClassifyError(null); setClassifyOpen(true); } }}
                      disabled={!canClassify}
                    >
                      Classify
                    </button>
                  ) : item.to ? (
                    <Link to={item.to} className="btn btn-sm btn-ghost">Open</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {classifyOpen ? (
          <Modal title="Classify study" onClose={() => setClassifyOpen(false)} testId="classify-modal">
            <p className="muted">Set the handling class for <strong>{study.name}</strong> (<span className="mono">{study.study_id}</span>). Regulatory studies are pinned to the approved ontology and retention-locked; Standard studies stay exploratory.</p>
            <div className="field">
              <span className="muted" style={{ fontWeight: 600 }}>Classification</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <input
                  type="radio"
                  name="classify-level"
                  value="standard"
                  data-testid="classify-class-standard"
                  checked={classifyLevel === 'standard'}
                  onChange={() => setClassifyLevel('standard')}
                />
                Standard — internal / exploratory; no ontology pin, standard retention.
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <input
                  type="radio"
                  name="classify-level"
                  value="regulatory"
                  data-testid="classify-class-regulatory"
                  checked={classifyLevel === 'regulatory'}
                  onChange={() => setClassifyLevel('regulatory')}
                />
                Regulatory — submission-ready handling.
              </label>
            </div>
            {classifyLevel === 'regulatory' ? (
              <div style={{ marginTop: 8 }}>
                <p className="muted">Regulatory requirements:</p>
                <ul className="list">
                  <li>Approved ontology version: {approvedVersion ? `v${approvedVersion.version} (approved) will be pinned.` : 'No approved ontology version available — approve one in Ontology → Governance first.'}</li>
                  <li>Retention lock will be applied and cannot be shortened without reclassification.</li>
                  <li>Part 11 sign-off chain must be complete before the evidence export is considered ready.</li>
                </ul>
                {!approvedVersion ? <p className="error">Regulatory classification requires an approved ontology version — none is approved yet.</p> : null}
              </div>
            ) : (
              <p className="muted">Standard classification clears any ontology pin and retention lock.</p>
            )}
            {classifyError ? <p className="error" role="alert">{classifyError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setClassifyOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={classifyBusy || (classifyLevel === 'regulatory' && !approvedVersion)}
                onClick={() => void handleClassifyStudy(study.study_id)}
              >
                {classifyBusy ? 'Classifying…' : 'Confirm classification'}
              </button>
            </div>
          </Modal>
        ) : null}
      </section>
    );
  }

  // -------------------------------------------------------------------- list
  return (
    <section>
      <SectionTitle title="Products & Studies"
        sub={`Portfolio P0–P3 with entitlements for tenant ${tenantId} · signed in as ${actor} (${role})`}
        actions={canCreateStudy ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="new-study-btn"
            onClick={() => { setCreateError(null); setCreateName(''); setCreateClass('standard'); setCreateOpen(true); }}
          >
            New study
          </button>
        ) : undefined} />

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

      {createOpen ? (
        <Modal title="New study" onClose={() => setCreateOpen(false)} testId="create-study-modal">
          <div className="field">
            <label htmlFor="new-study-name">Study name</label>
            <input
              id="new-study-name"
              className="input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. External control — cohort B"
            />
          </div>
          <div className="field">
            <span className="muted" style={{ fontWeight: 600 }}>Classification</span>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="radio"
                name="new-study-class"
                value="standard"
                data-testid="new-study-class-standard"
                checked={createClass === 'standard'}
                onChange={() => setCreateClass('standard')}
              />
              Standard — internal / exploratory; no ontology pin.
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="radio"
                name="new-study-class"
                value="regulatory"
                data-testid="new-study-class-regulatory"
                checked={createClass === 'regulatory'}
                onChange={() => setCreateClass('regulatory')}
              />
              Regulatory — submission-ready handling.
            </label>
            <p className="hint">Regulatory pins the approved ontology version {approvedVersion ? `v${approvedVersion.version} (approved)` : '(none approved yet)'} and locks retention. Standard studies keep the default retention and no pin.</p>
          </div>
          {createError ? <p className="error" role="alert">{createError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={createBusy} onClick={() => void handleCreateStudy()}>
              {createBusy ? 'Creating…' : 'Create study'}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
