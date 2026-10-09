import { useEffect, useState } from 'react';
import { api, type EvidencePackage } from '../lib/api';
import MockBanner from '../components/MockBanner';

export default function EvidenceViewer({ studyId = 'study-acme-001' }: { studyId?: string }) {
  const [pkg, setPkg] = useState<EvidencePackage | null>(null);
  useEffect(() => { api.getEvidencePackage(studyId).then(setPkg); }, [studyId]);

  if (!pkg) return (<section><MockBanner /><p>Loading evidence package…</p></section>);

  return (
    <section>
      <MockBanner />
      <h2>Evidence Package Viewer</h2>
      <p className="muted">{pkg.title} · tenant <code>{pkg.tenant_id}</code></p>

      <h3>Provenance chain</h3>
      <ol className="timeline" data-testid="provenance-chain">
        {pkg.chain.map((step) => (
          <li key={step.stage}>
            <strong>{step.label}</strong> — {step.status} · {step.at}
            <br /><span className="muted">{step.detail}</span>
          </li>
        ))}
      </ol>

      <h3>Part 11 signatures (fixture records)</h3>
      <p>Hash chain status: <strong data-testid="chain-status">{pkg.chain_intact ? 'INTACT ✓' : 'BROKEN ✗'}</strong> · head <code>{pkg.chain_head_hash.slice(0, 16)}…</code></p>
      <table className="table" data-testid="signature-list">
        <thead><tr><th>#</th><th>Signer</th><th>Role</th><th>Meaning</th><th>Signed at</th><th>Record hash</th></tr></thead>
        <tbody>
          {pkg.signatures.map((s) => (
            <tr key={s.sequence}>
              <td>{s.sequence}</td>
              <td>{s.signer_name} ({s.signer_id})</td>
              <td>{s.signer_role}</td>
              <td>{s.meaning}</td>
              <td>{s.signed_at_utc}</td>
              <td><code>{s.record_hash.slice(0, 12)}…</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Fixture hashes are illustrative strings, not real digests. This viewer makes no FDA / Part 11 compliance claim.</p>
    </section>
  );
}
