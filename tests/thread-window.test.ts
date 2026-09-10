import { describe, it, expect } from 'vitest';
import {
  THREAD_WINDOW,
  IMAGE_WINDOW,
  THREAD_TRANSPORT_CAP,
  threadWindowIsSound,
  imageWindowStart,
} from '@/lib/ai/threadWindow';

/**
 * The bug this guards: the card drawer trimmed the thread to ten before sending it, and
 * the route trimmed what arrived to ten again. Both looked reasonable alone. Together
 * they meant a card could display an instruction from earlier in its own thread that Kan
 * had never been shown.
 */
describe('thread window', () => {
  it('keeps the transport cap above the context window', () => {
    expect(THREAD_TRANSPORT_CAP).toBeGreaterThan(THREAD_WINDOW);
    expect(threadWindowIsSound()).toBe(true);
  });

  it('is long enough to hold a real conversation', () => {
    // Ten messages is about two exchanges plus a couple of notes.
    expect(THREAD_WINDOW).toBeGreaterThanOrEqual(30);
  });

  it('inlines images from the recent end only', () => {
    expect(imageWindowStart(THREAD_WINDOW)).toBe(THREAD_WINDOW - IMAGE_WINDOW);
  });

  it('inlines every image on a short thread', () => {
    expect(imageWindowStart(3)).toBe(0);
    expect(imageWindowStart(0)).toBe(0);
  });
});
