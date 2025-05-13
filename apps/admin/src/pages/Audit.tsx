import type { AuditPage } from '@bot-friend/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { request } from '../api';
import { dateTime } from '../format';

export function Audit() {
  const query = useInfiniteQuery({
    queryKey: ['audit'],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      request<AuditPage>(
        'GET',
        `/v1/admin/audit?limit=50${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">Every moderator action and safety event, newest first.</p>
        </div>
      </div>
      {query.isError ? <div className="error">{(query.error as Error).message}</div> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Actor</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td>{dateTime(e.occurredAt)}</td>
                <td>
                  <code>{e.action}</code>
                </td>
                <td>
                  {e.targetType} {e.targetId.slice(0, 8)}
                </td>
                <td>{e.actorId ? e.actorId.slice(0, 8) : 'system'}</td>
                <td className="muted small">
                  {Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.hasNextPage ? (
        <p>
          <button className="secondary" onClick={() => query.fetchNextPage()}>
            Load more
          </button>
        </p>
      ) : null}
    </>
  );
}
