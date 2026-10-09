/**
 * Connectors view — BYOD connector registry for one tenant.
 *
 * Reactive state comes from the demo store (`useStore`); mutations go
 * through the API seam (`api`). Connectors here are BUILT-MOCK capability
 * demos — no live accounts exist yet (see the honest note card below).
 */
import { useMemo, useState } from 'react';
import { api, type ConnectorRecord } from '../lib/api';
import { useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import {
  ConfirmDialog, DataTable, EmptyState, Modal, Pill, SectionTitle,
  fmtDate, toneForStatus, useToasts, type Column, type Tone,
} from '../components/ui';

const TYPE_LABELS: Record<ConnectorRecord['type'], string> = {
  snowflake: 'Snowflake',
  databricks: 'Databricks',
  foundry: 'Palantir Foundry',
  rest: 'Custom REST',
};

const TYPE_BLURBS: Record<ConnectorRecord['type'], string> = {
  snowflake: 'Warehouse tables — LAND extracts or VIRTUAL pushdown queries.',
  databricks: 'Unity Catalog tables via workspace SQL endpoints.',
  foundry: 'Ontology-synchronized objects (virtual by design).',
  rest: 'Any HTTPS JSON endpoint with scheduled incremental pulls.',
};

const MODE_TONES: Record<ConnectorRecord['mode'], Tone> = {
  land: 'info',
  virtual: 'neutral',
};

const ALL_CAPABILITIES: Array<ConnectorRecord['capabilities'][number]> = [
  'pushdown', 'virtual', 'incremental', 'cdc',
];

const CONFIG_FIELDS: Record<ConnectorRecord['type'], Array<{ key: string; label: string; placeholder: string }>> = {
  snowflake: [
    { key: 'account', label: 'Account', placeholder: 'acme-rare.us-east-1' },
    { key: 'warehouse', label: 'Warehouse', placeholder: 'EVIDIA_WH' },
    { key: 'database', label: 'Database', placeholder: 'RWE_PROD' },
  ],
  databricks: [
    { key: 'workspace', label: 'Workspace', placeholder: 'acme.cloud.databricks.com' },
    { key: 'catalog', label: 'Catalog', placeholder: 'rwe_catalog' },
  ],
  foundry: [
    { key: 'stack', label: 'Foundry stack', placeholder: 'acme.palantirfoundry.com' },
  ],
  rest: [
    { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com/v2' },
  ],
};

interface WizardState {
  step: 1 | 2 | 3;
  type: ConnectorRecord['type'];
  name: string;
  mode: ConnectorRecord['mode'];
  capabilities: Array<ConnectorRecord['capabilities'][number]>;
  config: Record<string, string>;
}

const blankWizard = (): WizardState => ({
  step: 1, type: 'snowflake', name: '', mode: 'land', capabilities: ['pushdown'], config: {},
});

export default function Connectors({
  tenantId, actor, role,
}: {
  tenantId: string;
  actor: string;
  role: Role;
}) {
  const store = useStore();
  const { push } = useToasts();

  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [wizardErrors, setWizardErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectorRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = can(role, 'connectors:manage');

  // Spread into fresh object types — DataTable requires an index signature,
  // which fixture interfaces do not carry.
  const connectors = useMemo(
    () => store.connectors.filter((c) => c.tenant_id === tenantId).map((c) => ({ ...c })),
    [store.connectors, tenantId],
  );
  type ConnectorRow = (typeof connectors)[number];

  async function onTest(c: ConnectorRow) {
    setTestingId(c.connector_id);
    try {
      const res = await api.testConnector(c.connector_id, actor);
      if (res.ok) {
        push({ title: 'Connection test passed', body: `${c.name} · ${res.latency_ms} ms — ${res.message}`, tone: 'ok' });
      } else {
        push({ title: 'Connection test failed', body: `${c.name} — ${res.message}`, tone: 'err' });
      }
    } catch (err) {
      push({ title: 'Connection test failed', body: (err as Error).message, tone: 'err' });
    } finally {
      setTestingId(null);
    }
  }

  async function onToggle(c: ConnectorRow) {
    setTogglingId(c.connector_id);
    try {
      await api.setConnectorEnabled(c.connector_id, !c.enabled, actor);
      push({
        title: c.enabled ? 'Connector disabled' : 'Connector enabled',
        body: c.name,
        tone: 'ok',
      });
    } catch (err) {
      push({ title: 'Could not update connector', body: (err as Error).message, tone: 'err' });
    } finally {
      setTogglingId(null);
    }
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteConnector(deleteTarget.connector_id, actor);
      push({ title: 'Connector deleted', body: deleteTarget.name, tone: 'ok' });
      setDeleteTarget(null);
    } catch (err) {
      push({ title: 'Could not delete connector', body: (err as Error).message, tone: 'err' });
    } finally {
      setDeleting(false);
    }
  }

  // ------------------------------------------------------------- wizard
  function wizardNext() {
    if (!wizard) return;
    if (wizard.step === 1) {
      if (!wizard.name.trim()) {
        setWizardErrors({ name: 'Connector name is required.' });
        return;
      }
      setWizardErrors({});
      setWizard((w) => (w ? { ...w, step: 2 } : w));
      return;
    }
    if (wizard.step === 2) {
      const errors: Record<string, string> = {};
      for (const f of CONFIG_FIELDS[wizard.type]) {
        if (!wizard.config[f.key]?.trim()) errors[f.key] = `${f.label} is required.`;
      }
      if (!wizard.config.secret_ref?.trim()) {
        errors.secret_ref = 'Secret reference is required (a Secrets Manager path — never a real secret).';
      }
      if (wizard.capabilities.length === 0) {
        errors.capabilities = 'Select at least one capability.';
      }
      setWizardErrors(errors);
      if (Object.keys(errors).length === 0) {
        setWizard((w) => (w ? { ...w, step: 3 } : w));
      }
    }
  }

  async function wizardSave() {
    if (!wizard) return;
    setSaving(true);
    try {
      const created = await api.addConnector({
        name: wizard.name.trim(),
        type: wizard.type,
        mode: wizard.mode,
        capabilities: wizard.capabilities,
        config: wizard.config,
        tenant_id: tenantId,
        actor,
      });
      const res = await api.testConnector(created.connector_id, actor);
      if (res.ok) {
        push({
          title: 'Connector saved & tested',
          body: `${created.name} · test passed in ${res.latency_ms} ms`,
          tone: 'ok',
        });
      } else {
        push({
          title: 'Connector saved, test failed',
          body: `${created.name} — ${res.message}`,
          tone: 'warn',
        });
      }
      setWizard(null);
      setWizardErrors({});
    } catch (err) {
      push({ title: 'Could not save connector', body: (err as Error).message, tone: 'err' });
    } finally {
      setSaving(false);
    }
  }

  const columns: Array<Column<ConnectorRow>> = [
    {
      key: 'name', label: 'Connector',
      render: (r) => (<><strong>{r.name}</strong><br /><span className="muted mono">{r.connector_id}</span></>),
      sortValue: (r) => r.name,
    },
    {
      key: 'type', label: 'Type',
      render: (r) => TYPE_LABELS[r.type],
      sortValue: (r) => TYPE_LABELS[r.type],
    },
    {
      key: 'mode', label: 'Mode',
      render: (r) => <Pill tone={MODE_TONES[r.mode]}>{r.mode.toUpperCase()}</Pill>,
      sortValue: (r) => r.mode,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill>,
      sortValue: (r) => r.status,
    },
    {
      key: 'capabilities', label: 'Capabilities',
      render: (r) => (
        <span className="row">
          {r.capabilities.map((cap) => <Pill key={cap} tone="neutral">{cap}</Pill>)}
        </span>
      ),
    },
    {
      key: 'last_test', label: 'Last test',
      render: (r) => (r.last_test
        ? <>{fmtDate(r.last_test.at)} <span className="muted">· {r.last_test.latency_ms} ms {r.last_test.ok ? '✓' : '✗'}</span></>
        : '—'),
      sortValue: (r) => r.last_test?.at ?? '',
    },
    {
      key: 'enabled', label: 'Enabled',
      render: (r) => (
        <button
          type="button"
          className={r.enabled ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
          disabled={!canManage || togglingId === r.connector_id}
          title={canManage
            ? (r.enabled ? 'Disable this connector' : 'Enable this connector')
            : 'Requires the connectors:manage permission'}
          onClick={() => void onToggle(r)}
        >
          {togglingId === r.connector_id ? '…' : r.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
      sortValue: (r) => (r.enabled ? 1 : 0),
    },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="row">
          <button
            type="button" className="btn btn-sm"
            disabled={testingId === r.connector_id}
            title="Run a simulated connection test"
            onClick={() => void onTest(r)}
          >
            {testingId === r.connector_id ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button" className="btn btn-sm btn-danger"
            disabled={!canManage}
            title={canManage ? 'Delete this connector' : 'Requires the connectors:manage permission'}
            onClick={() => setDeleteTarget(store.connectors.find((c) => c.connector_id === r.connector_id) ?? null)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <SectionTitle
        title="Connectors"
        sub="Bring-your-own-data connectors: LAND extracts into the tenant lake, or VIRTUAL pushdown against the source. Credentials are referenced by Secrets Manager path only."
        actions={(
          <button
            type="button" className="btn btn-primary" data-testid="add-connector-btn"
            disabled={!canManage}
            title={canManage ? 'Add a new connector' : 'Requires the connectors:manage permission'}
            onClick={() => { setWizard(blankWizard()); setWizardErrors({}); }}
          >
            Add connector
          </button>
        )}
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>Capability demo — BUILT-MOCK.</strong>{' '}
        <span className="muted">
          These connectors demonstrate the interface (test / discover / capabilities / extract) against
          simulated transports. No live Snowflake, Databricks, or Palantir Foundry accounts are wired
          yet — live connections land with the vendor partnerships. Tests below are simulated handshakes,
          not real network calls.
        </span>
      </div>

      {connectors.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No connectors yet"
            body="Add the first connector to land or virtualize data from Snowflake, Databricks, Foundry, or a custom REST source."
          />
        </div>
      ) : (
        <DataTable
          rows={connectors}
          columns={columns}
          rowKey={(r) => r.connector_id}
          testId="connector-table"
          emptyText="No connectors match the filter."
        />
      )}

      {wizard ? (
        <Modal title={`Add connector — step ${wizard.step} of 3`} onClose={() => setWizard(null)} testId="add-connector-wizard">
          {wizard.step === 1 ? (
            <div>
              <p className="muted">Pick the connector type and give it a display name.</p>
              <div className="grid-2">
                {(Object.keys(TYPE_LABELS) as Array<ConnectorRecord['type']>).map((t) => (
                  <button
                    key={t} type="button"
                    className={wizard.type === t ? 'card btn-primary' : 'card'}
                    style={{ textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => setWizard((w) => (w ? { ...w, type: t, config: {} } : w))}
                  >
                    <strong>{TYPE_LABELS[t]}</strong>
                    <br />
                    <span className={wizard.type === t ? '' : 'muted'}>{TYPE_BLURBS[t]}</span>
                  </button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="conn-name">Connector name</label>
                <input
                  id="conn-name" className="input" type="text" value={wizard.name}
                  onChange={(e) => setWizard((w) => (w ? { ...w, name: e.target.value } : w))}
                  placeholder="e.g. Acme Snowflake warehouse"
                />
                {wizardErrors.name ? <div className="field-error" role="alert">{wizardErrors.name}</div> : null}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setWizard(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={wizardNext}>Next →</button>
              </div>
            </div>
          ) : null}

          {wizard.step === 2 ? (
            <div>
              <p className="muted">
                Configure the {TYPE_LABELS[wizard.type]} connection. Secrets are never pasted here —
                store them in Secrets Manager and reference the path.
              </p>
              {CONFIG_FIELDS[wizard.type].map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`cfg-${f.key}`}>{f.label}</label>
                  <input
                    id={`cfg-${f.key}`} className="input" type="text"
                    value={wizard.config[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setWizard((w) => (w ? { ...w, config: { ...w.config, [f.key]: e.target.value } } : w))}
                  />
                  {wizardErrors[f.key] ? <div className="field-error" role="alert">{wizardErrors[f.key]}</div> : null}
                </div>
              ))}
              <div className="field">
                <label htmlFor="cfg-secret">Secret reference (Secrets Manager path — never paste a real secret)</label>
                <input
                  id="cfg-secret" className="input" type="text"
                  value={wizard.config.secret_ref ?? ''}
                  placeholder={`evidia/tenants/${tenantId}/${wizard.type}`}
                  onChange={(e) => setWizard((w) => (w ? { ...w, config: { ...w.config, secret_ref: e.target.value } } : w))}
                />
                {wizardErrors.secret_ref ? <div className="field-error" role="alert">{wizardErrors.secret_ref}</div> : null}
              </div>

              <div className="field">
                <label>Mode</label>
                <div className="row">
                  <label className="row" style={{ fontWeight: 400 }}>
                    <input
                      type="radio" name="conn-mode" checked={wizard.mode === 'land'}
                      onChange={() => setWizard((w) => (w ? { ...w, mode: 'land' } : w))}
                    />
                    LAND — extract into the tenant lake (bronze)
                  </label>
                  <label className="row" style={{ fontWeight: 400 }}>
                    <input
                      type="radio" name="conn-mode" checked={wizard.mode === 'virtual'}
                      onChange={() => setWizard((w) => (w ? { ...w, mode: 'virtual' } : w))}
                    />
                    VIRTUAL — query in place via pushdown
                  </label>
                </div>
              </div>

              <div className="field">
                <label>Capabilities</label>
                <div className="row">
                  {ALL_CAPABILITIES.map((cap) => (
                    <label key={cap} className="row" style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={wizard.capabilities.includes(cap)}
                        onChange={(e) => setWizard((w) => (w ? {
                          ...w,
                          capabilities: e.target.checked
                            ? [...w.capabilities, cap]
                            : w.capabilities.filter((c) => c !== cap),
                        } : w))}
                      />
                      {cap}
                    </label>
                  ))}
                </div>
                {wizardErrors.capabilities ? <div className="field-error" role="alert">{wizardErrors.capabilities}</div> : null}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setWizard((w) => (w ? { ...w, step: 1 } : w))}>← Back</button>
                <button type="button" className="btn btn-primary" onClick={wizardNext}>Next →</button>
              </div>
            </div>
          ) : null}

          {wizard.step === 3 ? (
            <div>
              <p className="muted">Review, then save and run a simulated connection test.</p>
              <table className="table">
                <tbody>
                  <tr><th style={{ width: '38%' }}>Name</th><td>{wizard.name}</td></tr>
                  <tr><th>Type</th><td>{TYPE_LABELS[wizard.type]}</td></tr>
                  <tr><th>Mode</th><td>{wizard.mode.toUpperCase()}</td></tr>
                  <tr>
                    <th>Capabilities</th>
                    <td><span className="row">{wizard.capabilities.map((c) => <Pill key={c} tone="neutral">{c}</Pill>)}</span></td>
                  </tr>
                  {Object.entries(wizard.config).map(([k, v]) => (
                    <tr key={k}><th>{k}</th><td className="mono">{v}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setWizard((w) => (w ? { ...w, step: 2 } : w))}>← Back</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void wizardSave()}>
                  {saving ? 'Saving & testing…' : 'Save & test connection'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete connector"
          body={(
            <>
              Delete <strong>{deleteTarget.name}</strong> ({TYPE_LABELS[deleteTarget.type]})?
              Datasets sourced from it keep their landed data, but no new extracts or virtual queries
              can run through this connector. This is recorded in the audit log.
            </>
          )}
          confirmLabel={deleting ? 'Deleting…' : 'Delete connector'}
          danger
          onConfirm={() => void onConfirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </section>
  );
}
