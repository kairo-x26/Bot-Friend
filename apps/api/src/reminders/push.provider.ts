import { Logger } from '@nestjs/common';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly name: string;
  /** Returns the tokens the provider says are no longer valid. */
  send(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Keeps what would have been sent; used in tests and when push is not configured. */
export class RecordingPushProvider implements PushProvider {
  readonly name = 'recording';
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
  async send(tokens: string[], message: PushMessage) {
    this.sent.push({ tokens, message });
    return { invalidTokens: [] };
  }
}

/** Expo push service: https://docs.expo.dev/push-notifications/sending-notifications/ */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly logger = new Logger('ExpoPush');

  constructor(
    private readonly accessToken?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(tokens: string[], message: PushMessage) {
    const invalidTokens: string[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await this.fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((to) => ({ to, title: message.title, body: message.body, data: message.data, sound: 'default' }))),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push failed with ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
      json.data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[idx]!);
      });
    }
    return { invalidTokens };
  }
}
