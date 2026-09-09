'use client';

import type { Channel, InstructionCard } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar, textOn } from '@/lib/shrooms/avatar';
import { buildShroomTrail } from '@/lib/shrooms/trail';
import { describeShroom } from '@/lib/shrooms/describe';

interface ShroomDetailProps {
  shroom: InstructionCard;
  channel: Channel | undefined;
  allShrooms: Record<string, InstructionCard>;
  isRunning?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRun: () => void;
  onEdit: () => void;
}

/**
 * What a shroom is, before you set it going.
 *
 * Clicking a tile used to run it outright on desktop, which only worked because
 * hovering had already shown you the trail — and hovering is not something a phone
 * can do. One overlay for both, so the same click means the same thing everywhere,
 * and running is always a thing you chose after reading.
 *
 * The header is the shroom's own colour with its face in it, so the overlay is
 * visibly the tile you just pressed rather than a generic panel about it.
 */
export function ShroomDetail({
  shroom,
  channel,
  allShrooms,
  isRunning,
  isOpen,
  onClose,
  onRun,
  onEdit,
}: ShroomDetailProps) {
  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  const ink = textOn(palette.bg);
  const facts = describeShroom(shroom, channel, allShrooms);
  const trail = buildShroomTrail(shroom, channel);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ backgroundColor: palette.bg }}
      >
        <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-tight" style={{ color: ink }}>
            {shroom.title}
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: ink, opacity: 0.72 }}>
            {facts.trigger ? `Runs ${facts.trigger.toLowerCase()}` : 'Runs when you ask'}
            {facts.lastRun ? ` · last run ${facts.lastRun.toLowerCase()}` : ' · never run'}
          </p>
        </div>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-[13.5px] leading-relaxed text-neutral-700 dark:text-neutral-300">
          {facts.summary}
        </p>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            What it does
          </h3>
          <ol className="space-y-1.5">
            {trail.stops.map((stop, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="mt-[1px] flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-full font-mono text-[9.5px] font-bold text-white"
                  style={{ backgroundColor: palette.bg, minWidth: 18, height: 18 }}
                >
                  {i + 1}
                </span>
                <span className="text-[12.5px] leading-snug text-neutral-700 dark:text-neutral-300">
                  {stop.verb}
                  {stop.columnName && (
                    <span className="text-neutral-500"> · {stop.columnName}</span>
                  )}
                  {stop.offBoard === 'review' && (
                    <span className="block text-[11.5px] text-amber-600 dark:text-amber-400">
                      waits for your approval
                    </span>
                  )}
                  {stop.offBoard === 'report' && (
                    <span className="block text-[11.5px] text-neutral-500">not on the board</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {trail.conditional && (
            <p className="mt-1.5 text-[11.5px] text-neutral-500">
              It decides per card, so it may not touch every one.
            </p>
          )}
        </section>

        <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 text-[12px] dark:divide-neutral-800 dark:border-neutral-800">
          <Row label="Runs" value={facts.trigger ?? 'only when you ask'} />
          {facts.totalRuns > 0 && (
            <Row label="Times run" value={`${facts.totalRuns}${facts.totalRuns >= 10 ? '+' : ''}`} />
          )}
          {facts.chainsTo && <Row label="Then hands off to" value={facts.chainsTo} />}
          {trail.readsEverything ? (
            <Row label="Reads" value="the whole board" />
          ) : (
            trail.readsColumnIds.length > 0 && (
              <Row
                label="Also reads"
                value={trail.readsColumnIds
                  .map((id: string) => channel?.columns.find((c) => c.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              />
            )
          )}
          {facts.usesWeb && <Row label="Goes online" value="every run" />}
        </dl>
      </div>

      <div className="flex gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: palette.bg }}
        >
          {isRunning ? 'Running…' : 'Run now'}
        </button>
        <button
          onClick={onEdit}
          className="rounded-lg border border-neutral-200 px-4 text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Edit
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <dt className="flex-shrink-0 text-neutral-500">{label}</dt>
      <dd className="ml-auto min-w-0 break-words text-right text-neutral-800 dark:text-neutral-200">
        {value}
      </dd>
    </div>
  );
}
