/**
 * A shroom's face.
 *
 * Four axes — cap, stem, colour, pattern — so a channel's shrooms can each be a
 * different creature without anyone drawing one. Flat colour throughout: no
 * gradients, no shadows, no shading. The shapes carry it.
 *
 * Nothing has one chosen, and asking people to pick before the row is useful would
 * be a poor trade, so an avatar is *derived* from the shroom's id unless one was
 * set: stable, well spread, and different for every shroom in a channel with nobody
 * doing anything. Picking one later just overrides it.
 *
 * Everything is drawn in a 48×48 box with the shroom centred on x=24, the cap
 * bottoming out around y=27 and the stem running to y=42.
 */

export const CAP_SHAPES = [
  'dome', 'flat', 'cone', 'wavy', 'funnel', 'button', 'bell', 'tilted',
] as const;
export type CapShape = (typeof CAP_SHAPES)[number];

export const STEM_SHAPES = [
  'taper', 'wide', 'bulb', 'straight', 'flared', 'double', 'ringed', 'squat', 'bent',
] as const;
export type StemShape = (typeof STEM_SHAPES)[number];

export const PATTERNS = [
  'plain', 'dots', 'speckle', 'wave', 'stripes', 'sprinkles', 'stars', 'hearts', 'cow', 'leopard',
] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface ShroomPalette {
  key: string;
  name: string;
  cap: string;
  /**
   * The card behind the shroom: the same colour, deeper.
   *
   * A flat cap on a card of its own colour is an invisible cap — with no gradient
   * and no shadow there is nothing left to separate them. Two flat tones of one
   * colour keeps the card reading as the shroom's own without drawing anything the
   * reference doesn't have.
   */
  bg: string;
  /** Marking colour. Cream on everything, except where cream would vanish. */
  mark: string;
}

/** The cream every stem is drawn in, so a row of shrooms reads as one family. */
export const STEM_COLOR = '#F0E6D3';

export const PALETTE: ShroomPalette[] = [
  { key: 'red', name: 'Red', cap: '#E0392B', bg: '#A82418', mark: '#F6EFE2' },
  { key: 'orange', name: 'Orange', cap: '#F4812A', bg: '#B85C13', mark: '#F9F1E4' },
  { key: 'yellow', name: 'Yellow', cap: '#F2C13C', bg: '#B98D18', mark: '#FBF5E8' },
  { key: 'green', name: 'Green', cap: '#5C9B3D', bg: '#3B6B25', mark: '#F4F0E1' },
  { key: 'teal', name: 'Teal', cap: '#2A8A93', bg: '#175E65', mark: '#EFEDE0' },
  { key: 'blue', name: 'Blue', cap: '#3A6DBE', bg: '#22487F', mark: '#F1EFE4' },
  { key: 'purple', name: 'Purple', cap: '#8A5AC6', bg: '#5E3690', mark: '#F4EFE6' },
  { key: 'pink', name: 'Pink', cap: '#F28BAF', bg: '#C25E82', mark: '#FBF3E9' },
  { key: 'brown', name: 'Brown', cap: '#7B4A2C', bg: '#502E19', mark: '#EFE3CE' },
  { key: 'charcoal', name: 'Charcoal', cap: '#4A4641', bg: '#282623', mark: '#EDE6D8' },
  // Cream needs a darker marking, or the pattern disappears into the cap.
  { key: 'cream', name: 'Cream', cap: '#EFE6D6', bg: '#C9BB9F', mark: '#A6957A' },
];

export interface ShroomAvatarSpec {
  cap: CapShape;
  stem: StemShape;
  pattern: Pattern;
  color: string;
}

/** Stored as "cap:stem:pattern:colour" — one short string, no JSON to parse. */
export function serializeAvatar(a: ShroomAvatarSpec): string {
  return `${a.cap}:${a.stem}:${a.pattern}:${a.color}`;
}

/**
 * Parse a stored avatar, returning null for anything unrecognised.
 *
 * Also returns null for the older three-part format, which described a different
 * set of shapes — those shrooms fall back to a derived avatar rather than to a
 * best guess at what the old value meant.
 */
export function parseAvatar(raw: string | null | undefined): ShroomAvatarSpec | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split(':');
  if (parts.length !== 4) return null;
  const [cap, stem, pattern, color] = parts;
  if (!CAP_SHAPES.includes(cap as CapShape)) return null;
  if (!STEM_SHAPES.includes(stem as StemShape)) return null;
  if (!PATTERNS.includes(pattern as Pattern)) return null;
  if (!PALETTE.some((p) => p.key === color)) return null;
  return { cap: cap as CapShape, stem: stem as StemShape, pattern: pattern as Pattern, color };
}

/**
 * A stable 32-bit hash (FNV-1a).
 *
 * Short, no dependencies, and it spreads sequential ids — which matters because
 * nanoid ids created seconds apart should not come out looking related.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The avatar a shroom gets when nobody has chosen one.
 *
 * Four independent draws off one hash rather than four slices of it, so the axes
 * don't move together — two shrooms sharing a cap should still differ elsewhere.
 */
export function deriveAvatar(id: string): ShroomAvatarSpec {
  const h = hash(id);
  return {
    cap: CAP_SHAPES[h % CAP_SHAPES.length],
    color: PALETTE[Math.floor(h / 7) % PALETTE.length].key,
    stem: STEM_SHAPES[Math.floor(h / 53) % STEM_SHAPES.length],
    pattern: PATTERNS[Math.floor(h / 397) % PATTERNS.length],
  };
}

/** The avatar to draw: the chosen one, or the derived one. */
export function resolveAvatar(id: string, stored?: string | null): ShroomAvatarSpec {
  return parseAvatar(stored) ?? deriveAvatar(id);
}

/** The cap outline, in a 48×48 box. */
export function capPath(shape: CapShape): string {
  switch (shape) {
    case 'dome':
      return 'M5 25.5C5 13.6 13.4 6.5 24 6.5S43 13.6 43 25.5c0 1.4-1.1 2.2-3 2.2H8c-1.9 0-3-.8-3-2.2z';
    case 'flat':
      return 'M3 21.6C3 14.9 12.4 10.6 24 10.6s21 4.3 21 11c0 3.1-3 5.2-8.6 5.9H11.6C6 26.8 3 24.7 3 21.6z';
    case 'cone':
      return 'M24 3.6c0 0 6.4 8.6 11 19.4 1.3 3-.2 4.9-3.6 4.9H16.6c-3.4 0-4.9-1.9-3.6-4.9C17.6 12.2 24 3.6 24 3.6z';
    case 'wavy':
      return 'M9 21.8C9 11.9 15.2 5.8 24 5.8s15 6.1 15 16c0 3.3-2.3 3.8-4.4 5-2.1 1.2-3.7-1.6-5.9-.6-2.2 1-3 1.6-4.7 1.6s-2.5-.6-4.7-1.6c-2.2-1-3.8 1.8-5.9.6C11.3 25.6 9 25.1 9 21.8z';
    case 'funnel':
      return 'M4 12.4c0-2 4-3 20-3s20 1 20 3c0 0-5 8.6-12.5 14.1-2.5 1.8-5 2.3-7.5 2.3s-5-.5-7.5-2.3C9 21 4 12.4 4 12.4z';
    case 'button':
      return 'M10 24.8C10 15.9 16.3 9.8 24 9.8s14 6.1 14 15c0 1.8-1.6 2.5-3.5 2.5h-21c-1.9 0-3.5-.7-3.5-2.5z';
    case 'bell':
      return 'M12 25.8C12 11.9 16.6 5 24 5s12 6.9 12 20.8c0 1.4-1 1.9-2.8 1.9H14.8c-1.8 0-2.8-.5-2.8-1.9z';
    case 'tilted':
      // Deliberately lopsided — a cap that has slumped to one side.
      return 'M4.6 23.4C4.6 15 14 8.6 26.4 8.6c11 0 18.6 5.6 18.6 11.6 0 3.3-3.2 5.4-7.6 6L11.4 27.2c-4.6 0-6.8-1.4-6.8-3.8z';
  }
}

/** The stem outline, in the same 48×48 box. */
export function stemPath(shape: StemShape): string {
  switch (shape) {
    case 'taper':
      return 'M20.4 24h7.2l1.2 15.8c.1 1.6-.9 2.4-2.6 2.4h-4.4c-1.7 0-2.7-.8-2.6-2.4z';
    case 'wide':
      return 'M17.8 24h12.4l1.6 15.6c.2 1.7-1 2.6-3 2.6H19.2c-2 0-3.2-.9-3-2.6z';
    case 'bulb':
      return 'M21 24h6v8.6c4 1.2 5.4 4 5.4 6.3 0 2-2.2 3.3-8.4 3.3s-8.4-1.3-8.4-3.3c0-2.3 1.4-5.1 5.4-6.3z';
    case 'straight':
      return 'M20.6 24h6.8v16.2c0 1.3-.8 2-2.4 2h-2c-1.6 0-2.4-.7-2.4-2z';
    case 'flared':
      return 'M18 24h12l-3.2 8.4 3.4 7.4c.6 1.4-.4 2.4-2.2 2.4h-8c-1.8 0-2.8-1-2.2-2.4l3.4-7.4z';
    case 'double':
      return 'M24 24c3.4 0 5 2 5 4.5 0 2-1.4 3.3-1.4 4.2 0 1 2.6 1.9 2.6 5 0 2.7-2.6 4.5-6.2 4.5s-6.2-1.8-6.2-4.5c0-3.1 2.6-4 2.6-5 0-.9-1.4-2.2-1.4-4.2 0-2.5 1.6-4.5 5-4.5z';
    case 'ringed':
      return 'M20 24h8c0 3-2.2 3.9-2.2 5.9s3.2 2.8 3.2 5.8-2.2 3.9-2.2 6.5h-5.6c0-2.6-2.2-3.5-2.2-6.5s3.2-3.8 3.2-5.8-2.2-2.9-2.2-5.9z';
    case 'squat':
      return 'M19 29.4h10c1.4 0 2 1 2 2.8v7.6c0 1.6-1 2.4-2.6 2.4h-8.8c-1.6 0-2.6-.8-2.6-2.4v-7.6c0-1.8.6-2.8 2-2.8z';
    case 'bent':
      return 'M19.8 24l7.4-.6c0 0-1.4 5.6.6 9.8 1.8 3.8 5 5.2 5 5.2 .8 1.8-.2 3.2-2 3.4l-4 .5c-1.8.2-2.8-.8-3.2-2.4 0 0-1.6-4-1.6-8.4 0-4.6-2.2-7.5-2.2-7.5z';
  }
}

/**
 * Whether the stem is visible below the cap.
 *
 * A funnel is a bowl on a stalk and a cone reaches nearly to the ground, but every
 * shape here has one — the reference draws the stem as its own choice rather than
 * as something some caps do without.
 */
export function hasStem(): boolean {
  return true;
}

/**
 * Text colour for a card in a given cap colour.
 *
 * Cream and yellow caps need dark type. Computed from relative luminance rather
 * than listed, so adding a colour to the palette cannot silently produce a card
 * with white text on a pale background.
 */
export function textOn(capHex: string): string {
  const hex = capHex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#3A3733' : '#FFFFFF';
}
