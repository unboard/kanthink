'use client';

import { useState } from 'react';
import { BoardMock, Cap } from './BoardMock';
import { COLUMNS, STATE_COLOR, STATE_LABEL, ACTION_LABEL, type DemoShroom, type OptionProps } from './types';

function Dot({ state }: { state: DemoShroom['state'] }) {
  return (
    <span
      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{ background: STATE_COLOR[state] }}
      title={STATE_LABEL[state]}
    />
  );
}

function colName(id: string | null) {
  return COLUMNS.find((c) => c.id === id)?.name ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
   1 · Spore Rail
   A permanent 40px strip on the right edge. Always visible, never in the way of
   a column, and it expands over the board rather than pushing it.
   ──────────────────────────────────────────────────────────────────────────── */

export function SporeRail({ shrooms, runningId, onRun, onOpen }: OptionProps) {
  const [open, setOpen] = useState(false);

  return (
    <BoardMock
      label="Cost: 40px of width, permanently. Nothing moves when it opens."
      slots={{
        rightRail: (
          <>
            <div className="flex w-10 flex-shrink-0 flex-col items-center gap-1 border-l border-white/[0.06] bg-[#0c0c0f] py-3">
              <button
                onClick={() => setOpen((v) => !v)}
                className="mb-1 rounded-md p-1 text-neutral-600 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
                title={open ? 'Collapse' : 'Expand'}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={open ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'}
                  />
                </svg>
              </button>
              {shrooms.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setOpen(true); onOpen(s); }}
                  className={`relative rounded-lg p-1.5 transition-colors ${
                    runningId === s.id ? 'bg-violet-500/20 text-violet-300' : 'text-neutral-500 hover:bg-white/[0.07] hover:text-violet-300'
                  }`}
                  title={`${s.title} — ${STATE_LABEL[s.state]}`}
                >
                  <Cap size={17} className={runningId === s.id ? 'animate-pulse' : ''} />
                  <span
                    className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-[#0c0c0f]"
                    style={{ background: STATE_COLOR[s.state] }}
                  />
                </button>
              ))}
            </div>

            {open && (
              <div className="absolute bottom-0 right-10 top-0 w-[260px] border-l border-white/[0.08] bg-[#0c0c0f]/95 p-3 backdrop-blur-sm">
                <p className="mb-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">
                  Shrooms · Signals
                </p>
                <div className="space-y-1.5">
                  {shrooms.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onRun(s)}
                      className="flex w-full items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.07]"
                    >
                      <Dot state={s.state} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-neutral-200">{s.title}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-neutral-600">
                          {s.trigger ?? 'On demand'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   2 · Cap Row
   The strip under the header, but collapsed to one line by default. Shipping this
   means the board loses ~26px of height on every channel — the cheapest slot to
   take, and the one everyone reaches for first.
   ──────────────────────────────────────────────────────────────────────────── */

export function CapRow({ shrooms, runningId, onRun }: OptionProps) {
  const [expanded, setExpanded] = useState(false);
  const watching = shrooms.filter((s) => s.state === 'watching').length;

  return (
    <BoardMock
      label="Cost: 26px of height collapsed, ~60px open. Everything shifts down when it opens."
      slots={{
        underHeader: (
          <div className="border-y border-white/[0.05] bg-white/[0.015] px-4 py-1.5">
            {!expanded ? (
              <button
                onClick={() => setExpanded(true)}
                className="group flex w-full items-center gap-2 text-left"
              >
                <Cap size={13} className="text-violet-400/80" />
                <span className="text-[11.5px] text-neutral-400">
                  {shrooms.length} shrooms
                </span>
                <span className="text-neutral-700">·</span>
                <span className="flex items-center gap-1.5 text-[11.5px] text-neutral-500">
                  <Dot state="watching" />
                  {watching} watching
                </span>
                <span className="hidden text-[11.5px] text-neutral-600 sm:inline">
                  · Inbox Analyzer ran 2h ago
                </span>
                <svg
                  className="ml-auto h-3.5 w-3.5 text-neutral-600 transition-transform group-hover:text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {shrooms.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onRun(s)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                      runningId === s.id
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/[0.07] bg-white/[0.04] text-neutral-300 hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200'
                    }`}
                    title={s.blurb}
                  >
                    <Dot state={s.state} />
                    <span className="max-w-[140px] truncate">{s.title}</span>
                  </button>
                ))}
                <button
                  onClick={() => setExpanded(false)}
                  className="ml-auto rounded-md p-1 text-neutral-600 hover:text-neutral-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   3 · Column Watchers
   No global chrome at all. A shroom appears above the column it acts on, because
   that is the only place its behaviour is legible: you learn what Inbox Analyzer
   does by seeing it sitting on Inbox.
   ──────────────────────────────────────────────────────────────────────────── */

export function ColumnWatchers({ shrooms, runningId, onRun }: OptionProps) {
  const [openCol, setOpenCol] = useState<string | null>(null);

  const forColumn = (id: string) => shrooms.filter((s) => s.watches === id);

  return (
    <BoardMock
      label="Cost: nothing global. A cap only appears on columns a shroom actually touches."
      slots={{
        columnAccessory: (colId) => {
          const list = forColumn(colId);
          if (list.length === 0) return null;
          const anyRunning = list.some((s) => s.id === runningId);
          return (
            <div className="relative">
              <button
                onClick={() => setOpenCol(openCol === colId ? null : colId)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors ${
                  anyRunning
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-neutral-600 hover:bg-white/[0.07] hover:text-violet-300'
                }`}
                title={`${list.length} shroom${list.length > 1 ? 's' : ''} on this column`}
              >
                <Cap size={13} className={anyRunning ? 'animate-pulse' : ''} />
                {list.length > 1 && <span className="font-mono text-[10px]">{list.length}</span>}
              </button>

              {openCol === colId && (
                <div className="absolute right-0 top-6 z-20 w-[228px] rounded-xl border border-white/[0.09] bg-[#141418] p-1.5 shadow-2xl">
                  {list.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { onRun(s); setOpenCol(null); }}
                      className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex items-center gap-1.5">
                        <Dot state={s.state} />
                        <span className="truncate text-[12px] font-medium text-neutral-200">{s.title}</span>
                      </span>
                      <span className="mt-0.5 block pl-3 font-mono text-[10px] text-neutral-600">
                        {ACTION_LABEL[s.action]}
                        {s.movesTo ? ` → ${colName(s.movesTo)}` : ''}
                      </span>
                    </button>
                  ))}
                  <button className="mt-1 w-full rounded-lg border border-dashed border-white/[0.1] px-2 py-1.5 text-[11px] text-neutral-500 hover:border-violet-500/30 hover:text-violet-300">
                    + Add a shroom to {colName(colId)}
                  </button>
                </div>
              )}
            </div>
          );
        },
        columnFooter: (colId) =>
          forColumn(colId).length === 0 ? (
            <button className="rounded-lg border border-dashed border-white/[0.06] px-3 py-2 text-left text-[11px] text-neutral-700 transition-colors hover:border-violet-500/25 hover:text-violet-400/80">
              + shroom
            </button>
          ) : null,
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   4 · Shroom Column
   Shrooms become a column. They scroll with the board, sit at the end of the
   grammar the board already has, and a card can be dragged onto one to run it.
   ──────────────────────────────────────────────────────────────────────────── */

export function ShroomColumn({ shrooms, runningId, onRun }: OptionProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <BoardMock
      label="Cost: none on screen — it's past the last column. Costs a scroll to reach."
      slots={{
        boardEnd: (
          <div className="flex w-[224px] flex-shrink-0 flex-col">
            <div className="mb-2 flex items-center gap-2 px-1">
              <Cap size={13} className="text-violet-400/80" />
              <h3 className="text-[12px] font-medium text-neutral-300">Shrooms</h3>
              <span className="font-mono text-[10px] text-neutral-600">{shrooms.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {shrooms.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onRun(s)}
                  onMouseEnter={() => setDragOver(s.id)}
                  onMouseLeave={() => setDragOver(null)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    runningId === s.id
                      ? 'border-violet-500/40 bg-violet-500/[0.12]'
                      : dragOver === s.id
                        ? 'border-violet-500/30 border-dashed bg-violet-500/[0.06]'
                        : 'border-white/[0.06] border-dashed bg-white/[0.02]'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Dot state={s.state} />
                    <span className="truncate text-[12.5px] font-medium text-neutral-200">{s.title}</span>
                  </span>
                  <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">
                    {dragOver === s.id ? 'Drop a card to run' : (s.trigger ?? 'On demand')}
                  </span>
                </button>
              ))}
              <button className="rounded-lg border border-dashed border-white/[0.07] px-3 py-2 text-[11.5px] text-neutral-600 hover:border-violet-500/30 hover:text-violet-300">
                + New shroom
              </button>
            </div>
          </div>
        ),
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   5 · Kan Dock
   No new furniture: the Ask Kan button already floats there. Press and it grows
   a stalk of shrooms. Kan and his shrooms are the same idea, so one control.
   ──────────────────────────────────────────────────────────────────────────── */

export function KanDock({ shrooms, runningId, onRun }: OptionProps) {
  const [open, setOpen] = useState(true);

  return (
    <BoardMock
      label="Cost: zero layout. Reuses a control that is already floating on every board."
      slots={{
        overlay: (
          <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-2">
            {open && (
              <div className="pointer-events-auto flex flex-col items-end gap-1.5">
                {shrooms.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => onRun(s)}
                    style={{ animationDelay: `${i * 35}ms` }}
                    className={`animate-sprout flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-2 shadow-lg backdrop-blur transition-colors ${
                      runningId === s.id
                        ? 'border-violet-500/50 bg-violet-500/20 text-violet-100'
                        : 'border-white/[0.09] bg-[#17171b]/95 text-neutral-300 hover:border-violet-500/35 hover:text-violet-200'
                    }`}
                  >
                    <span className="text-[12px] font-medium">{s.title}</span>
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ background: `${STATE_COLOR[s.state]}22`, color: STATE_COLOR[s.state] }}
                    >
                      <Cap size={13} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#17171b] text-violet-300 shadow-[0_4px_16px_rgba(139,92,246,0.28)] transition-transform active:scale-95"
              title="Ask Kan · hold for shrooms"
            >
              <Cap size={21} />
            </button>
          </div>
        ),
      }}
    />
  );
}
