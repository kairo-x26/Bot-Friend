import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { sendMessageSchema } from '@bot-friend/shared';
import type { FastifyReply } from 'fastify';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { assertUuid, parse } from '../common/zod.js';
import { QuotaService } from '../limits/quota.service.js';
import { ChatService } from './chat.service.js';
import { sseSink } from './stream-sink.js';

@Controller('v1/conversations/:id/messages')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly quota: QuotaService,
  ) {}

  /** Submit a message and stream the reply as server-sent events. */
  @Post('stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: false }) reply: FastifyReply,
  ) {
    const input = parse(sendMessageSchema, body);
    // Everything that can fail with a normal HTTP error happens before the stream opens.
    await this.quota.checkMessageRate(user.id);
    const turn = await this.chat.prepare(user.id, assertUuid(id, 'Conversation'), input);
    // Only brand-new messages count against the daily allowance; replays and retries are free.
    if (turn.kind === 'generate' && !turn.existingUserMessage) await this.quota.consumeMessage(user);
    const sink = sseSink(reply);
    await this.chat.run(user.id, turn, input, sink);
  }

  @Post(':messageId/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    return this.chat.cancel(user.id, assertUuid(id, 'Conversation'), assertUuid(messageId, 'Message'));
  }
}
