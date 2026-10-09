import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

/**
 * Root render path. The App tree is loaded dynamically so a live-mode
 * misconfiguration (StudioConfigError thrown while src/lib/api.ts resolves
 * VITE_EVIDIA_API_MODE=live without its required vars) is shown as a
 * visible configuration-error state instead of a blank page. Mock mode
 * (default) never takes this error path.
 */
function renderConfigError(error: unknown) {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const rec = error as { name?: string; missing?: unknown; message?: unknown } | null;
  const missing = Array.isArray(rec?.missing)
    ? (rec.missing as unknown[]).map(String)
    : [];
  const message = error instanceof Error ? error.message : String(error);
  createRoot(rootEl).render(
    <div className="app" role="alert" data-testid="config-error">
      <h1>Evidia Studio — configuration error</h1>
      <p>{message}</p>
      {missing.length > 0 ? (
        <p>
          Missing: <code>{missing.join(', ')}</code>. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, set the live vars, or set{' '}
          <code>VITE_EVIDIA_API_MODE=mock</code> for local fixtures.
        </p>
      ) : null}
      <p className="muted">See apps/studio/.env.example and README.md (Mock / live modes).</p>
    </div>,
  );
}

async function boot() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  try {
    const { default: App } = await import('./App');
    createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    renderConfigError(error);
  }
}

void boot();
