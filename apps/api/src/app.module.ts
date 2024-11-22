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
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ID_TOKEN_VERIFIER, OidcIdTokenVerifier, type IdTokenVerifier } from './auth/id-token-verifier.js';
import { ChatModule } from './chat/chat.module.js';
import { AppConfig } from './config/config.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { LimitsModule } from './limits/limits.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { UsersModule } from './users/users.module.js';

/** Swap external integrations for fakes in tests or local demos. */
export interface AppOverrides {
  idTokenVerifier?: IdTokenVerifier;
  aiProvider?: AiProvider;
  moderation?: ModerationProvider;
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
      ],
      controllers: [HealthController],
      providers: [{ provide: AppConfig, useValue: config }, ...integrations],
      exports: [AppConfig, ...integrations.map((p) => (p as { provide: symbol }).provide)],
    };
  }
}
