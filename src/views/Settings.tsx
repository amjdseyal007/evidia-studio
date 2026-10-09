import { useRef, useState } from 'react';
import { api, type ApiKeyRecord, type ControlTenant } from '../lib/api';
import { useStore } from '../lib/store';
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
    </section>
  );
}
