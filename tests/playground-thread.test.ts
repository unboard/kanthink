import { describe, it, expect } from 'vitest';
import { stripOptimistic, isOptimisticId, OPTIMISTIC_ID_PREFIX } from '@/lib/playground/thread';

/**
 * Regression: user messages rendered twice in the playground thread.
 *
 * The client renders the user's message optimistically, and the store's updateCard
 * syncs every change — so the placeholder was persisted. The generate route then read
 * that thread and appended its own copy of the same prompt. Kan's replies were written
 * once and rendered once; the user's were written twice.
 */
describe('stripOptimistic', () => {
  const optimistic = (content: string) => ({ id: `${OPTIMISTIC_ID_PREFIX}abc123`, content });
  const real = (id: string, content: string) => ({ id, content });

  it('removes an optimistic placeholder', () => {
    const thread = [real('m1', 'hi'), optimistic('Build it')];
    expect(stripOptimistic(thread)).toEqual([real('m1', 'hi')]);
  });

  it('keeps every confirmed message', () => {
    const thread = [real('m1', 'a'), real('m2', 'b'), real('m3', 'c')];
    expect(stripOptimistic(thread)).toHaveLength(3);
  });

  it('prevents the duplicate the bug produced', () => {
    // What the DB looked like mid-bug: the client's placeholder had been synced, and
    // the route was about to append its own copy of the same prompt.
    const stored = [
      real('m1', 'Kan: created the prototype'),
      optimistic('Build it'),
    ];
    const rebuilt = [...stripOptimistic(stored), real('m2', 'Build it')];
    const buildIts = rebuilt.filter(m => m.content === 'Build it');
    expect(buildIts).toHaveLength(1);
  });

  it('heals a thread that already contains duplicates', () => {
    // No migration needed — existing damage clears on the next generation.
    const damaged = [optimistic('Build it'), real('m2', 'Build it'), optimistic('again')];
    expect(stripOptimistic(damaged)).toEqual([real('m2', 'Build it')]);
  });

  it('tolerates junk instead of an array', () => {
    expect(stripOptimistic(null)).toEqual([]);
    expect(stripOptimistic(undefined)).toEqual([]);
    expect(stripOptimistic('nope')).toEqual([]);
    expect(stripOptimistic({})).toEqual([]);
  });

  it('tolerates messages with no id', () => {
    const thread = [{ content: 'no id here' }, optimistic('x')];
    expect(stripOptimistic(thread)).toEqual([{ content: 'no id here' }]);
  });
});

describe('isOptimisticId', () => {
  it('matches only the placeholder prefix', () => {
    expect(isOptimisticId(`${OPTIMISTIC_ID_PREFIX}xyz`)).toBe(true);
    expect(isOptimisticId('optimistic_xyz')).toBe(false);
    expect(isOptimisticId('m1')).toBe(false);
    expect(isOptimisticId(undefined)).toBe(false);
    expect(isOptimisticId(42)).toBe(false);
  });
});
