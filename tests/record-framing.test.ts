import { describe, it, expect } from 'vitest';
import { focusForAnchoredZoom, surfacePlacement } from '@/lib/record/compositor';
import type { ScreenView } from '@/lib/record/types';

const view = (over: Partial<ScreenView> = {}): ScreenView => ({
  zoom: 1, x: 0.5, y: 0.5, fit: 'cover', ...over,
});

// A 16:9 window being recorded into a 9:16 frame — the case that used to produce
// bars down both sides and is the whole reason cropping exists.
const WIDE = { w: 1920, h: 1080 };
const TALL_FRAME = { x: 0, y: 0, w: 1080, h: 1920 };

describe('surfacePlacement — cover', () => {
  it('fills the frame completely, cropping the overflow', () => {
    const p = surfacePlacement(WIDE.w, WIDE.h, TALL_FRAME, view());
    // No gap on any edge: this is what "no bars" means.
    expect(p.dw).toBeGreaterThanOrEqual(TALL_FRAME.w);
    expect(p.dh).toBeGreaterThanOrEqual(TALL_FRAME.h);
    expect(p.dx).toBeLessThanOrEqual(0);
    expect(p.dy).toBeLessThanOrEqual(0);
  });

  it('preserves the source shape while cropping', () => {
    const p = surfacePlacement(WIDE.w, WIDE.h, TALL_FRAME, view());
    expect(p.dw / p.dh).toBeCloseTo(WIDE.w / WIDE.h, 4);
  });
});

describe('surfacePlacement — contain', () => {
  it('fits the whole source inside, leaving bars', () => {
    const p = surfacePlacement(WIDE.w, WIDE.h, TALL_FRAME, view({ fit: 'contain' }));
    expect(p.dw).toBeLessThanOrEqual(TALL_FRAME.w + 0.001);
    expect(p.dh).toBeLessThanOrEqual(TALL_FRAME.h + 0.001);
    // Letterboxed: centred vertically with space above and below.
    expect(p.dy).toBeGreaterThan(0);
  });
});

describe('surfacePlacement — zoom and focus', () => {
  const SQUARE_FRAME = { x: 0, y: 0, w: 1000, h: 1000 };

  it('scales the drawn image by the zoom factor', () => {
    const at1 = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 1 }));
    const at2 = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 2 }));
    expect(at2.dw / at1.dw).toBeCloseTo(2, 4);
  });

  it('centres the focal point in the frame when there is room to pan', () => {
    // Focus a quarter of the way across, zoomed enough that panning is possible.
    const p = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 4, x: 0.25, y: 0.25 }));
    const focusX = p.dx + 0.25 * p.dw;
    const focusY = p.dy + 0.25 * p.dh;
    expect(focusX).toBeCloseTo(SQUARE_FRAME.w / 2, 4);
    expect(focusY).toBeCloseTo(SQUARE_FRAME.h / 2, 4);
  });

  it('never pans past an edge into empty space', () => {
    // Focus hard into the top-left corner: naive maths would leave a gap.
    const p = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 2, x: 0, y: 0 }));
    expect(p.dx).toBeLessThanOrEqual(0);
    expect(p.dy).toBeLessThanOrEqual(0);
    expect(p.dx + p.dw).toBeGreaterThanOrEqual(SQUARE_FRAME.w);
    expect(p.dy + p.dh).toBeGreaterThanOrEqual(SQUARE_FRAME.h);
  });

  it('clamps the bottom-right corner too', () => {
    const p = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 2, x: 1, y: 1 }));
    expect(p.dx + p.dw).toBeGreaterThanOrEqual(SQUARE_FRAME.w);
    expect(p.dy + p.dh).toBeGreaterThanOrEqual(SQUARE_FRAME.h);
  });

  it('ignores zoom below 1 rather than shrinking away from the frame', () => {
    const at1 = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 1 }));
    const under = surfacePlacement(1000, 1000, SQUARE_FRAME, view({ zoom: 0.2 }));
    expect(under.dw).toBeCloseTo(at1.dw, 4);
  });

  it('centres a contained image instead of clamping it to an edge', () => {
    // Smaller than the frame in one axis, so the clamp must not apply there.
    const p = surfacePlacement(1920, 1080, { x: 0, y: 0, w: 1000, h: 1000 }, view({ fit: 'contain', x: 0, y: 0 }));
    expect(p.dy).toBeCloseTo((1000 - p.dh) / 2, 4);
  });
});

/**
 * Wheel-zoom anchors on the cursor: whatever pixel you are pointing at must stay
 * under the pointer as the zoom changes, or the thing you're trying to zoom into
 * slides out from under you.
 */
describe('focusForAnchoredZoom', () => {
  const FRAME = { x: 0, y: 0, w: 1000, h: 1000 };
  const SRC = { w: 1000, h: 1000 };

  /** Where a source point is drawn, in frame coordinates. */
  const screenPos = (v: ScreenView, s: { x: number; y: number }) => {
    const p = surfacePlacement(SRC.w, SRC.h, FRAME, v);
    return { x: p.dx + s.x * p.dw, y: p.dy + s.y * p.dh };
  };

  it('holds the anchored point under the cursor while zooming in', () => {
    const from = view({ zoom: 1.5 });
    // Cursor somewhere off-centre, and the source point currently beneath it.
    const cursor = { x: 300, y: 700 };
    const p = surfacePlacement(SRC.w, SRC.h, FRAME, from);
    const anchor = { x: (cursor.x - p.dx) / p.dw, y: (cursor.y - p.dy) / p.dh };

    const focus = focusForAnchoredZoom(SRC.w, SRC.h, FRAME, from.fit, 3, anchor, cursor);
    const after = screenPos(view({ zoom: 3, ...focus }), anchor);

    expect(after.x).toBeCloseTo(cursor.x, 3);
    expect(after.y).toBeCloseTo(cursor.y, 3);
  });

  it('holds the anchored point while zooming back out', () => {
    const from = view({ zoom: 3.5, x: 0.3, y: 0.6 });
    const cursor = { x: 640, y: 220 };
    const p = surfacePlacement(SRC.w, SRC.h, FRAME, from);
    const anchor = { x: (cursor.x - p.dx) / p.dw, y: (cursor.y - p.dy) / p.dh };

    const focus = focusForAnchoredZoom(SRC.w, SRC.h, FRAME, from.fit, 2, anchor, cursor);
    const after = screenPos(view({ zoom: 2, ...focus }), anchor);

    expect(after.x).toBeCloseTo(cursor.x, 3);
    expect(after.y).toBeCloseTo(cursor.y, 3);
  });

  it('keeps the focus a valid 0..1 point even anchored at a corner', () => {
    const focus = focusForAnchoredZoom(
      SRC.w, SRC.h, FRAME, 'cover', 4, { x: 0, y: 0 }, { x: 0, y: 0 }
    );
    expect(focus.x).toBeGreaterThanOrEqual(0);
    expect(focus.x).toBeLessThanOrEqual(1);
    expect(focus.y).toBeGreaterThanOrEqual(0);
    expect(focus.y).toBeLessThanOrEqual(1);
  });

  it('never lets zoom below 1 pull the surface off the frame edges', () => {
    // Guards the "no zooming out past full screen" rule at the maths level: a
    // sub-1 zoom is treated as 1, so the frame stays covered.
    const focus = focusForAnchoredZoom(
      SRC.w, SRC.h, FRAME, 'cover', 0.25, { x: 0.5, y: 0.5 }, { x: 500, y: 500 }
    );
    const p = surfacePlacement(SRC.w, SRC.h, FRAME, view({ zoom: 0.25, ...focus }));
    expect(p.dx).toBeLessThanOrEqual(0);
    expect(p.dy).toBeLessThanOrEqual(0);
    expect(p.dx + p.dw).toBeGreaterThanOrEqual(FRAME.w);
    expect(p.dy + p.dh).toBeGreaterThanOrEqual(FRAME.h);
  });
});
