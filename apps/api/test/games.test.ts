import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GAMES } from '@bot-friend/shared';
import { MockProvider } from '../src/ai/mock.provider.js';
import type { AiProvider, GenerateRequest } from '../src/ai/provider.js';
import { advanceGame, effectiveMode, initialGameState } from '../src/games/game-engine.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

class Recorder implements AiProvider {
  readonly name = 'recorder';
  requests: GenerateRequest[] = [];
  private readonly inner = new MockProvider(0);
  generate(req: GenerateRequest, signal: AbortSignal) {
    this.requests.push(req);
    return this.inner.generate(req, signal);
  }
}

let t: TestApp;
let token: string;
const recorder = new Recorder();

beforeAll(async () => {
  t = await createTestApp({}, { aiProvider: recorder });
  token = (await devLogin(t, 'gamer@example.com')).accessToken;
});
afterAll(() => t.close());

describe('GET /v1/games', () => {
  it('lists the catalog without auth', async () => {
    const res = await call(t, 'GET', '/v1/games');
    expect(res.status).toBe(200);
    expect(res.json.items.map((g: any) => g.id)).toEqual(Object.keys(GAMES));
  });
});

describe('Joke Battle', () => {
  it('opens with Bot-Friend’s first move', async () => {
    const convo = await newConversation(t, token, { mode: 'joke_battle' });
    expect(convo.game).toEqual({ round: 0, maxRounds: 5, active: true });
    const msgs = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(msgs.json.items).toHaveLength(1);
    expect(msgs.json.items[0]).toMatchObject({ role: 'assistant', status: 'completed' });
    expect(msgs.json.items[0].content).toMatch(/Joke Battle/);
  });

  it('counts rounds, sends the opener as context, and ends after five', async () => {
    const convo = await newConversation(t, token, { mode: 'joke_battle' });
    for (let i = 1; i <= 5; i++) {
      recorder.requests = [];
      const res = await streamMessage(t, token, convo.id, `joke number ${i}`);
      expect(res.terminal?.type).toBe('message.completed');
      const req = recorder.requests[0]!;
      expect(req.instructions).toContain(`(This is round ${i}.)`);
      if (i === 1) expect(req.input[0]).toMatchObject({ role: 'assistant' });
      if (i === 5) {
        expect(req.instructions).toMatch(/final round/);
        expect((res.terminal as any).message.suggestions).toContain('🔁 Rematch');
      }
    }
    const detail = await call(t, 'GET', `/v1/conversations/${convo.id}`, { token });
    expect(detail.json.game).toEqual({ round: 5, maxRounds: 5, active: false });

    // After the game, the conversation continues as normal chat.
    recorder.requests = [];
    await streamMessage(t, token, convo.id, 'good game');
    expect(recorder.requests[0]!.instructions).not.toContain('Game: Joke Battle');
  });

  it('can be ended early and restarted', async () => {
    const convo = await newConversation(t, token, { mode: 'joke_battle' });
    const ended = await call(t, 'POST', `/v1/conversations/${convo.id}/game`, {
      token,
      body: { action: 'end' },
    });
    expect(ended.json.game.active).toBe(false);
    const restarted = await call(t, 'POST', `/v1/conversations/${convo.id}/game`, {
      token,
      body: { action: 'restart' },
    });
    expect(restarted.json.game).toEqual({ round: 0, maxRounds: 5, active: true });
    const msgs = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(msgs.json.items).toHaveLength(2);
  });

  it('rejects game actions on plain chats', async () => {
    const convo = await newConversation(t, token);
    expect(
      (
        await call(t, 'POST', `/v1/conversations/${convo.id}/game`, {
          token,
          body: { action: 'end' },
        })
      ).status,
    ).toBe(403);
  });
});

describe('game engine', () => {
  it('collects joke ratings from replies', () => {
    let state = initialGameState('joke_battle')!;
    state = advanceGame('joke_battle', state, '9/10, I snorted.');
    state = advanceGame('joke_battle', state, 'Solid 6 / 10 effort');
    state = advanceGame('joke_battle', state, 'no rating here');
    expect(state.ratings).toEqual([9, 6]);
    expect(state.round).toBe(3);
  });

  it('open-ended games never end on their own', () => {
    let state = initialGameState('would_you_rather')!;
    for (let i = 0; i < 50; i++) state = advanceGame('would_you_rather', state, 'x');
    expect(state.active).toBe(true);
  });

  it('treats inactive games as chat', () => {
    expect(
      effectiveMode({
        mode: 'story_builder',
        gameState: { round: 8, maxRounds: 8, active: false },
      }),
    ).toBe('chat');
    expect(
      effectiveMode({ mode: 'story_builder', gameState: { round: 1, maxRounds: 8, active: true } }),
    ).toBe('story_builder');
  });
});
