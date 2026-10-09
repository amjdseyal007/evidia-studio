import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import AgentConsole from '../views/AgentConsole';
import ControlPlane from '../views/ControlPlane';
import DataPipeline from '../views/DataPipeline';
import { ToastProvider } from '../components/ui';
import { api } from '../lib/api';
import { __resetStore, getState } from '../lib/store';

const text = (el: HTMLElement) => el.textContent ?? '';

beforeEach(() => {
  __resetStore();
  localStorage.clear();
  window.location.hash = '';
});

async function loginAs(role: string) {
  render(<App />);
  fireEvent.click(await screen.findByTestId(`demo-login-${role}`));
  await screen.findByTestId('nav-dashboard');
}

describe('R1 — per-tenant service toggles gate navigation (Control Plane → Services)', () => {
  it('Tenant Admin disables Ontology for acme: impact preview, nav gating, audit who/when', async () => {
    await loginAs('Tenant Admin');
    expect(screen.getByTestId('nav-ontology')).toBeTruthy();

    fireEvent.click(screen.getByTestId('nav-control'));
    const toggle = await screen.findByTestId('service-toggle-ontology');
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // Disabling first shows the impact preview (R1).
    fireEvent.click(toggle);
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(text(dialog)).toContain('saved cohorts use ontology concepts');
    expect(text(dialog)).toContain('audit log');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable service' }));

    // Ontology + dependents (Agents, Cohorts) leave the nav immediately.
    await waitFor(() => expect(screen.queryByTestId('nav-ontology')).toBeNull());
    expect(screen.queryByTestId('nav-agents')).toBeNull();
    expect(screen.queryByTestId('nav-cohorts')).toBeNull();

    // Per-tenant state + WHO/WHEN audit.
    expect(getState().tenantServices.acme_rare.ontology).toBe(false);
    expect(getState().tenantServices.beacon_bio.ontology).toBe(true);
    const entry = getState().audit.find((a) => a.action === 'service.disabled' && a.tenant_id === 'acme_rare');
    expect(entry?.actor).toBe('sarah.kim@meridian.example');
    expect(entry?.target).toBe('ontology');
    expect(entry?.at).toBeTruthy();

    // Re-enabling restores the nav (no confirm needed for enable).
    fireEvent.click(screen.getByTestId('service-toggle-ontology'));
    await screen.findByTestId('nav-ontology');
  });

  it('direct route to a disabled service shows the disabled-by-admin state', async () => {
    await act(async () => {
      await api.setServiceEnabled('acme_rare', 'ontology', false, 'sarah.kim@meridian.example');
    });
    await loginAs('Tenant Admin');
    await act(async () => {
      window.location.hash = '#/ontology';
    });
    const card = await screen.findByTestId('service-disabled');
    expect(text(card)).toContain('Ontology & Semantic Layer is disabled for this tenant');
  });

  it('dependency-blocked services render greyed with the blocker named (corvus_tx)', async () => {
    render(<ToastProvider><ControlPlane actor="amjad@evidia.example" role="Platform Admin" /></ToastProvider>);
    const details = await screen.findAllByRole('button', { name: 'Details' });
    fireEvent.click(details[3]); // platform, acme_rare, beacon_bio, corvus_tx
    const blocked = await screen.findByTestId('service-blocked-agents');
    expect(text(blocked)).toContain('Ontology');
    // Raw flag is ON for corvus agents — it is the dependency that blocks.
    expect(screen.getByTestId('service-toggle-agents').getAttribute('aria-checked')).toBe('true');
    expect(getState().tenantServices.corvus_tx.agents).toBe(true);
    expect(getState().tenantServices.corvus_tx.ontology).toBe(false);
  });
});

describe('R2 — Delivery Admin: cross-tenant services, engagements, audited view-as', () => {
  it('Delivery Admin toggles a service for beacon only; milestone edit lands', async () => {
    await loginAs('Delivery Admin');
    fireEvent.click(await screen.findByTestId('nav-delivery'));
    expect(await screen.findByTestId('delivery-view')).toBeTruthy();

    fireEvent.click(screen.getByTestId('delivery-services-beacon_bio'));
    expect(await screen.findByTestId('engagement-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('service-toggle-billing'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable service' }));

    await waitFor(() => expect(getState().tenantServices.beacon_bio.billing).toBe(false));
    expect(getState().tenantServices.acme_rare.billing).toBe(true);
    const entry = getState().audit.find((a) => a.action === 'service.disabled' && a.tenant_id === 'beacon_bio');
    expect(entry?.actor).toBe('maya.chen@evidia.example');

    // Engagement milestone for beacon (index 2 = OMOP harmonization validated).
    const box = screen.getByTestId('milestone-beacon_bio-2') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() =>
      expect(getState().engagements.find((e) => e.tenant_id === 'beacon_bio')?.completed).toContain('OMOP harmonization validated'));
  });

  it('view-as-tenant: banner, read-only Auditor-equivalence, audit in store + Control Plane log', async () => {
    await loginAs('Delivery Admin');
    fireEvent.click(await screen.findByTestId('nav-delivery'));
    fireEvent.click(await screen.findByTestId('view-as-beacon_bio'));

    const banner = await screen.findByTestId('viewas-banner');
    expect(text(banner).toLowerCase()).toContain('read-only');
    expect(text(banner)).toContain('Beacon Bio');

    const started = getState().audit.find((a) => a.action === 'support.view_as.started');
    expect(started?.tenant_id).toBe('beacon_bio');
    expect(started?.actor).toBe('maya.chen@evidia.example');

    // Read-only: Users & Access shows no team management while viewing as tenant.
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(await screen.findByTestId('teams-section')).toBeTruthy();
    expect(screen.queryByTestId('create-team-btn')).toBeNull();

    // Exit, then the session is visible in the Control Plane audit log.
    fireEvent.click(screen.getByTestId('viewas-exit'));
    await waitFor(() => expect(screen.queryByTestId('viewas-banner')).toBeNull());
    expect(getState().audit.some((a) => a.action === 'support.view_as.ended' && a.tenant_id === 'beacon_bio')).toBe(true);
    fireEvent.click(screen.getByTestId('nav-control'));
    expect(text(await screen.findByTestId('audit-log'))).toContain('support.view_as.started');
  });

  it('break-glass: elevated access is time-boxed and security-audited (R2)', async () => {
    await loginAs('Delivery Admin');
    fireEvent.click(await screen.findByTestId('nav-delivery'));
    fireEvent.click(await screen.findByTestId('view-as-beacon_bio'));
    await screen.findByTestId('viewas-banner');

    fireEvent.click(screen.getByTestId('viewas-breakglass'));
    const modal = await screen.findByTestId('breakglass-modal');
    fireEvent.change(within(modal).getByLabelText(/reason/i), { target: { value: 'Incident drill' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Activate elevated access' }));

    await waitFor(() => expect(text(screen.getByTestId('viewas-banner'))).toContain('BREAK-GLASS'));
    const entry = getState().audit.find((a) => a.action === 'support.break_glass.activated');
    expect(entry?.tenant_id).toBe('beacon_bio');
    expect(entry?.actor).toBe('maya.chen@evidia.example');
    expect(entry?.detail).toContain('Incident drill');
    // Security-alert style: critical notification raised.
    expect(getState().notifications.some((n) => n.severity === 'critical' && n.title.includes('Break-glass'))).toBe(true);
  });

  it('Tenant Admin sees only their own tenant in the switcher and no Delivery nav', async () => {
    await loginAs('Tenant Admin');
    const select = screen.getByTestId('tenant-switcher') as HTMLSelectElement;
    expect(select.options.length).toBe(1);
    expect(select.value).toBe('acme_rare');
    expect(screen.queryByTestId('nav-delivery')).toBeNull();
  });
});

describe('Teams (Users & Access)', () => {
  it('create team + add member via api; directory and team card reflect membership', async () => {
    let teamId = '';
    await act(async () => {
      const t = await api.createTeam({
        name: 'Medical Affairs', description: 'Evidence review board', role: 'Biostatistician',
        tenant_id: 'acme_rare', access_datasets: ['ds-acme-claims'], access_studies: [], actor: 'sarah.kim@meridian.example',
      });
      teamId = t.team_id;
      await api.addTeamMember(teamId, 'user-004', 'sarah.kim@meridian.example');
    });
    expect(getState().teams.find((t) => t.team_id === teamId)?.member_ids).toContain('user-004');
    expect(getState().audit.some((a) => a.action === 'team.member.added' && a.target === 'dana.whitfield@acme.example')).toBe(true);

    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(text(await screen.findByTestId('user-table'))).toContain('Medical Affairs');
    expect(text(screen.getByTestId(`team-card-${teamId}`))).toContain('Dana Whitfield');
  });

  it('UI flow: create-team modal + add member from the directory', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(text(await screen.findByTestId('team-card-team-clinical-science'))).toContain('Priya Nair');

    fireEvent.click(screen.getByTestId('create-team-btn'));
    const modal = await screen.findByTestId('create-team-modal');
    fireEvent.change(within(modal).getByLabelText(/name/i), { target: { value: 'Pharmacovigilance' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Create team' }));
    await waitFor(() => expect(text(screen.getByTestId('teams-section'))).toContain('Pharmacovigilance'));

    const card = screen.getByTestId('team-card-team-clinical-science');
    const selects = within(card).getAllByRole('combobox');
    fireEvent.change(selects[selects.length - 1], { target: { value: 'user-004' } });
    fireEvent.click(screen.getByTestId('team-add-team-clinical-science'));
    await waitFor(() => expect(text(screen.getByTestId('team-card-team-clinical-science'))).toContain('Dana Whitfield'));
  });

  it('Delivery Admin sees teams across tenants read-only', async () => {
    await loginAs('Delivery Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    const block = await screen.findByTestId('teams-across-tenants');
    expect(text(block)).toContain('Clinical Science');
    expect(text(block)).toContain('Registry Operations');
    expect(screen.queryByTestId('create-team-btn')).toBeNull();
  });
});

describe('Action-level gating from service state', () => {
  it('per-agent toggle disables the agent card run action', async () => {
    await act(async () => {
      await api.setAgentEnabled('acme_rare', 'feasibility', false, 'sarah.kim@meridian.example');
    });
    render(<ToastProvider><AgentConsole tenantId="acme_rare" actor="priya.nair@acme.example" role="Biostatistician" /></ToastProvider>);
    expect(await screen.findByTestId('agent-disabled-feasibility')).toBeTruthy();
  });

  it('disabling De-identification blocks pipeline runs with a visible notice', async () => {
    await act(async () => {
      await api.setServiceEnabled('acme_rare', 'deid', false, 'sarah.kim@meridian.example');
    });
    render(<ToastProvider><DataPipeline tenantId="acme_rare" actor="tom.alvarez@acme.example" role="Data Engineer" /></ToastProvider>);
    expect(text(await screen.findByTestId('pipeline-service-notice'))).toContain('De-identification Engine');
    const runButtons = screen.getAllByRole('button', { name: 'Run pipeline' });
    expect(runButtons.length).toBeGreaterThan(0);
    runButtons.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });
});

describe('R4-lite — billing breakdown by service and study with demo unit prices', () => {
  it('Control Plane billing: by-service table + unit price labels for acme_rare', async () => {
    render(<ToastProvider><ControlPlane actor="amjad@evidia.example" role="Platform Admin" /></ToastProvider>);
    const select = await screen.findByLabelText('Tenant');
    fireEvent.change(select, { target: { value: 'acme_rare' } });
    const byService = await screen.findByTestId('billing-by-service');
    await waitFor(() => expect(text(byService)).toContain('Agent Suite'));
    expect(text(byService)).toContain('De-identification Engine');
    expect(text(byService)).toContain('Ontology & Semantic Layer');
    expect(text(byService)).toContain('/1M input');
    expect(text(await screen.findByTestId('billing-summary'))).toContain('/1M input');
    expect(text(document.body)).toContain('By study');
  });
});
