import { useState } from 'react';
import { SERVICE_CATALOG, isServiceEnabled, serviceBlockers, serviceDef, defaultServiceStates, type ServiceKey, type ServiceDef } from '../fixtures/services';
import { agentFixtures } from '../fixtures/agents';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { ConfirmDialog, Pill, useToasts } from './ui';

export default function ServiceCatalog({ tenantId, actor, canManage }: { tenantId: string; actor: string; canManage: boolean }) {
  const store = useStore();
  const { push } = useToasts();
  const [pendingOff, setPendingOff] = useState<ServiceDef | null>(null);

  const states = store.tenantServices[tenantId] ?? defaultServiceStates();

  function impactLines(key: ServiceKey): string[] {
    const datasets = store.datasets.filter((d) => d.tenant_id === tenantId);
    const runs = store.pipelineRuns.filter((r) => r.tenant_id === tenantId);
    const agentRuns = store.agentRuns.filter((r) => r.tenant_id === tenantId);
    const cohorts = store.savedCohorts.filter((c) => c.tenant_id === tenantId);
    const studies = store.studies.filter((s) => s.tenant_id === tenantId);
    const sigs = store.evidence.tenant_id === tenantId ? store.evidence.signatures.length : 0;
    const connectors = store.connectors.filter((c) => c.tenant_id === tenantId);
    const usage = store.usageRecords.filter((r) => r.tenant_id === tenantId);
    const peers = store.tenants.filter((t) => t.status === 'active' && t.tenant_id !== tenantId).length;

    switch (key) {
      case 'pipeline':
        return [`${runs.filter((r) => r.status === 'running').length} pipeline run(s) currently in flight`, `${datasets.length} datasets in the catalog`];
      case 'deid':
        return [`${datasets.filter((d) => d.layer !== 'bronze').length} datasets already de-identified (silver/gold)`, `${runs.length} pipeline runs include the de-identification step`];
      case 'dq':
        return [`${datasets.filter((d) => d.dq_score != null).length} datasets carry a DQ score`, 'Federated Benchmarking depends on Data Quality Scoring'];
      case 'ontology':
        return [`${cohorts.length} saved cohorts use ontology concepts`, `${agentRuns.length} agent runs call ontology tools`, 'Cohort Builder and Agent Suite depend on the Ontology & Semantic Layer'];
      case 'cohorts':
        return [`${cohorts.length} saved cohorts`, `${studies.length} studies reference cohort definitions`];
      case 'agents':
        return [`${agentRuns.length} agent runs on record`, `${studies.length} studies in flight`];
      case 'benchmarking':
        return [`${peers} peer tenants participate in the federation`];
      case 'part11':
        return [`${sigs} Part 11 signatures on evidence packages`];
      case 'connectors':
        return [`${connectors.filter((c) => c.enabled).length} enabled connectors`, `${datasets.length} datasets in the catalog`];
      case 'evidence':
        return [`${sigs} signatures recorded on evidence packages`, `${studies.length} studies with evidence packages`];
      case 'billing':
        return [`${usage.length} usage records accrued this period`, 'New usage will stop accruing while disabled'];
      default:
        return [];
    }
  }

  async function handleToggle(def: ServiceDef) {
    const rawOn = states[def.key];
    if (rawOn) {
      setPendingOff(def);
      return;
    }
    try {
      await api.setServiceEnabled(tenantId, def.key, true, actor);
      push({ title: 'Service enabled', body: `${def.name} enabled for ${tenantId}.`, tone: 'ok' });
    } catch {
      push({ title: 'Service update failed', body: `Could not enable ${def.name}.`, tone: 'err' });
    }
  }

  async function confirmDisable() {
    if (!pendingOff) return;
    const def = pendingOff;
    try {
      await api.setServiceEnabled(tenantId, def.key, false, actor);
      push({ title: 'Service disabled', body: `${def.name} disabled for ${tenantId}.`, tone: 'ok' });
    } catch {
      push({ title: 'Service update failed', body: `Could not disable ${def.name}.`, tone: 'err' });
    } finally {
      setPendingOff(null);
    }
  }

  async function handleAgentToggle(agentName: string, displayName: string, next: boolean) {
    try {
      await api.setAgentEnabled(tenantId, agentName, next, actor);
      push({ title: next ? 'Agent enabled' : 'Agent disabled', body: `${displayName} ${next ? 'enabled' : 'disabled'} for ${tenantId}.`, tone: 'ok' });
    } catch {
      push({ title: 'Agent update failed', body: `Could not update ${displayName}.`, tone: 'err' });
    }
  }

  const pendingLines = pendingOff ? impactLines(pendingOff.key) : [];

  return (
    <div data-testid="service-catalog">
      {!canManage ? <p className="muted">Service changes require Tenant Admin or Delivery Admin.</p> : null}
      <div className="card-grid">
        {SERVICE_CATALOG.map((def) => {
          const rawOn = states[def.key];
          const effective = isServiceEnabled(states, def.key);
          const blockers = serviceBlockers(states, def.key);
          const blocked = blockers.length > 0;
          return (
            <article key={def.key} className={`card service-card${effective ? '' : ' is-off'}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{def.name}</h3>
                <span className="row">
                  {def.entitlement === 'included' ? <Pill tone="ok">Included in plan</Pill> : <Pill tone="info">Add-on</Pill>}
                  {effective ? <Pill tone="ok">Enabled</Pill> : <Pill tone="err">Disabled</Pill>}
                </span>
              </div>
              <p className="muted">{def.description}</p>
              {blocked ? (
                <p className="muted" data-testid={`service-blocked-${def.key}`}>
                  Requires {blockers.map((b) => serviceDef(b).name).join(', ')} — enable the dependency first.
                </p>
              ) : null}
              <div className="row">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rawOn}
                  aria-label={`${def.name} enabled`}
                  data-testid={`service-toggle-${def.key}`}
                  className="switch"
                  disabled={!canManage || blocked}
                  onClick={() => void handleToggle(def)}
                />
                <span>{rawOn ? 'On' : 'Off'}</span>
              </div>
              {def.key === 'agents' ? (
                <div>
                  {!effective ? <p className="muted">Enable the Agent Suite (and its Ontology dependency) to manage individual agents.</p> : null}
                  <div>
                    {agentFixtures.map((a) => {
                      const agentOn = (store.agentServices[tenantId]?.[a.name]) !== false;
                      return (
                        <div key={a.name} className="row" style={{ justifyContent: 'space-between' }}>
                          <span>
                            <span>{a.display_name}</span>{' '}
                            <span className="mono muted">{a.name}</span>
                          </span>
                          <span className="row">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={agentOn}
                              aria-label={`${a.display_name} enabled`}
                              data-testid={`agent-toggle-${a.name}`}
                              className="switch"
                              disabled={!canManage || !effective}
                              onClick={() => void handleAgentToggle(a.name, a.display_name, !agentOn)}
                            />
                            <span>{agentOn ? 'On' : 'Off'}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {pendingOff ? (
        <ConfirmDialog
          title={`Disable ${pendingOff.name}?`}
          confirmLabel="Disable service"
          danger
          body={
            <>
              <p>Disabling takes effect immediately for <strong>{tenantId}</strong> (navigation and actions are gated). Current impact:</p>
              {pendingLines.length > 0 ? (
                <ul className="list">
                  {pendingLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              ) : (
                <p>No active usage found for this tenant.</p>
              )}
              <p className="muted">This change is recorded in the audit log with your identity and timestamp.</p>
            </>
          }
          onConfirm={() => void confirmDisable()}
          onCancel={() => setPendingOff(null)}
        />
      ) : null}
    </div>
  );
}
