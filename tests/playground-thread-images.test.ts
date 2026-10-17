import { describe, it, expect } from 'vitest';
import { cleanThread, dedupeThreadImages } from '@/lib/playground/thread';

describe('playground thread images', () => {
  it('keeps each picture on its first message only', () => {
    const thread = dedupeThreadImages([
      { id: 'a', imageUrls: ['x'] },
      { id: 'b', imageUrls: ['x', 'y'] },
      { id: 'c', imageUrls: ['x', 'y'] },
    ]);
    expect(thread.map((m) => m.imageUrls)).toEqual([['x'], ['y'], undefined]);
  });

  it('leaves a thread without repeats untouched', () => {
    const thread = [{ id: 'a', imageUrls: ['x'] }, { id: 'b' }, { id: 'c', imageUrls: ['y'] }];
    const cleaned = dedupeThreadImages(thread);
    cleaned.forEach((m, i) => expect(m).toBe(thread[i]));
  });

  it('also drops optimistic placeholders', () => {
    const cleaned = cleanThread<{ id: string; imageUrls?: string[] }>([
      { id: '__optimistic_1', imageUrls: ['x'] },
      { id: 'a', imageUrls: ['x'] },
    ]);
    expect(cleaned).toEqual([{ id: 'a', imageUrls: ['x'] }]);
  });
});
