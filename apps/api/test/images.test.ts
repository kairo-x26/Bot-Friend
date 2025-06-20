import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { MockProvider } from '../src/ai/mock.provider.js';
import type { AiProvider, GenerateRequest, ModerationProvider } from '../src/ai/provider.js';
import { messages } from '../src/db/schema.js';
import { BLOCKED_IMAGE_MESSAGE } from '../src/safety/safety.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation } from './support/http.js';
import { SseParser } from '@bot-friend/shared';
import { randomUUID } from 'node:crypto';

// 1x1 transparent PNG
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

class Recorder implements AiProvider {
  readonly name = 'recorder';
  requests: GenerateRequest[] = [];
  private readonly inner = new MockProvider(0);
  generate(req: GenerateRequest, signal: AbortSignal) {
    this.requests.push(req);
    return this.inner.generate(req, signal);
  }
}

class ImageModeration implements ModerationProvider {
  readonly name = 'image-stub';
  down = false;
  async moderate() {
    return { flagged: false, categories: [] };
  }
  async moderateImage(img: { data: string }) {
    if (this.down) throw new Error('down');
    const flagged = img.data.startsWith('Zm9yYmlkZGVu'); // "forbidden"
    return { flagged, categories: flagged ? (['sexual'] as const).slice() : [] };
  }
}

let t: TestApp;
let token: string;
const recorder = new Recorder();
const moderation = new ImageModeration();

async function sendPhoto(convoId: string, content: string, data = PIXEL, app = t, tok = token) {
  const res = await call(app, 'POST', `/v1/conversations/${convoId}/messages/stream`, {
    token: tok,
    body: { content, idempotencyKey: randomUUID(), image: { mediaType: 'image/png', data } },
  });
  return { ...res, events: res.status === 200 ? new SseParser().push(res.body) : [] };
}

beforeAll(async () => {
  t = await createTestApp({ FEATURE_IMAGES: 'true' }, { aiProvider: recorder, moderation });
  token = (await devLogin(t)).accessToken;
});
afterAll(() => t.close());

describe('photo messages', () => {
  it('sends the photo to the model for that turn only and never stores it', async () => {
    const convo = await newConversation(t, token);
    recorder.requests = [];
    const res = await sendPhoto(convo.id, 'what do you think of my lunch?');
    expect(res.events.at(-1)?.type).toBe('message.completed');
    const last = recorder.requests[0]!.input.at(-1)!;
    expect(last.images).toEqual([{ mediaType: 'image/png', data: PIXEL }]);

    const rows = await t.db.select().from(messages).where(eq(messages.conversationId, convo.id));
    const userRow = rows.find((r) => r.role === 'user')!;
    expect(userRow.attachments).toEqual([{ kind: 'image', mediaType: 'image/png' }]);
    expect(JSON.stringify(rows)).not.toContain(PIXEL);

    const history = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(history.json.items[0].attachments).toEqual([{ kind: 'image', mediaType: 'image/png' }]);

    // Next turn: the old photo is mentioned, not re-sent.
    recorder.requests = [];
    await call(t, 'POST', `/v1/conversations/${convo.id}/messages/stream`, {
      token,
      body: { content: 'and now?', idempotencyKey: randomUUID() },
    });
    const input = recorder.requests[0]!.input;
    expect(input[0]!.content).toMatch(/\[shared a photo\]/);
    expect(input.some((m) => m.images?.length && m.content !== 'and now?')).toBe(false);
  });

  it('blocks flagged photos and fails closed when image moderation is down', async () => {
    const convo = await newConversation(t, token);
    const bad = await sendPhoto(
      convo.id,
      'look',
      Buffer.from('forbidden-image').toString('base64'),
    );
    expect(bad.events.at(-1)).toMatchObject({
      type: 'message.blocked',
      stage: 'input',
      replacement: BLOCKED_IMAGE_MESSAGE,
    });

    moderation.down = true;
    const unchecked = await sendPhoto(convo.id, 'look again');
    expect(unchecked.events.at(-1)).toMatchObject({
      type: 'message.blocked',
      replacement: BLOCKED_IMAGE_MESSAGE,
    });
    moderation.down = false;
  });

  it('validates the payload and respects the feature flag', async () => {
    const convo = await newConversation(t, token);
    expect((await sendPhoto(convo.id, 'x', 'not base64!!')).status).toBe(400);
    expect((await sendPhoto(convo.id, 'x', 'A'.repeat(1_400_004))).status).toBe(400);

    const t2 = await createTestApp();
    const u = await devLogin(t2);
    const c2 = await newConversation(t2, u.accessToken);
    const off = await sendPhoto(c2.id, 'x', PIXEL, t2, u.accessToken);
    expect(off.json.error.code).toBe('feature_disabled');
    await t2.close();
  });
});
