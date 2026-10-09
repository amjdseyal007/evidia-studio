import { useEffect, useState } from 'react';
import { api, type AtlasDocument, type CohortCountResult, type CohortDefinition, type ValidateResult } from '../lib/api';
import MockBanner from '../components/MockBanner';

export default function CohortBuilder() {
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [count, setCount] = useState<CohortCountResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSampleDefinition().then((d) => setText(JSON.stringify(d, null, 2)));
  }, []);

  function parse(): CohortDefinition | null {
    try {
      setError(null);
      return JSON.parse(text) as CohortDefinition;
    } catch (e) {
      setError(`JSON parse error: ${(e as Error).message}`);
      return null;
    }
  }

  async function onValidate() {
    const def = parse();
    if (def) setValidation(await api.validateCohort(def));
  }
  async function onCount() {
    const def = parse();
    if (def) setCount(await api.countCohort(def));
  }
  async function onExportAtlas() {
    const def = parse();
    if (!def) return;
    const atlas: AtlasDocument = await api.exportAtlas(def);
    const blob = new Blob([JSON.stringify(atlas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-cohort-fixture.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <MockBanner />
      <h2>Cohort Builder</h2>
      <p className="muted">Definition JSON in the <code>engine/cohort_schema.json</code> shape. Validate / Count / ATLAS export call the MOCK client — counts are arithmetic on fixture rows, not epidemiology.</p>
      <label htmlFor="cohort-json">Cohort definition JSON</label>
      <textarea id="cohort-json" data-testid="cohort-json" className="json-editor" value={text} onChange={(e) => setText(e.target.value)} rows={18} />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" onClick={onValidate}>Validate</button>
        <button type="button" onClick={onCount}>Count</button>
        <button type="button" onClick={onExportAtlas}>Export ATLAS JSON</button>
      </div>
      {validation && (
        <p data-testid="validation-result">{validation.valid ? 'Valid definition ✓' : `Invalid: ${validation.errors.join('; ')}`}</p>
      )}
      {count && (
        <div data-testid="attrition">
          <h3>Attrition (fixture count)</h3>
          <p>Total persons {count.total_persons} · entry {count.entry_count} · final {count.final_count}. {count.data_note}</p>
          <table className="table">
            <thead><tr><th>Step</th><th>n remaining</th><th>n excluded</th></tr></thead>
            <tbody>
              {count.attrition.map((a) => (<tr key={a.step}><td>{a.step}</td><td>{a.n_remaining}</td><td>{a.n_excluded}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
