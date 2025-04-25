import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');
const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().default('postgres://botfriend:botfriend@localhost:5432/botfriend'),
  /** Use an embedded PGlite database instead of DATABASE_URL (local demos and tests). */
  DATABASE_EMBEDDED: bool.default(false),
  DATABASE_EMBEDDED_DIR: z.string().optional(),
  RUN_MIGRATIONS: bool.default(true),

  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32).default('dev-only-secret-change-me-dev-only-secret'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 30),
  AUTH_DEV_LOGIN: bool.default(false),
  /** Dev-login emails that get the admin role on first sign-in (local moderation testing). */
  DEV_ADMIN_EMAILS: csv,
  APPLE_CLIENT_IDS: csv,
  GOOGLE_CLIENT_IDS: csv,

  AI_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-5-mini'),
  OPENAI_MODERATION_MODEL: z.string().default('omni-moderation-latest'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_REALTIME_VOICE: z.string().default('marin'),
  VOICE_SESSION_SECONDS: z.coerce.number().int().min(10).max(7200).default(300),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(400),
  AI_HISTORY_MESSAGES: z.coerce.number().int().positive().default(20),
  AI_HISTORY_CHAR_BUDGET: z.coerce.number().int().positive().default(12_000),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /** USD per 1M tokens, used for cost estimates in usage records. */
  AI_INPUT_COST_PER_MTOK: z.coerce.number().nonnegative().default(0.25),
  AI_OUTPUT_COST_PER_MTOK: z.coerce.number().nonnegative().default(2),
  /** Hard daily spend ceiling across all users, in USD. 0 disables. */
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(0),

  QUOTA_GUEST_DAILY: z.coerce.number().int().nonnegative().default(20),
  QUOTA_FREE_DAILY: z.coerce.number().int().nonnegative().default(80),
  QUOTA_PREMIUM_DAILY: z.coerce.number().int().nonnegative().default(600),
  RATE_LIMIT_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(12),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(20),

  GUEST_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_SWEEP_MINUTES: z.coerce.number().int().nonnegative().default(60),

  PUSH_PROVIDER: z.enum(['expo', 'none']).default('none'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  REMINDER_SWEEP_MINUTES: z.coerce.number().int().nonnegative().default(15),

  SENTRY_DSN: z.string().url().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),

  FEATURE_MEMORY: bool.default(true),
  FEATURE_VOICE: bool.default(false),
  FEATURE_BILLING: bool.default(false),
  BILLING_WEBHOOK_SECRET: z.string().optional(),
  APPLE_BUNDLE_ID: z.string().default('app.botfriend.mobile'),
  /** SHA-256 fingerprints (hex, no colons) of trusted Apple root certs. Defaults to Apple Root CA - G3. */
  APPLE_ROOT_FINGERPRINTS: csv,
  GOOGLE_PLAY_PACKAGE: z.string().default('app.botfriend.mobile'),
  /** Service account JSON (inline) with access to the Play Developer API. */
  GOOGLE_PLAY_SERVICE_ACCOUNT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class AppConfig {
  constructor(readonly env: Env) {}

  static fromEnv(source: Record<string, string | undefined> = process.env): AppConfig {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid configuration: ${issues}`);
    }
    const env = parsed.data;
    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET.startsWith('dev-only')) throw new Error('JWT_SECRET must be set in production');
      if (env.AUTH_DEV_LOGIN) throw new Error('AUTH_DEV_LOGIN cannot be enabled in production');
      if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    }
    return new AppConfig(env);
  }

  get isProduction() {
    return this.env.NODE_ENV === 'production';
  }
}
