import { useEffect, useState } from 'react';
import { api, type TenantAdminEntry } from '../lib/api';
import MockBanner from '../components/MockBanner';

export default function TenantAdmin() {
  const [tenants, setTenants] = useState<TenantAdminEntry[]>([]);
  useEffect(() => { api.listTenants().then(setTenants); }, []);

  return (
    <section>
      <MockBanner />
      <h2>Tenant Admin</h2>
      <p className="muted">Provisioning plans mirror <code>governance/tenant_admin.py::tenant_plan()</code> (dry-run, action_taken: none). Offboard status is the fail-closed guard verdict — fixture evidence only.</p>

      <div data-testid="tenant-list">
        {tenants.map((t) => (
          <article key={t.tenant_id} className="card wide">
            <h3>{t.display_name} — <code>{t.tenant_id}</code></h3>
            <p>Provisioning status: <strong>{t.provisioning_status}</strong> · {t.plan.is_new ? 'NEW (not yet in deploy config)' : 'in deploy config'} · env {t.plan.env_name}</p>
            <table className="table">
              <tbody>
                <tr><th>KMS alias</th><td>{t.plan.resources.kms_alias}</td></tr>
                <tr><th>S3 prefixes</th><td>{Object.values(t.plan.resources.s3_prefixes).join(' · ')}</td></tr>
                <tr><th>Batch queue</th><td>{t.plan.resources.batch_queue_name}</td></tr>
                <tr><th>Cognito group</th><td>{t.plan.resources.cognito_group_name} (attribute {t.plan.resources.cognito_tenant_attribute})</td></tr>
                <tr><th>Ontology namespace</th><td>{t.plan.resources.ontology_namespace}</td></tr>
              </tbody>
            </table>
            <p>Groups: {t.groups.join(', ') || '—'}</p>
            <p>Users: {t.users.length ? t.users.map((u) => `${u.email} [${u.groups.join(',')}]`).join('; ') : 'none provisioned yet'}</p>
            <p data-testid={`offboard-${t.tenant_id}`}>
              Offboard guard: <strong>{t.offboard.allowed ? 'ALLOWED (all evidence clean)' : 'BLOCKED (fail-closed)'}</strong>
              {t.offboard.blocked_reasons.length > 0 && <> — {t.offboard.blocked_reasons.join('; ')}</>}
              <br />
              <span className="muted">billing: {t.offboard.evidence.billing.status} · dataquality: {t.offboard.evidence.dataquality.status} · studio: {t.offboard.evidence.studio.status}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
