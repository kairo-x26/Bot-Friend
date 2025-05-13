import { Body, Controller, Post, Res } from '@nestjs/common';
import { createReportSchema } from '@bot-friend/shared';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { ReportsService } from './reports.service.js';

@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { report, created } = await this.reports.create(user.id, parse(createReportSchema, body));
    reply.status(created ? 201 : 200);
    return report;
  }
}
