import { type ReactNode, useEffect, useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MODE, api } from './lib/api';
import { SessionProvider, useSession } from './lib/session';
import { ROLES, can, type Permission, type Role } from './lib/permissions';
import { Modal, ToastProvider, useToasts } from './components/ui';
import { useStore } from './lib/store';
import { isServiceEnabled, serviceBlockers, serviceDef, type ServiceKey } from './fixtures/services';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import DataPipeline from './views/DataPipeline';
import Connectors from './views/Connectors';
import Ontology from './views/Ontology';
import CohortBuilder from './views/CohortBuilder';
import Studies from './views/Studies';
import AgentConsole from './views/AgentConsole';
import Evidence from './views/Evidence';
import ControlPlane from './views/ControlPlane';
import Delivery from './views/Delivery';
import Users from './views/Users';
import Settings from './views/Settings';

interface NavItem { path: string; key: string; label: string; icon: string; perm: Permission; service?: ServiceKey }
const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Workspace',
    items: [
      { path: '/', key: 'dashboard', label: 'Dashboard', icon: '▦', perm: 'dashboard:view' },
      { path: '/cohorts', key: 'cohorts', label: 'Cohorts', icon: '◎', perm: 'cohorts:view', service: 'cohorts' },
      { path: '/studies', key: 'studies', label: 'Products & Studies', icon: '▤', perm: 'studies:view' },
      { path: '/agents', key: 'agents', label: 'Agents', icon: '✦', perm: 'agents:view', service: 'agents' },
      { path: '/evidence', key: 'evidence', label: 'Evidence & Compliance', icon: '✓', perm: 'evidence:view', service: 'evidence' },
    ],
  },
  {
    group: 'Data Platform',
    items: [
      { path: '/pipeline', key: 'pipeline', label: 'Data Pipeline', icon: '⇶', perm: 'pipeline:view', service: 'pipeline' },
      { path: '/connectors', key: 'connectors', label: 'Connectors', icon: '⇄', perm: 'connectors:view', service: 'connectors' },
      { path: '/ontology', key: 'ontology', label: 'Ontology', icon: '⬡', perm: 'ontology:view', service: 'ontology' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { path: '/delivery', key: 'delivery', label: 'Delivery Admin', icon: '✈', perm: 'delivery:view' },
      { path: '/control', key: 'control', label: 'Control Plane', icon: '⚙', perm: 'controlplane:view' },
      { path: '/users', key: 'users', label: 'Users & Access', icon: '◉', perm: 'users:view' },
      { path: '/settings', key: 'settings', label: 'Settings', icon: '≡', perm: 'settings:manage' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function labelForPath(pathname: string): string {
  if (pathname.startsWith('/studies/')) return 'Study detail';
  const item = ALL_ITEMS.find((i) => i.path === pathname)
    ?? [...ALL_ITEMS].sort((a, b) => b.path.length - a.path.length).find((i) => i.path !== '/' && pathname.startsWith(i.path));
  return item?.label ?? 'Console';
}

function Guard({ perm, role, children }: { perm: Permission; role: Role; children: ReactNode }) {
  if (!can(role, perm)) {
    return (
      <div className="card" data-testid="not-permitted">
        <h3>Not permitted</h3>
        <p className="muted">Your current demo role ({role}) cannot open this view. Switch roles in the user menu to preview RBAC gating.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function ServiceGuard({ serviceKey, tenantId, children }: { serviceKey: ServiceKey; tenantId: string; children: ReactNode }) {
  const store = useStore();
  const states = store.tenantServices[tenantId];
  if (states && !isServiceEnabled(states, serviceKey)) {
    const def = serviceDef(serviceKey);
    const blockers = serviceBlockers(states, serviceKey);
    return (
      <div className="card" data-testid="service-disabled">
        <h3>{def.name} is disabled for this tenant</h3>
        <p className="muted">An administrator disabled this service{blockers.length > 0 ? ` — dependency off: ${blockers.map((b) => serviceDef(b).name).join(', ')}` : ''}. Re-enable it in Control Plane → Tenant services, or ask Evidia Delivery.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell() {
  const { user, logout, switchRole, switchTenant, viewAsTenantId, viewAsStartedAt, breakGlassUntil, enterViewAs, exitViewAs, activateBreakGlass } = useSession();
  const store = useStore();
  const location = useLocation();
  const { push } = useToasts();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [bgReason, setBgReason] = useState('');
  const [, setTick] = useState(0);
  const actor = user?.email ?? 'unknown';

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      if (viewAsTenantId && viewAsStartedAt && Date.now() > viewAsStartedAt + 30 * 60000) {
        void api.endSupportSession(viewAsTenantId, actor).finally(() => exitViewAs());
        push({ title: 'Support session expired', body: 'The 30-minute view-as limit (demo) was reached; session closed and logged.', tone: 'warn' });
      }
    }, 20000);
    return () => window.clearInterval(id);
  }, [viewAsTenantId, viewAsStartedAt, actor, exitViewAs, push]);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const { role } = user;
  const tenantId = viewAsTenantId ?? user.tenant_id;
  const elevated = breakGlassUntil != null && breakGlassUntil > Date.now();
  const readOnlySupport = viewAsTenantId != null && !elevated;
  const effRole: Role = readOnlySupport ? 'Auditor' : role;
  const tenantDisplay = store.tenants.find((t) => t.tenant_id === viewAsTenantId)?.display_name ?? viewAsTenantId;
  const svcStates = store.tenantServices[tenantId];
  const svcOn = (k?: ServiceKey) => !k || !svcStates || isServiceEnabled(svcStates, k);

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => can(user.role, i.perm) && svcOn(i.service)) }))
    .filter((g) => g.items.length > 0);
  const unread = store.notifications.filter((n) => !n.read).length;
  const tenants = store.tenants.filter((t) => t.status !== 'offboarded');
  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const crossTenant = role === 'Platform Admin' || role === 'Delivery Admin';
  const scopedOptions = crossTenant ? tenants : (() => { const own = store.tenants.filter((t) => t.tenant_id === user.tenant_id); return own.length > 0 ? own : tenants; })();
  const exitSupport = async () => {
    if (viewAsTenantId) {
      await api.endSupportSession(viewAsTenantId, actor);
    }
    exitViewAs();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>Evidia Studio</h1>
          <div className="muted">Evidence Platform · {MODE} mode</div>
        </div>
        <nav className="nav" aria-label="Console navigation">
          {visibleGroups.map((g) => (
            <div key={g.group} className="nav-group">
              <span>{g.group}</span>
              {g.items.map((i) => (
                <NavLink key={i.key} to={i.path} end={i.path === '/'}
                  data-testid={`nav-${i.key}`}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                  <span className="nav-ico" aria-hidden="true">{i.icon}</span>
                  <span className="nav-label">{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          DEMO — mock data. Nothing here is a live system or a compliance claim.
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{labelForPath(location.pathname)}</strong>
            <span className="muted"> · {store.tenants.find((t) => t.tenant_id === tenantId)?.display_name ?? tenantId}</span>
          </div>
          <div className="spacer" />
          <div className="tenant-switcher">
            <label htmlFor="tenant-select" className="muted">Tenant</label>
            <select id="tenant-select" data-testid="tenant-switcher" className="select input-sm"
              value={tenantId} onChange={async (e) => {
                const next = e.target.value;
                if (role === 'Delivery Admin') {
                  if (next === user.tenant_id) {
                    await api.endSupportSession(viewAsTenantId ?? next, actor);
                    exitViewAs();
                  } else {
                    await api.startSupportSession(next, actor);
                    enterViewAs(next);
                  }
                } else {
                  switchTenant(next);
                }
              }}>
              {scopedOptions.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.display_name}</option>)}
            </select>
          </div>

          <div className="menu-wrap">
            <button type="button" className="icon-btn" aria-label="Notifications"
              onClick={() => { setNotifMenu((v) => !v); setUserMenu(false); }}>
              🔔{unread > 0 ? <span className="badge-dot">{unread}</span> : null}
            </button>
            {notifMenu && (
              <div className="menu" data-testid="notif-menu">
                <div className="menu-head row" style={{ justifyContent: 'space-between' }}>
                  <strong>Notifications</strong>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void api.markAllNotificationsRead()}>Mark all read</button>
                </div>
                {store.notifications.slice(0, 6).map((n) => (
                  <button key={n.id} type="button" className="menu-item" onClick={() => void api.markNotificationRead(n.id)}>
                    <strong>{n.read ? '' : '• '}{n.title}</strong><br />
                    <span className="muted">{n.body}</span>
                  </button>
                ))}
                {store.notifications.length === 0 && <div className="menu-item muted">No notifications</div>}
              </div>
            )}
          </div>

          <div className="menu-wrap">
            <button type="button" className="user-chip btn btn-ghost" data-testid="user-chip"
              onClick={() => { setUserMenu((v) => !v); setNotifMenu(false); }}>
              <span className="avatar">{initials}</span>
              <span style={{ textAlign: 'left' }}>
                <strong>{user.name}</strong><br />
                <span className="muted">{role} · {tenantId}</span>
              </span>
            </button>
            {userMenu && (
              <div className="menu" data-testid="user-menu">
                <div className="menu-head">
                  <strong>{user.name}</strong><br />
                  <span className="muted">{user.email}</span><br />
                  <span className="pill pill-info" style={{ marginTop: 6 }}>{role}</span>
                </div>
                <div className="menu-head muted">Switch demo role (RBAC gate):</div>
                {ROLES.map((r: Role) => (
                  <button key={r} type="button" className="menu-item" disabled={r === role}
                    onClick={() => { switchRole(r); setUserMenu(false); }}>
                    {r === role ? '✓ ' : ''}{r}
                  </button>
                ))}
                <div className="menu-sep" />
                <button type="button" className="menu-item" onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          <div className="mock-banner" role="note" data-testid="mock-banner">
            {MODE === 'live'
              ? 'LIVE MODE — code-ready, not yet run against a deployed backend; failed requests surface as errors, never fixture fallback.'
              : 'MOCK DATA — no live backend. Fixture data only; every action is simulated locally and recorded in the audit log.'}
          </div>
          {viewAsTenantId ? (
            <div className="viewas-banner" role="alert" data-testid="viewas-banner">
              {elevated ? <>🔓 <strong>BREAK-GLASS elevated access</strong> on {tenantDisplay} until {new Date(breakGlassUntil!).toLocaleTimeString()} — every action is audited under {actor}.</> : <>👁 <strong>Support session (read-only)</strong> — viewing as {tenantDisplay} (<span className="mono">{viewAsTenantId}</span>) under your identity {actor}. You temporarily have Auditor-equivalent access. Expires {viewAsStartedAt ? new Date(viewAsStartedAt + 30 * 60000).toLocaleTimeString() : ''}.</>}
              <span style={{ flex: 1 }} />
              {!elevated && can(role, 'support:viewas') ? <button type="button" className="btn btn-danger btn-sm" data-testid="viewas-breakglass" onClick={() => setBgOpen(true)}>Break glass</button> : null}
              <button type="button" className="btn btn-sm" data-testid="viewas-exit" onClick={() => void exitSupport()}>Exit support session</button>
            </div>
          ) : null}
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route index element={<Guard perm="dashboard:view" role={role}><Dashboard tenantId={tenantId} actor={actor} /></Guard>} />
            <Route path="/pipeline" element={<Guard perm="pipeline:view" role={role}><ServiceGuard serviceKey="pipeline" tenantId={tenantId}><DataPipeline tenantId={tenantId} actor={actor} role={effRole} /></ServiceGuard></Guard>} />
            <Route path="/connectors" element={<Guard perm="connectors:view" role={role}><ServiceGuard serviceKey="connectors" tenantId={tenantId}><Connectors tenantId={tenantId} actor={actor} role={effRole} /></ServiceGuard></Guard>} />
            <Route path="/ontology" element={<Guard perm="ontology:view" role={role}><ServiceGuard serviceKey="ontology" tenantId={tenantId}><Ontology /></ServiceGuard></Guard>} />
            <Route path="/cohorts" element={<Guard perm="cohorts:view" role={role}><ServiceGuard serviceKey="cohorts" tenantId={tenantId}><CohortBuilder tenantId={tenantId} actor={actor} role={effRole} /></ServiceGuard></Guard>} />
            <Route path="/studies" element={<Guard perm="studies:view" role={role}><Studies tenantId={tenantId} actor={actor} role={effRole} /></Guard>} />
            <Route path="/studies/:studyId" element={<Guard perm="studies:view" role={role}><Studies tenantId={tenantId} actor={actor} role={effRole} /></Guard>} />
            <Route path="/agents" element={<Guard perm="agents:view" role={role}><ServiceGuard serviceKey="agents" tenantId={tenantId}><AgentConsole tenantId={tenantId} actor={actor} role={effRole} /></ServiceGuard></Guard>} />
            <Route path="/evidence" element={<Guard perm="evidence:view" role={role}><ServiceGuard serviceKey="evidence" tenantId={tenantId}><Evidence tenantId={tenantId} role={effRole} /></ServiceGuard></Guard>} />
            <Route path="/delivery" element={<Guard perm="delivery:view" role={role}><Delivery actor={actor} role={role} /></Guard>} />
            <Route path="/control" element={<Guard perm="controlplane:view" role={role}><ControlPlane tenantId={tenantId} actor={actor} role={effRole} /></Guard>} />
            <Route path="/users" element={<Guard perm="users:view" role={role}><Users tenantId={tenantId} actor={actor} role={effRole} /></Guard>} />
            <Route path="/settings" element={<Guard perm="settings:manage" role={role}><Settings tenantId={tenantId} actor={actor} role={effRole} /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {bgOpen && viewAsTenantId ? (
            <Modal title="Break glass — elevated access" onClose={() => setBgOpen(false)} testId="breakglass-modal">
              <p><strong>Warning:</strong> Break-glass grants temporary elevated (write) access for 15 minutes. Every action is recorded as a security-alert audit entry and triggers a critical notification. Use only for a verified support incident.</p>
              <div className="field">
                <label htmlFor="bg-reason">Reason (recorded in audit log)</label>
                <input id="bg-reason" className="input" value={bgReason} onChange={(e) => setBgReason(e.target.value)} placeholder="e.g. INC-1234 — pipeline stuck, tenant requested intervention" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setBgOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={async () => {
                  await api.activateBreakGlass(viewAsTenantId, actor, bgReason.trim() || 'No reason given');
                  activateBreakGlass(15);
                  setBgOpen(false);
                  setBgReason('');
                  push({ title: 'Break-glass active', body: 'Break-glass active for 15 minutes (demo)', tone: 'warn' });
                }}>Activate elevated access</button>
              </div>
            </Modal>
          ) : null}
        </main>
        <footer className="footer-note">
          Evidia Studio — enterprise console (demo build). {MODE === 'live'
            ? 'Live mode is code-ready; enterprise console endpoints are not mounted on studio/api yet.'
            : 'All data is fictional fixture data. De-identification certification, SOC 2, and production deployment are pending — see Evidence & Compliance for honest status.'}
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </ToastProvider>
    </SessionProvider>
  );
}
