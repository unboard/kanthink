'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { AppWindow, ArrowLeft, ArrowUpRight, Check, CheckSquare, Loader2, MessageSquare, Plus, Send, X } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { CardDetail, ChannelBoard } from '@/lib/kan/city/channel';

/**
 * A channel's board, worked from inside Kan City. Columns are chips and one column's
 * cards a list, which reads on a phone where lanes don't. Writes reuse the board's own
 * routes (create, reorder); notes go through the city's channel route.
 */

type BoardCard = ChannelBoard['columns'][number]['cards'][number];

export function ChannelSheet(props: {
  channelId: string;
  name: string;
  accent?: string;
  preview?: boolean;
  onClose(): void;
  onChanged?(): void;
  onAsk?(prompt: string): void;
}) {
  const { channelId, name, accent = '#8b5cf6', preview, onClose, onChanged, onAsk } = props;
  const [board, setBoard] = useState<ChannelBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colId, setColId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/prototypes/kan/city/channel/${channelId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Couldn’t load the board');
      setBoard(data);
      setError(null);
      setColId((c) => (c && data.columns.some((x: { id: string }) => x.id === c) ? c : data.columns.find((x: { total: number }) => x.total > 0)?.id ?? data.columns[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the board');
    }
  }, [channelId]);

  useEffect(() => {
    setBoard(null);
    setOpenId(null);
    setColId(null);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openId) setOpenId(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, onClose]);

  const say = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote((n) => (n === text ? null : n)), 2600);
  };

  const total = board?.columns.reduce((n, c) => n + c.total, 0) ?? 0;
  const column = board?.columns.find((c) => c.id === colId) ?? null;
  const canEdit = Boolean(board?.channel.canEdit);

  /** Optimistic move: take the card out of its column and put it on top of the other. */
  const move = async (card: BoardCard | { id: string; title: string }, toColumnId: string) => {
    if (preview) return say('Preview — nothing changes');
    let moved: BoardCard | undefined;
    setBoard((b) => {
      if (!b) return b;
      const cols = b.columns.map((c) => {
        const i = c.cards.findIndex((x) => x.id === card.id);
        if (i < 0) return c;
        moved = c.cards[i];
        return { ...c, total: c.total - 1, cards: c.cards.filter((x) => x.id !== card.id) };
      });
      return { ...b, columns: cols.map((c) => (c.id === toColumnId && moved ? { ...c, total: c.total + 1, cards: [moved, ...c.cards] } : c)) };
    });
    const res = await fetch(`/api/channels/${channelId}/cards/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: card.id, toColumnId, toPosition: 0 }),
    }).catch(() => null);
    if (!res?.ok) {
      say('That move didn’t stick');
      void load();
      return;
    }
    say(`Moved to ${board?.columns.find((c) => c.id === toColumnId)?.name ?? 'the column'}`);
    onChanged?.();
  };

  const add = async (title: string) => {
    if (!column) return;
    if (preview) return say('Preview — nothing changes');
    const temp: BoardCard = { id: `temp-${Date.now()}`, title, snippet: '', messageCount: 0, taskCount: 0, tasksDone: 0, hasApp: false, tags: [], source: 'manual', updatedAt: Date.now() };
    setBoard((b) => (b ? { ...b, columns: b.columns.map((c) => (c.id === column.id ? { ...c, total: c.total + 1, cards: [temp, ...c.cards] } : c)) } : b));
    const res = await fetch(`/api/channels/${channelId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: column.id, title, position: 0 }),
    }).catch(() => null);
    if (!res?.ok) say('Couldn’t add that card');
    void load();
    onChanged?.();
  };

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex h-[72dvh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-950/90 text-neutral-100 shadow-2xl backdrop-blur-xl lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:h-auto lg:w-[420px] lg:rounded-2xl"
      role="dialog"
      aria-label={`${name} board`}
    >
      <div className="mx-auto mt-2 h-1 w-10 flex-shrink-0 rounded-full bg-white/20 lg:hidden" />
      <header className="flex flex-shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: accent }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{board?.channel.name ?? name}</h2>
          <p className="text-[11px] text-neutral-500">{board ? `${total} card${total === 1 ? '' : 's'}` : 'Opening…'}</p>
        </div>
        <Link href={`/channel/${channelId}`} className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-300">
          Full board <ArrowUpRight className="h-3 w-3" />
        </Link>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </header>

      {preview && <p className="mx-4 mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">Preview — nothing changes</p>}

      {error && !board ? (
        <p className="px-4 py-6 text-[13px] text-neutral-500">
          {error}. <button onClick={() => void load()} className="text-violet-400">Try again</button>
        </p>
      ) : openId && board ? (
        <CardView
          channelId={channelId}
          cardId={openId}
          board={board}
          preview={preview}
          onBack={() => setOpenId(null)}
          onMove={(card, to) => void move(card, to)}
          onAsk={onAsk}
          onSay={say}
          onChanged={() => { void load(); onChanged?.(); }}
        />
      ) : (
        <>
          <nav className="flex flex-shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {board
              ? board.columns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setColId(c.id)}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${c.id === colId ? 'bg-violet-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}
                  >
                    {c.name}
                    <span className={c.id === colId ? 'text-violet-200' : 'text-neutral-500'}>{c.total}</span>
                  </button>
                ))
              : [0, 1, 2].map((i) => <span key={i} className="h-6 w-20 flex-shrink-0 animate-pulse rounded-full bg-white/5" />)}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {board && column && canEdit && <AddCard onAdd={(t) => void add(t)} />}
            {!board ? (
              <Skeleton />
            ) : !column ? (
              <p className="px-1 py-6 text-[13px] text-neutral-500">This channel has no columns yet.</p>
            ) : column.cards.length === 0 ? (
              <p className="px-1 py-6 text-center text-[13px] text-neutral-500">Nothing in {column.name}.</p>
            ) : (
              <ul className="space-y-1.5">
                {column.cards.map((c) => (
                  <li key={c.id}>
                    <button
                      disabled={c.id.startsWith('temp-')}
                      onClick={() => setOpenId(c.id)}
                      className="w-full rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.06] disabled:opacity-60"
                    >
                      <p className="text-[13px] font-medium leading-snug text-neutral-100">{c.title}</p>
                      {c.snippet && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-500">{c.snippet}</p>}
                      <Meta card={c} />
                    </button>
                  </li>
                ))}
                {column.total > column.cards.length && (
                  <li className="px-1 pt-1 text-[11px] text-neutral-600">
                    and {column.total - column.cards.length} more on the <Link href={`/channel/${channelId}`} className="text-violet-400">full board</Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </>
      )}

      {note && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/95 px-3.5 py-1.5 text-[12px] text-neutral-100 shadow-lg ring-1 ring-white/10">
          {note}
        </div>
      )}
    </div>
  );
}

function Meta({ card }: { card: BoardCard }) {
  if (!card.messageCount && !card.taskCount && !card.hasApp && !card.tags.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[11px] text-neutral-500">
      {card.messageCount > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{card.messageCount}</span>}
      {card.taskCount > 0 && (
        <span className={`flex items-center gap-1 ${card.tasksDone === card.taskCount ? 'text-emerald-400' : ''}`}>
          <CheckSquare className="h-3 w-3" />{card.tasksDone}/{card.taskCount}
        </span>
      )}
      {card.hasApp && <span className="flex items-center gap-1 text-violet-300"><AppWindow className="h-3 w-3" />app</span>}
      {card.tags.slice(0, 2).map((t) => <span key={t} className="rounded bg-white/5 px-1.5 py-px">{t}</span>)}
    </div>
  );
}

function AddCard({ onAdd }: { onAdd(title: string): void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mb-2 flex w-full items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] text-neutral-500 hover:bg-white/5 hover:text-neutral-300">
        <Plus className="h-3.5 w-3.5" /> Add a card
      </button>
    );
  }
  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (!text.trim()) setOpen(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); setText(''); setOpen(false); }
        if (e.key === 'Enter' && text.trim()) { onAdd(text.trim()); setText(''); }
      }}
      placeholder="Card title, then Enter"
      className="mb-2 w-full rounded-xl border border-violet-500/40 bg-white/5 px-3 py-2 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
    />
  );
}

function Skeleton() {
  return (
    <div className="space-y-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl bg-white/[0.03] px-3 py-3">
          <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function CardView(props: {
  channelId: string;
  cardId: string;
  board: ChannelBoard;
  preview?: boolean;
  onBack(): void;
  onMove(card: { id: string; title: string }, toColumnId: string): void;
  onAsk?(prompt: string): void;
  onSay(text: string): void;
  onChanged(): void;
}) {
  const { channelId, cardId, board, preview, onBack, onMove, onAsk, onSay, onChanged } = props;
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/prototypes/kan/city/channel/${channelId}?card=${encodeURIComponent(cardId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Couldn’t open the card');
      setCard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t open the card');
    }
  }, [channelId, cardId]);

  useEffect(() => { void load(); }, [load]);

  // The column is whatever the board says now, so an optimistic move shows at once.
  const columnId = board.columns.find((c) => c.cards.some((x) => x.id === cardId))?.id ?? card?.columnId;
  const columnName = board.columns.find((c) => c.id === columnId)?.name;

  const send = async () => {
    const text = reply.trim();
    if (!text || !card) return;
    if (preview) return onSay('Preview — nothing changes');
    setSending(true);
    const res = await fetch(`/api/prototypes/kan/city/channel/${channelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, note: text }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) return onSay('That note didn’t save');
    setReply('');
    await load();
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    onChanged();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-1 px-2 pb-2">
        <button onClick={onBack} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> {columnName ?? 'Back'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {error ? (
          <p className="py-6 text-[13px] text-neutral-500">{error}.</p>
        ) : !card ? (
          <div className="space-y-2 py-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-full animate-pulse rounded bg-white/5" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-white/5" />
          </div>
        ) : (
          <>
            <h3 className="text-[16px] font-semibold leading-snug">{card.title}</h3>
            {card.summary && <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{card.summary}</p>}

            {board.channel.canEdit && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Move to</p>
                <div className="flex flex-wrap gap-1.5">
                  {board.columns.map((c) => (
                    <button
                      key={c.id}
                      disabled={c.id === columnId}
                      onClick={() => onMove({ id: card.id, title: card.title }, c.id)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${c.id === columnId ? 'bg-violet-600/25 text-violet-200' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}
                    >
                      {c.id === columnId && <Check className="h-3 w-3" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {onAsk && (
              <button
                onClick={() => onAsk(`About the card “${card.title}” (cardId:${card.id}) in ${board.channel.name}: `)}
                className="mt-3 flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                <KanthinkIcon size={14} /> Ask Kan about this
              </button>
            )}

            {card.tasks.length > 0 && (
              <section className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Tasks · {card.tasks.filter((t) => t.done).length}/{card.tasks.length}
                </p>
                <ul className="space-y-1">
                  {card.tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-[13px]">
                      <span className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${t.done ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-neutral-600'}`}>
                        {t.done && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className={t.done ? 'text-neutral-500 line-through' : 'text-neutral-200'}>{t.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {card.apps.length > 0 && (
              <section className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Apps</p>
                <div className="flex flex-wrap gap-1.5">
                  {card.apps.map((a) =>
                    a.url ? (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20">
                        <AppWindow className="h-3 w-3" />{a.title}<ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      <Link key={a.id} href={`/channel/${channelId}/card/${card.id}`} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10">
                        <AppWindow className="h-3 w-3" />{a.title}<span className="text-neutral-500">· draft</span>
                      </Link>
                    ),
                  )}
                </div>
              </section>
            )}

            <section className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Thread{card.totalMessages ? ` · ${card.totalMessages}` : ''}
              </p>
              {card.totalMessages > card.messages.length && (
                <p className="mb-2 text-[11px] text-neutral-600">
                  Showing the last {card.messages.length}. <Link href={`/channel/${channelId}/card/${card.id}`} className="text-violet-400">See all</Link>
                </p>
              )}
              {card.messages.length === 0 ? (
                <p className="text-[13px] text-neutral-600">Nothing said here yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {card.messages.map((m) => (
                    <li key={m.id} className={`rounded-xl px-3 py-2 ${m.type === 'ai_response' ? 'bg-violet-500/[0.07]' : 'bg-white/[0.03]'}`}>
                      <p className={`mb-0.5 flex items-center gap-1 text-[11px] font-medium ${m.type === 'ai_response' ? 'text-violet-300' : 'text-neutral-400'}`}>
                        {m.type === 'ai_response' && <KanthinkIcon size={11} />}
                        {m.author}
                        {m.type === 'question' && <span className="text-neutral-600">· asked</span>}
                      </p>
                      <div className="prose prose-invert prose-sm max-w-none break-words text-[13px] leading-relaxed text-neutral-200 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-1.5 prose-pre:my-1 prose-a:text-violet-300">
                        <ReactMarkdown>{m.content.length > 3000 ? `${m.content.slice(0, 3000)}…` : m.content}</ReactMarkdown>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div ref={endRef} />
            </section>
          </>
        )}
      </div>
      {card && board.channel.canEdit && (
        <div className="flex flex-shrink-0 items-end gap-2 border-t border-white/5 px-3 py-2.5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            rows={1}
            placeholder="Add a note to the thread"
            className="max-h-28 min-h-[36px] flex-1 resize-none rounded-xl bg-white/5 px-3 py-2 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-violet-500/50"
          />
          <button
            onClick={() => void send()}
            disabled={!reply.trim() || sending}
            aria-label="Add note"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
