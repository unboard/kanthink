import type { CampaignState } from './campaign';

export type PanelId = 'map' | 'upload' | 'targeting' | 'templates' | 'artwork';

export const PANELS: PanelId[] = ['map', 'upload', 'targeting', 'templates', 'artwork'];

const MODE_PANEL: Record<string, PanelId> = {
  eddm: 'map',
  upload: 'upload',
  targeted: 'targeting',
};

/**
 * Decide which tool to open, without trusting the model to remember.
 *
 * Adherence to the "set panel" instruction is genuinely unreliable — the same
 * message returns "map" on one call and null on the next, and a null strands the
 * customer on a reply that says "I've opened the map" with no map. So the model's
 * answer is taken when it gives one, and otherwise inferred from what it just
 * learned and what the campaign still needs. A wrong panel is one click to close;
 * a missing one is a dead end.
 */
export function derivePanel(
  modelPanel: unknown,
  reply: string,
  state: CampaignState,
  updates?: Partial<CampaignState>,
  userMessage = ''
): PanelId | null {
  if (typeof modelPanel === 'string' && PANELS.includes(modelPanel as PanelId)) {
    return modelPanel as PanelId;
  }

  const mode = updates?.audience?.mode ?? state.audience.mode;
  const audienceDone = !!state.audience.pieces;

  // The customer's own words beat the model's paraphrase. Someone who typed
  // "I have a spreadsheet" has told us exactly which tool they need, whether or
  // not the reply happened to echo a keyword back.
  const text = `${userMessage} ${reply}`.toLowerCase();

  if (!audienceDone) {
    if (mode && MODE_PANEL[mode]) return MODE_PANEL[mode];
    if (/\b(upload|csv|xlsx?|excel|spreadsheet|export|file|my list|your list|mailing list|contacts|database)\b/.test(text)) return 'upload';
    if (/\b(target|targeted|demographics?|radius|households?|income|homeowners?)\b/.test(text)) return 'targeting';
    if (/\b(map|routes?|neighbou?rhoods?|eddm|every door|areas?|zip|blanket)\b/.test(text)) return 'map';
    return null;
  }

  const artworkDone = !!state.artwork.mode && !!state.artwork.sizeId;
  if (!artworkDone && /\b(template|templates|size|sizes|design|artwork|postcard)\b/.test(text)) return 'templates';
  if (/\b(review|check|proof|artwork|upload)\b/.test(text)) return 'artwork';

  return null;
}
