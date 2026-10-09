import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { __resetStore, getState } from '../lib/store';
import { permissionsForRole } from '../lib/permissions';

const text = (el: HTMLElement) => el.textContent ?? '';

beforeEach(() => {
  __resetStore();
  localStorage.clear();
  window.location.hash = '';
});

async function loginAs(role: string) {
  const utils = render(<App />);
  fireEvent.click(await screen.findByTestId(`demo-login-${role}`));
  await screen.findByTestId('nav-dashboard');
  return utils;
}

describe('R5 — composable roles: clone gating', () => {
  it('Auditor cannot create custom roles; Tenant Admin clones Auditor minus one permission', async () => {
    const first = await loginAs('Auditor');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(await screen.findByTestId('custom-roles')).toBeTruthy();
    expect(screen.queryByTestId('create-custom-role-btn')).toBeNull();
    first.unmount();
    __resetStore();
    localStorage.clear();
    window.location.hash = '';

    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(text(await screen.findByTestId('user-table'))).toContain('Priya Nair');

    fireEvent.click(screen.getByTestId('create-custom-role-btn'));
    const modal = await screen.findByTestId('custom-role-modal');
    fireEvent.change(within(modal).getByLabelText(/name/i), { target: { value: 'R5 Test Role' } });
    const cloneSelect = modal.querySelector('#cr-clone') as HTMLSelectElement;
    expect(cloneSelect).toBeTruthy();
    fireEvent.change(cloneSelect, { target: { value: 'Auditor' } });

    const box = within(modal).getByTestId('cr-perm-dashboard:view') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);

    fireEvent.click(within(modal).getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(text(screen.getByTestId('custom-roles'))).toContain('R5 Test Role'));
    const created = getState().customRoles.find((r) => r.name === 'R5 Test Role');
    expect(created).toBeTruthy();
    expect(created?.cloned_from).toBe('Auditor');
    expect(created?.permissions.length).toBe(permissionsForRole('Auditor').length - 1);
    expect(getState().audit.some((a) => a.action === 'role.custom.created')).toBe(true);
  });
});

describe('R5 — preview and assignment', () => {
  it('preview lists sections; assigning Evidence Reviewer to Tom shows the pill', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(text(await screen.findByTestId('user-table'))).toContain('Priya Nair');

    fireEvent.click(screen.getByTestId('custom-role-preview-crole-evidence-reviewer'));
    const panel = await screen.findByTestId('custom-role-preview-panel-crole-evidence-reviewer');
    expect(text(panel)).toContain('Evidence & Compliance');
    expect(text(panel)).toContain('of 30 permissions');

    const select = screen.getByTestId('assign-custom-user-003') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'crole-evidence-reviewer' } });

    await waitFor(() =>
      expect(getState().users.find((u) => u.user_id === 'user-003')?.custom_role_id).toBe('crole-evidence-reviewer'));
    const pill = await screen.findByTestId('user-custom-role-user-003');
    expect(text(pill)).toContain('Evidence Reviewer');
  });
});

describe('R5 — access requests', () => {
  it('approving Dana Whitfield grants the Evidence Reviewer custom role', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    const card = await screen.findByTestId('access-requests');
    await waitFor(() => expect(text(card)).toContain('Dana Whitfield'));

    const req = getState().accessRequests.find((r) => r.requester_name === 'Dana Whitfield');
    expect(req).toBeTruthy();
    fireEvent.click(screen.getByTestId(`access-approve-${req!.id}`));

    await waitFor(() => {
      expect(getState().accessRequests.find((r) => r.id === req!.id)?.status).toBe('approved');
      expect(getState().users.find((u) => u.user_id === 'user-004')?.custom_role_id).toBe('crole-evidence-reviewer');
    });
  });
});

describe('R7 — scoped service-account keys', () => {
  it('creating a key with pipeline:run scope reveals the secret and persists scopes', async () => {
    await loginAs('Tenant Admin');
    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(await screen.findByTestId('api-keys')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    const modal = await screen.findByTestId('create-key-modal');
    const nameInput = modal.querySelector('#key-name') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'scoped test' } });
    fireEvent.click(within(modal).getByTestId('key-scope-pipeline:run'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Create key' }));

    const secret = await screen.findByTestId('secret-modal');
    expect(text(secret)).toContain('evk_live_');

    await waitFor(() => {
      const keys = getState().apiKeys;
      expect(keys[keys.length - 1].scopes).toContain('pipeline:run');
    });
    expect(text(screen.getByTestId('api-keys'))).toContain('pipeline:run');
  });
});
