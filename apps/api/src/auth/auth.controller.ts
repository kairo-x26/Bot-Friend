import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { createSessionRequestSchema } from '@bot-friend/shared';
import { parse } from '../common/zod.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  createSession(@Body() body: unknown) {
    return this.auth.createSession(parse(createSessionRequestSchema, body));
  }
}
