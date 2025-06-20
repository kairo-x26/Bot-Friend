import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider', { enum: ['guest', 'apple', 'google', 'dev'] }).notNull(),
    /** Stable subject from the identity provider; hashed guest token for guests. */
    providerSubject: text('provider_subject').notNull(),
    displayName: text('display_name'),
    role: text('role', { enum: ['user', 'moderator', 'admin'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'suspended', 'deleting', 'deleted'] })
      .notNull()
      .default('active'),
    ageEligibilityStatus: text('age_eligibility_status', { enum: ['confirmed', 'ineligible'] })
      .notNull()
      .default('confirmed'),
    entitlement: text('entitlement', { enum: ['guest', 'free', 'premium'] })
      .notNull()
      .default('free'),
    /** Bumped on deletion/suspension to revoke every outstanding session token. */
    sessionVersion: integer('session_version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [
    uniqueIndex('users_provider_subject_idx').on(t.provider, t.providerSubject),
    index('users_guest_created_idx')
      .on(t.createdAt)
      .where(sql`provider = 'guest'`),
  ],
);

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  comedyStyle: text('comedy_style', { enum: ['wholesome', 'chaotic', 'sarcastic', 'chill'] })
    .notNull()
    .default('wholesome'),
  energy: text('energy', { enum: ['low', 'medium', 'high'] })
    .notNull()
    .default('medium'),
  humorBoundaries: text('humor_boundaries')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  roastOptIn: boolean('roast_opt_in').notNull().default(false),
  theme: text('theme', { enum: ['system', 'light', 'dark'] })
    .notNull()
    .default('system'),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  largeText: boolean('large_text').notNull().default(false),
  hapticsEnabled: boolean('haptics_enabled').notNull().default(true),
  mascotColor: text('mascot_color', { enum: ['violet', 'peach', 'mint', 'lavender'] })
    .notNull()
    .default('violet'),
  mascotAccessory: text('mascot_accessory', {
    enum: ['none', 'party_hat', 'glasses', 'bow', 'headphones', 'crown'],
  })
    .notNull()
    .default('none'),
  locale: text('locale').notNull().default('en-US'),
  memoryEnabled: boolean('memory_enabled').notNull().default(false),
  remindersEnabled: boolean('reminders_enabled').notNull().default(false),
  reminderHour: smallint('reminder_hour'),
  lastReminderAt: ts('last_reminder_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const botProfiles = pgTable('bot_profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  personalityVersion: text('personality_version').notNull(),
  avatarId: text('avatar_id').notNull(),
  createdAt: createdAt(),
});

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    botProfileId: text('bot_profile_id')
      .notNull()
      .references(() => botProfiles.id),
    title: text('title').notNull(),
    titleIsAuto: boolean('title_is_auto').notNull().default(true),
    mode: text('mode', {
      enum: ['chat', 'joke_battle', 'roast_me', 'would_you_rather', 'story_builder', 'silly_quiz'],
    })
      .notNull()
      .default('chat'),
    comedyStyle: text('comedy_style', {
      enum: ['wholesome', 'chaotic', 'sarcastic', 'chill'],
    }).notNull(),
    gameState: jsonb('game_state').$type<Record<string, unknown> | null>(),
    lastMessagePreview: text('last_message_preview'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('conversations_user_updated_idx').on(t.userId, t.updatedAt, t.id)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Denormalized owner so every query can filter by user without a join. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    status: text('status', {
      enum: ['pending', 'streaming', 'completed', 'failed', 'cancelled', 'blocked'],
    }).notNull(),
    /** For assistant messages: the user message being answered. */
    replyToId: uuid('reply_to_id'),
    idempotencyKey: text('idempotency_key'),
    reaction: text('reaction', { enum: ['laugh', 'love', 'meh', 'up', 'down'] }),
    suggestions: jsonb('suggestions')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Attachment metadata only; image bytes are never persisted. */
    attachments: jsonb('attachments')
      .$type<Array<{ kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    modelId: text('model_id'),
    promptVersion: text('prompt_version'),
    errorCode: text('error_code'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt, t.id),
    uniqueIndex('messages_idempotency_idx')
      .on(t.conversationId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('messages_reply_to_idx').on(t.replyToId),
  ],
);

export const usageCounters = pgTable(
  'usage_counters',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    messages: integer('messages').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id'),
    messageId: uuid('message_id'),
    kind: text('kind', { enum: ['chat', 'moderation', 'memory', 'voice'] })
      .notNull()
      .default('chat'),
    modelId: text('model_id').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** Estimated cost in micro-dollars (1e-6 USD) to avoid float drift. */
    estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('usage_records_user_created_idx').on(t.userId, t.createdAt),
    index('usage_records_created_idx').on(t.createdAt),
  ],
);

export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    /** Not a foreign key: reports outlive deleted messages as evidence. */
    messageId: uuid('message_id').notNull(),
    conversationId: uuid('conversation_id'),
    category: text('category', {
      enum: [
        'offensive',
        'harassment',
        'sexual',
        'self_harm',
        'misinformation',
        'not_funny',
        'other',
      ],
    }).notNull(),
    note: text('note'),
    status: text('status', { enum: ['open', 'triaged', 'actioned', 'dismissed'] })
      .notNull()
      .default('open'),
    priority: smallint('priority').notNull().default(2),
    /** Minimal snapshot: the reported reply and the prompt that produced it. */
    evidence: jsonb('evidence').$type<ReportEvidence>().notNull(),
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('content_reports_reporter_message_idx').on(t.reporterId, t.messageId),
    index('content_reports_status_idx').on(t.status, t.priority, t.createdAt),
  ],
);

export interface ReportEvidence {
  reportedContent: string;
  precedingUserContent: string | null;
  modelId: string | null;
  promptVersion: string | null;
  comedyStyle: string | null;
  messageCreatedAt: string;
}

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_occurred_idx').on(t.occurredAt),
    index('audit_events_target_idx').on(t.targetId),
  ],
);

export const deletionJobs = pgTable('deletion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Kept after the user row is gone so the job stays auditable. */
  userId: uuid('user_id').notNull(),
  status: text('status', { enum: ['scheduled', 'running', 'completed', 'failed'] })
    .notNull()
    .default('scheduled'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  steps: jsonb('steps')
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  requestedAt: ts('requested_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['apple', 'google'] }).notNull(),
    productId: text('product_id').notNull(),
    originalTransactionId: text('original_transaction_id').notNull(),
    entitlement: text('entitlement', { enum: ['premium'] })
      .notNull()
      .default('premium'),
    status: text('status', { enum: ['active', 'grace', 'expired', 'revoked'] }).notNull(),
    expiresAt: ts('expires_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_original_tx_idx').on(t.provider, t.originalTransactionId)],
);

export const billingEvents = pgTable('billing_events', {
  /** Provider notification id — primary key makes webhook processing idempotent. */
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  processedAt: ts('processed_at').notNull().defaultNow(),
});

export const memoryItems = pgTable(
  'memory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    consentStatus: text('consent_status', {
      enum: ['suggested', 'approved', 'rejected'],
    }).notNull(),
    sourceMessageId: uuid('source_message_id'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('memory_items_user_idx').on(t.userId, t.consentStatus)],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Pseudonymous; never joined with raw content. */
    userId: uuid('user_id'),
    name: text('name').notNull(),
    properties: jsonb('properties')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
  },
  (t) => [index('analytics_events_name_time_idx').on(t.name, t.occurredAt)],
);

export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform', { enum: ['ios', 'android', 'web'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_devices_token_idx').on(t.token)],
);

export type UserRow = typeof users.$inferSelect;
export type PreferencesRow = typeof userPreferences.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ReportRow = typeof contentReports.$inferSelect;
export type MemoryRow = typeof memoryItems.$inferSelect;
