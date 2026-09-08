/**
 * A shroom's face.
 *
 * Four shrooms in a row at 16px have to be four different things at a glance, and a
 * name is not enough — you read the shapes long before you read the labels. So each
 * shroom carries a cap shape, a colour and a marking.
 *
 * Nothing has one yet, and asking people to go and pick twelve avatars before the
 * row is useful would be a poor trade. So an avatar is *derived* from the shroom's
 * id unless one was chosen: stable, well spread, and different for every shroom in a
 * channel without anyone doing anything. Picking one later just overrides it.
 */

export const CAP_SHAPES = [
  'round', 'flat', 'conical', 'bell', 'ruffled', 'wide',
  'tall', 'button', 'parasol', 'puffball', 'coral', 'morel',
] as const;
export type CapShape = (typeof CAP_SHAPES)[number];

export const PATTERNS = ['plain', 'spots', 'gills', 'rings'] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface ShroomPalette {
  key: string;
  name: string;
  /** Top of the cap gradient. */
  cap: string;
  /** Bottom of the cap gradient. */
  deep: string;
  stem: string;
}

export const PALETTE: ShroomPalette[] = [
  { key: 'violet', name: 'Violet', cap: '#8b5cf6', deep: '#6d28d9', stem: '#e9e4f5' },
  { key: 'crimson', name: 'Crimson', cap: '#e11d48', deep: '#9f1239', stem: '#f7e4e8' },
  { key: 'amber', name: 'Amber', cap: '#f59e0b', deep: '#b45309', stem: '#f8efdd' },
  { key: 'emerald', name: 'Emerald', cap: '#10b981', deep: '#047857', stem: '#dff2ea' },
  { key: 'sky', name: 'Sky', cap: '#0ea5e9', deep: '#0369a1', stem: '#dcedf8' },
  { key: 'fuchsia', name: 'Fuchsia', cap: '#d946ef', deep: '#a21caf', stem: '#f6e2fa' },
  { key: 'slate', name: 'Slate', cap: '#64748b', deep: '#334155', stem: '#e6e9ee' },
  { key: 'lime', name: 'Lime', cap: '#84cc16', deep: '#4d7c0f', stem: '#eaf4d9' },
  { key: 'coral', name: 'Coral', cap: '#fb7185', deep: '#be123c', stem: '#fae6e9' },
  { key: 'indigo', name: 'Indigo', cap: '#6366f1', deep: '#3730a3', stem: '#e3e4fa' },
  { key: 'teal', name: 'Teal', cap: '#14b8a6', deep: '#0f766e', stem: '#dcf1ee' },
  { key: 'sand', name: 'Sand', cap: '#a8a29e', deep: '#57534e', stem: '#eeebe8' },
];

export interface ShroomAvatarSpec {
  shape: CapShape;
  pattern: Pattern;
  color: string;
}

/** Stored as "shape:pattern:colour" — a single short string, so no JSON to parse. */
export function serializeAvatar(a: ShroomAvatarSpec): string {
  return `${a.shape}:${a.pattern}:${a.color}`;
}

/** Parse a stored avatar, returning null for anything unrecognised. */
export function parseAvatar(raw: string | null | undefined): ShroomAvatarSpec | null {
  if (!raw || typeof raw !== 'string') return null;
  const [shape, pattern, color] = raw.split(':');
  if (!CAP_SHAPES.includes(shape as CapShape)) return null;
  if (!PATTERNS.includes(pattern as Pattern)) return null;
  if (!PALETTE.some((p) => p.key === color)) return null;
  return { shape: shape as CapShape, pattern: pattern as Pattern, color };
}

/**
 * A stable 32-bit hash of a string (FNV-1a).
 *
 * Any stable hash would do; this one is short, has no dependencies, and spreads
 * sequential ids — which matters because nanoid ids created seconds apart should not
 * come out looking related.
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
 * Three independent draws off one hash rather than three slices of it, so shape and
 * colour don't move together — two shrooms sharing a cap should still differ in
 * colour rather than being near-identical twice over.
 */
export function deriveAvatar(id: string): ShroomAvatarSpec {
  const h = hash(id);
  return {
    shape: CAP_SHAPES[h % CAP_SHAPES.length],
    color: PALETTE[Math.floor(h / 7) % PALETTE.length].key,
    pattern: PATTERNS[Math.floor(h / 131) % PATTERNS.length],
  };
}

/** The avatar to draw: the chosen one, or the derived one. */
export function resolveAvatar(id: string, stored?: string | null): ShroomAvatarSpec {
  return parseAvatar(stored) ?? deriveAvatar(id);
}

/** Shapes that are drawn without a stem. */
export function hasStem(shape: CapShape): boolean {
  return shape !== 'puffball' && shape !== 'coral';
}

/**
 * Half-width of the stem, per cap.
 *
 * A fixed stem under every cap was the bug: six units under a twenty-nine unit
 * parasol reads as a pole holding something up, not as a mushroom. A stem needs to
 * be roughly a third of its cap to look like it grew there.
 */
const STEM_HALF_WIDTH: Record<CapShape, number> = {
  wide: 4.6,
  parasol: 4.4,
  flat: 4.2,
  ruffled: 3.9,
  round: 3.6,
  button: 3.2,
  bell: 3.0,
  conical: 3.0,
  morel: 2.9,
  tall: 2.6,
  puffball: 0,
  coral: 0,
};

/** The stem below a cap, widened to suit it. Drawn before the cap, so overlap hides. */
export function stemPath(shape: CapShape): string {
  const w = STEM_HALF_WIDTH[shape];
  const left = (16 - w).toFixed(1);
  const span = (w * 2).toFixed(1);
  const foot = (w * 2 + 0.6).toFixed(1);
  return `M${left} 19h${span}c0 4.5.6 6.5 1.2 8.2.2.6-.2 1.1-.9 1.1h-${foot}c-.7 0-1.1-.5-.9-1.1.6-1.7 1.2-3.7 1.2-8.2z`;
}

/** The cap outline for each shape, drawn in a 32×32 box. */
export function capPath(shape: CapShape): string {
  switch (shape) {
    case 'round':
      return 'M4 17c0-7.2 5.4-12 12-12s12 4.8 12 12c0 1.6-1.2 2.4-3 2.4H7c-1.8 0-3-.8-3-2.4z';
    case 'flat':
      return 'M3 18c0-5.6 5.8-9.6 13-9.6s13 4 13 9.6c0 1.3-1 1.9-2.6 1.9H5.6C4 19.9 3 19.3 3 18z';
    case 'conical':
      return 'M16 4l11 14.5c.7 1 0 2-1.4 2H6.4c-1.4 0-2.1-1-1.4-2z';
    case 'bell':
      return 'M6 19c0-9 3.6-14 10-14s10 5 10 14c0 1-.9 1.5-2.2 1.5H8.2C6.9 20.5 6 20 6 19z';
    case 'ruffled':
      return 'M4 17c0-7 5.4-12 12-12s12 5 12 12c0 1.7-2 .6-3.4 1.6-1.4 1-2.6-1-4-.2-1.4.8-2.6 1.2-4.6 1.2s-3.2-.4-4.6-1.2c-1.4-.8-2.6 1.2-4-.2C6 17.6 4 18.7 4 17z';
    case 'wide':
      return 'M1.5 17.5C1.5 11.7 8 7.5 16 7.5s14.5 4.2 14.5 10c0 1.6-1.3 2.4-3.2 2.4H4.7c-1.9 0-3.2-.8-3.2-2.4z';
    case 'tall':
      return 'M10 18c0-8.5 2.4-13 6-13s6 4.5 6 13c0 1.2-.7 1.8-1.8 1.8h-8.4C10.7 19.8 10 19.2 10 18z';
    case 'button':
      return 'M7 18.5c0-5.5 4-9.5 9-9.5s9 4 9 9.5c0 1.1-.8 1.6-2.1 1.6H9.1C7.8 20.1 7 19.6 7 18.5z';
    case 'parasol':
      return 'M2.5 18c0-7.5 6-13 13.5-13S29.5 10.5 29.5 18c0 1.2-.8 1.6-2 1.6h-23c-1.2 0-2-.4-2-1.6z';
    case 'puffball':
      return 'M16 4a11 11 0 100 22 11 11 0 000-22z';
    case 'coral':
      return 'M16 20c-1 0-1.4-.7-1.4-1.6 0-2-2-2.4-3-3.6-1-1.2-1-3.4.6-4.2 1.2-.6 1-2 .4-3-.7-1.2.2-2.8 1.7-2.8 1.4 0 2 1.2 3.4 1.2s2-1.2 3.4-1.2c1.5 0 2.4 1.6 1.7 2.8-.6 1-.8 2.4.4 3 1.6.8 1.6 3 .6 4.2-1 1.2-3 1.6-3 3.6 0 .9-.4 1.6-1.4 1.6z';
    case 'morel':
      return 'M16 4c4.6 0 7.5 3.6 7.5 8.5S20.6 21 16 21s-7.5-3.6-7.5-8.5S11.4 4 16 4z';
  }
}
