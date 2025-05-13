import type { AdminMetrics } from '@bot-friend/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { request } from '../api';

export function Overview() {
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: () => request<AdminMetrics>('GET', '/v1/admin/metrics'),
    refetchInterval: 60_000,
  });
  const m = metrics.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Last 24 hours. Refreshes every minute.</p>
        </div>
        <Link to="/reports">Open the queue</Link>
      </div>
      {metrics.isError ? (
        <div className="error">Couldn’t load metrics. {(metrics.error as Error).message}</div>
      ) : null}
      {m ? (
        <div className="stats">
          <Stat label="Open reports" value={m.openReports.total} />
          <Stat
            label="Urgent or high"
            value={m.openReports.urgent}
            alert={m.openReports.urgent > 0}
          />
          <Stat label="Messages sent" value={m.last24h.messages} />
          <Stat label="Active users" value={m.last24h.activeUsers} />
          <Stat label="Blocked replies" value={m.last24h.blockedReplies} />
          <Stat
            label="Failed replies"
            value={m.last24h.failedReplies}
            alert={m.last24h.failedReplies > 20}
          />
          <Stat
            label="p95 reply time"
            value={
              m.last24h.p95LatencyMs === null
                ? '—'
                : `${(m.last24h.p95LatencyMs / 1000).toFixed(1)}s`
            }
          />
          <Stat label="Estimated AI spend" value={`$${m.last24h.estimatedCostUsd.toFixed(2)}`} />
          <Stat
            label={`Positive ratings (${m.last24h.ratedReplies} rated)`}
            value={
              m.last24h.positiveRatingShare === null
                ? '—'
                : `${Math.round(m.last24h.positiveRatingShare * 100)}%`
            }
            alert={m.last24h.positiveRatingShare !== null && m.last24h.positiveRatingShare < 0.8}
          />
          <Stat
            label="Failed deletion jobs"
            value={m.failedDeletionJobs}
            alert={m.failedDeletionJobs > 0}
          />
        </div>
      ) : metrics.isLoading ? (
        <p className="muted">Loading…</p>
      ) : null}
    </>
  );
}

function Stat({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className={`stat${alert ? ' alert' : ''}`}>
      <div className="muted small">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
