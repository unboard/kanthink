'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, ChevronDown, Loader2, MapPin, Plus, Square, X } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';
import { formatElapsed } from '@/components/kan/KanTrace';
import type { AgentEvent } from '@/lib/kan/agent/events';

/**
 * The way you run Kan City: one box at the bottom, typed or spoken. It's the Kan
 * agent with the city's own tools (switch bots on, send them to work, sort what came
 * in, carry out the plan), and it knows which building you're looking at. Every
 * step Kan takes is handed up as it happens, so the city can show where it landed.
 *
 * The thread folds away to a single line, so the city stays the thing you look at.
 */

export interface ChatStep {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  href?: string;
  write?: boolean;
  kind?: 'thinking';
  startedAt: number;
}

type Turn =
  | { id: string; role: 'user'; text: string; about?: string }
  | { id: string; role: 'kan'; text: string; steps: ChatStep[]; suggestions: { label: string; prompt: string }[]; memo?: string; error?: string; startedAt: number; endedAt?: number };

export interface ChatFocus { channelId?: string; name?: string; kind?: string }

export interface CityChatHandle {
  /** Say something to Kan, now. */
  ask(prompt: string): void;
  /** Put words in the box for the user to finish. */
  prefill(text: string): void;
}

const STORE_KEY = 'kan-city-thread-v1';
const uid = () => Math.random().toString(36).slice(2, 10);

export const CityChat = forwardRef<CityChatHandle, {
  focus: ChatFocus | null;
  onClearFocus(): void;
  /** Every step as it starts and finishes. */
  onStep?(step: ChatStep): void;
  onTurnStart?(text: string): void;
  onTurnEnd?(): void;
  starters: { label: string; prompt: string }[];
  /** Panels on the right cover this many px on wide screens. */
  rightInset?: number;
  leftInset?: number;
  /** Hide the thread (a sheet is up on a phone). */
  compact?: boolean;
  onHeight?(px: number): void;
}>(function CityChat({ focus, onClearFocus, onStep, onTurnStart, onTurnEnd, starters, rightInset = 0, leftInset = 0, compact, onHeight }, ref) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [foldOpen, setFoldOpen] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onStep, onTurnStart, onTurnEnd });
  cb.current = { onStep, onTurnStart, onTurnEnd };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { turns: Turn[]; cardIds: string[] } | null;
      if (saved) {
        setTurns(saved.turns.map((t) => (t.role === 'kan' && !t.endedAt ? { ...t, endedAt: Date.now(), error: t.text ? undefined : 'Interrupted' } : t)));
        setCardIds(saved.cardIds ?? []);
      }
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    try { if (turns.length) localStorage.setItem(STORE_KEY, JSON.stringify({ turns: turns.slice(-40), cardIds })); } catch { /* full */ }
  }, [turns, cardIds]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [turns, open]);

  // Tell the page how tall the dock is, so the city can keep things above it.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeight) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  const patchKan = useCallback((id: string, fn: (t: Extract<Turn, { role: 'kan' }>) => Extract<Turn, { role: 'kan' }>) => {
    setTurns((all) => all.map((t) => (t.id === id && t.role === 'kan' ? fn(t) : t)));
  }, []);

  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const cardIdsRef = useRef(cardIds);
  cardIdsRef.current = cardIds;

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busyRef.current) return;
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    const f = focusRef.current;
    const about = f?.name;
    const user: Turn = { id: uid(), role: 'user', text: content, about };
    const kanId = uid();
    const kan: Turn = { id: kanId, role: 'kan', text: '', steps: [], suggestions: [], startedAt: Date.now() };
    const history = [...turnsRef.current, user]
      .filter((t) => t.role === 'user' || !t.error || t.text)
      .map((t) => ({
        role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: t.role === 'kan' && t.memo ? `${t.text}\n\n[What I did that turn]\n${t.memo}` : t.text,
      }));
    setTurns((all) => [...all, user, kan]);
    setBusy(true);
    setOpen(true);
    setTick(Date.now());
    cb.current.onTurnStart?.(content);

    const controller = new AbortController();
    abortRef.current = controller;
    let pendingBreak = false;
    try {
      const res = await fetch('/api/prototypes/kan/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          sessionCardIds: cardIdsRef.current,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          city: { focus: f },
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(res.status === 401 ? 'Sign in first' : data.error || `Kan couldn't answer (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as AgentEvent;
          if (e.t === 'text') {
            const brk = pendingBreak;
            pendingBreak = false;
            patchKan(kanId, (t) => ({ ...t, text: t.text + (brk && t.text && !t.text.endsWith('\n') ? '\n\n' : '') + e.delta }));
          } else if (e.t === 'break') {
            pendingBreak = true;
          } else if (e.t === 'step') {
            let out: ChatStep | null = null;
            patchKan(kanId, (t) => {
              const at = t.steps.findIndex((s) => s.id === e.id);
              const steps = [...t.steps];
              if (at < 0) steps.push({ id: e.id, label: e.label ?? '', status: e.status, href: e.href, write: e.write, kind: e.kind, startedAt: Date.now() });
              else steps[at] = { ...steps[at], label: e.label ?? steps[at].label, status: e.status, href: e.href ?? steps[at].href, write: e.write ?? steps[at].write };
              out = steps[at < 0 ? steps.length - 1 : at];
              return { ...t, steps };
            });
            // The setter runs synchronously in React 18's batching only for the latest state;
            // build the step from the event as well so the city never waits on a render.
            cb.current.onStep?.(out ?? { id: e.id, label: e.label ?? '', status: e.status, href: e.href, write: e.write, kind: e.kind, startedAt: Date.now() });
          } else if (e.t === 'suggest') {
            patchKan(kanId, (t) => ({ ...t, suggestions: e.options }));
          } else if (e.t === 'done') {
            patchKan(kanId, (t) => ({ ...t, memo: e.memo, endedAt: Date.now() }));
            if (e.cardIds?.length) setCardIds((ids) => [...ids, ...e.cardIds!].slice(-10));
          } else if (e.t === 'error') {
            patchKan(kanId, (t) => ({ ...t, error: e.message, endedAt: Date.now() }));
          }
        }
      }
    } catch (err) {
      const stopped = controller.signal.aborted;
      patchKan(kanId, (t) => ({ ...t, error: stopped ? 'Stopped' : err instanceof Error ? err.message : 'Something went wrong', endedAt: Date.now() }));
    } finally {
      patchKan(kanId, (t) => ({ ...t, endedAt: t.endedAt ?? Date.now(), steps: t.steps.map((s) => (s.status === 'running' ? { ...s, status: 'done' } : s)) }));
      abortRef.current = null;
      setBusy(false);
      cb.current.onTurnEnd?.();
    }
  }, [patchKan]);

  useImperativeHandle(ref, () => ({
    ask: (prompt) => void send(prompt),
    prefill: (text) => {
      setDraft(text);
      setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(text.length, text.length);
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      }, 0);
    },
  }), [send]);

  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
    setCardIds([]);
    try { localStorage.removeItem(STORE_KEY); } catch { /* fine */ }
  };

  const last = [...turns].reverse().find((t) => t.role === 'kan') as Extract<Turn, { role: 'kan' }> | undefined;
  const running = last && !last.endedAt ? [...last.steps].reverse().find((s) => s.status === 'running') : undefined;
  const glance = busy
    ? running?.label ?? (last?.text ? last.text.split('\n')[0] : 'Thinking')
    : last?.error ?? (last?.text ? last.text.replace(/[#*_`>]/g, '').split('\n').find((l) => l.trim()) : null);
  const chips = !busy && last?.endedAt && last.suggestions.length ? last.suggestions : turns.length ? [] : starters;
  const showThread = open && !compact && turns.length > 0;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-0 z-30 flex flex-col items-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      style={{ right: rightInset, left: leftInset }}
    >
      <div className="pointer-events-auto w-full max-w-[640px]">
        {showThread && (
          <div className="mb-2 overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/85 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-400"><KanthinkIcon size={14} className="text-violet-400" /> Kan</span>
              <span className="flex items-center gap-0.5">
                <button onClick={reset} className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-neutral-500 hover:bg-white/5 hover:text-neutral-200"><Plus className="h-3.5 w-3.5" /> New</button>
                <button onClick={() => setOpen(false)} aria-label="Fold the thread away" className="rounded-full p-1.5 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"><ChevronDown className="h-4 w-4" /></button>
              </span>
            </div>
            <div className="max-h-[min(46vh,420px)] space-y-4 overflow-y-auto px-4 pb-4 pt-1">
              {turns.map((t) => t.role === 'user' ? (
                <div key={t.id} className="flex flex-col items-end gap-1">
                  {t.about && <span className="flex items-center gap-1 text-[11px] text-neutral-500"><MapPin className="h-3 w-3" /> {t.about}</span>}
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-violet-600/25 px-3.5 py-2 text-[14px] leading-relaxed text-neutral-100">{t.text}</p>
                </div>
              ) : (
                <div key={t.id} className="space-y-2">
                  <Steps turn={t} now={tick} open={Boolean(foldOpen[t.id])} onToggle={() => setFoldOpen((o) => ({ ...o, [t.id]: !o[t.id] }))} />
                  {t.text && (
                    <div className="prose prose-invert prose-neutral max-w-none break-words text-[14px] leading-relaxed text-neutral-200 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:mb-1 prose-headings:mt-3 prose-headings:text-[14px] prose-a:text-violet-300 prose-a:no-underline hover:prose-a:underline prose-strong:text-neutral-100 first:prose-p:mt-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
                    </div>
                  )}
                  {t.error && <p className="text-[13px] text-rose-300">{t.error}</p>}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
        )}

        {!showThread && !compact && glance && (
          <button
            onClick={() => setOpen(true)}
            className="mx-auto mb-2 flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-neutral-950/80 px-3.5 py-1.5 text-[13px] text-neutral-200 shadow-lg backdrop-blur-xl hover:bg-neutral-900/90"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400" /> : <KanthinkIcon size={14} className="flex-shrink-0 text-violet-400" />}
            <span className="truncate">{glance}</span>
          </button>
        )}

        {chips.length > 0 && !compact && (
          <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-0.5">
            {chips.map((s) => (
              <button
                key={s.label}
                onClick={() => void send(s.prompt)}
                title={s.prompt}
                className="flex-shrink-0 rounded-full border border-white/15 bg-neutral-950/70 px-3 py-1.5 text-[13px] text-neutral-100 shadow backdrop-blur-xl hover:border-violet-400/70"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
          className="flex items-end gap-1.5 rounded-[26px] border border-white/12 bg-neutral-950/85 py-1.5 pl-2 pr-1.5 shadow-2xl backdrop-blur-xl focus-within:border-violet-400/50"
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Fold the thread away' : 'Show the thread'}
            className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/15 hover:bg-violet-500/25"
          >
            <KanthinkIcon size={18} className="text-violet-300" />
          </button>
          <div className="min-w-0 flex-1">
            {focus?.name && (
              <span className="mb-0.5 mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-white/8 py-0.5 pl-2 pr-1 text-[11px] text-neutral-300">
                <MapPin className="h-3 w-3 flex-shrink-0 text-violet-300" />
                <span className="truncate">{focus.name}</span>
                <button type="button" onClick={onClearFocus} aria-label="Talk about the whole city" className="rounded-full p-0.5 text-neutral-500 hover:text-neutral-200"><X className="h-3 w-3" /></button>
              </span>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); }
                if (e.key === 'Escape') setOpen(false);
              }}
              rows={1}
              placeholder={focus?.name ? `Ask about ${focus.name}…` : 'Ask Kan, or tell your bots…'}
              className="block max-h-[160px] min-h-[24px] w-full resize-none bg-transparent px-1.5 py-2 text-[15px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
          <VoiceMicButton
            size="md"
            onTranscription={(t) => {
              // Spoken with nothing typed goes straight to Kan; otherwise it adds to the draft.
              if (!draft.trim()) void send(t);
              else setDraft((d) => `${d} ${t}`);
            }}
            className="mb-0.5 !h-9 !w-9 !rounded-full text-violet-300 hover:bg-white/5"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop" className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Send" className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
});

/** What Kan did: while it works, every step; after, reads fold away and changes stay. */
function Steps({ turn, now, open, onToggle }: { turn: Extract<Turn, { role: 'kan' }>; now: number; open: boolean; onToggle(): void }) {
  const working = !turn.endedAt;
  if (!turn.steps.length) {
    return working && !turn.text ? <Line step={{ id: 'x', label: 'Thinking', status: 'running', startedAt: turn.startedAt }} now={now} /> : null;
  }
  if (working || open) {
    return (
      <div className="space-y-1">
        {!working && <button onClick={onToggle} className="text-[12px] text-neutral-500 hover:text-neutral-300">Hide steps</button>}
        {turn.steps.map((s) => <Line key={s.id} step={s} now={now} />)}
      </div>
    );
  }
  const changes = turn.steps.filter((s) => s.write || s.status === 'error');
  return (
    <div className="space-y-1">
      <button onClick={onToggle} className="text-[12px] text-neutral-500 hover:text-neutral-300">
        Worked for {formatElapsed((turn.endedAt ?? now) - turn.startedAt)} · {turn.steps.length} step{turn.steps.length === 1 ? '' : 's'}
      </button>
      {changes.map((s) => <Line key={s.id} step={s} now={now} />)}
    </div>
  );
}

function Line({ step, now }: { step: ChatStep; now: number }) {
  const running = step.status === 'running';
  return (
    <div className={`flex items-center gap-2 text-[13px] ${step.write && !running ? 'text-neutral-100' : 'text-neutral-400'}`}>
      {running ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400" />
        : step.status === 'error' ? <X className="h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
        : <Check className={`h-3.5 w-3.5 flex-shrink-0 ${step.write ? 'text-violet-400' : 'text-neutral-600'}`} />}
      <span className="min-w-0 truncate">{step.label}</span>
      {running && now - step.startedAt > 2000 && <span className="flex-shrink-0 text-[11px] text-neutral-600">{formatElapsed(now - step.startedAt)}</span>}
    </div>
  );
}
