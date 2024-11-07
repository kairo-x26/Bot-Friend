import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ErrorCode, type ComedyStyle, type SendMessage } from '@bot-friend/shared';
import { buildPrompt, detectHumorIntent } from '../ai/prompt-builder.js';
import { AI_PROVIDER, ProviderError, type AiProvider, type PromptMessage } from '../ai/provider.js';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { MODE_TITLES, preview, toMessageDto } from '../conversations/conversations.mapper.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { DB, type Db } from '../db/database.js';
import { conversations, messages, usageRecords, type ConversationRow, type MessageRow } from '../db/schema.js';
import { UsersService } from '../users/users.service.js';
import { InflightRegistry } from './inflight.js';
import type { EventSink } from './stream-sink.js';
import { suggestFollowUps } from './suggestions.js';

/** Result of the checks that run before the HTTP response is turned into a stream. */
export type PreparedTurn =
  | { kind: 'replay'; conversation: ConversationRow; userMessage: MessageRow; reply: MessageRow }
  | { kind: 'generate'; conversation: ConversationRow; existingUserMessage: MessageRow | null };

@Injectable()
export class ChatService {
  private readonly logger = new Logger('ChatService');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly config: AppConfig,
    private readonly conversations: ConversationsService,
    private readonly users: UsersService,
    private readonly inflight: InflightRegistry,
  ) {}

  /**
   * Validates ownership and idempotency. Throws ordinary API errors, so it must run
   * before any stream bytes are written.
   */
  async prepare(userId: string, conversationId: string, body: SendMessage): Promise<PreparedTurn> {
    const conversation = await this.conversations.getOwned(userId, conversationId);
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.idempotencyKey, body.idempotencyKey)))
      .limit(1);

    if (!existing) return { kind: 'generate', conversation, existingUserMessage: null };

    if (existing.content !== body.content) {
      throw new ApiError(ErrorCode.IdempotencyMismatch, 'This idempotency key was already used for a different message');
    }
    const reply = await this.latestReply(existing.id);
    if (reply && (reply.status === 'completed' || reply.status === 'blocked')) {
      return { kind: 'replay', conversation, userMessage: existing, reply };
    }
    if (reply?.status === 'streaming' && this.inflight.has(reply.id)) {
      throw new ApiError(ErrorCode.Conflict, 'A reply to this message is still being generated');
    }
    if (existing.status === 'blocked') {
      // Blocked inputs always have a blocked reply; treat a missing one as a replay of nothing new.
      throw new ApiError(ErrorCode.ContentBlocked, 'This message cannot be sent');
    }
    return { kind: 'generate', conversation, existingUserMessage: existing };
  }

  async run(userId: string, turn: PreparedTurn, body: SendMessage, sink: EventSink): Promise<void> {
    if (turn.kind === 'replay') {
      this.replay(turn, sink);
      return;
    }

    const prefs = await this.users.preferences(userId);
    const style: ComedyStyle = body.comedyStyle ?? prefs.comedyStyle;
    const { conversation } = turn;

    // now() is fixed for a whole transaction, so give rows explicit, strictly increasing times.
    const now = Date.now();
    const { userMessage, assistant } = await this.db.transaction(async (tx) => {
      let userMessage: MessageRow | undefined = turn.existingUserMessage ?? undefined;
      if (userMessage) {
        // Retry: drop earlier failed/cancelled attempts so the thread never shows duplicates.
        await tx
          .delete(messages)
          .where(and(eq(messages.replyToId, userMessage.id), inArray(messages.status, ['failed', 'cancelled', 'streaming'])));
      } else {
        [userMessage] = await tx
          .insert(messages)
          .values({
            conversationId: conversation.id,
            userId,
            role: 'user',
            content: body.content,
            status: 'completed',
            idempotencyKey: body.idempotencyKey,
            createdAt: new Date(now),
          })
          .returning();
      }
      const [assistant] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          userId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          replyToId: userMessage!.id,
          createdAt: new Date(Math.max(now, userMessage!.createdAt.getTime()) + 1),
        })
        .returning();
      return { userMessage: userMessage!, assistant: assistant! };
    });

    sink.send({ type: 'message.started', userMessage: toMessageDto(userMessage), assistantMessageId: assistant.id, replay: false });

    const controller = this.inflight.start(assistant.id, userId);
    const signal = AbortSignal.any([controller.signal, sink.closed, AbortSignal.timeout(this.config.env.AI_TIMEOUT_MS)]);
    const startedAt = Date.now();
    let text = '';
    let seq = 0;

    try {
      const history = (await this.conversations.history(conversation.id, this.config.env.AI_HISTORY_MESSAGES + 1))
        .filter((m) => m.id !== userMessage.id)
        .map<PromptMessage>((m) => ({ role: m.role as PromptMessage['role'], content: m.content }));

      const prompt = buildPrompt(
        {
          preferences: prefs,
          style,
          mode: conversation.mode,
          history,
          userMessage: body.content,
          humorIntent: detectHumorIntent(body.content),
        },
        { maxMessages: this.config.env.AI_HISTORY_MESSAGES, maxChars: this.config.env.AI_HISTORY_CHAR_BUDGET },
      );

      let usage = { modelId: this.ai.name, inputTokens: 0, outputTokens: 0 };
      for await (const chunk of this.ai.generate(
        {
          instructions: prompt.instructions,
          input: prompt.input,
          maxOutputTokens: this.config.env.AI_MAX_OUTPUT_TOKENS,
          safetyIdentifier: userId,
        },
        signal,
      )) {
        if (signal.aborted) break;
        if (chunk.type === 'delta') {
          text += chunk.text;
          sink.send({ type: 'message.delta', assistantMessageId: assistant.id, seq: seq++, text: chunk.text });
        } else {
          usage = chunk;
        }
      }

      if (signal.aborted) {
        await this.finishCancelled(assistant, text, controller.signal.aborted, sink);
        return;
      }

      const content = text.trim();
      if (!content) throw new ProviderError('Empty reply');

      const suggestions = suggestFollowUps({
        style,
        mode: conversation.mode,
        userText: body.content,
        serious: false,
        roastOptIn: prefs.roastOptIn,
      });

      const completed = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(messages)
          .set({
            content,
            status: 'completed',
            suggestions,
            modelId: usage.modelId,
            promptVersion: prompt.promptVersion,
            updatedAt: new Date(),
          })
          .where(eq(messages.id, assistant.id))
          .returning();
        await tx.insert(usageRecords).values({
          userId,
          conversationId: conversation.id,
          messageId: assistant.id,
          modelId: usage.modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostMicros: this.costMicros(usage.inputTokens, usage.outputTokens),
          durationMs: Date.now() - startedAt,
        });
        await tx
          .update(conversations)
          .set({
            comedyStyle: style,
            lastMessagePreview: preview(content),
            updatedAt: new Date(),
            ...this.autoTitle(conversation, body.content),
          })
          .where(eq(conversations.id, conversation.id));
        return row!;
      });

      sink.send({ type: 'message.completed', message: toMessageDto(completed) });
    } catch (err) {
      if (signal.aborted && !(err instanceof ProviderError)) {
        await this.finishCancelled(assistant, text, controller.signal.aborted, sink);
        return;
      }
      const timedOut = signal.aborted;
      this.logger.warn(`Generation failed for ${assistant.id}: ${(err as Error).message}`);
      await this.db
        .update(messages)
        .set({ status: 'failed', content: '', errorCode: ErrorCode.ProviderUnavailable, updatedAt: new Date() })
        .where(eq(messages.id, assistant.id));
      sink.send({
        type: 'message.failed',
        assistantMessageId: assistant.id,
        code: ErrorCode.ProviderUnavailable,
        message: timedOut ? 'Bot-Friend took too long to answer. Try again.' : 'Bot-Friend couldn’t answer just now. Try again.',
        retryable: true,
      });
    } finally {
      this.inflight.finish(assistant.id);
      sink.end();
    }
  }

  async cancel(userId: string, conversationId: string, assistantMessageId: string): Promise<{ cancelled: boolean }> {
    await this.conversations.getOwned(userId, conversationId);
    return { cancelled: this.inflight.cancel(assistantMessageId, userId) };
  }

  private replay(turn: Extract<PreparedTurn, { kind: 'replay' }>, sink: EventSink) {
    const { userMessage, reply } = turn;
    sink.send({ type: 'message.started', userMessage: toMessageDto(userMessage), assistantMessageId: reply.id, replay: true });
    if (reply.status === 'blocked') {
      sink.send({
        type: 'message.blocked',
        assistantMessageId: reply.id,
        stage: userMessage.status === 'blocked' ? 'input' : 'output',
        replacement: reply.content,
        supportResources: reply.errorCode === 'self_harm',
      });
    } else {
      sink.send({ type: 'message.completed', message: toMessageDto(reply) });
    }
    sink.end();
  }

  /** A stopped reply keeps its partial text for reference but is never marked completed. */
  private async finishCancelled(assistant: MessageRow, text: string, byUser: boolean, sink: EventSink) {
    await this.db
      .update(messages)
      .set({ status: 'cancelled', content: text, errorCode: ErrorCode.Cancelled, updatedAt: new Date() })
      .where(eq(messages.id, assistant.id));
    sink.send({
      type: 'message.failed',
      assistantMessageId: assistant.id,
      code: byUser ? ErrorCode.Cancelled : ErrorCode.ProviderUnavailable,
      message: byUser ? 'Stopped.' : 'Bot-Friend took too long to answer. Try again.',
      retryable: true,
    });
  }

  private async latestReply(userMessageId: string) {
    const [reply] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.replyToId, userMessageId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return reply;
  }

  private autoTitle(conversation: ConversationRow, firstUserText: string) {
    if (!conversation.titleIsAuto || conversation.mode !== 'chat' || conversation.title !== MODE_TITLES.chat) return {};
    return { title: preview(firstUserText, 48) };
  }

  private costMicros(inputTokens: number, outputTokens: number) {
    const { AI_INPUT_COST_PER_MTOK: inCost, AI_OUTPUT_COST_PER_MTOK: outCost } = this.config.env;
    return Math.round(inputTokens * inCost + outputTokens * outCost);
  }
}
