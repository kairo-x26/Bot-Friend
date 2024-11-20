import { Global, Module } from '@nestjs/common';
import { AnalyticsService, AuditService } from './audit.service.js';

@Global()
@Module({
  providers: [AuditService, AnalyticsService],
  exports: [AuditService, AnalyticsService],
})
export class AuditModule {}
