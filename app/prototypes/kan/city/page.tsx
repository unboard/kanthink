'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Loader2, Maximize2, Moon, Play, RotateCcw, RotateCw, Sun, Sunrise, Sunset, X, ZoomIn, ZoomOut } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { CityEngine, SKY_CSS, skyFor, type Sky } from '@/components/kan/city/engine';
import type { CityData, CityPlot, Pick } from '@/components/kan/city/types';

/**
 * Kan City: your channels as a place. Every folder is a district and every channel
 * a building that looks like what it's about. Bots walk to work when they run,
 * queue at Town Hall when they need you, and wander the park when they're idle.
 * Shrooms live in the yards and hop when they've just run. Kan does its rounds.
 *
 * Everything here is real and everything here can be acted on: tap a building to
 * see what's in it and put its bot to work; tap Town Hall to answer what's waiting.
 */

interface Approval {
  id: string;
  channelId: string;
  channelName: string;
  status: 'pending' | 'approved' | 'rejected' | 'done' | 'failed';
  title: string;
  purpose: string | null;
  modelId: string | null;
  likelyMillicents: number | null;
  maxMillicents: number | null;
  models: { id: string; label: string; when: string; likelyUsd: number; maxUsd: number }[];
}

const SKIES: { sky: Sky; label: string; Icon: typeof Sun }[] = [
  { sky: 'dawn', label: 'Dawn', Icon: Sunrise },
  { sky: 'day', label: 'Day', Icon: Sun },
  { sky: 'dusk', label: 'Dusk', Icon: Sunset },
  { sky: 'night', label: 'Night', Icon: Moon },
];

const STATUS: Record<CityPlot['bot']['status'], { label: string; dot: string; pill: string }> = {
  working: { label: 'Working', dot: 'bg-emerald-400', pill: 'text-emerald-300 bg-emerald-500/10' },
  needs: { label: 'Needs you', dot: 'bg-amber-400', pill: 'text-amber-200 bg-amber-500/15 ring-1 ring-amber-400/50' },
  idle: { label: 'Idle', dot: 'bg-neutral-400', pill: 'text-neutral-300 bg-neutral-800' },
  paused: { label: 'Out of budget', dot: 'bg-rose-400', pill: 'text-rose-200 bg-rose-500/10' },
  off: { label: 'No bot yet', dot: 'bg-neutral-600', pill: 'text-neutral-500 bg-neutral-900' },
};

const FEED_DOT: Record<string, string> = {
  bot: 'bg-emerald-400', shroom: 'bg-pink-400', app: 'bg-sky-400', you: 'bg-violet-400', kan: 'bg-violet-300', ask: 'bg-amber-400',
};

/**
 * ?preview: pretend some bots are on, so you can see the city busy before you've
 * switched any on. Only the picture changes; nothing is sent anywhere.
 */
function withPretendBots(d: CityData, tick: number): CityData {
  const doing = ['Reading the newest cards', 'Checking what changed overnight', 'Drafting a card', 'Researching prices', 'Tidying the board', 'Writing up what it found'];
  const live = [...d.plots].filter((p) => p.attention !== 'muted').sort((a, b) => b.cards - a.cards).slice(0, 8);
  const plots = d.plots.map((p) => {
    const i = live.findIndex((x) => x.channelId === p.channelId);
    if (i < 0) return p;
    // Every so often a bot finishes and another starts, so you see them move.
    const phase = (i + tick) % 8;
    const status = i === 1 ? 'needs' as const : phase < 3 ? 'working' as const : 'idle' as const;
    return {
      ...p,
      bot: { ...p.bot, on: true, status, doing: status === 'working' ? doing[(i + tick) % doing.length] : null, lastSummary: status === 'idle' ? 'Checked in. Nothing new needed doing.' : p.bot.lastSummary },
      waiting: status === 'needs' ? [{ id: 'preview', title: `${p.name.split(' ')[0]} practice app` }] : [],
    };
  });
  return { ...d, plots, townHall: { ...d.townHall, approvals: [] } };
}

function ago(ms: number | null | undefined) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short' });
const usd = (millicents: number | null | undefined) => `$${((millicents ?? 0) / 100_000).toFixed(2)}`;

export default function CityPage() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const engine = useRef<CityEngine | null>(null);
  const [data, setData] = useState<CityData | null>(null);
  const [state, setState] = useState<'loading' | 'signedOut' | 'empty' | 'ready' | 'error'>('loading');
  const [pick, setPick] = useState<Pick | null>(null);
  const [sky, setSky] = useState<Sky>(() => skyFor(new Date().getHours()));
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { setPreview(new URLSearchParams(window.location.search).has('preview')); }, []);
  useEffect(() => {
    if (!preview) return;
    const t = setInterval(() => setTick((n) => n + 1), 12000);
    return () => clearInterval(t);
  }, [preview]);

  const load = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/city').catch(() => null);
    if (!r) return;
    if (r.status === 401) { setState('signedOut'); return; }
    if (!r.ok) { setState((s) => (s === 'ready' ? s : 'error')); return; }
    const d = await r.json();
    if (d.empty) { setState('empty'); return; }
    setData(d);
    setState('ready');
  }, []);

  const loadApprovals = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/bots/approvals').catch(() => null);
    if (r?.ok) setApprovals(((await r.json()).approvals ?? []).filter((a: Approval) => a.status === 'pending'));
  }, []);

  useEffect(() => { void load(); void loadApprovals(); }, [load, loadApprovals]);

  // Faster while something's happening, so you can watch a bot walk to work.
  const lively = Boolean(data?.plots.some((p) => p.bot.status === 'working' || p.building) || data?.townHall.passRunning);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load(); }, lively ? 3000 : 8000);
    return () => clearInterval(t);
  }, [lively, load]);

  // The scene lives as long as the page.
  useEffect(() => {
    if (state !== 'ready' || engine.current || !host.current || !labels.current) return;
    engine.current = new CityEngine(host.current, labels.current, { onPick: (p) => setPick(p) });
    engine.current.setSky(sky);
    return undefined;
  }, [state, sky]);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  const shown = useMemo(() => (data && preview ? withPretendBots(data, tick) : data), [data, preview, tick]);
  useEffect(() => { if (shown) engine.current?.setData(shown); }, [shown, state]);
  useEffect(() => { engine.current?.setSky(sky); }, [sky]);
  useEffect(() => { engine.current?.select(pick, true); }, [pick]);

  const plots = useMemo(() => shown?.plots ?? [], [shown]);
  const plotOf = useMemo(() => new Map(plots.map((p) => [p.channelId, p])), [plots]);
  const citizens = useMemo(() => {
    const order = { needs: 0, working: 1, paused: 2, idle: 3, off: 4 };
    return plots.filter((p) => p.bot.status !== 'off').sort((a, b) => order[a.bot.status] - order[b.bot.status] || a.name.localeCompare(b.name));
  }, [plots]);
  const counts = useMemo(() => ({
    working: plots.filter((p) => p.bot.status === 'working').length,
    needs: (data?.townHall.approvals.length ?? 0) + (data?.townHall.asks.length ?? 0) + (data?.townHall.pass ? 1 : 0),
    idle: plots.filter((p) => p.bot.status === 'idle').length,
    building: plots.filter((p) => p.building).length,
  }), [plots, data]);
  // Where a bot would help most, for when none are on yet.
  const hires = useMemo(() => plots
    .filter((p) => p.bot.status === 'off' && p.attention !== 'muted' && !p.fixed)
    .sort((a, b) => (b.recentActivity * 3 + b.apps + Math.log2(1 + b.cards)) - (a.recentActivity * 3 + a.apps + Math.log2(1 + a.cards)))
    .slice(0, 3), [plots]);

  // ---------- Actions ----------

  const act = async (key: string, fn: () => Promise<Response>, done?: string) => {
    if (preview) { setNote('This is a preview with pretend bots, so buttons don’t do anything here.'); return; }
    setBusy(key);
    setNote(null);
    try {
      const r = await fn();
      if (!r.ok) setNote((await r.json().catch(() => ({}))).error ?? 'That didn’t work.');
      else if (done) setNote(done);
    } finally {
      await Promise.all([load(), loadApprovals()]);
      setBusy(null);
    }
  };
  const json = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const turnOn = (id: string) => act(`on:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}`, json('PATCH', { enabled: true })), 'A bot is on its way. It’ll get to work in a minute.');
  const turnOff = (id: string) => act(`off:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}`, json('PATCH', { enabled: false })));
  const runNow = (id: string) => act(`run:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}/run`, json('POST', {})), 'Off to work.');
  const decide = (id: string, approve: boolean, extra: { reason?: string; modelId?: string } = {}) =>
    act(`ap:${id}`, () => fetch(`/api/prototypes/kan/bots/approvals/${id}`, json('POST', { approve, ...extra })), approve ? 'Approved. The crane’s going up.' : 'Passed. The bot will read why.');
  const look = () => act('look', () => fetch('/api/prototypes/kan/attention', { method: 'POST' }), 'Kan is reading everything you’ve given it. A minute or two.');
  const applyPass = (id: string) => act('apply', () => fetch(`/api/prototypes/kan/attention/${id}/apply`, { method: 'POST' }), 'Done. Kan rearranged the city.');

  // ---------- Render ----------

  if (state === 'signedOut') {
    return <Shell><p className="mt-20 text-center text-sm text-neutral-400">Sign in on the <Link href="/prototypes/kan" className="text-violet-400">Kan page</Link> first.</p></Shell>;
  }
  if (state === 'empty') {
    return <Shell><p className="mt-20 text-center text-sm text-neutral-400">You don’t have any channels yet, so there’s no city. Make one and it’ll get a building.</p></Shell>;
  }
  if (state === 'error') {
    return <Shell><p className="mt-20 text-center text-sm text-red-400">The city didn’t load. <button onClick={() => void load()} className="text-violet-400">Try again</button></p></Shell>;
  }

  const selectedPlot = pick?.kind === 'plot' ? plotOf.get(pick.id) ?? null : null;

  return (
    <Shell>
      <style dangerouslySetInnerHTML={{ __html: LABEL_CSS }} />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
        <Chip n={counts.working} label="working" />
        <Chip n={counts.needs} label="need you" tone={counts.needs ? 'amber' : undefined} onClick={() => setPick({ kind: 'townhall' })} />
        <Chip n={counts.idle} label="idle" />
        {counts.building > 0 && <Chip n={counts.building} label="being built" tone="sky" />}
        <Chip n={plots.length} label="buildings" />
        {data && <Chip n={data.done.bots + data.done.shrooms + data.done.you} label="done today" title={`${data.done.bots} by bots · ${data.done.shrooms} by shrooms · ${data.done.you} by you`} />}
        {data && <Link href="/prototypes/kan/bots?spend" className="rounded-xl border border-neutral-800 px-3 py-1.5 text-[13px] text-neutral-400 hover:border-neutral-700 hover:text-neutral-200">${(data.spend.todayCents / 100).toFixed(2)} today · ${(data.spend.dayCapCents / 100).toFixed(0)} cap</Link>}
      </div>

      <div className="flex flex-col gap-4 px-4 pb-8 md:px-6 lg:flex-row">
        {/* The city */}
        <div className="relative h-[62vh] min-h-[380px] flex-1 overflow-hidden rounded-2xl border border-neutral-800 lg:h-[calc(100dvh-150px)]" style={{ background: SKY_CSS[sky] }}>
          <div ref={host} className="absolute inset-0" />
          <div ref={labels} className="kc-labels pointer-events-none absolute inset-0 overflow-hidden" />
          {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur">
            {SKIES.map(({ sky: s, label, Icon }) => (
              <button key={s} onClick={() => setSky(s)} title={label} className={`rounded-full p-1.5 ${sky === s ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}><Icon className="h-4 w-4" /></button>
            ))}
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur">
            <IconBtn title="Turn left" onClick={() => engine.current?.rotate(-1)}><RotateCcw className="h-4 w-4" /></IconBtn>
            <IconBtn title="Turn right" onClick={() => engine.current?.rotate(1)}><RotateCw className="h-4 w-4" /></IconBtn>
            <IconBtn title="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.3)}><ZoomOut className="h-4 w-4" /></IconBtn>
            <IconBtn title="Zoom in" onClick={() => engine.current?.zoomBy(1.3)}><ZoomIn className="h-4 w-4" /></IconBtn>
            <IconBtn title="Whole city" onClick={() => { setPick(null); engine.current?.frameAll(); }}><Maximize2 className="h-4 w-4" /></IconBtn>
          </div>
          {preview && (
            <Link href="/prototypes/kan/city" className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-[12px] font-semibold text-neutral-950 shadow">Preview: pretend bots · show the real city</Link>
          )}
          {note && (
            <div className="absolute left-1/2 top-3 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950/85 px-4 py-2 text-[13px] text-neutral-100 shadow-lg backdrop-blur">
              <KanthinkIcon size={16} className="flex-shrink-0 text-violet-400" />
              <span>{note}</span>
              <button onClick={() => setNote(null)} className="text-neutral-500 hover:text-neutral-200"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>

        {/* The side: what you picked, the citizens, the feed */}
        <aside className="flex w-full flex-shrink-0 flex-col gap-4 lg:h-[calc(100dvh-150px)] lg:w-[380px] lg:overflow-y-auto">
          {pick && data && (
            <Panel onClose={() => setPick(null)}>
              {selectedPlot ? (
                <PlotPanel
                  p={selectedPlot}
                  approvals={approvals.filter((a) => a.channelId === selectedPlot.channelId)}
                  busy={busy}
                  onOn={() => void turnOn(selectedPlot.channelId)}
                  onOff={() => void turnOff(selectedPlot.channelId)}
                  onRun={() => void runNow(selectedPlot.channelId)}
                  onDecide={(id, ok, extra) => void decide(id, ok, extra)}
                />
              ) : pick.kind === 'townhall' ? (
                <TownHallPanel
                  data={data}
                  approvals={approvals}
                  busy={busy}
                  onDecide={(id, ok, extra) => void decide(id, ok, extra)}
                  onLook={() => void look()}
                  onApply={(id) => void applyPass(id)}
                  onGo={(id) => setPick({ kind: 'plot', id })}
                />
              ) : pick.kind === 'park' ? (
                <ParkPanel plots={plots} onGo={(id) => setPick({ kind: 'plot', id })} />
              ) : pick.kind === 'proposal' ? (
                <ProposalPanel data={data} name={pick.name} busy={busy} onApply={(id) => void applyPass(id)} />
              ) : (
                <FreePanel busy={busy} running={data.townHall.passRunning} onLook={() => void look()} />
              )}
            </Panel>
          )}

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-neutral-100">Citizens</h2>
              <span className="text-xs text-neutral-500">{citizens.length} bot{citizens.length === 1 ? '' : 's'} · Kan</span>
            </div>
            <button onClick={() => setPick({ kind: 'townhall' })} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-neutral-900">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20"><KanthinkIcon size={18} className="text-violet-300" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="text-[14px] font-medium text-neutral-100">Kan</span><span className="text-xs text-neutral-500">Chief</span></span>
                <span className="block truncate text-[13px] text-neutral-400">
                  {data?.townHall.passRunning ? 'Reading everything you gave it' : data?.townHall.pass ? 'Noticed some things. Waiting at Town Hall.' : 'Doing the rounds'}
                </span>
              </span>
            </button>
            {citizens.map((p) => (
              <button key={p.channelId} onClick={() => { setPick({ kind: 'plot', id: p.channelId }); engine.current?.focusBot(p.channelId); }} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-neutral-900">
                <BotDot id={p.channelId} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-neutral-100">{p.name}</span>
                    <span className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS[p.bot.status].pill}`}>{STATUS[p.bot.status].label}</span>
                  </span>
                  <span className="block truncate text-[13px] text-neutral-400">
                    {p.bot.status === 'working' ? p.bot.doing : p.bot.status === 'needs' ? (p.waiting[0] ? `Wants to build “${p.waiting[0].title}”` : p.bot.asks[0]) : p.bot.lastSummary ?? `Runs every ${p.bot.everyHours}h`}
                  </span>
                </span>
              </button>
            ))}
            {citizens.length === 0 && (
              <div className="mt-2 rounded-xl bg-neutral-900/60 p-3">
                <p className="text-[13px] leading-relaxed text-neutral-400">No bots live here yet. Every building can have one. It reads its channel, does the work, and comes to Town Hall when it needs you.</p>
                <div className="mt-3 space-y-1.5">
                  {hires.map((p) => (
                    <div key={p.channelId} className="flex items-center gap-2">
                      <button onClick={() => setPick({ kind: 'plot', id: p.channelId })} className="min-w-0 flex-1 truncate text-left text-[13px] text-neutral-200 hover:text-white">{p.name}</button>
                      <button disabled={busy !== null} onClick={() => void turnOn(p.channelId)} className="flex-shrink-0 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                        {busy === `on:${p.channelId}` ? 'Calling a cab…' : 'Move a bot in'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {!pick && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-[13px] text-neutral-500">
              Tap a building or a bot to see what’s happening there.
            </section>
          )}

          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-neutral-100">City feed</h2>
              <span className="text-xs text-neutral-500">newest first</span>
            </div>
            {!data?.feed.length && <p className="text-[13px] text-neutral-500">Quiet so far.</p>}
            <ul className="space-y-2">
              {data?.feed.slice(0, 40).map((f, i) => {
                const where = f.channelId ? data.names[f.channelId] : null;
                const today = Date.now() - f.at < 20 * 3600_000;
                return (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                    <span className="w-14 flex-shrink-0 pt-0.5 font-mono text-[11px] text-neutral-600">{today ? clock(f.at) : day(f.at)}</span>
                    <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${FEED_DOT[f.kind] ?? 'bg-neutral-500'}`} />
                    <span className="min-w-0 text-neutral-300">
                      {where && f.kind !== 'you' && (
                        <button onClick={() => setPick({ kind: 'plot', id: f.channelId! })} className="mr-1 font-medium text-neutral-100 hover:text-violet-300">{where}</button>
                      )}
                      {f.text}
                      {where && f.kind === 'you' && (
                        <> in <button onClick={() => setPick({ kind: 'plot', id: f.channelId! })} className="text-neutral-100 hover:text-violet-300">{where}</button></>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </Shell>
  );
}

// ---------- Pieces ----------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#0b0b0b] text-neutral-100">
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <Link href="/prototypes/kan" className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-sm font-medium text-neutral-300">Kan</span>
          <ChevronRight className="h-3.5 w-3.5 text-neutral-700" />
          <span className="text-sm text-neutral-100">City</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/prototypes/kan/attention" className="rounded-full px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200">Noticed</Link>
          <Link href="/prototypes/kan/bots" className="rounded-full px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200">Bots</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

function Chip({ n, label, tone, onClick, title }: { n: number; label: string; tone?: 'amber' | 'sky'; onClick?: () => void; title?: string }) {
  const ring = tone === 'amber' ? 'border-amber-500/70 bg-amber-500/5' : tone === 'sky' ? 'border-sky-500/50' : 'border-neutral-800';
  const num = tone === 'amber' ? 'text-amber-300' : tone === 'sky' ? 'text-sky-300' : 'text-neutral-100';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} title={title} className={`flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 ${ring} ${onClick ? 'hover:border-neutral-600' : ''}`}>
      <span className={`text-[17px] font-semibold tabular-nums ${num}`}>{n}</span>
      <span className="text-[13px] text-neutral-400">{label}</span>
    </Tag>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return <button onClick={onClick} title={title} className="rounded-full p-1.5 text-white/70 hover:bg-white/15 hover:text-white">{children}</button>;
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <section className="relative rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
      <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"><X className="h-4 w-4" /></button>
      {children}
    </section>
  );
}

const BOT_HEX = ['#2fd3b0', '#ff5d8f', '#ff9f1c', '#8b5cf6', '#3b82f6', '#22c55e', '#06b6d4', '#f43f5e', '#eab308', '#a855f7'];
function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** The bot's own color, as it walks around the city. */
function BotDot({ id }: { id: string }) {
  const c = BOT_HEX[hashId(id) % BOT_HEX.length];
  return (
    <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center gap-[3px] rounded-full" style={{ background: c }}>
      <span className="h-2.5 w-[3px] rounded-full bg-white" />
      <span className="h-2.5 w-[3px] rounded-full bg-white" />
    </span>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-neutral-900/70 px-3 py-2">
      <div className="text-[15px] font-semibold tabular-nums text-neutral-100">{n}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}

function PlotPanel({ p, approvals, busy, onOn, onOff, onRun, onDecide }: {
  p: CityPlot;
  approvals: Approval[];
  busy: string | null;
  onOn: () => void;
  onOff: () => void;
  onRun: () => void;
  onDecide: (id: string, ok: boolean, extra?: { reason?: string; modelId?: string }) => void;
}) {
  const maxCol = Math.max(1, ...p.columns.map((c) => c.cards));
  const s = STATUS[p.bot.status];
  return (
    <div>
      <p className="pr-8 text-[11px] uppercase tracking-wider text-neutral-500">{p.kind} · {p.district}</p>
      <h3 className="mt-0.5 pr-8 text-[18px] font-semibold leading-tight text-neutral-50">{p.name}</h3>
      {p.description && <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">{p.description}</p>}
      {p.attentionWhy && (
        <p className="mt-2 flex gap-2 text-[13px] leading-relaxed text-neutral-300">
          <KanthinkIcon size={14} className="mt-0.5 flex-shrink-0 text-violet-400" />
          <span><span className="text-neutral-500">{p.attention === 'muted' ? 'Muted' : p.attention === 'quiet' ? 'Quiet' : 'Active'}.</span> {p.attentionWhy}</span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Stat n={p.cards} label="cards" />
        <Stat n={p.apps} label={p.apps === 1 ? 'app' : 'apps'} />
        <Stat n={p.shrooms.length} label={p.shrooms.length === 1 ? 'shroom' : 'shrooms'} />
        <Stat n={p.lastActivityAt ? ago(p.lastActivityAt).replace(' ago', '') : '—'} label="last touched" />
      </div>

      {p.columns.length > 0 && (
        <div className="mt-4 space-y-1">
          {p.columns.slice(0, 7).map((c) => (
            <div key={c.name} className="flex items-center gap-2 text-[12px]">
              <span className="w-28 flex-shrink-0 truncate text-neutral-400">{c.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-900">
                <span className="block h-full rounded-full bg-violet-500/70" style={{ width: `${(c.cards / maxCol) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-neutral-500">{c.cards}</span>
            </div>
          ))}
        </div>
      )}

      {p.building && (
        <p className="mt-4 rounded-xl bg-sky-500/10 px-3 py-2 text-[13px] text-sky-200">The crane’s up: building {p.building}.</p>
      )}

      {/* The bot */}
      <div className="mt-4 rounded-xl border border-neutral-800 p-3">
        <div className="flex items-center gap-2">
          <BotDot id={p.channelId} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-200">{p.bot.on ? 'Its bot' : 'No bot lives here yet'}</p>
            <p className="text-[12px] text-neutral-500">
              {p.bot.on ? `Runs every ${p.bot.everyHours}h${p.bot.lastRunAt ? ` · last ran ${ago(p.bot.lastRunAt)}` : ''}` : 'A bot would read this channel and work it on its own.'}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] ${s.pill}`}>{s.label}</span>
        </div>
        {p.bot.status === 'working' && p.bot.doing && <p className="mt-2 flex items-center gap-2 text-[13px] text-emerald-200"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {p.bot.doing}</p>}
        {p.bot.lastSummary && p.bot.status !== 'working' && <p className="mt-2 text-[13px] leading-relaxed text-neutral-300">“{p.bot.lastSummary}”</p>}
        {p.bot.asks.map((a, i) => <p key={i} className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[13px] text-amber-100">{a}</p>)}
        {p.fixed && <p className="mt-2 text-[12px] text-neutral-500">Kan leaves this one’s layout alone: {p.fixed}.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {!p.bot.on ? (
            <button disabled={busy !== null} onClick={onOn} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {busy?.startsWith('on:') ? 'Calling a cab…' : 'Move a bot in'}
            </button>
          ) : (
            <>
              <button disabled={busy !== null || p.bot.status === 'working'} onClick={onRun} className="flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                {busy?.startsWith('run:') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Send to work
              </button>
              <button disabled={busy !== null} onClick={onOff} className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900">Give it the day off</button>
            </>
          )}
          <Link href={`/prototypes/kan/bots?channel=${p.channelId}`} className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-200">Its log <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
      </div>

      {approvals.map((a) => <ApprovalRow key={a.id} a={a} busy={busy} onDecide={onDecide} />)}

      {p.shrooms.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">Shrooms in the yard</p>
          <ul className="space-y-1">
            {p.shrooms.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px]">
                <span className={`h-2 w-2 rounded-full ${s.automatic ? 'bg-pink-400' : 'bg-neutral-600'}`} />
                <span className="min-w-0 flex-1 truncate text-neutral-300">{s.title}</span>
                <span className="text-[11px] text-neutral-600">{s.lastRanAt ? `ran ${ago(s.lastRanAt)}` : s.automatic ? 'automatic' : 'on demand'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.recentCards.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">Lately</p>
          <ul className="space-y-1.5">
            {p.recentCards.map((c) => (
              <li key={c.id} className="text-[13px] leading-snug">
                <span className="text-neutral-200">{c.title}</span>
                <span className="text-neutral-600"> · {c.column}{c.byKan ? ' · by Kan' : ''} · {ago(c.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/channel/${p.channelId}`} className="mt-4 inline-flex items-center gap-1 text-[13px] text-violet-300 hover:text-violet-200">Open the board <ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

function ApprovalRow({ a, busy, onDecide, showWhere }: { a: Approval; busy: string | null; onDecide: (id: string, ok: boolean, extra?: { reason?: string; modelId?: string }) => void; showWhere?: boolean }) {
  const [modelId, setModelId] = useState(a.modelId ?? a.models[0]?.id ?? '');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const m = a.models.find((x) => x.id === modelId);
  const likely = m ? `$${m.likelyUsd.toFixed(2)}` : usd(a.likelyMillicents);
  const most = m ? `$${m.maxUsd.toFixed(2)}` : usd(a.maxMillicents);
  const mine = busy === `ap:${a.id}`;
  return (
    <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">{showWhere ? `${a.channelName} needs you` : 'Needs you'}</p>
      <p className="mt-1 text-[14px] font-medium text-neutral-100">Can I build “{a.title}”?</p>
      {a.purpose && <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{a.purpose}</p>}
      {a.models.length > 0 && (
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[13px] text-neutral-200">
          {a.models.map((x) => <option key={x.id} value={x.id}>{x.label} · about ${x.likelyUsd.toFixed(2)}</option>)}
        </select>
      )}
      <p className="mt-1.5 text-[12px] text-neutral-500">Likely {likely}, at most {most}.</p>
      {rejecting ? (
        <div className="mt-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not? The bot reads this next time." rows={2} className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-600" />
          <div className="mt-2 flex gap-2">
            <button disabled={busy !== null} onClick={() => onDecide(a.id, false, { reason })} className="rounded-full bg-neutral-800 px-3.5 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700 disabled:opacity-50">{mine ? 'Saving…' : 'Pass on it'}</button>
            <button onClick={() => setRejecting(false)} className="px-2 text-xs text-neutral-500">Back</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button disabled={busy !== null} onClick={() => onDecide(a.id, true, modelId && modelId !== a.modelId ? { modelId } : {})} className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50">{mine ? 'Approving…' : 'Build it'}</button>
          <button disabled={busy !== null} onClick={() => setRejecting(true)} className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900">Not now</button>
        </div>
      )}
    </div>
  );
}

function TownHallPanel({ data, approvals, busy, onDecide, onLook, onApply, onGo }: {
  data: CityData;
  approvals: Approval[];
  busy: string | null;
  onDecide: (id: string, ok: boolean, extra?: { reason?: string; modelId?: string }) => void;
  onLook: () => void;
  onApply: (id: string) => void;
  onGo: (id: string) => void;
}) {
  const th = data.townHall;
  const nothing = !approvals.length && !th.asks.length && !th.pass;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">Town Hall · Kan’s office</p>
      <h3 className="mt-0.5 pr-8 text-[18px] font-semibold text-neutral-50">{nothing ? 'Nothing’s waiting on you' : 'Waiting on you'}</h3>

      {th.pass && (
        <div className="mt-3 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300"><KanthinkIcon size={12} /> Kan noticed</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-200">{th.pass.note}</p>
          <p className="mt-1.5 text-[12px] text-neutral-500">{th.pass.changes} change{th.pass.changes === 1 ? '' : 's'} to the city, {th.pass.filings} thing{th.pass.filings === 1 ? '' : 's'} to file{th.pass.at ? ` · ${ago(th.pass.at)}` : ''}.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link href="/prototypes/kan/attention" className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500">See what changes</Link>
            <button disabled={busy !== null} onClick={() => onApply(th.pass!.id)} className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50">{busy === 'apply' ? 'Doing it…' : 'Just do it'}</button>
          </div>
        </div>
      )}

      {approvals.map((a) => <ApprovalRow key={a.id} a={a} busy={busy} onDecide={onDecide} showWhere />)}

      {th.asks.map((a, i) => (
        <button key={i} onClick={() => onGo(a.channelId)} className="mt-3 block w-full rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-left hover:border-amber-500/60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">{a.channelName} asks</p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-200">{a.text}</p>
        </button>
      ))}

      <div className="mt-4 border-t border-neutral-900 pt-3">
        {th.passRunning ? (
          <p className="flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> Kan is reading everything you’ve given it.</p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] leading-relaxed text-neutral-400">Kan can look over your chats, shares and reading, and decide what to build, wake or quiet. Nothing changes until you say so.</p>
            <button disabled={busy !== null} onClick={onLook} className="flex-shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50">{busy === 'look' ? 'Starting…' : 'Have a look'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ParkPanel({ plots, onGo }: { plots: CityPlot[]; onGo: (id: string) => void }) {
  const idle = plots.filter((p) => p.bot.status === 'idle');
  const quiet = plots.filter((p) => p.attention === 'quiet' || p.attention === 'muted');
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">Central Park</p>
      <h3 className="mt-0.5 text-[18px] font-semibold text-neutral-50">{idle.length ? `${idle.length} bot${idle.length === 1 ? '' : 's'} taking a break` : 'Nobody on a break'}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">Bots that are on but have nothing to do until their next run hang out here.</p>
      <ul className="mt-3 space-y-1">
        {idle.map((p) => (
          <li key={p.channelId}><button onClick={() => onGo(p.channelId)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-neutral-200 hover:bg-neutral-900"><BotDot id={p.channelId} /> {p.name} <span className="ml-auto text-[11px] text-neutral-600">{p.bot.nextRunAt ? `back ${new Date(p.bot.nextRunAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</span></button></li>
        ))}
      </ul>
      {quiet.length > 0 && <p className="mt-3 text-[12px] text-neutral-500">{quiet.length} building{quiet.length === 1 ? ' is' : 's are'} quiet or muted on the edge of town.</p>}
    </div>
  );
}

function ProposalPanel({ data, name, busy, onApply }: { data: CityData; name: string; busy: string | null; onApply: (id: string) => void }) {
  const p = data.proposals.find((x) => x.name === name);
  const pass = data.townHall.pass;
  if (!p) return <p className="text-[13px] text-neutral-400">That plan has moved on.</p>;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-violet-300">Kan wants to build</p>
      <h3 className="mt-0.5 pr-8 text-[18px] font-semibold text-neutral-50">{p.name}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-300">{p.why}</p>
      {p.columns.length > 0 && <p className="mt-2 text-[12px] text-neutral-500">{p.columns.join(' → ')}</p>}
      <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">This is part of what Kan noticed. Doing it carries out the whole plan: this building, plus the other changes and filings it decided on.</p>
      {pass && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/prototypes/kan/attention" className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500">See the whole plan</Link>
          <button disabled={busy !== null} onClick={() => onApply(pass.id)} className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50">{busy === 'apply' ? 'Building…' : 'Build it'}</button>
        </div>
      )}
    </div>
  );
}

function FreePanel({ busy, running, onLook }: { busy: string | null; running: boolean; onLook: () => void }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">Free lot</p>
      <h3 className="mt-0.5 text-[18px] font-semibold text-neutral-50">Room to grow</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">When Kan sees something keep coming up in what you talk about, save and read, it puts up a new building here. You don’t have to.</p>
      <button disabled={busy !== null || running} onClick={onLook} className="mt-3 rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50">{running ? 'Kan is looking…' : busy === 'look' ? 'Starting…' : 'Ask Kan to look'}</button>
    </div>
  );
}

// Labels float over the canvas; they're plain DOM so they stay sharp.
const LABEL_CSS = `
.kc-labels > * { position: absolute; left: 0; top: 0; will-change: transform; }
.kc-label { pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
  padding: 4px 10px 4px 8px; border-radius: 999px; background: rgba(255,255,255,0.94); color: #1c1b22;
  font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 2px 10px rgba(20,10,40,0.25); transition: background .15s; }
.kc-label:hover, .kc-label[data-selected="1"] { background: #fff; box-shadow: 0 0 0 2px #a78bfa, 0 4px 14px rgba(20,10,40,0.35); }
.kc-label[data-muted="1"] { background: rgba(220,218,228,0.75); color: #5b5866; font-weight: 500; }
.kc-label .kc-dot { display: none; }
.kc-bot { padding: 2px 8px 2px 6px; font-size: 11px; background: rgba(20,18,30,0.8); color: #f4f2ff; }
.kc-bot .kc-dot { display: block; width: 7px; height: 7px; border-radius: 99px; background: var(--dot, #8b5cf6); }
.kc-kan { padding: 2px 8px; font-size: 11px; background: #7c3aed; color: #fff; }
.kc-townhall { background: #fff; color: #5b21b6; font-size: 13px; }
.kc-park { background: rgba(255,255,255,0.85); color: #276749; }
.kc-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; background: #8b5cf6; }
.kc-badge[data-tone="needs"] { background: #f59e0b; }
.kc-badge[data-tone="working"] { background: transparent; color: #10b981; font-size: 14px; min-width: 0; padding: 0; }
.kc-badge[data-tone="building"] { background: transparent; color: #0ea5e9; font-size: 12px; min-width: 0; padding: 0; }
.kc-badge[data-tone="proposal"] { background: #7c3aed; font-weight: 600; padding: 0 8px; }
.kc-proposal { box-shadow: 0 0 0 2px rgba(167,139,250,.8), 0 4px 14px rgba(20,10,40,0.35); }
.kc-district { pointer-events: none; transform-origin: center; color: rgba(255,255,255,0.92); font: 800 11px/1 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: .18em; text-transform: uppercase; text-shadow: 0 1px 3px rgba(0,0,0,.55); transition: opacity .3s; }
.kc-bubble { pointer-events: auto; cursor: pointer; max-width: 220px; padding: 8px 12px; border-radius: 14px; background: #fff3d6; color: #2b2112;
  font: 500 12.5px/1.35 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 6px 18px rgba(30,15,0,.3); white-space: normal; }
.kc-bubble::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: #fff3d6; }
.kc-bubble-kicker { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #c2410c; margin-bottom: 2px; }
.kc-bubble-kan { background: #f1eaff; color: #24163f; }
.kc-bubble-kan::after { border-top-color: #f1eaff; }
.kc-bubble-kan .kc-bubble-kicker { color: #6d28d9; }
`;
