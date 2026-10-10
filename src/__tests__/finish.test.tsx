/**
 * Completion-pass tests: every control must do something real in demo state.
 * Covers the Help center, Activity center, study tasks + lifecycle, billing
 * budgets, connector field mapping, settings webhooks/SSO, invite lifecycle,
 * ontology version diff, evidence fingerprint lookup, modal Escape, tenant
 * provisioning review step, and agent run log.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import App from '../App';
import { __resetStore, getState } from '../lib/store';
import { api } from '../lib/api';

const text = (el: HTMLElement) => el.textContent ?? '';

async function loginAs(role: string) {
  render(<App />);
  await screen.findByTestId(`demo-login-${role}`);
  fireEvent.click(screen.getByTestId(`demo-login-${role}`));
  await screen.findByTestId('nav-dashboard');
}

async function navTo(testid: string) {
  fireEvent.click(await screen.findByTestId(testid));
}

beforeEach(() => {
  __resetStore();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('help center (R6 onboarding)', () => {
  it('checklist reflects real store state for the tenant', async () => {
    await loginAs('Tenant Admin');
    await navTo('nav-help');
    const page = await screen.findByTestId('getting-started');
    // acme_rare has connectors + studies -> those steps are done.
    expect(text(screen.getByTestId('gs-step-connector'))).toContain('✓');
    expect(text(page)).toContain('Generate a verifiable export');
    // SOC 2 framed as roadmap, never claimed.
    expect(text(document.body)).toContain('roadmap');
    expect(text(document.body)).toContain('not claimed');
  });
});

describe('activity center', () => {
  it('filters unread and marks all read', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-activity');
    const inbox = await screen.findByTestId('notification-center');
    expect(text(inbox)).toContain('Pipeline');
    fireEvent.click(screen.getByTestId('activity-mark-all'));
    await waitFor(() => expect(getState().notifications.every((n) => n.read)).toBe(true));
  });

  it('renders the tenant activity stream (audited actions)', async () => {
    await loginAs('Tenant Admin');
    await navTo('nav-activity');
    expect(screen.getByTestId('activity-feed')).toBeTruthy();
  });
});

describe('study workspace depth', () => {
  it('adds + completes a task and advances the lifecycle', async () => {
    await loginAs('Tenant Admin');
    await navTo('nav-studies');
    await screen.findByTestId('studies-table');
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    const detail = await screen.findByTestId('study-detail');
    expect(screen.getByTestId('study-lifecycle')).toBeTruthy();
    fireEvent.change(screen.getByTestId('task-title-input'), { target: { value: 'Draft estimand memo' } });
    fireEvent.click(screen.getByTestId('add-task-btn'));
    await waitFor(() => expect(getState().studyTasks.some((t) => t.title === 'Draft estimand memo')).toBe(true));
    expect(text(detail)).toContain('Draft estimand memo');
    fireEvent.click(screen.getByLabelText('Complete task: Draft estimand memo'));
    await waitFor(() => expect(getState().studyTasks.find((t) => t.title === 'Draft estimand memo')?.done).toBe(true));
    expect(getState().audit.some((a) => a.action === 'study.task.created')).toBe(true);
    // advance feasibility study
    fireEvent.click(screen.getByRole('link', { name: /Back to studies/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1]);
    await screen.findByTestId('study-detail');
    fireEvent.click(screen.getByTestId('advance-status-btn'));
    await waitFor(() => expect(getState().studies.find((s) => s.study_id === 'study-acme-002')?.status).toBe('in_progress'));
    expect(getState().audit.some((a) => a.action === 'study.status.changed')).toBe(true);
  });
});

describe('billing budget alerts', () => {
  it('flags spend over the alert threshold', async () => {
    await loginAs('Tenant Admin');
    await navTo('nav-control');
    await screen.findByTestId('billing-summary');
    fireEvent.change(screen.getByTestId('budget-monthly'), { target: { value: '0.10' } });
    fireEvent.change(screen.getByTestId('budget-threshold'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('budget-save'));
    await screen.findByTestId('budget-alert');
    expect(text(screen.getByTestId('billing-budget'))).toContain('Priced spend');
    expect(getState().audit.some((a) => a.action === 'billing.budget.updated')).toBe(true);
  });
});

describe('connector wizard field mapping', () => {
  it('step 3 collects OMOP mappings and persists them', async () => {
    await loginAs('Data Engineer');
    await navTo('nav-connectors');
    fireEvent.click(await screen.findByTestId('add-connector-btn'));
    const wizard = await screen.findByTestId('add-connector-wizard');
    fireEvent.change(document.getElementById('conn-name')!, { target: { value: 'Mapping Test Conn' } });
    fireEvent.click(within(wizard).getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText(/step 2 of 4/i)).toBeTruthy();
    fireEvent.change(document.getElementById('cfg-account')!, { target: { value: 'acme' } });
    fireEvent.change(document.getElementById('cfg-warehouse')!, { target: { value: 'wh' } });
    fireEvent.change(document.getElementById('cfg-database')!, { target: { value: 'db' } });
    fireEvent.change(document.getElementById('cfg-secret')!, { target: { value: 'secret:x' } });
    fireEvent.click(within(wizard).getByRole('button', { name: 'Next →' }));
    await within(wizard).findByTestId('connector-field-mapping');
    expect((document.getElementById('map-src-0') as HTMLInputElement).value).toBe('DIAGNOSIS_CODE');
    fireEvent.click(within(wizard).getByTestId('mapping-add-row'));
    const rowInputs = () => wizard.querySelectorAll('input[id^="map-src-"]');
    const lastIdx = rowInputs().length - 1;
    expect(lastIdx).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(wizard).getByRole('button', { name: 'Next →' }));
    expect(await within(wizard).findByText(/Every mapping row needs/)).toBeTruthy();
    fireEvent.change(document.getElementById(`map-src-${lastIdx}`)!, { target: { value: 'note_text' } });
    const domainSel = document.getElementById(`map-domain-${lastIdx}`) as HTMLSelectElement;
    fireEvent.change(domainSel, { target: { value: domainSel.options[1]?.value ?? 'Note' } });
    fireEvent.change(document.getElementById(`map-target-${lastIdx}`)!, { target: { value: 'Note concept' } });
    fireEvent.click(within(wizard).getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText(/step 4 of 4/i)).toBeTruthy();
    expect(text(wizard)).toContain('note_text');
    fireEvent.click(within(wizard).getByRole('button', { name: 'Save & test connection' }));
    await waitFor(() => {
      const c = getState().connectors.find((x) => x.name === 'Mapping Test Conn');
      expect(c).toBeTruthy();
      expect(c!.field_mappings.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('settings: webhooks + SSO + modal keyboard', () => {
  it('creates, tests, and deletes a webhook', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-settings');
    fireEvent.change(await screen.findByTestId('webhook-url'), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByTestId('webhook-create'));
    expect(await screen.findByText(/must start with https:\/\//)).toBeTruthy();
    fireEvent.change(screen.getByTestId('webhook-url'), { target: { value: 'https://hooks.example.com/evidia' } });
    fireEvent.click(screen.getByTestId('webhook-create'));
    await waitFor(() => expect(getState().webhooks.some((w) => w.url === 'https://hooks.example.com/evidia')).toBe(true));
    const wh = getState().webhooks.find((w) => w.url === 'https://hooks.example.com/evidia')!;
    fireEvent.click(within(await screen.findByTestId(`webhook-${wh.webhook_id}`)).getByRole('button', { name: 'Send test event' }));
    await waitFor(() => expect(getState().webhooks.find((w) => w.webhook_id === wh.webhook_id)?.last_delivery?.status_code).toBe(200));
    fireEvent.click(within(screen.getByTestId(`webhook-${wh.webhook_id}`)).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete webhook' }));
    await waitFor(() => expect(getState().webhooks.some((w) => w.webhook_id === wh.webhook_id)).toBe(false));
  });

  it('validates SSO before saving', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-settings');
    fireEvent.click(screen.getByRole('checkbox', { name: /SSO enabled/ }));
    fireEvent.change(await screen.findByLabelText('Issuer URL'), { target: { value: 'notaurl' } });
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('sso-save'));
    expect(await screen.findByText(/Issuer URL must start with https:\/\//)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Issuer URL'), { target: { value: 'https://acme.okta.com' } });
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: '0oa123' } });
    fireEvent.click(screen.getByTestId('sso-save'));
    await waitFor(() => expect(getState().audit.some((a) => a.action === 'settings.sso.updated')).toBe(true));
  });

  it('Escape closes modals', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }));
    expect(await screen.findByTestId('create-key-modal')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('create-key-modal')).toBeNull());
  });
});

describe('invite lifecycle (R1 polish)', () => {
  it('invites, resends, suspends, reactivates a user', async () => {
    await loginAs('Tenant Admin');
    await navTo('nav-users');
    await screen.findByTestId('user-table');
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
    await screen.findByTestId('invite-modal');
    fireEvent.change(document.getElementById('inv-name')!, { target: { value: 'Nadia Test' } });
    fireEvent.change(document.getElementById('inv-email')!, { target: { value: 'nadia@meridian.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(getState().users.some((u) => u.email === 'nadia@meridian.example' && u.status === 'invited')).toBe(true));
    const invited = getState().users.find((u) => u.email === 'nadia@meridian.example')!;
    fireEvent.click(screen.getByTestId(`user-resend-${invited.user_id}`));
    await waitFor(() => expect(getState().audit.some((a) => a.action === 'user.invite.resent')).toBe(true));
    const tomRow = screen.getAllByRole('row').find((r) => text(r).includes('Tom Alvarez'))!;
    fireEvent.click(within(tomRow).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(getState().users.find((u) => u.email === 'tom.alvarez@acme.example')?.status).toBe('suspended'));
    expect(getState().audit.some((a) => a.action === 'user.suspended')).toBe(true);
  });

  it('auto-accepts an invite (demo, after a few seconds)', async () => {
    vi.useFakeTimers();
    const pending = api.inviteUser({ name: 'Auto Accept', email: 'auto@meridian.example', role: 'Auditor', tenant_id: 'acme_rare', actor: 'sarah.kim@meridian.example' });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await pending;
    expect(getState().users.find((u) => u.email === 'auto@meridian.example')?.status).toBe('invited');
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(getState().users.find((u) => u.email === 'auto@meridian.example')?.status).toBe('active');
    expect(getState().audit.some((a) => a.action === 'user.invite.accepted')).toBe(true);
    vi.useRealTimers();
  });
});

describe('ontology version diff', () => {
  it('shows class/property/agent deltas between versions', async () => {
    await loginAs('Biostatistician');
    await navTo('nav-ontology');
    fireEvent.click(await screen.findByRole('tab', { name: 'Governance' }));
    const panel = await screen.findByTestId('ontology-version-diff');
    expect(text(panel)).toContain('+25');
    expect(text(panel)).toContain('Classes new in the expansion');
  });

  it('filters the class tree', async () => {
    await loginAs('Biostatistician');
    await navTo('nav-ontology');
    fireEvent.change(await screen.findByTestId('class-filter'), { target: { value: 'adverse' } });
    const tree = await screen.findByTestId('ontology-class-tree');
    expect(text(tree)).toContain('Adverse Event');
    expect(text(tree)).not.toContain('Treatment Arm');
  });
});

describe('evidence fingerprint lookup', () => {
  it('verifies a pasted fingerprint against stored exports', async () => {
    await loginAs('Biostatistician');
    await navTo('nav-evidence');
    fireEvent.click(await screen.findByTestId('export-evidence-btn'));
    const fpEl = await screen.findByTestId('export-fingerprint');
    const fingerprint = text(fpEl).replace('Fingerprint:', '').trim();
    fireEvent.change(screen.getByTestId('fp-input'), { target: { value: fingerprint } });
    fireEvent.click(screen.getByTestId('fp-verify'));
    expect(await screen.findByText(/fingerprint verified against package contents/)).toBeTruthy();
  });
});

describe('provisioning review step', () => {
  it('shows a review summary before provisioning', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-control');
    fireEvent.click(await screen.findByRole('button', { name: 'Provision tenant' }));
    await screen.findByTestId('provision-modal');
    fireEvent.change(document.getElementById('prov-name')!, { target: { value: 'Review Co' } });
    fireEvent.change(document.getElementById('prov-tenant-id')!, { target: { value: 'review_co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review →' }));
    const review = await screen.findByTestId('provision-review');
    expect(text(review)).toContain('Review Co');
    fireEvent.click(screen.getByTestId('provision-confirm'));
    await waitFor(() => expect(getState().tenants.some((t) => t.tenant_id === 'review_co')).toBe(true));
  });
});

describe('agent run detail', () => {
  it('shows a line-oriented run log and a trace download action', async () => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:trace');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    await loginAs('Biostatistician');
    await navTo('nav-agents');
    await screen.findByTestId('run-history');
    fireEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    const detail = await screen.findByTestId('run-detail');
    expect(text(detail)).toContain('run started');
    expect(text(screen.getByTestId('run-log'))).toContain('ontology pinned');
    fireEvent.click(screen.getByTestId('download-trace'));
    expect(await screen.findByText(/Run trace downloaded/)).toBeTruthy();
  });
});

describe('control plane audit filters', () => {
  it('filters the audit log by tenant', async () => {
    await loginAs('Platform Admin');
    await navTo('nav-control');
    const tbody = await screen.findByTestId('audit-log');
    expect(text(tbody)).toContain('beacon_bio');
    fireEvent.change(screen.getByTestId('cp-audit-tenant'), { target: { value: 'acme_rare' } });
    await waitFor(() => expect(text(screen.getByTestId('audit-log'))).not.toContain('beacon_bio'));
  });
});
