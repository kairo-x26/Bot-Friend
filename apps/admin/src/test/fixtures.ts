import type { AdminMetrics, AdminReport, AdminReportDetail, MeResponse } from '@bot-friend/shared';

export const moderatorMe: MeResponse = {
  user: { id: '9b1f1c5e-8d0a-4c7e-9a43-2f5c3d1e7a10', provider: 'dev', displayName: 'mod', role: 'moderator', isGuest: false, createdAt: '2025-01-01T00:00:00.000Z' },
  preferences: {
    comedyStyle: 'wholesome',
    energy: 'medium',
    humorBoundaries: [],
    roastOptIn: false,
    theme: 'system',
    reducedMotion: false,
    largeText: false,
    hapticsEnabled: true,
    mascotColor: 'violet',
    locale: 'en-US',
    memoryEnabled: false,
    remindersEnabled: false,
    reminderHour: null,
  },
};

export const report = (over: Partial<AdminReport> = {}): AdminReport => ({
  id: 'b0d4a0f2-1111-4c2a-8d4e-000000000001',
  messageId: 'b0d4a0f2-2222-4c2a-8d4e-000000000001',
  conversationId: 'b0d4a0f2-3333-4c2a-8d4e-000000000001',
  reporterId: '9b1f1c5e-8d0a-4c7e-9a43-2f5c3d1e7a11',
  category: 'offensive',
  status: 'open',
  priority: 2,
  note: null,
  createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  resolvedAt: null,
  ...over,
});

export const reportDetail = (over: Partial<AdminReportDetail> = {}): AdminReportDetail => ({
  ...report(),
  evidence: {
    reportedContent: 'That joke went a bit far.',
    precedingUserContent: 'roast my cooking',
    modelId: 'gpt-5-mini',
    promptVersion: 'bf-2024.10.3',
    comedyStyle: 'sarcastic',
    messageCreatedAt: '2025-01-01T00:00:00.000Z',
  },
  resolution: null,
  resolvedBy: null,
  ...over,
});

export const metrics: AdminMetrics = {
  openReports: { total: 3, urgent: 1 },
  last24h: { messages: 120, activeUsers: 14, blockedReplies: 2, failedReplies: 1, estimatedCostUsd: 0.42, p95LatencyMs: 2300, positiveRatingShare: 0.86, ratedReplies: 22 },
  failedDeletionJobs: 0,
};
