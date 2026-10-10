/**
 * Help & Getting Started — onboarding checklist computed live from the
 * demo store (each step checks real console state for this tenant),
 * demo-honesty notes, keyboard shortcuts, and an FAQ. The checklist is
 * the activation path: dataset → connector → run → cohort → study →
 * agent → evidence → export.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MODE } from '../lib/api';
import { useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import { Meter, Pill, SectionTitle } from '../components/ui';

interface Step {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  to: string;
  cta: string;
}

export default function Help({ tenantId, role }: { tenantId: string; role: Role }) {
  const store = useStore();

  const steps: Step[] = useMemo(() => {
    const datasets = store.datasets.filter((d) => d.tenant_id === tenantId);
    const connectors = store.connectors.filter((c) => c.tenant_id === tenantId);
    const runs = store.pipelineRuns.filter((r) => r.tenant_id === tenantId);
    const cohorts = store.savedCohorts.filter((c) => c.tenant_id === tenantId);
    const studies = store.studies.filter((s) => s.tenant_id === tenantId);
    const agentRuns = store.agentRuns.filter((r) => r.tenant_id === tenantId);
    const exportsForTenant = store.evidenceExports.filter((e) => e.tenant_id === tenantId);
    return [
      { key: 'dataset', label: 'Register or land a dataset', hint: 'Catalog a BYOD extract in the Data Pipeline (bronze layer).', done: datasets.length > 0, to: '/pipeline', cta: 'Open pipeline' },
      { key: 'connector', label: 'Connect a source (optional)', hint: 'Snowflake, Databricks, Foundry, or REST — LAND extracts or query in place (VIRTUAL).', done: connectors.some((c) => c.enabled), to: '/connectors', cta: 'Open connectors' },
      { key: 'run', label: 'Run the pipeline', hint: 'Ingest → de-identification → OMOP → DQ → gold publish, with step logs.', done: runs.some((r) => r.status === 'succeeded'), to: '/pipeline', cta: 'Run pipeline' },
      { key: 'cohort', label: 'Build & save a cohort', hint: 'Criteria reference governed ontology concepts; validate, count, export ATLAS.', done: cohorts.length > 0, to: '/cohorts', cta: 'Open cohort builder' },
      { key: 'study', label: 'Create a study', hint: 'Classify Standard vs Regulatory at creation — Regulatory pins the approved ontology and locks retention.', done: studies.length > 0, to: '/studies', cta: 'Open studies' },
      { key: 'agent', label: 'Run a governed agent', hint: 'Agents call ontology tools only, pinned to the approved ontology version.', done: agentRuns.length > 0, to: '/agents', cta: 'Open agent console' },
      { key: 'sign', label: 'Sign the evidence package', hint: 'Part 11 hash-chain signatures (demo ceremony — see the honesty notes below).', done: store.evidence.signatures.length > 0, to: '/evidence', cta: 'Open evidence' },
      { key: 'export', label: 'Generate a verifiable export', hint: 'Fingerprint-verifiable, read-only evidence package for reviewers.', done: exportsForTenant.length > 0, to: '/evidence', cta: 'Generate export' },
    ];
  }, [store, tenantId]);

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section>
      <SectionTitle
        title="Help & Getting Started"
        sub={`Onboarding for tenant ${tenantId}. The checklist reads live console state — complete the steps in any order.`}
      />

      <div className="card" style={{ marginBottom: 14 }} data-testid="getting-started">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Getting started — {doneCount} of {steps.length}</h3>
          <Pill tone={doneCount === steps.length ? 'ok' : 'info'}>{Math.round((doneCount / steps.length) * 100)}% complete</Pill>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Meter value={doneCount} max={steps.length} label="Onboarding progress" />
          <span className="muted">{doneCount} of {steps.length} complete</span>
        </div>
        <ul className="checklist" style={{ marginTop: 10 }}>
          {steps.map((s) => (
            <li key={s.key} data-testid={`gs-step-${s.key}`}>
              <span className={s.done ? 'check' : ''}>{s.done ? '✓' : '○'}</span>
              <span style={{ flex: 1 }}>
                <strong>{s.label}</strong>
                <br />
                <span className="muted">{s.hint}</span>
              </span>
              {can(role, 'dashboard:view') ? <Link to={s.to} className="btn btn-sm btn-ghost">{s.cta}</Link> : null}
            </li>
          ))}
        </ul>
        <p className="muted">
          New tenants can preload the synthetic rare-disease demo dataset at provisioning
          (Control Plane → Provision tenant), so the dashboard, DQ gauge, and a starter cohort
          are populated on minute one.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>What is real, what is demo</h3>
          <ul className="list">
            <li><Pill tone="info">Demo state</Pill> This console runs in <span className="mono">{MODE}</span> mode. Every dataset, run, signature, and price is fixture data or a local simulation — actions mutate an in-browser store and write to the demo audit log.</li>
            <li><Pill tone="warn">Code-ready, not deployed</Pill> Live mode (VITE_EVIDIA_API_MODE=live) fails loudly with 501s for enterprise-console endpoints that are not mounted on the backend yet. It never falls back to fixtures silently.</li>
            <li><Pill tone="neutral">Planned</Pill> Live Bedrock agent invocation, the DynamoDB Part 11 hash-chain store, and real connector accounts (Snowflake / Databricks / Palantir partnerships) land with deployment.</li>
          </ul>
          <p className="muted">
            Compliance honesty: SOC 2 is roadmap — not claimed. Part 11: 3 implemented / 11 partial /
            12 planned, with the two-component signing ceremony as the largest gap. De-identification
            expert certification is pending human/legal sign-off. Details in{' '}
            <Link to="/evidence">Evidence & Compliance → Compliance status</Link>.
          </p>
        </div>

        <div className="card">
          <h3>Keyboard shortcuts</h3>
          <ul className="list">
            <li><kbd className="palette-kbd">⌘K</kbd> / <kbd className="palette-kbd">Ctrl+K</kbd> — command palette (search studies, cohorts, datasets, agents, ontology classes)</li>
            <li><kbd className="palette-kbd">↑</kbd> <kbd className="palette-kbd">↓</kbd> <kbd className="palette-kbd">↵</kbd> — navigate & open palette results</li>
            <li><kbd className="palette-kbd">Esc</kbd> — close dialogs and the palette</li>
            <li>Every table supports text filter, column sort, and pagination.</li>
          </ul>
          <h3 style={{ marginTop: 14 }}>Roles in this demo</h3>
          <p className="muted">
            Use the user menu (top right) to switch demo roles and preview RBAC gating.
            Role switching re-mints a demo token — a UX gate, not a security boundary.
            The permission matrix lives in <Link to="/users">Users & Access</Link>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>FAQ</h3>
        <div data-testid="help-faq">
          <details>
            <summary><strong>Is any of this a live system?</strong></summary>
            <p className="muted">No. This is a mock-backed demo build of the Evidia Studio console. Nothing here talks to AWS, a real tenant, or patient data. The banner at the top of every page says so.</p>
          </details>
          <details>
            <summary><strong>What does "self-provision, self-connect, self-run" mean here?</strong></summary>
            <p className="muted">Tenants provision their own workspace (Control Plane), connect their own data sources (Connectors, BYOD), and run governed agents themselves (Agent Console) — Evidia Delivery supports via audited, read-only view-as sessions instead of taking the keys.</p>
          </details>
          <details>
            <summary><strong>Why can't agents see ontology version 0.2.0?</strong></summary>
            <p className="muted">Governance: agents only ever see the approved ontology. Version 0.2.0 is in review until a Biostatistician/Admin signs off in Ontology → Governance. That gate is deliberate — it is the audit story.</p>
          </details>
          <details>
            <summary><strong>Are the prices in Billing real?</strong></summary>
            <p className="muted">No — quantities are real-shaped fixture records; prices are labeled demo prices shown in-product for illustration (one competitor pattern we deliberately invert: no hidden pricing). Unpriced lines are shown as unpriced, never invented.</p>
          </details>
          <details>
            <summary><strong>I hit a 501 in live mode. Is that a bug?</strong></summary>
            <p className="muted">No — it is the seam working as designed. Enterprise console endpoints are not mounted on studio/api yet, so live mode fails loudly instead of silently showing fixture data. Mock mode is the demo path until endpoint parity lands.</p>
          </details>
        </div>
      </div>
    </section>
  );
}
