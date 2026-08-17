/**
 * The design brief: the one thing both sides of a piece read from.
 *
 * "The front and back should complement each other" is not achievable by asking
 * the image model nicely. It needs a shared source of truth that survives across
 * turns and across sides, so the back is generated from the same palette, voice
 * and contact details the front was — plus the front image itself as a visual
 * reference. This is that source of truth.
 *
 * It accumulates. The planner returns only what it learned this turn and we
 * merge, so a detail mentioned once in message two is still honoured in the back
 * design generated at message nine.
 */

export type AssetRole = 'logo' | 'photo' | 'inspiration';

export interface DesignAsset {
  id: string;
  url: string;
  /** What this image is for. Classified by the planner, overridable by the user. */
  role: AssetRole;
  /** Set once the user overrides the role, so the planner stops reclassifying it. */
  pinned?: boolean;
  /** The planner's one-line note on how this specific image should be used. */
  note?: string;
}

export interface DesignBrief {
  /** Who the piece is for — the business and what it does. */
  business: string | null;
  /** The single thing this piece is trying to get someone to do. */
  offer: string | null;
  /** Who is receiving it. */
  audience: string | null;
  /** Named colours or a described palette, carried across both sides. */
  palette: string | null;
  /** Type treatment — weights, pairing, character. */
  typography: string | null;
  /** The overall feel, in adjectives. */
  mood: string | null;
  /** Contact details and anything that must literally appear in the artwork. */
  mustInclude: string[];
  /** Things the user has ruled out. Negative direction is how iteration converges. */
  avoid: string[];
}

export function emptyBrief(): DesignBrief {
  return {
    business: null,
    offer: null,
    audience: null,
    palette: null,
    typography: null,
    mood: null,
    mustInclude: [],
    avoid: [],
  };
}

const SCALAR_KEYS = ['business', 'offer', 'audience', 'palette', 'typography', 'mood'] as const;
const LIST_KEYS = ['mustInclude', 'avoid'] as const;

/**
 * Fold this turn's findings into the running brief.
 *
 * Scalars overwrite — the user changing their mind about the palette must
 * actually change the palette. Lists union, because "also put the phone number
 * on it" adds a requirement rather than replacing the previous one. A list is
 * only cleared by an explicit empty array, which is how the planner retracts
 * something the user has dropped.
 */
export function mergeBrief(current: DesignBrief, updates: Partial<DesignBrief> | null | undefined): DesignBrief {
  if (!updates) return current;
  const next: DesignBrief = { ...current };

  for (const key of SCALAR_KEYS) {
    const value = updates[key];
    if (typeof value === 'string' && value.trim()) next[key] = value.trim();
    else if (value === null) next[key] = null;
  }

  for (const key of LIST_KEYS) {
    const value = updates[key];
    if (!Array.isArray(value)) continue;
    const incoming = value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim());
    if (incoming.length === 0) {
      next[key] = [];
      continue;
    }
    const seen = new Set(next[key].map((v) => v.toLowerCase()));
    next[key] = [...next[key], ...incoming.filter((v) => !seen.has(v.toLowerCase()))];
  }

  return next;
}

export function isBriefEmpty(brief: DesignBrief): boolean {
  return (
    SCALAR_KEYS.every((k) => !brief[k]) && brief.mustInclude.length === 0 && brief.avoid.length === 0
  );
}

/** The brief as prompt text. Omits empty fields rather than emitting "null". */
export function describeBrief(brief: DesignBrief): string {
  const lines: string[] = [];
  if (brief.business) lines.push(`BUSINESS: ${brief.business}`);
  if (brief.offer) lines.push(`OFFER / GOAL: ${brief.offer}`);
  if (brief.audience) lines.push(`AUDIENCE: ${brief.audience}`);
  if (brief.palette) lines.push(`PALETTE: ${brief.palette} — use this on both sides.`);
  if (brief.typography) lines.push(`TYPOGRAPHY: ${brief.typography}`);
  if (brief.mood) lines.push(`MOOD: ${brief.mood}`);
  if (brief.mustInclude.length) {
    lines.push(
      `MUST APPEAR, SPELLED EXACTLY: ${brief.mustInclude.join(' | ')}`
    );
  }
  if (brief.avoid.length) lines.push(`AVOID (the user has ruled these out): ${brief.avoid.join('; ')}`);
  return lines.length ? lines.join('\n') : 'Nothing established yet — this is the first pass.';
}

/**
 * How each attached image is to be used, written for the image model.
 *
 * The logo line is the important one. Left to its own devices an image model
 * treats a supplied logo as inspiration and redraws it, which produces a piece
 * that is unusable to the business whose logo it is.
 */
export function describeAssets(assets: DesignAsset[], startIndex = 1): string {
  if (assets.length === 0) return '';
  const lines = assets.map((asset, i) => {
    const n = startIndex + i;
    const note = asset.note ? ` ${asset.note}` : '';
    switch (asset.role) {
      case 'logo':
        return `- Attached image ${n} is the BUSINESS LOGO. Reproduce it exactly as supplied — same shapes, same wordmark, same proportions. Do not redraw it, restyle it, re-letter it, or invent a variation. Place it at a legible size and give it clear space. If it needs to sit on a coloured background, keep it legible there.${note}`;
      case 'inspiration':
        return `- Attached image ${n} is a STYLE REFERENCE. Match its composition, colour relationships, type treatment and overall feel. Do NOT copy its text, its logo, its brand, or its specific photographic subject — this is a new piece for a different business that should feel like it came from the same studio.${note}`;
      default:
        return `- Attached image ${n} is SUPPLIED PHOTOGRAPHY / ARTWORK belonging to the business. Use it in the design. You may crop, scale and colour-grade it to fit the layout, but do not replace its subject with something invented.${note}`;
    }
  });
  return `ATTACHED IMAGES:\n${lines.join('\n')}`;
}
