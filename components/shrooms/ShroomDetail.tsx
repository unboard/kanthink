'use client';

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Channel, InstructionCard } from '@/lib/types';
import { ShroomAvatar } from './ShroomAvatar';
import { PALETTE, resolveAvatar, textOn } from '@/lib/shrooms/avatar';
import { buildShroomTrail } from '@/lib/shrooms/trail';
import { describeShroom } from '@/lib/shrooms/describe';

interface ShroomDetailProps {
  shroom: InstructionCard;
  channel: Channel | undefined;
  allShrooms: Record<string, InstructionCard>;
  isRunning?: boolean;
  onClose: () => void;
  onRun: () => void;
  onEdit: () => void;
}

/**
 * What a shroom is, before you set it going.
 *
 * Rendered through a portal onto the body rather than in place. The shared Modal
 * does not portal, so opening this from inside the board put its z-50 inside the
 * board's own stacking context — where it lost to a bottom nav sitting at z-40 on
 * the document. A high z-index cannot help with that; leaving the context can.
 *
 * A sheet rising from the bottom on a phone and a centred card on a desktop: on a
 * phone a centred dialog leaves dead space above and below and puts the actions in
 * the middle of the screen, away from the thumb.
 */
export function ShroomDetail({
  shroom,
  channel,
  allShrooms,
  isRunning,
  onClose,
  onRun,
  onEdit,
}: ShroomDetailProps) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  const avatar = resolveAvatar(shroom.id, shroom.avatar);
  const palette = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  const ink = textOn(palette.bg);
  const facts = describeShroom(shroom, channel, allShrooms);
  const trail = buildShroomTrail(shroom, channel);

  const readsAlso = trail.readsColumnIds
    .map((id) => channel?.columns.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  // Only ever opened by a click, so there is no server render to match — the guard
  // is for the portal target, not for hydration.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-neutral-900 sm:max-h-[80vh] sm:max-w-md sm:rounded-2xl"
      >
        {/* Grab handle — a sheet that rises from the bottom should look draggable
            even where it isn't yet. */}
        <div className="flex justify-center pt-2 sm:hidden" style={{ backgroundColor: palette.bg }}>
          <span className="h-1 w-9 rounded-full" style={{ backgroundColor: ink, opacity: 0.35 }} />
        </div>

        <div
          className="flex flex-shrink-0 items-center gap-3 px-5 pb-4 pt-3 sm:pt-4"
          style={{ backgroundColor: palette.bg }}
        >
          <ShroomAvatar id={shroom.id} avatar={shroom.avatar} size={54} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] font-semibold leading-tight" style={{ color: ink }}>
              {shroom.title}
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: ink, opacity: 0.72 }}>
              {facts.trigger ? `Runs ${facts.trigger.toLowerCase()}` : 'Runs when you ask'}
              {facts.lastRun ? ` · last run ${facts.lastRun.toLowerCase()}` : ' · never run'}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[13.5px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            {facts.summary}
          </p>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              What it does
            </h3>
            <ol className="space-y-2">
              {trail.stops.map((stop, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-[1px] flex flex-shrink-0 items-center justify-center rounded-full font-mono text-[9.5px] font-bold text-white"
                    style={{ backgroundColor: palette.bg, width: 18, height: 18 }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] leading-snug text-neutral-700 dark:text-neutral-300">
                    {stop.verb}
                    {stop.offBoard === 'review' && (
                      <span className="block text-[11.5px] text-amber-600 dark:text-amber-400">
                        waits for your approval
                      </span>
                    )}
                    {stop.offBoard === 'report' && (
                      <span className="block text-[11.5px] text-neutral-500">
                        emailed, not put on the board
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {trail.conditional && (
              <p className="mt-2 text-[11.5px] text-neutral-500">
                It decides per card, so it may not touch every one.
              </p>
            )}
          </section>

          <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 text-[12px] dark:divide-neutral-800 dark:border-neutral-800">
            {/* No "Runs" row: the header already said when, and repeating it two
                inches lower reads as two different facts. */}
            {facts.totalRuns > 0 && (
              <Row
                label="Times run"
                value={`${facts.totalRuns}${facts.totalRuns >= 10 ? '+' : ''}`}
              />
            )}
            {facts.chainsTo && <Row label="Then hands off to" value={facts.chainsTo} />}
            <Row label="Reads" value={trail.readsEverything ? 'the whole board' : readsAlso || 'only what it acts on'} />
            {facts.usesWeb && <Row label="Goes online" value="every run" />}
          </dl>
        </div>

        <div
          className="flex flex-shrink-0 gap-2 border-t border-neutral-200 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-neutral-800"
        >
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
      </div>
    </div>,
    document.body
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
