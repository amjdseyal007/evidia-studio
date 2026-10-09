import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HashRouter } from 'react-router-dom';
import App from '../App';
import Dashboard from '../views/Dashboard';
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

describe('R10 — connector catalog (version, capabilities, data handling)', () => {
  it('shows catalog metadata for the Snowflake connector and its toggle disables it', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-connectors'));

    expect(text(await screen.findByTestId('connector-version-conn-snowflake-acme'))).toContain('v1.4.0');
    expect(text(screen.getByTestId('connector-data-handling-conn-snowflake-acme'))).toContain('tenant boundary');

    const table = screen.getByTestId('connector-table');
    expect(text(table)).toContain('Snowflake');
    const row = within(table).getByText('Acme Snowflake warehouse').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Enabled' }));

    await waitFor(() =>
      expect(getState().connectors.find((c) => c.connector_id === 'conn-snowflake-acme')?.enabled).toBe(false));
  });
});

describe('R10/R1 — service linkage gates the connectors route', () => {
  it('disabling the connectors service removes nav-connectors', async () => {
    await act(async () => {
      await api.setServiceEnabled('acme_rare', 'connectors', false, 'sarah.kim@meridian.example');
    });
    await loginAs('Tenant Admin');
    expect(screen.queryByTestId('nav-connectors')).toBeNull();
  });
});

describe('R10 — agent catalog (version, approved ontology, data handling)', () => {
  it('agent cards disclose version, approved ontology, and data handling', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-agents'));

    expect(text(await screen.findByTestId('agent-version-feasibility'))).toContain('v1.2.0');
    expect(text(screen.getByTestId('agent-ontology-feasibility'))).toContain('v0.1.0');
    expect(text(screen.getByTestId('agent-data-handling-study_design'))).toContain('APPROVED ontology');
  });
});

describe('R7 — audit taxonomy surfacing (Control Plane)', () => {
  it('labels + canonical events render alongside raw actions; category chips filter; CSV export exists', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-control'));

    const log = await screen.findByTestId('audit-log');
    expect(text(log)).toContain('Tenant offboard attempted');
    expect(text(log)).toContain('tenant.offboard.attempt');
    expect(text(log)).toContain('Evidence package signed');
    expect(screen.getByTestId('cp-audit-export-csv')).toBeTruthy();

    fireEvent.click(screen.getByTestId('cp-audit-cat-Tenants'));
    await waitFor(() => expect(text(screen.getByTestId('audit-log'))).not.toContain('Evidence package signed'));
    expect(text(screen.getByTestId('audit-log'))).toContain('Tenant offboard attempted');
    expect(text(screen.getByTestId('audit-log'))).toContain('tenant.offboard.attempt');
  });
});

describe('R6 — onboarding demo-data surfacing', () => {
  it('Dashboard shows the preloaded-demo onboarding card for a freshly provisioned tenant', async () => {
    await act(async () => {
      await api.provisionTenant({
        name: 'R6 Test', tenant_id: 'r6_test', isolation: 'pooled', region: 'us-east-1',
        actor: 'amjad@evidia.example',
      });
    });
    render(
      <ToastProvider>
        <HashRouter>
          <Dashboard tenantId="r6_test" actor="amjad@evidia.example" />
        </HashRouter>
      </ToastProvider>,
    );
    const chip = await screen.findByTestId('dashboard-demo-chip');
    expect(text(chip)).toContain('Demo data is preloaded');
  });

  it('Control Plane tenant detail flags the preloaded demo dataset', async () => {
    await act(async () => {
      await api.provisionTenant({
        name: 'R6 Test', tenant_id: 'r6_test', isolation: 'pooled', region: 'us-east-1',
        actor: 'amjad@evidia.example',
      });
    });
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-control'));

    const table = await screen.findByTestId('tenant-table');
    const row = within(table).getByText('R6 Test').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Details' }));

    expect(text(await screen.findByTestId('tenant-demo-data-r6_test'))).toContain('Demo data preloaded (R6)');
  });
});
