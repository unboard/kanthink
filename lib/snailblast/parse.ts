import type { CampaignState } from './campaign';
import type { PanelId } from './panels';

export interface CampaignReply {
  reply: string;
  updates?: Partial<CampaignState>;
  panel?: PanelId | null;
  chips?: string[];
}

type Loose = Record<string, unknown>;

function tryParse(text: string): Loose | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : null;
  } catch {
    return null;
  }
}

function shape(obj: Loose, reply: string): CampaignReply {
  return {
    reply,
    updates: (obj.updates as Partial<CampaignState>) ?? undefined,
    panel: (obj.panel as PanelId | null) ?? null,
    chips: Array.isArray(obj.chips) ? (obj.chips as string[]).slice(0, 3) : [],
  };
}

/**
 * Turn whatever the model actually returned into a reply the customer can read.
 *
 * The failure this exists for was caught on production: the model wrote its
 * sentence in prose and THEN appended the JSON object, so a plain JSON.parse
 * failed and the naive fallback rendered the entire string — braces and all —
 * into the chat bubble. Anything that reaches `reply` here is shown verbatim to
 * a customer, so a raw JSON blob must never survive this function.
 */
export function parseCampaignReply(raw: string): CampaignReply {
  const text = raw.trim();
  if (!text) return { reply: '', panel: null, chips: [] };

  // 1. The whole thing is the object, as instructed.
  const direct = tryParse(text);
  if (direct && typeof direct.reply === 'string' && direct.reply.trim()) {
    return shape(direct, direct.reply.trim());
  }

  // 2. Wrapped in a markdown fence.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const inner = tryParse(fenced[1].trim());
    if (inner && typeof inner.reply === 'string' && inner.reply.trim()) {
      return shape(inner, inner.reply.trim());
    }
  }

  // 3. Prose with the object appended (or prepended). Take the object for the
  //    structured fields, and the surrounding prose as the reply when the object
  //    carries no reply of its own.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const obj = tryParse(text.slice(start, end + 1));
    if (obj) {
      const prose = (text.slice(0, start) + ' ' + text.slice(end + 1)).trim();
      const objReply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
      const reply = objReply || prose;
      if (reply) return shape(obj, reply);
    }
  }

  // 4. No usable object. Strip any brace-delimited remnant so the customer never
  //    sees JSON, and show what is left.
  const stripped =
    start !== -1 && end > start
      ? (text.slice(0, start) + ' ' + text.slice(end + 1)).replace(/\s+/g, ' ').trim()
      : text;

  return { reply: stripped, panel: null, chips: [] };
}
