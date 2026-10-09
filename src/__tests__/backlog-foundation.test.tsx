import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { api } from '../lib/api';
import { __resetStore, getState } from '../lib/store';
import { auditToCsv } from '../lib/auditTaxonomy';

const text = (el: HTMLElement) => el.textContent ?? '';

beforeEach(() => {
  __resetStore();
  localStorage.clear();
  window.location.hash = '';
});

describe('R9 — command palette', () => {
  it('opens via the Search button, finds a study, and navigates to it', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Platform Admin'));
    await screen.findByTestId('nav-dashboard');
    fireEvent.click(screen.getByTestId('cmdk-open'));
    const input = await screen.findByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'external control' } });
    const result = await screen.findByTestId('palette-result-study-study-acme-001');
    expect(text(result)).toContain('Regulatory');
    fireEvent.click(result);
    expect(await screen.findByTestId('study-detail')).toBeTruthy();
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('semantic search results appear as their own result type', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Platform Admin'));
    await screen.findByTestId('nav-dashboard');
    fireEvent.click(screen.getByTestId('cmdk-open'));
    const input = await screen.findByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'egfr' } });
    const hit = await screen.findByTestId('palette-result-semantic-evLabEgfr', undefined, { timeout: 4000 }).catch(() => null)
      ?? await screen.findByTestId(/palette-result-semantic-/);
    expect(text(hit)).toContain('Semantic');
  });

  it('opens with Cmd-K and closes with Escape', async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId('demo-login-Platform Admin'));
    await screen.findByTestId('nav-dashboard');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const input = await screen.findByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });
});

describe('R3 — regulatory classification lock + verifiable export', () => {
  it('classifying Regulatory pins the approved ontology version and locks retention', async () => {
    await act(async () => {
      await api.classifyStudy('study-acme-002', 'regulatory', 'priya.nair@acme.example');
    });
    const study = getState().studies.find((s) => s.study_id === 'study-acme-002')!;
    expect(study.classification).toBe('regulatory');
    expect(study.ontology_version).toBe('0.1.0'); // the approved version
    expect(study.retention_locked).toBe(true);
    const entry = getState().audit.find((a) => a.action === 'study.classified' && a.target === 'study-acme-002');
    expect(entry?.delta).toBe('standard → regulatory');
    expect(entry?.actor).toBe('priya.nair@acme.example');
  });

  it('evidence export produces the checklist and a verifiable fingerprint', async () => {
    let expId = '';
    await act(async () => {
      const rec = await api.exportEvidencePackage('study-acme-001', 'dana.whitfield@acme.example');
      expId = rec.export_id;
      expect(rec.fingerprint).toMatch(/^sha256:demo-/);
      const items = rec.items.map((i) => i.item);
      expect(items).toContain('Ontology version');
      expect(items).toContain('QMS summary');
      expect(rec.items.find((i) => i.item === 'Ontology version')?.status).toBe('included');
    });
    await act(async () => {
      expect(await api.verifyEvidenceExport(expId)).toBe(true);
    });
    const entry = getState().audit.find((a) => a.action === 'evidence.package.exported');
    expect(entry?.target).toBe(expId);
  });
});

describe('R8 — ontology version governance decisions (demo-state)', () => {
  it('approving 0.2.0 supersedes 0.1.0 and audits ontology.version.approved', async () => {
    await act(async () => {
      await api.decideOntologyVersion('0.2.0', 'approved', 'acme_rare', 'priya.nair@acme.example');
    });
    const versions = getState().ontologyVersions;
    expect(versions.find((v) => v.version === '0.2.0')?.status).toBe('approved');
    expect(versions.find((v) => v.version === '0.1.0')?.status).toBe('superseded');
    const entry = getState().audit.find((a) => a.action === 'ontology.version.approved');
    expect(entry?.delta).toBe('in-review → approved');
  });

  it('a version that is not in-review cannot be decided', async () => {
    await expect(api.decideOntologyVersion('0.1.0', 'approved', 'acme_rare', 'x@y.example')).rejects.toThrow(/in-review/);
  });
});

describe('R6 — tenant provisioning preloads demo data (minute-one)', () => {
  it('new tenant gets demo dataset + starter cohort + audit entry', async () => {
    await act(async () => {
      await api.provisionTenant({ name: 'Test Tenant', tenant_id: 'test_tenant', isolation: 'pooled', region: 'us-east-1', actor: 'amjad@evidia.example' });
    });
    const s = getState();
    expect(s.datasets.some((d) => d.tenant_id === 'test_tenant' && d.name.includes('Synthetic rare-disease demo'))).toBe(true);
    expect(s.savedCohorts.some((c) => c.tenant_id === 'test_tenant' && c.name.includes('Demo starter cohort'))).toBe(true);
    expect(s.audit.some((a) => a.action === 'tenant.demo_data.seeded' && a.tenant_id === 'test_tenant')).toBe(true);
  });

  it('preload can be switched off at provisioning', async () => {
    await act(async () => {
      await api.provisionTenant({ name: 'Empty Tenant', tenant_id: 'empty_tenant', isolation: 'silo', region: 'us-east-1', actor: 'amjad@evidia.example', preload_demo: false });
    });
    expect(getState().datasets.some((d) => d.tenant_id === 'empty_tenant')).toBe(false);
  });
});

describe('R5 — composable roles + access requests', () => {
  it('clone-and-edit a custom role, assign it, and approve an access request into it', async () => {
    let roleId = '';
    await act(async () => {
      const role = await api.createCustomRole({ name: 'Test Role', tenant_id: 'acme_rare', cloned_from: 'Auditor', permissions: ['dashboard:view', 'evidence:view'] }, 'sarah.kim@meridian.example');
      roleId = role.id;
      await api.assignCustomRole('user-003', roleId, 'sarah.kim@meridian.example');
    });
    expect(getState().users.find((u) => u.user_id === 'user-003')?.custom_role_id).toBe(roleId);
    expect(getState().audit.some((a) => a.action === 'role.custom.created')).toBe(true);

    // Dana's seeded request for the custom "Evidence Reviewer" role.
    const pending = getState().accessRequests.find((r) => r.status === 'pending' && r.is_custom)!;
    await act(async () => {
      await api.decideAccessRequest(pending.id, 'approved', 'sarah.kim@meridian.example');
    });
    const custom = getState().customRoles.find((r) => r.name === 'Evidence Reviewer')!;
    expect(getState().users.find((u) => u.user_id === 'user-004')?.custom_role_id).toBe(custom.id);
    expect(getState().accessRequests.find((r) => r.id === pending.id)?.status).toBe('approved');
  });
});

describe('R7 — audit taxonomy + scoped API keys', () => {
  it('CSV export uses canonical event names', () => {
    const csv = auditToCsv(getState().audit);
    expect(csv).toContain('evidence.package.signed');
    expect(csv).toContain('tenant.offboard.attempted');
  });

  it('API keys carry scopes from creation into the record and audit', async () => {
    await act(async () => {
      const { record } = await api.createApiKey('scoped-ci (test)', 'acme_rare', 'amjad@evidia.example', ['pipeline:view', 'pipeline:run']);
      expect(record.scopes).toEqual(['pipeline:view', 'pipeline:run']);
    });
    const entry = getState().audit.find((a) => a.action === 'apikey.created');
    expect(entry?.detail).toContain('pipeline:run');
  });
});
