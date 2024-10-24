import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ID_TOKEN_VERIFIER, OidcIdTokenVerifier, type IdTokenVerifier } from './auth/id-token-verifier.js';
import { AppConfig } from './config/config.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { UsersModule } from './users/users.module.js';

/** Swap external integrations for fakes in tests or local demos. */
export interface AppOverrides {
  idTokenVerifier?: IdTokenVerifier;
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
    ];
    return {
      module: AppModule,
      global: true,
      imports: [DatabaseModule, AuthModule, UsersModule],
      controllers: [HealthController],
      providers: [{ provide: AppConfig, useValue: config }, ...integrations],
      exports: [AppConfig, ...integrations.map((p) => (p as { provide: symbol }).provide)],
    };
  }
}
