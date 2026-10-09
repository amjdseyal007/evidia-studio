import { useState, type FormEvent } from 'react';
import { useSession, DEMO_ACCOUNTS } from '../lib/session';
import { ROLES, type Role } from '../lib/permissions';
import { MODE } from '../lib/api';

export default function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid work email.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters (demo accepts anything).');
      return;
    }
    login(email);
  }

  return (
    <div className="login-page">
      <div className="login-card" data-testid="login-card">
        <h1>Evidia Studio</h1>
        <p className="muted">Evidence Platform console — sign in to your tenant workspace.</p>

        <form onSubmit={submit} style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="login-email">Work email</label>
            <input id="login-email" className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error ? <div className="field-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Sign in</button>
        </form>

        <div className="muted" style={{ textAlign: 'center', margin: '14px 0 8px' }}>or continue with SSO</div>
        <button type="button" className="btn sso-btn" onClick={() => login('amjad@evidia.example')}>Continue with Okta (demo)</button>
        <button type="button" className="btn sso-btn" onClick={() => login('amjad@evidia.example')}>Continue with Microsoft Entra (demo)</button>

        <div className="muted" style={{ marginTop: 16 }}>Demo accounts — one per role (RBAC gates the console):</div>
        <div className="demo-accounts">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" className="btn demo-account" data-testid={`demo-login-${a.role}`}
              onClick={() => login(a.email, a.role as Role)}>
              <strong>{a.role}</strong><br /><span className="muted">{a.email}</span>
            </button>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 16, fontSize: 11.5 }}>
          DEMO — mock data only. API mode: <code>{MODE}</code>. No real authentication, no live backend;
          sessions persist locally in your browser. Role switching later re-mints a demo token (UX gate, not security).
        </p>
      </div>
    </div>
  );
}

export { ROLES };
