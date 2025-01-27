import { z } from 'zod';
import {
  entitlementSchema,
  identityProviderSchema,
  isoDate,
  pageSchema,
  reportCategorySchema,
  reportStatusSchema,
  userRoleSchema,
  uuid,
} from './domain.js';

export const adminReportSchema = z.object({
  id: uuid,
  messageId: uuid,
  conversationId: uuid.nullable(),
  reporterId: uuid.nullable(),
  category: reportCategorySchema,
  status: reportStatusSchema,
  priority: z.number().int(),
  note: z.string().nullable(),
  createdAt: isoDate,
  resolvedAt: isoDate.nullable(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminReportDetailSchema = adminReportSchema.extend({
  evidence: z.object({
    reportedContent: z.string(),
    precedingUserContent: z.string().nullable(),
    modelId: z.string().nullable(),
    promptVersion: z.string().nullable(),
    comedyStyle: z.string().nullable(),
    messageCreatedAt: isoDate,
  }),
  resolution: z.string().nullable(),
  resolvedBy: uuid.nullable(),
});
export type AdminReportDetail = z.infer<typeof adminReportDetailSchema>;

export const adminReportPageSchema = pageSchema(adminReportSchema);
export type AdminReportPage = z.infer<typeof adminReportPageSchema>;

export const adminReportQuerySchema = z.object({
  status: reportStatusSchema.optional(),
  category: reportCategorySchema.optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminReportQuery = z.infer<typeof adminReportQuerySchema>;

export const resolveReportSchema = z.object({
  status: z.enum(['triaged', 'actioned', 'dismissed']),
  resolution: z.string().trim().min(3).max(2000),
});
export type ResolveReport = z.infer<typeof resolveReportSchema>;

export const adminUserSchema = z.object({
  id: uuid,
  provider: identityProviderSchema,
  role: userRoleSchema,
  status: z.enum(['active', 'suspended', 'deleting', 'deleted']),
  entitlement: entitlementSchema,
  createdAt: isoDate,
  lastSeenAt: isoDate.nullable(),
  stats: z.object({
    conversations: z.number().int(),
    reportsFiled: z.number().int(),
    messagesToday: z.number().int(),
    blockedReplies: z.number().int(),
  }),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const suspendUserSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const setRoleSchema = z.object({ role: userRoleSchema });

export const auditEventSchema = z.object({
  id: uuid,
  actorId: uuid.nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  occurredAt: isoDate,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditPageSchema = pageSchema(auditEventSchema);
export type AuditPage = z.infer<typeof auditPageSchema>;

export const adminMetricsSchema = z.object({
  openReports: z.object({ total: z.number().int(), urgent: z.number().int() }),
  last24h: z.object({
    messages: z.number().int(),
    activeUsers: z.number().int(),
    blockedReplies: z.number().int(),
    failedReplies: z.number().int(),
    estimatedCostUsd: z.number(),
    p95LatencyMs: z.number().int().nullable(),
    /** Share of rated replies with a positive reaction (PRD KPI: ≥ 80%). */
    positiveRatingShare: z.number().min(0).max(1).nullable(),
    ratedReplies: z.number().int(),
  }),
  failedDeletionJobs: z.number().int(),
});
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;
