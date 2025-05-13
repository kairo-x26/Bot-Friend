import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { setReactionSchema, type FeatureFlags } from '@bot-friend/shared';
import { AnalyticsService } from '../audit/audit.service.js';
import { CurrentUser, Public, type AuthUser } from '../auth/decorators.js';
import { ApiError } from '../common/api-error.js';
import { assertUuid, parse } from '../common/zod.js';
import { AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/database.js';
import { messages } from '../db/schema.js';

const POSITIVE = new Set(['laugh', 'love', 'up']);

@Controller('v1')
export class FeedbackController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly analytics: AnalyticsService,
    private readonly config: AppConfig,
  ) {}

  /** React to an AI reply (BF-023). Reactions double as quality feedback. */
  @Post('messages/:id/reaction')
  @HttpCode(200)
  async react(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { reaction } = parse(setReactionSchema, body);
    const updated = await this.db
      .update(messages)
      .set({ reaction, updatedAt: new Date() })
      .where(
        and(
          eq(messages.id, assertUuid(id, 'Message')),
          eq(messages.userId, user.id),
          eq(messages.role, 'assistant'),
        ),
      )
      .returning({ id: messages.id, promptVersion: messages.promptVersion });
    if (updated.length === 0) throw ApiError.notFound('Message');
    if (reaction) {
      this.analytics.track('reply_rated', user.id, {
        reaction,
        positive: POSITIVE.has(reaction),
        promptVersion: updated[0]!.promptVersion,
      });
    }
    return { reaction };
  }

  @Public()
  @Get('features')
  features(): FeatureFlags {
    const { FEATURE_MEMORY, FEATURE_VOICE, FEATURE_BILLING } = this.config.env;
    return { memory: FEATURE_MEMORY, voice: FEATURE_VOICE, billing: FEATURE_BILLING };
  }
}
