import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query } from '@nestjs/common';
import { verifyPurchaseSchema } from '@bot-friend/shared';
import { timingSafeEqual } from 'node:crypto';
import { CurrentUser, Public, type AuthUser } from '../auth/decorators.js';
import { ApiError } from '../common/api-error.js';
import { parse } from '../common/zod.js';
import { AppConfig } from '../config/config.js';
import { BillingService } from './billing.service.js';
import { DefaultStoreVerifier, InvalidReceiptError, verifyAppleJws, APPLE_ROOT_CA_G3_SHA256 } from './store-verifier.js';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

@Controller('v1/billing')
export class BillingController {
  private readonly logger = new Logger('BillingWebhooks');

  constructor(
    private readonly billing: BillingService,
    private readonly config: AppConfig,
  ) {}

  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.billing.status(user);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.billing.verifyPurchase(user, parse(verifyPurchaseSchema, body));
  }

  /**
   * App Store Server Notifications v2 (`signedPayload`) and Google Play RTDN via
   * Pub/Sub push. Both must carry `?token=BILLING_WEBHOOK_SECRET`; Apple payloads
   * are additionally signature-verified, Google ones are re-fetched from the Play API.
   */
  @Public()
  @Post('webhooks/:provider')
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Query('token') token: string | undefined, @Body() body: any) {
    this.billing.assertEnabled();
    const secret = this.config.env.BILLING_WEBHOOK_SECRET;
    if (!secret || !token || !safeEqual(token, secret)) throw ApiError.unauthenticated('Bad webhook token');

    const store = this.billing.store;
    try {
      if (provider === 'apple') {
        const roots = this.config.env.APPLE_ROOT_FINGERPRINTS.length ? this.config.env.APPLE_ROOT_FINGERPRINTS : [APPLE_ROOT_CA_G3_SHA256];
        const note = await verifyAppleJws<{ notificationType: string; notificationUUID: string; data?: { signedTransactionInfo?: string } }>(
          String(body?.signedPayload ?? ''),
          roots,
        );
        if (!note.data?.signedTransactionInfo) return { result: 'ignored' };
        const purchase =
          store instanceof DefaultStoreVerifier
            ? await store.apple.verifyTransaction(note.data.signedTransactionInfo)
            : await store.verify('apple', '', note.data.signedTransactionInfo);
        return { result: await this.billing.applyNotification('apple', note.notificationUUID, note.notificationType, purchase) };
      }
      if (provider === 'google') {
        const messageId = String(body?.message?.messageId ?? '');
        const data = JSON.parse(Buffer.from(String(body?.message?.data ?? ''), 'base64').toString('utf8') || '{}');
        const sub = data.subscriptionNotification as { purchaseToken?: string; subscriptionId?: string; notificationType?: number } | undefined;
        if (!messageId || !sub?.purchaseToken || !sub.subscriptionId) return { result: 'ignored' };
        const purchase = await store.verify('google', sub.subscriptionId, sub.purchaseToken);
        return { result: await this.billing.applyNotification('google', messageId, `rtdn_${sub.notificationType ?? 0}`, purchase) };
      }
    } catch (err) {
      if (err instanceof InvalidReceiptError) throw new ApiError('validation_failed', 'Invalid notification');
      this.logger.error(`Webhook processing failed: ${(err as Error).message}`);
      // A 5xx makes the store retry later, which is what we want for transient failures.
      throw err;
    }
    throw ApiError.notFound('Webhook');
  }
}
