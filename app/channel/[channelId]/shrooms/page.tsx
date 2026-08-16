'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore, getChannelShrooms, getGlobalShrooms } from '@/lib/store';
import { ShroomGraph } from '@/components/shrooms/ShroomGraph';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { InstructionCard } from '@/lib/types';

/**
 * One board's automation, drawn.
 *
 * A full page rather than a tab inside the shrooms panel: the panel is a column, and a
 * graph squeezed into a column is a list with extra steps. Global shrooms are included,
 * because they run here too and leaving them out would draw a chain that stops for no
 * visible reason.
 */
export default function ChannelShroomsGraphPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  const router = useRouter();

  const channels = useStore((s) => s.channels);
  const instructionCards = useStore((s) => s.instructionCards);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);

  const channel = channels[channelId];

  const shrooms = useMemo(() => {
    const state = useStore.getState();
    return [...getChannelShrooms(state, channelId), ...getGlobalShrooms(state)];
    // instructionCards is the real dependency — the selectors read a store snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, instructionCards]);

  const openShroom = (shroom: InstructionCard) =>
    router.push(`/channel/${shroom.channelId || channelId}?shrooms=open&edit=${shroom.id}`);

  const runShroom = (shroom: InstructionCard) =>
    router.push(`/channel/${shroom.channelId || channelId}?shrooms=open&run=${shroom.id}`);

  if (!hasHydrated) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Link
          href={`/channel/${channelId}`}
          className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100"
        >
          <svg className="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {channel?.name ?? 'Board'}
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
          Shroom map · {shrooms.length}
        </span>
        <Link
          href="/shrooms"
          className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-600 hover:text-violet-500 dark:text-violet-400"
        >
          <KanthinkIcon size={12} />
          All boards
        </Link>
      </header>

      <div className="min-h-0 flex-1">
        <ShroomGraph
          shrooms={shrooms}
          channels={channels}
          onOpen={openShroom}
          onRun={runShroom}
          onChain={(id, nextId) => updateInstructionCard(id, { nextInstructionId: nextId })}
        />
      </div>
    </div>
  );
}
