import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { registerDeviceSchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { ReminderService } from './reminder.service.js';

@Controller('v1/devices')
export class RemindersController {
  constructor(private readonly reminders: ReminderService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { token, platform } = parse(registerDeviceSchema, body);
    await this.reminders.registerDevice(user.id, token, platform);
  }

  @Delete(':token')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.reminders.removeDevice(user.id, decodeURIComponent(token));
  }
}
