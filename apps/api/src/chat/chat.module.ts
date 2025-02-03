import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { InflightRegistry } from './inflight.js';

@Module({
  imports: [ConversationsModule, UsersModule, SafetyModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService, InflightRegistry],
})
export class ChatModule {}
