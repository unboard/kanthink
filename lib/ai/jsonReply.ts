/**
 * Pull a structured object out of a model reply that is also shown to a user.
 *
 * The failure this exists for was caught on production in SnailBlast: the model
 * wrote its sentence in prose and THEN appended the JSON object it had been
 * asked to return. A plain JSON.parse failed, and the naive fallback rendered
 * the entire string — braces and all — into the chat bubble.
 *
 * So this is deliberately paranoid in both directions. It tries four increasingly
 * forgiving strategies to find the object, and whatever comes back as `reply` is
 * guaranteed to have had any brace-delimited remnant stripped out of it. Anything
 * reaching `reply` is shown verbatim to a person, so a raw JSON blob must never
 * survive this function.
 */

export interface JsonReply {
  /** The parsed object, or null if the model didn't return one. */
  obj: Record<string, unknown> | null;
  /** Human-readable text, never containing JSON. May be empty. */
  reply: string;
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function replyField(obj: Record<string, unknown>): string {
  return typeof obj.reply === 'string' ? obj.reply.trim() : '';
}

export function extractJsonReply(raw: string): JsonReply {
  const text = (raw ?? '').trim();
  if (!text) return { obj: null, reply: '' };

  // 1. The whole thing is the object, as instructed.
  const direct = tryParse(text);
  if (direct) return { obj: direct, reply: replyField(direct) };

  // 2. Wrapped in a markdown fence.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const inner = tryParse(fenced[1].trim());
    if (inner) return { obj: inner, reply: replyField(inner) };
  }

  // 3. Prose with the object appended (or prepended). Take the object for the
  //    structured fields, and the surrounding prose as the reply when the object
  //    carries no reply of its own.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const obj = tryParse(text.slice(start, end + 1));
    if (obj) {
      const prose = (text.slice(0, start) + ' ' + text.slice(end + 1)).replace(/\s+/g, ' ').trim();
      return { obj, reply: replyField(obj) || prose };
    }
  }

  // 4. No usable object. Strip any brace-delimited remnant so the user never
  //    sees JSON, and show what is left.
  const stripped =
    start !== -1 && end > start
      ? (text.slice(0, start) + ' ' + text.slice(end + 1)).replace(/\s+/g, ' ').trim()
      : text;

  return { obj: null, reply: stripped };
}
