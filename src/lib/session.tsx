/**
 * Demo session — mock sign-in, persisted locally.
 *
 * There is no real Cognito pool wired to this console. Login mints the
 * same fake-JWT seam src/lib/auth.ts already used (custom:tenant_id +
 * cognito:groups claims) so the API layer keeps one token source. Role
 * switching re-mints the token with the demo role's groups — this is a
 * UX gate for demonstration, NOT authentication or authorization.
 *
 * View-as support sessions: Platform/Delivery Admins may enter a
 * UI-level "view as tenant" scope (persisted separately). The token's
 * home-tenant claim is unchanged — view-as only scopes what the UI
 * renders. View-as sessions expire after 30 minutes (enforced by the
 * shell against viewAsStartedAt), and a break-glass window may
 * temporarily elevate an active view-as session. Logging out or
 * switching role ends any active support session.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clearToken, makeFakeJwt, setToken } from './auth';
import { cognitoGroupsFor, type Role } from './permissions';

export interface SessionUser {
  name: string;
  email: string;
  role: Role;
  tenant_id: string;
}

const SESSION_KEY = 'evidia.session.v1';
const VIEWAS_KEY = 'evidia.session.viewas.v1';

export const DEMO_ACCOUNTS: SessionUser[] = [
  { name: 'Amjad Seyal', email: 'amjad@evidia.example', role: 'Platform Admin', tenant_id: 'acme_rare' },
  { name: 'Sarah Kim', email: 'sarah.kim@meridian.example', role: 'Tenant Admin', tenant_id: 'acme_rare' },
  { name: 'Maya Chen', email: 'maya.chen@evidia.example', role: 'Delivery Admin', tenant_id: 'platform' },
  { name: 'Priya Nair', email: 'priya.nair@acme.example', role: 'Biostatistician', tenant_id: 'acme_rare' },
  { name: 'Tom Alvarez', email: 'tom.alvarez@acme.example', role: 'Data Engineer', tenant_id: 'acme_rare' },
  { name: 'Dana Whitfield', email: 'dana.whitfield@acme.example', role: 'Auditor', tenant_id: 'acme_rare' },
];

export interface SessionCtx {
  user: SessionUser | null;
  login: (email: string, role?: Role) => void;
  logout: () => void;
  switchRole: (role: Role) => void;
  switchTenant: (tenant_id: string) => void;
  viewAsTenantId: string | null;
  viewAsStartedAt: number | null;
  breakGlassUntil: number | null;
  enterViewAs: (tenant_id: string) => void;
  exitViewAs: () => void;
  activateBreakGlass: (minutes: number) => void;
  clearBreakGlass: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function mintFor(user: SessionUser) {
  setToken(makeFakeJwt(user.tenant_id, cognitoGroupsFor(user.role, user.tenant_id)));
}

function load(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as SessionUser;
    return u && u.email ? u : null;
  } catch {
    return null;
  }
}

interface ViewAsState {
  tenant_id: string | null;
  started_at: number | null;
}

function loadViewAs(): ViewAsState {
  try {
    const raw = localStorage.getItem(VIEWAS_KEY);
    if (!raw) return { tenant_id: null, started_at: null };
    try {
      const parsed = JSON.parse(raw) as Partial<{ tenant_id: unknown; started_at: unknown }>;
      if (parsed && typeof parsed.tenant_id === 'string' && parsed.tenant_id) {
        return {
          tenant_id: parsed.tenant_id,
          started_at: typeof parsed.started_at === 'number' && Number.isFinite(parsed.started_at)
            ? parsed.started_at
            : Date.now(),
        };
      }
    } catch { /* not JSON — fall through to legacy bare-string handling */ }
    // Legacy payload: the bare tenant id string itself.
    return { tenant_id: raw, started_at: Date.now() };
  } catch {
    return { tenant_id: null, started_at: null };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const u = load();
    if (u) mintFor(u);
    return u;
  });
  const [initialViewAs] = useState<ViewAsState>(() => loadViewAs());
  const [viewAsTenantId, setViewAsTenantId] = useState<string | null>(initialViewAs.tenant_id);
  const [viewAsStartedAt, setViewAsStartedAt] = useState<number | null>(initialViewAs.started_at);
  const [breakGlassUntil, setBreakGlassUntil] = useState<number | null>(null);

  const persist = useCallback((u: SessionUser | null) => {
    setUser(u);
    try {
      if (u) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(u));
        mintFor(u);
      } else {
        localStorage.removeItem(SESSION_KEY);
        clearToken();
      }
    } catch { /* storage unavailable (private mode) — session stays in memory */ }
  }, []);

  const enterViewAs = useCallback((tenant_id: string) => {
    const started_at = Date.now();
    setViewAsTenantId(tenant_id);
    setViewAsStartedAt(started_at);
    setBreakGlassUntil(null);
    try {
      localStorage.setItem(VIEWAS_KEY, JSON.stringify({ tenant_id, started_at }));
    } catch { /* storage unavailable (private mode) — view-as stays in memory */ }
  }, []);

  const exitViewAs = useCallback(() => {
    setViewAsTenantId(null);
    setViewAsStartedAt(null);
    setBreakGlassUntil(null);
    try {
      localStorage.removeItem(VIEWAS_KEY);
    } catch { /* storage unavailable (private mode) */ }
  }, []);

  const activateBreakGlass = useCallback((minutes: number) => {
    // Break-glass only elevates an active view-as session.
    if (!viewAsTenantId) return;
    setBreakGlassUntil(Date.now() + minutes * 60000);
  }, [viewAsTenantId]);

  const clearBreakGlass = useCallback(() => {
    setBreakGlassUntil(null);
  }, []);

  const login = useCallback((email: string, role?: Role) => {
    const known = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.toLowerCase());
    const u: SessionUser = known
      ? { ...known, role: role ?? known.role }
      : { name: email.split('@')[0].replace(/[._]/g, ' ').trim() || 'Demo User', email, role: role ?? 'Auditor', tenant_id: 'acme_rare' };
    persist(u);
  }, [persist]);

  const logout = useCallback(() => {
    exitViewAs();
    persist(null);
  }, [persist, exitViewAs]);
  const switchRole = useCallback((role: Role) => {
    if (user) {
      exitViewAs();
      persist({ ...user, role });
    }
  }, [user, persist, exitViewAs]);
  const switchTenant = useCallback((tenant_id: string) => {
    if (user) persist({ ...user, tenant_id });
  }, [user, persist]);

  const value = useMemo<SessionCtx>(() => ({ user, login, logout, switchRole, switchTenant, viewAsTenantId, viewAsStartedAt, breakGlassUntil, enterViewAs, exitViewAs, activateBreakGlass, clearBreakGlass }), [user, login, logout, switchRole, switchTenant, viewAsTenantId, viewAsStartedAt, breakGlassUntil, enterViewAs, exitViewAs, activateBreakGlass, clearBreakGlass]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
