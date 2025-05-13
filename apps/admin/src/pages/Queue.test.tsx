import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { report } from '../test/fixtures';
import { mockFetch } from '../test/mockFetch';
import { Queue } from './Queue';

afterEach(() => vi.unstubAllGlobals());

function renderQueue(path = '/reports') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Queue />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Queue', () => {
  it('lists reports with priority, category and age', async () => {
    mockFetch({
      'GET /v1/admin/reports': () => ({
        json: {
          items: [
            report({ priority: 0, category: 'self_harm' }),
            report({ id: 'b0d4a0f2-1111-4c2a-8d4e-000000000002', note: 'mean joke' }),
          ],
          nextCursor: null,
        },
      }),
    });
    renderQueue();
    // 'Self-harm' also appears in the category filter, so wait on row-only text.
    expect(await screen.findByText('Urgent priority')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Reports' })).toHaveTextContent('Self-harm');
    expect(screen.getByText('“mean joke”')).toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/reports/b0d4a0f2-1111-4c2a-8d4e-000000000001',
    );
  });

  it('passes filters to the API', async () => {
    const calls = mockFetch({
      'GET /v1/admin/reports': () => ({ json: { items: [], nextCursor: null } }),
    });
    renderQueue('/reports?status=dismissed&category=not_funny');
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
    const url = calls[0]!;
    expect(url.path).toBe('/v1/admin/reports');
    const fetchUrl = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock
      .calls[0]![0];
    expect(fetchUrl).toContain('status=dismissed');
    expect(fetchUrl).toContain('category=not_funny');
  });
});
