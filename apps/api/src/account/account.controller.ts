import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { accountDeletionRequestSchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { DeletionService } from './deletion.service.js';
import { ExportService } from './export.service.js';

@Controller('v1/account')
export class AccountController {
  constructor(
    private readonly deletion: DeletionService,
    private readonly exporter: ExportService,
  ) {}

  @Post('deletion')
  @HttpCode(202)
  requestDeletion(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    parse(accountDeletionRequestSchema, body);
    return this.deletion.request(user);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) reply: FastifyReply) {
    const date = new Date().toISOString().slice(0, 10);
    reply.header('content-disposition', `attachment; filename="bot-friend-export-${date}.json"`);
    reply.header('cache-control', 'no-store');
    return this.exporter.export(user);
  }
}
