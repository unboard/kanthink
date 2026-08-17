import { extractJsonReply } from '@/lib/ai/jsonReply';
import type { AssetRole, DesignBrief } from './brief';

export interface AssetVerdict {
  /** 1-indexed, matching the order the images were supplied to the planner. */
  index: number;
  role: AssetRole;
  note?: string;
}

export interface PlannerReply {
  reply: string;
  render: boolean;
  imagePrompt: string | null;
  updates: Partial<DesignBrief> | null;
  assets: AssetVerdict[];
  chips: string[];
}

const ROLES: AssetRole[] = ['logo', 'photo', 'inspiration'];

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && !!v.trim())
    .map((v) => v.trim())
    .slice(0, max);
}

/**
 * Shape the planner's output.
 *
 * `render` defaults to true when the planner gave us a usable image prompt.
 * The tool's whole promise is that pressing Generate generates something, so a
 * malformed or missing `render` flag must not silently turn a generation into a
 * chat message — but a `render: true` with no prompt is unrenderable and has to
 * come back as false rather than reaching the image model empty.
 */
export function parsePlannerReply(raw: string): PlannerReply {
  const { obj, reply } = extractJsonReply(raw);

  if (!obj) {
    return { reply, render: false, imagePrompt: null, updates: null, assets: [], chips: [] };
  }

  const imagePrompt =
    typeof obj.imagePrompt === 'string' && obj.imagePrompt.trim() ? obj.imagePrompt.trim() : null;

  const assets: AssetVerdict[] = Array.isArray(obj.assets)
    ? obj.assets
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a) => ({
          index: Number(a.index),
          role: ROLES.includes(a.role as AssetRole) ? (a.role as AssetRole) : 'photo',
          note: typeof a.note === 'string' && a.note.trim() ? a.note.trim() : undefined,
        }))
        .filter((a) => Number.isInteger(a.index) && a.index > 0)
    : [];

  let updates: Partial<DesignBrief> | null = null;
  if (obj.updates && typeof obj.updates === 'object' && !Array.isArray(obj.updates)) {
    const u = obj.updates as Record<string, unknown>;
    updates = {};
    for (const key of ['business', 'offer', 'audience', 'palette', 'typography', 'mood'] as const) {
      if (typeof u[key] === 'string') updates[key] = u[key] as string;
      else if (u[key] === null) updates[key] = null;
    }
    // An explicit empty array is how the planner retracts a list, so pass it
    // through rather than treating "empty" as "absent".
    if (Array.isArray(u.mustInclude)) updates.mustInclude = stringList(u.mustInclude, 12);
    if (Array.isArray(u.avoid)) updates.avoid = stringList(u.avoid, 12);
  }

  return {
    reply,
    render: obj.render === false ? false : !!imagePrompt,
    imagePrompt,
    updates,
    assets,
    chips: stringList(obj.chips, 3),
  };
}
