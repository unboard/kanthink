import { extractJsonReply } from '@/lib/ai/jsonReply';
import type { CampaignState } from './campaign';
import type { PanelId } from './panels';

export interface CampaignReply {
  reply: string;
  updates?: Partial<CampaignState>;
  panel?: PanelId | null;
  chips?: string[];
}

/**
 * Turn whatever the model actually returned into a reply the customer can read.
 *
 * The extraction — and the guarantee that no raw JSON survives into the chat
 * bubble — lives in extractJsonReply(); this only shapes the campaign fields.
 */
export function parseCampaignReply(raw: string): CampaignReply {
  const { obj, reply } = extractJsonReply(raw);
  if (!obj) return { reply, panel: null, chips: [] };

  return {
    reply,
    updates: (obj.updates as Partial<CampaignState>) ?? undefined,
    panel: (obj.panel as PanelId | null) ?? null,
    chips: Array.isArray(obj.chips) ? (obj.chips as string[]).slice(0, 3) : [],
  };
}
