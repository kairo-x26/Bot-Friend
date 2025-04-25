import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { LocalModeration } from './ai/local-moderation.js';
import { MockProvider } from './ai/mock.provider.js';
import { OpenAiModeration, OpenAiProvider } from './ai/openai.provider.js';
import {
  AI_PROVIDER,
  MODERATION_PROVIDER,
  type AiProvider,
  type ModerationProvider,
} from './ai/provider.js';
import { AccountModule } from './account/account.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { DefaultStoreVerifier, STORE_VERIFIER, type StoreVerifier } from './billing/store-verifier.js';
import { ID_TOKEN_VERIFIER, OidcIdTokenVerifier, type IdTokenVerifier } from './auth/id-token-verifier.js';
import { ChatModule } from './chat/chat.module.js';
import { AppConfig } from './config/config.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { DatabaseModule } from './db/database.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { HealthController } from './health/health.controller.js';
import { MetricsController } from './observability/metrics.controller.js';
import { MemoryModule } from './memory/memory.module.js';
import { LimitsModule } from './limits/limits.module.js';
import { ExpoPushProvider, PUSH_PROVIDER, RecordingPushProvider, type PushProvider } from './reminders/push.provider.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SearchModule } from './search/search.module.js';
import { UsersModule } from './users/users.module.js';
import { MockRealtimeProvider, OpenAiRealtimeProvider, REALTIME_PROVIDER, type RealtimeProvider } from './voice/realtime.provider.js';
import { VoiceModule } from './voice/voice.module.js';

/** Swap external integrations for fakes in tests or local demos. */
export interface AppOverrides {
  idTokenVerifier?: IdTokenVerifier;
  aiProvider?: AiProvider;
  moderation?: ModerationProvider;
  push?: PushProvider;
  storeVerifier?: StoreVerifier;
  realtime?: RealtimeProvider;
}

export interface AppModuleOptions {
  config: AppConfig;
  overrides?: AppOverrides;
}

@Module({})
export class AppModule {
  static register({ config, overrides = {} }: AppModuleOptions): DynamicModule {
    const integrations: Provider[] = [
      {
        provide: ID_TOKEN_VERIFIER,
        useValue: overrides.idTokenVerifier ?? new OidcIdTokenVerifier(config),
      },
      {
        provide: AI_PROVIDER,
        useValue:
          overrides.aiProvider ??
          (config.env.AI_PROVIDER === 'openai'
            ? new OpenAiProvider(config)
            : new MockProvider(config.env.NODE_ENV === 'test' ? 0 : 25)),
      },
      {
        provide: MODERATION_PROVIDER,
        useValue:
          overrides.moderation ??
          (config.env.AI_PROVIDER === 'openai' ? new OpenAiModeration(config) : new LocalModeration()),
      },
      {
        provide: PUSH_PROVIDER,
        useValue:
          overrides.push ??
          (config.env.PUSH_PROVIDER === 'expo' ? new ExpoPushProvider(config.env.EXPO_ACCESS_TOKEN) : new RecordingPushProvider()),
      },
      { provide: STORE_VERIFIER, useValue: overrides.storeVerifier ?? new DefaultStoreVerifier(config) },
      {
        provide: REALTIME_PROVIDER,
        useValue: overrides.realtime ?? (config.env.AI_PROVIDER === 'openai' ? new OpenAiRealtimeProvider(config) : new MockRealtimeProvider()),
      },
    ];
    return {
      module: AppModule,
      global: true,
      imports: [
        DatabaseModule,
        AuditModule,
        LimitsModule,
        AuthModule,
        UsersModule,
        ConversationsModule,
        ChatModule,
        ReportsModule,
        AccountModule,
        AdminModule,
        FeedbackModule,
        MemoryModule,
        SearchModule,
        RemindersModule,
        BillingModule,
        VoiceModule,
      ],
      controllers: [HealthController, MetricsController],
      providers: [{ provide: AppConfig, useValue: config }, ...integrations],
      exports: [AppConfig, ...integrations.map((p) => (p as { provide: symbol }).provide)],
    };
  }
}
