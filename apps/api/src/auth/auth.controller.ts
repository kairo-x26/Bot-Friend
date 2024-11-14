import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { createSessionRequestSchema } from '@bot-friend/shared';
import { parse } from '../common/zod.js';
import { QuotaService } from '../limits/quota.service.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly quota: QuotaService,
  ) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  async createSession(@Body() body: unknown, @Ip() ip: string) {
    await this.quota.checkAuthRate(ip);
    return this.auth.createSession(parse(createSessionRequestSchema, body));
  }
}
