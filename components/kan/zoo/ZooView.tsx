'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Car, Footprints, LogOut, Plane, Scooter } from 'lucide-react';
import type { PlayerKit } from '../city/engine';
import { Stick } from '../city/Stick';
import { species } from '@/lib/kan/zoo/species';
import { EXHIBITS, habitat, type Px } from '@/lib/kan/zoo/map';
import {
  CLOSE, DAY, OPEN, WEATHER_WORD, advance, answered, babyNames, buy, catchLoose, catchUp, clockText, day, feed as feedSim, fixFence, foundKid, heal,
  hourOf, isNight, loadZoo, markSeen, minuteOfDay, money, nameBaby, newZoo, play as playSim, question, saveZoo, todos, unseen, upgrade,
  type Animal, type Question, type Zoo, type ZooEvent,
} from '@/lib/kan/zoo/sim';
import { ZooScene, type Ride, type ZooMode, type ZooNear, type ZooPick } from './scene';
import { AnimalSheet, BabySheet, ExhibitSheet, MoneySheet, NewsSheet, PlansSheet, QuizSheet, Sheet, VetSheet, ZooMap } from './ZooSheets';

/**
 * Omaha's zoo, over the city: the girls' zoo to look after. Walk it, ride the train
 * and the Skyfari, feed and play with the animals, and handle whatever happens: a
 * lemur loose by the carousel, a sick sea lion, a baby to name, a field trip. Money
 * comes in at the gate and goes out on breakfast and new things, with the sums
 * written out every time. The clock runs as fast as you like.
 */

type Open =
  | { kind: 'news'; welcome?: boolean }
  | { kind: 'exhibit'; id: string }
  | { kind: 'animal'; id: string }
  | { kind: 'plans' }
  | { kind: 'money' }
  | { kind: 'quiz'; q: Question }
  | { kind: 'baby'; id: string; names: string[] }
  | { kind: 'vet'; id: string }
  | { kind: 'map' }
  | null;

const SPEEDS = [
  { k: 0, label: '⏸', title: 'Pause' },
  { k: 1, label: '▶', title: 'A zoo minute every second' },
  { k: 10, label: '⏩', title: '10 times faster' },
  { k: 60, label: '⏩⏩', title: 'A zoo hour every second' },
] as const;

/** Things that pop up as they happen, while you're playing. */
const LOUD: ZooEvent['kind'][] = ['escape', 'sick', 'baby', 'storm', 'fieldtrip', 'report', 'lost', 'vip', 'fog'];

export function ZooView({ kit, coarse, onExit }: { kit: PlayerKit; coarse: boolean; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sc = useRef<ZooScene | null>(null);
  const zoo = useRef<Zoo | null>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [near, setNear] = useState<ZooNear | null>(null);
  const [mode, setMode] = useState<ZooMode>('walk');
  const [ride, setRide] = useState<Ride>(null);
  const [open, setOpen] = useState<Open>(null);
  const [speed, setSpeed] = useState(1);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<ZooEvent | null>(null);
  const [following, setFollowing] = useState<{ kind: 'animal'; id: string; name: string; home: string } | { kind: 'kid'; name: string } | null>(null);
  const [where, setWhere] = useState<{ px: Px; heading: number }>({ px: [700, 880], heading: Math.PI });
  const [markers, setMarkers] = useState<ReturnType<ZooScene['markers']>>([]);
  const [mapBig, setMapBig] = useState(false);
  const speedRef = useRef(1);
  useEffect(() => { speedRef.current = open && open.kind !== 'map' ? 0 : speed; }, [speed, open]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const save = useCallback(() => { if (zoo.current) { zoo.current.real = Date.now(); saveZoo(zoo.current); } }, []);
  const changed = useCallback(() => { if (zoo.current) sc.current?.sync(zoo.current); save(); refresh(); }, [save, refresh]);

  // What's new pops up as a toast; the big ones open the news.
  const heard = useCallback((evs: ZooEvent[]) => {
    const loud = evs.filter((e) => LOUD.includes(e.kind));
    if (loud.length) setToast(loud[loud.length - 1]);
  }, []);

  // ---------- The scene ----------

  useEffect(() => {
    if (!host.current || !labels.current) return;
    // The zoo: yours from before, caught up on what happened while you were away.
    let z = loadZoo();
    let away: ZooEvent[] = [];
    if (!z) z = newZoo();
    else away = catchUp(z, Date.now(), Math.random);
    zoo.current = z;
    saveZoo(z);
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    let ratio = Math.min(window.devicePixelRatio, 1.25);
    renderer.setPixelRatio(ratio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.prepend(renderer.domElement);
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', touchAction: 'none' });
    const s = new ZooScene(labels.current, {
      onNear: setNear,
      onPick: (p: ZooPick) => pickRef.current(p),
      onModeChange: setMode,
      onHome: (id) => homeRef.current(id),
      onReunited: () => reunitedRef.current(),
      onRide: setRide,
      onWhere: (px, heading) => { whereRef.current = { px, heading }; },
    }, kit);
    sc.current = s;
    s.sync(z);
    // For testing in a background tab, where frames barely come: step it by hand.
    if (process.env.NODE_ENV !== 'production') Object.assign(window, {
      __zoo: s, __zooState: () => zoo.current,
      __zooInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }),
      __zooLineup:(ids: string[], baby = false) => { speedRef.current = 0; s.lineup(ids, baby); renderer.render(s.scene, s.camera); },
      __zooRun: (frames: number, input = { steer: 0, push: 0, boost: false }) => {
        const zz = zoo.current!;
        for (let i = 0; i < frames; i++) {
          const evs = advance(zz, 0.05 * speedRef.current, Math.random);
          if (evs.length) { s.sync(zz); heard(evs); }
          s.step(0.05, input, hourOf(zz.clock), zz.weather, { visitors: Math.min(240, zz.today.inPark * 2.2), afterDark: zz.owned.includes('after-dark'), trainCars: 3 });
        }
        renderer.render(s.scene, s.camera);
        s.placeLabels(el.clientWidth, el.clientHeight);
        refresh();
      },
    });
    setReady(true);
    if (unseen(z).length && (away.length || z.events.length === 1)) setOpen({ kind: 'news', welcome: true });

    const size = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      s.resize(w / h);
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
    let raf = 0, last = performance.now(), frames = 0, since = last, hud = 0, saved = 0;
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
      const zz = zoo.current!;
      // The zoo's clock: a zoo minute a second, times the speed.
      const mins = dt * speedRef.current;
      if (mins > 0) {
        const evs = advance(zz, mins, Math.random);
        if (evs.length) { s.sync(zz); heard(evs); refresh(); }
      }
      zz.real = Date.now();
      s.step(dt, input(), hourOf(zz.clock), zz.weather, { visitors: Math.min(240, zz.today.inPark * 2.2), afterDark: zz.owned.includes('after-dark'), trainCars: zz.owned.includes('train-car') ? 4 : 3 });
      renderer.render(s.scene, s.camera);
      s.placeLabels(el.clientWidth, el.clientHeight);
      hud += dt;
      if (hud > 0.25) { hud = 0; refresh(); setWhere(whereRef.current); setMarkers(s.markers()); }
      saved += dt;
      if (saved > 5) { saved = 0; saveZoo(zz); }
    };
    loop();

    const ndc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: PointerEvent) => { if (down || e.pointerType !== 'mouse') return; renderer.domElement.style.cursor = s.hover(ndc(e)) ? 'pointer' : 'grab'; };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const p = s.tap(ndc(e));
      if (p) pickRef.current(p);
    };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    const hide = () => { if (document.hidden && zoo.current) saveZoo(zoo.current); };
    document.addEventListener('visibilitychange', hide);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('visibilitychange', hide);
      if (zoo.current) { zoo.current.real = Date.now(); saveZoo(zoo.current); }
      s.dispose();
      sc.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kit, heard, refresh]);

  const whereRef = useRef(where);
  const pickRef = useRef<(p: ZooPick) => void>(() => {});
  pickRef.current = (p) => {
    if (p.kind === 'animal') setOpen({ kind: 'animal', id: p.id });
    else if (p.kind === 'exhibit') setOpen({ kind: 'exhibit', id: p.id });
    else setOpen({ kind: 'exhibit', id: habitat(p.id)?.exhibit ?? '' });
  };
  const homeRef = useRef<(id: string) => void>(() => {});
  homeRef.current = (id) => {
    const z = zoo.current;
    if (!z) return;
    catchLoose(z, id);
    setFollowing(null);
    setToast(z.events[0]);
    changed();
  };
  const reunitedRef = useRef<() => void>(() => {});
  reunitedRef.current = () => {
    const z = zoo.current;
    if (!z) return;
    foundKid(z);
    setFollowing(null);
    setToast(z.events[0]);
    changed();
  };

  // ---------- Things you do ----------

  const z = zoo.current;
  const nearHabitat = near?.kind === 'habitat' ? near.id : null;

  const doFeed = (h: string) => {
    if (!z) return;
    const list = z.animals.filter((a) => a.habitat === h && !a.loose);
    const hungry = list.reduce((s, a) => s + a.hunger, 0) / Math.max(1, list.length);
    feedSim(z, h);
    sc.current?.feed(h);
    setToast({ id: `t${Date.now()}`, at: z.clock, kind: 'funny', emoji: list[0] ? species(list[0].species).foodEmoji : '🍽️', title: hungry < 25 ? 'They were already pretty full, but they’ll take a snack!' : `Yum! The ${list[0] ? species(list[0].species).many : 'animals'} love it.`, text: '' });
    setOpen(null);
    changed();
  };
  const doPlay = (h: string) => { if (!z) return; playSim(z, h); sc.current?.play(h); setOpen(null); changed(); };
  const doBuy = (id: string) => { if (!z) return; if (buy(z, id, Math.random)) { setToast(z.events[0]); changed(); } };
  const doGoal = (id: string) => { if (!z) return; z.goal = id; changed(); };
  const doFix = (h: string) => { if (!z) return; fixFence(z, h); changed(); };
  const openBaby = (a: Animal) => { if (!z) return; setOpen({ kind: 'baby', id: a.id, names: babyNames(z, a.id, Math.random) }); };
  const act = (e: ZooEvent) => {
    if (!z) return;
    if (e.kind === 'escape' && e.animal) { const a = z.animals.find((x) => x.id === e.animal); if (a?.loose) { setOpen(null); setMapBig(true); } }
    else if (e.kind === 'sick' && e.animal) setOpen({ kind: 'vet', id: e.animal });
    else if (e.kind === 'baby' && e.animal) { const a = z.animals.find((x) => x.id === e.animal); if (a) openBaby(a); }
    else if (e.kind === 'fence' && e.habitat) doFix(e.habitat);
    else if (e.kind === 'lost') { setOpen(null); setMapBig(true); }
  };
  const goNear = useCallback((n: ZooNear) => {
    const s = sc.current, zz = zoo.current;
    if (!s || !zz) return;
    if (n.kind === 'exit') { onExit(); return; }
    if (n.kind === 'car') { s.getIn(); return; }
    if (n.kind === 'habitat') { setOpen({ kind: 'exhibit', id: habitat(n.id)?.exhibit ?? '' }); return; }
    if (n.kind === 'house') { setOpen({ kind: 'exhibit', id: n.exhibit }); return; }
    if (n.kind === 'loose') {
      s.lure(n.id);
      const a = zz.animals.find((x) => x.id === n.id);
      if (a) setFollowing({ kind: 'animal', id: a.id, name: a.name, home: habitat(a.habitat)?.name ?? 'home' });
      return;
    }
    if (n.kind === 'kid') { s.helpKid(); setFollowing({ kind: 'kid', name: n.name }); return; }
    if (n.kind === 'place') {
      if (n.placeKind === 'station') { if (s.trainHere(n.id)) s.rideTrain(); else setToast({ id: `t${Date.now()}`, at: zz.clock, kind: 'funny', emoji: '🚂', title: 'The train’s on its way round. Wait right here!', text: '' }); return; }
      if (n.id === 'skyfari' || n.id === 'skyfari-top') { s.rideSkyfari(); return; }
      if (n.placeKind === 'food') {
        setToast({ id: `t${Date.now()}`, at: zz.clock, kind: 'funny', emoji: n.emoji, title: `${n.name}: ${zz.today.inPark > 3 ? 'busy! Visitors buy snacks here, and that money helps the zoo.' : 'quiet right now. When visitors come, they buy snacks here.'}`, text: '' });
      }
    }
  }, [onExit]);

  // Keys.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (e.type === 'keyup') { keys.current.delete(key); return; }
      if (key === 'escape') { if (open) setOpen(null); else if (mapBig) setMapBig(false); else if (ride) sc.current?.getOff(); else onExit(); return; }
      if (open) return;
      if ((key === 'e' || key === 'enter') && near) { goNear(near); return; }
      if (key === 'e' && ride) { sc.current?.getOff(); return; }
      if (key === 'f' && (mode === 'drive' || mode === 'ride')) { sc.current?.getOut(); return; }
      if (key === 'l') { setFlash((f) => !f); return; }
      if (key === 'm') { setMapBig((m) => !m); return; }
      keys.current.add(key);
      if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', k);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); };
  }, [open, mapBig, ride, near, goNear, mode, onExit]);

  useEffect(() => { sc.current?.flashlight(flash); }, [flash]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.kind === 'report' ? 9000 : 6000); return () => clearTimeout(t); }, [toast]);

  /** Skip ahead to morning (or tonight). */
  const skip = (to: 'morning' | 'night') => {
    if (!z) return;
    const m = minuteOfDay(z.clock);
    const target = to === 'morning' ? 8 * 60 : 20.5 * 60;
    const mins = (target - m + DAY) % DAY || DAY;
    const evs = advance(z, mins, Math.random);
    heard(evs);
    changed();
  };

  const pickMode = (m: ZooMode) => { sc.current?.setMode(m); setMode(m); };
  const night = z ? isNight(z.clock) : false;
  const h = z ? hourOf(z.clock) : 9;
  const opening = z && (minuteOfDay(z.clock) < OPEN || minuteOfDay(z.clock) >= CLOSE);
  const waiting = z ? todos(z).length : 0;
  const fresh = z ? unseen(z).length : 0;
  const goal = z?.goal ? upgrade(z.goal) : null;
  const openAnimal = open?.kind === 'animal' && z ? z.animals.find((a) => a.id === open.id) : null;

  return (
    <div className="fixed inset-0 z-[60] select-none overflow-hidden bg-sky-200 text-white">
      <div ref={host} className="absolute inset-0" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-emerald-900 text-xl font-bold">🦁 Opening the zoo gates…</div>}

      {/* The top bar: the clock, the weather, the money */}
      {z && (
        <div className="absolute inset-x-2 top-2 z-30 flex flex-wrap items-center gap-1.5">
          <button onClick={onExit} className="flex items-center gap-1 rounded-full bg-neutral-950/70 px-3 py-2 text-[13px] font-semibold shadow-lg backdrop-blur hover:bg-neutral-900"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Kan City</span></button>
          <div className="flex items-center gap-2 rounded-full bg-neutral-950/70 px-3 py-2 text-[13px] font-semibold shadow-lg backdrop-blur">
            <span>Day {day(z.clock)}</span>
            <span className="tabular-nums">{night ? '🌙' : '☀️'} {clockText(z.clock)}</span>
            <span className="hidden sm:inline">{WEATHER_WORD[z.weather]}</span>
            <span className="hidden text-white/60 md:inline">{opening ? (z.owned.includes('after-dark') && h >= 19 && h < 22 ? '🏮 After Dark' : 'Closed') : 'Open'}</span>
          </div>
          <button onClick={() => setOpen({ kind: 'money' })} className="rounded-full bg-emerald-500 px-3 py-2 text-[14px] font-bold shadow-lg hover:bg-emerald-400">💰 {money(z.money)}</button>
          <span className="hidden rounded-full bg-neutral-950/70 px-3 py-2 text-[13px] font-semibold shadow-lg backdrop-blur sm:inline">👥 {Math.round(z.today.inPark)} here · {z.today.visitors} today</span>
          {z.stars > 0 && <span className="rounded-full bg-amber-400 px-3 py-2 text-[13px] font-bold text-neutral-900 shadow-lg">⭐ {z.stars}</span>}
          <button onClick={() => { setOpen({ kind: 'news' }); }} className="relative rounded-full bg-neutral-950/70 px-3 py-2 text-[13px] font-semibold shadow-lg backdrop-blur hover:bg-neutral-900">
            📰 <span className="hidden sm:inline">What happened</span>
            {(waiting > 0 || fresh > 0) && <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${waiting ? 'bg-rose-500' : 'bg-violet-500'}`}>{waiting || fresh}</span>}
          </button>
          <button onClick={() => setOpen({ kind: 'plans' })} className="rounded-full bg-neutral-950/70 px-3 py-2 text-[13px] font-semibold shadow-lg backdrop-blur hover:bg-neutral-900">🏗️ <span className="hidden sm:inline">Plans</span></button>
        </div>
      )}

      {/* The clock's speed, and skipping ahead */}
      {z && !open && (
        <div className="absolute left-1/2 top-[100px] z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-neutral-950/70 p-0.5 shadow-lg backdrop-blur sm:top-[60px]">
          {SPEEDS.map((sp) => (
            <button key={sp.k} title={sp.title} onClick={() => setSpeed(sp.k)} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${speed === sp.k ? 'bg-amber-400 text-neutral-900' : 'text-white/80 hover:text-white'}`}>{sp.label}</button>
          ))}
          <button onClick={() => skip(night || h >= 17 ? 'morning' : 'night')} className="rounded-full px-3 py-1.5 text-[13px] font-bold text-white/80 hover:text-white" title={night || h >= 17 ? 'Skip to morning' : 'Skip to night'}>
            {night || h >= 17 ? '⏭ ☀️' : '⏭ 🌙'}
          </button>
        </div>
      )}

      {/* Saving up for something */}
      {z && goal && !z.owned.includes(goal.id) && !open && (
        <button onClick={() => setOpen({ kind: 'plans' })} className="absolute left-1/2 top-[146px] z-20 w-64 -translate-x-1/2 rounded-2xl sm:top-[100px] bg-neutral-950/70 px-3 py-2 text-left shadow-lg backdrop-blur">
          <p className="text-[12px] font-semibold">🐷 Saving for {goal.emoji} {goal.name}</p>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (Math.max(0, z.money) / goal.cost) * 100)}%` }} /></div>
          <p className="mt-0.5 text-[11px] text-white/70">{money(Math.max(0, z.money))} of {money(goal.cost)}{z.money >= goal.cost ? ' · you can buy it!' : ''}</p>
        </button>
      )}

      {/* How you get about */}
      {ready && !ride && (
        <div className="absolute right-2 top-[146px] z-30 flex flex-col items-center gap-0.5 rounded-full bg-neutral-950/70 p-0.5 shadow-lg backdrop-blur sm:top-[60px] sm:flex-row">
          {([['walk', Footprints, 'Walk'], ['ride', Scooter, 'Scooter'], ['drive', Car, 'Cart'], ['fly', Plane, 'Fly']] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => pickMode(m)} title={label} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] ${mode === m ? 'bg-emerald-500 text-white' : 'text-neutral-300 hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5" /><span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* What you're next to */}
      {near && !open && !ride && (
        <div className="absolute inset-x-0 z-20 flex justify-center px-4" style={{ bottom: coarse ? 196 : 110 }}>
          <div className="flex flex-wrap justify-center gap-2">
            <NearButtons near={near} zoo={z} coarse={coarse} onGo={goNear} onFeed={doFeed} onPlay={doPlay} />
          </div>
        </div>
      )}
      {ride && (
        <div className="absolute inset-x-0 z-20 flex flex-col items-center gap-2 px-4" style={{ bottom: coarse ? 60 : 40 }}>
          <p className="rounded-full bg-neutral-950/75 px-4 py-2 text-[14px] font-semibold shadow-xl backdrop-blur">
            {ride.kind === 'train' ? (ride.stopped ? `🚂 Stopped at ${ride.stopped}` : `🚂 All aboard! Next stop: ${ride.next}`) : `🚡 Riding the Skyfari to ${ride.to}`}
          </p>
          {(ride.kind === 'skyfari' || ride.stopped) && <button onClick={() => sc.current?.getOff()} className="rounded-full bg-white px-5 py-2.5 text-[15px] font-bold text-neutral-900 shadow-2xl">{ride.kind === 'train' ? 'Hop off here' : 'Jump off'}{!coarse && <span className="ml-2 font-normal text-neutral-400">E</span>}</button>}
        </div>
      )}
      {following && !ride && (
        <div className="absolute left-1/2 top-[200px] z-20 w-max max-w-[92vw] -translate-x-1/2 rounded-full bg-rose-500/90 sm:top-[140px] px-4 py-2 text-[14px] font-semibold shadow-xl">
          {following.kind === 'animal' ? `🐾 ${following.name} is following you! Walk them home to ${following.home}.` : `🧒 ${following.name} is holding your hand. Find their grown-up 👋`}
        </div>
      )}

      {/* Out of the cart, the flashlight, the minimap */}
      {ready && !ride && (mode === 'drive' || mode === 'ride') && (
        <button onClick={() => sc.current?.getOut()} className="absolute right-4 z-20 flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2.5 text-[14px] font-semibold text-neutral-900 shadow-2xl" style={{ bottom: coarse ? 196 : 40 }}>
          <LogOut className="h-4 w-4" /> {mode === 'ride' ? 'Hop off' : 'Get out'}{!coarse && <span className="ml-1 rounded bg-neutral-200 px-1.5 text-[11px] text-neutral-600">F</span>}
        </button>
      )}
      {ready && (night || h >= 18.5 || h < 6.5 || flash) && (
        <button onClick={() => setFlash((f) => !f)} className={`absolute right-4 z-20 flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-semibold shadow-2xl ${flash ? 'bg-yellow-300 text-neutral-900' : 'bg-neutral-950/75 text-white'}`} style={{ bottom: coarse ? 250 : mode === 'walk' ? 40 : 96 }}>
          🔦 {flash ? 'On' : 'Flashlight'}{!coarse && <span className="ml-1 rounded bg-black/15 px-1.5 text-[11px]">L</span>}
        </button>
      )}
      {ready && !mapBig && (
        <button onClick={() => setMapBig(true)} className="absolute bottom-3 left-3 z-20 hidden h-40 w-48 overflow-hidden rounded-2xl border-2 border-white/60 bg-emerald-800 shadow-2xl sm:block" title="The map (M)">
          <ZooMap me={where.px} heading={where.heading} markers={markers} small onOpen={() => setMapBig(true)} />
        </button>
      )}
      {ready && !mapBig && coarse && (
        <button onClick={() => setMapBig(true)} className="absolute right-4 z-20 rounded-full bg-neutral-950/75 px-4 py-2.5 text-[14px] font-semibold shadow-2xl" style={{ bottom: 140 }}>🗺️ Map</button>
      )}
      {mapBig && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-950/60 p-3" onClick={() => setMapBig(false)}>
          <div className="relative max-h-full w-full max-w-4xl overflow-auto rounded-3xl bg-emerald-800 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 pb-1 text-[14px] font-semibold">🗺️ Tap a place to go there{markers.some((m) => m.kind !== 'train') ? ' · ❗ is something that needs you' : ''}</p>
            <ZooMap me={where.px} heading={where.heading} markers={markers} onGo={(px) => { sc.current?.jumpTo(px); setMapBig(false); }} />
          </div>
        </div>
      )}

      {/* Hints */}
      {ready && !coarse && !open && !ride && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-neutral-950/50 px-3 py-1 text-[11px] text-white/70 md:block">
          W A S D to {mode === 'fly' ? 'fly · W S to climb and dive' : mode === 'walk' ? 'walk' : 'drive'} · Shift to hurry · E to look · M for the map · L for the flashlight · Esc to leave
        </p>
      )}
      {coarse && !open && !mapBig && <Stick onMove={(x, y) => { stick.current = { x, y }; }} bottom={108} hint={mode === 'walk' ? 'Walk' : mode === 'fly' ? 'Steer · climb' : 'Drive'} />}

      {/* A toast for what just happened */}
      {toast && !open && (
        <button onClick={() => { setToast(null); if (toast.kind !== 'funny') setOpen({ kind: 'news' }); }} className="absolute left-1/2 top-[150px] z-40 w-[min(92vw,420px)] sm:top-[150px] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-left text-neutral-900 shadow-2xl">
          <p className="flex items-start gap-2 text-[15px] font-semibold leading-snug"><span className="text-2xl leading-none">{toast.emoji}</span>{toast.title}</p>
          {toast.math && <div className="mt-1 font-mono text-[12px] text-amber-900">{toast.math.map((l, i) => <p key={i}>{l}</p>)}</div>}
          {toast.todo && <p className="mt-1 text-[12px] font-semibold text-rose-600">Tap to see what to do</p>}
        </button>
      )}

      {/* The sheets */}
      {z && open?.kind === 'news' && (
        <NewsSheet zoo={z} title={open.welcome ? (z.events.length === 1 ? 'Welcome to your zoo!' : 'Welcome back! Here’s what happened at the zoo') : undefined}
          onClose={() => { markSeen(z); setOpen(null); changed(); }} onAct={(e) => { markSeen(z); act(e); }} />
      )}
      {z && open?.kind === 'exhibit' && (
        <ExhibitSheet zoo={z} id={open.id} onClose={() => setOpen(null)} onAnimal={(a) => setOpen({ kind: 'animal', id: a.id })}
          onFeed={doFeed} onPlay={doPlay} onBuy={doBuy} onGoal={doGoal} onFix={doFix}
          canFeed={nearHabitat && EXHIBITS.find((e) => e.id === open.id)?.habitats.some((x) => x.id === nearHabitat) ? nearHabitat : null} />
      )}
      {z && openAnimal && (
        <AnimalSheet zoo={z} a={openAnimal} onClose={() => setOpen(null)} onVet={(a) => setOpen({ kind: 'vet', id: a.id })} onName={openBaby} />
      )}
      {z && open?.kind === 'plans' && <PlansSheet zoo={z} onClose={() => setOpen(null)} onBuy={doBuy} onGoal={doGoal} />}
      {z && open?.kind === 'money' && <MoneySheet zoo={z} onClose={() => setOpen(null)} onPrice={(p) => { z.price = p; changed(); }} onQuiz={() => setOpen({ kind: 'quiz', q: question(z, Math.random) })} />}
      {z && open?.kind === 'quiz' && <QuizSheet q={open.q} onClose={() => setOpen(null)} onAnswer={(right) => { answered(z, right); changed(); }} />}
      {z && open?.kind === 'baby' && (() => {
        const a = z.animals.find((x) => x.id === open.id);
        return a ? <BabySheet a={a} names={open.names} onClose={() => setOpen(null)} onName={(n) => { nameBaby(z, a.id, n); setToast({ id: `t${Date.now()}`, at: z.clock, kind: 'baby', emoji: '🍼', title: `Welcome to the zoo, ${n}!`, text: '' }); setOpen(null); changed(); }} /> : null;
      })()}
      {z && open?.kind === 'vet' && (() => {
        const a = z.animals.find((x) => x.id === open.id);
        if (!a?.sick) return <Sheet title="Dr. Paws" emoji="🩺" onClose={() => setOpen(null)}><p>Everyone’s feeling fine!</p></Sheet>;
        return <VetSheet a={a} onClose={() => setOpen(null)} onDone={() => { heal(z, a.id); setToast(z.events[0]); setOpen(null); changed(); }} />;
      })()}

      <style>{ZOO_CSS}</style>
    </div>
  );
}

function NearButtons({ near, zoo, coarse, onGo, onFeed, onPlay }: { near: ZooNear; zoo: Zoo | null; coarse: boolean; onGo: (n: ZooNear) => void; onFeed: (h: string) => void; onPlay: (h: string) => void }) {
  const E = !coarse && <span className="ml-1.5 rounded bg-neutral-200 px-1.5 text-[11px] font-normal text-neutral-600">E</span>;
  const main = 'flex items-center rounded-full bg-white px-4 py-2.5 text-[15px] font-semibold text-neutral-900 shadow-2xl hover:bg-emerald-50 active:scale-95';
  if (near.kind === 'habitat' && zoo) {
    const list = zoo.animals.filter((a) => a.habitat === near.id && !a.loose);
    const sp = list[0] ? species(list[0].species) : null;
    return (
      <>
        <button onClick={() => onGo(near)} className={main}>{sp?.emoji} {near.name}{E}</button>
        {sp && <button onClick={() => onFeed(near.id)} className="rounded-full bg-emerald-500 px-4 py-2.5 text-[15px] font-semibold shadow-2xl active:scale-95">{sp.foodEmoji} Feed</button>}
        {sp && sp.look.body !== 'fish' && sp.look.body !== 'butterfly' && <button onClick={() => onPlay(near.id)} className="rounded-full bg-sky-500 px-4 py-2.5 text-[15px] font-semibold shadow-2xl active:scale-95">🎾 Toy</button>}
      </>
    );
  }
  const label =
    near.kind === 'exit' ? '👋 Back to Kan City'
      : near.kind === 'car' ? `Hop back on ${near.name}`
        : near.kind === 'house' ? `👀 Look inside ${near.name}`
          : near.kind === 'loose' ? `${(() => { const a = zoo?.animals.find((x) => x.id === near.id); return a ? species(a.species).foodEmoji : '🍎'; })()} Offer ${near.name} a treat`
            : near.kind === 'kid' ? `🧒 Help ${near.name} find their family`
              : near.kind === 'parent' ? `👋 There’s ${near.name}’s grown-up!`
                : near.kind === 'place' ? (near.placeKind === 'station' ? `🚂 Ride the train` : near.id.startsWith('skyfari') ? '🚡 Ride the Skyfari' : `${near.emoji} ${near.name}`)
                  : '';
  return <button onClick={() => onGo(near)} className={main}>{label}{E}</button>;
}

const ZOO_CSS = `
.kz-labels > * { position: absolute; left: 0; top: 0; will-change: transform; }
.kz-label { pointer-events: auto; white-space: nowrap; border-radius: 9999px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
.kz-exhibit { background: rgba(255,255,255,.92); color: #14532d; padding: 4px 10px; font-size: 13px; }
.kz-exhibit .kz-em { font-size: 16px; }
.kz-exhibit .kz-badges { margin-left: 4px; }
.kz-animal { background: rgba(17,24,39,.72); color: #fff; padding: 2px 8px; font-size: 12px; }
.kz-animal.kz-loose { background: #ef4444; animation: kz-bounce 0.9s ease-in-out infinite; font-size: 13px; }
.kz-kid { background: #f59e0b; color: #1c1917; padding: 3px 9px; font-size: 13px; animation: kz-bounce 1.2s ease-in-out infinite; }
@keyframes kz-bounce { 0%,100% { margin-top: 0; } 50% { margin-top: -6px; } }
.kz-pulse { animation: kz-pulse 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes kz-pulse { 0%,100% { opacity: .9; transform: scale(1); } 50% { opacity: .5; transform: scale(1.35); } }
`;
