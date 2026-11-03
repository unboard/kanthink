'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Car, DoorOpen, ExternalLink, Footprints, Loader2, LogOut, Plane, RotateCcw, RotateCw, Scooter, Send, Check, X, Undo2 } from 'lucide-react';
import type { Billboard, DayBoard, DayCard, FreewayDay } from '@/lib/kanwatch/freeway';
import type { ChannelBoard } from '@/lib/kan/city/channel';
import { Inside, type InsideNear, type InsidePick } from '../city/inside';
import { Stick } from '../city/Stick';
import type { PlayerKit } from '../city/engine';
import { Freeway, tierColor, type FreewayMode, type FreewayNear, type FreewayPick } from './scene';

/**
 * The Kanwatch Freeway, over the city: its own scene, drawn while the city waits.
 * Drive down your days, pull up beside one and go in; inside, the day is a board of
 * rooms to walk, each card something to send on to a channel, mark done or let go.
 */

export interface FreewayChannel { id: string; name: string; folder: string | null }

const DAY_WORDS = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const SHORT = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const KIND_WORD: Record<DayCard['kind'], string> = { work: 'Work', read: 'A read', loose_end: 'Loose end', idea: 'Idea' };
const LAST_DAY_KEY = 'kanwatch-freeway-day';

function asChannelBoard(date: string, b: DayBoard): ChannelBoard {
  return {
    channel: { id: `day:${date}`, name: SHORT(date), description: b.headline, canEdit: true },
    videos: [],
    columns: b.columns.map((c) => {
      const list = b.cards.filter((x) => x.columnId === c.id);
      return {
        id: c.id, name: c.name, total: list.length,
        cards: list.map((x) => ({
          id: x.id, title: x.title, snippet: x.body.slice(0, 140), messageCount: 0, taskCount: 0, tasksDone: 0, hasApp: false,
          tags: [], source: 'manual', updatedAt: b.writtenAt,
        })),
      };
    }),
  } as unknown as ChannelBoard;
}

export function FreewayView({ kit, channels, boss, coarse, onExit }: {
  kit: PlayerKit;
  channels: FreewayChannel[];
  boss: string;
  coarse: boolean;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ days: FreewayDay[]; billboards: Billboard[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [near, setNear] = useState<FreewayNear | null>(null);
  const [mode, setModeState] = useState<FreewayMode>('drive');
  const [at, setAt] = useState<{ date: string; progress: number }>({ date: '', progress: 0 });
  const [inside, setInside] = useState<{ date: string; board: DayBoard } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [inNear, setInNear] = useState<InsideNear | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [billboard, setBillboard] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [flash, setFlash] = useState(true);

  const fw = useRef<Freeway | null>(null);
  const ins = useRef<Inside | null>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/prototypes/kan/freeway').catch(() => null);
      if (!r?.ok) { setFailed(r?.status === 403 ? 'The Freeway is only open where Kanwatch is.' : 'The road’s closed for a moment. Try again soon.'); return; }
      const d = await r.json();
      if (!d.days?.length) { setFailed('Kanwatch hasn’t seen any days yet. Once it has, they’ll line the road.'); return; }
      setData(d);
    })();
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, []);

  // ---------- The scene ----------

  const cb = useRef({ pick: (_p: FreewayPick) => {}, insidePick: (_p: InsidePick) => {} });
  useEffect(() => {
    if (!data || !host.current || !labels.current) return;
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Resolution follows the frame rate, so a laptop's integrated graphics keeps up.
    let ratio = Math.min(window.devicePixelRatio, 1.25);
    renderer.setPixelRatio(ratio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.prepend(renderer.domElement);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', touchAction: 'none' });
    let start: string | undefined;
    try { start = localStorage.getItem(LAST_DAY_KEY) ?? undefined; } catch { /* private window */ }
    const road = new Freeway(data.days, data.billboards, labels.current, {
      onPick: (p) => cb.current.pick(p),
      onNear: setNear,
      onDay: (date, progress) => setAt((a) => (a.date === date && Math.abs(a.progress - progress) < 0.002 ? a : { date, progress })),
      onModeChange: setModeState,
    }, kit, start);
    fw.current = road;
    const size = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      road.resize(w / h);
      ins.current?.resize(w / h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    const input = () => {
      const k = keys.current;
      return {
        steer: THREE.MathUtils.clamp((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + stick.current.x, -1, 1),
        push: THREE.MathUtils.clamp((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + stick.current.y, -1, 1),
        boost: k.has('shift'),
      };
    };
    let raf = 0, last = performance.now();
    let frames = 0, since = last;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frames++;
      if (now - since > 1500) {
        const fps = (frames * 1000) / (now - since);
        const next = fps < 38 ? Math.max(0.5, ratio * 0.8) : fps > 56 ? Math.min(Math.min(window.devicePixelRatio, 1.25), ratio * 1.1) : ratio;
        if (Math.abs(next - ratio) > 0.02) { ratio = next; renderer.setPixelRatio(ratio); size(); }
        frames = 0;
        since = now;
      }
      const w = el.clientWidth, h = el.clientHeight;
      const room = ins.current;
      if (room) {
        room.step(dt, input());
        renderer.render(room.scene, room.camera);
        room.placeLabels(w, h);
        return;
      }
      road.step(dt, input());
      renderer.render(road.scene, road.camera);
      road.placeLabels(w, h);
    };
    loop();

    const ndc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    let down: { x: number; y: number } | null = null, dragX = 0;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; dragX = e.clientX; };
    const onMove = (e: PointerEvent) => {
      if (ins.current && down) { ins.current.turn(-(e.clientX - dragX) * 0.008); dragX = e.clientX; return; }
      if (down || e.pointerType !== 'mouse') return;
      const over = ins.current ? ins.current.hover(ndc(e)) : road.hover(ndc(e));
      renderer.domElement.style.cursor = over ? 'pointer' : 'grab';
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      if (ins.current) { const p = ins.current.tap(ndc(e)); if (p) cb.current.insidePick(p); return; }
      const p = road.tap(ndc(e));
      if (p) cb.current.pick(p);
    };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      ins.current?.dispose();
      ins.current = null;
      road.dispose();
      fw.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [data, kit, coarse]);

  useEffect(() => {
    if (!at.date) return;
    try { localStorage.setItem(LAST_DAY_KEY, at.date); } catch { /* fine */ }
  }, [at.date]);

  // ---------- Going in and out of a day ----------

  const goIn = useCallback(async (date: string) => {
    if (opening || ins.current || !labels.current) return;
    setOpening(date);
    setNote(null);
    const r = await fetch(`/api/prototypes/kan/freeway/day?date=${date}`).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (!r?.ok || !j.board) { setOpening(null); setNote(j.error ?? 'The door’s stuck. Try again in a moment.'); return; }
    const board = j.board as DayBoard;
    keys.current.clear();
    const room = new Inside(
      { channelId: `day:${date}`, name: SHORT(date), resident: 'Jev', theme: null, walls: '#f1e9dc', style: {} },
      asChannelBoard(date, board), [], labels.current,
      {
        onPick: (p) => cb.current.insidePick(p),
        onNear: setInNear,
        onRoom: (rm) => setRoom(rm.kind === 'column' ? rm.name : null),
      },
      boss,
    );
    const el = host.current;
    if (el) room.resize((el.clientWidth || 1) / (el.clientHeight || 1));
    labels.current.classList.add('kc-inside');
    ins.current = room;
    setInside({ date, board });
    fw.current?.setBoard(date, { cards: board.cards.length, sorted: board.cards.filter((c) => c.state !== 'open').length });
    setOpening(null);
    setTimeout(() => room.kanHere(board.headline || 'Here’s your day.', 7000), 600);
  }, [opening, boss]);

  const goOut = useCallback(() => {
    ins.current?.dispose();
    ins.current = null;
    labels.current?.classList.remove('kc-inside');
    setInside(null); setInNear(null); setRoom(null); setCard(null);
  }, []);

  cb.current.pick = (p) => {
    if (p.kind === 'exit') { onExit(); return; }
    if (p.kind === 'billboard') { setBillboard(p.index); return; }
    void goIn(p.date);
  };
  const goNear = useCallback((n: FreewayNear) => {
    if (n.kind === 'car') fw.current?.getIn();
    else if (n.kind === 'exit') onExit();
    else if (n.kind === 'billboard') setBillboard(n.index);
    else void goIn(n.date);
  }, [goIn, onExit]);
  const pickMode = (m: FreewayMode) => { fw.current?.setMode(m); setModeState(m); };

  cb.current.insidePick = (p) => {
    if (p.kind === 'exit') { goOut(); return; }
    if (p.kind === 'card') { setCard(p.id); return; }
    if (p.kind === 'bot' && inside) ins.current?.kanHere(inside.board.headline || 'Here’s your day.', 7000);
  };

  // Keys: drive, go in, and Escape backs out of whatever's open.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (e.type === 'keyup') { keys.current.delete(key); return; }
      if (key === 'escape') {
        if (card) setCard(null); else if (billboard !== null) setBillboard(null); else if (ins.current) goOut(); else onExit();
        return;
      }
      if (ins.current && (key === 'q' || key === '[')) { ins.current.turn(Math.PI / 4); return; }
      if (ins.current && key === ']') { ins.current.turn(-Math.PI / 4); return; }
      if ((key === 'e' || key === 'enter') && !card) {
        if (ins.current && inNear) { cb.current.insidePick({ kind: inNear.kind, id: inNear.id } as InsidePick); return; }
        if (!ins.current && near) { goNear(near); return; }
      }
      if (!ins.current && key === 'f' && (fw.current?.getMode() === 'drive' || fw.current?.getMode() === 'ride')) { fw.current.getOut(); return; }
      if (!ins.current && key === ' ' && fw.current?.getMode() === 'fly') { e.preventDefault(); fw.current.jump(); return; }
      keys.current.add(key);
      if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', k);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); };
  }, [card, billboard, near, inNear, goOut, onExit, goNear]);

  // ---------- A card ----------

  const act = async (cardId: string, action: 'send' | 'done' | 'drop' | 'reopen', channelId?: string) => {
    if (!inside) return;
    setBusy(true);
    const r = await fetch('/api/prototypes/kan/freeway/day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: inside.date, cardId, action, channelId }) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!r?.ok) { setNote(j.error ?? 'That didn’t work.'); return; }
    const board = j.board as DayBoard;
    setInside({ date: inside.date, board });
    ins.current?.update(asChannelBoard(inside.date, board), [], {}, null, '#f1e9dc');
    const sorted = board.cards.filter((c) => c.state !== 'open').length;
    fw.current?.setBoard(inside.date, { cards: board.cards.length, sorted });
    setData((d) => d && { ...d, days: d.days.map((x) => (x.date === inside.date ? { ...x, board: { cards: board.cards.length, sorted } } : x)) });
    const c = board.cards.find((x) => x.id === cardId);
    setCard(null);
    const said = action === 'send' && c?.sentTo ? `Sent to ${c.sentTo.name}.` : action === 'done' ? 'Done. It’s in Sorted.' : action === 'drop' ? 'Let go.' : 'Put back.';
    ins.current?.kanHere(sorted === board.cards.length ? 'That’s the whole day sorted. Nice!' : said, 4000);
  };

  const openCard = inside?.board.cards.find((c) => c.id === card) ?? null;
  const days = data?.days ?? [];
  const max = useMemo(() => Math.max(60, ...days.map((d) => d.minutes)), [days]);
  const nearDay = near?.kind === 'day' ? days.find((d) => d.date === near.date) ?? null : null;
  const sortedDays = days.filter((d) => d.board && d.board.cards > 0 && d.board.sorted >= d.board.cards).length;
  const currentRoom = inside && room ? inside.board.columns.find((c) => c.name === room) ?? null : null;
  const bb = billboard !== null ? data?.billboards[billboard] ?? null : null;

  return (
    <div className="fixed inset-0 z-[55] bg-[#1d1640] text-white">
      <style>{FREEWAY_CSS}</style>
      <div ref={host} className="absolute inset-0 overflow-hidden">
        <div ref={labels} className="kc-labels pointer-events-none absolute inset-0" />
      </div>
      {flash && <div className="kc-fw-flash pointer-events-none absolute inset-0 z-40" />}

      {/* Top bar */}
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center gap-2">
        <button onClick={inside ? goOut : onExit} className="flex items-center gap-1.5 rounded-full bg-neutral-950/70 px-3 py-1.5 text-[13px] font-medium shadow-lg backdrop-blur hover:bg-neutral-900">
          <ArrowLeft className="h-4 w-4" /> {inside ? 'Back to the road' : 'Kan City'}
        </button>
        <div className="min-w-0 truncate rounded-full bg-neutral-950/60 px-3 py-1.5 text-[13px] shadow-lg backdrop-blur">
          {inside ? <><span className="font-semibold">{DAY_WORDS(inside.date)}</span><span className="text-white/60"> · {inside.board.cards.filter((c) => c.state === 'open').length} to sort</span></>
            : <><span className="font-semibold">Kanwatch Freeway</span>{at.date && <span className="text-white/60"> · {DAY_WORDS(at.date)}</span>}</>}
        </div>
        {!inside && days.length > 0 && <div className="ml-auto hidden rounded-full bg-neutral-950/60 px-3 py-1.5 text-[12px] text-white/70 shadow-lg backdrop-blur sm:block">{sortedDays} of {days.length} days sorted</div>}
        {inside && (
          <div className="ml-auto flex gap-1 rounded-full bg-neutral-950/60 p-1 shadow-lg backdrop-blur">
            <button title="Turn left" onClick={() => ins.current?.turn(Math.PI / 4)} className="rounded-full p-1.5 text-white/70 hover:bg-white/15"><RotateCcw className="h-4 w-4" /></button>
            <button title="Turn right" onClick={() => ins.current?.turn(-Math.PI / 4)} className="rounded-full p-1.5 text-white/70 hover:bg-white/15"><RotateCw className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {/* Inside: the room you're in, and what to do with its cards */}
      {inside && currentRoom && (
        <div className="absolute left-1/2 top-16 z-20 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-neutral-950/70 px-4 py-2 text-center shadow-lg backdrop-blur">
          <p className="text-[13px] font-semibold">{currentRoom.name}</p>
          {currentRoom.hint && <p className="text-[12px] text-white/70">{currentRoom.hint}</p>}
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl bg-neutral-950/80 p-5 text-center shadow-2xl backdrop-blur">
            <p className="text-[15px]">{failed}</p>
            <button onClick={onExit} className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium">Back to Kan City</button>
          </div>
        </div>
      )}
      {!data && !failed && (
        <div className="absolute inset-0 z-30 flex items-center justify-center"><p className="flex items-center gap-2 rounded-full bg-neutral-950/70 px-4 py-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Paving the road…</p></div>
      )}
      {opening && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/30">
          <div className="max-w-xs rounded-2xl bg-neutral-950/85 px-5 py-4 text-center shadow-2xl backdrop-blur">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-violet-300" />
            <p className="mt-2 text-[14px] font-medium">Going into {SHORT(opening)}</p>
            <p className="mt-0.5 text-[12px] text-white/60">The first time, Kan sorts the day into rooms. It takes about half a minute.</p>
          </div>
        </div>
      )}

      {/* The prompt to go in, or what you're next to */}
      {!inside && !opening && near && billboard === null && (
        <div className="absolute inset-x-0 z-20 flex justify-center px-4" style={{ bottom: coarse ? 196 : 112 }}>
          {near.kind === 'day' && nearDay ? (
            <button onClick={() => goNear(near)} className="max-w-md rounded-2xl bg-white px-4 py-2.5 text-left text-neutral-900 shadow-xl hover:bg-violet-50">
              <span className="flex items-center gap-2 text-sm font-semibold"><DoorOpen className="h-4 w-4 text-violet-600" /> Go into {SHORT(nearDay.date)}{!coarse && <span className="rounded bg-neutral-200 px-1.5 text-[11px] font-normal text-neutral-600">E</span>}</span>
              {nearDay.headline && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-neutral-600">{nearDay.headline}</span>}
              <span className="mt-1 flex flex-wrap gap-1">
                {nearDay.tiers.slice(0, 4).map((t) => (
                  <span key={t.key} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                    <span className="h-2 w-2 rounded-full" style={{ background: tierColor(t.key) }} /> {t.label} · {t.minutes >= 60 ? `${(t.minutes / 60).toFixed(1)}h` : `${t.minutes}m`}
                  </span>
                ))}
              </span>
            </button>
          ) : near.kind !== 'day' && (
            <button onClick={() => goNear(near)} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-neutral-900 shadow-2xl hover:bg-violet-50">
              {near.kind === 'exit' ? 'Back to Kan City' : near.kind === 'billboard' ? 'Read the billboard' : near.name === 'your moped' ? 'Hop on' : 'Get in'}
              {!coarse && <span className="rounded bg-neutral-200 px-1.5 text-[11px] font-normal text-neutral-600">E</span>}
            </button>
          )}
        </div>
      )}
      {inside && inNear && !card && (
        <div className="absolute inset-x-0 z-20 flex justify-center px-4" style={{ bottom: coarse ? 190 : 28 }}>
          <button onClick={() => cb.current.insidePick({ kind: inNear.kind, id: inNear.id } as InsidePick)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-xl">
            {inNear.kind === 'exit' ? 'Back to the road' : inNear.kind === 'card' ? `Look at “${inNear.name}”` : `Talk to ${inNear.name}`}{!coarse && <span className="ml-2 font-normal text-neutral-400">E</span>}
          </button>
        </div>
      )}

      {/* How you get about: as in the city */}
      {!inside && data && (
        <div className="absolute right-3 top-14 z-30 flex flex-col items-center gap-0.5 rounded-full border border-white/10 bg-neutral-950/75 p-0.5 shadow-lg backdrop-blur-xl sm:top-3 sm:flex-row">
          {([['walk', Footprints, 'Walk'], ['drive', Car, 'Drive'], ['ride', Scooter, 'Moped'], ['fly', Plane, 'Fly']] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => pickMode(m)} title={label}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] ${mode === m ? 'bg-violet-500 text-white' : 'text-neutral-400 hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}
      {!inside && data && billboard === null && (mode === 'drive' || mode === 'ride') && (
        <button onClick={() => fw.current?.getOut()} className="absolute right-4 z-20 flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2.5 text-[14px] font-semibold text-neutral-900 shadow-2xl hover:bg-white active:scale-95" style={{ bottom: coarse ? 196 : 112 }}>
          <LogOut className="h-4 w-4" /> {mode === 'ride' ? 'Hop off' : 'Get out'}{!coarse && <span className="ml-1 rounded bg-neutral-200 px-1.5 text-[11px] text-neutral-600">F</span>}
        </button>
      )}
      {!inside && data && billboard === null && mode === 'fly' && (
        <button onClick={() => fw.current?.jump()} className="absolute right-4 z-20 flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-2xl hover:bg-pink-400 active:scale-95" style={{ bottom: coarse ? 196 : 112 }}>
          🪂 Jump{!coarse && <span className="ml-1 rounded bg-white/25 px-1.5 text-[11px]">Space</span>}
        </button>
      )}

      {/* The timeline: every day on the road, tap one to go there */}
      {!inside && days.length > 0 && (
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-neutral-950/70 px-3 pb-2 pt-2.5 shadow-xl backdrop-blur">
          <div className="relative flex h-14 items-end gap-[2px]">
            {days.map((d, i) => {
              const done = d.board && d.board.cards > 0 && d.board.sorted >= d.board.cards;
              const month = i === 0 || d.date.slice(0, 7) !== days[i - 1].date.slice(0, 7);
              return (
                <button key={d.date} title={`${SHORT(d.date)} · ${(d.minutes / 60).toFixed(1)}h`} onClick={() => fw.current?.jumpTo(d.date)}
                  className="group relative flex h-full min-w-0 flex-1 items-end">
                  {month && <span className="pointer-events-none absolute -top-0.5 left-0 text-[9px] font-bold uppercase tracking-wider text-white/50">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>}
                  <span className={`block w-full rounded-t-sm transition-colors ${d.date === at.date ? 'bg-white' : done ? 'bg-amber-400' : 'bg-violet-400/70 group-hover:bg-violet-300'}`}
                    style={{ height: `${Math.max(8, (d.minutes / max) * 78)}%` }} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[11px] text-white/55">
            {coarse ? 'Tap a day to go there.' : mode === 'fly' ? 'A D to turn · W S to climb and dive · Shift for speed · Space to parachute out · Tap a day to go there' : `W A S D or arrows to ${mode === 'ride' ? 'ride' : mode} · Shift to ${mode === 'walk' ? 'run' : 'speed up'}${mode === 'drive' || mode === 'ride' ? ' · F to get out' : ''} · E to go in · Tap a day to go there`}
          </p>
        </div>
      )}

      {coarse && !card && (
        <Stick onMove={(x, y) => { stick.current = { x, y }; }} bottom={inside ? 24 : 108} hint={inside || mode === 'walk' ? 'Walk' : mode === 'drive' ? 'Drive' : mode === 'ride' ? 'Ride' : 'Steer · climb'} />
      )}

      {note && (
        <button onClick={() => setNote(null)} className="absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full bg-neutral-950/85 px-4 py-2 text-[13px] shadow-xl">{note}</button>
      )}

      {openCard && inside && (
        <DayCardSheet card={openCard} board={inside.board} channels={channels} busy={busy} onClose={() => setCard(null)} onAct={(a, ch) => void act(openCard.id, a, ch)} />
      )}
      {bb && <BillboardSheet b={bb} onClose={() => setBillboard(null)} onGo={(date) => { setBillboard(null); fw.current?.jumpTo(date); }} />}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-950/95 p-5 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[400px] sm:rounded-3xl sm:border">
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
      {children}
    </div>
  );
}

function DayCardSheet({ card, board, channels, busy, onClose, onAct }: {
  card: DayCard;
  board: DayBoard;
  channels: FreewayChannel[];
  busy: boolean;
  onClose: () => void;
  onAct: (action: 'send' | 'done' | 'drop' | 'reopen', channelId?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const suggested = card.channelId ? channels.find((c) => c.id === card.channelId) ?? null : null;
  const column = board.columns.find((c) => c.id === card.columnId);
  const list = channels.filter((c) => !q || `${c.folder ?? ''} ${c.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet onClose={onClose}>
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{KIND_WORD[card.kind]}{card.minutes ? ` · ${card.minutes} min` : ''}{column ? ` · ${column.name}` : ''}</p>
      <h3 className="mt-1 pr-8 text-[18px] font-semibold leading-snug text-neutral-50">{card.title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-300">{card.body}</p>
      {card.url && (
        <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] text-violet-300 hover:text-violet-200">Open the page <ExternalLink className="h-3.5 w-3.5" /></a>
      )}

      {card.state === 'open' ? (
        picking ? (
          <div className="mt-4">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a channel…" className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-[14px] text-neutral-100 placeholder:text-neutral-600" />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {list.map((c) => (
                <button key={c.id} disabled={busy} onClick={() => onAct('send', c.id)} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-neutral-200 hover:bg-white/5 disabled:opacity-50">
                  {c.name}{c.folder && <span className="text-neutral-500"> · {c.folder}</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setPicking(false)} className="mt-1 text-[12px] text-neutral-500">Back</button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {suggested && (
              <button disabled={busy} onClick={() => onAct('send', suggested.id)} className="flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                <Send className="h-4 w-4" /> Send to {suggested.name}
              </button>
            )}
            <button disabled={busy} onClick={() => setPicking(true)} className={`rounded-full px-4 py-2 text-[13px] disabled:opacity-50 ${suggested ? 'border border-white/15 text-neutral-200 hover:bg-white/5' : 'bg-violet-600 font-medium text-white hover:bg-violet-500'}`}>
              {suggested ? 'Send somewhere else' : 'Send to a channel'}
            </button>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => onAct('done')} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-[13px] text-neutral-200 hover:bg-white/5 disabled:opacity-50"><Check className="h-4 w-4" /> Done with it</button>
              <button disabled={busy} onClick={() => onAct('drop')} className="flex-1 rounded-full px-3 py-2 text-[13px] text-neutral-400 hover:bg-white/5 hover:text-neutral-200 disabled:opacity-50">Let it go</button>
            </div>
            <p className="text-[12px] text-neutral-500">Sending makes a card in that channel with this note on it. Done or let go, it moves to the Sorted room.</p>
          </div>
        )
      ) : (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[13px] text-neutral-200">
            {card.state === 'sent' && card.sentTo ? <>Sent to <a href={`/channel/${card.sentTo.channelId}`} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">{card.sentTo.name}</a>.</> : card.state === 'done' ? 'Done.' : 'Let go.'}
          </p>
          <button disabled={busy} onClick={() => onAct('reopen')} className="mt-2 flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 disabled:opacity-50"><Undo2 className="h-3.5 w-3.5" /> Put it back{card.state === 'sent' ? ' (the card in the channel stays)' : ''}</button>
        </div>
      )}
    </Sheet>
  );
}

function BillboardSheet({ b, onClose, onGo }: { b: Billboard; onClose: () => void; onGo: (date: string) => void }) {
  return (
    <Sheet onClose={onClose}>
      {b.kind === 'month' && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">The month</p>
          <h3 className="mt-1 text-[20px] font-semibold text-neutral-50">{b.month}</h3>
          <p className="mt-1 text-[14px] text-neutral-300">{b.hours} hours over {b.days} days.</p>
          <ul className="mt-3 space-y-1.5">{b.top.map((t) => <li key={t.label} className="flex justify-between text-[13px] text-neutral-200"><span>{t.label}</span><span className="text-neutral-400">{t.hours} h</span></li>)}</ul>
          {b.busiest && <button onClick={() => onGo(b.busiest!.date)} className="mt-4 rounded-full bg-violet-600 px-4 py-1.5 text-[13px] font-medium">Go to the busiest day, {SHORT(b.busiest.date)}</button>}
        </>
      )}
      {b.kind === 'again' && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">Something you keep coming back to</p>
          <h3 className="mt-1 pr-8 text-[20px] font-semibold text-neutral-50">{b.label}</h3>
          <p className="mt-1 text-[14px] text-neutral-300">You spent {b.hours} hours on it across {b.days} days, between {SHORT(b.first)} and {SHORT(b.last)}.</p>
          <p className="mt-4 text-[12px] text-neutral-500">Tap a day to go to its building.</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(b.visits ?? [{ date: b.first, minutes: 0 }, { date: b.last, minutes: 0 }]).map((v) => (
              <button key={v.date} onClick={() => onGo(v.date)} className="rounded-full border border-white/15 px-3 py-1 text-[12.5px] text-neutral-200 hover:bg-white/10">
                {SHORT(v.date)}{v.minutes ? <span className="text-neutral-500"> · {v.minutes >= 60 ? `${(v.minutes / 60).toFixed(1)}h` : `${Math.round(v.minutes)}m`}</span> : null}
              </button>
            ))}
          </div>
        </>
      )}
      {b.kind === 'read' && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">Worth a look{b.site ? ` · ${b.site}` : ''}</p>
          <h3 className="mt-1 pr-8 text-[18px] font-semibold leading-snug text-neutral-50">{b.title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-300">{b.tldr}</p>
          <a href={b.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] text-violet-300 hover:text-violet-200">Open it <ExternalLink className="h-3.5 w-3.5" /></a>
        </>
      )}
    </Sheet>
  );
}

const FREEWAY_CSS = `
.kc-fw-labels > * { position: absolute; left: 0; top: 0; will-change: transform; }
.kc-fw-day { font-size: 12px; }
.kc-labels.kc-inside > .kc-fw-labels { display: none !important; }
@keyframes kc-fw-in { from { opacity: 1; } to { opacity: 0; } }
.kc-fw-flash { background: radial-gradient(circle at 50% 50%, #fff 0%, #c4b5fd 40%, #5b21b6 100%); animation: kc-fw-in .7s ease-out forwards; }
`;
