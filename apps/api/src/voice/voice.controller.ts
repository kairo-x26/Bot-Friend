import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ErrorCode, type VoiceSession } from '@bot-friend/shared';
import { ENERGY_NOTES, PERSONA, SAFETY_RULES, STYLE_CONTRACTS } from '../ai/prompts.js';
import { ProviderError } from '../ai/provider.js';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { QuotaService } from '../limits/quota.service.js';
import { UsersService } from '../users/users.service.js';
import { REALTIME_PROVIDER, type RealtimeProvider } from './realtime.provider.js';

const VOICE_NOTES = `Voice mode: you are speaking out loud. Keep turns to one or two short sentences, sound warm and natural, and pause so the user can jump in. If the user interrupts, stop and listen.`;

/** Voice conversations (BF-022), behind FEATURE_VOICE. */
@Controller('v1/voice')
export class VoiceController {
  constructor(
    @Inject(REALTIME_PROVIDER) private readonly realtime: RealtimeProvider,
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly quota: QuotaService,
  ) {}

  @Post('session')
  @HttpCode(201)
  async session(@CurrentUser() user: AuthUser): Promise<VoiceSession> {
    if (!this.config.env.FEATURE_VOICE) throw new ApiError(ErrorCode.FeatureDisabled, 'Voice chat isn’t available yet');
    if (user.provider === 'guest') throw ApiError.forbidden('Create a free account to use voice chat.');
    await this.quota.checkMessageRate(user.id);
    // A voice session counts as one message against the daily allowance.
    await this.quota.consumeMessage(user);

    const prefs = await this.users.preferences(user.id);
    const instructions = [SAFETY_RULES, PERSONA, STYLE_CONTRACTS[prefs.comedyStyle], ENERGY_NOTES[prefs.energy], VOICE_NOTES].join('\n\n');
    const { OPENAI_REALTIME_MODEL: model, OPENAI_REALTIME_VOICE: voice, VOICE_SESSION_SECONDS: ttlSeconds } = this.config.env;
    try {
      const secret = await this.realtime.createClientSecret({ instructions, model, voice, ttlSeconds, safetyIdentifier: user.id });
      return { clientSecret: secret.value, expiresAt: secret.expiresAt.toISOString(), model, voice };
    } catch (err) {
      if (err instanceof ProviderError) throw new ApiError(ErrorCode.ProviderUnavailable, 'Voice is having a moment. Try again shortly.');
      throw err;
    }
  }
}
