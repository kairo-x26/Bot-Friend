import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { accountDeletionRequestSchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { DeletionService } from './deletion.service.js';

@Controller('v1/account')
export class AccountController {
  constructor(private readonly deletion: DeletionService) {}

  @Post('deletion')
  @HttpCode(202)
  requestDeletion(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    parse(accountDeletionRequestSchema, body);
    return this.deletion.request(user);
  }
}
