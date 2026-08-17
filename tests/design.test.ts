import { describe, it, expect } from 'vitest';
import { PRODUCTS, POSTCARD_9X6, describeCanvas, getSide } from '../lib/design/products';
import { emptyBrief, mergeBrief, describeAssets, type DesignAsset } from '../lib/design/brief';
import { parsePlannerReply } from '../lib/design/parse';
import { markOthersStale, emptySide } from '../lib/design/session';

/** Ratios the Gemini image models accept, as width/height. */
const RATIOS: Record<string, number> = {
  '1:1': 1,
  '2:3': 2 / 3,
  '3:2': 3 / 2,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
};

describe('product canvas specs', () => {
  it('declares an aspect ratio that matches the trim exactly', () => {
    // A ratio that only *nearly* matches the trim silently loses a strip off one
    // edge of every design generated at that size, and nothing surfaces it —
    // the artwork just comes back cropped. This is the guard for adding a size.
    for (const spec of PRODUCTS) {
      const declared = RATIOS[spec.aspectRatio];
      expect(declared, `${spec.id} uses an unsupported ratio`).toBeDefined();
      expect(spec.widthIn / spec.heightIn).toBeCloseTo(declared, 5);
    }
  });

  it('keeps every reserved region inside the trim', () => {
    for (const spec of PRODUCTS) {
      for (const side of spec.sides) {
        for (const r of side.reservations) {
          expect(r.x, `${side.id}/${r.id} starts off the left edge`).toBeGreaterThanOrEqual(0);
          expect(r.y, `${side.id}/${r.id} starts off the top edge`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${side.id}/${r.id} runs off the right edge`).toBeLessThanOrEqual(1);
          expect(r.y + r.h, `${side.id}/${r.id} runs off the bottom edge`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('does not let the postal reservations overlap each other', () => {
    // Overlapping guides would draw a region the artwork can never satisfy.
    const back = getSide(POSTCARD_9X6, 'back')!;
    for (let i = 0; i < back.reservations.length; i++) {
      for (let j = i + 1; j < back.reservations.length; j++) {
        const a = back.reservations[i];
        const b = back.reservations[j];
        const overlaps =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('tells the image model where the address block goes, in words', () => {
    const back = getSide(POSTCARD_9X6, 'back')!;
    const text = describeCanvas(POSTCARD_9X6, back);
    // The model has no coordinate system, so position has to survive as prose.
    expect(text).toMatch(/bottom-right/);
    expect(text).toMatch(/9" wide × 6" tall/);
    expect(text).toMatch(/landscape/);
  });

  it('reserves nothing on the front', () => {
    const front = getSide(POSTCARD_9X6, 'front')!;
    expect(front.reservations).toHaveLength(0);
    expect(describeCanvas(POSTCARD_9X6, front)).not.toMatch(/RESERVED REGIONS/);
  });
});

describe('design brief accumulation', () => {
  it('overwrites a scalar when the user changes their mind', () => {
    const b = mergeBrief({ ...emptyBrief(), palette: 'forest green' }, { palette: 'navy' });
    expect(b.palette).toBe('navy');
  });

  it('accumulates list entries across turns instead of replacing them', () => {
    let b = mergeBrief(emptyBrief(), { mustInclude: ['555-0100'] });
    b = mergeBrief(b, { mustInclude: ['acme.com'] });
    expect(b.mustInclude).toEqual(['555-0100', 'acme.com']);
  });

  it('ignores a repeated list entry regardless of case', () => {
    let b = mergeBrief(emptyBrief(), { mustInclude: ['Acme.com'] });
    b = mergeBrief(b, { mustInclude: ['acme.com'] });
    expect(b.mustInclude).toHaveLength(1);
  });

  it('clears a list only on an explicit empty array', () => {
    const start = mergeBrief(emptyBrief(), { avoid: ['stock photos'] });
    expect(mergeBrief(start, {}).avoid).toEqual(['stock photos']);
    expect(mergeBrief(start, { avoid: [] }).avoid).toEqual([]);
  });

  it('leaves the brief untouched when there are no updates', () => {
    const start = mergeBrief(emptyBrief(), { business: 'Acme HVAC' });
    expect(mergeBrief(start, null)).toEqual(start);
  });
});

describe('asset instructions', () => {
  const asset = (role: DesignAsset['role']): DesignAsset => ({ id: 'a', url: 'u', role });

  it('forbids redrawing a supplied logo', () => {
    // Left alone, an image model treats a logo as inspiration and redraws it,
    // which makes the piece useless to the business whose logo it is.
    const text = describeAssets([asset('logo')]);
    expect(text).toMatch(/Reproduce it exactly/);
    expect(text).toMatch(/Do not redraw/);
  });

  it('tells the model to borrow the style of a reference but not its content', () => {
    const text = describeAssets([asset('inspiration')]);
    expect(text).toMatch(/STYLE REFERENCE/);
    expect(text).toMatch(/Do NOT copy its text, its logo/);
  });

  it('numbers images from the position they are supplied in', () => {
    const text = describeAssets([asset('logo'), asset('inspiration')]);
    expect(text).toMatch(/Attached image 1 is the BUSINESS LOGO/);
    expect(text).toMatch(/Attached image 2 is a STYLE REFERENCE/);
  });

  it('says nothing at all when nothing is attached', () => {
    expect(describeAssets([])).toBe('');
  });
});

describe('planner reply parsing', () => {
  it('reads a well-formed plan', () => {
    const r = parsePlannerReply(
      JSON.stringify({
        reply: 'Went deep green with cream type.',
        render: true,
        imagePrompt: 'A deep forest green postcard…',
        updates: { palette: 'forest green and cream' },
        chips: ['Photo-led instead', 'Bolder palette'],
      })
    );
    expect(r.render).toBe(true);
    expect(r.imagePrompt).toMatch(/deep forest green/);
    expect(r.updates?.palette).toBe('forest green and cream');
    expect(r.chips).toHaveLength(2);
  });

  it('will not report a render when there is no prompt to render', () => {
    const r = parsePlannerReply('{"reply":"Sure.","render":true}');
    expect(r.render).toBe(false);
  });

  it('honours an explicit refusal to render', () => {
    const r = parsePlannerReply('{"reply":"Green reads as trustworthy.","render":false,"imagePrompt":"x"}');
    expect(r.render).toBe(false);
  });

  it('never leaks JSON into the reply when the model prepends prose', () => {
    const r = parsePlannerReply(
      'Here you go.\n\n{"render":true,"imagePrompt":"A postcard","chips":[]}'
    );
    expect(r.reply).not.toMatch(/[{}]/);
    expect(r.reply).toBe('Here you go.');
    expect(r.render).toBe(true);
  });

  it('drops asset verdicts that carry no usable index', () => {
    const r = parsePlannerReply(
      '{"reply":"ok","assets":[{"index":1,"role":"logo"},{"role":"photo"},{"index":0,"role":"photo"}]}'
    );
    expect(r.assets).toEqual([{ index: 1, role: 'logo', note: undefined }]);
  });

  it('falls back to photo for a role it does not recognise', () => {
    const r = parsePlannerReply('{"reply":"ok","assets":[{"index":1,"role":"mascot"}]}');
    expect(r.assets[0].role).toBe('photo');
  });

  it('survives a response that is not JSON at all', () => {
    const r = parsePlannerReply('The model just talked instead.');
    expect(r.reply).toBe('The model just talked instead.');
    expect(r.render).toBe(false);
    expect(r.assets).toEqual([]);
  });
});

describe('keeping the two sides in step', () => {
  it('marks the other side out of date once this one is re-rendered', () => {
    const sides = {
      front: { url: 'front.png', imagePrompt: null, stale: false },
      back: { url: 'back.png', imagePrompt: null, stale: false },
    };
    const next = markOthersStale(sides, 'front');
    expect(next.front.stale).toBe(false);
    expect(next.back.stale).toBe(true);
  });

  it('does not mark a side that was never designed', () => {
    const sides = { front: { url: 'front.png', imagePrompt: null, stale: false }, back: emptySide() };
    expect(markOthersStale(sides, 'front').back.stale).toBe(false);
  });
});
