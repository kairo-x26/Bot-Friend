import { reportCategorySchema, reportStatusSchema, type AdminReportPage } from '@bot-friend/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { request } from '../api';
import { CATEGORY_LABEL, PRIORITY_LABEL, age } from '../format';

export function Queue() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const category = params.get('category') ?? '';

  const query = useInfiniteQuery({
    queryKey: ['reports', status, category],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '25' });
      if (status !== 'all') qs.set('status', status);
      if (category) qs.set('category', category);
      if (pageParam) qs.set('cursor', pageParam);
      return request<AdminReportPage>('GET', `/v1/admin/reports?${qs}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Report queue</h1>
          <p className="muted">Most urgent first, then oldest.</p>
        </div>
        <div className="filters">
          <label>
            Status
            <select value={status} onChange={(e) => update('status', e.target.value)}>
              {[...reportStatusSchema.options, 'all'].map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All' : s[0]!.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => update('category', e.target.value)}>
              <option value="">Any</option>
              {reportCategorySchema.options.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {query.isError ? <div className="error">Couldn’t load reports. {(query.error as Error).message}</div> : null}
      {query.isSuccess && items.length === 0 ? (
        <div className="empty">
          <h2>Nothing waiting</h2>
          <p className="muted">No reports match these filters.</p>
        </div>
      ) : null}

      <ul className="queue" aria-label="Reports">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={`/reports/${r.id}`} aria-label={`${PRIORITY_LABEL[r.priority]} priority: ${CATEGORY_LABEL[r.category]}, ${age(r.createdAt)}`}>
              <span className={`prio prio-${r.priority}`} aria-hidden />
              <span>
                <span className="row-title">{CATEGORY_LABEL[r.category]}</span>{' '}
                <span className="muted small">{PRIORITY_LABEL[r.priority]} priority</span>
                {r.note ? <div className="muted small">“{r.note.slice(0, 120)}”</div> : null}
              </span>
              <span style={{ textAlign: 'right' }}>
                <span className={`pill ${r.status}`}>{r.status}</span>
                <div className="muted small">{age(r.createdAt)}</div>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <p>
          <button className="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </p>
      ) : null}
    </>
  );
}
