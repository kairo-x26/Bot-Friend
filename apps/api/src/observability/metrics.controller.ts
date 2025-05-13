import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators.js';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { registry } from './metrics.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly config: AppConfig) {}

  /** Prometheus scrape endpoint. Requires `Authorization: Bearer METRICS_TOKEN` when one is set. */
  @Public()
  @Get()
  async metrics(@Headers('authorization') auth: string | undefined, @Res() reply: FastifyReply) {
    const token = this.config.env.METRICS_TOKEN;
    if (this.config.isProduction && !token) throw ApiError.notFound('Route');
    if (token) {
      const given = Buffer.from(auth?.replace(/^Bearer /, '') ?? '');
      const want = Buffer.from(token);
      if (given.length !== want.length || !timingSafeEqual(given, want))
        throw ApiError.unauthenticated('Bad metrics token');
    }
    void reply.header('content-type', registry.contentType).send(await registry.metrics());
  }
}
