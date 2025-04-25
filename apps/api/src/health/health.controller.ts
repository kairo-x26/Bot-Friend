import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/database.js';
import { Public } from '../auth/decorators.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Liveness: the process is up. */
  @Public()
  @Get()
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Readiness: dependencies are reachable. Load balancers should use this one. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
  }
}
