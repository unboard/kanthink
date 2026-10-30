'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Car, ChevronDown, CircleDollarSign, Footprints, Sparkles, ChevronLeft, DoorOpen, Inbox, LayoutGrid, Loader2, Map as MapIcon, Maximize2, Menu, Moon, Package, Plane, Play, Plus,
  RotateCcw, RotateCw, Sun, Sunrise, Sunset, Users, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { CityEngine, SKY_CSS, skyFor, type Near, type Sky, type ViewMode } from '@/components/kan/city/engine';
import { CityChat, type ChatStep, type CityChatHandle } from '@/components/kan/city/CityChat';
import { ChannelSheet } from '@/components/kan/city/ChannelSheet';
import { ShroomBot } from '@/components/kan/city/ShroomBot';
import { hash } from '@/lib/kan/city/layout';
import type { CityData, CityPlot, Pick } from '@/components/kan/city/types';

/**
 * Kan City: the way in. Your channels are buildings, folders are neighborhoods,
 * each channel's bot is a little mushroom who lives there, and Town Hall is where
 * anything that needs you waits. You run it by talking: the box at the bottom is
 * Kan, with the city's tools, and whatever Kan does lights up where it happened.
 *
 * There's no navigation on purpose. Tap a building to see its board right here,
 * tap Town Hall to answer what's waiting, or just ask. The city grows as you add
 * things: new context piles up as parcels at Town Hall, Kan proposes buildings on
 * free lots, and a channel you make rises out of the ground.
 *
 * Neighborhoods are fences as well as folders: bots help each other inside one,
 * and never reach into another.
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

type Side = 'citizens' | 'feed' | null;

const SKIES: { sky: Sky; label: string; Icon: typeof Sun }[] = [
  { sky: 'dawn', label: 'Dawn', Icon: Sunrise },
  { sky: 'day', label: 'Day', Icon: Sun },
  { sky: 'dusk', label: 'Dusk', Icon: Sunset },
  { sky: 'night', label: 'Night', Icon: Moon },
];

const STATUS: Record<CityPlot['bot']['status'], { label: string; pill: string }> = {
  working: { label: 'Working', pill: 'text-emerald-300 bg-emerald-500/10' },
  needs: { label: 'Needs you', pill: 'text-amber-200 bg-amber-500/15 ring-1 ring-amber-400/50' },
  idle: { label: 'Idle', pill: 'text-neutral-300 bg-white/5' },
  paused: { label: 'Out of budget', pill: 'text-rose-200 bg-rose-500/10' },
  off: { label: 'No bot yet', pill: 'text-neutral-500 bg-white/5' },
};

const FEED_DOT: Record<string, string> = {
  bot: 'bg-emerald-400', shroom: 'bg-pink-400', app: 'bg-sky-400', you: 'bg-violet-400', kan: 'bg-violet-300', ask: 'bg-amber-400', in: 'bg-orange-300',
};

const ARRIVAL_KIND: Record<string, string> = { share: 'Shared', chat: 'Asked Kan', voice: 'Told Kan', note: 'Noted', browsing: 'Browsing', read: 'Read' };

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
const channelOfHref = (href?: string) => href?.match(/^\/channel\/([^/?#]+)/)?.[1] ?? null;

function minutes(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`;
}

/** A touch device, where drive and fly get a joystick. */
function useCoarse() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return coarse;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function CityPage() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const engine = useRef<CityEngine | null>(null);
  const chat = useRef<CityChatHandle>(null);
  const wide = useWide();
  const [data, setData] = useState<CityData | null>(null);
  const [state, setState] = useState<'loading' | 'signedOut' | 'empty' | 'ready' | 'error'>('loading');
  const [pick, setPick] = useState<Pick | null>(null);
  const [board, setBoard] = useState<string | null>(null);
  const [side, setSide] = useState<Side>(null);
  const [menu, setMenu] = useState(false);
  const [sky, setSky] = useState<Sky>(() => skyFor(new Date().getHours()));
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [tick, setTick] = useState(0);
  const [chatH, setChatH] = useState(72);
  /** Gathering plots into a new neighborhood. */
  const [gather, setGather] = useState<{ name: string; ids: string[] } | null>(null);
  /** Map from above, or first person: driving the streets or flying over them. */
  const [mode, setMode] = useState<ViewMode>('map');
  const [near, setNear] = useState<Near | null>(null);
  /** An app opened full screen, right in the city. */
  const [viewing, setViewing] = useState<{ title: string; href: string } | null>(null);
  const coarse = useCoarse();

  useEffect(() => { setPreview(new URLSearchParams(window.location.search).has('preview')); }, []);
  useEffect(() => {
    if (!preview) return;
    const t = setInterval(() => setTick((n) => n + 1), 12000);
    return () => clearInterval(t);
  }, [preview]);
  // On a wide screen the citizens list is out by default.
  useEffect(() => { if (wide) setSide((s) => s ?? 'citizens'); }, [wide]);

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

  const lively = Boolean(data?.plots.some((p) => p.bot.status === 'working' || p.building) || data?.townHall.passRunning);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) void load(); }, lively ? 3000 : 8000);
    return () => clearInterval(t);
  }, [lively, load]);
  // Soon after Kan changes something, look again, so the city shows it.
  const refreshSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadSoon = useCallback(() => {
    if (refreshSoon.current) clearTimeout(refreshSoon.current);
    refreshSoon.current = setTimeout(() => { void load(); void loadApprovals(); }, 600);
  }, [load, loadApprovals]);

  // Picks go through a ref so the engine's callback always sees the current mode.
  const onPickRef = useRef<(p: Pick | null) => void>(() => {});
  onPickRef.current = (p) => {
    setMenu(false);
    if (gather) {
      if (p?.kind === 'plot') setGather((g) => g && ({ ...g, ids: g.ids.includes(p.id) ? g.ids.filter((x) => x !== p.id) : [...g.ids, p.id] }));
      return;
    }
    setBoard(null);
    setPick(p);
  };

  useEffect(() => {
    if (state !== 'ready' || engine.current || !host.current || !labels.current) return;
    engine.current = new CityEngine(host.current, labels.current, {
      onPick: (p) => onPickRef.current(p),
      onNear: setNear,
      onExitMode: () => setMode('map'),
    });
    engine.current.setSky(sky);
    return undefined;
  }, [state, sky]);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  const shown = useMemo(() => (data && preview ? withPretendBots(data, tick) : data), [data, preview, tick]);
  useEffect(() => { if (shown) engine.current?.setData(shown); }, [shown, state]);
  useEffect(() => { engine.current?.setSky(sky); }, [sky]);
  useEffect(() => { engine.current?.mark(gather?.ids ?? []); }, [gather]);
  useEffect(() => {
    engine.current?.setMode(mode);
    if (mode !== 'map') { setMenu(false); if (!wide) setSide(null); }
  }, [mode, state, wide]);

  // What covers the city, so the camera keeps what you picked in the open part.
  const panelOpen = Boolean(pick || board);
  const leftW = wide && side === 'citizens' ? 312 : 0;
  const rightW = wide ? (panelOpen ? 444 : side === 'feed' ? 352 : 0) : 0;
  useEffect(() => {
    const bottom = wide ? chatH : panelOpen ? window.innerHeight * 0.78 : chatH;
    engine.current?.setInsets(rightW - leftW, bottom);
  }, [wide, rightW, leftW, panelOpen, chatH]);
  useEffect(() => { engine.current?.select(pick ?? (board ? { kind: 'plot', id: board } : null), true); }, [pick, board, rightW, leftW]);

  const plots = useMemo(() => shown?.plots ?? [], [shown]);
  const plotOf = useMemo(() => new Map(plots.map((p) => [p.channelId, p])), [plots]);
  const counts = useMemo(() => ({
    working: plots.filter((p) => p.bot.status === 'working').length,
    needs: (data?.townHall.approvals.length ?? 0) + (data?.townHall.asks.length ?? 0) + (data?.townHall.pass ? 1 : 0),
    bots: plots.filter((p) => p.bot.status !== 'off').length,
    building: plots.filter((p) => p.building).length,
  }), [plots, data]);
  const hires = useMemo(() => plots
    .filter((p) => p.bot.status === 'off' && p.attention !== 'muted' && !p.fixed)
    .sort((a, b) => (b.recentActivity * 3 + b.apps + Math.log2(1 + b.cards)) - (a.recentActivity * 3 + a.apps + Math.log2(1 + a.cards)))
    .slice(0, 3), [plots]);

  const selectedPlot = pick?.kind === 'plot' ? plotOf.get(pick.id) ?? null : null;
  const selectedApp = pick?.kind === 'app' ? data?.apps.find((a) => a.id === pick.id) ?? null : null;
  const strip = useMemo(() => {
    const apps = data?.apps ?? [];
    return { n: apps.length, earned: apps.reduce((n, a) => n + a.earnedCents, 0), selling: apps.filter((a) => a.tier !== 'free').length };
  }, [data]);
  const focus = selectedPlot ? { channelId: selectedPlot.channelId, name: selectedPlot.name }
    : selectedApp ? { channelId: selectedApp.channelId, name: `the app ${selectedApp.title}`, kind: 'app' }
    : board && plotOf.get(board) ? { channelId: board, name: plotOf.get(board)!.name }
    : pick?.kind === 'townhall' ? { kind: 'townhall', name: 'Town Hall' }
    : near?.kind === 'plot' ? { channelId: near.id, name: near.name } : null;

  // Starters that fit what's on screen.
  const starters = useMemo(() => {
    if (selectedPlot) {
      const p = selectedPlot;
      return [
        { label: 'What’s going on here?', prompt: `What’s going on in ${p.name} lately? What should happen next?` },
        p.bot.on ? { label: 'Send its bot to work', prompt: `Send the ${p.name} bot to work now.` } : { label: 'Move a bot in', prompt: `Switch on a bot for ${p.name}. What would it do there?` },
        { label: 'Add a card', prompt: `Add a card to ${p.name}: ` },
      ];
    }
    const s: { label: string; prompt: string }[] = [];
    if (counts.needs) s.push({ label: `${counts.needs} waiting on me`, prompt: 'What’s waiting on me? Go through it one at a time.' });
    if (data?.arrivals.count) s.push({ label: `Sort ${data.arrivals.count} new things`, prompt: 'Sort what came in since you last looked.' });
    s.push({ label: 'What’s happening?', prompt: 'What’s happening around the city today?' });
    if (!counts.bots) s.push({ label: 'Which bots should I hire?', prompt: 'Which channels would a bot help most, and what would each one do?' });
    s.push({ label: 'Make a neighborhood', prompt: 'Help me group my channels into neighborhoods. Suggest a few, and wait for me to say yes.' });
    return s.slice(0, 4);
  }, [selectedPlot, counts, data]);

  // ---------- Actions ----------

  const act = async (key: string, fn: () => Promise<Response>, done?: string, where?: string) => {
    if (preview) { setNote('This is a preview with pretend bots, so buttons don’t do anything here.'); return false; }
    setBusy(key);
    setNote(null);
    try {
      const r = await fn();
      if (!r.ok) { setNote((await r.json().catch(() => ({}))).error ?? 'That didn’t work.'); return false; }
      if (done) { setNote(done); engine.current?.kanSay(done, 'Kan', 5000); }
      if (where) engine.current?.pulse(where, { kanGoes: true });
      return true;
    } finally {
      await Promise.all([load(), loadApprovals()]);
      setBusy(null);
    }
  };
  const json = (method: string, body?: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const turnOn = (id: string) => act(`on:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}`, json('PATCH', { enabled: true })), 'A bot is on its way. It’ll get to work within the hour.', id);
  const turnOff = (id: string) => act(`off:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}`, json('PATCH', { enabled: false })), undefined, id);
  const runNow = (id: string) => act(`run:${id}`, () => fetch(`/api/prototypes/kan/bots/${id}/run`, json('POST', {})), 'Off to work.', id);
  const decide = (id: string, approve: boolean, extra: { reason?: string; modelId?: string } = {}) =>
    act(`ap:${id}`, () => fetch(`/api/prototypes/kan/bots/approvals/${id}`, json('POST', { approve, ...extra })), approve ? 'Approved. The crane’s going up.' : 'Passed. The bot will read why.', approvals.find((a) => a.id === id)?.channelId);
  const look = () => act('look', () => fetch('/api/prototypes/kan/attention', { method: 'POST' }), 'Reading everything you’ve given me. A minute or two.', 'townhall');
  const buildOne = (passId: string, name: string) =>
    act('apply', () => fetch('/api/prototypes/kan/city/build', json('POST', { passId, name })), `Putting up ${name}. Watch it rise.`, 'townhall');
  const applyPass = (id: string) => act('apply', () => fetch(`/api/prototypes/kan/attention/${id}/apply`, { method: 'POST' }), 'Done. I rearranged the city.', 'townhall');
  const moveTo = (channelId: string, folderId: string | null) =>
    act(`mv:${channelId}`, () => fetch('/api/prototypes/kan/city/neighborhoods', json('POST', { action: 'move', channelId, folderId })), folderId ? 'Moved. Its bot has new neighbors.' : 'Moved Downtown. Its bot keeps to itself now.');
  const makeNeighborhood = async (name: string, ids: string[]) => {
    const ok = await act('hood', () => fetch('/api/prototypes/kan/city/neighborhoods', json('POST', { action: 'create', name, channelIds: ids })), `${name} is a neighborhood now. Its bots can help each other.`);
    if (ok !== false) setGather(null);
  };

  // Whatever Kan does in the chat shows up in the city.
  const onStep = useCallback((s: ChatStep) => {
    const e = engine.current;
    if (!e) return;
    const where = channelOfHref(s.href);
    if (s.status === 'running' && s.write) e.kanSay(s.label, 'Kan is on it', 20_000);
    if (s.status === 'done') {
      if (where) e.pulse(where, { tone: s.write ? 'write' : 'read', kanGoes: s.write });
      else if (s.write) e.pulse('townhall', { kanGoes: true });
      if (s.write) { e.kanSay(s.label, 'Kan', 6000); reloadSoon(); }
    }
  }, [reloadSoon]);

  const ask = (prompt: string, prefill = false) => {
    if (!wide) { setPick(null); setBoard(null); }
    if (prefill) chat.current?.prefill(prompt);
    else chat.current?.ask(prompt);
  };

  // ---------- Render ----------

  if (state === 'signedOut' || state === 'empty' || state === 'error') {
    return (
      <div className="fixed inset-0 z-[5] flex items-center justify-center bg-[#0b0b0b] px-6 text-center text-sm text-neutral-400">
        {state === 'signedOut' ? <p>Sign in on the <Link href="/prototypes/kan" className="text-violet-400">Kan page</Link> first.</p>
          : state === 'empty' ? <p>You don’t have any channels yet, so there’s no city. Make one and it’ll get a building.</p>
          : <p className="text-red-400">The city didn’t load. <button onClick={() => void load()} className="text-violet-400">Try again</button></p>}
      </div>
    );
  }

  const latest = data?.feed[0];

  return (
    <div className="fixed inset-0 z-[5] overflow-hidden text-neutral-100" style={{ background: SKY_CSS[sky], ['--chat-h' as string]: `${chatH}px` }}>
      <style dangerouslySetInnerHTML={{ __html: LABEL_CSS }} />
      <div ref={host} className="absolute inset-0" />
      <div ref={labels} className="kc-labels pointer-events-none absolute inset-0 overflow-hidden" />
      {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>}

      {/* Top: who you are, what's happening, in one row of glass. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto relative flex-shrink-0">
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/75 py-1.5 pl-2 pr-3 shadow-lg backdrop-blur-xl hover:bg-neutral-900/90">
            <KanthinkIcon size={18} className="text-violet-300" />
            <span className="text-[13px] font-semibold">Kan City</span>
            <Menu className="h-3.5 w-3.5 text-neutral-500" />
          </button>
          {menu && (
            <div className="absolute left-0 top-11 w-60 rounded-2xl border border-white/10 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur-xl">
              <div className="flex gap-1 p-1">
                {SKIES.map(({ sky: s, label, Icon }) => (
                  <button key={s} onClick={() => setSky(s)} title={label} className={`flex-1 rounded-lg py-1.5 ${sky === s ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}><Icon className="mx-auto h-4 w-4" /></button>
                ))}
              </div>
              <MenuItem onClick={() => { setMenu(false); setPick(null); setBoard(null); engine.current?.frameAll(); }}><Maximize2 className="h-4 w-4" /> See the whole city</MenuItem>
              <MenuItem onClick={() => { setMenu(false); setGather({ name: '', ids: [] }); setPick(null); setBoard(null); }}><Plus className="h-4 w-4" /> New neighborhood</MenuItem>
              <MenuItem href={preview ? '/prototypes/kan/city' : '/prototypes/kan/city?preview'}><Play className="h-4 w-4" /> {preview ? 'Show the real city' : 'Preview with pretend bots'}</MenuItem>
              <div className="my-1 border-t border-white/5" />
              <MenuItem href="/"><LayoutGrid className="h-4 w-4" /> The board</MenuItem>
              <MenuItem href="/prototypes/kan/bots"><Users className="h-4 w-4" /> Bot logs and spend</MenuItem>
            </div>
          )}
        </div>
        <div className="no-scrollbar pointer-events-auto flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
          {counts.needs > 0 && <Chip tone="amber" n={counts.needs} label="need you" onClick={() => onPickRef.current({ kind: 'townhall' })} />}
          <Chip n={counts.working} label="working" dot="bg-emerald-400" onClick={() => setSide((s) => (s === 'citizens' ? null : 'citizens'))} />
          <Chip n={counts.bots} label={counts.bots === 1 ? 'bot' : 'bots'} onClick={() => setSide((s) => (s === 'citizens' ? null : 'citizens'))} />
          {counts.building > 0 && <Chip tone="sky" n={counts.building} label="being built" />}
          {data && data.arrivals.count > 0 && <Chip tone="orange" n={data.arrivals.count} label="new for Kan" onClick={() => onPickRef.current({ kind: 'arrivals' })} />}
          {data && <Chip n={data.done.bots + data.done.shrooms + data.done.you} label="done today" onClick={() => setSide((s) => (s === 'feed' ? null : 'feed'))} />}
          {strip.n > 0 && (
            <Chip
              tone={strip.earned ? 'gold' : undefined}
              label={`🎰 ${strip.n} apps on the Strip${strip.earned ? ` · $${Math.round(strip.earned / 100).toLocaleString()} earned` : ''}`}
              onClick={() => { setMode('map'); setPick(null); setBoard(null); setTimeout(() => engine.current?.focusStrip(), 0); }}
            />
          )}
          {data && data.yourDay.minutes > 0 && <Chip tone="gold" label={`${minutes(data.yourDay.minutes)} of your time`} onClick={() => setSide((s) => (s === 'feed' ? null : 'feed'))} />}
          {data && <Chip label={`$${(data.spend.todayCents / 100).toFixed(2)} today`} href="/prototypes/kan/bots?spend" />}
        </div>
        {/* On a phone it sits under the chips, on the right, so the chips get the row. */}
        <div className="pointer-events-auto absolute right-3 top-[calc(max(10px,env(safe-area-inset-top))+40px)] flex flex-shrink-0 flex-col items-center gap-0.5 rounded-full border border-white/10 bg-neutral-950/75 p-0.5 shadow-lg backdrop-blur-xl sm:static sm:flex-row">
          {([['map', MapIcon, 'Map'], ['walk', Footprints, 'Walk'], ['drive', Car, 'Drive'], ['fly', Plane, 'Fly']] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); if (m !== 'map') { setPick(null); setBoard(null); } }}
              title={label}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] ${mode === m ? 'bg-violet-500 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* The latest thing that happened, as a ticker. Tap for the whole feed. */}
      {latest && side !== 'feed' && !panelOpen && !gather && mode === 'map' && (
        <button
          onClick={() => setSide('feed')}
          className="absolute left-1/2 top-[calc(max(10px,env(safe-area-inset-top))+44px)] z-10 flex max-w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950/55 px-3 py-1 text-[12px] text-neutral-200 backdrop-blur-xl hover:bg-neutral-950/75"
        >
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${FEED_DOT[latest.kind] ?? 'bg-neutral-400'}`} />
          <span className="truncate">{latest.channelId && latest.kind !== 'you' && latest.kind !== 'in' ? <b className="font-medium text-white">{data!.names[latest.channelId]} </b> : null}{latest.text}</span>
          <span className="flex-shrink-0 text-neutral-500">{ago(latest.at)}</span>
        </button>
      )}

      {preview && mode === 'map' && <div className="absolute left-3 z-10 rounded-full bg-amber-400 px-3 py-1 text-[12px] font-semibold text-neutral-950 shadow" style={{ bottom: chatH + 12, left: leftW + 12 }}>Preview: pretend bots</div>}

      {note && (
        <div className="absolute left-1/2 top-[calc(max(10px,env(safe-area-inset-top))+76px)] z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950/90 px-4 py-2 text-[13px] text-neutral-100 shadow-lg backdrop-blur">
          <KanthinkIcon size={16} className="flex-shrink-0 text-violet-400" />
          <span>{note}</span>
          <button onClick={() => setNote(null)} className="text-neutral-500 hover:text-neutral-200"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Gathering plots into a neighborhood. */}
      {gather && (
        <div className="absolute left-1/2 top-[calc(max(10px,env(safe-area-inset-top))+48px)] z-30 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-violet-400/40 bg-neutral-950/90 p-3 shadow-2xl backdrop-blur-xl">
          <p className="text-[13px] text-neutral-300">Tap the buildings that belong together. Their bots will help each other, and no other neighborhood’s bots can come in.</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={gather.name}
              onChange={(e) => setGather({ ...gather, name: e.target.value })}
              placeholder="Name it (Scarlett, Home, Shop…)"
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[14px] placeholder:text-neutral-500 focus:border-violet-400/60 focus:outline-none"
            />
            <button
              disabled={!gather.name.trim() || !gather.ids.length || busy === 'hood'}
              onClick={() => void makeNeighborhood(gather.name.trim(), gather.ids)}
              className="flex-shrink-0 rounded-full bg-violet-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              {busy === 'hood' ? 'Building…' : `Make it${gather.ids.length ? ` · ${gather.ids.length}` : ''}`}
            </button>
            <button onClick={() => setGather(null)} className="flex-shrink-0 rounded-full p-1.5 text-neutral-500 hover:text-neutral-200"><X className="h-4 w-4" /></button>
          </div>
          {gather.ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gather.ids.map((id) => (
                <button key={id} onClick={() => setGather({ ...gather, ids: gather.ids.filter((x) => x !== id) })} className="flex items-center gap-1 rounded-full bg-violet-500/15 py-0.5 pl-2 pr-1 text-[12px] text-violet-100">
                  {plotOf.get(id)?.name} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Behind the wheel or the wings. */}
      {mode !== 'map' && (
        <>
          {near && !panelOpen && (
            <button
              onClick={() => onPickRef.current(near.kind === 'app' ? { kind: 'app', id: near.id } : { kind: 'plot', id: near.id })}
              className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-neutral-900 shadow-2xl hover:bg-violet-50"
              style={{ bottom: chatH + (coarse || !wide ? 150 : 20) }}
            >
              <DoorOpen className="h-4 w-4 text-violet-600" /> Go into {near.name}{!coarse && <span className="ml-1 rounded bg-neutral-200 px-1.5 text-[11px] text-neutral-600">E</span>}
            </button>
          )}
          {(coarse || !wide) ? (
            <Stick onMove={(x, y) => engine.current?.setStick(x, y)} bottom={chatH + 14} hint={mode === 'drive' ? 'Drive' : mode === 'walk' ? 'Walk' : 'Steer · climb'} />
          ) : (
            <p className="absolute left-1/2 top-[60px] z-10 -translate-x-1/2 rounded-full bg-neutral-950/60 px-3 py-1 text-[12px] text-neutral-200 backdrop-blur">
              {mode === 'fly' ? 'A D to turn · W S to climb and dive · Shift for speed' : `W A S D or arrows to ${mode} · Shift to ${mode === 'walk' ? 'run' : 'speed up'}`} · E to go in · Esc for the map
            </p>
          )}
        </>
      )}

      {/* Camera controls, out of the way. */}
      <div className={`absolute z-10 hidden flex-col gap-1 rounded-full bg-black/35 p-1 backdrop-blur ${mode === 'map' ? 'lg:flex' : ''}`} style={{ right: rightW + 12, bottom: chatH + 12 }}>
        <IconBtn title="Zoom in" onClick={() => engine.current?.zoomBy(1.3)}><ZoomIn className="h-4 w-4" /></IconBtn>
        <IconBtn title="Zoom out" onClick={() => engine.current?.zoomBy(1 / 1.3)}><ZoomOut className="h-4 w-4" /></IconBtn>
        <IconBtn title="Turn left" onClick={() => engine.current?.rotate(-1)}><RotateCcw className="h-4 w-4" /></IconBtn>
        <IconBtn title="Turn right" onClick={() => engine.current?.rotate(1)}><RotateCw className="h-4 w-4" /></IconBtn>
      </div>

      {/* Left: the neighborhoods and who lives in them. */}
      {side === 'citizens' && data && (
        <SidePanel side="left" onClose={() => setSide(null)} wide={wide}>
          <Citizens
            data={data}
            plots={plots}
            hires={hires}
            busy={busy}
            onGo={(id) => { onPickRef.current({ kind: 'plot', id }); engine.current?.focusBot(id); if (!wide) setSide(null); }}
            onKan={() => { onPickRef.current({ kind: 'townhall' }); if (!wide) setSide(null); }}
            onHire={(id) => void turnOn(id)}
            onNewHood={() => { setGather({ name: '', ids: [] }); setPick(null); setBoard(null); if (!wide) setSide(null); }}
          />
        </SidePanel>
      )}

      {/* Right: the city feed when nothing is picked. */}
      {side === 'feed' && !panelOpen && data && (
        <SidePanel side="right" onClose={() => setSide(wide ? 'citizens' : null)} wide={wide}>
          <Feed data={data} onGo={(id) => { onPickRef.current({ kind: 'plot', id }); if (!wide) setSide(null); }} />
        </SidePanel>
      )}

      {/* What you picked. A building's board opens right here. */}
      {board && plotOf.get(board) && (
        <ChannelSheet
          key={board}
          channelId={board}
          name={plotOf.get(board)!.name}
          accent={STATUS_ACCENT}
          preview={preview}
          onClose={() => { setBoard(null); setPick({ kind: 'plot', id: board }); }}
          onChanged={() => { engine.current?.pulse(board); reloadSoon(); }}
          onAsk={(prompt) => ask(prompt, true)}
        />
      )}
      {pick && !board && data && (
        <PickSheet onClose={() => setPick(null)}>
          {selectedPlot ? (
            <PlotPanel
              p={selectedPlot}
              data={data}
              approvals={approvals.filter((a) => a.channelId === selectedPlot.channelId)}
              busy={busy}
              onOn={() => void turnOn(selectedPlot.channelId)}
              onOff={() => void turnOff(selectedPlot.channelId)}
              onRun={() => void runNow(selectedPlot.channelId)}
              onDecide={(id, ok, extra) => void decide(id, ok, extra)}
              onBoard={() => setBoard(selectedPlot.channelId)}
              onMove={(folderId) => void moveTo(selectedPlot.channelId, folderId)}
              onNewHood={() => { setGather({ name: '', ids: [selectedPlot.channelId] }); setPick(null); }}
              onGo={(id) => onPickRef.current({ kind: 'plot', id })}
            />
          ) : pick.kind === 'townhall' ? (
            <TownHallPanel data={data} approvals={approvals} busy={busy} onDecide={(id, ok, extra) => void decide(id, ok, extra)} onLook={() => void look()} onApply={(id) => void applyPass(id)} onGo={(id) => onPickRef.current({ kind: 'plot', id })} onAsk={ask} />
          ) : pick.kind === 'park' ? (
            <ParkPanel plots={plots} onGo={(id) => onPickRef.current({ kind: 'plot', id })} />
          ) : pick.kind === 'proposal' ? (
            <ProposalPanel data={data} name={pick.name} busy={busy} onBuild={(id, name) => { setPick(null); void buildOne(id, name); }} onAsk={ask} />
          ) : pick.kind === 'app' ? (
            selectedApp ? <AppPanel app={selectedApp} channel={data.names[selectedApp.channelId] ?? ''} onOpen={() => setViewing({ title: selectedApp.title, href: selectedApp.href })} onAsk={ask} /> : <p className="text-[13px] text-neutral-400">That app has moved on.</p>
          ) : pick.kind === 'arrivals' ? (
            <ArrivalsPanel data={data} running={data.townHall.passRunning} onSort={() => ask('Sort what came in since you last looked.')} />
          ) : (
            <FreePanel running={data.townHall.passRunning} onAsk={ask} />
          )}
        </PickSheet>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 pt-[max(8px,env(safe-area-inset-top))]">
            <button onClick={() => setViewing(null)} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] text-neutral-300 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /> Back to the Strip</button>
            <span className="min-w-0 flex-1 truncate text-center text-[14px] font-semibold">{viewing.title}</span>
            <a href={viewing.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] text-neutral-500 hover:text-neutral-200">New tab <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
          <iframe src={viewing.href} title={viewing.title} className="min-h-0 flex-1 bg-white" allow="clipboard-write; microphone; camera" />
        </div>
      )}

      <CityChat
        ref={chat}
        focus={focus}
        onClearFocus={() => { setPick(null); setBoard(null); }}
        onStep={onStep}
        onTurnStart={() => {
          engine.current?.kanSay('Listening…', 'Kan', 4000);
          // On a phone the sheet steps aside so you can see Kan answer; the chat keeps what you were looking at.
          if (!wide) { setPick(null); setBoard(null); setSide(null); }
        }}
        onTurnEnd={reloadSoon}
        starters={starters}
        leftInset={leftW}
        rightInset={rightW}
        compact={!wide && panelOpen}
        onHeight={setChatH}
      />
    </div>
  );
}

const STATUS_ACCENT = '#a78bfa';

// ---------- Pieces ----------

function MenuItem({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-neutral-200 hover:bg-white/5';
  return href ? <Link href={href} className={cls}>{children}</Link> : <button onClick={onClick} className={cls}>{children}</button>;
}

function Chip({ n, label, tone, dot, onClick, href }: { n?: number; label: string; tone?: 'amber' | 'sky' | 'orange' | 'gold'; dot?: string; onClick?: () => void; href?: string }) {
  const ring = tone === 'amber' ? 'border-amber-300 bg-amber-400' : tone === 'sky' ? 'border-sky-400/50 bg-neutral-950/70' : tone === 'orange' ? 'border-orange-300/60 bg-neutral-950/70' : tone === 'gold' ? 'border-yellow-300/60 bg-neutral-950/70' : 'border-white/10 bg-neutral-950/70';
  const num = tone === 'amber' ? 'text-neutral-950' : tone === 'sky' ? 'text-sky-300' : tone === 'orange' ? 'text-orange-200' : 'text-white';
  const body = (
    <>
      {dot && n ? <span className={`h-1.5 w-1.5 rounded-full ${dot} animate-pulse`} /> : null}
      {n !== undefined && <span className={`text-[14px] font-semibold tabular-nums ${num}`}>{n}</span>}
      <span className={`text-[12px] ${tone === 'amber' ? 'font-medium text-neutral-900' : 'text-neutral-300'}`}>{label}</span>
    </>
  );
  const cls = `flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur-xl ${ring} ${onClick || href ? 'hover:border-white/30' : ''}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

/** A thumb stick for driving and flying on a phone. Up is forward (or climb). */
function Stick({ onMove, bottom, hint }: { onMove(x: number, y: number): void; bottom: number; hint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const send = useRef(onMove);
  useEffect(() => { send.current = onMove; });
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    setKnob({ x: dx, y: dy });
    send.current(Math.abs(dx) < 0.12 ? 0 : dx, Math.abs(dy) < 0.12 ? 0 : -dy);
  };
  const end = () => { active.current = null; setKnob({ x: 0, y: 0 }); send.current(0, 0); };
  // Let go of the stick when it goes away.
  useEffect(() => () => send.current(0, 0), []);
  return (
    <div className="absolute left-5 z-20 flex flex-col items-center gap-1" style={{ bottom }}>
      <div
        ref={ref}
        onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => { if (active.current === e.pointerId) move(e); }}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative h-32 w-32 touch-none select-none rounded-full border border-white/20 bg-neutral-950/40 shadow-2xl backdrop-blur"
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-violet-500/90 shadow-lg ring-2 ring-white/40"
          style={{ transform: `translate(calc(-50% + ${knob.x * 40}px), calc(-50% + ${knob.y * 40}px))` }}
        />
      </div>
      <span className="text-[11px] font-medium text-white/80 drop-shadow">{hint}</span>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return <button onClick={onClick} title={title} className="rounded-full p-1.5 text-white/70 hover:bg-white/15 hover:text-white">{children}</button>;
}

/** A glass column on a wide screen; a bottom sheet on a phone. */
function SidePanel({ children, side, onClose, wide }: { children: React.ReactNode; side: 'left' | 'right'; onClose: () => void; wide: boolean }) {
  if (!wide) {
    return (
      <div className="fixed inset-x-2 bottom-[var(--chat-h)] z-40 flex max-h-[calc(78dvh-var(--chat-h))] flex-col rounded-3xl border border-white/10 bg-neutral-950/92 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mt-2 h-1 w-10 flex-shrink-0 rounded-full bg-white/20" />
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    );
  }
  return (
    <div className={`absolute bottom-3 top-[60px] z-20 flex w-[300px] flex-col rounded-2xl border border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur-xl ${side === 'left' ? 'left-3' : 'right-3 w-[340px]'}`}>
      <button onClick={onClose} aria-label="Fold away" className="absolute right-2.5 top-2.5 z-10 rounded-full p-1.5 text-neutral-500 hover:bg-white/10 hover:text-neutral-200">
        {side === 'left' ? <ChevronLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

/** Where a picked thing opens: the right side on a wide screen, a bottom sheet on a phone. */
function PickSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="pointer-events-auto fixed inset-x-2 bottom-[var(--chat-h)] z-40 flex max-h-[calc(78dvh-var(--chat-h))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/92 shadow-2xl backdrop-blur-xl lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:max-h-none lg:w-[420px] lg:rounded-2xl">
      <div className="mx-auto mt-2 h-1 w-10 flex-shrink-0 rounded-full bg-white/20 lg:hidden" />
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
      <div className="text-[15px] font-semibold tabular-nums text-neutral-100">{n}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}

function botLine(p: CityPlot) {
  return p.bot.status === 'working' ? p.bot.doing
    : p.bot.status === 'needs' ? (p.waiting[0] ? `Wants to build “${p.waiting[0].title}”` : p.bot.asks[0])
    : p.bot.lastSummary ?? `Runs every ${p.bot.everyHours}h`;
}

function Citizens({ data, plots, hires, busy, onGo, onKan, onHire, onNewHood }: {
  data: CityData; plots: CityPlot[]; hires: CityPlot[]; busy: string | null;
  onGo(id: string): void; onKan(): void; onHire(id: string): void; onNewHood(): void;
}) {
  const order = { needs: 0, working: 1, paused: 2, idle: 3, off: 4 };
  // Every neighborhood, then Downtown; empty ones too, so you can see where to put things.
  const hoods = [
    ...data.neighborhoods.map((n) => ({ key: n.id, name: n.name, plots: plots.filter((p) => p.folderId === n.id) })),
    { key: 'downtown', name: 'Downtown', plots: plots.filter((p) => !p.folderId) },
  ].filter((h) => h.plots.length || h.key !== 'downtown');
  const [openHood, setOpenHood] = useState<Record<string, boolean>>({});
  return (
    <div>
      <button onClick={onKan} className="flex w-full items-start gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-white/5">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/20"><KanthinkIcon size={18} className="text-violet-300" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="text-[14px] font-medium">Kan</span><span className="text-xs text-neutral-500">Mayor</span></span>
          <span className="block truncate text-[12px] text-neutral-400">{data.townHall.passRunning ? 'Reading everything you gave it' : data.townHall.pass ? 'Noticed some things. Waiting at Town Hall.' : 'Doing the rounds'}</span>
        </span>
      </button>

      {hoods.map((h) => {
        const residents = h.plots.filter((p) => p.bot.status !== 'off').sort((a, b) => order[a.bot.status] - order[b.bot.status] || a.name.localeCompare(b.name));
        const quiet = h.plots.filter((p) => p.bot.status === 'off');
        const open = openHood[h.key];
        return (
          <section key={h.key} className="mt-4">
            <div className="mb-1 flex items-baseline justify-between px-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{h.name}</h3>
              <span className="text-[11px] text-neutral-600">{h.plots.length} building{h.plots.length === 1 ? '' : 's'}</span>
            </div>
            {residents.map((p) => (
              <button key={p.channelId} onClick={() => onGo(p.channelId)} className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left hover:bg-white/5">
                <ShroomBot seed={hash(p.channelId)} status={p.bot.status} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                    <span className={`ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS[p.bot.status].pill}`}>{STATUS[p.bot.status].label}</span>
                  </span>
                  <span className="block truncate text-[12px] text-neutral-500">{botLine(p)}</span>
                </span>
              </button>
            ))}
            {quiet.length > 0 && (
              <>
                <button onClick={() => setOpenHood((o) => ({ ...o, [h.key]: !o[h.key] }))} className="flex w-full items-center gap-1 px-1 py-1 text-[12px] text-neutral-500 hover:text-neutral-300">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} /> {quiet.length} without a bot
                </button>
                {open && quiet.map((p) => (
                  <button key={p.channelId} onClick={() => onGo(p.channelId)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-[13px] text-neutral-400 hover:bg-white/5 hover:text-neutral-200">
                    <ShroomBot seed={hash(p.channelId)} status="off" size={22} /> <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </>
            )}
            {!h.plots.length && <p className="px-1 text-[12px] text-neutral-600">Nobody lives here yet. Move a building in from its panel.</p>}
          </section>
        );
      })}

      <button onClick={onNewHood} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 py-2 text-[13px] text-neutral-400 hover:border-violet-400/50 hover:text-neutral-100">
        <Plus className="h-4 w-4" /> New neighborhood
      </button>

      {plots.every((p) => p.bot.status === 'off') && hires.length > 0 && (
        <div className="mt-4 rounded-xl bg-white/[0.04] p-3">
          <p className="text-[12px] leading-relaxed text-neutral-400">No bots live here yet. Each one reads its channel, does the work, and comes to Town Hall when it needs you. Here’s where one would help most:</p>
          <div className="mt-2 space-y-1.5">
            {hires.map((p) => (
              <div key={p.channelId} className="flex items-center gap-2">
                <ShroomBot seed={hash(p.channelId)} size={22} />
                <button onClick={() => onGo(p.channelId)} className="min-w-0 flex-1 truncate text-left text-[13px] text-neutral-200 hover:text-white">{p.name}</button>
                <button disabled={busy !== null} onClick={() => onHire(p.channelId)} className="flex-shrink-0 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                  {busy === `on:${p.channelId}` ? 'Calling a cab…' : 'Move one in'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Feed({ data, onGo }: { data: CityData; onGo(id: string): void }) {
  // When the data was made stands in for now, so the list renders the same every time.
  const now = data.feed[0]?.at ?? 0;
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2 pr-8">
        <h2 className="text-[15px] font-semibold">What’s happening</h2>
        <span className="text-[11px] text-neutral-500">{data.done.bots} by bots · {data.done.shrooms} by shrooms · {data.done.you} by you today</span>
      </div>
      {!data.feed.length && <p className="text-[13px] text-neutral-500">Quiet so far.</p>}
      <ul className="space-y-2.5">
        {data.feed.slice(0, 60).map((f, i) => {
          const where = f.channelId ? data.names[f.channelId] : null;
          const today = now - f.at < 20 * 3600_000 && new Date(now).getDate() === new Date(f.at).getDate();
          return (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
              <span className="w-12 flex-shrink-0 pt-0.5 font-mono text-[10px] text-neutral-600">{today ? clock(f.at) : day(f.at)}</span>
              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${FEED_DOT[f.kind] ?? 'bg-neutral-500'}`} />
              <span className="min-w-0 text-neutral-300">
                {where && f.kind !== 'you' && f.kind !== 'in' && <button onClick={() => onGo(f.channelId!)} className="mr-1 font-medium text-neutral-100 hover:text-violet-300">{where}</button>}
                {f.text}
                {where && (f.kind === 'you' || f.kind === 'in') && <> · <button onClick={() => onGo(f.channelId!)} className="text-neutral-100 hover:text-violet-300">{where}</button></>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlotPanel({ p, data, approvals, busy, onOn, onOff, onRun, onDecide, onBoard, onMove, onNewHood, onGo }: {
  p: CityPlot;
  data: CityData;
  approvals: Approval[];
  busy: string | null;
  onOn(): void;
  onOff(): void;
  onRun(): void;
  onDecide(id: string, ok: boolean, extra?: { reason?: string; modelId?: string }): void;
  onBoard(): void;
  onMove(folderId: string | null): void;
  onNewHood(): void;
  onGo(id: string): void;
}) {
  const maxCol = Math.max(1, ...p.columns.map((c) => c.cards));
  const s = STATUS[p.bot.status];
  const neighbors = p.folderId ? data.plots.filter((x) => x.folderId === p.folderId && x.channelId !== p.channelId) : [];
  return (
    <div>
      <p className="pr-8 text-[11px] uppercase tracking-wider text-neutral-500">{p.kind} · {p.district}</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold leading-tight text-neutral-50">{p.name}</h3>
      {p.description && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-neutral-400">{p.description}</p>}
      {p.yourTime && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-yellow-400/10 px-2.5 py-1.5 text-[12px] text-yellow-100">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-yellow-300" />
          You spent {minutes(p.yourTime.minutes)} here in the last day{p.yourTime.mode ? `, mostly ${p.yourTime.mode}` : ''}.
          <span className="ml-auto text-[10px] text-yellow-200/60">Kanwatch</span>
        </p>
      )}
      {p.attentionWhy && (
        <p className="mt-2 flex gap-2 text-[13px] leading-relaxed text-neutral-300">
          <KanthinkIcon size={14} className="mt-0.5 flex-shrink-0 text-violet-400" />
          <span><span className="text-neutral-500">{p.attention === 'muted' ? 'Muted' : p.attention === 'quiet' ? 'Quiet' : 'Active'}.</span> {p.attentionWhy}</span>
        </p>
      )}

      {/* The board, right here. */}
      <button onClick={onBoard} className="group mt-3 block w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-violet-400/50">
        <span className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-100">Open the board <span className="text-neutral-500">· {p.cards} card{p.cards === 1 ? '' : 's'}</span></span>
          <ArrowUpRight className="h-4 w-4 text-neutral-500 group-hover:text-violet-300" />
        </span>
        {p.columns.length > 0 && (
          <span className="mt-2 block space-y-1">
            {p.columns.slice(0, 6).map((c) => (
              <span key={c.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-24 flex-shrink-0 truncate text-neutral-400">{c.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-violet-500/70" style={{ width: `${(c.cards / maxCol) * 100}%` }} /></span>
                <span className="w-6 text-right tabular-nums text-neutral-500">{c.cards}</span>
              </span>
            ))}
          </span>
        )}
      </button>

      {p.building && <p className="mt-3 rounded-xl bg-sky-500/10 px-3 py-2 text-[13px] text-sky-200">The crane’s up: building {p.building}.</p>}

      {/* Its bot. */}
      <div className="mt-3 rounded-xl border border-white/10 p-3">
        <div className="flex items-center gap-2.5">
          <ShroomBot seed={hash(p.channelId)} status={p.bot.status} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-200">{p.bot.on ? 'Its bot' : 'No bot lives here yet'}</p>
            <p className="text-[12px] text-neutral-500">{p.bot.on ? `Every ${p.bot.everyHours}h${p.bot.lastRunAt ? ` · last ran ${ago(p.bot.lastRunAt)}` : ''}` : 'One would read this channel and work it on its own.'}</p>
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
              <button disabled={busy !== null} onClick={onOff} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5">Give it the day off</button>
            </>
          )}
          <Link href={`/prototypes/kan/bots?channel=${p.channelId}`} className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-200">Its log <ArrowUpRight className="h-3 w-3" /></Link>
        </div>
        {!p.bot.on && <p className="mt-2 text-[11px] text-neutral-600">A run costs about $0.10–$0.30 and comes out of its daily budget.</p>}
      </div>

      {approvals.map((a) => <ApprovalRow key={a.id} a={a} busy={busy} onDecide={onDecide} />)}

      {/* Its neighborhood: who its bot may help, and where it could move. */}
      <div className="mt-3 rounded-xl border border-white/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-neutral-200">Neighborhood</p>
          <select
            value={p.folderId ?? ''}
            disabled={busy !== null}
            onChange={(e) => { if (e.target.value === '__new') onNewHood(); else onMove(e.target.value || null); }}
            className="max-w-[60%] rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 text-[13px] text-neutral-200"
          >
            <option value="">Downtown</option>
            {data.neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            <option value="__new">New neighborhood…</option>
          </select>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500">
          {p.folderId
            ? neighbors.length ? 'Its bot can help these neighbors, and nobody outside this neighborhood:' : 'Nobody else lives here yet. Bots in a neighborhood help each other.'
            : 'Downtown bots keep to their own channel. Put it in a neighborhood to let it help its neighbors.'}
        </p>
        {neighbors.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {neighbors.map((n) => (
              <button key={n.channelId} onClick={() => onGo(n.channelId)} className="flex items-center gap-1.5 rounded-full bg-white/5 py-0.5 pl-0.5 pr-2.5 text-[12px] text-neutral-300 hover:bg-white/10">
                <ShroomBot seed={hash(n.channelId)} status={n.bot.status} size={20} /> {n.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat n={p.apps} label={p.apps === 1 ? 'app' : 'apps'} />
        <Stat n={p.shrooms.length} label={p.shrooms.length === 1 ? 'shroom' : 'shrooms'} />
        <Stat n={p.lastActivityAt ? ago(p.lastActivityAt).replace(' ago', '') : '—'} label="last touched" />
      </div>

      {p.recentCards.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">Lately</p>
          <ul className="space-y-1.5">
            {p.recentCards.map((c) => (
              <li key={c.id}>
                <button onClick={onBoard} className="text-left text-[13px] leading-snug hover:text-white">
                  <span className="text-neutral-200">{c.title}</span>
                  <span className="text-neutral-600"> · {c.column}{c.byKan ? ' · by Kan' : ''} · {ago(c.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.shrooms.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">Shrooms in the yard</p>
          <ul className="space-y-1">
            {p.shrooms.map((sh) => (
              <li key={sh.id} className="flex items-center gap-2 text-[13px]">
                <span className={`h-2 w-2 rounded-full ${sh.automatic ? 'bg-pink-400' : 'bg-neutral-600'}`} />
                <span className="min-w-0 flex-1 truncate text-neutral-300">{sh.title}</span>
                <span className="text-[11px] text-neutral-600">{sh.lastRanAt ? `ran ${ago(sh.lastRanAt)}` : sh.automatic ? 'automatic' : 'on demand'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-[13px] text-neutral-200">
          {a.models.map((x) => <option key={x.id} value={x.id}>{x.label} · about ${x.likelyUsd.toFixed(2)}</option>)}
        </select>
      )}
      <p className="mt-1.5 text-[12px] text-neutral-500">Likely {likely}, at most {most}.</p>
      {rejecting ? (
        <div className="mt-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why not? The bot reads this next time." rows={2} className="w-full rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-600" />
          <div className="mt-2 flex gap-2">
            <button disabled={busy !== null} onClick={() => onDecide(a.id, false, { reason })} className="rounded-full bg-neutral-800 px-3.5 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700 disabled:opacity-50">{mine ? 'Saving…' : 'Pass on it'}</button>
            <button onClick={() => setRejecting(false)} className="px-2 text-xs text-neutral-500">Back</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button disabled={busy !== null} onClick={() => onDecide(a.id, true, modelId && modelId !== a.modelId ? { modelId } : {})} className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50">{mine ? 'Approving…' : 'Build it'}</button>
          <button disabled={busy !== null} onClick={() => setRejecting(true)} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5">Not now</button>
        </div>
      )}
    </div>
  );
}

function TownHallPanel({ data, approvals, busy, onDecide, onLook, onApply, onGo, onAsk }: {
  data: CityData;
  approvals: Approval[];
  busy: string | null;
  onDecide: (id: string, ok: boolean, extra?: { reason?: string; modelId?: string }) => void;
  onLook: () => void;
  onApply: (id: string) => void;
  onGo: (id: string) => void;
  onAsk: (prompt: string, prefill?: boolean) => void;
}) {
  const th = data.townHall;
  const nothing = !approvals.length && !th.asks.length && !th.pass;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">Town Hall · Kan’s office</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold text-neutral-50">{nothing ? 'Nothing’s waiting on you' : 'Waiting on you'}</h3>

      {th.pass && (
        <div className="mt-3 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300"><KanthinkIcon size={12} /> Kan noticed</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-200">{th.pass.note}</p>
          <p className="mt-1.5 text-[12px] text-neutral-500">{th.pass.changes} change{th.pass.changes === 1 ? '' : 's'} to the city, {th.pass.filings} thing{th.pass.filings === 1 ? '' : 's'} to file{th.pass.at ? ` · ${ago(th.pass.at)}` : ''}.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button onClick={() => onAsk('Walk me through your plan for the city, one change at a time.')} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500">Talk me through it</button>
            <button disabled={busy !== null} onClick={() => onApply(th.pass!.id)} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50">{busy === 'apply' ? 'Doing it…' : 'Just do it'}</button>
          </div>
        </div>
      )}

      {approvals.map((a) => <ApprovalRow key={a.id} a={a} busy={busy} onDecide={onDecide} showWhere />)}

      {th.asks.map((a, i) => (
        <div key={i} className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <button onClick={() => onGo(a.channelId)} className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 hover:text-amber-200">{a.channelName} asks</button>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-200">{a.text}</p>
          <button onClick={() => onAsk(`About what the ${a.channelName} bot asked (“${a.text.slice(0, 120)}”): `, true)} className="mt-2 text-[12px] text-violet-300 hover:text-violet-200">Answer it</button>
        </div>
      ))}

      <div className="mt-4 border-t border-white/5 pt-3">
        {th.passRunning ? (
          <p className="flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> Kan is reading everything you’ve given it.</p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] leading-relaxed text-neutral-400">Kan can look over your chats, shares and reading, and decide what to build, wake or quiet. Nothing changes until you say so.</p>
            <button disabled={busy !== null} onClick={onLook} className="flex-shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50">{busy === 'look' ? 'Starting…' : 'Have a look'}</button>
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
      <h3 className="mt-0.5 text-[19px] font-semibold text-neutral-50">{idle.length ? `${idle.length} bot${idle.length === 1 ? '' : 's'} taking a break` : 'Nobody on a break'}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">Bots that are on but have nothing to do until their next run hang out here, or visit their neighbors.</p>
      <ul className="mt-3 space-y-1">
        {idle.map((p) => (
          <li key={p.channelId}>
            <button onClick={() => onGo(p.channelId)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-neutral-200 hover:bg-white/5">
              <ShroomBot seed={hash(p.channelId)} status={p.bot.status} size={24} /> {p.name}
              <span className="ml-auto text-[11px] text-neutral-600">{p.bot.nextRunAt ? `back ${clock(p.bot.nextRunAt)}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      {quiet.length > 0 && <p className="mt-3 text-[12px] text-neutral-500">{quiet.length} building{quiet.length === 1 ? ' is' : 's are'} quiet or muted on the edge of town.</p>}
    </div>
  );
}

function ProposalPanel({ data, name, busy, onBuild, onAsk }: { data: CityData; name: string; busy: string | null; onBuild: (passId: string, name: string) => void; onAsk: (prompt: string) => void }) {
  const p = data.proposals.find((x) => x.name === name);
  const pass = data.townHall.pass;
  if (!p) return <p className="text-[13px] text-neutral-400">That plan has moved on.</p>;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-violet-300">Kan wants to build</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold text-neutral-50">{p.name}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-300">{p.why}</p>
      {p.columns.length > 0 && <p className="mt-2 text-[12px] text-neutral-500">{p.columns.join(' → ')}</p>}
      <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">Kan proposed this from what you’ve been sharing, saying and reading. Building it starts the channel and files what Kan meant to put there. The rest of Kan’s plan keeps waiting at Town Hall.</p>
      {pass && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy !== null} onClick={() => onBuild(pass.id, p.name)} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">{busy === 'apply' ? 'Building…' : 'Build it'}</button>
          <button onClick={() => onAsk(`Tell me more about the ${p.name} channel you want to start. What would go in it?`)} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5">Talk it over</button>
        </div>
      )}
    </div>
  );
}

function AppPanel({ app, channel, onOpen, onAsk }: { app: CityData['apps'][number]; channel: string; onOpen(): void; onAsk(prompt: string, prefill?: boolean): void }) {
  const tier = app.tier === 'earning'
    ? { label: 'Making money', cls: 'bg-yellow-400 text-neutral-950', Icon: CircleDollarSign }
    : app.tier === 'selling' ? { label: 'For sale', cls: 'bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/50', Icon: CircleDollarSign }
    : { label: 'Free', cls: 'bg-white/10 text-neutral-300', Icon: Sparkles };
  return (
    <div>
      <p className="pr-8 text-[11px] uppercase tracking-wider text-neutral-500">The Strip · from {channel}</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold leading-tight text-neutral-50">{app.title}</h3>
      <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tier.cls}`}><tier.Icon className="h-3.5 w-3.5" /> {tier.label}</span>
      {app.tagline && <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">{app.tagline}</p>}
      {app.thumbnail && (
        <button onClick={onOpen} className="mt-3 block w-full overflow-hidden rounded-xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.thumbnail} alt="" className="aspect-video w-full object-cover" />
        </button>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat n={app.earnedCents ? `$${Math.round(app.earnedCents / 100).toLocaleString()}` : '—'} label="earned" />
        <Stat n={app.price ?? 'Free'} label="price" />
        <Stat n={app.people || app.views} label={app.people ? 'people' : 'views'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onOpen} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500">Go inside</button>
        {app.tier !== 'earning' && (
          <button onClick={() => onAsk(`How could the app “${app.title}” start making money? Look at it and its channel and give me the one best move.`)} className="rounded-full border border-yellow-400/40 px-3.5 py-1.5 text-xs text-yellow-100 hover:bg-yellow-400/10">How could it earn?</button>
        )}
        <button onClick={() => onAsk(`About the app “${app.title}”: `, true)} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5">Ask Kan</button>
      </div>
      {!app.isPublic && <p className="mt-2 text-[11px] text-neutral-600">Not published yet, so only you can go in.</p>}
    </div>
  );
}

function ArrivalsPanel({ data, running, onSort }: { data: CityData; running: boolean; onSort: () => void }) {
  const a = data.arrivals;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-orange-300"><Package className="h-3.5 w-3.5" /> At Town Hall</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold text-neutral-50">{a.count ? `${a.count} new thing${a.count === 1 ? '' : 's'} for Kan` : 'Nothing new yet'}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
        Everything you shared, said, noted or read since Kan last looked{a.since ? ` (${ago(a.since)})` : ''}. Kan sorts it into the city: filing things where they belong, and proposing new buildings when something keeps coming up.
      </p>
      {Object.keys(a.kinds).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(a.kinds).map(([k, n]) => <span key={k} className="rounded-full bg-white/5 px-2.5 py-0.5 text-[12px] text-neutral-300">{n} {ARRIVAL_KIND[k] ?? k}</span>)}
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {a.recent.map((r, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug">
            <Inbox className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-300/80" />
            <span className="min-w-0 text-neutral-300"><span className="text-neutral-500">{ARRIVAL_KIND[r.kind] ?? r.kind} · </span>{r.text}</span>
          </li>
        ))}
      </ul>
      <button disabled={running || !a.count} onClick={onSort} className="mt-4 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
        {running ? 'Kan is sorting…' : 'Have Kan sort them'}
      </button>
      <p className="mt-2 text-[11px] text-neutral-600">Sorting costs about 20¢. Kan also does it on its own when things pile up, at most twice a day. It only proposes; nothing changes until you say so.</p>
    </div>
  );
}

function FreePanel({ running, onAsk }: { running: boolean; onAsk: (prompt: string, prefill?: boolean) => void }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">Free lot</p>
      <h3 className="mt-0.5 text-[19px] font-semibold text-neutral-50">Room to grow</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">The city has no edge. Every channel you make goes up here, and when Kan sees something keep coming up in what you talk about, save and read, it proposes a building for it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onAsk('Start a new channel for ', true)} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500">Build something here</button>
        <button disabled={running} onClick={() => onAsk('Sort what came in since you last looked.')} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50">{running ? 'Kan is looking…' : 'What should go here?'}</button>
      </div>
    </div>
  );
}

// Labels float over the canvas; they're plain DOM so they stay sharp.
const LABEL_CSS = `
.no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
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
.kc-arrivals { background: #fff1e0; color: #9a3412; font-size: 11px; padding: 3px 9px; }
.kc-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; background: #8b5cf6; }
.kc-badge[data-tone="needs"] { background: #f59e0b; }
.kc-badge[data-tone="working"] { background: transparent; color: #10b981; font-size: 14px; min-width: 0; padding: 0; }
.kc-badge[data-tone="building"] { background: transparent; color: #0ea5e9; font-size: 12px; min-width: 0; padding: 0; }
.kc-app { font-size: 11px; padding: 3px 9px 3px 8px; background: rgba(20,13,34,0.88); color: #fdf4ff; box-shadow: 0 0 0 1px rgba(255,60,172,.5), 0 4px 14px rgba(255,60,172,.25); }
.kc-app[data-tier="earning"] { background: #fff4cc; color: #6b4300; box-shadow: 0 0 0 2px #ffcc33, 0 4px 18px rgba(255,190,40,.55); }
.kc-strip { background: #1a0f2e; color: #ffd23f; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; box-shadow: 0 0 0 2px #ff3cac, 0 4px 18px rgba(255,60,172,.45); }
.kc-badge[data-tone="gold"] { background: #ffcc33; color: #5a3a00; padding: 0 7px; }
.kc-badge[data-tone="selling"] { background: #ff3cac; padding: 0 7px; }
.kc-badge[data-tone="new"] { background: #10b981; padding: 0 7px; }
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
