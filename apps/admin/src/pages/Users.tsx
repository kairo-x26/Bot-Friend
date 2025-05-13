import type { AdminUser, UserRole } from '@bot-friend/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { request } from '../api';
import { useAuth } from '../auth';
import { dateTime } from '../format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Users() {
  const { me } = useAuth();
  const isAdmin = me?.user.role === 'admin';
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? '';
  const [input, setInput] = useState(id);
  const [reason, setReason] = useState('');
  const qc = useQueryClient();

  const user = useQuery({
    queryKey: ['user', id],
    enabled: UUID.test(id),
    queryFn: () => request<AdminUser>('GET', `/v1/admin/users/${id}`),
  });

  const action = useMutation({
    mutationFn: (op: { kind: 'suspend' | 'reinstate' } | { kind: 'role'; role: UserRole }) =>
      op.kind === 'role'
        ? request<AdminUser>('PATCH', `/v1/admin/users/${id}/role`, { role: op.role })
        : request<AdminUser>('POST', `/v1/admin/users/${id}/${op.kind}`, { reason: reason.trim() }),
    onSuccess: (data) => {
      qc.setQueryData(['user', id], data);
      setReason('');
    },
  });

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { id: input.trim() } : {});
  };

  const u = user.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">
            Account status and activity counts. Chat content is never shown here.
          </p>
        </div>
      </div>
      <form onSubmit={lookup} className="filters" style={{ marginBottom: 24 }}>
        <input
          aria-label="User id"
          placeholder="User id"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ minWidth: 340 }}
        />
        <button type="submit">Look up</button>
      </form>
      {id && !UUID.test(id) ? <div className="error">That doesn’t look like a user id.</div> : null}
      {user.isError ? <div className="error">{(user.error as Error).message}</div> : null}
      {u ? (
        <div className="detail">
          <section className="panel">
            <h2>{u.id}</h2>
            <dl className="meta">
              <dt>Status</dt>
              <dd>
                <span className={`pill ${u.status === 'active' ? 'actioned' : 'open'}`}>
                  {u.status}
                </span>
              </dd>
              <dt>Role</dt>
              <dd>{u.role}</dd>
              <dt>Sign-in</dt>
              <dd>{u.provider}</dd>
              <dt>Plan</dt>
              <dd>{u.entitlement}</dd>
              <dt>Joined</dt>
              <dd>{dateTime(u.createdAt)}</dd>
              <dt>Last seen</dt>
              <dd>{u.lastSeenAt ? dateTime(u.lastSeenAt) : '—'}</dd>
            </dl>
            <div className="stats">
              <div className="stat">
                <div className="muted small">Conversations</div>
                <div className="value">{u.stats.conversations}</div>
              </div>
              <div className="stat">
                <div className="muted small">Messages today</div>
                <div className="value">{u.stats.messagesToday}</div>
              </div>
              <div className="stat">
                <div className="muted small">Reports filed</div>
                <div className="value">{u.stats.reportsFiled}</div>
              </div>
              <div className="stat">
                <div className="muted small">Blocked replies</div>
                <div className="value">{u.stats.blockedReplies}</div>
              </div>
            </div>
          </section>
          {isAdmin ? (
            <aside className="panel">
              <h3>Account actions</h3>
              <label>
                Reason (logged)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              {action.isError ? (
                <div className="error">{(action.error as Error).message}</div>
              ) : null}
              {u.status === 'suspended' ? (
                <button
                  disabled={reason.trim().length < 3 || action.isPending}
                  onClick={() => action.mutate({ kind: 'reinstate' })}
                >
                  Reinstate
                </button>
              ) : (
                <button
                  className="danger"
                  disabled={reason.trim().length < 3 || action.isPending}
                  onClick={() => action.mutate({ kind: 'suspend' })}
                >
                  Suspend account
                </button>
              )}
              <label>
                Role
                <select
                  value={u.role}
                  disabled={action.isPending || u.provider === 'guest'}
                  onChange={(e) =>
                    action.mutate({ kind: 'role', role: e.target.value as UserRole })
                  }
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </aside>
          ) : (
            <aside className="panel muted">Only admins can suspend accounts or change roles.</aside>
          )}
        </div>
      ) : null}
    </>
  );
}
