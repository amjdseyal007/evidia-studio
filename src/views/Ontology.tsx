import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type ChangeProposal,
  type ConceptMapping,
  type OntologyBundle,
  type SemanticHit,
} from '../lib/api';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';
import { can } from '../lib/permissions';
import {
  DataTable,
  EmptyState,
  Meter,
  Pill,
  SectionTitle,
  SkeletonRows,
  fmtDate,
  fmtNum,
  toneForStatus,
  useToasts,
  type Column,
  type Tone,
} from '../components/ui';

type TabId = 'explorer' | 'mappings' | 'governance' | 'search';

function mappingTone(status: ConceptMapping['review_status']): Tone {
  if (status === 'approved') return 'ok';
  if (status === 'pending') return 'warn';
  if (status === 'rejected') return 'err';
  return 'neutral';
}

function versionTone(status: string): Tone {
  if (status === 'approved') return 'ok';
  if (status === 'in-review') return 'info';
  if (status === 'draft') return 'neutral';
  if (status === 'superseded') return 'neutral';
  return toneForStatus(status);
}

function proposalTone(status: string): Tone {
  if (status === 'approved') return 'ok';
  if (status === 'pending') return 'warn';
  if (status === 'rejected') return 'err';
  return 'neutral';
}

export default function Ontology() {
  const { user } = useSession();
  const store = useStore();
  const { push } = useToasts();

  const actor = user?.email ?? 'unknown@example.com';
  const tenantId = user?.tenant_id ?? 'acme_rare';
  const role = user?.role;

  const [bundle, setBundle] = useState<OntologyBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('explorer');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeNamespaceTenant, setActiveNamespaceTenant] = useState<string>(tenantId);

  const [mapCodesText, setMapCodesText] = useState('');
  const [mapResult, setMapResult] = useState<{ mapped: ConceptMapping[]; unmapped: string[] } | null>(null);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  const [propTitle, setPropTitle] = useState('');
  const [propKind, setPropKind] = useState<ChangeProposal['kind']>('class');
  const [propDetail, setPropDetail] = useState('');
  const [propBusy, setPropBusy] = useState(false);
  const [decideBusyId, setDecideBusyId] = useState<string | null>(null);

  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [semanticSearched, setSemanticSearched] = useState(false);
  const [semanticBusy, setSemanticBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getOntology()
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setSelectedId((prev) => prev ?? data.classes[0]?.id ?? null);
        setActiveNamespaceTenant((prev) => {
          if (data.namespaces.some((n) => n.tenant_id === prev)) return prev;
          const bySession = data.namespaces.find((n) => n.tenant_id === tenantId);
          return bySession?.tenant_id ?? data.namespaces[0]?.tenant_id ?? prev;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load ontology');
      });
    return () => {
      cancelled = true;
    };
    // tenantId is stable per session; loading once is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classById = useMemo(() => {
    const m = new Map<string, OntologyBundle['classes'][number]>();
    if (!bundle) return m;
    for (const c of bundle.classes) m.set(c.id, c);
    return m;
  }, [bundle]);

  const labelFor = (id: string): string => classById.get(id)?.label ?? id;

  const selectedClass = useMemo(() => {
    if (!bundle) return null;
    return bundle.classes.find((c) => c.id === selectedId) ?? bundle.classes[0] ?? null;
  }, [bundle, selectedId]);

  const flattenedTree = useMemo(() => {
    if (!bundle) return [] as Array<{ id: string; depth: number }>;
    const childrenOf = new Map<string, string[]>();
    const roots: string[] = [];
    for (const cls of bundle.classes) {
      const parent = bundle.parents[cls.id] ?? null;
      if (!parent || !classById.has(parent)) {
        roots.push(cls.id);
      } else {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(cls.id);
        childrenOf.set(parent, arr);
      }
    }
    const out: Array<{ id: string; depth: number }> = [];
    const visit = (id: string, depth: number) => {
      out.push({ id, depth });
      const kids = childrenOf.get(id) ?? [];
      for (const k of kids) visit(k, depth + 1);
    };
    for (const r of roots) visit(r, 0);
    // include any class not reachable (safety for orphan parents)
    const seen = new Set(out.map((x) => x.id));
    for (const cls of bundle.classes) {
      if (!seen.has(cls.id)) out.push({ id: cls.id, depth: 0 });
    }
    return out;
  }, [bundle, classById]);

  const activeNamespace = useMemo(() => {
    if (!bundle) return null;
    return bundle.namespaces.find((n) => n.tenant_id === activeNamespaceTenant) ?? bundle.namespaces[0] ?? null;
  }, [bundle, activeNamespaceTenant]);

  const mappingCounts = useMemo(() => {
    const counts = { total: store.mappings.length, approved: 0, pending: 0, rejected: 0, unmapped: 0 };
    for (const m of store.mappings) counts[m.review_status] += 1;
    return counts;
  }, [store.mappings]);

  const mappingRows = useMemo(() => store.mappings.map((m) => ({ ...m })), [store.mappings]);
  type MappingRow = (typeof mappingRows)[number];

  const versionRows = useMemo(
    () => (store.ontologyVersions.length ? store.ontologyVersions : bundle?.versions ?? []).map((v) => ({ ...v })),
    [store.ontologyVersions, bundle],
  );
  type VersionRow = (typeof versionRows)[number];

  const proposalRows = useMemo(
    () => (store.proposals.length ? store.proposals : bundle?.proposals ?? []).map((p) => ({ ...p })),
    [store.proposals, bundle],
  );
  type ProposalRow = (typeof proposalRows)[number];

  const approvedVersion = useMemo(
    () => versionRows.find((v) => v.status === 'approved') ?? null,
    [versionRows],
  );

  const canManageMappings = can(role, 'mappings:manage');
  const canManageOntology = can(role, 'ontology:manage');
  const canApproveOntology = can(role, 'ontology:approve');

  async function handleReviewMapping(id: string, decision: 'approved' | 'rejected') {
    setReviewBusyId(id);
    try {
      await api.reviewMapping(id, decision, tenantId, actor);
      const rec = store.mappings.find((m) => m.id === id);
      push({
        title: decision === 'approved' ? 'Mapping approved' : 'Mapping rejected',
        body: rec ? `${rec.source_code} → ${rec.target_label ?? '—'}` : id,
        tone: decision === 'approved' ? 'ok' : 'warn',
      });
    } catch (err) {
      push({ title: 'Review failed', body: err instanceof Error ? err.message : 'Could not review mapping.', tone: 'err' });
    } finally {
      setReviewBusyId(null);
    }
  }

  async function handleMapCodes() {
    const text = mapCodesText.trim();
    if (!text) {
      push({ title: 'No codes to map', body: 'Paste at least one source code to run the mapping job.', tone: 'warn' });
      return;
    }
    setMappingBusy(true);
    try {
      const result = await api.mapCodes(text, tenantId, actor);
      setMapResult(result);
      push({
        title: 'Mapping run complete',
        body: `${result.mapped.length} resolved · ${result.unmapped.length} unmapped (flagged, not guessed)`,
        tone: 'ok',
      });
    } catch (err) {
      push({ title: 'Mapping failed', body: err instanceof Error ? err.message : 'Could not map codes.', tone: 'err' });
    } finally {
      setMappingBusy(false);
    }
  }

  async function handleDecideProposal(id: string, decision: 'approved' | 'rejected') {
    setDecideBusyId(id);
    try {
      await api.decideProposal(id, decision, tenantId, actor);
      const rec = proposalRows.find((p) => p.id === id);
      push({
        title: decision === 'approved' ? 'Proposal approved' : 'Proposal rejected',
        body: rec ? rec.title : id,
        tone: decision === 'approved' ? 'ok' : 'warn',
      });
    } catch (err) {
      push({ title: 'Decision failed', body: err instanceof Error ? err.message : 'Could not decide proposal.', tone: 'err' });
    } finally {
      setDecideBusyId(null);
    }
  }

  async function handleSubmitProposal() {
    const title = propTitle.trim();
    const detail = propDetail.trim();
    if (!title || !detail) {
      push({ title: 'Proposal incomplete', body: 'Title and detail are required.', tone: 'warn' });
      return;
    }
    setPropBusy(true);
    try {
      const created = await api.submitProposal({ title, kind: propKind, detail }, tenantId, actor);
      push({ title: 'Proposal submitted', body: `“${created.title}” is pending review. Agents still see only the approved version.`, tone: 'ok' });
      setPropTitle('');
      setPropKind('class');
      setPropDetail('');
    } catch (err) {
      push({ title: 'Submission failed', body: err instanceof Error ? err.message : 'Could not submit proposal.', tone: 'err' });
    } finally {
      setPropBusy(false);
    }
  }

  async function runSemanticSearch(q: string) {
    const query = q.trim();
    if (!query) {
      setSemanticHits([]);
      setSemanticSearched(false);
      return;
    }
    setSemanticBusy(true);
    try {
      const hits = await api.semanticSearch(query);
      setSemanticHits(hits);
      setSemanticSearched(true);
    } catch (err) {
      push({ title: 'Semantic search failed', body: err instanceof Error ? err.message : 'Search failed.', tone: 'err' });
      setSemanticHits([]);
      setSemanticSearched(true);
    } finally {
      setSemanticBusy(false);
    }
  }

  function jumpToClass(classId: string) {
    setSelectedId(classId);
    setTab('explorer');
  }

  if (error) {
    return (
      <section>
        <SectionTitle
          title="Ontology & Semantic Layer"
          sub="Scan → Model → Serve — governed semantic layer for tenant data and agents."
        />
        <div className="card">
          <EmptyState title="Ontology failed to load" body={error} />
        </div>
      </section>
    );
  }

  if (!bundle) {
    return (
      <section>
        <SectionTitle
          title="Ontology & Semantic Layer"
          sub="Scan → Model → Serve — governed semantic layer for tenant data and agents."
        />
        <div className="card" aria-busy="true">
          <p className="muted">Loading ontology…</p>
          <SkeletonRows n={6} />
        </div>
      </section>
    );
  }

  const mcpRows = bundle.mcpTools.map((t) => ({ ...t }));
  type McpRow = (typeof mcpRows)[number];
  const mcpColumns: Array<Column<McpRow>> = [
    { key: 'tool', label: 'Tool', render: (r) => <span className="mono">{r.tool}</span>, sortValue: (r) => r.tool },
    { key: 'description', label: 'Description', render: (r) => r.description, sortValue: (r) => r.description },
    { key: 'agents', label: 'Agents allowed', render: (r) => r.agents, sortValue: (r) => r.agents },
  ];

  const mappingColumns: Array<Column<MappingRow>> = [
    {
      key: 'source',
      label: 'Source',
      render: (r) => (
        <span>
          <strong className="mono">{r.source_code}</strong>{' '}
          <span className="muted">{r.source_system}</span>
          <br />
          <span>{r.source_label}</span>
        </span>
      ),
      sortValue: (r) => `${r.source_code} ${r.source_label}`,
    },
    {
      key: 'target',
      label: 'Standard target',
      render: (r) =>
        r.target_label ? (
          <span>
            {r.target_label}
            <br />
            <span className="muted">
              {r.target_vocabulary ?? '—'}
              {r.target_concept_id ? (
                <>
                  {' · OMOP '}
                  <span className="mono">{fmtNum(r.target_concept_id)}</span>
                </>
              ) : null}
            </span>
          </span>
        ) : (
          <span className="muted">— no standard concept —</span>
        ),
      sortValue: (r) => r.target_label ?? '',
    },
    {
      key: 'domain',
      label: 'Domain',
      render: (r) => r.omop_domain ?? '—',
      sortValue: (r) => r.omop_domain ?? '',
    },
    {
      key: 'confidence',
      label: 'Confidence',
      render: (r) =>
        r.confidence == null ? (
          <span className="muted">—</span>
        ) : (
          <span>
            <Meter value={r.confidence} max={1} label={`confidence ${r.confidence}`} />
            <span className="muted">{Math.round(r.confidence * 100)}%</span>
          </span>
        ),
      sortValue: (r) => r.confidence ?? -1,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <Pill tone={mappingTone(r.review_status)}>{r.review_status}</Pill>,
      sortValue: (r) => r.review_status,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => {
        if (r.review_status !== 'pending') {
          return (
            <span className="muted">
              {r.reviewed_by ? `by ${r.reviewed_by}` : '—'}
            </span>
          );
        }
        if (!canManageMappings) {
          return <span className="muted">awaiting review</span>;
        }
        const busy = reviewBusyId === r.id;
        return (
          <span className="row">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => void handleReviewMapping(r.id, 'approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void handleReviewMapping(r.id, 'rejected')}
            >
              Reject
            </button>
          </span>
        );
      },
    },
  ];

  const versionColumns: Array<Column<VersionRow>> = [
    {
      key: 'version',
      label: 'Version',
      render: (r) => <span className="mono">{r.version}</span>,
      sortValue: (r) => r.version,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <Pill tone={versionTone(r.status)}>{r.status}</Pill>,
      sortValue: (r) => r.status,
    },
    {
      key: 'published_at',
      label: 'Published',
      render: (r) => (r.published_at ? fmtDate(r.published_at) : '—'),
      sortValue: (r) => r.published_at ?? '',
    },
    { key: 'author', label: 'Author', render: (r) => r.author, sortValue: (r) => r.author },
    {
      key: 'shape',
      label: 'Shape',
      render: (r) => (
        <span className="muted">
          {fmtNum(r.classes)} classes · {fmtNum(r.properties)} properties
        </span>
      ),
      sortValue: (r) => r.classes,
    },
    { key: 'notes', label: 'Notes', render: (r) => r.notes, sortValue: (r) => r.notes },
  ];

  const proposalColumns: Array<Column<ProposalRow>> = [
    {
      key: 'title',
      label: 'Title',
      render: (r) => (
        <span>
          <strong>{r.title}</strong>
          <br />
          <span className="muted">{r.detail}</span>
        </span>
      ),
      sortValue: (r) => r.title,
    },
    { key: 'kind', label: 'Kind', render: (r) => <Pill tone="neutral">{r.kind}</Pill>, sortValue: (r) => r.kind },
    { key: 'author', label: 'Author', render: (r) => r.author, sortValue: (r) => r.author },
    {
      key: 'submitted_at',
      label: 'Submitted',
      render: (r) => fmtDate(r.submitted_at),
      sortValue: (r) => r.submitted_at,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <Pill tone={proposalTone(r.status)}>{r.status}</Pill>,
      sortValue: (r) => r.status,
    },
    {
      key: 'decided_by',
      label: 'Decided by',
      render: (r) => r.decided_by ?? '—',
      sortValue: (r) => r.decided_by ?? '',
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => {
        if (r.status !== 'pending') return <span className="muted">—</span>;
        if (!canApproveOntology) {
          return <span className="muted">awaiting Biostatistician/Admin</span>;
        }
        const busy = decideBusyId === r.id;
        return (
          <span className="row">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy}
              onClick={() => void handleDecideProposal(r.id, 'approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void handleDecideProposal(r.id, 'rejected')}
            >
              Reject
            </button>
          </span>
        );
      },
    },
  ];

  const parentId = selectedClass ? (bundle.parents[selectedClass.id] ?? null) : null;
  const childIds = selectedClass
    ? bundle.classes.filter((c) => (bundle.parents[c.id] ?? null) === selectedClass.id).map((c) => c.id)
    : [];
  const synonyms = selectedClass ? (bundle.synonyms[selectedClass.id] ?? []) : [];
  const outgoing = selectedClass ? bundle.properties.filter((p) => p.domain === selectedClass.id) : [];
  const incoming = selectedClass ? bundle.properties.filter((p) => p.range === selectedClass.id) : [];

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'explorer', label: 'Explorer' },
    { id: 'mappings', label: 'Concept Mappings' },
    { id: 'governance', label: 'Governance' },
    { id: 'search', label: 'Semantic Search' },
  ];

  return (
    <section>
      <SectionTitle
        title="Ontology & Semantic Layer"
        sub="Scan → Model → Serve — governed semantic layer for tenant data and agents."
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          W3C RDF/OWL seed ontology (<span className="mono">ontology/evidia-seed.ttl</span>) · Neptune graph store ·
          MCP server on Bedrock AgentCore Runtime · per-agent tool allow-lists · Cognito JWT + Cedar pre-auth.
          Implemented in platform code; not deployed — this console shows mock data over the seed ontology.
        </p>
      </div>

      <div className="row" data-testid="ontology-tabs" role="tablist" aria-label="Ontology sections" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="muted">
          Tenant <span className="mono">{tenantId}</span> · {user?.name ?? actor} ({role ?? '—'})
        </span>
      </div>

      {tab === 'explorer' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="grid-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="ontology-namespace-select">Namespace (tenant graph)</label>
                <select
                  id="ontology-namespace-select"
                  className="select"
                  value={activeNamespace?.tenant_id ?? activeNamespaceTenant}
                  onChange={(e) => setActiveNamespaceTenant(e.target.value)}
                >
                  {bundle.namespaces.map((n) => (
                    <option key={n.tenant_id} value={n.tenant_id}>
                      {n.namespace} ({n.tenant_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Namespace stats</label>
                {activeNamespace ? (
                  <span>
                    <strong>{fmtNum(activeNamespace.classes)}</strong> classes ·{' '}
                    <strong>{fmtNum(activeNamespace.triples_demo)}</strong> triples · last scan{' '}
                    {activeNamespace.last_scan === 'never' ? 'never' : fmtDate(activeNamespace.last_scan)}
                    <br />
                    <span className="mono muted">{activeNamespace.namespace}</span>
                  </span>
                ) : (
                  <span className="muted">No namespace selected.</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <SectionTitle
                title="Class hierarchy"
                sub={`${bundle.classes.length} classes grounded in ontology/evidia-seed.ttl`}
              />
              <div data-testid="ontology-class-tree">
                {flattenedTree.length === 0 ? (
                  <EmptyState title="No classes" body="The seed ontology returned no classes." />
                ) : (
                  <ul className="list">
                    {flattenedTree.map(({ id, depth }) => {
                      const cls = classById.get(id);
                      if (!cls) return null;
                      const active = selectedClass?.id === id;
                      return (
                        <li key={id} style={{ paddingLeft: depth * 16 }}>
                          <button
                            type="button"
                            className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                            aria-pressed={active}
                            onClick={() => setSelectedId(id)}
                            style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                          >
                            <span>
                              <strong>{cls.label}</strong> <span className="mono">{cls.id}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="card">
              <SectionTitle title="Class detail" sub="Definition, OMOP grounding, and graph relations" />
              {selectedClass ? (
                <div data-testid="ontology-class-detail">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3>{selectedClass.label}</h3>
                    <Pill tone={selectedClass.omop_mapping.startsWith('OMOP') ? 'info' : 'neutral'}>
                      {selectedClass.omop_mapping}
                    </Pill>
                  </div>

                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Class id</label>
                    <span className="mono">{selectedClass.id}</span>
                  </div>
                  <div className="field">
                    <label>Definition</label>
                    <span>{selectedClass.description}</span>
                  </div>
                  <div className="field">
                    <label>Parent</label>
                    {parentId ? (
                      <button type="button" className="btn btn-sm" onClick={() => setSelectedId(parentId)}>
                        {labelFor(parentId)} <span className="mono">{parentId}</span>
                      </button>
                    ) : (
                      <span className="muted">— top-level class —</span>
                    )}
                  </div>
                  <div className="field">
                    <label>Demo instance count</label>
                    <span>{fmtNum(selectedClass.instances_demo)}</span>
                  </div>

                  <div className="field">
                    <label>Synonyms</label>
                    {synonyms.length ? (
                      <span className="row">
                        {synonyms.map((s) => (
                          <Pill key={s} tone="neutral">
                            {s}
                          </Pill>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">No synonyms recorded.</span>
                    )}
                  </div>

                  <div className="field">
                    <label>Children</label>
                    {childIds.length ? (
                      <span className="row">
                        {childIds.map((cid) => (
                          <button key={cid} type="button" className="btn btn-sm" onClick={() => setSelectedId(cid)}>
                            {labelFor(cid)}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">No subclasses.</span>
                    )}
                  </div>

                  <div className="field">
                    <label>Outgoing relations</label>
                    {outgoing.length ? (
                      <ul className="list">
                        {outgoing.map((p) => (
                          <li key={p.id}>
                            <span className="mono">{p.id}</span> · {p.label} →{' '}
                            {classById.has(p.range) ? (
                              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedId(p.range)}>
                                {labelFor(p.range)} <span className="mono">{p.range}</span>
                              </button>
                            ) : (
                              <span className="mono">{p.range}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">No outgoing properties.</span>
                    )}
                  </div>

                  <div className="field">
                    <label>Incoming relations</label>
                    {incoming.length ? (
                      <ul className="list">
                        {incoming.map((p) => (
                          <li key={p.id}>
                            {classById.has(p.domain) ? (
                              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedId(p.domain)}>
                                {labelFor(p.domain)} <span className="mono">{p.domain}</span>
                              </button>
                            ) : (
                              <span className="mono">{p.domain}</span>
                            )}{' '}
                            —{p.label}→ <strong>{selectedClass.label}</strong>{' '}
                            <span className="mono muted">{p.id}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">No incoming properties.</span>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState title="No class selected" body="Pick a class from the hierarchy." />
              )}
            </div>
          </div>

          <div className="card-grid" data-testid="ontology-pipeline-stages" style={{ marginTop: 14 }}>
            {bundle.pipelineStages.map((s) => (
              <div key={s.stage} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>{s.stage}</h3>
                  <Pill tone={toneForStatus(s.status) === 'neutral' ? 'ok' : toneForStatus(s.status)}>{s.status}</Pill>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  {s.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <SectionTitle title="MCP tools" sub="Ontology tools exposed to agents, gated by per-agent allow-lists" />
            <DataTable
              rows={mcpRows}
              columns={mcpColumns}
              rowKey={(r) => r.tool}
              pageSize={10}
              testId="ontology-mcp-tools"
              emptyText="No MCP tools."
            />
          </div>
        </div>
      )}

      {tab === 'mappings' && (
        <div>
          <div className="card-grid" style={{ marginTop: 0 }}>
            <div className="card">
              <div className="kpi-label">Total mappings</div>
              <div className="kpi-value">{fmtNum(mappingCounts.total)}</div>
              <div className="muted">Source → standard concept</div>
            </div>
            <div className="card">
              <div className="kpi-label">Approved</div>
              <div className="kpi-value">{fmtNum(mappingCounts.approved)}</div>
              <div className="muted">Agent-usable after ontology approval</div>
            </div>
            <div className="card">
              <div className="kpi-label">Pending review</div>
              <div className="kpi-value">{fmtNum(mappingCounts.pending)}</div>
              <div className="muted">Needs human decision</div>
            </div>
            <div className="card">
              <div className="kpi-label">Unmapped</div>
              <div className="kpi-value">{fmtNum(mappingCounts.unmapped)}</div>
              <div className="muted">Flagged — never guessed</div>
            </div>
            <div className="card">
              <div className="kpi-label">Rejected</div>
              <div className="kpi-value">{fmtNum(mappingCounts.rejected)}</div>
              <div className="muted">Reviewed and declined</div>
            </div>
          </div>

          <div className="card">
            <SectionTitle
              title="Concept mappings"
              sub="Source codes mapped to standard vocabularies and OMOP concepts. Pending rows need a reviewer with mappings:manage."
            />
            <DataTable
              rows={mappingRows}
              columns={mappingColumns}
              rowKey={(r) => r.id}
              pageSize={10}
              testId="ontology-mappings"
              emptyText="No concept mappings yet. Use “Map new codes” to resolve source codes."
            />
            {!canManageMappings ? (
              <p className="muted">
                Your role ({role ?? '—'}) can view mappings; running and reviewing mappings requires mappings:manage.
              </p>
            ) : null}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <SectionTitle
              title="Map new codes"
              sub="Paste source codes (ICD-10, LOINC, RxNorm, CPT, local). Known codes resolve to a candidate standard concept as pending review; unknown codes are flagged unmapped — unmapped codes are never guessed."
            />
            <div className="field">
              <label htmlFor="map-codes-input">Source codes</label>
              <textarea
                id="map-codes-input"
                data-testid="map-codes-input"
                className="input"
                rows={4}
                placeholder="e.g. G12.1, E11.9, 2160-0 — one per line or comma-separated"
                value={mapCodesText}
                onChange={(e) => setMapCodesText(e.target.value)}
              />
              <span className="hint">
                Try <span className="mono">G12.1</span>, <span className="mono">E11.9</span>,{' '}
                <span className="mono">2160-0</span> (known candidates) or any unknown code to see the unmapped path.
              </span>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="map-codes-run"
                disabled={!canManageMappings || mappingBusy}
                title={canManageMappings ? 'Run the mapping job' : 'Requires the mappings:manage permission'}
                onClick={() => void handleMapCodes()}
              >
                {mappingBusy ? 'Mapping…' : 'Run mapping'}
              </button>
              <span className="muted">Unmapped codes are never guessed — they are routed to the review queue.</span>
            </div>

            {mapResult ? (
              <div data-testid="map-codes-result" style={{ marginTop: 14 }}>
                <h3 style={{ marginBottom: 8 }}>Last mapping run</h3>
                {mapResult.mapped.length ? (
                  <div style={{ marginBottom: 10 }}>
                    <strong>Resolved ({mapResult.mapped.length})</strong>
                    <ul className="list">
                      {mapResult.mapped.map((m) => (
                        <li key={m.id}>
                          <span className="mono">{m.source_code}</span> → {m.target_label ?? '—'}{' '}
                          <span className="muted">
                            {m.target_vocabulary ?? ''}
                            {m.confidence != null ? ` · ${Math.round(m.confidence * 100)}% confidence` : ''}
                            {' · '}
                            {m.review_status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="muted">No codes resolved in this run.</p>
                )}
                {mapResult.unmapped.length ? (
                  <div>
                    <strong>Unmapped ({mapResult.unmapped.length})</strong>
                    <ul className="list">
                      {mapResult.unmapped.map((code) => (
                        <li key={code}>
                          <span className="mono">{code}</span> — no standard concept — routed to review queue
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="log-box" style={{ marginTop: 10 }}>
                  {`mapped: ${mapResult.mapped.map((m) => m.source_code).join(', ') || '—'}\nunmapped: ${mapResult.unmapped.join(', ') || '—'} (flagged, not guessed)`}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'governance' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <strong>Agent-visible ontology:</strong>{' '}
            <span>
              Agents see <strong>ONLY</strong> the approved version
              {approvedVersion ? (
                <>
                  {' '}
                  — currently <span className="mono">{approvedVersion.version}</span> ({fmtNum(approvedVersion.classes)}{' '}
                  classes · {fmtNum(approvedVersion.properties)} properties).
                </>
              ) : (
                <> — no approved version found.</>
              )}{' '}
              Draft and in-review versions are not visible to agents until approved.
            </span>
          </div>

          <div className="card">
            <SectionTitle title="Ontology versions" sub="Draft → in-review → approved. Only the approved version is served to agents." />
            <DataTable
              rows={versionRows}
              columns={versionColumns}
              rowKey={(r) => r.version}
              pageSize={10}
              testId="ontology-versions"
              emptyText="No ontology versions."
            />
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <SectionTitle
              title="Change proposals"
              sub="Proposed class/property/mapping changes. Approval requires ontology:approve (Biostatistician/Admin in this demo gate)."
            />
            <DataTable
              rows={proposalRows}
              columns={proposalColumns}
              rowKey={(r) => r.id}
              pageSize={10}
              testId="ontology-proposals"
              emptyText="No change proposals."
            />
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <SectionTitle title="Submit a change proposal" sub="New proposals enter as pending and do not change the agent-visible ontology until approved." />
            {canManageOntology ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSubmitProposal();
                }}
              >
                <div className="field">
                  <label htmlFor="prop-title">Title</label>
                  <input
                    id="prop-title"
                    className="input"
                    type="text"
                    placeholder="e.g. Add ev:Biomarker class under ev:Measurement"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                  />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="prop-kind">Kind</label>
                    <select
                      id="prop-kind"
                      className="select"
                      value={propKind}
                      onChange={(e) => setPropKind(e.target.value as ChangeProposal['kind'])}
                    >
                      <option value="class">class</option>
                      <option value="property">property</option>
                      <option value="mapping">mapping</option>
                      <option value="deprecation">deprecation</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="prop-detail">Detail</label>
                  <textarea
                    id="prop-detail"
                    className="input"
                    rows={4}
                    placeholder="Rationale, OMOP grounding, impacted agents/cohorts, and any source vocabulary evidence…"
                    value={propDetail}
                    onChange={(e) => setPropDetail(e.target.value)}
                  />
                </div>
                <div className="row">
                  <button type="submit" className="btn btn-primary" disabled={propBusy}>
                    {propBusy ? 'Submitting…' : 'Submit proposal'}
                  </button>
                  <span className="muted">Submitting as {actor} for tenant {tenantId}.</span>
                </div>
              </form>
            ) : (
              <p className="muted">
                Your role ({role ?? '—'}) can view governance; submitting proposals requires ontology:manage.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'search' && (
        <div>
          <div className="card">
            <SectionTitle
              title="Semantic search"
              sub="Relationship-aware search over class labels, synonyms, definitions, and concept mappings. Click a hit or related class to open it in the Explorer."
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSemanticSearch(semanticQuery);
              }}
            >
              <div className="row">
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="semantic-search-input">Query</label>
                  <input
                    id="semantic-search-input"
                    data-testid="semantic-search-input"
                    className="input"
                    type="search"
                    placeholder="e.g. renal, synthetic control, estimand, lab…"
                    value={semanticQuery}
                    onChange={(e) => setSemanticQuery(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={semanticBusy} style={{ alignSelf: 'flex-end' }}>
                  {semanticBusy ? 'Searching…' : 'Search'}
                </button>
              </div>
            </form>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted">Try:</span>
              {['renal', 'synthetic control', 'estimand', 'lab'].map((hint) => (
                <button
                  key={hint}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setSemanticQuery(hint);
                    void runSemanticSearch(hint);
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>

            <div data-testid="semantic-search-results" style={{ marginTop: 14 }}>
              {semanticBusy ? (
                <div aria-busy="true">
                  <p className="muted">Searching ontology graph…</p>
                  <SkeletonRows n={3} />
                </div>
              ) : semanticSearched && semanticHits.length === 0 ? (
                <EmptyState
                  title="No semantic hits"
                  body="No class, synonym, definition, or mapping matched that query. Try “renal”, “synthetic control”, “estimand”, or “lab”."
                />
              ) : semanticHits.length ? (
                <ul className="list">
                  {semanticHits.map((hit) => (
                    <li key={hit.class_id}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                        onClick={() => jumpToClass(hit.class_id)}
                        title="Open in Explorer"
                      >
                        <span>
                          <strong>{hit.label}</strong> <span className="mono muted">{hit.class_id}</span>
                          <br />
                          <span className="muted">matched on {hit.matched_on}</span>
                          <br />
                          <span>
                            Path: {hit.path.map((id) => labelFor(id)).join(' → ')}{' '}
                            <span className="mono muted">({hit.path.join(' → ')})</span>
                          </span>
                        </span>
                      </button>
                      {hit.related.length ? (
                        <div className="row" style={{ marginTop: 6, paddingLeft: 8 }}>
                          <span className="muted">Related:</span>
                          {hit.related.map((rel) => (
                            <button
                              key={`${hit.class_id}-${rel.class_id}-${rel.via}`}
                              type="button"
                              className="btn btn-sm"
                              onClick={() => jumpToClass(rel.class_id)}
                              title={`Open ${rel.label} in Explorer`}
                            >
                              {rel.label} <span className="muted">via {rel.via}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Enter a query or pick a hint to search labels, synonyms, definitions, and mappings.</p>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <p className="muted" style={{ margin: 0 }}>
              Search runs over the mock semantic layer seeded from <span className="mono">ontology/evidia-seed.ttl</span>{' '}
              (classes, properties, synonyms, and concept mappings). In the live platform this is the Neptune + MCP Serve
              graph; here it is deterministic fixture logic so results are reproducible in the demo.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
