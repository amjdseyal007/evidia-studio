import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type AtlasDocument,
  type CohortCountResult,
  type CohortDefinition,
  type OntologyBundle,
  type ValidateResult,
} from '../lib/api';
import { useStore, type SavedCohort } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import {
  ConfirmDialog,
  DataTable,
  Modal,
  Pill,
  SectionTitle,
  fmtDate,
  fmtNum,
  useToasts,
  type Column,
} from '../components/ui';

interface CohortBuilderProps {
  tenantId: string;
  actor: string;
  role: Role;
}

type SavedRow = {
  id: string;
  name: string;
  final_count: number | null;
  updated_at: string;
  author: string;
};

type AttritionRow = {
  step: string;
  n_remaining: number;
  n_excluded: number;
};

function downloadJson(filename: string, doc: AtlasDocument) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Map an ontology class's OMOP mapping to an ATLAS criterion domain. */
function domainForClass(omopMapping: string): string {
  const m = omopMapping.toUpperCase();
  if (m.includes('CONDITION')) return 'Condition';
  if (m.includes('DRUG')) return 'Drug';
  if (m.includes('MEASUREMENT')) return 'Measurement';
  if (m.includes('PROCEDURE')) return 'Procedure';
  if (m.includes('VISIT')) return 'Visit';
  if (m.includes('PERSON')) return 'Person';
  return 'Observation';
}

export default function CohortBuilder({ tenantId, actor, role }: CohortBuilderProps) {
  const { push: toast } = useToasts();
  const store = useStore();

  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [count, setCount] = useState<CohortCountResult | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [atlas, setAtlas] = useState<AtlasDocument | null>(null);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNameError, setSaveNameError] = useState<string | null>(null);
  const [pendingSaveDef, setPendingSaveDef] = useState<CohortDefinition | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedCohort | null>(null);

  // Ontology concept picker: criteria reference governed ontology classes
  // (semantic layer), never raw source codes.
  const [ontology, setOntology] = useState<OntologyBundle | null>(null);
  const [pickerClassId, setPickerClassId] = useState<string>('');

  const canEdit = can(role, 'cohorts:edit');

  useEffect(() => {
    let cancelled = false;
    api
      .getSampleDefinition()
      .then((d) => {
        if (!cancelled) setText(JSON.stringify(d, null, 2));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setParseError(err instanceof Error ? err.message : 'Failed to load sample definition');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getOntology()
      .then((b) => { if (!cancelled) { setOntology(b); setPickerClassId(b.classes[0]?.id ?? ''); } })
      .catch(() => { /* picker is an enhancement; editor still works */ });
    return () => { cancelled = true; };
  }, []);

  /** Parsed definition for the criteria tree (null while JSON is invalid). */
  const parsedDef = useMemo<CohortDefinition | null>(() => {
    try { return JSON.parse(text) as CohortDefinition; } catch { return null; }
  }, [text]);

  function addCriterionFromOntology() {
    const cls = ontology?.classes.find((c) => c.id === pickerClassId);
    const def = parseDefinition();
    if (!cls || !def) {
      toast({ title: 'Cannot add criterion', body: 'Fix the JSON first, then pick an ontology concept.', tone: 'err' });
      return;
    }
    const nextId = Math.max(-1, ...(def.concept_sets ?? []).map((c) => c.id)) + 1;
    const domain = domainForClass(cls.omop_mapping);
    const next: CohortDefinition = {
      ...def,
      concept_sets: [
        ...(def.concept_sets ?? []),
        { id: nextId, name: `${cls.label} (ontology ${cls.id})`, domain, concepts: [] },
      ],
      primary_criteria: [...(def.primary_criteria ?? []), { concept_set_id: nextId, domain }],
    };
    setText(JSON.stringify(next, null, 2));
    setValidation(null); setCount(null);
    toast({ title: 'Criterion added', body: `${cls.label} → primary criterion (concept set #${nextId}). Validate to check.`, tone: 'ok' });
  }

  const savedForTenant = useMemo(
    () => store.savedCohorts.filter((c) => c.tenant_id === tenantId),
    [store.savedCohorts, tenantId],
  );

  const savedRows: SavedRow[] = savedForTenant.map((c) => ({
    id: c.id,
    name: c.name,
    final_count: c.final_count,
    updated_at: c.updated_at,
    author: c.author,
  }));

  function parseDefinition(): CohortDefinition | null {
    try {
      const parsed = JSON.parse(text) as CohortDefinition;
      setParseError(null);
      return parsed;
    } catch (e) {
      setParseError(`JSON parse error: ${(e as Error).message}`);
      return null;
    }
  }

  async function onValidate() {
    const def = parseDefinition();
    if (!def) {
      toast({ title: 'Invalid JSON', body: 'Fix the parse error before validating.', tone: 'err' });
      return;
    }
    setBusy('validate');
    try {
      const result = await api.validateCohort(def);
      setValidation(result);
      toast({
        title: result.valid ? 'Definition valid' : 'Definition invalid',
        body: result.valid ? undefined : result.errors.join('; '),
        tone: result.valid ? 'ok' : 'err',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onCount() {
    const def = parseDefinition();
    if (!def) {
      toast({ title: 'Invalid JSON', body: 'Fix the parse error before counting.', tone: 'err' });
      return;
    }
    setBusy('count');
    try {
      const result = await api.countCohort(def);
      setCount(result);
      setLastCount(result.final_count);
      toast({
        title: 'Cohort counted',
        body: `Final count ${fmtNum(result.final_count)} (fixture data).`,
        tone: 'ok',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onExportAtlas() {
    const def = parseDefinition();
    if (!def) {
      toast({ title: 'Invalid JSON', body: 'Fix the parse error before exporting.', tone: 'err' });
      return;
    }
    setBusy('export');
    try {
      const doc = await api.exportAtlas(def);
      setAtlas(doc);
      setAtlasOpen(true);
      toast({ title: 'ATLAS export ready', body: 'Review the JSON, then download.', tone: 'ok' });
    } finally {
      setBusy(null);
    }
  }

  function onDownloadAtlas() {
    if (!atlas) return;
    const safeName =
      atlas.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
      'atlas-cohort';
    downloadJson(`${safeName}.atlas.json`, atlas);
    toast({ title: 'ATLAS JSON downloaded', body: `${safeName}.atlas.json`, tone: 'ok' });
  }

  function openSave() {
    if (!canEdit) return;
    const def = parseDefinition();
    if (!def) {
      toast({ title: 'Invalid JSON', body: 'Fix the parse error before saving.', tone: 'err' });
      return;
    }
    setPendingSaveDef(def);
    setSaveName(def.name ?? '');
    setSaveNameError(null);
    setSaveOpen(true);
  }

  async function confirmSave() {
    const name = saveName.trim();
    if (!name) {
      setSaveNameError('Name is required.');
      return;
    }
    if (!pendingSaveDef) return;
    setBusy('save');
    try {
      const saved = await api.saveCohort(name, { ...pendingSaveDef, name }, lastCount, tenantId, actor);
      setSaveOpen(false);
      setPendingSaveDef(null);
      toast({ title: 'Cohort saved', body: `“${saved.name}” is in the library.`, tone: 'ok' });
    } finally {
      setBusy(null);
    }
  }

  function loadSaved(row: SavedRow) {
    const saved = savedForTenant.find((c) => c.id === row.id);
    if (!saved) return;
    setText(JSON.stringify(saved.definition, null, 2));
    setParseError(null);
    setValidation(null);
    setCount(null);
    setLastCount(saved.final_count);
    toast({ title: 'Cohort loaded', body: `“${saved.name}” is in the editor.`, tone: 'info' });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusy('delete');
    try {
      await api.deleteCohort(target.id, actor);
      setPendingDelete(null);
      toast({ title: 'Cohort deleted', body: `“${target.name}” removed from the library.`, tone: 'ok' });
    } finally {
      setBusy(null);
    }
  }

  const savedColumns: Array<Column<SavedRow>> = [
    { key: 'name', label: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
    {
      key: 'final_count',
      label: 'Final count',
      render: (r) => (r.final_count === null ? '—' : fmtNum(r.final_count)),
      sortValue: (r) => r.final_count ?? -1,
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (r) => fmtDate(r.updated_at),
      sortValue: (r) => r.updated_at,
    },
    { key: 'author', label: 'Author', render: (r) => r.author, sortValue: (r) => r.author },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <span className="row">
          <button type="button" className="btn btn-sm" onClick={() => loadSaved(r)}>
            Load
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={!canEdit}
            title={canEdit ? undefined : 'Requires cohorts:edit permission'}
            onClick={() => {
              const saved = savedForTenant.find((c) => c.id === r.id);
              if (saved) setPendingDelete(saved);
            }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  const attritionRows: AttritionRow[] = (count?.attrition ?? []).map((a) => ({
    step: a.step,
    n_remaining: a.n_remaining,
    n_excluded: a.n_excluded,
  }));

  const attritionColumns: Array<Column<AttritionRow>> = [
    { key: 'step', label: 'Step', render: (r) => r.step, sortValue: (r) => r.step },
    { key: 'n_remaining', label: 'n remaining', render: (r) => fmtNum(r.n_remaining), sortValue: (r) => r.n_remaining },
    { key: 'n_excluded', label: 'n excluded', render: (r) => fmtNum(r.n_excluded), sortValue: (r) => r.n_excluded },
  ];

  return (
    <section>
      <SectionTitle
        title="Cohort Builder"
        sub="Definition JSON in the engine/cohort_schema.json shape. Validate, count, and export — then save to the tenant library."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canEdit}
            title={canEdit ? undefined : 'Requires cohorts:edit permission'}
            onClick={openSave}
          >
            Save current definition
          </button>
        }
      />
      {!canEdit && (
        <p className="muted">
          Your role ({role}) can view cohorts but cannot save or delete them
          (requires cohorts:edit).
        </p>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <SectionTitle
          title="Criteria — ontology concepts"
          sub="Criteria reference governed ontology classes from the semantic layer, never raw source codes."
        />
        <div data-testid="criteria-tree">
          {parsedDef ? (
            <>
              <h4 style={{ margin: '4px 0 6px' }}>Concept sets</h4>
              <ul className="list">
                {(parsedDef.concept_sets ?? []).map((cs) => {
                  const isPrimary = (parsedDef.primary_criteria ?? []).some((c) => c.concept_set_id === cs.id);
                  const usedInRules = (parsedDef.inclusion_rules ?? [])
                    .filter((r) => (r.criteria ?? []).some((c) => c.concept_set_id === cs.id))
                    .map((r) => r.name);
                  return (
                    <li key={cs.id}>
                      <strong>{cs.name}</strong>{' '}
                      <Pill tone="info">{cs.domain}</Pill>{' '}
                      {isPrimary ? <Pill tone="ok">primary criterion</Pill> : null}{' '}
                      {usedInRules.map((n) => <Pill key={n} tone="neutral">rule: {n}</Pill>)}
                      <br />
                      <span className="muted">
                        {(cs.concepts ?? []).length === 0
                          ? 'No standard concepts bound yet — bind via Concept Mappings in Ontology.'
                          : (cs.concepts ?? []).map((c) => `${c.concept_name} (${c.concept_id})`).join(' · ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <h4 style={{ margin: '12px 0 6px' }}>Inclusion rules</h4>
              <ul className="list">
                {(parsedDef.inclusion_rules ?? []).map((r) => (
                  <li key={r.name}>
                    <strong>{r.name}</strong>{' '}
                    <span className="muted">
                      {[r.age_min !== null || r.age_max !== null ? `age ${r.age_min ?? '…'}–${r.age_max ?? '…'}` : null,
                        r.min_prior_observation_days ? `≥${r.min_prior_observation_days}d prior observation` : null]
                        .filter(Boolean).join(' · ') || 'criteria-based'}
                    </span>
                  </li>
                ))}
                {(parsedDef.inclusion_rules ?? []).length === 0 && <li className="muted">No inclusion rules.</li>}
              </ul>
            </>
          ) : (
            <p className="muted">Fix the JSON below to see the criteria tree.</p>
          )}
        </div>

        <div className="row" data-testid="concept-picker" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 260px', marginBottom: 0 }}>
            <label htmlFor="concept-picker-select">Add criterion from ontology</label>
            <select
              id="concept-picker-select"
              data-testid="concept-picker-select"
              className="select"
              value={pickerClassId}
              disabled={!canEdit || !ontology}
              onChange={(e) => setPickerClassId(e.target.value)}
            >
              {(ontology?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.label} — {c.id} ({c.omop_mapping})</option>
              ))}
            </select>
            <span className="hint">Inserts a concept set + primary criterion bound to the governed class.</span>
          </div>
          <button type="button" className="btn btn-primary" disabled={!canEdit || !ontology}
            title={canEdit ? undefined : 'Requires cohorts:edit permission'}
            onClick={addCriterionFromOntology}>
            Add criterion
          </button>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="cohort-json">Cohort definition JSON</label>
          <textarea
            id="cohort-json"
            data-testid="cohort-json"
            className="json-editor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (parseError) setParseError(null);
            }}
            rows={18}
            spellCheck={false}
          />
          {parseError && (
            <p className="field-error" data-testid="parse-error" role="alert">
              {parseError}
            </p>
          )}
        </div>

        <div className="row">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void onValidate()}>
            Validate
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void onCount()}>
            Count
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void onExportAtlas()}>
            Export ATLAS
          </button>
        </div>

        {validation && (
          <div data-testid="validation-result" style={{ marginTop: 12 }}>
            {validation.valid ? (
              <Pill tone="ok">Valid definition ✓</Pill>
            ) : (
              <span>
                <Pill tone="err">Invalid</Pill>{' '}
                <span className="error">{validation.errors.join('; ')}</span>
              </span>
            )}
          </div>
        )}

        {count && (
          <div data-testid="attrition" style={{ marginTop: 14 }}>
            <h3>Attrition (fixture count)</h3>
            <p className="muted">
              Total persons {fmtNum(count.total_persons)} · entry{' '}
              {fmtNum(count.entry_count)} · final {fmtNum(count.final_count)}.{' '}
              {count.data_note}
            </p>
            {count.synthetic_disclosure && (
              <p className="muted">
                Synthetic disclosure: person counts and ids are fictional fixture
                data, not real epidemiology.
              </p>
            )}
            <DataTable
              rows={attritionRows}
              columns={attritionColumns}
              rowKey={(r) => r.step}
              pageSize={10}
              emptyText="No attrition steps."
            />
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <SectionTitle
          title="Saved cohorts"
          sub="Tenant library — saved cohorts feed P1 external-control studies. Load one into the editor or delete it."
        />
        <DataTable
          rows={savedRows}
          columns={savedColumns}
          rowKey={(r) => r.id}
          pageSize={8}
          testId="saved-cohorts"
          emptyText="No saved cohorts for this tenant yet."
        />
        <p className="muted" style={{ marginTop: 10 }}>
          Study link: cohorts saved here feed P1 studies — a study picks up the
          saved definition and its final count as its external-control cohort.
        </p>
      </div>

      {saveOpen && (
        <Modal title="Save cohort" onClose={() => setSaveOpen(false)} testId="save-cohort-modal">
          <div className="field">
            <label htmlFor="cohort-save-name">Cohort name</label>
            <input
              id="cohort-save-name"
              className="input"
              type="text"
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                if (saveNameError) setSaveNameError(null);
              }}
              placeholder="Cohort name"
            />
            {saveNameError && <span className="field-error">{saveNameError}</span>}
            <span className="hint">
              Saved for tenant {tenantId} as {actor}
              {lastCount !== null ? ` · last counted final n = ${fmtNum(lastCount)}` : ''}.
            </span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => void confirmSave()}
            >
              Save cohort
            </button>
          </div>
        </Modal>
      )}

      {atlasOpen && atlas && (
        <Modal title="ATLAS cohort definition" onClose={() => setAtlasOpen(false)} testId="atlas-modal">
          <p className="muted">
            Read-only ATLAS JSON export. Download writes the exact document below
            as a .json file.
          </p>
          <pre className="log-box" data-testid="atlas-json" style={{ maxHeight: 360 }}>
            {JSON.stringify(atlas, null, 2)}
          </pre>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAtlasOpen(false)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={onDownloadAtlas}>
              Download ATLAS JSON
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete saved cohort"
          body={
            <>
              Delete “{pendingDelete.name}” from the saved-cohort library? This
              cannot be undone in the demo store.
            </>
          }
          confirmLabel="Delete cohort"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
