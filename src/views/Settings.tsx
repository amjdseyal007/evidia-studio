import { useRef, useState } from 'react';
import { api, type ApiKeyRecord, type ControlTenant } from '../lib/api';
import { recordAudit, useStore } from '../lib/store';
import { PERMISSIONS, PERMISSION_LABELS, can, type Permission, type Role } from '../lib/permissions';
import { ConfirmDialog, DataTable, Modal, Pill, SectionTitle, fmtDate, toneForStatus, useToasts, type Column } from '../components/ui';

type Profile = {
  displayName: string;
  contactEmail: string;
  region: string;
  isolation: ControlTenant['isolation'];
};

type ApiKeyRow = {
  key_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used: string | null;
  status: 'active' | 'revoked';
};

type NotifPrefs = {
  pipelineCompletions: boolean;
  pipelineFailures: boolean;
  agentRunFailures: boolean;
  weeklyDqDigest: boolean;
  billingAlerts: boolean;
};

const NOTIF_KEY = 'evidia.notifprefs';
const DEFAULT_NOTIFS: NotifPrefs = {
  pipelineCompletions: true,
  pipelineFailures: true,
  agentRunFailures: true,
  weeklyDqDigest: false,
  billingAlerts: true,
};

function loadNotifs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return { ...DEFAULT_NOTIFS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return { ...DEFAULT_NOTIFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFS };
  }
}

export default function Settings({ tenantId, actor, role }: { tenantId: string; actor: string; role: Role }) {
  const store = useStore();
  const { push } = useToasts();
  const tenant = store.tenants.find((t) => t.tenant_id === tenantId);

  const settingsAllowed = can(role, 'settings:manage');
  const keysAllowed = can(role, 'apikeys:manage');

  const [profileCache, setProfileCache] = useState<Record<string, Profile>>({});
  const profile: Profile = profileCache[tenantId] ?? {
    displayName: tenant?.display_name ?? '',
    contactEmail: '',
    region: tenant?.region ?? 'us-east-1',
    isolation: tenant?.isolation ?? 'pooled',
  };
  const [profileErrors, setProfileErrors] = useState<{ displayName?: string; contactEmail?: string; region?: string }>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<Permission[]>([]);
  const [keyNameError, setKeyNameError] = useState('');
  const [creating, setCreating] = useState(false);
  const [secretReveal, setSecretReveal] = useState<{ record: ApiKeyRecord; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null);
  const secretInputRef = useRef<HTMLInputElement>(null);

  const [notifs, setNotifs] = useState<NotifPrefs>(() => loadNotifs());

  // --- security policies (demo — saved locally + audited) ---
  const [secSessionTimeout, setSecSessionTimeout] = useState('30');
  const [secMfa, setSecMfa] = useState(true);
  const [secAllowlist, setSecAllowlist] = useState('');
  // --- SSO (mock config — no real IdP is contacted) ---
  const [ssoProvider, setSsoProvider] = useState<'okta' | 'entra' | 'none'>('okta');
  const [ssoIssuer, setSsoIssuer] = useState('');
  const [ssoClientId, setSsoClientId] = useState('');
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  // --- webhooks ---
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<string[]>(['evidence.package.signed']);
  const [whError, setWhError] = useState<string | null>(null);
  const [whTesting, setWhTesting] = useState<string | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<string | null>(null);
  const tenantWebhooks = store.webhooks.filter((w) => w.tenant_id === tenantId);

  function saveSecurityPolicies() {
    recordAudit({
      actor, tenant_id: tenantId, action: 'settings.security.updated', target: tenantId,
      detail: `Session timeout ${secSessionTimeout} min · MFA ${secMfa ? 'required' : 'optional'} · IP allowlist ${secAllowlist.trim() ? 'set' : 'open'} (demo — enforced at deploy)`,
      result: 'success',
    });
    push({ title: 'Security policies saved (demo)', body: 'Policies are recorded in the audit log; enforcement lands with the live identity stack.', tone: 'ok' });
  }

  function saveSso() {
    if (ssoEnabled && ssoProvider !== 'none') {
      if (!/^https:\/\//.test(ssoIssuer.trim())) {
        setSsoError('Issuer URL must start with https://.');
        return;
      }
      if (!ssoClientId.trim()) {
        setSsoError('Client ID is required when SSO is enabled.');
        return;
      }
    }
    setSsoError(null);
    recordAudit({
      actor, tenant_id: tenantId, action: 'settings.sso.updated', target: tenantId,
      detail: ssoEnabled ? `SSO via ${ssoProvider} (issuer ${ssoIssuer.trim()}) — mock config, no IdP contacted` : 'SSO disabled (demo)',
      result: 'success',
    });
    push({ title: 'SSO configuration saved (demo)', body: ssoEnabled ? `${ssoProvider} configured as mock IdP — no real federation occurs in this demo.` : 'SSO disabled.', tone: 'ok' });
  }

  async function submitCreateWebhook() {
    if (!/^https:\/\//.test(whUrl.trim())) {
      setWhError('Webhook URL must start with https://.');
      return;
    }
    if (whEvents.length === 0) {
      setWhError('Subscribe to at least one event.');
      return;
    }
    setWhError(null);
    try {
      await api.createWebhook({ tenant_id: tenantId, url: whUrl.trim(), events: whEvents }, actor);
      setWhUrl('');
      push({ title: 'Webhook created', body: 'Deliveries are simulated in this demo — no network calls are made.', tone: 'ok' });
    } catch {
      push({ title: 'Webhook failed', body: 'The demo store rejected the webhook.', tone: 'err' });
    }
  }

  function updateProfile(patch: Partial<Profile>) {
    setProfileCache((prev) => ({ ...prev, [tenantId]: { ...profile, ...patch } }));
  }

  function saveProfile() {
    const errors: { displayName?: string; contactEmail?: string; region?: string } = {};
    if (!profile.displayName.trim()) errors.displayName = 'Display name is required.';
    if (profile.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail.trim())) {
      errors.contactEmail = 'Enter a valid contact email, or leave it blank.';
    }
    if (!profile.region.trim()) errors.region = 'Region is required.';
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;
    push({ title: 'Profile updated (demo)', body: `Tenant profile for ${tenantId} saved locally by ${actor}. It is not written to a live backend.`, tone: 'ok' });
  }

  const tenantKeys = store.apiKeys.filter((k) => k.tenant_id === tenantId);
  const keyRows: ApiKeyRow[] = tenantKeys.map((k) => ({
    key_id: k.key_id,
    name: k.name,
    prefix: k.prefix,
    scopes: [...(k.scopes ?? [])],
    created_at: k.created_at,
    last_used: k.last_used,
    status: k.status,
  }));

  async function submitCreateKey() {
    if (!keyName.trim()) {
      setKeyNameError('Key name is required.');
      return;
    }
    setKeyNameError('');
    setCreating(true);
    try {
      const result = await api.createApiKey(keyName.trim(), tenantId, actor, keyScopes);
      setCreateOpen(false);
      setKeyName('');
      setKeyScopes([]);
      setSecretReveal(result);
      push({ title: 'API key created', body: `Key “${result.record.name}” created for ${tenantId}. Copy the secret now — it is shown once.`, tone: 'ok' });
    } catch {
      push({ title: 'Key creation failed', body: 'The demo store rejected the request.', tone: 'err' });
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    try {
      await api.revokeApiKey(revoking.key_id, actor);
      push({ title: 'API key revoked', body: `Key “${revoking.name}” has been revoked (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Revoke failed', body: 'The demo store rejected the request.', tone: 'err' });
    } finally {
      setRevoking(null);
    }
  }

  async function copySecret() {
    if (!secretReveal) return;
    try {
      await navigator.clipboard.writeText(secretReveal.secret);
      push({ title: 'Copied', body: 'API secret copied to the clipboard.', tone: 'ok' });
    } catch {
      secretInputRef.current?.focus();
      secretInputRef.current?.select();
      push({ title: 'Copy manually', body: 'Clipboard is unavailable here — the secret is selected, copy it with Ctrl/Cmd+C.', tone: 'warn' });
    }
  }

  function saveNotifs() {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
    } catch {
      /* storage unavailable — prefs still apply for this session */
    }
    push({ title: 'Preferences saved', body: 'Notification preferences saved to this browser (demo).', tone: 'ok' });
  }

  const keyColumns: Array<Column<ApiKeyRow>> = [
    { key: 'name', label: 'Name', sortValue: (r) => r.name, render: (r) => r.name },
    { key: 'prefix', label: 'Prefix', render: (r) => <span className="mono">{r.prefix}…</span> },
    {
      key: 'scopes',
      label: 'Scopes',
      render: (r) =>
        r.scopes.length === 0 ? (
          <span className="muted">Unscoped (legacy demo)</span>
        ) : (
          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {r.scopes.map((s) => (
              <Pill key={s} tone="info">{s}</Pill>
            ))}
          </span>
        ),
    },
    { key: 'created', label: 'Created', sortValue: (r) => r.created_at, render: (r) => fmtDate(r.created_at) },
    { key: 'used', label: 'Last used', sortValue: (r) => r.last_used ?? '', render: (r) => fmtDate(r.last_used) },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill> },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) =>
        r.status === 'active' ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setRevoking(store.apiKeys.find((k) => k.key_id === r.key_id) ?? null)}
          >
            Revoke
          </button>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  const notifRows: Array<{ key: keyof NotifPrefs; label: string; hint: string }> = [
    { key: 'pipelineCompletions', label: 'Pipeline completions', hint: 'Notify when a data-pipeline run finishes successfully.' },
    { key: 'pipelineFailures', label: 'Pipeline failures', hint: 'Notify when a data-pipeline run fails or is blocked.' },
    { key: 'agentRunFailures', label: 'Agent run failures', hint: 'Notify when an agent run fails.' },
    { key: 'weeklyDqDigest', label: 'Weekly DQ digest', hint: 'A weekly data-quality summary for this tenant.' },
    { key: 'billingAlerts', label: 'Billing alerts', hint: 'Usage and unpriced-record alerts for this tenant.' },
  ];

  return (
    <section>
      <SectionTitle title="Settings" sub={`Tenant settings for ${tenant?.display_name ?? tenantId} (${tenantId}).`} />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Tenant profile</h3>
        {!settingsAllowed ? (
          <p className="muted">Not permitted — settings:manage is required to edit the tenant profile. Your role ({role}) sees a read-only view (demo gate).</p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile();
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label htmlFor="prof-name">Display name *</label>
              <input
                id="prof-name"
                className="input"
                value={profile.displayName}
                disabled={!settingsAllowed}
                onChange={(e) => updateProfile({ displayName: e.target.value })}
              />
              {profileErrors.displayName ? <span className="field-error">{profileErrors.displayName}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="prof-email">Contact email</label>
              <input
                id="prof-email"
                className="input"
                type="email"
                value={profile.contactEmail}
                disabled={!settingsAllowed}
                onChange={(e) => updateProfile({ contactEmail: e.target.value })}
                placeholder="admin@tenant.example"
              />
              {profileErrors.contactEmail ? <span className="field-error">{profileErrors.contactEmail}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="prof-region">Region *</label>
              <select id="prof-region" className="select" value={profile.region} disabled={!settingsAllowed} onChange={(e) => updateProfile({ region: e.target.value })}>
                <option value="us-east-1">us-east-1</option>
                <option value="us-west-2">us-west-2</option>
                <option value="eu-west-1">eu-west-1</option>
              </select>
              {profileErrors.region ? <span className="field-error">{profileErrors.region}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="prof-iso">Isolation</label>
              <select
                id="prof-iso"
                className="select"
                value={profile.isolation}
                disabled={!settingsAllowed}
                onChange={(e) => updateProfile({ isolation: e.target.value as ControlTenant['isolation'] })}
              >
                <option value="pooled">pooled</option>
                <option value="silo">silo</option>
                <option value="client-cloud">client-cloud</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={!settingsAllowed}>Save profile</button>
            <span className="muted">Saved locally for this session only (demo) — switching tenants and back keeps your edits here.</span>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <SectionTitle
          title="API keys"
          sub="Programmatic access keys for this tenant. Secrets are shown once at creation."
          actions={
            keysAllowed ? (
              <button type="button" className="btn btn-primary" onClick={() => { setKeyName(''); setKeyScopes([]); setKeyNameError(''); setCreateOpen(true); }}>Create API key</button>
            ) : null
          }
        />
        {!keysAllowed ? (
          <p className="muted">Not permitted — apikeys:manage is required to view or manage API keys. Your role ({role}) cannot manage keys in this demo gate.</p>
        ) : (
          <div data-testid="api-keys">
            <p className="muted">API keys are service accounts — a key can only call what its scopes allow. Secrets are shown once, at creation.</p>
            <DataTable rows={keyRows} columns={keyColumns} rowKey={(r) => r.key_id} emptyText="No API keys for this tenant yet." />
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Notification preferences</h3>
        <p className="muted">Choose which events notify this tenant's operators. Stored in this browser under <span className="mono">evidia.notifprefs</span>.</p>
        {notifRows.map((row) => (
          <div key={row.key} className="field" style={{ marginBottom: 8 }}>
            <label className="row" style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={notifs[row.key]}
                onChange={(e) => setNotifs((prev) => ({ ...prev, [row.key]: e.target.checked }))}
              />
              <span><strong>{row.label}</strong> — <span className="muted">{row.hint}</span></span>
            </label>
          </div>
        ))}
        <button type="button" className="btn btn-primary" onClick={saveNotifs}>Save preferences</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }} data-testid="security-policies">
        <h3>Security policies</h3>
        <p className="muted">Tenant-level session and access policies. Saved to the demo audit log; enforced by the live identity stack at deploy — changing them here changes nothing about this demo session.</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="sec-timeout">Session timeout (minutes)</label>
            <select id="sec-timeout" className="select" value={secSessionTimeout} disabled={!settingsAllowed} onChange={(e) => setSecSessionTimeout(e.target.value)}>
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="480">480 (8 hours)</option>
            </select>
          </div>
          <div className="field">
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={secMfa} disabled={!settingsAllowed} onChange={(e) => setSecMfa(e.target.checked)} />
              <span><strong>Require MFA</strong> — <span className="muted">all tenant users must enroll a second factor (demo flag).</span></span>
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="sec-allowlist">IP allowlist (CIDR ranges, one per line — blank = open)</label>
          <textarea id="sec-allowlist" className="input mono" rows={3} value={secAllowlist} disabled={!settingsAllowed}
            onChange={(e) => setSecAllowlist(e.target.value)} placeholder="203.0.113.0/24" />
          <span className="hint">Support view-as sessions and break-glass are always logged regardless of allowlist (demo note).</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={!settingsAllowed} data-testid="sec-save" onClick={saveSecurityPolicies}>Save policies</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }} data-testid="sso-config">
        <h3>Single sign-on (SSO)</h3>
        <p className="muted">Mock IdP configuration. The login page's "Continue with Okta / Microsoft Entra (demo)" buttons mirror this choice; no real federation happens in the demo.</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="sso-provider">Provider</label>
            <select id="sso-provider" className="select" value={ssoProvider} disabled={!settingsAllowed}
              onChange={(e) => setSsoProvider(e.target.value as 'okta' | 'entra' | 'none')}>
              <option value="okta">Okta</option>
              <option value="entra">Microsoft Entra ID</option>
              <option value="none">None (local accounts only)</option>
            </select>
          </div>
          <div className="field">
            <label className="row" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={ssoEnabled} disabled={!settingsAllowed} onChange={(e) => setSsoEnabled(e.target.checked)} />
              <span><strong>SSO enabled</strong> — <span className="muted">route sign-in through the IdP (demo flag).</span></span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="sso-issuer">Issuer URL</label>
            <input id="sso-issuer" className="input" value={ssoIssuer} disabled={!settingsAllowed}
              onChange={(e) => setSsoIssuer(e.target.value)} placeholder="https://acme.okta.com" />
          </div>
          <div className="field">
            <label htmlFor="sso-client">Client ID</label>
            <input id="sso-client" className="input mono" value={ssoClientId} disabled={!settingsAllowed}
              onChange={(e) => setSsoClientId(e.target.value)} placeholder="0oa…" />
          </div>
        </div>
        {ssoError ? <span className="field-error">{ssoError}</span> : null}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!settingsAllowed} data-testid="sso-save" onClick={saveSso}>Save SSO</button>
          <button type="button" className="btn" disabled={!settingsAllowed}
            onClick={() => push({ title: 'SSO test (demo)', body: `Simulated authorization-code round-trip to ${ssoIssuer.trim() || 'the configured issuer'} succeeded in 212 ms. No network call was made.`, tone: 'info' })}>
            Test SSO (demo)
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }} data-testid="webhooks">
        <SectionTitle
          title="Webhooks"
          sub="Outbound event notifications (SIEM/Slack/your pipeline). Deliveries are simulated in this demo — endpoints are never actually called."
        />
        {tenantWebhooks.length === 0 ? (
          <p className="muted">No webhooks for this tenant yet.</p>
        ) : (
          <ul className="list">
            {tenantWebhooks.map((w) => (
              <li key={w.webhook_id} data-testid={`webhook-${w.webhook_id}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <span className="mono">{w.url}</span>{' '}
                    <Pill tone={w.enabled ? 'ok' : 'neutral'}>{w.enabled ? 'enabled' : 'disabled'}</Pill>
                    <br />
                    <span className="muted">Events: {w.events.join(', ') || 'none'} · created {fmtDate(w.created_at)}</span>
                    <br />
                    <span className="muted">
                      {w.last_delivery ? `Last delivery: HTTP ${w.last_delivery.status_code} · ${fmtDate(w.last_delivery.at)} (simulated)` : 'No deliveries yet'}
                    </span>
                  </span>
                  <span className="row">
                    <button type="button" className="btn btn-sm" disabled={whTesting === w.webhook_id || !keysAllowed}
                      onClick={async () => {
                        setWhTesting(w.webhook_id);
                        try {
                          const res = await api.testWebhook(w.webhook_id, actor);
                          push({ title: 'Test event delivered (simulated)', body: res.message, tone: 'ok' });
                        } finally {
                          setWhTesting(null);
                        }
                      }}>
                      {whTesting === w.webhook_id ? 'Sending…' : 'Send test event'}
                    </button>
                    <button type="button" className="btn btn-sm" disabled={!keysAllowed}
                      onClick={() => void api.setWebhookEnabled(w.webhook_id, !w.enabled, actor)}>
                      {w.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" disabled={!keysAllowed}
                      onClick={() => setDeletingWebhook(w.webhook_id)}>
                      Delete
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {keysAllowed ? (
          <form onSubmit={(e) => { e.preventDefault(); void submitCreateWebhook(); }} style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="wh-url">Endpoint URL (https)</label>
              <input id="wh-url" data-testid="webhook-url" className="input" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://hooks.example.com/evidia" />
            </div>
            <div className="field">
              <span className="muted">Events</span>
              <div className="checklist">
                {['evidence.package.signed', 'evidence.package.exported', 'pipeline.run.completed', 'service.disabled', 'ontology.version.approved', 'tenant.offboard.completed'].map((ev) => (
                  <label key={ev} className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={whEvents.includes(ev)}
                      onChange={(e) => setWhEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))} />
                    <span className="mono" style={{ fontSize: 12 }}>{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            {whError ? <span className="field-error">{whError}</span> : null}
            <button type="submit" className="btn btn-primary" data-testid="webhook-create">Create webhook</button>
          </form>
        ) : (
          <p className="muted">Managing webhooks requires the apikeys:manage permission (service-account surface).</p>
        )}
      </div>

      <div className="card">
        <h3>Danger zone</h3>
        <p className="muted">
          Tenant offboarding permanently deletes tenant data and schedules the KMS key for deletion, so it lives in the Control Plane behind a fail-closed evaluation guard — it is never a one-click action from Settings.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() =>
            push({
              title: 'Offboarding lives in Control Plane',
              body: 'Open Control Plane → Tenants → Offboard. The guard evaluates active studies, datasets, and running pipelines first and stays blocked (fail-closed) until every reason clears.',
              tone: 'warn',
            })
          }
        >
          Request tenant offboarding
        </button>
      </div>

      {createOpen ? (
        <Modal title="Create API key" onClose={() => setCreateOpen(false)} testId="create-key-modal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreateKey();
            }}
          >
            <div className="field">
              <label htmlFor="key-name">Key name *</label>
              <input id="key-name" className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. Analyst workstation" />
              {keyNameError ? <span className="field-error">{keyNameError}</span> : null}
              <span className="hint">The full secret is shown once after creation. Store it in your secrets manager.</span>
            </div>
            <div className="field">
              <span className="muted">Scopes</span>
              <p className="muted" style={{ margin: '4px 0 8px' }}>A key can only call what its scopes allow. Leave all unchecked for an unscoped legacy demo key.</p>
              <div className="checklist">
                {PERMISSIONS.map((perm) => (
                  <label key={perm} className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      data-testid={`key-scope-${perm}`}
                      checked={keyScopes.includes(perm)}
                      onChange={(e) => setKeyScopes((prev) => (e.target.checked ? [...prev, perm] : prev.filter((x) => x !== perm)))}
                    />
                    <span>{PERMISSION_LABELS[perm]} <span className="mono muted" style={{ fontSize: 11 }}>{perm}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create key'}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {secretReveal ? (
        <Modal title="API key created — shown once" onClose={() => setSecretReveal(null)} testId="secret-modal">
          <p><strong>Warning:</strong> this secret is shown once. Copy it now into your secrets manager — it cannot be retrieved again (demo).</p>
          <div className="field">
            <label htmlFor="secret-value">Secret for “{secretReveal.record.name}”</label>
            <input
              id="secret-value"
              ref={secretInputRef}
              className="input mono"
              readOnly
              value={secretReveal.secret}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </div>
          <p className="muted">Prefix <span className="mono">{secretReveal.record.prefix}…</span> identifies this key in the list. Revoke it from the API keys table if it leaks.</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => void copySecret()}>Copy</button>
            <button type="button" className="btn btn-primary" onClick={() => setSecretReveal(null)}>Done</button>
          </div>
        </Modal>
      ) : null}

      {revoking ? (
        <ConfirmDialog
          title={`Revoke “${revoking.name}”?`}
          body={
            <span>
              Revoking key <span className="mono">{revoking.prefix}…</span> immediately blocks further API calls with it (demo). This cannot be undone — create a new key instead.
            </span>
          }
          confirmLabel="Revoke key"
          danger
          onConfirm={() => void confirmRevoke()}
          onCancel={() => setRevoking(null)}
        />
      ) : null}

      {deletingWebhook ? (
        <ConfirmDialog
          title="Delete webhook?"
          body={
            <span>
              Webhook <span className="mono">{store.webhooks.find((w) => w.webhook_id === deletingWebhook)?.url}</span> will stop receiving events (demo). This cannot be undone.
            </span>
          }
          confirmLabel="Delete webhook"
          danger
          onConfirm={async () => {
            const id = deletingWebhook;
            setDeletingWebhook(null);
            await api.deleteWebhook(id, actor);
            push({ title: 'Webhook deleted', body: 'Endpoint removed (demo).', tone: 'ok' });
          }}
          onCancel={() => setDeletingWebhook(null)}
        />
      ) : null}
    </section>
  );
}
