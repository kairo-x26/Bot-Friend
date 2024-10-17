import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfig } from './config/config.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';

export interface AppModuleOptions {
  config: AppConfig;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DatabaseModule],
      controllers: [HealthController],
      providers: [{ provide: AppConfig, useValue: options.config }],
      exports: [AppConfig],
    };
  }
}
