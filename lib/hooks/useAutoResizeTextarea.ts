'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Resizing has to happen before paint or the box visibly jumps, but
 * useLayoutEffect is meaningless during SSR. Pick per environment.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Grow a textarea to fit its content, up to `maxHeight`, then scroll.
 *
 * Composers that stay at `rows={1}` show you one line of a five-line message —
 * you end up typing into a slot instead of at your text. Growing the box fixes
 * that; the cap keeps the composer from eating the conversation above it.
 *
 * Two details matter and are easy to get wrong:
 *
 * - Measuring means setting `height: auto`, which momentarily removes the
 *   overflow. We save and restore `scrollTop` around it so the measurement
 *   can't move the view out from under the caret.
 * - Once the box is capped it scrolls, and the caret can end up outside the
 *   visible band after a resize (deleting a line, pasting, restoring a draft).
 *   `keepCaretInView` pulls it back.
 *
 * Returns whether the content is taller than the cap, for callers that toggle
 * an overflow class themselves.
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight: number,
  { minHeight = 0 }: { minHeight?: number } = {}
): boolean {
  const [needsScroll, setNeedsScroll] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const previousScrollTop = el.scrollTop;

    el.style.height = 'auto';
    // scrollHeight covers padding but not border, and these fields are all
    // border-box — so a bordered composer set to scrollHeight comes up short
    // and jitters by a couple of pixels on every keystroke.
    const style = getComputedStyle(el);
    const border =
      parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0');
    const contentHeight = el.scrollHeight + (style.boxSizing === 'border-box' ? border : 0);
    const overflowing = contentHeight > maxHeight;

    el.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
    el.scrollTop = previousScrollTop;

    setNeedsScroll(overflowing);

    if (overflowing && document.activeElement === el) {
      keepCaretInView(el);
    }
  }, [ref, value, maxHeight, minHeight]);

  return needsScroll;
}

/**
 * Scroll a capped textarea so the caret's line sits inside the visible band.
 *
 * The caret's line is derived from the text before it rather than measured, so
 * this assumes a uniform line height — true for every composer here. Soft wraps
 * make that an underestimate, so we only ever scroll when the caret is provably
 * out of view, and we leave the browser's own scrolling alone otherwise.
 */
export function keepCaretInView(el: HTMLTextAreaElement) {
  const caret = el.selectionEnd;
  // A selection the user dragged is theirs to scroll; only follow a plain caret.
  if (caret !== el.selectionStart) return;

  const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

  const atEnd = caret === el.value.length;
  if (atEnd) {
    // The common case: typing at the end of a long message.
    el.scrollTop = el.scrollHeight;
    return;
  }

  const line = el.value.slice(0, caret).split('\n').length - 1;
  const caretTop = line * lineHeight;
  const caretBottom = caretTop + lineHeight;

  if (caretTop < el.scrollTop) {
    el.scrollTop = caretTop;
  } else if (caretBottom > el.scrollTop + el.clientHeight) {
    el.scrollTop = caretBottom - el.clientHeight;
  }
}
