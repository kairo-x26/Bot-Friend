import { z } from 'zod';
import { conversationModeSchema, isoDate, pageSchema, reactionSchema, uuid } from './domain.js';

// ---------- reactions & feedback (BF-023) ----------

export const setReactionSchema = z.object({ reaction: reactionSchema.nullable() });
export type SetReaction = z.infer<typeof setReactionSchema>;

// ---------- memories (BF-019, BF-020) ----------

export const memoryStatusSchema = z.enum(['suggested', 'approved']);
export const memorySchema = z.object({
  id: uuid,
  content: z.string(),
  status: memoryStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Memory = z.infer<typeof memorySchema>;

export const MAX_MEMORY_LENGTH = 200;
export const MAX_MEMORIES = 50;

export const createMemorySchema = z.object({
  content: z.string().trim().min(2).max(MAX_MEMORY_LENGTH),
});
export const updateMemorySchema = z
  .object({
    content: z.string().trim().min(2).max(MAX_MEMORY_LENGTH).optional(),
    status: z.literal('approved').optional(),
  })
  .refine((v) => v.content !== undefined || v.status !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateMemory = z.infer<typeof updateMemorySchema>;

export const memoryListSchema = z.object({ items: z.array(memorySchema), enabled: z.boolean() });
export type MemoryList = z.infer<typeof memoryListSchema>;

// ---------- search (BF-021) ----------

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const searchHitSchema = z.object({
  conversationId: uuid,
  conversationTitle: z.string(),
  mode: conversationModeSchema,
  messageId: uuid,
  role: z.enum(['user', 'assistant']),
  /** Excerpt around the match; `[` `]` mark the matched text. */
  snippet: z.string(),
  createdAt: isoDate,
});
export type SearchHit = z.infer<typeof searchHitSchema>;
export const searchResultSchema = z.object({ items: z.array(searchHitSchema) });
export type SearchResult = z.infer<typeof searchResultSchema>;

// ---------- export (BF-026) ----------

export const EXPORT_FORMAT_VERSION = 1;

// ---------- reminders (BF-024) ----------

export const registerDeviceSchema = z.object({
  token: z.string().min(10).max(400),
  platform: z.enum(['ios', 'android', 'web']),
});

// ---------- billing (BF-025) ----------

export const productIds = ['botfriend.premium.monthly', 'botfriend.premium.yearly'] as const;
export const verifyPurchaseSchema = z.object({
  provider: z.enum(['apple', 'google']),
  productId: z.enum(productIds),
  /** Apple: signed transaction JWS. Google: purchase token. */
  receipt: z.string().min(10).max(20_000),
});
export type VerifyPurchase = z.infer<typeof verifyPurchaseSchema>;

export const subscriptionStatusSchema = z.object({
  entitlement: z.enum(['guest', 'free', 'premium']),
  subscription: z
    .object({
      provider: z.enum(['apple', 'google']),
      productId: z.string(),
      status: z.enum(['active', 'grace', 'expired', 'revoked']),
      expiresAt: isoDate.nullable(),
    })
    .nullable(),
});
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

// ---------- voice (BF-022) ----------

export const voiceSessionSchema = z.object({
  /** Short-lived client secret for the realtime provider; never the API key. */
  clientSecret: z.string(),
  expiresAt: isoDate,
  model: z.string(),
  voice: z.string(),
});
export type VoiceSession = z.infer<typeof voiceSessionSchema>;

export const featureFlagsSchema = z.object({
  memory: z.boolean(),
  voice: z.boolean(),
  billing: z.boolean(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const messageSearchPageSchema = pageSchema(searchHitSchema);
