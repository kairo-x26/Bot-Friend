import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createConversationSchema,
  paginationQuerySchema,
  updateConversationSchema,
} from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { assertUuid, parse } from '../common/zod.js';
import { toConversationDto } from './conversations.mapper.js';
import { ConversationsService } from './conversations.service.js';

@Controller('v1/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.conversations.list(user.id, parse(paginationQuerySchema, query));
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const row = await this.conversations.create(user.id, parse(createConversationSchema, body));
    return toConversationDto(row);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.detail(user.id, assertUuid(id, 'Conversation'));
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { title } = parse(updateConversationSchema, body);
    return this.conversations.rename(user.id, assertUuid(id, 'Conversation'), title);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.conversations.remove(user.id, assertUuid(id, 'Conversation'));
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: unknown) {
    return this.conversations.messages(user.id, assertUuid(id, 'Conversation'), parse(paginationQuerySchema, query));
  }
}
