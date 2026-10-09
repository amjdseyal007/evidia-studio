import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import ControlPlane from '../views/ControlPlane';
import Connectors from '../views/Connectors';
import Users from '../views/Users';
import { ToastProvider } from '../components/ui';
import { api } from '../lib/api';
import { can } from '../lib/permissions';
import { __resetStore, getState } from '../lib/store';

const text = (el: HTMLElement) => el.textContent ?? '';

beforeEach(() => {
  __resetStore();
  localStorage.clear();
});

describe('RBAC permission matrix', () => {
  it('gates admin-only actions by role', () => {
    expect(can('Platform Admin', 'tenants:provision')).toBe(true);
    expect(can('Tenant Admin', 'tenants:provision')).toBe(false);
    expect(can('Auditor', 'users:manage')).toBe(false);
    expect(can('Auditor', 'users:view')).toBe(true);
    expect(can('Data Engineer', 'pipeline:run')).toBe(true);
    expect(can('Biostatistician', 'evidence:sign')).toBe(true);
    expect(can('Data Engineer', 'evidence:sign')).toBe(false);
  });
});

describe('App shell RBAC navigation', () => {
  it('hides admin nav for Auditor and shows it for Platform Admin', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Auditor'));
    expect(await screen.findByTestId('nav-dashboard')).toBeTruthy();
    // Auditor is read-only oversight: may view users, but no control plane / settings.
    expect(screen.getByTestId('nav-users')).toBeTruthy();
    expect(screen.queryByTestId('nav-control')).toBeNull();
    expect(screen.queryByTestId('nav-settings')).toBeNull();
  });

  it('hides Users & Access from operational roles without users:view', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Data Engineer'));
    expect(await screen.findByTestId('nav-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('nav-users')).toBeNull();
    expect(screen.queryByTestId('nav-control')).toBeNull();
  });

  it('shows the full console for Platform Admin after login', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Platform Admin'));
    expect(await screen.findByTestId('nav-users')).toBeTruthy();
    expect(screen.getByTestId('nav-control')).toBeTruthy();
    expect(screen.getByTestId('nav-settings')).toBeTruthy();
    expect(screen.getByTestId('tenant-switcher')).toBeTruthy();
    expect(text(screen.getByTestId('mock-banner'))).toContain('MOCK DATA');
  });
});

describe('CRUD flows through the mock store (api seam)', () => {
  it('invites a user and the directory reflects it', async () => {
    await act(async () => {
      await api.inviteUser({ name: 'New Person', email: 'new.person@acme.example', role: 'Data Engineer', tenant_id: 'acme_rare', actor: 'amjad@evidia.example' });
    });
    expect(getState().users.some((u) => u.email === 'new.person@acme.example')).toBe(true);
    expect(getState().audit.some((a) => a.action === 'user.invited')).toBe(true);

    render(<ToastProvider><Users tenantId="acme_rare" actor="amjad@evidia.example" role="Platform Admin" /></ToastProvider>);
    expect(text(await screen.findByTestId('user-table'))).toContain('New Person');
    expect(screen.getByTestId('permission-matrix')).toBeTruthy();
  });

  it('offboard guard is fail-closed: blocked for acme_rare, allowed for corvus_tx', async () => {
    const blocked = await api.evaluateOffboard('acme_rare');
    expect(blocked.allowed).toBe(false);
    expect(blocked.blocked_reasons.join(' ')).toContain('active');
    const verdict = await api.offboardTenant('acme_rare', 'amjad@evidia.example');
    expect(verdict.allowed).toBe(false);
    expect(getState().tenants.find((t) => t.tenant_id === 'acme_rare')?.status).toBe('active');

    const ok = await api.offboardTenant('corvus_tx', 'amjad@evidia.example');
    expect(ok.allowed).toBe(true);
    expect(getState().tenants.find((t) => t.tenant_id === 'corvus_tx')?.status).toBe('offboarded');
  });

  it('provisions a tenant into provisioning state', async () => {
    await act(async () => {
      await api.provisionTenant({ name: 'Delta Bio', tenant_id: 'delta_bio', isolation: 'pooled', region: 'us-east-1', actor: 'amjad@evidia.example' });
    });
    const t = getState().tenants.find((x) => x.tenant_id === 'delta_bio');
    expect(t?.status).toBe('provisioning');
    expect(t?.kms_key_id).toContain('delta_bio');
  });

  it('connector lifecycle: add → test → disable → delete', async () => {
    let connId = '';
    await act(async () => {
      const c = await api.addConnector({
        name: 'Test Snowflake', type: 'snowflake', mode: 'land',
        capabilities: ['pushdown', 'incremental'],
        config: { account: 'x', warehouse: 'WH', database: 'DB', secret_ref: 'evidia/tenants/acme_rare/test' },
        tenant_id: 'acme_rare', actor: 'amjad@evidia.example',
      });
      connId = c.connector_id;
    });
    const res = await api.testConnector(connId, 'amjad@evidia.example');
    expect(res.ok).toBe(true);
    expect(getState().connectors.find((c) => c.connector_id === connId)?.status).toBe('connected');
    await api.setConnectorEnabled(connId, false, 'amjad@evidia.example');
    expect(getState().connectors.find((c) => c.connector_id === connId)?.enabled).toBe(false);
    await api.deleteConnector(connId, 'amjad@evidia.example');
    expect(getState().connectors.some((c) => c.connector_id === connId)).toBe(false);
  });
});

describe('Control Plane + Connectors views render tenant data', () => {
  it('renders the tenant table and billing summary', async () => {
    render(<ToastProvider><ControlPlane actor="amjad@evidia.example" role="Platform Admin" /></ToastProvider>);
    expect(text(await screen.findByTestId('tenant-table'))).toContain('alias/ef-tenant-acme_rare-dev');
    expect(await screen.findByTestId('offboard-corvus_tx')).toBeTruthy();
    expect(text(await screen.findByTestId('billing-summary'))).toContain('unpriced');
  });

  it('renders seeded connectors with capability flags', async () => {
    render(<ToastProvider><Connectors tenantId="acme_rare" actor="amjad@evidia.example" role="Platform Admin" /></ToastProvider>);
    const table = await screen.findByTestId('connector-table');
    expect(text(table)).toContain('Snowflake');
    expect(text(table)).toContain('pushdown');
    expect(screen.getByTestId('add-connector-btn')).toBeTruthy();
  });
});
