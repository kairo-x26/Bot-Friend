import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { SearchService } from './search.service.js';

@Controller('v1/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const { q, limit } = parse(searchQuerySchema, query);
    return this.search.search(user.id, q, limit);
  }
}
