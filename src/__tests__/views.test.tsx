import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Dashboard from '../views/Dashboard';
import CohortBuilder from '../views/CohortBuilder';
import Evidence from '../views/Evidence';
import AgentConsole from '../views/AgentConsole';
import { ToastProvider } from '../components/ui';
import { __resetStore } from '../lib/store';

const text = (el: HTMLElement) => el.textContent ?? '';
const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  __resetStore();
  localStorage.clear();
});

describe('Dashboard view (mock)', () => {
  it('renders KPI cards, DQ gauge, studies, billing and tenant cards', async () => {
    wrap(<Dashboard tenantId="acme_rare" actor="amjad@evidia.example" />);
    expect(await screen.findByTestId('kpi-cards')).toBeTruthy();
    expect(text(await screen.findByTestId('dq-gauge'))).toContain('86.5 / 100');
    expect(text(await screen.findByTestId('recent-studies'))).toContain('External control');
    expect(text(await screen.findByTestId('billing-summary'))).toContain('unpriced');
    expect(text(screen.getByTestId('tenant-cards'))).toContain('acme_rare');
  });
});

describe('Cohort Builder view (mock)', () => {
  it('validates, counts with fixture attrition, and shows the saved library', async () => {
    wrap(<CohortBuilder tenantId="acme_rare" actor="priya.nair@acme.example" role="Biostatistician" />);
    const editor = (await screen.findByTestId('cohort-json')) as HTMLTextAreaElement;
    await screen.findByDisplayValue(/Rare disease external-control cohort/);
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(text(await screen.findByTestId('validation-result'))).toContain('Valid definition');
    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(text(await screen.findByTestId('attrition'))).toContain('Age 18');
    expect(text(await screen.findByTestId('saved-cohorts'))).toContain('Rare disease external-control cohort');
  });
});

describe('Evidence view (mock)', () => {
  it('renders provenance chain, INTACT status and Part 11 signatures', async () => {
    wrap(<Evidence tenantId="acme_rare" role="Biostatistician" />);
    expect(text(await screen.findByTestId('provenance-chain'))).toContain('De-identification gate');
    expect(text(screen.getByTestId('chain-status'))).toContain('INTACT');
    expect(text(screen.getByTestId('signature-list'))).toContain('Fixture Biostatistician');
  });
});

describe('Agent Console view (mock)', () => {
  it('renders 5 agent cards and run history with detail', async () => {
    wrap(<AgentConsole tenantId="acme_rare" actor="priya.nair@acme.example" role="Biostatistician" />);
    expect(text(await screen.findByTestId('agent-cards'))).toContain('FeasibilityAgent');
    expect(text(await screen.findByTestId('run-history'))).toContain('run-feas-20261007-001');
    fireEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    expect(await screen.findByTestId('run-detail')).toBeTruthy();
  });
});
