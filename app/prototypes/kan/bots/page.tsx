'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Loader2, Play, X } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
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

/**
 * Bots: every channel you own, running itself.
 *
 * Left, the bots and what each said last. Right, one bot: on or off, how often it
 * runs, what it may spend, what it can do, its notes to itself, and the log — every
 * run with its report up top, what it changed always visible, and the full trace
 * one tap away. That log is the whole oversight model: bots don't wait for you.
 */

interface BotSummary {
  channelId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  everyHours: number;
  lastRun: { status: string; summary: string | null; startedAt: string; trigger: string; asks: string[] } | null;
}

interface Step { id: string; label: string; status: 'running' | 'done' | 'error'; write?: boolean; href?: string; detail?: string }

interface Run {
  id: string;
  trigger: 'scheduled' | 'manual' | 'rehearsal';
  status: 'running' | 'done' | 'error' | 'over_budget';
  steps: Step[];
  summary: string | null;
  asks: string[];
  costMillicents: number;
  buildMillicents: number | null;
  model: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface BotDetail {
  channel: { id: string; name: string; description: string | null };
  bot: {
    enabled: boolean; everyHours: number; dailyBudgetCents: number; memory: string | null; lastRunAt: string | null; nextRunAt: string | null; spentTodayCents: number;
    roomCents: number; limitedBy: 'bot' | 'day' | 'month'; limitMessage: string;
  };
  can: Record<string, string[]>;
  runs: Run[];
}

const AREA_LABEL: Record<string, string> = {
  people: 'Talk to people',
  money: 'Money',
  build: 'Build and deploy',
  research: 'Research',
  board: 'Cards and tasks',
  self: 'Itself',
};

const EVERY = [1, 3, 6, 12, 24, 48];
const BUDGETS = [50, 100, 200, 500, 1000];

interface Tally {
  total: number; thinking: number; builds: number; rehearsals: number; runs: number; handoffs: number;
  inputTokens: number; cachedTokens: number; outputTokens: number;
}
interface SpendBot { channelId: string; name: string; enabled: boolean; dailyBudgetCents: number; day: Tally; week: Tally; month: Tally }
interface Spend {
  limits: { dailyCapCents: number; monthlyCapCents: number; perRunCapCents: number };
  totals: { day: Tally; week: Tally; month: Tally };
  bots: SpendBot[];
  history: { date: string; byBot: Record<string, number> }[];
}

const DAY_CAPS = [0, 100, 200, 500, 1000, 2000, 5000];
const MONTH_CAPS = [0, 1000, 2500, 5000, 10000, 25000, 50000];
const RUN_CAPS = [25, 50, 75, 100, 200, 500];
// One shade per bot in the history chart, in list order.
const BOT_COLORS = ['bg-violet-400', 'bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-teal-300', 'bg-fuchsia-400', 'bg-lime-300'];

/** Millicents as dollars. */
const usd = (millicents: number) => `$${(millicents / 100_000).toFixed(2)}`;
const centsLabel = (c: number) => (c === 0 ? 'Paused' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);

function ago(iso: string | null | undefined) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const m = Math.round(-s / 60);
    return m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`;
  }
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const plain = (md: string | null | undefined) => (md || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();

function StepLine({ step }: { step: Step }) {
  const line = (
    <TraceLine status={step.status === 'running' ? 'running' : step.status === 'error' ? 'error' : undefined} className={step.write && step.status !== 'running' ? '!text-neutral-200' : ''}>
      <TraceIcon>
        {step.status === 'running' ? <Loader2 className="animate-spin" /> : step.status === 'error' ? <X /> : step.write ? <Check className="text-violet-400" /> : <span className="block h-1 w-1 rounded-full bg-neutral-600" />}
      </TraceIcon>
      <TraceTitle>{step.label}</TraceTitle>
      {step.detail && <TraceDescription>{step.detail}</TraceDescription>}
      {step.href && <TraceIcon><ArrowUpRight /></TraceIcon>}
    </TraceLine>
  );
  if (!step.href) return line;
  const external = /^https?:/.test(step.href);
  return <a href={step.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{line}</a>;
}

function RunEntry({ run, first }: { run: Run; first: boolean }) {
  const running = run.status === 'running';
  const changes = run.steps.filter((s) => s.write && s.status !== 'running' && !s.label.startsWith('Wrote notes') && !s.label.startsWith('Would: Writing notes'));
  const took = formatElapsed(new Date(run.endedAt ?? Date.now()).getTime() - new Date(run.startedAt).getTime());
  const when = new Date(run.startedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <article className="border-t border-neutral-900 py-5 first:border-t-0">
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
        <span>{when}</span>
        {run.trigger === 'rehearsal' && <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-neutral-400">Rehearsal — nothing changed</span>}
        {run.trigger === 'manual' && <span>· run by you</span>}
        {run.status === 'over_budget' && <span className="text-amber-400">· over budget</span>}
        {run.status === 'error' && <span className="text-red-400">· failed</span>}
      </div>

      {running ? (
        <Trace>{(run.steps.length ? run.steps.slice(-6) : [{ id: 'start', label: 'Getting started', status: 'running' as const }]).map((s) => <StepLine key={s.id} step={s} />)}</Trace>
      ) : (
        <>
          {run.summary && (
            <div className="prose prose-invert prose-sm max-w-none text-[15px] leading-relaxed text-neutral-200 prose-p:my-2 prose-strong:text-neutral-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.summary}</ReactMarkdown>
            </div>
          )}
          {run.error && <p className="text-sm text-red-400">{run.error}</p>}
          {run.asks?.length > 0 && (
            <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-sm text-violet-200">
              {run.asks.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          )}
          {changes.length > 0 && <div className="mt-3"><Trace>{changes.map((s) => <StepLine key={s.id} step={s} />)}</Trace></div>}
          {run.steps.length > 0 && (
            <TraceCollapsible defaultOpen={false} className="mt-2">
              <TraceCollapsibleTrigger>
                <TraceLine>
                  <TraceTitle className="text-xs">
                    {run.steps.length} steps · {took}
                    {run.costMillicents ? ` · ${usd(run.costMillicents)}` : ''}
                    {run.buildMillicents ? ` (build ${usd(run.buildMillicents)})` : ''}
                  </TraceTitle>
                </TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>
                <Trace>{run.steps.map((s) => <StepLine key={s.id} step={s} />)}</Trace>
              </TraceCollapsibleContent>
            </TraceCollapsible>
          )}
        </>
      )}
      {first && running && <p className="mt-2 text-xs text-neutral-600">Running now — this updates as it works.</p>}
    </article>
  );
}

function Meter({ label, spent, capCents }: { label: string; spent: number; capCents: number }) {
  const cap = capCents * 1000;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-neutral-400">{label}</span>
        <span className="text-neutral-200">{usd(spent)} <span className="text-neutral-600">of {capCents === 0 ? '$0 (paused)' : centsLabel(capCents)}</span></span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-900">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-amber-400' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CapSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (c: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-neutral-400">
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-md bg-neutral-900 px-1.5 py-1 text-neutral-200">
        {[...new Set([...options, value])].sort((a, b) => a - b).map((c) => <option key={c} value={c}>{centsLabel(c)}</option>)}
      </select>
    </label>
  );
}

/** Where the money went, by bot, and the ceilings over all of them. */
function SpendPane({ spend, onLimits, onOpen, onBack }: { spend: Spend; onLimits: (l: Partial<Spend['limits']>) => void; onOpen: (channelId: string) => void; onBack: () => void }) {
  const color = new Map(spend.bots.map((b, i) => [b.channelId, BOT_COLORS[i % BOT_COLORS.length]]));
  const peak = Math.max(1, ...spend.history.map((h) => Object.values(h.byBot).reduce((a, b) => a + b, 0)));
  const m = spend.totals.month;
  const cacheShare = m.inputTokens ? Math.round((m.cachedTokens / m.inputTokens) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 pb-16 pt-6 md:px-8">
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 md:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> Bots
      </button>
      <h1 className="text-[24px] font-semibold tracking-tight text-neutral-100">Spend</h1>
      <p className="mt-1 text-sm text-neutral-500">What every bot has spent, including the builds it started. A bot stops at whichever limit it reaches first.</p>

      <div className="mt-6 space-y-4">
        <Meter label="All bots, last 24 hours" spent={spend.totals.day.total} capCents={spend.limits.dailyCapCents} />
        <Meter label="All bots, this month" spent={m.total} capCents={spend.limits.monthlyCapCents} />
      </div>

      <div className="mt-6 rounded-xl border border-neutral-900 px-4 py-2">
        <CapSelect label="All bots may spend, per day" value={spend.limits.dailyCapCents} options={DAY_CAPS} onChange={(c) => onLimits({ dailyCapCents: c })} />
        <CapSelect label="All bots may spend, per month" value={spend.limits.monthlyCapCents} options={MONTH_CAPS} onChange={(c) => onLimits({ monthlyCapCents: c })} />
        <CapSelect label="Any one run may think for" value={spend.limits.perRunCapCents} options={RUN_CAPS} onChange={(c) => onLimits({ perRunCapCents: c })} />
        <p className="pb-1 pt-0.5 text-xs text-neutral-600">Each bot also has its own daily budget, set on its page. Pausing a ceiling stops every bot until you raise it.</p>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-xs text-neutral-500">Last 14 days</h2>
        <div className="flex h-28 items-end gap-1">
          {spend.history.map((h) => {
            const total = Object.values(h.byBot).reduce((a, b) => a + b, 0);
            return (
              <div key={h.date} className="flex h-full flex-1 flex-col justify-end" title={`${h.date}: ${usd(total)}`}>
                <div className="flex flex-col-reverse overflow-hidden rounded-sm" style={{ height: `${(total / peak) * 100}%`, minHeight: total ? 2 : 0 }}>
                  {Object.entries(h.byBot).map(([id, v]) => <div key={id} className={color.get(id) ?? 'bg-neutral-600'} style={{ height: `${(v / total) * 100}%` }} />)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-neutral-600">
          <span>{spend.history[0]?.date.slice(5)}</span>
          <span>today</span>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-1 grid grid-cols-[1fr_64px_64px_64px] gap-2 text-[11px] text-neutral-600">
          <span>Bot</span><span className="text-right">24 hours</span><span className="text-right">7 days</span><span className="text-right">Month</span>
        </div>
        {spend.bots.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">No bot has spent anything yet.</p>
        ) : spend.bots.map((b) => (
          <button key={b.channelId} onClick={() => onOpen(b.channelId)} className="block w-full border-t border-neutral-900 py-3 text-left hover:bg-neutral-900/40">
            <div className="grid grid-cols-[1fr_64px_64px_64px] items-baseline gap-2 text-[14px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color.get(b.channelId)}`} />
                <span className="truncate text-neutral-100">{b.name}</span>
              </span>
              <span className="text-right text-neutral-300">{usd(b.day.total)}</span>
              <span className="text-right text-neutral-400">{usd(b.week.total)}</span>
              <span className="text-right text-neutral-400">{usd(b.month.total)}</span>
            </div>
            <p className="mt-1 pl-4 text-xs text-neutral-600">
              {b.month.runs} run{b.month.runs === 1 ? '' : 's'} this month · thinking {usd(b.month.thinking)}
              {b.month.builds ? ` · builds ${usd(b.month.builds)}` : ''}
              {b.month.rehearsals ? ` · rehearsals ${usd(b.month.rehearsals)}` : ''}
              {b.month.handoffs ? ` · ${b.month.handoffs} to Claude Code` : ''}
              {' · '}{centsLabel(b.dailyBudgetCents)}/day budget{b.enabled ? '' : ' · off'}
            </p>
          </button>
        ))}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-neutral-600">
        Costs come from the AI provider’s own token counts{m.inputTokens ? `; ${cacheShare}% of this month’s input was cached, which bills at a tenth of the price` : ''}.
        Work handed to Claude Code runs on your Claude plan, so it’s counted but not priced here.
      </p>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-violet-600' : 'bg-neutral-800'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function BotsPage() {
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<BotDetail | null>(null);
  const [starting, setStarting] = useState(false);
  const [spend, setSpend] = useState<Spend | null>(null);
  const onSpend = selected === 'spend';

  const loadSpend = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/bots/spend');
    if (r.ok) setSpend(await r.json());
  }, []);

  const saveLimits = async (l: Partial<Spend['limits']>) => {
    setSpend((s) => (s ? { ...s, limits: { ...s.limits, ...l } } : s));
    await fetch('/api/prototypes/kan/bots/spend', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l) });
    void loadSpend();
  };

  const loadList = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/bots');
    if (r.status === 401) { setSignedOut(true); setBots([]); return; }
    const d = await r.json().catch(() => ({ bots: [] }));
    setBots(d.bots ?? []);
  }, []);

  const loadDetail = useCallback(async (channelId: string) => {
    const r = await fetch(`/api/prototypes/kan/bots/${channelId}`);
    if (!r.ok) return;
    setDetail(await r.json());
  }, []);

  useEffect(() => {
    void loadList();
    void loadSpend();
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.has('spend') ? 'spend' : params.get('channel');
    if (fromUrl) setSelected(fromUrl);
  }, [loadList, loadSpend]);

  useEffect(() => {
    setDetail(null);
    if (!selected) return;
    if (selected === 'spend') {
      void loadSpend();
      try { window.history.replaceState(null, '', '/prototypes/kan/bots?spend'); } catch { /* fine */ }
      return;
    }
    void loadDetail(selected);
    try { window.history.replaceState(null, '', `/prototypes/kan/bots?channel=${selected}`); } catch { /* fine */ }
  }, [selected, loadDetail, loadSpend]);

  // Follow a run while it works.
  const live = detail?.runs.some((r) => r.status === 'running');
  useEffect(() => {
    if (!live || !selected) return;
    const t = setInterval(() => { void loadDetail(selected); }, 2000);
    return () => clearInterval(t);
  }, [live, selected, loadDetail]);
  useEffect(() => { if (!live && selected) { void loadList(); void loadSpend(); } }, [live, selected, loadList, loadSpend]);

  const patch = async (body: Partial<{ enabled: boolean; everyHours: number; dailyBudgetCents: number }>) => {
    if (!selected || !detail) return;
    setDetail({ ...detail, bot: { ...detail.bot, ...body } });
    setBots((list) => list?.map((b) => (b.channelId === selected ? { ...b, ...body } : b)) ?? list);
    await fetch(`/api/prototypes/kan/bots/${selected}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    void loadDetail(selected);
  };

  const run = async (rehearsal: boolean) => {
    if (!selected) return;
    setStarting(true);
    await fetch(`/api/prototypes/kan/bots/${selected}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rehearsal }) });
    // The run row lands a moment after the response.
    setTimeout(() => { void loadDetail(selected).finally(() => setStarting(false)); }, 1200);
  };

  const list = (
    <nav className="flex flex-col">
      {bots === null ? (
        <p className="px-4 py-3 text-sm text-neutral-500">Loading…</p>
      ) : signedOut ? (
        <p className="px-4 py-3 text-sm text-neutral-400">Sign in on the <Link href="/prototypes/kan" className="text-violet-400">Kan page</Link> first.</p>
      ) : bots.length === 0 ? (
        <p className="px-4 py-3 text-sm text-neutral-500">You don’t own any channels yet.</p>
      ) : (
        [
          <button
            key="spend"
            onClick={() => setSelected('spend')}
            className={`flex items-center justify-between gap-3 border-b border-neutral-900 px-4 py-3 text-left hover:bg-neutral-900/60 ${onSpend ? 'bg-neutral-900' : ''}`}
          >
            <span className="text-[15px] text-neutral-100">Spend</span>
            {spend && (
              <span className="text-[12px] text-neutral-500">
                {usd(spend.totals.day.total)} today · {spend.limits.dailyCapCents === 0 ? 'paused' : `${centsLabel(spend.limits.dailyCapCents)} cap`}
              </span>
            )}
          </button>,
          ...bots.map((b) => (
          <button
            key={b.channelId}
            onClick={() => setSelected(b.channelId)}
            className={`flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-900/60 ${selected === b.channelId ? 'bg-neutral-900' : ''}`}
          >
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${b.enabled ? 'bg-violet-400' : 'bg-neutral-700'}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] text-neutral-100">{b.name}</span>
                {b.lastRun && <span className="flex-shrink-0 text-[11px] text-neutral-600">{ago(b.lastRun.startedAt)}</span>}
              </span>
              <span className="block truncate text-[13px] text-neutral-500">
                {b.lastRun?.asks?.length ? <span className="text-violet-300">Needs you · </span> : null}
                {b.lastRun ? plain(b.lastRun.summary) || (b.lastRun.status === 'running' ? 'Working…' : b.lastRun.status) : b.enabled ? 'Starts within the hour' : 'Off'}
              </span>
            </span>
          </button>
          )),
        ]
      )}
    </nav>
  );

  const latestAsks = detail?.runs.find((r) => r.status !== 'running' && r.trigger !== 'rehearsal')?.asks ?? [];

  const pane = detail && (
    <div className="mx-auto w-full max-w-[680px] px-4 pb-16 md:px-8">
      <div className="pt-6">
        <button onClick={() => setSelected(null)} className="mb-4 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200 md:hidden">
          <ArrowLeft className="h-3.5 w-3.5" /> Bots
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold tracking-tight text-neutral-100">{detail.channel.name}</h1>
            {detail.channel.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{detail.channel.description}</p>}
          </div>
          <Toggle on={detail.bot.enabled} onChange={(v) => void patch({ enabled: v })} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-neutral-400">
          <label className="flex items-center gap-1.5">
            Runs every
            <select value={detail.bot.everyHours} onChange={(e) => void patch({ everyHours: Number(e.target.value) })} className="rounded-md bg-neutral-900 px-1.5 py-1 text-neutral-200">
              {EVERY.map((h) => <option key={h} value={h}>{h === 1 ? 'hour' : `${h} hours`}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Spends up to
            <select value={detail.bot.dailyBudgetCents} onChange={(e) => void patch({ dailyBudgetCents: Number(e.target.value) })} className="rounded-md bg-neutral-900 px-1.5 py-1 text-neutral-200">
              {[...new Set([...BUDGETS, detail.bot.dailyBudgetCents])].sort((a, b) => a - b).map((c) => <option key={c} value={c}>${(c / 100).toFixed(2)}</option>)}
            </select>
            a day · ${(detail.bot.spentTodayCents / 100).toFixed(2)} today
          </label>
          <button onClick={() => setSelected('spend')} className="text-neutral-500 underline-offset-2 hover:text-neutral-200 hover:underline">All spend</button>
          <span className="text-neutral-600">
            {detail.bot.enabled ? (detail.bot.nextRunAt ? `Next run ${ago(detail.bot.nextRunAt)}` : 'Next run within the hour') : 'Off — runs only when you start it'}
          </span>
        </div>

        {detail.bot.roomCents <= 0 && (
          <p className="mt-3 text-[13px] text-amber-400">
            Paused: {detail.bot.limitMessage}.{' '}
            {detail.bot.limitedBy !== 'bot' && <button onClick={() => setSelected('spend')} className="underline underline-offset-2">Change it</button>}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void run(false)}
            disabled={starting || live}
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {starting || live ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </button>
          <button
            onClick={() => void run(true)}
            disabled={starting || live}
            className="rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
            title="Runs exactly as it would, but changes nothing"
          >
            Rehearse
          </button>
        </div>

        {latestAsks.length > 0 && (
          <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
            <p className="mb-1 text-xs font-medium text-violet-300">Needs you</p>
            {latestAsks.map((a, i) => <p key={i} className="text-sm text-neutral-200">{a}</p>)}
          </div>
        )}

        <div className="mt-6 space-y-1">
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine><TraceTitle className="text-[13px]">What it can do</TraceTitle></TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <div className="space-y-2 py-1 text-[13px]">
                {Object.entries(AREA_LABEL).filter(([a]) => detail.can[a]?.length || a === 'research').map(([area, label]) => (
                  <div key={area}>
                    <span className="text-neutral-300">{label}: </span>
                    <span className="text-neutral-500">{[...(area === 'research' ? ['web search'] : []), ...(detail.can[area] ?? [])].map((n) => n.replace(/_/g, ' ')).join(', ')}</span>
                  </div>
                ))}
              </div>
            </TraceCollapsibleContent>
          </TraceCollapsible>
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine><TraceTitle className="text-[13px]">Its notes to itself</TraceTitle></TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <div className="prose prose-invert prose-sm max-w-none py-1 text-[13px] text-neutral-400">
                {detail.bot.memory ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.bot.memory}</ReactMarkdown> : <p>None yet. It writes these at the end of each run.</p>}
              </div>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-1 text-xs text-neutral-500">Log</h2>
        {detail.runs.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">No runs yet. Rehearse to see what it would do, or switch it on.</p>
        ) : (
          detail.runs.map((r, i) => <RunEntry key={r.id} run={r} first={i === 0} />)
        )}
      </section>
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0b0b0b] text-neutral-100">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-neutral-900 px-4 py-3 md:px-6">
        <Link href="/prototypes/kan" className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-sm font-medium text-neutral-300">Kan</span>
          <ChevronRight className="h-3.5 w-3.5 text-neutral-700" />
          <span className="text-sm text-neutral-400">Bots</span>
        </Link>
        <Link href="/" className="rounded-full px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200">Board</Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={`w-full flex-shrink-0 overflow-y-auto border-neutral-900 md:block md:w-[300px] md:border-r ${selected ? 'hidden' : 'block'}`}>{list}</aside>
        <main className={`min-h-0 flex-1 overflow-y-auto ${selected ? 'block' : 'hidden md:block'}`}>
          {onSpend ? (
            spend ? (
              <SpendPane spend={spend} onLimits={(l) => void saveLimits(l)} onOpen={setSelected} onBack={() => setSelected(null)} />
            ) : (
              <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-neutral-600" /></div>
            )
          ) : pane ?? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-600">
              {selected ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Pick a channel. Each one can run itself.'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
