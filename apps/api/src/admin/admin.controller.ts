import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  adminReportQuerySchema,
  paginationQuerySchema,
  resolveReportSchema,
  setRoleSchema,
  suspendUserSchema,
} from '@bot-friend/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { assertUuid, parse } from '../common/zod.js';
import { AdminService } from './admin.service.js';

@Controller('v1/admin')
@Roles('moderator', 'admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  reports(@Query() query: unknown) {
    return this.admin.listReports(parse(adminReportQuerySchema, query));
  }

  @Get('reports/:id')
  report(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.admin.getReport(actor, assertUuid(id, 'Report'));
  }

  @Patch('reports/:id')
  resolve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.resolveReport(
      actor,
      assertUuid(id, 'Report'),
      parse(resolveReportSchema, body),
    );
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(assertUuid(id, 'User'));
  }

  @Post('users/:id/suspend')
  @Roles('admin')
  suspend(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.setStatus(
      actor,
      assertUuid(id, 'User'),
      'suspended',
      parse(suspendUserSchema, body).reason,
    );
  }

  @Post('users/:id/reinstate')
  @Roles('admin')
  reinstate(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.setStatus(
      actor,
      assertUuid(id, 'User'),
      'active',
      parse(suspendUserSchema, body).reason,
    );
  }

  @Patch('users/:id/role')
  @Roles('admin')
  role(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.setRole(actor, assertUuid(id, 'User'), parse(setRoleSchema, body).role);
  }

  @Get('audit')
  auditLog(@Query() query: unknown) {
    return this.admin.auditLog(parse(paginationQuerySchema, query));
  }

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }
}
