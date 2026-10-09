import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('R3 — regulatory classification + verifiable evidence export, R6 checklist', () => {
  it('Classification lock via UI: Biostatistician classifies study-acme-002 as Regulatory', async () => {
    await loginAs('Biostatistician');
    await act(async () => {
      window.location.hash = '#/studies/study-acme-002';
    });
    const card = await screen.findByTestId('study-classification-card');
    expect(text(card)).toContain('Standard');

    fireEvent.click(screen.getByTestId('classify-btn'));
    const modal = await screen.findByTestId('classify-modal');
    fireEvent.click(within(modal).getByTestId('classify-class-regulatory'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Confirm classification' }));

    await waitFor(() => {
      const study = getState().studies.find((s) => s.study_id === 'study-acme-002')!;
      expect(study.classification).toBe('regulatory');
      expect(study.ontology_version).toBe('0.1.0');
      expect(study.retention_locked).toBe(true);
    });

    await waitFor(() => expect(text(screen.getByTestId('study-classification-card'))).toContain('Regulatory'));
    expect(text(screen.getByTestId('study-classification-pill'))).toContain('Regulatory');
    expect(text(screen.getByTestId('study-classification-card'))).toContain('v0.1.0');
    expect(text(screen.getByTestId('study-classification-card'))).toContain('Retention locked');
  });

  it('New study: Tenant Admin creates a Regulatory study and lands on its detail', async () => {
    await loginAs('Tenant Admin');
    await act(async () => {
      window.location.hash = '#/studies';
    });
    const newBtn = await screen.findByTestId('new-study-btn');
    fireEvent.click(newBtn);
    const modal = await screen.findByTestId('create-study-modal');
    const nameInput = document.getElementById('new-study-name') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'R3 test study' } });
    fireEvent.click(screen.getByTestId('new-study-class-regulatory'));
    // helper mentions the approved version
    expect(text(modal)).toContain('0.1.0');
    fireEvent.click(within(modal).getByRole('button', { name: 'Create study' }));

    await screen.findByTestId('study-detail');
    await waitFor(() => {
      const created = getState().studies.find((s) => s.name === 'R3 test study');
      expect(created).toBeTruthy();
      expect(created?.classification).toBe('regulatory');
      expect(created?.ontology_version).toBe('0.1.0');
      expect(created?.retention_locked).toBe(true);
    });
    expect(text(await screen.findByTestId('study-classification-card'))).toContain('Regulatory');
  });

  it('Evidence export + verify: Biostatistician generates and verifies a fingerprint export', async () => {
    await loginAs('Biostatistician');
    await act(async () => {
      window.location.hash = '#/evidence';
    });
    const panel = await screen.findByTestId('evidence-export-panel');
    expect(text(panel)).toContain('Regulatory');
    expect(screen.getByTestId('export-classification')).toBeTruthy();
    expect(text(screen.getByTestId('export-classification'))).toContain('Regulatory');

    fireEvent.click(screen.getByTestId('export-evidence-btn'));
    const checklist = await screen.findByTestId('export-checklist');
    expect(text(checklist)).toContain('Ontology version');
    expect(text(checklist)).toContain('QMS summary');
    const fingerprint = screen.getByTestId('export-fingerprint');
    expect(text(fingerprint)).toMatch(/^sha256:demo-/);

    fireEvent.click(screen.getByTestId('verify-export-btn'));
    const verified = await screen.findByTestId('export-verified');
    expect(text(verified)).toContain('Verified');
    expect(text(verified)).toContain('fingerprint matches');
  });

  it('Checklist: study-acme-001 shows Evidence package signed as done', async () => {
    await loginAs('Biostatistician');
    await act(async () => {
      window.location.hash = '#/studies/study-acme-001';
    });
    const checklist = await screen.findByTestId('study-checklist');
    expect(text(checklist)).toContain('Getting started');
    expect(text(checklist)).toContain('Evidence package signed');
    expect(text(checklist)).toContain('✓');
    // The Evidence package signed row is marked done (✓ present in its line)
    const rows = within(checklist).getAllByRole('listitem');
    const evidenceRow = rows.find((li) => (li.textContent ?? '').includes('Evidence package signed'));
    expect(evidenceRow).toBeTruthy();
    expect(evidenceRow?.textContent ?? '').toContain('✓');
  });

  it('Audit taxonomy: Evidence audit log shows canonical labels and CSV export button', async () => {
    await loginAs('Biostatistician');
    await act(async () => {
      window.location.hash = '#/evidence';
    });
    await screen.findByTestId('evidence-export-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Audit log' }));
    const auditTable = await screen.findByTestId('audit-log');
    expect(text(auditTable)).toContain('Evidence package signed');
    expect(text(auditTable)).toContain('evidence.package.signed');
    expect(screen.getByTestId('audit-export-csv')).toBeTruthy();
    expect(screen.getByTestId('audit-cat-All')).toBeTruthy();
  });
});
