import { Global, Logger, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.js';
import { MemoryRateLimitStore, RateLimiter, RedisRateLimitStore } from './rate-limiter.js';
import { QuotaService, RATE_LIMITER } from './quota.service.js';
import { UsageController } from './usage.controller.js';

@Global()
@Module({
  controllers: [UsageController],
  providers: [
    {
      provide: RATE_LIMITER,
      inject: [AppConfig],
      useFactory: async (config: AppConfig) => {
        if (!config.env.REDIS_URL) return new RateLimiter(new MemoryRateLimitStore());
        const { Redis } = await import('ioredis');
        const redis = new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
        redis.on('error', (err) => new Logger('Redis').warn(err.message));
        return new RateLimiter(new RedisRateLimitStore(redis));
      },
    },
    QuotaService,
  ],
  exports: [QuotaService, RATE_LIMITER],
})
export class LimitsModule {}
