import { describe, expect, it } from 'vitest';
import { checkIn, REFILL_MS, straysFor } from '@/components/kan/freeway/rescue';
import type { FreewayDay } from '@/lib/kanwatch/freeway';

const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}` })) as FreewayDay[];

describe('freeway cat rescue', () => {
  it('has a stray by most days, in lots of different coats', () => {
    const list = straysFor(days, []);
    expect(list.length).toBeGreaterThanOrEqual(20);
    expect(new Set(list.map((s) => s.coat)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
  });

  it('never runs out: a new stray turns up where one was rescued, a few hours later', () => {
    const now = Date.UTC(2026, 10, 8);
    const first = straysFor(days, [], now);
    const rescued = first.map((s) => checkIn(s, now));
    expect(straysFor(days, rescued, now + 60_000)).toHaveLength(0);
    const later = straysFor(days, rescued, now + REFILL_MS + 1);
    expect(later).toHaveLength(first.length);
    for (const s of later) expect(rescued.some((c) => c.id === s.id)).toBe(false);
    // And again after those are rescued too.
    const again = straysFor(days, [...rescued, ...later.map((s) => checkIn(s, now + REFILL_MS + 1))], now + 2 * REFILL_MS + 2);
    expect(again).toHaveLength(first.length);
  });
});
