import { z } from 'zod';
import { comedyStyleSchema, energySchema, humorBoundarySchema } from './personality.js';

export const isoDate = z.string().datetime({ offset: true });
export const uuid = z.string().uuid();

// ---------- identity ----------

export const identityProviderSchema = z.enum(['guest', 'apple', 'google', 'dev']);
export type IdentityProvider = z.infer<typeof identityProviderSchema>;

export const createSessionRequestSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('guest'),
    /** Returned by a previous guest session so the same trial continues. */
    guestToken: z.string().min(16).max(256).optional(),
    ageConfirmed: z.boolean(),
  }),
  z.object({
    provider: z.literal('apple'),
    idToken: z.string().min(10),
    ageConfirmed: z.boolean(),
    /** Existing guest session whose conversations should move to this account. */
    upgradeGuestToken: z.string().optional(),
  }),
  z.object({
    provider: z.literal('google'),
    idToken: z.string().min(10),
    ageConfirmed: z.boolean(),
    upgradeGuestToken: z.string().optional(),
  }),
  z.object({
    provider: z.literal('dev'),
    email: z.string().email(),
    ageConfirmed: z.boolean(),
    upgradeGuestToken: z.string().optional(),
  }),
]);
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const userRoleSchema = z.enum(['user', 'moderator', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: uuid,
  provider: identityProviderSchema,
  displayName: z.string().nullable(),
  role: userRoleSchema,
  isGuest: z.boolean(),
  createdAt: isoDate,
});
export type User = z.infer<typeof userSchema>;

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  expiresAt: isoDate,
  /** Present for guest sessions; store it to resume the trial on this device. */
  guestToken: z.string().optional(),
  user: userSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// ---------- preferences ----------

export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const mascotColorSchema = z.enum(['violet', 'peach', 'mint', 'lavender']);
export type MascotColor = z.infer<typeof mascotColorSchema>;

export const mascotAccessorySchema = z.enum([
  'none',
  'party_hat',
  'glasses',
  'bow',
  'headphones',
  'crown',
]);
export type MascotAccessory = z.infer<typeof mascotAccessorySchema>;

export const preferencesSchema = z.object({
  comedyStyle: comedyStyleSchema,
  energy: energySchema,
  humorBoundaries: z.array(humorBoundarySchema),
  roastOptIn: z.boolean(),
  theme: themePreferenceSchema,
  reducedMotion: z.boolean(),
  largeText: z.boolean(),
  hapticsEnabled: z.boolean(),
  mascotColor: mascotColorSchema,
  mascotAccessory: mascotAccessorySchema,
  locale: z.string().min(2).max(16),
  memoryEnabled: z.boolean(),
  remindersEnabled: z.boolean(),
  reminderHour: z.number().int().min(0).max(23).nullable(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const updatePreferencesSchema = preferencesSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });
export type UpdatePreferences = z.infer<typeof updatePreferencesSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  preferences: preferencesSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ---------- conversations ----------

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageStatusSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'failed',
  'cancelled',
  'blocked',
]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const reactionSchema = z.enum(['laugh', 'love', 'meh', 'up', 'down']);
export type Reaction = z.infer<typeof reactionSchema>;

export const messageSchema = z.object({
  id: uuid,
  conversationId: uuid,
  role: messageRoleSchema,
  content: z.string(),
  status: messageStatusSchema,
  reaction: reactionSchema.nullable(),
  suggestions: z.array(z.string()).default([]),
  /** Safety reply that should be shown with crisis/support resources. */
  supportResources: z.boolean().default(false),
  createdAt: isoDate,
});
export type Message = z.infer<typeof messageSchema>;

export const conversationModeSchema = z.enum([
  'chat',
  'joke_battle',
  'roast_me',
  'would_you_rather',
  'story_builder',
  'silly_quiz',
]);
export type ConversationMode = z.infer<typeof conversationModeSchema>;

export const conversationGameSchema = z
  .object({
    round: z.number().int().nonnegative(),
    maxRounds: z.number().int().positive().nullable(),
    active: z.boolean(),
  })
  .nullable();

export const conversationSchema = z.object({
  id: uuid,
  title: z.string(),
  mode: conversationModeSchema,
  game: conversationGameSchema,
  comedyStyle: comedyStyleSchema,
  lastMessagePreview: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  mode: conversationModeSchema.default('chat'),
});
export type CreateConversation = z.input<typeof createConversationSchema>;

export const paginationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const conversationPageSchema = pageSchema(conversationSchema);
export type ConversationPage = z.infer<typeof conversationPageSchema>;
export const messagePageSchema = pageSchema(messageSchema);
export type MessagePage = z.infer<typeof messagePageSchema>;

export const conversationDetailSchema = conversationSchema.extend({
  /** The most recent messages, chronological. */
  messages: z.array(messageSchema),
  /** Pass to GET /messages?cursor= to load the page before `messages`. */
  olderMessagesCursor: z.string().nullable(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const MAX_MESSAGE_LENGTH = 4000;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message is empty').max(MAX_MESSAGE_LENGTH),
  /** Client-generated; resending with the same key replays instead of duplicating. */
  idempotencyKey: z.string().min(8).max(100),
  /** Override style for this reply only (e.g. chip tap). Defaults to preferences. */
  comedyStyle: comedyStyleSchema.optional(),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

// ---------- reports ----------

export const reportCategorySchema = z.enum([
  'offensive',
  'harassment',
  'sexual',
  'self_harm',
  'misinformation',
  'not_funny',
  'other',
]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

export const reportStatusSchema = z.enum(['open', 'triaged', 'actioned', 'dismissed']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const createReportSchema = z.object({
  messageId: uuid,
  category: reportCategorySchema,
  note: z.string().trim().max(1000).optional(),
});
export type CreateReport = z.infer<typeof createReportSchema>;

export const reportSchema = z.object({
  id: uuid,
  messageId: uuid,
  category: reportCategorySchema,
  status: reportStatusSchema,
  createdAt: isoDate,
});
export type Report = z.infer<typeof reportSchema>;

// ---------- usage ----------

export const entitlementSchema = z.enum(['guest', 'free', 'premium']);
export type Entitlement = z.infer<typeof entitlementSchema>;

export const usageResponseSchema = z.object({
  entitlement: entitlementSchema,
  period: z.literal('day'),
  messagesUsed: z.number().int().nonnegative(),
  messagesLimit: z.number().int().nonnegative(),
  resetsAt: isoDate,
});
export type UsageResponse = z.infer<typeof usageResponseSchema>;

// ---------- account ----------

export const accountDeletionRequestSchema = z.object({
  confirm: z.literal('DELETE'),
});
export const accountDeletionResponseSchema = z.object({
  jobId: uuid,
  status: z.enum(['scheduled', 'running', 'completed', 'failed']),
});
export type AccountDeletionResponse = z.infer<typeof accountDeletionResponseSchema>;

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export type UpdateConversation = z.infer<typeof updateConversationSchema>;

export const gameActionSchema = z.object({ action: z.enum(['end', 'restart']) });
export type GameAction = z.infer<typeof gameActionSchema>;
