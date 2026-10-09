import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
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

async function gotoGovernance() {
  fireEvent.click(screen.getByTestId('nav-ontology'));
  const tabs = await screen.findByTestId('ontology-tabs');
  fireEvent.click(within(tabs).getByRole('tab', { name: /Governance/ }));
}

describe('R8 — ontology governance UI', () => {
  it('approve gating: Data Engineer cannot sign off (buttons disabled)', async () => {
    await loginAs('Data Engineer');
    await gotoGovernance();

    const approveBtn = (await screen.findByTestId('ontology-approve-btn')) as HTMLButtonElement;
    const rejectBtn = (await screen.findByTestId('ontology-reject-btn')) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
    expect(rejectBtn.disabled).toBe(true);
    expect(text(document.body)).toContain('Sign-off requires ontology:approve (Biostatistician / Admin roles)');

    // Version decisions remain untouched while gated.
    expect(getState().ontologyVersions.find((v) => v.version === '0.2.0')?.status).toBe('in-review');
    expect(getState().ontologyVersions.find((v) => v.version === '0.1.0')?.status).toBe('approved');
  });

  it('approval flow: Biostatistician approves 0.2.0, superseding 0.1.0', async () => {
    await loginAs('Biostatistician');
    await gotoGovernance();

    const impact = await screen.findByTestId('ontology-impact');
    expect(text(impact)).toContain('5');
    // The five agent display names from the seed catalog.
    expect(text(impact)).toContain('StudyDesignAgent');
    expect(text(impact)).toContain('FeasibilityAgent');

    fireEvent.click(await screen.findByTestId('ontology-approve-btn'));
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(text(dialog)).toContain('ONLY agent-visible');
    expect(text(dialog)).toContain('0.2.0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve version' }));

    await waitFor(() => {
      expect(getState().ontologyVersions.find((v) => v.version === '0.2.0')?.status).toBe('approved');
    });
    expect(getState().ontologyVersions.find((v) => v.version === '0.1.0')?.status).toBe('superseded');
    expect(text(await screen.findByTestId('agents-ontology-chip'))).toContain('v0.2.0');
    expect(getState().audit.some((a) => a.action === 'ontology.version.approved')).toBe(true);
    // Queue drains once decided.
    expect(text(await screen.findByTestId('ontology-signoff-queue'))).toContain('No version awaiting sign-off.');
  });

  it('timeline: approved row is agent-visible, in-review waits for sign-off', async () => {
    await loginAs('Platform Admin');
    await gotoGovernance();

    const timeline = await screen.findByTestId('ontology-version-timeline');
    expect(text(timeline)).toContain('0.1.0');
    expect(text(timeline)).toContain('Agents see this version');
    expect(text(timeline)).toContain('0.2.0');
    expect(text(timeline)).toContain('In review');
    // Ordering: in-review first, then approved, per the governance order.
    const body = text(timeline);
    expect(body.indexOf('0.2.0')).toBeLessThan(body.indexOf('0.1.0'));
  });

  it('reject flow: Platform Admin rejects 0.2.0, 0.1.0 stays approved', async () => {
    await loginAs('Platform Admin');
    await gotoGovernance();

    fireEvent.click(await screen.findByTestId('ontology-reject-btn'));
    const dialog = await screen.findByTestId('confirm-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject version' }));

    await waitFor(() => {
      expect(getState().ontologyVersions.find((v) => v.version === '0.2.0')?.status).toBe('rejected');
    });
    expect(getState().ontologyVersions.find((v) => v.version === '0.1.0')?.status).toBe('approved');
    expect(getState().audit.some((a) => a.action === 'ontology.version.rejected')).toBe(true);
    // Versions table renders the new rejected status.
    await waitFor(() => expect(text(document.body)).toContain('rejected'));
  });
});
