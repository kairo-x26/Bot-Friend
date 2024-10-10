import { describe, expect, it } from 'vitest';
import {
  createSessionRequestSchema,
  sendMessageSchema,
  updatePreferencesSchema,
  MAX_MESSAGE_LENGTH,
} from '../src/index.js';

describe('sendMessageSchema', () => {
  it('trims and rejects whitespace-only messages', () => {
    expect(sendMessageSchema.safeParse({ content: '   ', idempotencyKey: 'abcdefgh' }).success).toBe(false);
    expect(sendMessageSchema.parse({ content: '  hey ', idempotencyKey: 'abcdefgh' }).content).toBe('hey');
  });
  it('enforces max length', () => {
    const content = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(sendMessageSchema.safeParse({ content, idempotencyKey: 'abcdefgh' }).success).toBe(false);
  });
  it('requires an idempotency key', () => {
    expect(sendMessageSchema.safeParse({ content: 'hi' }).success).toBe(false);
  });
});

describe('createSessionRequestSchema', () => {
  it('discriminates on provider', () => {
    expect(createSessionRequestSchema.safeParse({ provider: 'guest', ageConfirmed: true }).success).toBe(true);
    expect(createSessionRequestSchema.safeParse({ provider: 'apple', ageConfirmed: true }).success).toBe(false);
    expect(createSessionRequestSchema.safeParse({ provider: 'facebook', ageConfirmed: true }).success).toBe(false);
  });
});

describe('updatePreferencesSchema', () => {
  it('rejects empty patches and unknown styles', () => {
    expect(updatePreferencesSchema.safeParse({}).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ comedyStyle: 'mean' }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ comedyStyle: 'chill' }).success).toBe(true);
  });
});
