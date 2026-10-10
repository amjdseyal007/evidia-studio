import { useEffect, useMemo, useState } from 'react';
import { api, type EvidencePackage, type SignatureRecord } from '../lib/api';
import { recordAudit, useStore } from '../lib/store';
import { can, type Role } from '../lib/permissions';
import { isServiceEnabled } from '../fixtures/services';
import { AUDIT_CATEGORIES, auditEventInfo, downloadAuditCsv } from '../lib/auditTaxonomy';
import { ConfirmDialog, DataTable, Pill, SectionTitle, SkeletonRows, fmtDate, toneForStatus, useToasts, type Column } from '../components/ui';

type TabKey = 'packages' | 'audit' | 'compliance';

type AuditRow = {
  [key: string]: unknown;
  id: string;
  at: string;
  actor: string;
  action: string;
  event: string;
  category: string;
  target: string;
  detail: string;
  delta: string | null;
  result: 'success' | 'blocked' | 'info';
};

function fakeHash(seed: string): string {
  let h = '';
  const chars = '0123456789abcdef';
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 64; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    h += chars[(x >>> (i % 24)) & 0xf];
  }
  // add entropy so demo hashes differ per click
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return (h.slice(0, 60) + rand).slice(0, 64);
}

function resultTone(result: string): 'ok' | 'err' | 'info' | 'neutral' {
  if (result === 'success') return 'ok';
  if (result === 'blocked') return 'err';
  if (result === 'info') return 'info';
  return 'neutral';
}

export default function Evidence({ tenantId, role, actor = 'unknown@example.com' }: { tenantId: string; role: Role; actor?: string }) {
  const store = useStore();
  const { push } = useToasts();
  const [tab, setTab] = useState<TabKey>('packages');
  const [packages, setPackages] = useState<EvidencePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [extraSigs, setExtraSigs] = useState<SignatureRecord[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifiedMsg, setVerifiedMsg] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [meaning, setMeaning] = useState('Author attestation');
  const [exportVerified, setExportVerified] = useState<boolean | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [auditCategory, setAuditCategory] = useState('All');
  const [fpLookup, setFpLookup] = useState('');
  const [fpResult, setFpResult] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.listEvidencePackages(tenantId)
      .then((pkgs) => {
        if (!live) return;
        setPackages(pkgs);
        setSelectedStudyId((prev) => prev ?? pkgs[0]?.study_id ?? null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tenantId]);

  const selectedPkg: EvidencePackage | undefined = useMemo(
    () => packages.find((p) => p.study_id === selectedStudyId) ?? packages[0],
    [packages, selectedStudyId],
  );

  const allSignatures: SignatureRecord[] = useMemo(() => {
    if (!selectedPkg) return [];
    const extras = extraSigs.filter((s) => s.tenant_id === selectedPkg.tenant_id);
    // extra sigs are for the currently selected package in this demo (single package per tenant)
    return [...selectedPkg.signatures, ...extras].sort((a, b) => a.sequence - b.sequence);
  }, [selectedPkg, extraSigs]);

  const chainHead = allSignatures.length > 0 ? allSignatures[allSignatures.length - 1].record_hash : selectedPkg?.chain_head_hash ?? '';

  const selectedStudy = useMemo(
    () => (selectedPkg ? store.studies.find((s) => s.study_id === selectedPkg.study_id) : undefined),
    [store.studies, selectedPkg],
  );
  const selectedIsRegulatory = (selectedStudy?.classification ?? 'standard') === 'regulatory';
  const latestExport = useMemo(
    () => (selectedPkg ? store.evidenceExports.filter((e) => e.study_id === selectedPkg.study_id)[0] ?? null : null),
    [store.evidenceExports, selectedPkg],
  );
  const tenantExports = useMemo(
    () => store.evidenceExports.filter((e) => e.tenant_id === tenantId),
    [store.evidenceExports, tenantId],
  );

  async function handleGenerateExport() {
    if (!selectedPkg) return;
    setExportBusy(true);
    try {
      const rec = await api.exportEvidencePackage(selectedPkg.study_id, actor);
      setExportVerified(null);
      push({ title: 'Evidence export generated', body: `Fingerprint ${rec.fingerprint}`, tone: 'ok' });
    } catch (err) {
      push({ title: 'Export failed', body: err instanceof Error ? err.message : 'Failed to generate export.', tone: 'err' });
    } finally {
      setExportBusy(false);
    }
  }

  async function handleVerifyExport() {
    if (!latestExport) return;
    const ok = await api.verifyEvidenceExport(latestExport.export_id);
    setExportVerified(ok);
    push({
      title: ok ? 'Export verified' : 'Verification failed',
      body: ok ? 'Fingerprint matches package contents.' : 'Fingerprint does not match package contents.',
      tone: ok ? 'ok' : 'err',
    });
  }

  async function handleFingerprintLookup() {
    const fp = fpLookup.trim();
    if (!fp) {
      setFpResult('Paste a fingerprint first.');
      return;
    }
    const found = store.evidenceExports.find((e) => e.fingerprint === fp || e.fingerprint.startsWith(fp));
    if (!found) {
      setFpResult('No export in this demo matches that fingerprint.');
      return;
    }
    const ok = await api.verifyEvidenceExport(found.export_id);
    setFpResult(
      ok
        ? `Match: export for study ${found.study_id} (generated ${found.generated_at} by ${found.generated_by}) — fingerprint verified against package contents.`
        : `Match found for study ${found.study_id}, but the fingerprint does NOT verify — package contents changed after export.`,
    );
  }

  const auditEntries = useMemo(() => store.audit.filter((a) => a.tenant_id === tenantId), [store.audit, tenantId]);

  const auditRows: AuditRow[] = useMemo(
    () =>
      auditEntries.map((a) => {
        const info = auditEventInfo(a.action);
        return {
          id: a.id,
          at: a.at,
          actor: a.actor,
          action: a.action,
          event: info.event,
          category: info.category,
          target: a.target,
          detail: a.detail,
          delta: a.delta ?? null,
          result: a.result,
        };
      }),
    [auditEntries],
  );

  const filteredAuditRows: AuditRow[] = useMemo(
    () => (auditCategory === 'All' ? auditRows : auditRows.filter((r) => r.category === auditCategory)),
    [auditRows, auditCategory],
  );

  const filteredAuditEntries = useMemo(
    () => (auditCategory === 'All' ? auditEntries : auditEntries.filter((a) => auditEventInfo(a.action).category === auditCategory)),
    [auditEntries, auditCategory],
  );

  const auditColumns: Array<Column<AuditRow>> = [
    { key: 'at', label: 'Time', render: (r) => fmtDate(r.at), sortValue: (r) => r.at },
    { key: 'actor', label: 'Actor', render: (r) => <span className="mono">{r.actor}</span>, sortValue: (r) => r.actor },
    { key: 'action', label: 'Action', render: (r) => <span className="mono">{r.action}</span>, sortValue: (r) => r.action },
    {
      key: 'event',
      label: 'Event',
      render: (r) => {
        const info = auditEventInfo(r.action);
        return (
          <span>
            {info.label}
            <br />
            <span className="mono muted">{info.event}</span>
          </span>
        );
      },
      sortValue: (r) => r.event,
    },
    { key: 'target', label: 'Target', render: (r) => <span className="mono">{r.target}</span>, sortValue: (r) => r.target },
    { key: 'detail', label: 'Detail', render: (r) => r.detail || '—', sortValue: (r) => r.detail },
    { key: 'delta', label: 'Delta', render: (r) => r.delta ?? '—', sortValue: (r) => r.delta ?? '' },
    { key: 'result', label: 'Result', render: (r) => <Pill tone={resultTone(r.result)}>{r.result}</Pill>, sortValue: (r) => r.result },
  ];

  function handleVerify() {
    if (!selectedPkg) return;
    setVerifying(true);
    setVerifiedMsg(null);
    window.setTimeout(() => {
      setVerifying(false);
      const n = allSignatures.length;
      const msg = `INTACT — ${n}/${n} hashes verified (demo verification)`;
      setVerifiedMsg(msg);
      push({ title: 'Chain verified (demo)', body: 'Demo verification completed successfully', tone: 'ok' });
    }, 900);
  }

  function handleSign() {
    if (part11Off) return;
    if (!selectedPkg) return;
    const last = allSignatures[allSignatures.length - 1];
    const previousHash = last ? last.record_hash : selectedPkg.chain_head_hash;
    const seq = last ? last.sequence + 1 : 0;
    const recordHash = fakeHash(`${selectedPkg.study_id}-${seq}-${Date.now()}`);
    const artifactHash = fakeHash(`artifact-${selectedPkg.study_id}-${seq}-${Date.now()}`);
    const sig: SignatureRecord = {
      sequence: seq,
      signer_id: 'demo-signer',
      signer_name: 'Demo Signer',
      signer_role: role,
      tenant_id: tenantId,
      meaning,
      attestation: 'Demo attestation — local simulation only. This is not a real Part 11 signature.',
      artifact_sha256: artifactHash,
      signed_at_utc: new Date().toISOString(),
      previous_hash: previousHash,
      record_hash: recordHash,
    };
    setExtraSigs((prev) => [...prev, sig]);
    recordAudit({
      actor: 'demo-signer',
      tenant_id: tenantId,
      action: 'evidence.signed',
      target: selectedPkg.study_id,
      detail: meaning,
      result: 'success',
    });
    setSignOpen(false);
    setVerifiedMsg(null);
    push({ title: 'Package signed (demo)', body: `${meaning} · sequence ${seq} appended locally`, tone: 'ok' });
  }

  const states = store.tenantServices[tenantId];
  const part11Off = states ? !isServiceEnabled(states, 'part11') : false;
  const canSign = can(role, 'evidence:sign');

  return (
    <section>
      <SectionTitle title="Evidence & Compliance" sub={`Tenant ${tenantId} · evidence of design, not certification`} />

      <div className="row" style={{ marginBottom: 14 }} role="tablist" aria-label="Evidence sections">
        <button type="button" className={tab === 'packages' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setTab('packages')}>Evidence packages</button>
        <button type="button" className={tab === 'audit' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setTab('audit')}>Audit log</button>
        <button type="button" className={tab === 'compliance' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setTab('compliance')}>Compliance status</button>
      </div>

      {tab === 'packages' && (
        <>
          {loading ? (
            <div className="card"><SkeletonRows n={4} /></div>
          ) : packages.length === 0 ? (
            <div className="card"><div className="empty-state">No evidence packages for this tenant.</div></div>
          ) : (
            <div className="grid-2">
              <div className="card">
                <h3>Packages</h3>
                <ul className="list">
                  {packages.map((pkg) => {
                    const sigCount = pkg.study_id === selectedPkg?.study_id ? allSignatures.length : pkg.signatures.length;
                    return (
                      <li key={pkg.study_id}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span>
                            <strong>{pkg.title}</strong><br />
                            <span className="mono muted">{pkg.study_id}</span>
                          </span>
                          <button type="button" className="btn btn-sm" onClick={() => { setSelectedStudyId(pkg.study_id); setVerifiedMsg(null); setExportVerified(null); }}>View</button>
                        </div>
                        <div className="row" style={{ marginTop: 6 }}>
                          <Pill tone={toneForStatus('intact')}>INTACT</Pill>
                          <span className="muted">{sigCount} signatures · tenant {pkg.tenant_id}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="muted">Hashes in this demo are fixture strings, not real digests. Local demo signatures are appended in-browser only.</p>
              </div>

              {selectedPkg ? (
                <div className="card">
                  <h3>{selectedPkg.title}</h3>
                  <p className="muted">Study <span className="mono">{selectedPkg.study_id}</span> · Tenant <span className="mono">{selectedPkg.tenant_id}</span></p>
                  <div className="row">
                    <Pill tone="ok" testId="chain-status">INTACT</Pill>
                    <span className="muted">Chain head <span className="mono">{chainHead.slice(0, 16)}…</span></span>
                  </div>

                  <h3 style={{ marginTop: 14 }}>Provenance chain</h3>
                  <ol className="timeline" data-testid="provenance-chain">
                    {selectedPkg.chain.map((step) => (
                      <li key={step.stage} className={step.status === 'complete' ? 't-ok' : step.status === 'pending_review' ? 't-run' : undefined}>
                        <strong>{step.label}</strong> <Pill tone={step.status === 'complete' ? 'ok' : 'info'}>{step.status}</Pill>
                        <br /><span className="muted">{fmtDate(step.at)} · {step.detail}</span>
                      </li>
                    ))}
                  </ol>

                  <h3 style={{ marginTop: 14 }}>Signature chain</h3>
                  <div className="table-wrap">
                    <table className="table" data-testid="signature-list">
                      <thead><tr><th>#</th><th>Signer</th><th>Role</th><th>Meaning</th><th>Signed at</th><th>Record hash</th></tr></thead>
                      <tbody>
                        {allSignatures.map((s) => (
                          <tr key={`${s.sequence}-${s.record_hash}`}>
                            <td>{s.sequence}</td>
                            <td>{s.signer_name}<br /><span className="mono muted">{s.signer_id}</span></td>
                            <td>{s.signer_role}</td>
                            <td>{s.meaning}</td>
                            <td>{fmtDate(s.signed_at_utc)}</td>
                            <td><span className="mono">{s.record_hash.slice(0, 12)}…</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn" disabled={verifying} onClick={handleVerify}>
                      {verifying ? 'Verifying…' : 'Verify chain'}
                    </button>
                    {canSign ? (
                      <button type="button" className="btn btn-primary" disabled={part11Off} title={part11Off ? 'Part 11 E-Signatures is disabled for this tenant' : undefined} onClick={() => setSignOpen(true)}>Sign package (demo)</button>
                    ) : (
                      <Pill tone="neutral">Signing requires a privileged role</Pill>
                    )}
                  </div>
                  {part11Off ? <p className="muted" data-testid="part11-disabled-note">Part 11 E-Signatures is disabled for this tenant — signing is unavailable until re-enabled.</p> : null}
                  {verifying && <p className="muted">Recomputing hash chain (demo)…</p>}
                  {verifiedMsg && <p><Pill tone="ok">{verifiedMsg}</Pill></p>}
                  <p className="muted">Local demo signature — real Part 11 signing happens in the DynamoDB hash-chain store at deploy. This demo signature never leaves the browser and is not a Part 11 signature.</p>

                  <div data-testid="evidence-export-panel" style={{ marginTop: 16, borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                    <h3>Verifiable evidence export</h3>
                    <div className="row" style={{ marginTop: 8 }}>
                      <Pill tone={selectedIsRegulatory ? 'warn' : 'neutral'} testId="export-classification">{selectedIsRegulatory ? 'Regulatory' : 'Standard'}</Pill>
                      <span className="muted">{selectedStudy?.ontology_version ? `Pinned ontology: v${selectedStudy.ontology_version} (approved)` : 'Not pinned'}</span>
                    </div>
                    <p className="muted" style={{ marginTop: 8 }}>Generate a read-only, fingerprint-verifiable package bundling study metadata, methods, the pinned ontology version, audit trail, Part 11 chain, and QMS summary.</p>
                    <div className="row" style={{ marginTop: 10 }}>
                      <button type="button" className="btn btn-primary btn-sm" data-testid="export-evidence-btn" disabled={exportBusy} onClick={() => void handleGenerateExport()}>
                        {exportBusy ? 'Generating…' : 'Generate export'}
                      </button>
                      {latestExport ? (
                        <button type="button" className="btn btn-sm" data-testid="verify-export-btn" onClick={() => void handleVerifyExport()}>
                          Verify export
                        </button>
                      ) : null}
                    </div>

                    {latestExport ? (
                      <div style={{ marginTop: 12 }}>
                        <div>
                          <span className="muted">Fingerprint </span>
                          <span className="mono" data-testid="export-fingerprint">{latestExport.fingerprint}</span>
                        </div>
                        <p className="muted" style={{ marginTop: 6 }}>
                          Generated {fmtDate(latestExport.generated_at)} by {latestExport.generated_by} · {latestExport.signature_count} signatures · chain head <span className="mono">{latestExport.chain_head_hash.slice(0, 16)}…</span>
                        </p>
                        <div className="row" style={{ marginTop: 6 }}>
                          <span>{latestExport.items.filter((i) => i.status === 'included').length} of {latestExport.items.length} items ready</span>
                          {selectedIsRegulatory && latestExport.items.some((i) => i.status === 'pending') ? <Pill tone="warn">Regulatory export incomplete</Pill> : null}
                        </div>
                        <ul className="checklist" data-testid="export-checklist" style={{ marginTop: 10 }}>
                          {latestExport.items.map((item) => (
                            <li key={item.item}>
                              <span className={item.status === 'included' ? 'check' : ''}>{item.status === 'included' ? '✓' : '○'}</span>
                              <span style={{ flex: 1 }}>
                                <strong>{item.item}</strong>
                                <br />
                                <span className="muted">{item.detail}</span>
                              </span>
                              <Pill tone={item.status === 'included' ? 'ok' : 'neutral'}>{item.status}</Pill>
                            </li>
                          ))}
                        </ul>
                        {exportVerified !== null ? (
                          <p style={{ marginTop: 10 }}>
                            <Pill tone={exportVerified ? 'ok' : 'err'} testId="export-verified">{exportVerified ? 'Verified — fingerprint matches package contents' : 'Verification failed'}</Pill>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted" style={{ marginTop: 10 }}>No export generated yet for this study. Generate one to produce a verifiable fingerprint.</p>
                    )}

                    {tenantExports.length > 0 ? (
                      <div style={{ marginTop: 14 }}>
                        <h3 style={{ fontSize: 13 }}>Exports for this tenant</h3>
                        <ul className="list">
                          {tenantExports.map((exp) => (
                            <li key={exp.export_id}>
                              <span className="mono">{exp.fingerprint.slice(0, 24)}…</span> · <span className="mono">{exp.study_id}</span> · {fmtDate(exp.generated_at)} · {exp.generated_by}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 14 }} data-testid="fingerprint-lookup">
                      <h3 style={{ fontSize: 13 }}>Verify a fingerprint</h3>
                      <p className="muted">A reviewer holding only the fingerprint can check it here — the package contents are recomputed and compared (demo).</p>
                      <div className="row">
                        <input className="input mono" style={{ flex: 1 }} data-testid="fp-input" value={fpLookup}
                          onChange={(e) => setFpLookup(e.target.value)} placeholder="sha256:demo-…" aria-label="Evidence export fingerprint" />
                        <button type="button" className="btn btn-sm" data-testid="fp-verify" onClick={() => void handleFingerprintLookup()}>Verify</button>
                      </div>
                      {fpResult ? <p style={{ marginTop: 8 }}><Pill tone={fpResult.startsWith('Match:') ? 'ok' : fpResult.startsWith('Match found') ? 'err' : 'neutral'}>{fpResult}</Pill></p> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card"><div className="empty-state">Select a package to view its provenance and signatures.</div></div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'audit' && (
        <div className="card">
          <h3>Audit log</h3>
          <p className="muted">Tenant {tenantId} · updates live as other views mutate the demo store. Use the table filter to search actor, action, target, or detail.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <button
              type="button"
              data-testid="audit-cat-All"
              className={auditCategory === 'All' ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              onClick={() => setAuditCategory('All')}
            >
              All
            </button>
            {AUDIT_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                data-testid={`audit-cat-${category}`}
                className={auditCategory === category ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
                onClick={() => setAuditCategory(category)}
              >
                {category}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" data-testid="audit-export-csv" onClick={() => downloadAuditCsv(filteredAuditEntries)}>
              Export CSV
            </button>
          </div>
          <DataTable<AuditRow>
            rows={filteredAuditRows}
            columns={auditColumns}
            rowKey={(r) => r.id}
            testId="audit-log"
            emptyText="No audit entries for this tenant yet."
            pageSize={10}
          />
        </div>
      )}

      {tab === 'compliance' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <strong>Evidence of design, not certification.</strong>{' '}
            <span className="muted">Nothing on this page is a compliance claim. Controls below are designed and synth-verified in code; the platform is not deployed and no certification has been granted.</span>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Part 11 — honest tracker</h3>
              <div className="row" style={{ margin: '8px 0' }}>
                <Pill tone="ok">3 implemented</Pill>
                <Pill tone="warn">11 partial</Pill>
                <Pill tone="neutral">12 planned</Pill>
              </div>
              <ul className="list">
                <li><Pill tone="ok">Implemented</Pill> Hash-linked signature records (DynamoDB design) · audit trail schema · provenance-stamped DQ runs</li>
                <li><Pill tone="warn">Partial</Pill> Signature meaning/attestation capture · chain verification · tenant-scoped audit query · e-signature UI ceremony</li>
                <li><Pill tone="neutral">Planned</Pill> Full validation package (IQ/OQ/PQ) · SOP-linked training records · archival &amp; retention automation</li>
              </ul>
              <p><Pill tone="err">Largest gap</Pill> <strong>two-component signing ceremony</strong> <span className="muted">— Part 11 requires two distinct identification components at signing; the demo uses a single click and is explicitly not a Part 11 signature.</span></p>
            </div>

            <div className="card">
              <h3>HIPAA — architecture controls</h3>
              <p className="muted">Designed &amp; synth-verified, not deployed. No PHI claim is made for this demo.</p>
              <ul className="list">
                <li>Sealed private VPC <Pill tone="warn">Designed · synth-verified · not deployed</Pill></li>
                <li>Per-tenant KMS keys <Pill tone="warn">Designed · synth-verified · not deployed</Pill></li>
                <li>Amazon Macie discovery <Pill tone="warn">Designed · synth-verified · not deployed</Pill></li>
                <li>WAF / GuardDuty / Config / CloudTrail <Pill tone="warn">Designed · synth-verified · not deployed</Pill></li>
              </ul>
            </div>

            <div className="card">
              <h3>SOC 2</h3>
              <p><Pill tone="warn">Roadmap — not claimed</Pill></p>
              <p className="muted">SOC 2 is on the roadmap only. No audit has been performed, no report exists, and no SOC 2 claim is made.</p>
            </div>

            <div className="card">
              <h3>De-identification certification</h3>
              <p><Pill tone="warn">Pending human/legal</Pill></p>
              <p className="muted">Safe Harbor pipeline is implemented in code; expert certification and legal review are pending human/legal sign-off. No de-identification certification is claimed.</p>
            </div>
          </div>
        </div>
      )}

      {signOpen && selectedPkg && (
        <ConfirmDialog
          title="Sign evidence package (demo)"
          confirmLabel="Sign (demo)"
          onCancel={() => setSignOpen(false)}
          onConfirm={handleSign}
          body={
            <div>
              <p>Append a local demo signature to <strong>{selectedPkg.title}</strong> (<span className="mono">{selectedPkg.study_id}</span>)?</p>
              <div className="field">
                <label htmlFor="sign-meaning">Meaning</label>
                <select id="sign-meaning" className="select" value={meaning} onChange={(e) => setMeaning(e.target.value)}>
                  <option>Author attestation</option>
                  <option>Biostatistician approval</option>
                  <option>QA release</option>
                </select>
              </div>
              <p className="muted">Local demo signature — real Part 11 signing happens in the DynamoDB hash-chain store at deploy. Signer will be recorded as Demo Signer and an audit entry (evidence.signed) will be written to the demo store.</p>
            </div>
          }
        />
      )}
    </section>
  );
}
