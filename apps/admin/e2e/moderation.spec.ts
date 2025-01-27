import { expect, test, type Page, type Route } from '@playwright/test';

const mod = {
  id: '9b1f1c5e-8d0a-4c7e-9a43-2f5c3d1e7a10',
  provider: 'dev',
  displayName: 'mod',
  role: 'moderator',
  isGuest: false,
  createdAt: '2025-01-01T00:00:00.000Z',
};
const prefs = {
  comedyStyle: 'wholesome', energy: 'medium', humorBoundaries: [], roastOptIn: false, theme: 'system',
  reducedMotion: false, largeText: false, hapticsEnabled: true, mascotColor: 'violet', locale: 'en-US',
  memoryEnabled: false, remindersEnabled: false, reminderHour: null,
};
const REPORT_ID = 'b0d4a0f2-1111-4c2a-8d4e-000000000001';
const baseReport = {
  id: REPORT_ID,
  messageId: 'b0d4a0f2-2222-4c2a-8d4e-000000000001',
  conversationId: 'b0d4a0f2-3333-4c2a-8d4e-000000000001',
  reporterId: '9b1f1c5e-8d0a-4c7e-9a43-2f5c3d1e7a11',
  category: 'harassment',
  status: 'open',
  priority: 1,
  note: 'felt personal',
  createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  resolvedAt: null,
};

async function mockApi(page: Page) {
  const patches: unknown[] = [];
  let current: Record<string, unknown> = { ...baseReport, resolution: null, resolvedBy: null };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = `${req.method()} ${url.pathname}`;
    if (key === 'POST /v1/auth/session') return json(route, { accessToken: 'tok', expiresAt: '2030-01-01T00:00:00Z', user: mod });
    if (key === 'GET /v1/me') return json(route, { user: mod, preferences: prefs });
    if (key === 'GET /v1/admin/metrics')
      return json(route, {
        openReports: { total: 1, urgent: 1 },
        last24h: { messages: 42, activeUsers: 7, blockedReplies: 1, failedReplies: 0, estimatedCostUsd: 0.12, p95LatencyMs: 1800, positiveRatingShare: 0.9, ratedReplies: 10 },
        failedDeletionJobs: 0,
      });
    if (key === 'GET /v1/admin/reports') return json(route, { items: [current], nextCursor: null });
    if (key === `GET /v1/admin/reports/${REPORT_ID}`)
      return json(route, {
        ...current,
        evidence: {
          reportedContent: 'Your cooking is a crime scene.',
          precedingUserContent: 'roast my cooking',
          modelId: 'gpt-5-mini',
          promptVersion: 'bf-2024.10.3',
          comedyStyle: 'sarcastic',
          messageCreatedAt: '2025-01-01T00:00:00.000Z',
        },
      });
    if (key === `PATCH /v1/admin/reports/${REPORT_ID}`) {
      const body = req.postDataJSON();
      patches.push(body);
      current = { ...current, status: body.status, resolution: body.resolution, resolvedAt: new Date().toISOString() };
      return json(route, {
        ...current,
        evidence: { reportedContent: 'x', precedingUserContent: null, modelId: null, promptVersion: null, comedyStyle: null, messageCreatedAt: '2025-01-01T00:00:00.000Z' },
      });
    }
    return json(route, { error: { code: 'not_found', message: `unmocked ${key}` } }, 404);
  });
  return { patches };
}

test('moderator signs in, reviews a report and resolves it', async ({ page }) => {
  const { patches } = await mockApi(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill('mod@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Messages sent')).toBeVisible();

  await page.getByRole('link', { name: /Reports/ }).click();
  await expect(page.getByRole('heading', { name: 'Report queue' })).toBeVisible();
  await page.getByRole('link', { name: /High priority: Harassment/ }).click();

  await expect(page.getByLabel('Reported reply')).toHaveText('Your cooking is a crime scene.');
  await expect(page.getByLabel('User message')).toHaveText('roast my cooking');

  const save = page.getByRole('button', { name: 'Save resolution' });
  await expect(save).toBeDisabled();
  await page.getByLabel('Outcome').selectOption('actioned');
  await page.getByLabel('Notes').fill('Added to the roast red-team set');
  await save.click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(patches).toEqual([{ status: 'actioned', resolution: 'Added to the roast red-team set' }]);
});

test('the queue is keyboard navigable', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill('mod@example.com');
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: /Reports/ }).click();
  const row = page.getByRole('link', { name: /High priority: Harassment/ });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/reports/${REPORT_ID}$`));
});

test('layout does not scroll sideways', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill('mod@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: /Reports/ }).click();
  await page.getByRole('link', { name: /High priority/ }).click();
  await expect(page.getByLabel('Reported reply')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
