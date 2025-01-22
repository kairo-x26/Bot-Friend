import type { AdminReportDetail, ResolveReport } from '@bot-friend/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { request } from '../api';
import { CATEGORY_LABEL, PRIORITY_LABEL, dateTime } from '../format';

export function ReportDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const report = useQuery({ queryKey: ['report', id], queryFn: () => request<AdminReportDetail>('GET', `/v1/admin/reports/${id}`) });
  const [status, setStatus] = useState<ResolveReport['status']>('actioned');
  const [resolution, setResolution] = useState('');
  const resolve = useMutation({
    mutationFn: (body: ResolveReport) => request<AdminReportDetail>('PATCH', `/v1/admin/reports/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['report', id], data);
      void qc.invalidateQueries({ queryKey: ['reports'] });
      void qc.invalidateQueries({ queryKey: ['metrics'] });
      setResolution('');
    },
  });

  if (report.isError) return <div className="error">Couldn’t load this report. {(report.error as Error).message}</div>;
  if (!report.data) return <p className="muted">Loading…</p>;
  const r = report.data;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    resolve.mutate({ status, resolution: resolution.trim() });
  };

  return (
    <>
      <p>
        <Link to="/reports">Back to queue</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{CATEGORY_LABEL[r.category]}</h1>
          <p className="muted">
            {PRIORITY_LABEL[r.priority]} priority, reported {dateTime(r.createdAt)}
          </p>
        </div>
        <span className={`pill ${r.status}`}>{r.status}</span>
      </div>

      <div className="detail">
        <section className="panel" aria-labelledby="evidence-title">
          <h2 id="evidence-title">What happened</h2>
          <div className="thread">
            {r.evidence.precedingUserContent ? (
              <div className="bubble user" aria-label="User message">
                {r.evidence.precedingUserContent}
              </div>
            ) : (
              <p className="muted small">No preceding user message (game opener or deleted).</p>
            )}
            <div className="bubble bot" aria-label="Reported reply">
              {r.evidence.reportedContent}
            </div>
          </div>
          {r.note ? (
            <>
              <h3>Reporter’s note</h3>
              <p style={{ margin: 0 }}>{r.note}</p>
            </>
          ) : null}
        </section>

        <aside className="panel" aria-label="Report details">
          <dl className="meta">
            <dt>Style</dt>
            <dd>{r.evidence.comedyStyle ?? '—'}</dd>
            <dt>Model</dt>
            <dd>{r.evidence.modelId ?? '—'}</dd>
            <dt>Prompt</dt>
            <dd>{r.evidence.promptVersion ?? '—'}</dd>
            <dt>Reply sent</dt>
            <dd>{dateTime(r.evidence.messageCreatedAt)}</dd>
            <dt>Reporter</dt>
            <dd>{r.reporterId ? <Link to={`/users?id=${r.reporterId}`}>{r.reporterId.slice(0, 8)}</Link> : 'deleted account'}</dd>
          </dl>
          {r.resolution ? (
            <div className="notice">
              <strong>Resolution:</strong> {r.resolution}
            </div>
          ) : null}
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <h3>Resolve</h3>
            <label>
              Outcome
              <select value={status} onChange={(e) => setStatus(e.target.value as ResolveReport['status'])}>
                <option value="actioned">Actioned (prompt fix, eval case, or account action)</option>
                <option value="triaged">Triaged (needs follow-up)</option>
                <option value="dismissed">Dismissed (no issue found)</option>
              </select>
            </label>
            <label>
              Notes
              <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} minLength={3} required placeholder="What you found and what you did" />
            </label>
            {resolve.isError ? <div className="error">{(resolve.error as Error).message}</div> : null}
            {resolve.isSuccess ? <div className="notice">Saved.</div> : null}
            <button type="submit" disabled={resolve.isPending || resolution.trim().length < 3}>
              {resolve.isPending ? 'Saving…' : 'Save resolution'}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
