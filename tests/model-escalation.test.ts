import { describe, it, expect } from 'vitest';
import { createGoogleProvider } from '@/lib/ai/providers/google';
import { createOpenAIProvider } from '@/lib/ai/providers/openai';

/**
 * A truncated shroom run retries on a roomier model. The ladder therefore has to
 * climb and, more importantly, has to stop climbing — an escalation chain with no
 * top is a retry loop that bills real money.
 */
describe('model escalation ladder', () => {
  const escalateFrom = (model: string) =>
    createGoogleProvider('test-key', model).escalate?.()?.model ?? null;

  it('exposes the model it will actually call', () => {
    expect(createGoogleProvider('test-key', 'gemini-3.6-flash').model).toBe('gemini-3.6-flash');
  });

  it('steps a lite model up to flash', () => {
    expect(escalateFrom('gemini-3.5-flash-lite')).toBe('gemini-3.7-flash');
    expect(escalateFrom('gemini-2.5-flash-lite')).toBe('gemini-3.7-flash');
  });

  it('steps a flash model up to pro', () => {
    expect(escalateFrom('gemini-2.5-flash')).toBe('gemini-3.1-pro-preview');
    expect(escalateFrom('gemini-3.7-flash')).toBe('gemini-3.1-pro-preview');
  });

  it('stops at the top instead of escalating forever', () => {
    expect(escalateFrom('gemini-3.1-pro-preview')).toBeNull();
  });

  it('terminates from any starting model within a few steps', () => {
    for (const start of [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'something-unrecognised',
    ]) {
      let current = createGoogleProvider('test-key', start);
      let hops = 0;
      while (hops < 10) {
        const next = current.escalate?.();
        if (!next) break;
        current = next;
        hops++;
      }
      expect(hops).toBeLessThan(10);
      expect(current.model).toBe('gemini-3.1-pro-preview');
    }
  });

  it('leaves OpenAI without an escalation path, so callers report the truncation', () => {
    expect(createOpenAIProvider('test-key', 'gpt-4o').escalate).toBeUndefined();
  });
});
