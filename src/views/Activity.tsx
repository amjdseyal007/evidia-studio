/**
 * Activity & notifications center — the full-page version of the header
 * bell menu. Notifications (severity-filtered, read state) plus the
 * tenant activity feed in one place. All demo data from the store.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { DataTable, Pill, SectionTitle, fmtDate, type Column } from '../components/ui';

type SevFilter = 'all' | 'unread' | 'info' | 'warning' | 'critical';
type ActivityRow = {
  [key: string]: unknown;
  id: string;
  at: string;
  kind: string;
  text: string;
};

const SEV_TONE = { info: 'info', warning: 'warn', critical: 'err' } as const;

export default function Activity({ tenantId }: { tenantId: string; actor: string }) {
  const store = useStore();
  const [sevFilter, setSevFilter] = useState<SevFilter>('all');

  const notifications = useMemo(() => {
    return store.notifications.filter((n) => {
      if (sevFilter === 'all') return true;
      if (sevFilter === 'unread') return !n.read;
      return n.severity === sevFilter;
    });
  }, [store.notifications, sevFilter]);

  const unread = store.notifications.filter((n) => !n.read).length;
  const activityRows: ActivityRow[] = store.activity
    .filter((a) => a.tenant_id === tenantId)
    .map((a) => ({ id: a.id, at: a.at, kind: a.kind, text: a.text }));

  const activityColumns: Array<Column<ActivityRow>> = [
    { key: 'at', label: 'Time', render: (r) => fmtDate(r.at), sortValue: (r) => r.at },
    { key: 'kind', label: 'Kind', render: (r) => <Pill tone="neutral">{r.kind}</Pill>, sortValue: (r) => r.kind },
    { key: 'text', label: 'Event', render: (r) => r.text, sortValue: (r) => r.text },
  ];

  return (
    <section>
      <SectionTitle
        title="Activity & Notifications"
        sub={`Everything that happened in ${tenantId} — alerts, run events, and operator activity. Demo data only.`}
        actions={(
          <button type="button" className="btn btn-sm" data-testid="activity-mark-all"
            onClick={() => void api.markAllNotificationsRead()}>
            Mark all read
          </button>
        )}
      />

      <div className="row" style={{ marginBottom: 12 }} role="group" aria-label="Filter notifications">
        {(['all', 'unread', 'info', 'warning', 'critical'] as SevFilter[]).map((f) => (
          <button key={f} type="button" data-testid={`notif-filter-${f}`}
            className={sevFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
            onClick={() => setSevFilter(f)}>
            {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unread})` : f}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }} data-testid="notification-center">
        <h3>Notifications</h3>
        {notifications.length === 0 ? (
          <div className="empty-state">No notifications match this filter.</div>
        ) : (
          <ul className="list">
            {notifications.map((n) => (
              <li key={n.id} data-testid={`notif-${n.id}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <Pill tone={SEV_TONE[n.severity]}>{n.severity}</Pill>{' '}
                    <strong>{n.read ? '' : '• '}{n.title}</strong>
                    <br />
                    <span className="muted">{n.body}</span>
                    <br />
                    <span className="muted">{fmtDate(n.at)}</span>
                  </span>
                  {!n.read ? (
                    <button type="button" className="btn btn-sm" onClick={() => void api.markNotificationRead(n.id)}>
                      Mark read
                    </button>
                  ) : (
                    <Pill tone="neutral">read</Pill>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          Delivery preferences (which events notify, email vs in-console) live in{' '}
          <Link to="/settings">Settings → Notification preferences</Link>. Break-glass and security
          events always notify and cannot be muted.
        </p>
      </div>

      <div className="card" data-testid="activity-feed">
        <h3>Activity feed</h3>
        <p className="muted">
          Operator activity for this tenant. For the full queryable audit trail (filters, deltas, CSV export),
          see <Link to="/evidence">Evidence → Audit log</Link> or <Link to="/control">Control Plane → Audit log</Link>.
        </p>
        <DataTable rows={activityRows} columns={activityColumns} rowKey={(r) => r.id}
          testId="activity-table" emptyText="No activity for this tenant yet." pageSize={10} />
      </div>
    </section>
  );
}
