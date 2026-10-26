'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, ArrowUpRight, Brain, Check, Globe, Loader2, Plus, Square, X } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { VoiceMicButton } from '@/components/ui/VoiceMicButton';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/Trace';
import { formatElapsed } from '@/components/kan/KanTrace';
import type { AgentEvent } from '@/lib/kan/agent/events';

/**
 * Kan, without the board.
 *
 * One column: what's waiting on you, then the conversation, then the composer.
 * Nothing else is on screen, on purpose — the board, channels and shrooms are all
 * still there underneath, as the place Kan files things, not the way in.
 *
 * Kan works in the open: every search, read and change is a trace line as it
 * happens. When it's done the reads fold into one "Worked for 12s" line, but
 * anything it *changed* stays visible, because that's the part you'd want to check.
 */

interface Step {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  kind?: 'thinking';
  detail?: string;
  href?: string;
  write?: boolean;
  sources?: { title: string; url: string }[];
  thinking?: string;
  startedAt: number;
}

type Turn =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'kan';
      text: string;
      steps: Step[];
      suggestions: { label: string; prompt: string }[];
      memo?: string;
      error?: string;
      startedAt: number;
      endedAt?: number;
    };

interface NowItem { id: string; title: string; why: string; prompt: string }

const STORE_KEY = 'kan-agent-thread-v1';
const uid = () => Math.random().toString(36).slice(2, 10);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function greeting(name: string | null) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return name ? `${part}, ${name}.` : `${part}.`;
}

// --- Trace pieces ---------------------------------------------------------------

function StepIcon({ step }: { step: Step }) {
  if (step.status === 'running') return <Loader2 className="animate-spin text-violet-400 motion-reduce:animate-none" />;
  if (step.status === 'error') return <X />;
  if (step.kind === 'thinking') return <Brain />;
  if (step.sources) return <Globe />;
  return <Check className={step.write ? 'text-violet-400' : 'text-neutral-500'} />;
}

function StepLine({ step, now }: { step: Step; now: number }) {
  const running = step.status === 'running';
  const elapsed = running && now - step.startedAt > 2000 ? formatElapsed(now - step.startedAt) : undefined;
  const line = (
    <TraceLine status={running ? 'running' : step.status === 'error' ? 'error' : undefined} className={step.write && !running ? '!text-neutral-200' : ''}>
      <TraceIcon><StepIcon step={step} /></TraceIcon>
      <TraceTitle>{step.label}</TraceTitle>
      {(elapsed || step.detail) && <TraceDescription>{elapsed ?? step.detail}</TraceDescription>}
      {step.href && <TraceIcon><ArrowUpRight /></TraceIcon>}
    </TraceLine>
  );

  // Thinking and web searches open to show what's behind them.
  if (step.thinking || step.sources?.length) {
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="text-[13px]">
          {step.thinking && <p className="whitespace-pre-wrap">{step.thinking.trim()}</p>}
          {step.sources?.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block truncate py-0.5 hover:text-neutral-100">
              {s.title || s.url}
            </a>
          ))}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }
  if (step.href) {
    const external = /^https?:/.test(step.href);
    return (
      <a href={step.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        {line}
      </a>
    );
  }
  return line;
}

function TurnTrace({ turn, now }: { turn: Extract<Turn, { role: 'kan' }>; now: number }) {
  const working = !turn.endedAt;
  const [open, setOpen] = useState<boolean>();
  if (!turn.steps.length) {
    return working && !turn.text ? (
      <Trace><StepLine step={{ id: 'start', label: 'Thinking', status: 'running', startedAt: turn.startedAt }} now={now} /></Trace>
    ) : null;
  }
  if (working) {
    return <Trace>{turn.steps.map((s) => <StepLine key={s.id} step={s} now={now} />)}</Trace>;
  }
  // Done: reads fold away, changes stay out.
  const changes = turn.steps.filter((s) => s.write || s.status === 'error');
  const took = formatElapsed((turn.endedAt ?? now) - turn.startedAt);
  return (
    <Trace>
      <TraceCollapsible open={open ?? false} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>Worked for {took}</TraceTitle>
            <TraceDescription>{turn.steps.length} step{turn.steps.length === 1 ? '' : 's'}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>{turn.steps.map((s) => <StepLine key={s.id} step={s} now={now} />)}</Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
      {!open && changes.map((s) => <StepLine key={s.id} step={s} now={now} />)}
    </Trace>
  );
}

// --- Page -----------------------------------------------------------------------

export default function KanAgentPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [now, setNow] = useState<{ items: NowItem[]; name: string | null } | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = load<{ turns: Turn[]; cardIds: string[] }>(STORE_KEY, { turns: [], cardIds: [] });
    // A turn that was mid-flight when the page closed can't resume; close it honestly.
    setTurns(saved.turns.map((t) => (t.role === 'kan' && !t.endedAt ? { ...t, endedAt: Date.now(), error: t.text ? undefined : 'Interrupted' } : t)));
    setCardIds(saved.cardIds);
    fetch('/api/prototypes/kan/now')
      .then((r) => {
        if (r.status === 401) setSignedOut(true);
        return r.ok ? r.json() : { items: [], name: null };
      })
      .then(setNow)
      .catch(() => setNow({ items: [], name: null }));
  }, []);

  useEffect(() => { if (turns.length) save(STORE_KEY, { turns: turns.slice(-60), cardIds }); }, [turns, cardIds]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  const patchKan = useCallback((id: string, fn: (t: Extract<Turn, { role: 'kan' }>) => Extract<Turn, { role: 'kan' }>) => {
    setTurns((all) => all.map((t) => (t.id === id && t.role === 'kan' ? fn(t) : t)));
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setDraft('');
    const user: Turn = { id: uid(), role: 'user', text: content };
    const kanId = uid();
    const kan: Turn = { id: kanId, role: 'kan', text: '', steps: [], suggestions: [], startedAt: Date.now() };
    const history = [...turns, user]
      .filter((t) => t.role === 'user' || !t.error || t.text)
      .map((t) => ({
        role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
        // Kan's own actions ride along with its words, so "that card" still resolves next turn.
        content: t.role === 'kan' && t.memo ? `${t.text}\n\n[What I did that turn]\n${t.memo}` : t.text,
      }));
    setTurns((all) => [...all, user, kan]);
    setBusy(true);
    setTick(Date.now());

    const controller = new AbortController();
    abortRef.current = controller;
    let pendingBreak = false;
    try {
      const res = await fetch('/api/prototypes/kan/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionCardIds: cardIds, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) setSignedOut(true);
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
            patchKan(kanId, (t) => {
              const at = t.steps.findIndex((s) => s.id === e.id);
              if (at < 0) {
                return { ...t, steps: [...t.steps, { id: e.id, label: e.label ?? '', status: e.status, kind: e.kind, detail: e.detail, href: e.href, write: e.write, sources: e.sources, startedAt: Date.now() }] };
              }
              const steps = [...t.steps];
              const prev = steps[at];
              steps[at] = { ...prev, label: e.label ?? prev.label, status: e.status, detail: e.detail ?? prev.detail, href: e.href ?? prev.href, write: e.write ?? prev.write, sources: e.sources ?? prev.sources };
              return { ...t, steps };
            });
          } else if (e.t === 'thinking') {
            patchKan(kanId, (t) => ({ ...t, steps: t.steps.map((s) => (s.id === e.id ? { ...s, thinking: (s.thinking ?? '') + e.delta } : s)) }));
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
      patchKan(kanId, (t) => ({
        ...t,
        endedAt: t.endedAt ?? Date.now(),
        // Anything still spinning when the stream ends didn't finish.
        steps: t.steps.map((s) => (s.status === 'running' ? { ...s, status: 'done' } : s)),
      }));
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, turns, cardIds, patchKan]);

  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
    setCardIds([]);
    try { localStorage.removeItem(STORE_KEY); } catch { /* fine */ }
  };

  const lastKan = [...turns].reverse().find((t) => t.role === 'kan');
  const empty = turns.length === 0;

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0b0b0b] text-neutral-100">
      <header className="flex flex-shrink-0 items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-sm font-medium text-neutral-300">Kan</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          {!empty && (
            <button onClick={reset} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 hover:bg-neutral-900 hover:text-neutral-200">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          )}
          <Link href="/prototypes/kan/bots" className="rounded-full px-2.5 py-1.5 hover:bg-neutral-900 hover:text-neutral-200">Bots</Link>
          <Link href="/" className="rounded-full px-2.5 py-1.5 hover:bg-neutral-900 hover:text-neutral-200">Board</Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-4 pb-8 md:px-6">
          {empty ? (
            <div className="pt-[12vh]">
              <h1 className="text-[26px] font-semibold tracking-tight text-neutral-100">{greeting(now?.name ?? null)}</h1>
              <div className="mt-8">
                {signedOut ? (
                  <div>
                    <p className="text-sm text-neutral-400">Sign in so Kan can see your channels.</p>
                    <button
                      onClick={() => void signIn('google', { callbackUrl: '/prototypes/kan' })}
                      className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
                    >
                      Sign in with Google
                    </button>
                  </div>
                ) : !now ? (
                  <Trace><TraceLine status="running"><TraceTitle>Checking what’s waiting on you</TraceTitle></TraceLine></Trace>
                ) : now.items.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nothing’s waiting on you. What are you thinking about?</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-neutral-500">Waiting on you</p>
                    <ul className="divide-y divide-neutral-900">
                      {now.items.map((item) => (
                        <li key={item.id}>
                          <button onClick={() => void send(item.prompt)} className="group flex w-full items-baseline justify-between gap-4 py-3 text-left">
                            <span className="min-w-0">
                              <span className="block truncate text-[15px] text-neutral-100 group-hover:text-white">{item.title}</span>
                              <span className="block truncate text-[13px] text-neutral-500">{item.why}</span>
                            </span>
                            <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-neutral-600 group-hover:text-violet-400" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              {turns.map((turn) =>
                turn.role === 'user' ? (
                  <div key={turn.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-800/70 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-100">{turn.text}</p>
                  </div>
                ) : (
                  <div key={turn.id} className="space-y-3">
                    <TurnTrace turn={turn} now={tick} />
                    {turn.text && (
                      <div className="prose prose-invert prose-neutral max-w-none break-words text-[15px] leading-relaxed text-neutral-200 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2 prose-headings:text-[15px] prose-a:text-violet-300 prose-a:no-underline hover:prose-a:underline prose-strong:text-neutral-100 prose-code:text-[13px] first:prose-p:mt-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
                      </div>
                    )}
                    {turn.error && <p className="text-sm text-red-400">{turn.error}</p>}
                    {turn === lastKan && turn.endedAt && turn.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {turn.suggestions.map((s) => (
                          <button
                            key={s.label}
                            onClick={() => void send(s.prompt)}
                            title={s.prompt}
                            className="rounded-full border border-neutral-800 px-3 py-1.5 text-[13px] text-neutral-300 transition-colors hover:border-violet-500/60 hover:text-neutral-100"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </main>

      <footer className="flex-shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 md:px-6">
        <form
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
          className="mx-auto flex w-full max-w-[680px] items-end gap-2 rounded-3xl border border-neutral-800 bg-neutral-900/80 py-2 pl-4 pr-2 focus-within:border-neutral-700"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            autoFocus
            placeholder={empty ? 'What are you thinking about?' : 'Reply to Kan'}
            className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
          />
          <VoiceMicButton onTranscription={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} className="mb-0.5" />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Send" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition-opacity hover:bg-violet-400 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
