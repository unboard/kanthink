'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, RotateCcw, X } from 'lucide-react';

import { useStore } from '@/lib/store';
import type { Card as KCard, Channel } from '@/lib/types';

/**
 * ONE LIST — second pass, after the first one hurt to use.
 *
 * The first version took the reference literally and made rotated spines the
 * primary reading surface, three levels of them at once. That was backwards on
 * both counts. In the reference you never *read* the spines to get work done —
 * they are three doors you glance at to go back, and the thing you actually
 * read is the big horizontal list. Turning fifteen labels sideways made the
 * cheapest possible affordance into the most expensive one, and stacking three
 * rails of it removed any sense of where you were standing.
 *
 * So the rule this time: nothing is ever rotated, and at most two levels are on
 * screen — the channel you are in, and the columns inside it. Everything deeper
 * in the hierarchy lives in a picker you open, choose from, and dismiss. That is
 * where the reference's full-bleed numbered list belongs, and it is the only
 * place it appears.
 *
 * What survives from the first attempt is the part that was actually good: you
 * only ever look at one column's cards, and moving is selection plus a
 * destination rather than a drag. Every column in the rail is a destination, and
 * so is every channel in the picker — so moving a card to another board is the
 * same gesture as moving it one row down.
 *
 * Runs on the live store. These are real cards and the moves are real.
 */

function daysSince(iso?: string) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function ageLabel(days: number) {
  if (days === 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

function blurb(card: KCard): string | null {
  if (card.summary?.trim()) return card.summary.trim();
  const msg = card.messages?.find((m) => m.content?.trim());
  return msg ? msg.content.trim().slice(0, 500) : null;
}

/** Channels, in sidebar order, with the folder they sit in — for the picker only. */
type Entry = { channel: Channel; folder: string };

export default function OneListPage() {
  const folders = useStore((s) => s.folders);
  const folderOrder = useStore((s) => s.folderOrder);
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const cards = useStore((s) => s.cards);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const moveCard = useStore((s) => s.moveCard);
  const moveCardToChannel = useStore((s) => s.moveCardToChannel);

  const [sel, setSel] = useState<{ channel: string; column: string | null } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [openInPicker, setOpenInPicker] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ cardId: string; channelId: string; columnId: string } | null>(null);
  const [undo, setUndo] = useState<{ cardId: string; columnId: string; index: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const say = (m: string) => {
    setNote(m);
    setTimeout(() => setNote((n) => (n === m ? null : n)), 3000);
  };

  const entries: Entry[] = useMemo(() => {
    const out: Entry[] = [];
    const ids = folderOrder.length ? folderOrder : Object.keys(folders);
    for (const fid of ids) {
      const f = folders[fid];
      if (!f) continue;
      for (const cid of f.channelIds) if (channels[cid]) out.push({ channel: channels[cid], folder: f.name });
    }
    for (const cid of channelOrder) if (channels[cid]) out.push({ channel: channels[cid], folder: 'Unfiled' });
    return out;
  }, [folders, folderOrder, channels, channelOrder]);

  // Open on something with cards in it, so the first screen is never blank.
  const fallback = useMemo(() => {
    const e = entries.find((x) => x.channel.columns.some((c) => c.cardIds.length > 0)) ?? entries[0];
    if (!e) return null;
    const col = e.channel.columns.find((c) => c.cardIds.length > 0) ?? e.channel.columns[0];
    return { channel: e.channel.id, column: col?.id ?? null };
  }, [entries]);

  const cur = sel ?? fallback;
  const channel = cur ? channels[cur.channel] : null;
  const columns = channel?.columns ?? [];
  const columnId = channel && cur?.column && columns.some((c) => c.id === cur.column) ? cur.column : (columns[0]?.id ?? null);
  const column = columns.find((c) => c.id === columnId) ?? null;

  const pageCards = useMemo(
    () => (column ? column.cardIds.map((id) => cards[id]).filter(Boolean) : []),
    [column, cards]
  );

  const pickedCard = picked ? cards[picked] : null;
  const total = channel?.columns.reduce((n, c) => n + c.cardIds.length, 0) ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else if (picker) setPicker(false);
      else if (picked) setPicked(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, picker, picked]);

  // ---- moving -------------------------------------------------------------

  const hitColumn = (id: string) => {
    if (!picked || !pickedCard) {
      setSel({ channel: channel!.id, column: id });
      setReading(null);
      return;
    }
    const from = columns.find((c) => c.cardIds.includes(picked));
    if (!from || from.id === id) {
      setPicked(null);
      return;
    }
    setUndo({ cardId: picked, columnId: from.id, index: from.cardIds.indexOf(picked) });
    moveCard(picked, id, 0);
    setPicked(null);
    say(`Moved to ${columns.find((c) => c.id === id)?.name}.`);
  };

  const hitChannel = (id: string) => {
    if (picked) {
      setOpenInPicker(openInPicker === id ? null : id);
      return;
    }
    const ch = channels[id];
    setSel({ channel: id, column: ch?.columns.find((c) => c.cardIds.length > 0)?.id ?? ch?.columns[0]?.id ?? null });
    setPicker(false);
    setReading(null);
  };

  const chooseTarget = (channelId: string, colId: string) => {
    if (!picked || !pickedCard) return;
    if (pickedCard.channelId === channelId) {
      setPicker(false);
      hitColumn(colId);
      return;
    }
    setConfirm({ cardId: picked, channelId, columnId: colId });
  };

  const doCrossMove = () => {
    if (!confirm) return;
    const target = channels[confirm.channelId];
    const created = moveCardToChannel(confirm.cardId, confirm.channelId, confirm.columnId);
    setConfirm(null);
    setPicker(false);
    setPicked(null);
    setUndo(null);
    setOpenInPicker(null);
    if (created) {
      setSel({ channel: confirm.channelId, column: confirm.columnId });
      say(`Moved into ${target?.name ?? 'the other channel'}.`);
    }
  };

  const runUndo = () => {
    if (!undo) return;
    moveCard(undo.cardId, undo.columnId, Math.max(0, undo.index));
    setUndo(null);
    say('Put back.');
  };

  // ---- render -------------------------------------------------------------

  if (!hasHydrated) return <Bare>Loading your board…</Bare>;
  if (!channel) return <Bare>No channels are loaded on this device yet.</Bare>;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0c0c0c] text-neutral-100">
      {/* Where you are. One line, horizontal, always in the same place. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-6">
        <Link href="/prototypes" className="shrink-0 text-white/30 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <button
          onClick={() => {
            setPicker(true);
            setOpenInPicker(null);
          }}
          className="group flex min-w-0 items-baseline gap-2.5 text-left"
        >
          <span className="truncate text-lg font-light tracking-tight text-white sm:text-xl">{channel.name}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 transition-colors group-hover:text-violet-300">
            change
          </span>
        </button>

        <span className="ml-auto hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/25 sm:block">
          {columns.length} columns · {total} cards
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Columns. Horizontal text, always readable, always the drop targets. */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.08] px-3 py-2 md:w-[190px] md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-0 md:py-3">
          {columns.map((c) => {
            const active = c.id === columnId;
            const isTarget = Boolean(picked) && !c.cardIds.includes(picked!);
            return (
              <button
                key={c.id}
                onClick={() => hitColumn(c.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left transition-colors md:mx-2 md:rounded md:px-3 ${
                  active
                    ? 'bg-white/[0.07] text-white'
                    : isTarget
                      ? 'text-violet-300/90 hover:bg-violet-500/12'
                      : 'text-white/45 hover:bg-white/[0.04] hover:text-white/85'
                }`}
              >
                <span className="min-w-0 truncate text-sm font-light md:flex-1">{c.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/25">{c.cardIds.length}</span>
              </button>
            );
          })}
        </nav>

        {/* The cards. The only list on screen. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-5 pt-6 sm:px-10">
            <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">{column?.name}</h1>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              {picked ? 'Pick a column on the left, or change channel to send it elsewhere' : `${pageCards.length} cards`}
            </p>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5 sm:px-10">
            {pageCards.map((card, i) => {
              const isPicked = card.id === picked;
              const isOpen = card.id === reading;
              return (
                <li key={card.id}>
                  <div className="flex items-baseline gap-4 border-b border-white/[0.05] py-3 sm:gap-6">
                    <button
                      onClick={() => {
                        setPicked(isPicked ? null : card.id);
                        setReading(null);
                      }}
                      className="flex min-w-0 flex-1 items-baseline gap-4 text-left sm:gap-6"
                    >
                      <span className={`w-6 shrink-0 font-mono text-[10px] tabular-nums ${isPicked ? 'text-violet-400' : 'text-white/20'}`}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-lg font-light tracking-tight transition-colors sm:text-xl ${
                            isPicked ? 'text-violet-200' : 'text-white/85 hover:text-white'
                          }`}
                        >
                          {card.title}
                        </span>
                        {card.tags && card.tags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-2">
                            {card.tags.slice(0, 4).map((t) => (
                              <span key={t} className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                                {t}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>

                    <button
                      onClick={() => setReading(isOpen ? null : card.id)}
                      className={`shrink-0 font-mono text-[10px] tabular-nums transition-colors ${
                        isOpen ? 'text-white/70' : 'text-white/20 hover:text-white/60'
                      }`}
                    >
                      {ageLabel(daysSince(card.updatedAt))}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-b border-white/[0.05] px-10 pb-5 sm:px-[4.5rem]">
                      <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-white/50">
                        {blurb(card) ?? 'Nothing written on this one yet.'}
                      </p>
                      <Link
                        href={`/channel/${card.channelId}/card/${card.id}`}
                        className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 transition-colors hover:text-white"
                      >
                        Open the card <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}

            {pageCards.length === 0 && <li className="py-10 text-lg font-light text-white/25">Nothing in here.</li>}
          </ul>
        </main>
      </div>

      {/* Status */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-t border-white/[0.08] px-4 sm:px-6">
        {pickedCard ? (
          <>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-300">Holding</span>
            <span className="min-w-0 flex-1 truncate text-sm font-light text-white/70">{pickedCard.title}</span>
            <button onClick={() => setPicked(null)} className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 hover:text-white">
              Put down
            </button>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
            {note ?? 'Your real board — moves here are real'}
          </span>
        )}

        {undo && !pickedCard && (
          <button
            onClick={runUndo}
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3 w-3" /> Undo
          </button>
        )}
      </div>

      {/* The only place the full-bleed numbered list lives: a menu you open and dismiss. */}
      {picker && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[#0c0c0c]">
          <div className="mx-auto max-w-2xl px-6 py-10 sm:py-16">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                  {picked ? 'Send it to' : 'Channels'}
                </p>
                {picked && (
                  <p className="mt-2 max-w-md text-lg font-light text-white/60">{pickedCard?.title}</p>
                )}
              </div>
              <button onClick={() => setPicker(false)} className="shrink-0 text-white/40 transition-colors hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="mt-10">
              {entries.map((e, i) => {
                const isHere = e.channel.id === channel.id;
                const showCols = picked && openInPicker === e.channel.id;
                const prevFolder = entries[i - 1]?.folder;
                return (
                  <li key={e.channel.id}>
                    {e.folder !== prevFolder && (
                      <p className="pb-2 pt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 first:pt-0">
                        {e.folder}
                      </p>
                    )}
                    <button
                      onClick={() => hitChannel(e.channel.id)}
                      className="group flex w-full items-baseline gap-5 border-b border-white/[0.06] py-4 text-left"
                    >
                      <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums text-white/20">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-2xl font-light tracking-tight transition-colors sm:text-3xl ${
                          isHere ? 'text-violet-300' : 'text-white/85 group-hover:text-white'
                        }`}
                      >
                        {e.channel.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/25">
                        {e.channel.columns.reduce((n, c) => n + c.cardIds.length, 0)}
                      </span>
                    </button>

                    {showCols && (
                      <div className="flex flex-wrap gap-2 border-b border-white/[0.06] py-3 pl-11">
                        {e.channel.columns.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => chooseTarget(e.channel.id, c.id)}
                            className="rounded-md border border-violet-400/30 px-3 py-1.5 text-sm font-light text-violet-200 transition-colors hover:bg-violet-500/15"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {confirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-6">
          <div className="w-full max-w-md rounded-lg border border-white/12 bg-[#141414] p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Move between channels</p>
            <p className="mt-3 text-lg font-light leading-snug text-white">
              Move “{cards[confirm.cardId]?.title}” into{' '}
              <span className="text-violet-300">{channels[confirm.channelId]?.name}</span> ·{' '}
              <span className="text-violet-300">
                {channels[confirm.channelId]?.columns.find((c) => c.id === confirm.columnId)?.name}
              </span>
              ?
            </p>
            <p className="mt-3 text-sm font-light text-white/40">
              A real move. The card keeps its thread and tasks but gets a new id, so this one can’t be undone from here.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={doCrossMove}
                className="rounded-md border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                Move it
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border border-white/12 px-4 py-2 text-sm text-white/55 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bare({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full bg-[#0c0c0c] text-neutral-100">
      <div className="border-b border-white/[0.08] px-6 py-3">
        <Link href="/prototypes" className="text-white/35 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      <p className="p-10 text-sm text-white/40">{children}</p>
    </div>
  );
}
