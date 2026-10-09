import { useState } from 'react';
import { api, type TeamRecord, type UserRecord } from '../lib/api';
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
  const [addSel, setAddSel] = useState<Record<string, string>>({});
  const [deletingTeam, setDeletingTeam] = useState<TeamRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamRole, setTeamRole] = useState<Role>('Data Engineer');
  const [teamDatasetIds, setTeamDatasetIds] = useState<string[]>([]);
  const [teamStudyIds, setTeamStudyIds] = useState<string[]>([]);
  const [teamNameError, setTeamNameError] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);

  const manageAllowed = can(role, 'users:manage');
  const manageTeams = can(role, 'teams:manage');
  const tenantUsers = store.users.filter((u) => u.tenant_id === tenantId);
  const tenantTeams = store.teams.filter((t) => t.tenant_id === tenantId);
  const tenantDatasets = store.datasets.filter((d) => d.tenant_id === tenantId);
  const tenantStudies = store.studies.filter((s) => s.tenant_id === tenantId);
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

  async function handleRemoveMember(team: TeamRecord, userId: string) {
    try {
      await api.removeTeamMember(team.team_id, userId, actor);
      const user = store.users.find((u) => u.user_id === userId);
      push({ title: 'Member removed', body: `${user ? user.name : userId} removed from ${team.name} (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Remove failed', body: 'The demo store rejected the change.', tone: 'err' });
    }
  }

  async function handleAddMember(team: TeamRecord) {
    const sel = addSel[team.team_id] ?? '';
    if (!sel) return;
    try {
      await api.addTeamMember(team.team_id, sel, actor);
      const user = store.users.find((u) => u.user_id === sel);
      push({ title: 'Member added', body: `${user ? user.name : sel} added to ${team.name} (demo).`, tone: 'ok' });
      setAddSel((prev) => ({ ...prev, [team.team_id]: '' }));
    } catch {
      push({ title: 'Add failed', body: 'The demo store rejected the change.', tone: 'err' });
    }
  }

  async function handleTeamRoleChange(team: TeamRecord, next: Role) {
    try {
      await api.setTeamRole(team.team_id, next, actor);
      push({ title: 'Team role updated', body: `${team.name} is now ${next} (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Role change failed', body: 'The demo store rejected the role change.', tone: 'err' });
    }
  }

  async function confirmDeleteTeam() {
    if (!deletingTeam) return;
    try {
      await api.deleteTeam(deletingTeam.team_id, actor);
      push({ title: 'Team deleted', body: `${deletingTeam.name} has been deleted (demo).`, tone: 'ok' });
    } catch {
      push({ title: 'Delete failed', body: 'The demo store rejected the deletion.', tone: 'err' });
    } finally {
      setDeletingTeam(null);
    }
  }

  function openCreateTeam() {
    setTeamNameError(null);
    setCreateOpen(true);
  }

  function resetCreateForm() {
    setTeamName('');
    setTeamDesc('');
    setTeamRole('Data Engineer');
    setTeamDatasetIds([]);
    setTeamStudyIds([]);
    setTeamNameError(null);
  }

  async function submitCreateTeam() {
    if (!teamName.trim()) {
      setTeamNameError('Name is required.');
      return;
    }
    setCreatingTeam(true);
    try {
      await api.createTeam({ name: teamName.trim(), description: teamDesc.trim(), role: teamRole, tenant_id: tenantId, access_datasets: teamDatasetIds, access_studies: teamStudyIds, actor });
      push({ title: 'Team created (demo)', body: `${teamName.trim()} created for tenant ${tenantId}.`, tone: 'ok' });
      setCreateOpen(false);
      resetCreateForm();
    } catch {
      push({ title: 'Team creation failed', body: 'The demo store rejected the team.', tone: 'err' });
    } finally {
      setCreatingTeam(false);
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
    {
      key: 'teams',
      label: 'Teams',
      render: (r) => {
        const teams = store.teams.filter((t) => t.tenant_id === tenantId && t.member_ids.includes(r.user_id));
        if (teams.length === 0) return '—';
        return (
          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {teams.map((t) => (
              <span key={t.team_id} className="pill pill-info">{t.name}</span>
            ))}
          </span>
        );
      },
    },
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

      <div className="card" style={{ marginBottom: 14 }} data-testid="teams-section">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Teams</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>Group users into delivery/science teams with scoped dataset & study access (demo).</p>
          </div>
          {manageTeams ? (
            <button type="button" className="btn btn-primary btn-sm" data-testid="create-team-btn" onClick={openCreateTeam}>Create team</button>
          ) : null}
        </div>

        {!manageTeams ? (
          <p className="muted">{role === 'Delivery Admin' ? 'Delivery Admin sees teams read-only (here and across tenants below).' : `Your role (${role}) can view teams; managing them requires teams:manage.`}</p>
        ) : null}

        {tenantTeams.length === 0 ? <p className="muted">No teams for this tenant yet.</p> : null}

        {tenantTeams.map((t) => {
          const sel = addSel[t.team_id] ?? '';
          return (
            <article key={t.team_id} className="card" style={{ marginBottom: 10 }} data-testid={`team-card-${t.team_id}`}>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{t.name}</h3>
                <Pill tone="info">{t.role}</Pill>
                <span className="muted">{t.member_ids.length} member(s)</span>
              </div>
              {t.description ? <p className="muted">{t.description}</p> : null}
              <div style={{ marginTop: 8 }}>
                <div className="muted">Members</div>
                {t.member_ids.length === 0 ? (
                  <p className="muted">No members yet.</p>
                ) : (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {t.member_ids.map((id) => {
                      const user = store.users.find((u) => u.user_id === id);
                      return (
                        <span key={id} className="pill pill-neutral">
                          {user ? user.name : id}
                          {manageTeams ? (
                            <button type="button" className="btn btn-ghost btn-sm" data-testid={`team-remove-${t.team_id}-${id}`} onClick={() => void handleRemoveMember(t, id)} aria-label={`Remove ${user ? user.name : id} from ${t.name}`}>✕</button>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="muted">Access</div>
                {t.access_datasets.length === 0 && t.access_studies.length === 0 ? (
                  <p className="muted">No scoped access.</p>
                ) : (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {t.access_datasets.map((id) => {
                      const ds = store.datasets.find((d) => d.dataset_id === id);
                      return <span key={`ds-${id}`} className="pill pill-neutral">📊 {ds ? ds.name : id}</span>;
                    })}
                    {t.access_studies.map((id) => {
                      const st = store.studies.find((s) => s.study_id === id);
                      return <span key={`st-${id}`} className="pill pill-neutral">▤ {st ? st.name : id}</span>;
                    })}
                  </div>
                )}
              </div>
              {manageTeams ? (
                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="select input-sm"
                    aria-label={`Team role for ${t.name}`}
                    value={t.role}
                    onChange={(e) => void handleTeamRoleChange(t, e.target.value as Role)}
                  >
                    {ROLES.map((ro) => (
                      <option key={ro} value={ro}>{ro}</option>
                    ))}
                  </select>
                  <select
                    className="select input-sm"
                    aria-label={`Add member to ${t.name}`}
                    value={sel}
                    onChange={(e) => setAddSel((prev) => ({ ...prev, [t.team_id]: e.target.value }))}
                  >
                    <option value="">Add member…</option>
                    {tenantUsers.filter((u) => !t.member_ids.includes(u.user_id)).map((u) => (
                      <option key={u.user_id} value={u.user_id}>{`${u.name} (${u.role})`}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-sm" data-testid={`team-add-${t.team_id}`} disabled={!sel} onClick={() => void handleAddMember(t)}>Add</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeletingTeam(t)}>Delete</button>
                </div>
              ) : null}
            </article>
          );
        })}

        {role === 'Delivery Admin' ? (
          <div data-testid="teams-across-tenants" style={{ marginTop: 14 }}>
            <h3>Teams across tenants (read-only)</h3>
            {store.tenants.filter((tn) => tn.status !== 'offboarded').map((tn) => {
              const teams = store.teams.filter((tm) => tm.tenant_id === tn.tenant_id);
              if (teams.length === 0) return null;
              return (
                <div key={tn.tenant_id}>
                  {teams.map((tm) => (
                    <div key={tm.team_id}><strong>{tn.display_name}</strong> — {tm.name} ({tm.role}, {tm.member_ids.length} member(s))</div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}
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

      {createOpen ? (
        <Modal title="Create team" onClose={() => setCreateOpen(false)} testId="create-team-modal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreateTeam();
            }}
          >
            <div className="field">
              <label htmlFor="team-name">Name *</label>
              <input id="team-name" className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
              {teamNameError ? <span className="field-error">{teamNameError}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="team-desc">Description</label>
              <input id="team-desc" className="input" value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="What this team does" />
            </div>
            <div className="field">
              <label htmlFor="team-role">Role</label>
              <select id="team-role" className="select" value={teamRole} onChange={(e) => setTeamRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="muted">Dataset access</span>
              {tenantDatasets.length === 0 ? <p className="muted">No datasets for this tenant.</p> : tenantDatasets.map((d) => (
                <label key={d.dataset_id} className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={teamDatasetIds.includes(d.dataset_id)}
                    onChange={(e) => setTeamDatasetIds((prev) => (e.target.checked ? [...prev, d.dataset_id] : prev.filter((x) => x !== d.dataset_id)))}
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
            <div className="field">
              <span className="muted">Study access</span>
              {tenantStudies.length === 0 ? <p className="muted">No studies for this tenant.</p> : tenantStudies.map((s) => (
                <label key={s.study_id} className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={teamStudyIds.includes(s.study_id)}
                    onChange={(e) => setTeamStudyIds((prev) => (e.target.checked ? [...prev, s.study_id] : prev.filter((x) => x !== s.study_id)))}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creatingTeam}>{creatingTeam ? 'Creating…' : 'Create team'}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deletingTeam ? (
        <ConfirmDialog
          title={`Delete ${deletingTeam.name}?`}
          body={
            <span>
              Team <strong>{deletingTeam.name}</strong> in tenant <span className="mono">{deletingTeam.tenant_id}</span> will be removed (demo). Members keep their user accounts; only the team grouping and its scoped access are deleted.
            </span>
          }
          confirmLabel="Delete team"
          danger
          onConfirm={() => void confirmDeleteTeam()}
          onCancel={() => setDeletingTeam(null)}
        />
      ) : null}
    </section>
  );
}
