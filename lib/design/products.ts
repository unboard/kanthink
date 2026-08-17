/**
 * Product canvas specs.
 *
 * A print product is not an aspect ratio. It is a trim size, a bleed, a safe
 * margin, and a set of regions that artwork is not allowed to occupy — the hole
 * punched through the top of a door hanger, the address panel the Post Office
 * reserves on the back of a postcard. Those regions are the difference between a
 * design and a design that can actually be printed and mailed.
 *
 * Everything here is expressed twice on purpose:
 *   - as geometry (fractions of trim), so the canvas can draw the guides
 *   - as instruction prose, so the image model can be told to honour them
 *
 * They must describe the same thing. If you move a reservation, move both.
 */

/** Aspect ratios the Gemini image models accept. Anything else has to be cropped. */
export type SupportedAspectRatio =
  | '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';

/**
 * A region of a side that artwork must leave usable. Coordinates are fractions
 * of the trim size with the origin at the top-left, so they scale to any
 * preview size without knowing the pixel dimensions.
 */
export interface Reservation {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** How the image model is told to treat this region. */
  instruction: string;
}

export interface SideSpec {
  id: string;
  label: string;
  /** What this side is for, in the language of the person buying the print. */
  role: string;
  /** Art direction that applies to this side regardless of what the user asked for. */
  direction: string;
  reservations: Reservation[];
}

export interface ProductSpec {
  id: string;
  label: string;
  /** Trim size in inches. */
  widthIn: number;
  heightIn: number;
  aspectRatio: SupportedAspectRatio;
  /** Printer's bleed beyond trim, per edge. */
  bleedIn: number;
  /** Keep-clear margin inside trim for anything that must not be cut off. */
  safeIn: number;
  sides: SideSpec[];
}

// ------------------------------------------------------------ 9" × 6" postcard

/**
 * The standard 6" × 9" mailing postcard, landscape.
 *
 * 9:6 reduces to exactly 3:2, so this trims with no cropping at all — worth
 * checking whenever a size is added, because a ratio that only *nearly* matches
 * silently loses a strip off one edge of every design.
 *
 * Address-side geometry follows USPS addressed-mail layout: indicia top-right,
 * return address top-left, and a lower-right block holding both the delivery
 * address and the barcode clear zone beneath it.
 */
export const POSTCARD_9X6: ProductSpec = {
  id: 'postcard-9x6',
  label: '9" × 6" Postcard',
  widthIn: 9,
  heightIn: 6,
  aspectRatio: '3:2',
  bleedIn: 0.125,
  safeIn: 0.25,
  sides: [
    {
      id: 'front',
      label: 'Front',
      role:
        'The side that has to earn three seconds at the mailbox. It carries the hook — the offer, the image, the reason not to bin it.',
      direction: [
        'One dominant idea. A single headline that reads at arm\'s length, one supporting line at most, and one clear call to action.',
        'Do not crowd it. Empty space is what makes the headline land.',
        'No address block, no postage, no fine print on this side — all of that lives on the back.',
      ].join(' '),
      reservations: [],
    },
    {
      id: 'back',
      label: 'Back',
      role:
        'The address side. It has to carry the detail — what the offer actually is, how to respond, who you are — while leaving the postal regions completely clear.',
      direction: [
        'Content lives on the LEFT half. The right half belongs to the Post Office.',
        'This is where detail goes: what the offer includes, terms, hours, phone, website, address.',
        'It must read as the same piece as the front — same palette, same type family, same logo treatment — without repeating the front\'s headline or layout.',
      ].join(' '),
      reservations: [
        {
          id: 'indicia',
          label: 'Postage',
          // 1.5" × 0.75", 0.25" in from the top-right corner.
          x: (9 - 0.25 - 1.5) / 9,
          y: 0.25 / 6,
          w: 1.5 / 9,
          h: 0.75 / 6,
          instruction:
            'the top-right corner must be completely empty — white or a very light flat tint, no artwork, no text. Postage or an indicia is stamped here.',
        },
        {
          id: 'return-address',
          label: 'Return address',
          // 3" × 0.75", 0.25" in from the top-left corner.
          x: 0.25 / 9,
          y: 0.25 / 6,
          w: 3 / 9,
          h: 0.75 / 6,
          instruction:
            'the top-left corner holds the sender\'s return address in small plain text, and must sit on a light background so it stays legible.',
        },
        {
          id: 'address-block',
          label: 'Delivery address + barcode',
          // 4" wide, 2.5" tall, sitting on the bottom-right with a 0.375" margin.
          x: (9 - 0.375 - 4) / 9,
          y: (6 - 0.375 - 2.5) / 6,
          w: 4 / 9,
          h: 2.5 / 6,
          instruction:
            'the lower-right quadrant is the delivery address and barcode zone. It must be entirely clear — plain white or the palest tint in the palette, with no photography, no dark fill, no pattern, no text and no graphic elements crossing into it. Mail is rejected when this area is not scannable.',
        },
      ],
    },
  ],
};

export const PRODUCTS: ProductSpec[] = [POSTCARD_9X6];

export function getProduct(id: string): ProductSpec | null {
  return PRODUCTS.find((p) => p.id === id) ?? null;
}

export function getSide(spec: ProductSpec, sideId: string): SideSpec | null {
  return spec.sides.find((s) => s.id === sideId) ?? null;
}

/**
 * The physical constraints of one side, written for an image model.
 *
 * Kept separate from the creative brief because these are the parts that are
 * never up for negotiation — the user can change their mind about the palette,
 * not about where the barcode goes.
 */
export function describeCanvas(spec: ProductSpec, side: SideSpec): string {
  const lines: string[] = [
    `PRODUCT: ${spec.label}, ${side.label.toLowerCase()} side.`,
    `TRIM: ${spec.widthIn}" wide × ${spec.heightIn}" tall (${spec.aspectRatio}), ${
      spec.widthIn > spec.heightIn ? 'landscape' : 'portrait'
    }. This is a physical printed piece, so render it as flat print-ready artwork filling the entire frame edge to edge — not a mockup, not a photograph of a postcard, no drop shadow, no perspective, no desk or hand holding it, no border or margin around the artwork.`,
    `SAFE MARGIN: keep every piece of text and the logo at least ${spec.safeIn}" in from all four edges. Backgrounds and photography should run right off the edge; text must not.`,
    `THIS SIDE IS FOR: ${side.role}`,
    `ART DIRECTION FOR THIS SIDE: ${side.direction}`,
  ];

  if (side.reservations.length > 0) {
    lines.push(
      'RESERVED REGIONS — these are hard requirements, not suggestions:',
      ...side.reservations.map(
        (r) =>
          `- ${r.label}: ${r.instruction} (${describePosition(r)}, roughly ${round(
            r.w * spec.widthIn
          )}" × ${round(r.h * spec.heightIn)}")`
      )
    );
  }

  return lines.join('\n');
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Reservations are given to the model positionally — it has no coordinate system. */
function describePosition(r: Reservation): string {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const vertical = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
  const horizontal = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'center';
  return vertical === 'middle' && horizontal === 'center' ? 'center' : `${vertical}-${horizontal}`;
}
