import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { QuotaService } from './quota.service.js';

@Controller('v1/usage')
export class UsageController {
  constructor(private readonly quota: QuotaService) {}

  @Get()
  usage(@CurrentUser() user: AuthUser) {
    return this.quota.usage(user);
  }
}
