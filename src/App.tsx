import { type ReactNode } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MODE, api } from './lib/api';
import { SessionProvider, useSession } from './lib/session';
import { ROLES, can, type Permission, type Role } from './lib/permissions';
import { ToastProvider } from './components/ui';
import { useStore } from './lib/store';
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
import Users from './views/Users';
import Settings from './views/Settings';
import { useState } from 'react';

interface NavItem { path: string; key: string; label: string; icon: string; perm: Permission }
const NAV_GROUPS: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Workspace',
    items: [
      { path: '/', key: 'dashboard', label: 'Dashboard', icon: '▦', perm: 'dashboard:view' },
      { path: '/cohorts', key: 'cohorts', label: 'Cohorts', icon: '◎', perm: 'cohorts:view' },
      { path: '/studies', key: 'studies', label: 'Products & Studies', icon: '▤', perm: 'studies:view' },
      { path: '/agents', key: 'agents', label: 'Agents', icon: '✦', perm: 'agents:view' },
      { path: '/evidence', key: 'evidence', label: 'Evidence & Compliance', icon: '✓', perm: 'evidence:view' },
    ],
  },
  {
    group: 'Data Platform',
    items: [
      { path: '/pipeline', key: 'pipeline', label: 'Data Pipeline', icon: '⇶', perm: 'pipeline:view' },
      { path: '/connectors', key: 'connectors', label: 'Connectors', icon: '⇄', perm: 'connectors:view' },
      { path: '/ontology', key: 'ontology', label: 'Ontology', icon: '⬡', perm: 'ontology:view' },
    ],
  },
  {
    group: 'Administration',
    items: [
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

function Shell() {
  const { user, logout, switchRole, switchTenant } = useSession();
  const store = useStore();
  const location = useLocation();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => can(user.role, i.perm)) }))
    .filter((g) => g.items.length > 0);
  const unread = store.notifications.filter((n) => !n.read).length;
  const tenants = store.tenants.filter((t) => t.status !== 'offboarded');
  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const { tenant_id: tenantId, email: actor, role } = user;

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
              value={tenantId} onChange={(e) => switchTenant(e.target.value)}>
              {tenants.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.display_name}</option>)}
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
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route index element={<Guard perm="dashboard:view" role={role}><Dashboard tenantId={tenantId} actor={actor} /></Guard>} />
            <Route path="/pipeline" element={<Guard perm="pipeline:view" role={role}><DataPipeline tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/connectors" element={<Guard perm="connectors:view" role={role}><Connectors tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/ontology" element={<Guard perm="ontology:view" role={role}><Ontology /></Guard>} />
            <Route path="/cohorts" element={<Guard perm="cohorts:view" role={role}><CohortBuilder tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/studies" element={<Guard perm="studies:view" role={role}><Studies tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/studies/:studyId" element={<Guard perm="studies:view" role={role}><Studies tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/agents" element={<Guard perm="agents:view" role={role}><AgentConsole tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/evidence" element={<Guard perm="evidence:view" role={role}><Evidence tenantId={tenantId} role={role} /></Guard>} />
            <Route path="/control" element={<Guard perm="controlplane:view" role={role}><ControlPlane actor={actor} role={role} /></Guard>} />
            <Route path="/users" element={<Guard perm="users:view" role={role}><Users tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="/settings" element={<Guard perm="settings:manage" role={role}><Settings tenantId={tenantId} actor={actor} role={role} /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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
