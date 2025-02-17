import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { DeletionService } from './deletion.service.js';
import { ExportService } from './export.service.js';
import { RetentionService } from './retention.service.js';

@Module({
  controllers: [AccountController],
  providers: [DeletionService, RetentionService, ExportService],
  exports: [DeletionService, RetentionService],
})
export class AccountModule {}
