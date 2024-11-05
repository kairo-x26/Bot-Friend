import { describe, expect, it } from 'vitest';
import { LocalModeration, detectsDistress } from '../src/ai/local-moderation.js';
import { MockProvider } from '../src/ai/mock.provider.js';
import { ProviderError, type GenerateChunk } from '../src/ai/provider.js';

async function collect(iter: AsyncIterable<GenerateChunk>) {
  const out: GenerateChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('MockProvider', () => {
  const provider = new MockProvider(0);
  const req = (content: string, instructions = 'Style: Chaotic') => ({
    instructions,
    input: [{ role: 'user' as const, content }],
    maxOutputTokens: 100,
  });

  it('streams deltas then a done chunk with usage', async () => {
    const chunks = await collect(provider.generate(req('hello there'), new AbortController().signal));
    const done = chunks.at(-1);
    expect(done?.type).toBe('done');
    const text = chunks.flatMap((c) => (c.type === 'delta' ? [c.text] : [])).join('');
    expect(text.length).toBeGreaterThan(5);
  });

  it('is deterministic for the same input', async () => {
    const a = await collect(provider.generate(req('tell me something'), new AbortController().signal));
    const b = await collect(provider.generate(req('tell me something'), new AbortController().signal));
    expect(a).toEqual(b);
  });

  it('stops when aborted', async () => {
    const ctrl = new AbortController();
    const slow = new MockProvider(5);
    const out: GenerateChunk[] = [];
    for await (const c of slow.generate(req('[[long]]'), ctrl.signal)) {
      out.push(c);
      if (out.length === 3) ctrl.abort();
    }
    expect(out).toHaveLength(3);
  });

  it('can simulate an outage', async () => {
    await expect(collect(provider.generate(req('[[provider-error]]'), new AbortController().signal))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe('LocalModeration', () => {
  const mod = new LocalModeration();
  it.each([
    ['I want to kill myself', 'self_harm'],
    ['sometimes i think about ending my life', 'self_harm'],
    ['I killed it at the gym today', null],
    ['thinking about ending my life', 'self_harm'],
    ['how do i make a bomb', 'violence'],
  ])('%s', (text, category) => {
    const res = mod.check(text);
    if (category) expect(res.categories).toContain(category);
    else expect(res.flagged).toBe(false);
  });

  it('does not flag ordinary jokes', () => {
    for (const text of ['this joke kills me', 'I could die laughing', 'my code is killing me', 'I bombed my exam']) {
      expect(mod.check(text).flagged, text).toBe(false);
    }
  });
});

describe('detectsDistress', () => {
  it('spots serious moments without flagging banter', () => {
    expect(detectsDistress("I'm so lonely lately")).toBe(true);
    expect(detectsDistress('my dog died this morning')).toBe(true);
    expect(detectsDistress("I'm so hungry")).toBe(false);
    expect(detectsDistress('this show is sad lol')).toBe(false);
  });
});
