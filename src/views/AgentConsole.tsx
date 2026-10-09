import { Fragment, useEffect, useState } from 'react';
import { api, type AgentDefinition, type AgentRun } from '../lib/api';
import MockBanner from '../components/MockBanner';

export default function AgentConsole({ tenantId }: { tenantId: string }) {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.listAgents(), api.listAgentRuns()]).then(([a, r]) => { if (live) { setAgents(a); setRuns(r); } });
    return () => { live = false; };
  }, [tenantId]);

  return (
    <section>
      <MockBanner />
      <h2>Agent Console</h2>
      <p className="muted">The 5 product agents (ai/agents/product_agents.py). Runs are fixtures; ontology calls show the LOCAL STUB tool surface (ai/ontology_mcp.py).</p>

      <div className="card-grid" data-testid="agent-cards">
        {agents.map((a) => (
          <article key={a.name} className="card">
            <h3>{a.display_name}</h3>
            <p><code>{a.name}</code> · prompt <code>{a.prompt_name}</code></p>
            <p className="muted">{a.description}</p>
            <p className="muted">Ontology tools allowed: {a.allowed_ontology_tools.join(', ')}</p>
          </article>
        ))}
      </div>

      <h3>Run history</h3>
      <table className="table" data-testid="run-history">
        <thead><tr><th>Run</th><th>Agent</th><th>Tenant</th><th>Study</th><th>Status</th><th>Tokens (in/out)</th><th></th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <Fragment key={r.run_id}>
              <tr>
                <td><code>{r.run_id}</code></td><td>{r.agent_name}</td><td>{r.tenant_id}</td><td>{r.study_id ?? '—'}</td>
                <td>{r.status}</td><td>{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                <td><button type="button" onClick={() => setExpanded(expanded === r.run_id ? null : r.run_id)}>{expanded === r.run_id ? 'Hide' : 'Detail'}</button></td>
              </tr>
              {expanded === r.run_id && (
                <tr key={`${r.run_id}-detail`}>
                  <td colSpan={7}>
                    <div data-testid="run-detail">
                      <p>Goal: {r.goal} · model <code>{r.model_id}</code> · {r.started_at} → {r.finished_at ?? '—'}</p>
                      <h4>Ontology tool calls</h4>
                      <ul>
                        {r.ontology_tool_calls.map((c, i) => (
                          <li key={i}><code>{c.tool}</code> — {c.args_summary} · {c.latency_ms} ms · {c.status}</li>
                        ))}
                      </ul>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
