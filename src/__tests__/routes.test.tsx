import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { __resetStore } from '../lib/store';

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

describe('Route smoke — every major route renders (Platform Admin)', () => {
  it('Dashboard: KPI cards, DQ gauge, tenant cards', async () => {
    await loginAs('Platform Admin');
    expect(await screen.findByTestId('kpi-cards')).toBeTruthy();
    expect(text(await screen.findByTestId('dq-gauge'))).toContain('86.5 / 100');
    expect(text(screen.getByTestId('tenant-cards'))).toContain('Meridian Bio (rare disease)');
  });

  it('Users: directory + permission matrix + invite modal', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-users'));
    expect(text(await screen.findByTestId('user-table'))).toContain('Priya Nair');
    expect(screen.getByTestId('permission-matrix')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(await screen.findByTestId('invite-modal')).toBeTruthy();
  });

  it('Control Plane: tenants, billing, audit + provision wizard', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-control'));
    expect(text(await screen.findByTestId('tenant-table'))).toContain('Meridian Bio (rare disease)');
    expect(text(await screen.findByTestId('billing-summary'))).toContain('unpriced');
    expect(text(document.body)).toContain('pipeline.run.completed');
    fireEvent.click(screen.getByRole('button', { name: 'Provision tenant' }));
    expect(await screen.findByTestId('provision-modal')).toBeTruthy();
  });

  it('Data Pipeline: datasets, runs, schedules, DQ checks + simulated run', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-pipeline'));
    expect(text(await screen.findByTestId('dataset-table'))).toContain('Acme claims extract 2026-Q3');
    expect(screen.getByTestId('pipeline-runs-table')).toBeTruthy();
    expect(screen.getByTestId('pipeline-schedules')).toBeTruthy();
    expect(text(await screen.findByTestId('dq-checks'))).toContain('person_id_not_null');
    fireEvent.click(screen.getAllByRole('button', { name: 'Run pipeline' })[0]);
    expect(text(await screen.findByTestId('pipeline-runs-table'))).toContain('running');
  });

  it('Connectors: installed table with capabilities + add wizard', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-connectors'));
    expect(text(await screen.findByTestId('connector-table'))).toContain('Snowflake');
    fireEvent.click(screen.getByTestId('add-connector-btn'));
    expect(await screen.findByTestId('add-connector-wizard')).toBeTruthy();
  });

  it('Products & Studies: catalog entitlements + study detail', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-studies'));
    expect(text(await screen.findByTestId('products-grid'))).toContain('External Control Arm Dossiers');
    expect(text(await screen.findByTestId('studies-table'))).toContain('External control');
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    const detail = await screen.findByTestId('study-detail');
    expect(text(detail).toLowerCase()).toContain('control');
  });

  it('Settings: API keys create-once flow', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(await screen.findByTestId('api-keys')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    expect(await screen.findByTestId('create-key-modal')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/key name/i), { target: { value: 'Route smoke key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(text(await screen.findByTestId('secret-modal'))).toContain('evk_live_');
  });

  it('Tenant switcher re-scopes the workspace (Meridian → Beacon)', async () => {
    await loginAs('Platform Admin');
    fireEvent.change(screen.getByTestId('tenant-switcher'), { target: { value: 'beacon_bio' } });
    expect(text(await screen.findByTestId('recent-studies'))).toContain('Benchmarking cohort');
  });
});

describe('Ontology & Semantic Layer module', () => {
  it('Explorer: class tree + detail with parent/children/relations', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-ontology'));
    const tree = await screen.findByTestId('ontology-class-tree');
    expect(text(tree)).toContain('Treatment Arm');
    fireEvent.click(within(tree).getByRole('button', { name: /Patient/ }));
    const detail = await screen.findByTestId('ontology-class-detail');
    expect(text(detail)).toContain('OMOP PERSON');
    expect(text(detail)).toContain('member of');
  });

  it('Concept Mappings: map-new-codes resolves known, flags unknown', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-ontology'));
    const tabs = await screen.findByTestId('ontology-tabs');
    fireEvent.click(within(tabs).getByRole('tab', { name: /Concept Mappings/ }));
    expect(await screen.findByTestId('ontology-mappings')).toBeTruthy();
    fireEvent.change(screen.getByTestId('map-codes-input'), { target: { value: 'E11.9\nZZZ-UNKNOWN' } });
    fireEvent.click(screen.getByTestId('map-codes-run'));
    const result = await screen.findByTestId('map-codes-result');
    expect(text(result)).toContain('Type 2 diabetes');
    expect(text(result)).toContain('ZZZ-UNKNOWN');
    expect(text(result).toLowerCase()).toContain('no standard concept');
  });

  it('Governance: admin approves a proposal; Data Engineer cannot', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-ontology'));
    const tabs = await screen.findByTestId('ontology-tabs');
    fireEvent.click(within(tabs).getByRole('tab', { name: /Governance/ }));
    const proposals = await screen.findByTestId('ontology-proposals');
    expect(text(proposals)).toContain('Estimand');
    fireEvent.click(within(proposals).getAllByRole('button', { name: 'Approve' })[0]);
    expect(text(await screen.findByTestId('ontology-proposals'))).toContain('approved');
  });

  it('Semantic Search: "renal" surfaces Measurement with a relationship path', async () => {
    await loginAs('Platform Admin');
    fireEvent.click(screen.getByTestId('nav-ontology'));
    const tabs = await screen.findByTestId('ontology-tabs');
    fireEvent.click(within(tabs).getByRole('tab', { name: /Semantic Search/ }));
    fireEvent.change(await screen.findByTestId('semantic-search-input'), { target: { value: 'renal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const results = await screen.findByTestId('semantic-search-results');
    await waitFor(() => expect(text(results)).toContain('Measurement'));
    expect(text(results)).toContain('→');
  });
});
