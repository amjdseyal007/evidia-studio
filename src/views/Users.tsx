import { useState } from 'react';
import { api, type UserRecord } from '../lib/api';
import { useStore } from '../lib/store';
import { PERMISSIONS, PERMISSION_LABELS, ROLES, can, type Role } from '../lib/permissions';
import { ConfirmDialog, DataTable, Modal, Pill, SectionTitle, fmtDate, toneForStatus, useToasts, type Column } from '../components/ui';

type UserRow = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  tenant_id: string;
  status: 'active' | 'invited' | 'deactivated';
  cognito_groups: string[];
  last_login: string | null;
  created_at: string;
};

export default function Users({ tenantId, actor, role }: { tenantId: string; actor: string; role: Role }) {
  const store = useStore();
  const { push } = useToasts();
  const [roleFilter, setRoleFilter] = useState<'All' | Role>('All');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<Role>('Auditor');
  const [invTenant, setInvTenant] = useState(tenantId);
  const [invErrors, setInvErrors] = useState<{ name?: string; email?: string }>({});
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState<UserRecord | null>(null);

  const manageAllowed = can(role, 'users:manage');
  const tenantUsers = store.users.filter((u) => u.tenant_id === tenantId);
  const filtered = roleFilter === 'All' ? tenantUsers : tenantUsers.filter((u) => u.role === roleFilter);

  const rows: UserRow[] = filtered.map((u) => ({
    user_id: u.user_id,
    name: u.name,
    email: u.email,
    role: u.role,
    tenant_id: u.tenant_id,
    status: u.status,
    cognito_groups: u.cognito_groups,
    last_login: u.last_login,
    created_at: u.created_at,
  }));

  async function handleRoleChange(user: UserRow, next: Role) {
    try {
      await api.setUserRole(user.user_id, next, actor);
      push({ title: 'Role updated', body: `${user.name} is now ${next} (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Role change failed', body: 'The demo store rejected the role change.', tone: 'err' });
    }
  }

  async function handleReactivate(user: UserRow) {
    try {
      await api.setUserStatus(user.user_id, 'active', actor);
      push({ title: 'User reactivated', body: `${user.name} can sign in again (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Reactivation failed', body: 'The demo store rejected the status change.', tone: 'err' });
    }
  }

  async function confirmDeactivate() {
    if (!deactivating) return;
    try {
      await api.setUserStatus(deactivating.user_id, 'deactivated', actor);
      push({ title: 'User deactivated', body: `${deactivating.name} has been deactivated (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Deactivation failed', body: 'The demo store rejected the status change.', tone: 'err' });
    } finally {
      setDeactivating(null);
    }
  }

  function validateInvite(): boolean {
    const errors: { name?: string; email?: string } = {};
    if (!invName.trim()) errors.name = 'Name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invEmail.trim())) errors.email = 'Enter a valid email address.';
    setInvErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitInvite() {
    if (!validateInvite()) return;
    setInvSubmitting(true);
    try {
      const created = await api.inviteUser({ name: invName.trim(), email: invEmail.trim(), role: invRole, tenant_id: invTenant, actor });
      setInviteOpen(false);
      setInvName('');
      setInvEmail('');
      setInvRole('Auditor');
      push({ title: 'Invite sent (demo)', body: `${created.name} (${created.email}) invited as ${created.role} to ${created.tenant_id}.`, tone: 'ok' });
    } catch {
      push({ title: 'Invite failed', body: 'The demo store rejected the invite.', tone: 'err' });
    } finally {
      setInvSubmitting(false);
    }
  }

  function openInvite() {
    setInvTenant(tenantId);
    setInvErrors({});
    setInviteOpen(true);
  }

  const columns: Array<Column<UserRow>> = [
    {
      key: 'user',
      label: 'User',
      sortValue: (r) => r.name,
      render: (r) => (
        <span>
          <strong>{r.name}</strong>
          {r.email === actor ? <span className="muted"> (you)</span> : null}
        </span>
      ),
    },
    { key: 'email', label: 'Email', sortValue: (r) => r.email, render: (r) => r.email },
    { key: 'role', label: 'Role', sortValue: (r) => r.role, render: (r) => <Pill tone="info">{r.role}</Pill> },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Pill tone={toneForStatus(r.status)}>{r.status}</Pill> },
    {
      key: 'groups',
      label: 'Cognito groups',
      render: (r) => <span className="mono" style={{ fontSize: 11 }}>{r.cognito_groups.join(', ')}</span>,
    },
    { key: 'last', label: 'Last login', sortValue: (r) => r.last_login ?? '', render: (r) => fmtDate(r.last_login) },
    ...(manageAllowed
      ? [
          {
            key: 'actions',
            label: 'Actions',
            render: (r: UserRow) => (
              <span className="row">
                <select
                  className="select input-sm"
                  aria-label={`Role for ${r.name}`}
                  value={r.role}
                  onChange={(e) => void handleRoleChange(r, e.target.value as Role)}
                >
                  {ROLES.map((ro) => (
                    <option key={ro} value={ro}>{ro}</option>
                  ))}
                </select>
                {r.status === 'deactivated' ? (
                  <button type="button" className="btn btn-sm" onClick={() => void handleReactivate(r)}>Reactivate</button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeactivating(store.users.find((u) => u.user_id === r.user_id) ?? null)}
                  >
                    Deactivate
                  </button>
                )}
              </span>
            ),
          } satisfies Column<UserRow>,
        ]
      : []),
  ];

  return (
    <section>
      <SectionTitle
        title="Users & Access"
        sub={`Directory for tenant ${tenantId}. Role changes and invites are simulated and audited.`}
        actions={
          manageAllowed ? (
            <button type="button" className="btn btn-primary" onClick={openInvite}>Invite user</button>
          ) : null
        }
      />

      <div className="row" style={{ marginBottom: 12 }} role="group" aria-label="Filter by role">
        {(['All', ...ROLES] as Array<'All' | Role>).map((f) => (
          <button
            key={f}
            type="button"
            className={roleFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
            onClick={() => setRoleFilter(f)}
          >
            {f}
          </button>
        ))}
        <span className="muted">{filtered.length} of {tenantUsers.length} users in this tenant</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <DataTable rows={rows} columns={columns} testId="user-table" rowKey={(r) => r.user_id} emptyText="No users match this filter." />
        {!manageAllowed ? <p className="muted">Your role ({role}) can view this directory; user management (users:manage) requires Platform Admin or Tenant Admin in this demo gate.</p> : null}
      </div>

      <div className="card">
        <SectionTitle title="Permission matrix" sub="Demo RBAC gate — what each role can do in this console." />
        <div data-testid="permission-matrix">
          <div className="table-wrap">
            <table className="table matrix">
              <thead>
                <tr>
                  <th>Permission</th>
                  {ROLES.map((r) => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm}>
                    <td>{PERMISSION_LABELS[perm]}</td>
                    {ROLES.map((r) => (
                      <td key={r}>{can(r, perm) ? <span className="check">✓</span> : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="muted">
          Cognito group mapping: each user belongs to <span className="mono">tenant-&lt;id&gt;</span> plus <span className="mono">role-&lt;role&gt;</span> (for example <span className="mono">tenant-{tenantId}</span> and <span className="mono">role-tenant-admin</span>). The live platform enforces this server-side from the JWT; this console is only the demo gate.
        </p>
      </div>

      {inviteOpen ? (
        <Modal title="Invite user" onClose={() => setInviteOpen(false)} testId="invite-modal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitInvite();
            }}
          >
            <div className="field">
              <label htmlFor="inv-name">Name *</label>
              <input id="inv-name" className="input" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Full name" />
              {invErrors.name ? <span className="field-error">{invErrors.name}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="inv-email">Email *</label>
              <input id="inv-email" className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="name@company.example" />
              {invErrors.email ? <span className="field-error">{invErrors.email}</span> : null}
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="inv-role">Role</label>
                <select id="inv-role" className="select" value={invRole} onChange={(e) => setInvRole(e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="inv-tenant">Tenant</label>
                <select id="inv-tenant" className="select" value={invTenant} onChange={(e) => setInvTenant(e.target.value)}>
                  {store.tenants.map((t) => (
                    <option key={t.tenant_id} value={t.tenant_id}>{t.display_name} ({t.tenant_id})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={invSubmitting}>{invSubmitting ? 'Sending…' : 'Send invite'}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          title={`Deactivate ${deactivating.name}?`}
          body={
            <span>
              <strong>{deactivating.name}</strong> ({deactivating.email}) will no longer be able to sign in to tenant <span className="mono">{deactivating.tenant_id}</span> (demo). You can reactivate them from this directory.
            </span>
          }
          confirmLabel="Deactivate user"
          danger
          onConfirm={() => void confirmDeactivate()}
          onCancel={() => setDeactivating(null)}
        />
      ) : null}
    </section>
  );
}
