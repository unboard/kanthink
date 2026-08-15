'use client';

import type { ReactNode } from 'react';
import { COLUMNS, type DemoCard } from './types';

/**
 * A stand-in channel board, so every option can be judged against the thing it has to
 * not obstruct. Each option injects itself through one or two slots and nothing else —
 * which is the point of the round: the slot a concept needs *is* its cost.
 */
export interface BoardSlots {
  /** Sits in the channel header, left of the icon cluster. Costs no vertical space. */
  header?: ReactNode;
  /** Full-width strip between header and columns. Costs height on every board. */
  underHeader?: ReactNode;
  /** Pinned to the right edge of the board area. Costs width. */
  rightRail?: ReactNode;
  /** Rendered inside a column's header row. */
  columnAccessory?: (columnId: string) => ReactNode;
  /** Rendered at the bottom of a column's card stack. */
  columnFooter?: (columnId: string) => ReactNode;
  /** An extra column after the last real one. */
  boardEnd?: ReactNode;
  /** Rendered on a card, revealed on hover. */
  cardAccessory?: (card: DemoCard) => ReactNode;
  /** Absolutely positioned over the whole board area. */
  overlay?: ReactNode;
  /** Behind the columns — the gutters and negative space. */
  underlay?: ReactNode;
}

/** The mushroom cap glyph, drawn small enough to survive at 12px. */
export function Cap({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3C7 3 3 7 3 11c0 1.5 1 2 2 2h14c1 0 2-.5 2-2 0-4-4-8-9-8Z" fill="currentColor" opacity="0.95" />
      <circle cx="8" cy="8" r="1.4" fill="#000" opacity="0.22" />
      <circle cx="14.2" cy="7.2" r="1" fill="#000" opacity="0.22" />
      <circle cx="11" cy="10" r="0.9" fill="#000" opacity="0.22" />
      <path d="M9 13v6c0 1 1 2 3 2s3-1 3-2v-6H9Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function CardTile({ card, accessory }: { card: DemoCard; accessory?: ReactNode }) {
  return (
    <div className="group relative rounded-lg border border-white/[0.06] bg-[#17171b] px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      <p className="text-[12.5px] leading-snug text-neutral-200">{card.title}</p>
      {card.meta && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">{card.meta}</p>
      )}
      {accessory}
    </div>
  );
}

export function BoardMock({ slots = {}, label }: { slots?: BoardSlots; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#0f0f12]">
      {/* Channel header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex-shrink-0 text-[12px] text-neutral-600">Reading</span>
            <span className="text-neutral-700">/</span>
            <h2 className="truncate text-[15px] font-semibold text-neutral-100">Signals</h2>
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-white/[0.05] p-0.5">
            {['Board', 'Tasks', 'List'].map((v, i) => (
              <span
                key={v}
                className={`rounded-md px-2 py-1 text-[11px] ${
                  i === 0 ? 'bg-white/[0.09] text-neutral-100' : 'text-neutral-500'
                }`}
              >
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {slots.header}
          {/* The icons that already live here — new header chrome competes with these */}
          <div className="flex items-center gap-1 text-neutral-600">
            {[
              'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
              'M8.684 13.342A3 3 0 108.683 10.658m0 2.684l6.632 3.316m-6.632-6l6.632-3.316',
              'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
            ].map((d) => (
              <span key={d} className="rounded-md p-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
                </svg>
              </span>
            ))}
          </div>
        </div>
      </header>

      {slots.underHeader}

      {/* Board area */}
      <div className="relative flex">
        {slots.underlay}
        <div className="relative flex flex-1 gap-3 overflow-x-auto px-4 py-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex w-[224px] flex-shrink-0 flex-col">
              <div className="mb-2 flex items-center gap-2 px-1">
                <h3 className="text-[12px] font-medium text-neutral-300">{col.name}</h3>
                <span className="font-mono text-[10px] text-neutral-600">{col.cards.length}</span>
                <div className="ml-auto flex items-center gap-1">
                  {slots.columnAccessory?.(col.id)}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {col.cards.map((card) => (
                  <CardTile key={card.id} card={card} accessory={slots.cardAccessory?.(card)} />
                ))}
                {slots.columnFooter?.(col.id)}
              </div>
            </div>
          ))}
          {slots.boardEnd}
        </div>
        {slots.rightRail}
        {slots.overlay}
      </div>

      {label && (
        <div className="border-t border-white/[0.05] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700">
          {label}
        </div>
      )}
    </div>
  );
}
