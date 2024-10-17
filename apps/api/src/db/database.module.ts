import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/config.js';
import { DB, openDatabase, type DatabaseHandle } from './database.js';

const HANDLE = Symbol('DB_HANDLE');

@Global()
@Module({
  providers: [
    { provide: HANDLE, inject: [AppConfig], useFactory: (config: AppConfig) => openDatabase(config) },
    { provide: DB, inject: [HANDLE], useFactory: (handle: DatabaseHandle) => handle.db },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown() {
    await this.handle.close();
  }
}
