import { describe, expect, it } from 'vitest';
import { suggestFollowUps } from '../src/chat/suggestions.js';

const base = {
  style: 'wholesome' as const,
  mode: 'chat' as const,
  serious: false,
  roastOptIn: false,
};

describe('suggestFollowUps', () => {
  it('always returns exactly three chips', () => {
    for (const userText of ['hi', 'I need motivation', 'so bored', 'tell me a joke', '']) {
      expect(suggestFollowUps({ ...base, userText })).toHaveLength(3);
    }
  });

  it('offers roasts only to users who opted in', () => {
    expect(suggestFollowUps({ ...base, userText: 'procrastinating again' })).not.toContain(
      '😂 Roast my excuses',
    );
    expect(
      suggestFollowUps({ ...base, roastOptIn: true, userText: 'procrastinating again' }),
    ).toContain('😂 Roast my excuses');
  });

  it('uses game chips inside games and support chips in serious moments', () => {
    expect(suggestFollowUps({ ...base, mode: 'joke_battle', userText: 'x' })).toContain(
      '🎤 My joke is ready',
    );
    expect(suggestFollowUps({ ...base, serious: true, userText: 'x' })).toContain(
      '📞 Support resources',
    );
  });
});
