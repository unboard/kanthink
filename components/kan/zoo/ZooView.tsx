'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Car, Footprints, LogOut, Plane, Scooter } from 'lucide-react';
import type { PlayerKit } from '../city/engine';
import { Stick } from '../city/Stick';
import { species } from '@/lib/kan/zoo/species';
import { EXHIBITS, habitat, type Px } from '@/lib/kan/zoo/map';
import {
  CLOSE, DAY, OPEN, WEATHER_WORD, advance, answerQuiz, answered, babyNames, buy, catchLoose, catchUp, clockText, day, feed as feedSim, fixFence, foundKid, heal,
  hourOf, isNight, loadZoo, markSeen, minuteOfDay, money, nameBaby, newZoo, play as playSim, question, saveZoo, todos, unseen, upgrade,
  type Animal, type Question, type Zoo, type ZooEvent,
} from '@/lib/kan/zoo/sim';
import { choose, startStory } from '@/lib/kan/zoo/stories';
import { ZooScene, type Ride, type ZooMode, type ZooNear, type ZooPick } from './scene';
import { INTERIOR_FOR, ZooInterior, type InteriorNear } from './interior';
import { ZooVisit, type VisitAct } from './visit';
import { VisitPanel } from './VisitPanel';
import { care, careFor, scaleBonus, upNow, type CareAction } from '@/lib/kan/zoo/care';
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
const LOUD: ZooEvent['kind'][] = ['escape', 'sick', 'baby', 'storm', 'fieldtrip', 'report', 'lost', 'vip', 'fog', 'fame'];

export function ZooView({ kit, coarse, onExit }: { kit: PlayerKit; coarse: boolean; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sc = useRef<ZooScene | null>(null);
  /** Inside a building: its own scene, drawn instead of the zoo outside. */
  const inside = useRef<ZooInterior | null>(null);
  /** Visiting one animal up close: drawn instead of everything else. */
  const visit = useRef<ZooVisit | null>(null);
  const [indoors, setIndoors] = useState<{ exhibit: string; name: string } | null>(null);
  const [inNear, setInNear] = useState<InteriorNear | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const floorRef = useRef<string | null>(null);
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
  const changed = useCallback(() => { if (zoo.current) { sc.current?.sync(zoo.current); inside.current?.sync(zoo.current); } save(); refresh(); }, [save, refresh]);

  // What's new pops up as a toast; the big ones open the news.
  const heard = useCallback((evs: ZooEvent[]) => {
    const loud = evs.filter((e) => LOUD.includes(e.kind) || e.choices?.length || (e.kind === 'story' && Math.random() < 0.5));
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
      onLanded: (where) => { if (where) setToast({ id: `t${Date.now()}`, at: zoo.current?.clock ?? 0, kind: 'funny', emoji: '🪂', title: `You landed right in ${where}! The animals are very curious. Walk to the fence and climb out.`, text: '' }); },
      onWhere: (px, heading) => { whereRef.current = { px, heading }; },
    }, kit);
    sc.current = s;
    // A fresh scene starts outside.
    setIndoors(null);
    setInNear(null);
    setFloor(null);
    s.sync(z);
    // For testing in a background tab, where frames barely come: step it by hand.
    if (process.env.NODE_ENV !== 'production') Object.assign(window, {
      __zoo: s, __zooState: () => zoo.current, __zooInside: () => inside.current,
      __zooStory: (id: string) => { const ok = startStory(zoo.current!, id, Math.random); s.sync(zoo.current!); refresh(); return ok; },
      __zooInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }),
      __zooLineup:(ids: string[], baby = false) => { speedRef.current = 0; s.lineup(ids, baby); renderer.render(s.scene, s.camera); },
      __zooRun: (frames: number, input = { steer: 0, push: 0, boost: false }) => {
        const zz = zoo.current!;
        for (let i = 0; i < frames; i++) {
          const evs = advance(zz, 0.05 * speedRef.current, Math.random);
          if (evs.length) { s.sync(zz); heard(evs); }
          if (inside.current) inside.current.step(0.05, input, hourOf(zz.clock));
          else s.step(0.05, input, hourOf(zz.clock), zz.weather, { visitors: Math.min(240, zz.today.inPark * 2.2), afterDark: zz.owned.includes('after-dark'), trainCars: 3 });
        }
        if (inside.current) { renderer.render(inside.current.scene, inside.current.camera); inside.current.placeLabels(el.clientWidth, el.clientHeight); }
        else { renderer.render(s.scene, s.camera); s.placeLabels(el.clientWidth, el.clientHeight); }
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
      inside.current?.resize(w / h);
      visit.current?.resize(w / h);
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
        if (evs.length) { s.sync(zz); inside.current?.sync(zz); heard(evs); refresh(); }
      }
      zz.real = Date.now();
      const room = inside.current;
      if (visit.current) {
        visit.current.step(dt);
        renderer.render(visit.current.scene, visit.current.camera);
      } else if (room) {
        room.step(dt, input(), hourOf(zz.clock));
        renderer.render(room.scene, room.camera);
        room.placeLabels(el.clientWidth, el.clientHeight);
      } else {
        s.step(dt, input(), hourOf(zz.clock), zz.weather, { visitors: Math.min(240, zz.today.inPark * 2.2), afterDark: zz.owned.includes('after-dark'), trainCars: zz.owned.includes('train-car') ? 4 : 3 });
        renderer.render(s.scene, s.camera);
        s.placeLabels(el.clientWidth, el.clientHeight);
      }
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
    let down: { x: number; y: number } | null = null, dragX = 0;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; dragX = e.clientX; };
    const onMove = (e: PointerEvent) => {
      // Drag to look around.
      const room = inside.current;
      if (down) { (visit.current ?? room ?? s).turn(-(e.clientX - dragX) * 0.008); dragX = e.clientX; return; }
      if (e.pointerType !== 'mouse' || visit.current) return;
      renderer.domElement.style.cursor = (room ?? s).hover(ndc(e)) ? 'pointer' : 'grab';
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || visit.current) return;
      const p = (inside.current ?? s).tap(ndc(e));
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
      inside.current?.dispose();
      inside.current = null;
      s.dispose();
      sc.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kit, heard, refresh]);

  // A visit starts when you tap an animal (one that's home), and ends when you leave it.
  const visitId = open?.kind === 'animal' ? open.id : null;
  useEffect(() => {
    const zz = zoo.current, a = visitId ? zz?.animals.find((x) => x.id === visitId) : null;
    if (!zz || !a || a.loose || a.habitat === '__away' || !host.current) return;
    const sp = species(a.species), hab = habitat(a.habitat);
    const c = care(a.species);
    const tank = sp.look.body === 'fish' || ['octopus', 'seaturtle', 'stingray', 'shark', 'koi'].includes(sp.id);
    const ex = hab ? EXHIBITS.find((e) => e.id === hab.exhibit) : undefined;
    const kin = zz.animals.filter((x) => x.id !== a.id && !x.loose && x.habitat === a.habitat && ((a.mom && (x.id === a.mom || x.mom === a.mom)) || x.mom === a.id));
    const v = new ZooVisit(a, sp, {
      ground: { grass: '#86c06a', savanna: '#cdb46c', dirt: '#a8835a', rock: '#9a958c', snow: '#eef2f6', sand: '#e6cf98', jungle: '#4f8a3a', ice: '#dff3ff', mulch: '#7a5a3a' }[hab?.ground ?? 'grass'],
      water: Boolean(sp.swims && (hab?.pool || hab?.tank)), tank, indoor: Boolean(ex?.hall), touch: c.touch,
    }, kin.map((x) => ({ a: x, sp: species(x.species) })), kit);
    v.light(hourOf(zz.clock));
    v.setAsleep(!upNow(a, hourOf(zz.clock)));
    v.resize((host.current.clientWidth || 1) / (host.current.clientHeight || 1));
    visit.current = v;
    const layer = labels.current;
    if (layer) layer.style.visibility = 'hidden';
    return () => {
      v.dispose();
      if (visit.current === v) visit.current = null;
      if (layer) layer.style.visibility = '';
    };
  }, [visitId, kit]);
  const doVisit = (show: VisitAct, extra?: string, did?: { action: CareAction; right: boolean }) => {
    const zz = zoo.current, a = openAnimal;
    if (!zz || !a) return false;
    visit.current?.play(show, extra);
    const first = did ? careFor(zz, a, did.action, did.right) : false;
    changed();
    return first;
  };

  /** In through an exhibit's door. */
  const goIn = useCallback((exhibit: string, name: string) => {
    const s = sc.current, zz = zoo.current, to = INTERIOR_FOR[exhibit];
    if (!s || !zz || !to || !labels.current || !host.current) return;
    inside.current?.dispose();
    const room = new ZooInterior(to.id, to.start, labels.current, {
      onNear: setInNear,
      onPick: (p) => pickRef.current(p),
      onFloor: (f) => { floorRef.current = f; setFloor(f); },
    }, kit);
    room.sync(zz);
    room.resize((host.current.clientWidth || 1) / (host.current.clientHeight || 1));
    inside.current = room;
    floorRef.current = to.start === 'night' ? 'Kingdoms of the Night' : null;
    s.hideLabels(true);
    setIndoors({ exhibit, name });
    setFloor(floorRef.current);
    setInNear(null);
  }, [kit]);
  /** Back out, through the door you'd use from where you are (Kingdoms of the Night has its own). */
  const goOut = useCallback(() => {
    const s = sc.current, room = inside.current;
    if (!s) return;
    room?.dispose();
    inside.current = null;
    s.hideLabels(false);
    const ex = indoors?.exhibit === 'desert' || indoors?.exhibit === 'night' ? (floorRef.current === 'Kingdoms of the Night' ? 'night' : 'desert') : indoors?.exhibit;
    if (ex) s.outside(ex);
    setIndoors(null);
    setInNear(null);
    setFloor(null);
  }, [indoors]);

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
    (inside.current ?? sc.current)?.feed(h);
    setToast({ id: `t${Date.now()}`, at: z.clock, kind: 'funny', emoji: list[0] ? species(list[0].species).foodEmoji : '🍽️', title: hungry < 25 ? 'They were already pretty full, but they’ll take a snack!' : `Yum! The ${list[0] ? species(list[0].species).many : 'animals'} love it.`, text: '' });
    setOpen(null);
    changed();
  };
  const doPlay = (h: string) => { if (!z) return; playSim(z, h); (inside.current ?? sc.current)?.play(h); setOpen(null); changed(); };
  const goInNear = (n: InteriorNear) => {
    if (n.kind === 'exit') goOut();
    else if (n.kind === 'elevator') inside.current?.useElevator();
    else setOpen({ kind: 'exhibit', id: habitat(n.id)?.exhibit ?? '' });
  };
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
    if (n.kind === 'hall') { goIn(n.exhibit, n.name); return; }
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
  }, [onExit, goIn]);

  // Keys.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (e.type === 'keyup') { keys.current.delete(key); return; }
      if (key === 'escape') { if (open) setOpen(null); else if (mapBig) setMapBig(false); else if (inside.current) goOut(); else if (ride) sc.current?.getOff(); else onExit(); return; }
      if (open) return;
      if ((key === 'e' || key === 'enter') && inside.current) { if (inNear) goInNear(inNear); return; }
      if ((key === 'e' || key === 'enter') && near) { goNear(near); return; }
      if (key === 'e' && ride?.kind === 'train' && ride.stopped) { sc.current?.getOff(); return; }
      if (key === 'f' && (mode === 'drive' || mode === 'ride')) { sc.current?.getOut(); return; }
      if (key === ' ' && (mode === 'fly' || ride?.kind === 'skyfari')) { e.preventDefault(); sc.current?.jump(); return; }
      if (key === 'l') { setFlash((f) => !f); return; }
      if (key === 'm') { setMapBig((m) => !m); return; }
      keys.current.add(key);
      if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    };
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', k);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapBig, ride, near, goNear, mode, onExit, inNear, goOut]);

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
  const visiting = Boolean(openAnimal && !openAnimal.loose && openAnimal.habitat !== '__away');

  return (
    <div className="fixed inset-0 z-[60] select-none overflow-hidden bg-sky-200 text-white">
      <div ref={host} className="absolute inset-0" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-emerald-900 text-xl font-bold">🦁 Opening the zoo gates…</div>}

      {!visiting && (<>

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
      {ready && !ride && !indoors && (
        <div className="absolute right-2 top-[146px] z-30 flex flex-col items-center gap-0.5 rounded-full bg-neutral-950/70 p-0.5 shadow-lg backdrop-blur sm:top-[60px] sm:flex-row">
          {([['walk', Footprints, 'Walk'], ['ride', Scooter, 'Scooter'], ['drive', Car, 'Cart'], ['fly', Plane, 'Fly']] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => pickMode(m)} title={label} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] ${mode === m ? 'bg-emerald-500 text-white' : 'text-neutral-300 hover:text-white'}`}>
              <Icon className="h-3.5 w-3.5" /><span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* What you're next to */}
      {indoors && !open && (
        <>
          <div className="absolute left-1/2 top-[100px] z-20 -translate-x-1/2 rounded-full bg-neutral-950/70 px-4 py-1.5 text-[14px] font-semibold shadow-lg backdrop-blur sm:top-[100px]">📍 {indoors.name}{floor && floor !== indoors.name ? ` · ${floor}` : ''}</div>
          <div className="absolute inset-x-0 z-20 flex justify-center gap-2 px-4" style={{ bottom: coarse ? 196 : 110 }}>
            {inNear && (
              <button onClick={() => goInNear(inNear)} className="flex items-center rounded-full bg-white px-4 py-2.5 text-[15px] font-semibold text-neutral-900 shadow-2xl hover:bg-emerald-50 active:scale-95">
                {inNear.kind === 'exit' ? '🚪 Go back outside' : inNear.kind === 'elevator' ? `🛗 ${inNear.label}` : `👀 ${inNear.name}`}
                {!coarse && <span className="ml-1.5 rounded bg-neutral-200 px-1.5 text-[11px] font-normal text-neutral-600">E</span>}
              </button>
            )}
            {inNear?.kind === 'habitat' && (() => { const a = z?.animals.find((x) => x.habitat === inNear.id); return a ? <button onClick={() => doFeed(inNear.id)} className="rounded-full bg-emerald-500 px-4 py-2.5 text-[15px] font-semibold shadow-2xl active:scale-95">{species(a.species).foodEmoji} Feed</button> : null; })()}
            {inNear?.kind !== 'exit' && <button onClick={goOut} className="rounded-full bg-neutral-950/70 px-4 py-2.5 text-[14px] font-semibold shadow-xl backdrop-blur active:scale-95">🚪 Leave</button>}
          </div>
        </>
      )}
      {near && !open && !ride && !indoors && (
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
          {ride.kind === 'skyfari' && <button onClick={() => sc.current?.jump()} className="rounded-full bg-pink-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-2xl">🪂 Jump!{!coarse && <span className="ml-2 rounded bg-white/25 px-1.5 text-[11px] font-normal">Space</span>}</button>}
          {ride.kind === 'train' && ride.stopped && <button onClick={() => sc.current?.getOff()} className="rounded-full bg-white px-5 py-2.5 text-[15px] font-bold text-neutral-900 shadow-2xl">{ride.kind === 'train' ? 'Hop off here' : 'Jump off'}{!coarse && <span className="ml-2 font-normal text-neutral-400">E</span>}</button>}
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
      {ready && !ride && mode === 'fly' && (
        <button onClick={() => sc.current?.jump()} className="absolute right-4 z-20 flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-2xl active:scale-95" style={{ bottom: coarse ? 196 : 40 }}>
          🪂 Jump{!coarse && <span className="ml-1 rounded bg-white/25 px-1.5 text-[11px]">Space</span>}
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
          {toast.quiz && !toast.quiz.solved ? <p className="mt-1 font-mono text-[13px] font-semibold text-amber-900">🧮 {toast.quiz.q} Tap to answer for a bonus!</p>
            : toast.math && <div className="mt-1 font-mono text-[12px] text-amber-900">{toast.math.map((l, i) => <p key={i}>{l}</p>)}</div>}
          {toast.todo && <p className="mt-1 text-[12px] font-semibold text-rose-600">Tap to see what to do</p>}
        </button>
      )}

      </>)}

      {/* The sheets */}
      {z && open?.kind === 'news' && (
        <NewsSheet zoo={z} title={open.welcome ? (z.events.length === 1 ? 'Welcome to your zoo!' : 'Welcome back! Here’s what happened at the zoo') : undefined}
          onClose={() => { markSeen(z); setOpen(null); changed(); }} onAct={(e) => { markSeen(z); act(e); }}
          onQuiz={(e, v) => { const r = answerQuiz(z, e.id, v); changed(); return r; }}
          onChoose={(e, i) => { if (choose(z, e.id, i, Math.random)) { const next = z.events[0]; if (next.id !== e.id) setToast(next); changed(); } }} />
      )}
      {z && open?.kind === 'exhibit' && (
        <ExhibitSheet zoo={z} id={open.id} onClose={() => setOpen(null)} onAnimal={(a) => setOpen({ kind: 'animal', id: a.id })}
          onFeed={doFeed} onPlay={doPlay} onBuy={doBuy} onGoal={doGoal} onFix={doFix}
          canFeed={(() => { const h = inNear?.kind === 'habitat' ? inNear.id : nearHabitat; return h && EXHIBITS.find((e) => e.id === open.id)?.habitats.some((x) => x.id === h) ? h : null; })()} />
      )}
      {z && openAnimal && visiting && (
        <VisitPanel key={openAnimal.id} zoo={z} a={openAnimal} onClose={() => setOpen(null)} onDo={doVisit}
          onVet={(a) => setOpen({ kind: 'vet', id: a.id })} onName={openBaby}
          onScale={(right, bonus) => { if (right) { scaleBonus(z, bonus); changed(); } }} />
      )}
      {z && openAnimal && !visiting && (
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
          : near.kind === 'hall' ? `🚪 Go inside ${near.name}`
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
.kz-happening { background: linear-gradient(90deg,#f472b6,#a78bfa); color: #fff; padding: 5px 12px; font-size: 14px; animation: kz-bounce 1.6s ease-in-out infinite; }
.kz-kid { background: #f59e0b; color: #1c1917; padding: 3px 9px; font-size: 13px; animation: kz-bounce 1.2s ease-in-out infinite; }
@keyframes kz-bounce { 0%,100% { margin-top: 0; } 50% { margin-top: -6px; } }
.kz-pulse { animation: kz-pulse 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes kz-pulse { 0%,100% { opacity: .9; transform: scale(1); } 50% { opacity: .5; transform: scale(1.35); } }
`;
