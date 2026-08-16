'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ShroomGraph } from '@/components/shrooms/ShroomGraph';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { InstructionCard } from '@/lib/types';

/**
 * Every shroom you have, across every channel, as one picture.
 *
 * This is the view that shows something no list can: which boards actually have working
 * automation, which shrooms nothing ever triggers, and chains that cross from one channel
 * into another. Per-channel the shape is small enough to hold in your head — here it
 * isn't, which is why the global view is the one worth having.
 */
export default function ShroomsGraphPage() {
  const router = useRouter();
  const instructionCards = useStore((s) => s.instructionCards);
  const channels = useStore((s) => s.channels);
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);

  const [channelFilter, setChannelFilter] = useState<string>('all');

  const shrooms = useMemo(() => {
    const all = Object.values(instructionCards);
    if (channelFilter === 'all') return all;
    return all.filter((s) => s.channelId === channelFilter);
  }, [instructionCards, channelFilter]);

  // Only boards that actually carry a shroom — a filter listing empty channels is a
  // filter that mostly produces empty screens.
  const channelsWithShrooms = useMemo(() => {
    const ids = new Set(Object.values(instructionCards).map((s) => s.channelId));
    return Object.values(channels)
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [instructionCards, channels]);

  const openShroom = (shroom: InstructionCard) => {
    const channelId = shroom.channelId || channelsWithShrooms[0]?.id;
    if (channelId) router.push(`/channel/${channelId}?shrooms=open&edit=${shroom.id}`);
  };

  const runShroom = (shroom: InstructionCard) => {
    const channelId = shroom.channelId || channelsWithShrooms[0]?.id;
    if (channelId) router.push(`/channel/${channelId}?shrooms=open&run=${shroom.id}`);
  };

  const total = Object.keys(instructionCards).length;

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100"
        >
          <KanthinkIcon size={20} className="text-violet-500" />
          Shroom map
        </button>

        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
          {total} {total === 1 ? 'shroom' : 'shrooms'} · {channelsWithShrooms.length} boards
        </span>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <option value="all">All boards</option>
            {channelsWithShrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      <Legend />

      <div className="min-h-0 flex-1">
        <ShroomGraph
          shrooms={shrooms}
          channels={channels}
          onOpen={openShroom}
          onRun={runShroom}
          onChain={(id, nextId) => updateInstructionCard(id, { nextInstructionId: nextId })}
          showChannelNames={channelFilter === 'all'}
        />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-neutral-200 px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
      <Swatch color="#22c55e" label="Watches a column" />
      <Swatch color="#3b82f6" label="On a schedule" />
      <Swatch color="#a1a1aa" label="Manual only" />
      <Swatch color="#f43f5e" label="Needs attention" />
      <span className="ml-auto normal-case tracking-normal">
        Drag from a node&rsquo;s right dot to chain it · drop on empty space to unchain · double-click to edit
      </span>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
