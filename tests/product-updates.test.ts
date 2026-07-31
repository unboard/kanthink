import { describe, it, expect } from 'vitest';
import {
  PRODUCT_UPDATES,
  buildProductUpdateContext,
  unseenProductUpdates,
} from '@/lib/productUpdates';

describe('product updates reach Kan', () => {
  it('puts recent updates in the prompt with their titles', () => {
    const ctx = buildProductUpdateContext();
    expect(ctx).toContain('RECENT KANTHINK UPDATES');
    for (const update of PRODUCT_UPDATES.slice(0, 8)) {
      expect(ctx).toContain(update.title);
    }
  });

  it('tells Kan it may be asked, and how to answer', () => {
    const ctx = buildProductUpdateContext();
    expect(ctx).toMatch(/what'?s new/i);
    // Must not bluff about changes it has no record of.
    expect(ctx).toMatch(/don'?t have it in your notes|not exhaustive/i);
    expect(ctx).toContain('/system-log');
  });

  it('caps how much rides along on every turn', () => {
    const two = buildProductUpdateContext(2);
    expect(two).toContain(PRODUCT_UPDATES[0].title);
    expect(two).not.toContain(PRODUCT_UPDATES[2].title);
  });

  it('returns nothing when there is nothing to report', () => {
    expect(buildProductUpdateContext(0)).toBe('');
  });

  it('leaves the existing unseen-marker behaviour alone', () => {
    expect(unseenProductUpdates(null)).toHaveLength(PRODUCT_UPDATES.length);
    expect(unseenProductUpdates(PRODUCT_UPDATES[0].id)).toHaveLength(0);
    expect(unseenProductUpdates('no-such-id')).toHaveLength(0);
  });

  it('keeps entry ids unique, since the seen marker is stored against them', () => {
    const ids = PRODUCT_UPDATES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
