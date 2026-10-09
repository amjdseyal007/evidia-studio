import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Dashboard from '../views/Dashboard';
import CohortBuilder from '../views/CohortBuilder';
import EvidenceViewer from '../views/EvidenceViewer';
import AgentConsole from '../views/AgentConsole';
import TenantAdmin from '../views/TenantAdmin';

const text = (el: HTMLElement) => el.textContent ?? '';

describe('Dashboard view (mock)', () => {
  it('renders mock banner, tenant cards, DQ gauge, studies and billing', async () => {
    render(<Dashboard tenantId="acme_rare" />);
    expect(text(screen.getByTestId('mock-banner'))).toContain('MOCK DATA');
    expect(text(await screen.findByTestId('dq-gauge'))).toContain('86.5 / 100');
    expect(text(await screen.findByTestId('recent-studies'))).toContain('External control');
    expect(text(await screen.findByTestId('billing-summary'))).toContain('unpriced');
    expect(text(screen.getByTestId('tenant-cards'))).toContain('acme_rare');
  });
});

describe('Cohort Builder view (mock)', () => {
  it('renders editor, validates and counts with fixture attrition', async () => {
    render(<CohortBuilder />);
    expect(screen.getByTestId('mock-banner')).toBeTruthy();
    await screen.findByDisplayValue(/Rare disease external-control cohort/);
    const editor = screen.getByTestId('cohort-json') as HTMLTextAreaElement;
    expect(editor.value).toContain('Rare disease external-control cohort');
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(text(await screen.findByTestId('validation-result'))).toContain('Valid definition');
    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(text(await screen.findByTestId('attrition'))).toContain('Age 18');
  });
});

describe('Evidence Package view (mock)', () => {
  it('renders provenance chain and Part 11 signatures', async () => {
    render(<EvidenceViewer />);
    expect(text(await screen.findByTestId('provenance-chain'))).toContain('De-identification gate');
    expect(text(screen.getByTestId('chain-status'))).toContain('INTACT');
    expect(text(screen.getByTestId('signature-list'))).toContain('Fixture Biostatistician');
  });
});

describe('Agent Console view (mock)', () => {
  it('renders 5 agent cards and expandable run detail with ontology calls', async () => {
    render(<AgentConsole tenantId="acme_rare" />);
    expect(text(await screen.findByText(/StudyDesignAgent/))).toContain('StudyDesignAgent');
    expect(text(screen.getByTestId('agent-cards'))).toContain('FeasibilityAgent');
    expect(text(await screen.findByTestId('run-history'))).toContain('run-feas-20261007-001');
    fireEvent.click(screen.getAllByRole('button', { name: 'Detail' })[0]);
    expect(text(await screen.findByTestId('run-detail'))).toContain('describe_schema');
  });
});

describe('Tenant Admin view (mock)', () => {
  it('renders tenants with provisioning resources and offboard guard', async () => {
    render(<TenantAdmin />);
    expect(text(await screen.findByText(/alias\/ef-tenant-acme_rare-dev/))).toContain('alias/ef-tenant-acme_rare-dev');
    expect(text(screen.getByTestId('tenant-list'))).toContain('alias/ef-tenant-acme_rare-dev');
    expect(text(screen.getByTestId('offboard-acme_rare'))).toContain('BLOCKED');
    expect(text(screen.getByTestId('offboard-corvus_tx'))).toContain('ALLOWED');
  });
});
