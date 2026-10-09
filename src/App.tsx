import { useEffect, useState } from 'react';
import { MODE } from './lib/api';
import { currentGroups, currentTenant, ensureDemoToken, switchTenantDemo } from './lib/auth';
import Dashboard from './views/Dashboard';
import CohortBuilder from './views/CohortBuilder';
import EvidenceViewer from './views/EvidenceViewer';
import AgentConsole from './views/AgentConsole';
import TenantAdmin from './views/TenantAdmin';

type ViewKey = 'dashboard' | 'cohort' | 'evidence' | 'agents' | 'tenants';

const VIEWS: Array<{ key: ViewKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cohort', label: 'Cohort Builder' },
  { key: 'evidence', label: 'Evidence Package' },
  { key: 'agents', label: 'Agent Console' },
  { key: 'tenants', label: 'Tenant Admin' },
];

const DEMO_TENANTS = ['acme_rare', 'beacon_bio', 'corvus_tx'];

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [tenant, setTenant] = useState<string>('acme_rare');
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    // Mock mode (default) seeds the fake-JWT seam. Live mode must NOT
    // overwrite a real Cognito session, so seeding stays mock-only.
    if (MODE === 'mock') ensureDemoToken('acme_rare');
    setTenant(currentTenant() ?? 'acme_rare');
    setGroups(currentGroups());
  }, []);

  function onSwitch(next: string) {
    if (MODE !== 'mock') return; // Live tenant comes from the JWT claim.
    switchTenantDemo(next); // DEMO only — re-mints the fake JWT locally
    setTenant(currentTenant() ?? next);
    setGroups(currentGroups());
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Evidia Studio — Platform Console</h1>
          <p className="muted">Operational / admin console · API mode: <code>{MODE}</code> · separate from the study workbench in <code>studio/</code></p>
        </div>
        <div className="tenant-switcher">
          <label htmlFor="tenant-select">{MODE === 'live' ? 'Tenant (from Cognito custom:tenant_id claim)' : 'DEMO tenant switcher (not real auth)'}</label>
          <select id="tenant-select" data-testid="tenant-switcher" value={tenant} disabled={MODE === 'live'} onChange={(e) => onSwitch(e.target.value)}>
            {DEMO_TENANTS.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <span className="muted">groups: {groups.join(', ') || '—'}</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Console views">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" className={view === v.key ? 'tab active' : 'tab'} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </nav>

      <main>
        {view === 'dashboard' && <Dashboard tenantId={tenant} />}
        {view === 'cohort' && <CohortBuilder />}
        {view === 'evidence' && <EvidenceViewer />}
        {view === 'agents' && <AgentConsole tenantId={tenant} />}
        {view === 'tenants' && <TenantAdmin />}
      </main>

      <footer className="muted">{MODE === 'live' ? 'LIVE MODE — code-ready, not yet run against a deployed backend; requests fail loudly (never fixture fallback) until the endpoint parity lands.' : 'MOCK MODE — no live backend. Fixture data only; nothing on this page is a live system, a compliance claim, or real epidemiology.'}</footer>
    </div>
  );
}
