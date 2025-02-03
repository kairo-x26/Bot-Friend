import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { createMemorySchema, updateMemorySchema } from '@bot-friend/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { assertUuid, parse } from '../common/zod.js';
import { MemoryService } from './memory.service.js';

@Controller('v1/memories')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.memory.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.memory.create(user.id, parse(createMemorySchema, body).content);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.memory.update(user.id, assertUuid(id, 'Memory'), parse(updateMemorySchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.memory.remove(user.id, assertUuid(id, 'Memory'));
  }

  /** Erase everything Bot-Friend remembers. */
  @Delete()
  @HttpCode(200)
  eraseAll(@CurrentUser() user: AuthUser) {
    return this.memory.eraseAll(user.id);
  }
}
