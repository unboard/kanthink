import { describe, it, expect } from 'vitest';
import { keepCaretInView } from '@/lib/hooks/useAutoResizeTextarea';

/**
 * A capped composer scrolls, and a resize can leave the caret outside the
 * visible band — you end up typing somewhere you can't see. This is the
 * arithmetic that pulls it back.
 */

const LINE = 26;

function fakeTextarea({
  value,
  caret,
  scrollTop,
  clientHeight = LINE * 5,
  selectionStart = caret,
}: {
  value: string;
  caret: number;
  scrollTop: number;
  clientHeight?: number;
  selectionStart?: number;
}) {
  const lines = value.split('\n').length;
  return {
    value,
    selectionStart,
    selectionEnd: caret,
    scrollTop,
    clientHeight,
    scrollHeight: Math.max(lines * LINE, clientHeight),
    ownerDocument: { defaultView: null },
  } as unknown as HTMLTextAreaElement;
}

// getComputedStyle is a DOM global; the test env is node, so stand one in.
(globalThis as unknown as { getComputedStyle: () => { lineHeight: string } }).getComputedStyle =
  () => ({ lineHeight: `${LINE}px` });

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('keepCaretInView', () => {
  it('follows the caret to the bottom when typing at the end', () => {
    const text = lines(12);
    const el = fakeTextarea({ value: text, caret: text.length, scrollTop: 0 });
    keepCaretInView(el);
    // Pinned to the bottom, which is where the caret is.
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  it('scrolls up when the caret sits above the visible band', () => {
    const text = lines(12);
    // Caret on line 2, but the view is showing lines 8-12.
    const caret = text.indexOf('line 2');
    const el = fakeTextarea({ value: text, caret, scrollTop: 7 * LINE });
    keepCaretInView(el);
    expect(el.scrollTop).toBe(LINE); // top of line 2
  });

  it('scrolls down when the caret sits below the visible band', () => {
    const text = lines(12);
    const caret = text.indexOf('line 9');
    const el = fakeTextarea({ value: text, caret, scrollTop: 0 });
    keepCaretInView(el);
    // Line 9 (index 8) ends at 9 lines; band is 5 lines tall.
    expect(el.scrollTop).toBe(9 * LINE - 5 * LINE);
  });

  it('leaves the view alone when the caret is already visible', () => {
    const text = lines(12);
    const caret = text.indexOf('line 4');
    const el = fakeTextarea({ value: text, caret, scrollTop: 2 * LINE });
    keepCaretInView(el);
    expect(el.scrollTop).toBe(2 * LINE);
  });

  it('does not fight a dragged selection', () => {
    const text = lines(12);
    const el = fakeTextarea({
      value: text,
      caret: text.length,
      selectionStart: 0,
      scrollTop: 3 * LINE,
    });
    keepCaretInView(el);
    expect(el.scrollTop).toBe(3 * LINE);
  });
});
