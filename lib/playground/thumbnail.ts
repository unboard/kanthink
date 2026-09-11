/**
 * What an app's thumbnail is a picture of.
 *
 * Two halves, kept apart on purpose:
 *
 *   - The **house style** is per account, set once in Settings → Apps. It is the
 *     reason a directory of twenty apps looks like one person's shelf rather than
 *     twenty unrelated stock images.
 *   - The **subject** comes from the app itself — its title, its tagline, what Kan
 *     wrote about the last build. Nobody should have to describe their own app to
 *     get a picture of it.
 *
 * A custom prompt replaces the subject and keeps the house style, which is almost
 * always what someone means by "no, make it look like X".
 */

/**
 * The style used by an account that has never set one.
 *
 * Written as a style, not a scene: it has to sit behind a maths game for a
 * seven-year-old and behind a pricing calculator without fighting either.
 */
export const DEFAULT_APP_IMAGE_PROMPT =
  'Soft, modern app-icon illustration. Bold simple shapes, generous negative space, ' +
  'a warm violet-to-fuchsia accent against a deep neutral ground, gentle depth. ' +
  'No text, no letters, no UI chrome, no logos.';

/** Thumbnails are tiles in a grid — always square, whatever the app looks like. */
export const THUMBNAIL_ASPECT_RATIO = '1:1';

export interface ThumbnailContext {
  /** The account's house style. Falls back to DEFAULT_APP_IMAGE_PROMPT. */
  houseStyle?: string | null;
  title: string;
  tagline?: string | null;
  /** Kan's one-liner about the build. */
  summary?: string | null;
  /** Running design decisions — the best description of what the thing looks like. */
  designNotes?: string | null;
  /** The source card, for apps too new to have said anything about themselves. */
  cardTitle?: string | null;
  /** Replaces the derived subject. The house style still applies. */
  customPrompt?: string | null;
}

/** Keep the model's input short enough that the style still carries weight. */
const MAX_SUBJECT_CHARS = 400;

function clamp(text: string, max = MAX_SUBJECT_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What the picture is *of*, assembled from whatever the app has said about itself.
 *
 * Ordered by how much each source actually knows: a tagline the owner wrote beats
 * Kan's build summary, which beats design notes, which beats the card title. An app
 * created a minute ago has only the last of those, and that is still enough.
 */
export function buildThumbnailSubject(ctx: ThumbnailContext): string {
  if (ctx.customPrompt?.trim()) return clamp(ctx.customPrompt);

  const parts: string[] = [`an app called "${ctx.title}"`];
  const detail = ctx.tagline?.trim() || ctx.summary?.trim() || ctx.designNotes?.trim();
  if (detail) parts.push(detail);
  else if (ctx.cardTitle?.trim()) parts.push(`built from a card about ${ctx.cardTitle.trim()}`);

  return clamp(parts.join(' — '));
}

/**
 * The full prompt handed to the image model.
 *
 * The "no text" instruction is repeated after the style because image models drift
 * back to putting a title on anything described as an icon, and a thumbnail with
 * half-rendered lettering on it is worse than no thumbnail.
 */
export function buildThumbnailPrompt(ctx: ThumbnailContext): string {
  const style = ctx.houseStyle?.trim() || DEFAULT_APP_IMAGE_PROMPT;
  const subject = buildThumbnailSubject(ctx);

  return [
    `App thumbnail for ${subject}.`,
    style,
    'Square, centred, reads clearly at 200px. Absolutely no text or lettering anywhere in the image.',
  ].join('\n\n');
}
