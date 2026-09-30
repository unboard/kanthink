/**
 * Write a designed channel to the database: channel, columns, shrooms, and its place
 * in the owner's sidebar.
 *
 * Shrooms land switched off. Nothing a conversation set up should start running on
 * its own before the person has looked at it.
 */

import { nanoid } from 'nanoid';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channels, columns, instructionCards, userChannelOrg } from '@/lib/db/schema';
import type { ChannelConfig } from './extractChannelConfig';

export interface WrittenChannel {
  channelId: string;
  config: ChannelConfig;
}

export async function writeChannelFromConfig(ownerId: string, config: ChannelConfig): Promise<WrittenChannel> {
  const channelId = nanoid();
  const createdAt = new Date();

  await db.insert(channels).values({
    id: channelId,
    ownerId,
    name: config.name,
    description: config.description,
    aiInstructions: config.instructions,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });

  const columnRows = config.columns.map((col, index) => ({
    id: nanoid(),
    channelId,
    name: col.name,
    instructions: col.description || null,
    position: index,
    isAiTarget: !!col.isAiTarget,
    createdAt,
    updatedAt: createdAt,
  }));
  await db.insert(columns).values(columnRows);

  const columnIdByName = new Map(columnRows.map((c) => [c.name, c.id]));
  if (config.shrooms.length > 0) {
    await db.insert(instructionCards).values(
      config.shrooms.map((shroom, position) => {
        const columnId = columnIdByName.get(shroom.targetColumnName) ?? columnRows[0].id;
        return {
          id: nanoid(),
          channelId,
          title: shroom.title,
          instructions: shroom.instructions,
          action: shroom.action,
          target: { type: 'column' as const, columnId },
          runMode: 'manual' as const,
          isEnabled: false,
          cardCount: shroom.cardCount ?? null,
          triggers: shroom.triggerOnArrival
            ? [{ type: 'event' as const, eventType: 'card_moved_to' as const, columnId }]
            : null,
          position,
          createdAt,
          updatedAt: createdAt,
        };
      })
    );
  }

  const last = await db.query.userChannelOrg.findFirst({
    where: eq(userChannelOrg.userId, ownerId),
    orderBy: [desc(userChannelOrg.position)],
  });
  await db.insert(userChannelOrg).values({
    userId: ownerId,
    channelId,
    position: (last?.position ?? -1) + 1,
  });

  return { channelId, config };
}
