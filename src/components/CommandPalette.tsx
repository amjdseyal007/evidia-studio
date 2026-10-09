/**
 * Command palette (R9) — Cmd/Ctrl-K unified search across studies,
 * cohorts, datasets, agents, evidence packages/exports, ontology
 * classes, and semantic-search hits. Reads through the API seam + the
 * demo store; navigation only — no mutations here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SemanticHit } from '../lib/api';
import { useStore } from '../lib/store';

type ResultKind = 'study' | 'cohort' | 'dataset' | 'agent' | 'evidence' | 'ontology' | 'semantic';

interface PaletteResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  to: string;
}

const KIND_LABEL: Record<ResultKind, string> = {
  study: 'Study',
  cohort: 'Cohort',
  dataset: 'Dataset',
  agent: 'Agent',
  evidence: 'Evidence',
  ontology: 'Ontology class',
  semantic: 'Semantic',
};

function matchScore(query: string, text: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i >= q.length) return 1;
  }
  return 0;
}

export default function CommandPalette({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const store = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Array<{ id: string; label: string; omop: string }>>([]);
  const [semantic, setSemantic] = useState<SemanticHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    void api.getOntology().then((bundle) => {
      if (live) setClasses(bundle.classes.map((c) => ({ id: c.id, label: c.label, omop: c.omop_mapping })));
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    if (query.trim().length >= 2) {
      void api.semanticSearch(query).then((hits) => { if (live) setSemantic(hits.slice(0, 5)); });
    } else {
      setSemantic([]);
    }
    return () => { live = false; };
  }, [query]);

  const results = useMemo<Array<PaletteResult & { _s: number }>>(() => {
    const q = query.trim();
    const rows: Array<PaletteResult & { _s: number }> = [];
    const push = (kind: ResultKind, id: string, title: string, subtitle: string, to: string, text: string, boost = 0) => {
      const s = matchScore(q, text) + boost;
      if (s > 0) rows.push({ id: `${kind}-${id}`, kind, title, subtitle, to, _s: s });
    };
    for (const s of store.studies.filter((x) => x.tenant_id === tenantId)) {
      push('study', s.study_id, s.name, `${s.study_id} · ${s.status}${s.classification === 'regulatory' ? ' · Regulatory' : ''}`, `/studies/${s.study_id}`, `${s.name} ${s.study_id} ${s.status}`);
    }
    for (const c of store.savedCohorts.filter((x) => x.tenant_id === tenantId)) {
      push('cohort', c.id, c.name, `Saved cohort · ${c.final_count ?? '—'} persons`, '/cohorts', `${c.name} ${c.id}`);
    }
    for (const d of store.datasets.filter((x) => x.tenant_id === tenantId)) {
      push('dataset', d.dataset_id, d.name, `${d.layer} · DQ ${d.dq_score ?? '—'} · ${d.rows.toLocaleString()} rows`, '/pipeline', `${d.name} ${d.dataset_id}`);
    }
    for (const a of store.agentDefs) {
      push('agent', a.name, a.display_name, `Agent · v${a.version} · ontology tools: ${a.allowed_ontology_tools.length}`, '/agents', `${a.display_name} ${a.name}`);
    }
    push('evidence', store.evidence.study_id, store.evidence.title, `Evidence package · ${store.evidence.signatures.length} signatures`, '/evidence', `${store.evidence.title} ${store.evidence.study_id}`);
    for (const e of store.evidenceExports.filter((x) => x.tenant_id === tenantId)) {
      push('evidence', e.export_id, `Evidence export — ${e.study_id}`, `${e.fingerprint} · ${e.generated_at.slice(0, 10)}`, '/evidence', `evidence export ${e.study_id} ${e.fingerprint}`);
    }
    for (const c of classes) {
      push('ontology', c.id, c.label, `Ontology class · ${c.omop !== '—' ? `OMOP: ${c.omop}` : 'no OMOP mapping'}`, '/ontology', `${c.label} ${c.id} ${c.omop}`);
    }
    for (const h of semantic) {
      rows.push({ id: `semantic-${h.class_id}`, kind: 'semantic', title: h.label, subtitle: `Semantic · ${h.matched_on}${h.path.length > 1 ? ` · ${h.path.join(' → ')}` : ''}`, to: '/ontology', _s: 1.5 });
    }
    rows.sort((a, b) => b._s - a._s);
    return rows.slice(0, 14);
  }, [query, store, tenantId, classes, semantic]);

  const pick = (r: PaletteResult) => {
    navigate(r.to);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      const r = results[active];
      if (r) pick(r);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="palette-backdrop"
      data-testid="command-palette"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="palette" role="dialog" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="palette-input"
            data-testid="command-palette-input"
            placeholder="Search studies, cohorts, datasets, ontology classes…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            aria-label="Search"
          />
          <kbd className="palette-kbd">esc</kbd>
        </div>
        <div className="palette-list" role="listbox" aria-label="Search results">
          {results.length === 0 && (
            <div className="palette-empty muted" data-testid="palette-empty">
              No results{query.trim() ? ` for “${query.trim()}”` : ''}. Try a study name, cohort, dataset, or ontology class.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={i === active}
              data-testid={`palette-result-${r.id}`}
              className={i === active ? 'palette-row active' : 'palette-row'}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className="pill pill-info">{KIND_LABEL[r.kind]}</span>
              <span className="palette-row-main">
                <strong>{r.title}</strong>
                <span className="muted">{r.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="palette-foot muted">
          <span>↑↓ navigate</span><span>↵ open</span><span>⌘K / Ctrl+K anywhere</span>
        </div>
      </div>
    </div>
  );
}
