import { describe, it, expect } from 'vitest';
import { ASPECT_DIMS, aspectLabel, autoDims } from '@/lib/record/types';

/**
 * 'auto' aspect sizes the recording canvas to the shape of the shared window, so
 * a phone-shaped window records phone-shaped with no bars. Two constraints make
 * this more than a passthrough: h264 needs even dimensions on both axes, and a
 * small window must not be blown up into a soft 1080p.
 */
describe('autoDims', () => {
  it('keeps a window smaller than the cap at its own size', () => {
    // A hand-sized mobile window: recording it at 1080p would only add softness.
    // 915 rounds up to 916 for the even-dimension rule below.
    expect(autoDims(412, 915)).toEqual({ width: 412, height: 916 });
  });

  it('never returns an odd dimension', () => {
    // h264 chroma subsampling requires even width and height; odd values make
    // encoders fail or silently pad.
    for (const [w, h] of [[413, 915], [1001, 777], [375, 667], [999, 1]] as const) {
      const d = autoDims(w, h);
      expect(d.width % 2).toBe(0);
      expect(d.height % 2).toBe(0);
    }
  });

  it('scales an oversized surface down to the 1920 long edge', () => {
    const d = autoDims(3840, 2160);
    expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(1920);
    // Shape is preserved through the scale.
    expect(d.width / d.height).toBeCloseTo(3840 / 2160, 2);
  });

  it('scales a tall surface by its long edge, not its width', () => {
    const d = autoDims(1440, 3200);
    expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(1920);
    expect(d.width / d.height).toBeCloseTo(1440 / 3200, 2);
  });

  it('falls back to 16:9 rather than producing a zero-sized canvas', () => {
    // A track can report 0x0 before the first frame arrives.
    expect(autoDims(0, 0)).toEqual(ASPECT_DIMS['16:9']);
    expect(autoDims(-5, 100)).toEqual(ASPECT_DIMS['16:9']);
    expect(autoDims(Number.NaN, 100)).toEqual(ASPECT_DIMS['16:9']);
  });
});

/**
 * The published row stores a concrete "w:h" label — the gallery parses it to lay
 * out the card, and 'auto' would leave it with no shape to use.
 */
describe('aspectLabel', () => {
  it('reduces to lowest terms', () => {
    expect(aspectLabel({ width: 1920, height: 1080 })).toBe('16:9');
    expect(aspectLabel({ width: 1080, height: 1920 })).toBe('9:16');
    expect(aspectLabel({ width: 1440, height: 1440 })).toBe('1:1');
  });

  it('always matches the shape the gallery parses', () => {
    // RecordGallery accepts /^\d+:\d+$/ and ignores anything else.
    for (const [w, h] of [[412, 916], [1234, 778], [1920, 1080]] as const) {
      expect(aspectLabel({ width: w, height: h })).toMatch(/^\d+:\d+$/);
    }
  });
});
