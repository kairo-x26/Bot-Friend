import type { AdminMetrics } from '@bot-friend/shared';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router';
import { request } from './api';
import { useAuth } from './auth';
import { Audit } from './pages/Audit';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Queue } from './pages/Queue';
import { ReportDetail } from './pages/ReportDetail';
import { Users } from './pages/Users';

function Shell() {
  const { me, signOut } = useAuth();
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: () => request<AdminMetrics>('GET', '/v1/admin/metrics'),
    refetchInterval: 60_000,
  });
  const open = metrics.data?.openReports.total ?? 0;
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-dot" aria-hidden /> Bot-Friend
        </div>
        <div className="nav">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/reports">
            Reports{' '}
            {open > 0 ? (
              <span className="count" aria-label={`${open} open`}>
                {open}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/audit">Audit log</NavLink>
        </div>
        <div className="sidebar-foot">
          <span className="muted small">Signed in as {me?.user.role}</span>
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Login />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="reports" element={<Queue />} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
