import { useEffect, useMemo, useState } from 'react';
import { api, type AgentDefinition, type AgentRun } from '../lib/api';
import { useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import { DataTable, Modal, Pill, SectionTitle, SkeletonRows, fmtDate, fmtNum, toneForStatus, useToasts, type Column } from '../components/ui';

type RunRow = {
  [key: string]: unknown;
  run_id: string;
  agent_name: string;
  study_id: string | null;
  status: AgentRun['status'];
  started_at: string;
  input_tokens: number;
  output_tokens: number;
};

export default function AgentConsole({ tenantId, actor, role }: { tenantId: string; actor: string; role: Role }) {
  const store = useStore();
  const { push } = useToasts();
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runAgent, setRunAgent] = useState<AgentDefinition | null>(null);
  const [runStudyId, setRunStudyId] = useState<string>('');
  const [runGoal, setRunGoal] = useState('');
  const [starting, setStarting] = useState(false);
  const [goalOverrides, setGoalOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    setLoadingAgents(true);
    api.listAgents()
      .then((a) => {
        if (live) setAgents(a);
      })
      .finally(() => {
        if (live) setLoadingAgents(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const tenantStudies = useMemo(() => store.studies.filter((s) => s.tenant_id === tenantId), [store.studies, tenantId]);
  const tenantRuns = useMemo(() => store.agentRuns.filter((r) => r.tenant_id === tenantId), [store.agentRuns, tenantId]);

  const agentDisplay = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    for (const a of [...agents, ...store.agentDefs]) map.set(a.name, a);
    return map;
  }, [agents, store.agentDefs]);

  const runRows: RunRow[] = tenantRuns.map((r) => ({
    run_id: r.run_id,
    agent_name: r.agent_name,
    study_id: r.study_id,
    status: r.status,
    started_at: r.started_at,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
  }));

  const selectedRun: AgentRun | undefined = tenantRuns.find((r) => r.run_id === selectedRunId) ?? tenantRuns[0];

  const columns: Array<Column<RunRow>> = [
    { key: 'run_id', label: 'Run', render: (r) => <span className="mono">{r.run_id}</span>, sortValue: (r) => r.run_id },
    { key: 'agent', label: 'Agent', render: (r) => <span>{agentDisplay.get(r.agent_name)?.display_name ?? r.agent_name}<br /><span className="mono muted">{r.agent_name}</span></span>, sortValue: (r) => r.agent_name },
    { key: 'study', label: 'Study', render: (r) => (r.study_id ? <span className="mono">{r.study_id}</span> : '—'), sortValue: (r) => r.study_id ?? '' },
    { key: 'status', label: 'Status', render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill>, sortValue: (r) => r.status },
    { key: 'started', label: 'Started', render: (r) => fmtDate(r.started_at), sortValue: (r) => r.started_at },
    { key: 'tokens', label: 'Tokens in/out', render: (r) => `${fmtNum(r.input_tokens)} / ${fmtNum(r.output_tokens)}`, sortValue: (r) => r.input_tokens + r.output_tokens },
    {
      key: 'action',
      label: '',
      render: (r) => (
        <button type="button" className="btn btn-sm" onClick={() => setSelectedRunId(r.run_id)}>
          Detail
        </button>
      ),
    },
  ];

  async function handleStartRun() {
    if (!runAgent) return;
    setStarting(true);
    try {
      const studyId = runStudyId === '' ? null : runStudyId;
      const run = await api.startAgentRun(runAgent.name, tenantId, studyId, actor || 'demo-operator');
      if (runGoal.trim()) {
        setGoalOverrides((prev) => ({ ...prev, [run.run_id]: runGoal.trim() }));
      }
      setSelectedRunId(run.run_id);
      push({ title: 'Agent run started', body: `${runAgent.display_name} · ${run.run_id} (simulated locally)`, tone: 'info' });
      setRunAgent(null);
      setRunStudyId('');
      setRunGoal('');
    } catch (err) {
      push({ title: 'Could not start run', body: err instanceof Error ? err.message : 'Unknown error', tone: 'err' });
    } finally {
      setStarting(false);
    }
  }

  const canRun = can(role, 'agents:run');

  return (
    <section>
      <SectionTitle
        title="Agent Console"
        sub="Product agents from ai/agents/product_agents.py · ontology tools via ai/ontology_mcp.py"
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>Honest status:</strong> live invocation pending AWS account; runs simulated locally; prompt registry pinned (Claude Sonnet 5.5 floor).{' '}
        <span className="muted">Tool calls below are simulated against the LOCAL STUB ontology surface — no live Bedrock or MCP calls happen in this demo.</span>
      </div>

      {loadingAgents ? (
        <div className="card"><SkeletonRows n={4} /></div>
      ) : (
        <div className="card-grid" data-testid="agent-cards">
          {agents.map((a) => (
            <article key={a.name} className="card">
              <h3>{a.display_name}</h3>
              <p className="mono muted">{a.name}</p>
              <p className="muted">{a.description}</p>
              <p>Prompt: <span className="mono">{a.prompt_name}</span></p>
              <p className="muted" style={{ marginBottom: 6 }}>Allowed ontology tools</p>
              <div className="row">
                {a.allowed_ontology_tools.map((tool) => (
                  <Pill key={tool} tone="info">{tool}</Pill>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                {canRun ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setRunAgent(a);
                      setRunStudyId('');
                      setRunGoal('');
                    }}
                  >
                    New run
                  </button>
                ) : (
                  <Pill tone="neutral">View only — running requires a privileged role</Pill>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Run history</h3>
        <p className="muted">Live-updates from the demo store as simulated runs append ontology tool calls and complete.</p>
        <DataTable<RunRow>
          rows={runRows}
          columns={columns}
          rowKey={(r) => r.run_id}
          testId="run-history"
          emptyText="No agent runs for this tenant yet."
          pageSize={8}
        />
      </div>

      {selectedRun && (
        <div className="card" style={{ marginTop: 14 }} data-testid="run-detail">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Run detail — <span className="mono">{selectedRun.run_id}</span></h3>
            <Pill tone={toneForStatus(selectedRun.status)}>{selectedRun.status}</Pill>
          </div>
          <p><strong>Goal:</strong> {goalOverrides[selectedRun.run_id] ?? selectedRun.goal}</p>
          <p className="muted">
            Agent <span className="mono">{selectedRun.agent_name}</span> · Model <span className="mono">{selectedRun.model_id}</span> · Prompt <span className="mono">{selectedRun.prompt_name}</span>
          </p>
          <p className="muted">Started {fmtDate(selectedRun.started_at)} · Finished {fmtDate(selectedRun.finished_at)} · Study {selectedRun.study_id ? <span className="mono">{selectedRun.study_id}</span> : 'No study (exploratory)'}</p>
          <p>Tokens: <strong>{fmtNum(selectedRun.input_tokens)}</strong> in / <strong>{fmtNum(selectedRun.output_tokens)}</strong> out · total <strong>{fmtNum(selectedRun.input_tokens + selectedRun.output_tokens)}</strong></p>

          <h3 style={{ marginTop: 12 }}>Ontology tool-call trace</h3>
          {selectedRun.ontology_tool_calls.length === 0 ? (
            <p className="muted">{selectedRun.status === 'running' ? 'Waiting for ontology tool calls… (simulated)' : 'No ontology tool calls recorded for this run.'}</p>
          ) : (
            <ul className="timeline">
              {selectedRun.ontology_tool_calls.map((call, i) => (
                <li key={i} className={call.status === 'ok' ? 't-ok' : call.status === 'running' ? 't-run' : 't-err'}>
                  <span className="mono">{call.tool}</span> <Pill tone={call.status === 'ok' ? 'ok' : 'info'}>{call.status}</Pill>
                  <br />
                  <span className="muted">{call.args_summary} · {call.latency_ms} ms</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {runAgent && (
        <Modal title={`New run — ${runAgent.display_name}`} onClose={() => setRunAgent(null)} testId="new-run-modal">
          <div className="field">
            <label htmlFor="run-study">Study</label>
            <select id="run-study" className="select" value={runStudyId} onChange={(e) => setRunStudyId(e.target.value)}>
              <option value="">No study (exploratory)</option>
              {tenantStudies.map((s) => (
                <option key={s.study_id} value={s.study_id}>{s.name} ({s.study_id})</option>
              ))}
            </select>
            <span className="hint">Runs are simulated locally in mock mode.</span>
          </div>
          <div className="field">
            <label htmlFor="run-goal">Goal</label>
            <textarea
              id="run-goal"
              className="input"
              rows={4}
              value={runGoal}
              onChange={(e) => setRunGoal(e.target.value)}
              placeholder="What should this agent investigate?"
            />
          </div>
          <p className="muted">Prompt <span className="mono">{runAgent.prompt_name}</span> · Allowed tools: {runAgent.allowed_ontology_tools.join(', ')}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setRunAgent(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={starting} onClick={() => void handleStartRun()}>
              {starting ? 'Starting…' : 'Start run'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
