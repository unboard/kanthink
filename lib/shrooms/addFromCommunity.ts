import { useStore } from '@/lib/store';
import type { MarketplaceShroom } from '@/lib/marketplace-data';
import type { InstructionCard, InstructionTarget } from '@/lib/types';

export type AddCommunityShroomResult =
  | { ok: true; shroom: InstructionCard; channelName: string }
  | { ok: false; reason: 'no-channel' };

/**
 * Add a marketplace shroom to the user's own shrooms.
 *
 * A shroom row is anchored to a channel on the server (`instruction_cards.channel_id` is a
 * NOT NULL foreign key), so "add to my shrooms" has to pick one. Previously every caller
 * passed an empty channel id, which produced a `POST /api/channels//instructions` that
 * 404'd — the shroom lived in local storage only and vanished on the next sync, and never
 * existed at all on a second device.
 *
 * `scope: 'global'` is what actually makes it show up on every board; the anchor channel
 * only decides which row owns it and which column its output defaults to.
 */
export function addCommunityShroom(
  shroom: MarketplaceShroom,
  preferredChannelId?: string | null
): AddCommunityShroomResult {
  const state = useStore.getState();

  const preferred = preferredChannelId ? state.channels[preferredChannelId] : undefined;
  const anchorId =
    preferred && !preferred.isGlobalHelp && preferred.role !== 'viewer' && preferred.columns.length > 0
      ? preferred.id
      : findWritableChannelId(state);

  if (!anchorId) return { ok: false, reason: 'no-channel' };

  const channel = state.channels[anchorId];

  // Generate/report need somewhere to put their output; modify/move read the whole board.
  const target: InstructionTarget =
    shroom.action === 'generate' && channel.columns.length > 0
      ? { type: 'column', columnId: channel.columns[0].id }
      : { type: 'board' };

  const created = state.createInstructionCard(anchorId, {
    title: shroom.name,
    instructions: shroom.instructions,
    action: shroom.action,
    target,
    scope: 'global',
  });

  return { ok: true, shroom: created, channelName: channel.name };
}

function findWritableChannelId(state: ReturnType<typeof useStore.getState>): string | null {
  const channels = Object.values(state.channels).filter(
    (c) => !c.isGlobalHelp && c.role !== 'viewer' && c.columns.length > 0
  );
  if (channels.length === 0) return null;

  // channelOrder is the user's own ordering, so its head is the most "theirs" channel.
  const ordered = state.channelOrder?.find((id) => channels.some((c) => c.id === id));
  return ordered ?? channels[0].id;
}
