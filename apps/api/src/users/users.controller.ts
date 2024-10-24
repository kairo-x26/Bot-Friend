import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updatePreferencesSchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { UsersService } from './users.service.js';

@Controller('v1/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.users.updatePreferences(user.id, parse(updatePreferencesSchema, body));
  }
}
