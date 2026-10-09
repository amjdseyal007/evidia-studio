/**
 * Demo session — mock sign-in, persisted locally.
 *
 * There is no real Cognito pool wired to this console. Login mints the
 * same fake-JWT seam src/lib/auth.ts already used (custom:tenant_id +
 * cognito:groups claims) so the API layer keeps one token source. Role
 * switching re-mints the token with the demo role's groups — this is a
 * UX gate for demonstration, NOT authentication or authorization.
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

export const DEMO_ACCOUNTS: SessionUser[] = [
  { name: 'Amjad Seyal', email: 'amjad@evidia.example', role: 'Platform Admin', tenant_id: 'acme_rare' },
  { name: 'Sarah Kim', email: 'sarah.kim@meridian.example', role: 'Tenant Admin', tenant_id: 'acme_rare' },
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const u = load();
    if (u) mintFor(u);
    return u;
  });

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

  const login = useCallback((email: string, role?: Role) => {
    const known = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.toLowerCase());
    const u: SessionUser = known
      ? { ...known, role: role ?? known.role }
      : { name: email.split('@')[0].replace(/[._]/g, ' ').trim() || 'Demo User', email, role: role ?? 'Auditor', tenant_id: 'acme_rare' };
    persist(u);
  }, [persist]);

  const logout = useCallback(() => persist(null), [persist]);
  const switchRole = useCallback((role: Role) => {
    if (user) persist({ ...user, role });
  }, [user, persist]);
  const switchTenant = useCallback((tenant_id: string) => {
    if (user) persist({ ...user, tenant_id });
  }, [user, persist]);

  const value = useMemo<SessionCtx>(() => ({ user, login, logout, switchRole, switchTenant }), [user, login, logout, switchRole, switchTenant]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
