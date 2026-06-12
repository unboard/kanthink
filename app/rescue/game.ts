// Paws & Found — game engine.
// Endless procedural rescue missions, evidence trails, the gentle-approach
// minigame, petting, residents, pregnancies & litters, and per-character saves.

import {
  ANIMAL_NAMES,
  GEAR_BY_ID,
  OWNERS,
  RANGER,
  REGIONS,
  REGION_BY_ID,
  SPECIES,
  SPECIES_BY_ID,
  SPECIES_TRAITS,
  TRAIT_BY_ID,
  UPGRADE_BY_ID,
  babyAppearance,
  describeAppearance,
  levelForRescues,
  randomAppearance,
  type SpeciesDef,
} from './data';
import { TILE, getMap, h2, walkable, type RegionMap } from './world';
import { Painter, type CritterView, type ViewState } from './render';
import { RescueAudio } from './audio';
import type {
  AnimalCharacter,
  ApproachState,
  EvidenceNode,
  Mission,
  Place,
  Player,
  RegionId,
  Resident,
  SaveData,
  Effect,
} from './types';

export type Slot = 'scarlett' | 'lennon';

export type RescueEvent =
  | { kind: 'story'; mission: Mission }
  | { kind: 'map' }
  | { kind: 'celebrate'; mission: Mission; coins: number; outcome: 'reunited' | 'released' | 'adopted'; pregnant: boolean; leveledTo: number | null }
  | { kind: 'birth'; mom: Resident; babies: Resident[] }
  | { kind: 'clue'; text: string }
  | { kind: 'toast'; msg: string; icon?: string }
  | { kind: 'hud' };

export interface ActionButton {
  id: string;
  label: string;
  icon: string;
  primary?: boolean;
}

const BASE_SIGHT = 4.3;

export class Game {
  slot: Slot;
  save: SaveData;
  place: Place = 'hq';
  player: Player;
  painter: Painter;
  audio: RescueAudio;
  paused = false;
  muted = false;

  // mission runtime
  mission: Mission | null = null;
  storyHeard = false;
  region: RegionId | null = null;
  pack: string[] = [];
  evidence: EvidenceNode[] = [];
  wrongRegion = false;
  animalPos = { x: 0, y: 0 };
  animalDir: 1 | -1 = 1;
  animalRevealed = false;
  approach: ApproachState | null = null;
  spookMeter = 0;
  petted = false;
  carrying = false;
  mamaFollows = false;
  babies: { x: number; y: number; found: boolean }[] = [];
  ruledOut: RegionId | null = null;
  usedRightLure = false;
  pettedResidents = new Set<string>();

  effects: Effect[] = [];
  simT = 0;

  private listeners: ((e: RescueEvent) => void)[] = [];
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private destroyed = false;
  private stepT = 0;
  private voiceT = 0;
  private rng: () => number;

  constructor(canvas: HTMLCanvasElement, slot: Slot) {
    this.slot = slot;
    this.save = this.load();
    this.muted = false;
    let seed = this.save.missionSeed;
    this.rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const hq = getMap('hq');
    this.player = { x: hq.entry.x, y: hq.entry.y, dir: 'down', moving: false, walkT: 0, target: null };
    this.painter = new Painter(canvas);
    this.painter.resize();
    this.painter.camX = this.player.x * TILE;
    this.painter.camY = this.player.y * TILE;
    this.audio = new RescueAudio();
    this.scatterResidents();
    if (this.save.activeMission) {
      this.mission = this.save.activeMission;
      this.storyHeard = true;
    }
    this.bind(canvas);
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt, now / 1000);
      this.painter.draw(this.view(), now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.persist();
    this.audio.stopSpeaking();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
  }

  on(fn: (e: RescueEvent) => void) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }
  private emit(e: RescueEvent) {
    for (const fn of this.listeners) fn(e);
  }

  // ---- save -----------------------------------------------------------------------------

  private saveKey() {
    return `paws-save-${this.slot}`;
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (raw) return JSON.parse(raw) as SaveData;
    } catch {
      /* fresh start */
    }
    return {
      version: 1,
      coins: 15,
      rescues: 0,
      level: 1,
      gear: ['apple', 'blanket'],
      upgrades: [],
      residents: [],
      book: [],
      missionSeed: (Date.now() % 100000) + (this.slot === 'scarlett' ? 7 : 13),
      activeMission: null,
      day: 1,
    };
  }

  persist() {
    try {
      this.save.activeMission = this.mission;
      localStorage.setItem(this.saveKey(), JSON.stringify(this.save));
    } catch {
      /* storage unavailable — keep playing */
    }
  }

  // ---- input ----------------------------------------------------------------------------

  private onKey = (e: KeyboardEvent) => {
    if (this.paused) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onResize = () => this.painter.resize();

  private bind(cv: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    cv.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      this.audio.init();
      const rect = cv.getBoundingClientRect();
      const w = this.painter.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const m = getMap(this.place);
      if (walkable(m, w.x, w.y)) this.player.target = { x: w.x, y: w.y };
      else {
        // tap near water/blocked: walk as close as possible toward it
        this.player.target = { x: w.x, y: w.y };
      }
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.audio.setMuted(m);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.player.target = null;
  }

  // ---- mission generation ------------------------------------------------------------------

  private newMission(): Mission {
    const r = this.rng;
    this.save.missionSeed = Math.floor(r() * 1e9);
    const level = this.save.level;

    // mission kind
    let kind: Mission['kind'] = 'pet';
    const roll = r();
    if (level >= 5 && roll < 0.12) kind = 'litter';
    else if (roll < 0.3) kind = 'wildlife';
    else if (roll < 0.48 && level >= 2) kind = 'stray' as Mission['kind'];

    // species
    const pool = SPECIES.filter((s) => s.minLevel <= level && (kind === 'wildlife' ? !s.isPet : s.isPet));
    const litterPool = pool.filter((s) => s.canBePregnant);
    const usePool = kind === 'litter' && litterPool.length ? litterPool : pool;
    const total = usePool.reduce((a, s) => a + s.weight, 0);
    let pick = r() * total;
    let sp: SpeciesDef = usePool[0];
    for (const s of usePool) {
      pick -= s.weight;
      if (pick <= 0) {
        sp = s;
        break;
      }
    }

    const sex: 'f' | 'm' = kind === 'litter' ? 'f' : r() < 0.5 ? 'f' : 'm';
    const name = ANIMAL_NAMES[Math.floor(r() * ANIMAL_NAMES.length)];
    const animal: AnimalCharacter = {
      id: `a${Date.now()}${Math.floor(r() * 999)}`,
      name,
      species: sp.id,
      sex,
      appearance: randomAppearance(r, sp.id),
    };

    // traits: 2 + up to 2 more by level, drawn from this species' pool
    const traitPool = [...(SPECIES_TRAITS[sp.id] ?? [])].sort(() => r() - 0.5);
    const nTraits = Math.min(traitPool.length, 2 + Math.min(2, Math.floor(level / 3)));
    const traitIds = traitPool.slice(0, nTraits);

    // where is the animal? score unlocked regions by trait weights
    const unlocked = REGIONS.filter((rg) => rg.minLevel <= level && (!rg.needsGear || this.save.gear.includes(rg.needsGear)));
    let best: RegionId = unlocked[0].id;
    let bestScore = -99;
    for (const rg of unlocked) {
      let score = r() * 0.8;
      for (const tid of traitIds) {
        score += TRAIT_BY_ID[tid].regions[rg.id] ?? 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = rg.id;
      }
    }

    // lure: a trait that names one, if the player could own it
    const lureTrait = traitIds.map((t) => TRAIT_BY_ID[t]).find((t) => t.lure);
    const lure = lureTrait?.lure ?? null;

    // story
    const P = sex === 'f' ? 'She' : 'He';
    const p = sex === 'f' ? 'she' : 'he';
    const owner = kind === 'wildlife' ? RANGER : OWNERS[Math.floor(r() * OWNERS.length)];
    const story: string[] = [];
    const desc = describeAppearance(animal.appearance, sp.id);
    if (kind === 'wildlife') {
      story.push(`*${owner}* hurries in with her ranger hat in her hands.`);
      story.push(`"A young *${sp.label}* is lost out there — ${desc}. ${P} needs help getting somewhere safe."`);
    } else if (kind === 'stray') {
      story.push(`*${owner}* comes in looking worried.`);
      story.push(`"There's a ${sp.label} that's been all alone for days — no collar, no home. ${desc[0].toUpperCase() + desc.slice(1)}. Everyone calls ${p === 'she' ? 'her' : 'him'} *${name}*."`);
    } else if (kind === 'litter') {
      story.push(`*${owner}* rushes through the door.`);
      story.push(`"A mama ${sp.label} — *${name}* — has gone off and hidden somewhere… and friends say she has *babies* with her! ${desc[0].toUpperCase() + desc.slice(1)}."`);
    } else {
      const when = ['yesterday', 'this morning', 'two days ago', 'last night'][Math.floor(r() * 4)];
      story.push(`*${owner}* hurries through the door.`);
      story.push(`"My ${sp.label} *${name}* slipped out ${when}! ${P} is ${desc}."`);
    }
    for (const tid of traitIds) {
      story.push(TRAIT_BY_ID[tid].story(name, P, p));
    }
    story.push(`"I last saw ${p === 'she' ? 'her' : 'him'} heading ${REGION_BY_ID[best].edgeHint}… please bring ${p === 'she' ? 'her' : 'him'} home safe!"`);

    const trailLength = Math.min(5, 2 + Math.floor(level / 2));
    const reward = 16 + trailLength * 3 + (kind === 'wildlife' ? 4 : 0) + (kind === 'litter' ? 10 : 0);

    return {
      id: `m${Date.now()}`,
      kind,
      animal,
      owner,
      story,
      traitIds,
      trueRegion: best,
      lure,
      trailLength,
      babyCount: kind === 'litter' ? 2 + Math.floor(r() * 2) : undefined,
      reward,
    };
  }

  // ---- flow: story → map → region --------------------------------------------------------------

  /** called by UI buttons */
  action(id: string) {
    this.audio.init();
    if (id === 'story') {
      if (!this.mission) this.mission = this.newMission();
      this.storyHeard = false;
      this.paused = true;
      this.emit({ kind: 'story', mission: this.mission });
    } else if (id === 'map') {
      this.openMap();
    } else if (id === 'inspect') {
      this.inspectNearest();
    } else if (id.startsWith('offer:')) {
      this.offer(id.slice(6));
    } else if (id === 'approach') {
      this.offer(null);
    } else if (id === 'pet') {
      this.doPet();
    } else if (id === 'carry') {
      this.doCarry();
    } else if (id === 'home') {
      this.completeMission();
    } else if (id === 'petResident') {
      this.petNearestResident();
    } else if (id === 'scoop') {
      this.scoopBaby();
    }
  }

  acceptMission() {
    this.storyHeard = true;
    this.paused = false;
    this.persist();
    this.emit({ kind: 'toast', msg: 'Walk to the map table to plan your search!', icon: '🗺️' });
  }

  openMap() {
    if (!this.mission || !this.storyHeard) return;
    // lookout tower rules out one wrong region
    if (this.save.upgrades.includes('tower') && !this.ruledOut) {
      const unlocked = REGIONS.filter(
        (rg) => rg.minLevel <= this.save.level && (!rg.needsGear || this.save.gear.includes(rg.needsGear)) && rg.id !== this.mission!.trueRegion
      );
      if (unlocked.length) this.ruledOut = unlocked[Math.floor(Math.random() * unlocked.length)].id;
    }
    this.paused = true;
    this.emit({ kind: 'map' });
  }

  /** UI confirms region + packed gear */
  travelTo(regionId: RegionId, pack: string[]) {
    if (!this.mission) return;
    this.pack = pack.slice(0, 2);
    this.region = regionId;
    this.place = regionId;
    this.paused = false;
    const m = getMap(regionId);
    this.player.x = m.entry.x;
    this.player.y = m.entry.y;
    this.player.target = null;
    this.painter.camX = this.player.x * TILE;
    this.painter.camY = this.player.y * TILE;
    this.wrongRegion = regionId !== this.mission.trueRegion;
    this.animalRevealed = false;
    this.approach = null;
    this.spookMeter = 0;
    this.petted = false;
    this.carrying = false;
    this.mamaFollows = false;
    this.babies = [];
    this.audio.setPlace(regionId);
    this.buildTrail(m);
    this.emit({ kind: 'hud' });
  }

  private buildTrail(m: RegionMap) {
    this.evidence = [];
    const mission = this.mission!;
    if (this.wrongRegion) {
      // one redirect clue near the entry
      const spot = this.spotNear(m, m.entry.x, m.entry.y, 4, 8);
      this.evidence.push({
        x: spot.x,
        y: spot.y,
        kind: 'redirect',
        hint: `Old tracks… ${mission.animal.name} WAS here, but they lead away — ${REGION_BY_ID[mission.trueRegion].edgeHint}! Check the map.`,
        found: false,
      });
      return;
    }
    // hiding spot: far from entry
    const far = m.hideSpots
      .map((s) => ({ s, d: Math.hypot(s.x - m.entry.x, s.y - m.entry.y) }))
      .sort((a, b) => b.d - a.d);
    const hideTop = far.slice(0, Math.max(6, Math.floor(far.length * 0.2)));
    const hide = hideTop[Math.floor(Math.random() * hideTop.length)].s;
    this.animalPos = { x: hide.x, y: hide.y };
    // evidence chain along the way
    const n = mission.trailLength;
    const kinds: EvidenceNode['kind'][] = ['prints', 'fur', 'chewed', 'scratch', 'nibbled', 'mud', 'feather'];
    const speciesKinds: Record<string, EvidenceNode['kind'][]> = {
      parrot: ['feather', 'nibbled', 'prints'],
      duck: ['feather', 'prints', 'mud'],
      owl: ['feather', 'prints', 'scratch'],
    };
    const useKinds = speciesKinds[mission.animal.species] ?? kinds;
    const traitEvidence = mission.traitIds.map((t) => TRAIT_BY_ID[t].evidence).filter(Boolean) as string[];
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      const bx = m.entry.x + (hide.x - m.entry.x) * f;
      const by = m.entry.y + (hide.y - m.entry.y) * f;
      const spot = this.spotNear(m, bx, by, 0, 4);
      const kind = useKinds[Math.floor(Math.random() * useKinds.length)];
      const isLast = i === n - 1;
      let hint: string;
      if (traitEvidence.length && i === Math.floor(n / 2)) {
        hint = traitEvidence[Math.floor(Math.random() * traitEvidence.length)];
      } else {
        const next = isLast ? this.animalPos : { x: m.entry.x + (hide.x - m.entry.x) * ((i + 2) / (n + 1)), y: m.entry.y + (hide.y - m.entry.y) * ((i + 2) / (n + 1)) };
        const dx = next.x - spot.x;
        const dy = next.y - spot.y;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east →' : 'west ←') : dy > 0 ? 'south ↓' : 'north ↑';
        const flavor: Record<string, string> = {
          prints: `Fresh little paw prints! They head ${dir}`,
          fur: `A tuft of soft fur caught on a twig. The trail goes ${dir}`,
          chewed: `Something was chewed on here — recently! Keep going ${dir}`,
          scratch: `Scratch marks… someone passed this way. Try ${dir}`,
          nibbled: `A half-nibbled snack, still fresh. Search ${dir}`,
          mud: `Squishy tracks in the soft ground, pointing ${dir}`,
          feather: `A little feather, still fluttering. It blew from ${dir}`,
          redirect: '',
        };
        hint = flavor[kind] ?? `The trail continues ${dir}`;
        if (isLast) hint = `${hint.split('!')[0]}! You're very close now… move slowly. 🤫`;
      }
      this.evidence.push({ x: spot.x, y: spot.y, kind, hint, found: false });
    }
  }

  private spotNear(m: RegionMap, x: number, y: number, minD: number, maxD: number): { x: number; y: number } {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const sx = x + Math.cos(a) * d;
      const sy = y + Math.sin(a) * d;
      if (sx > 2 && sy > 2 && sx < m.w - 2 && sy < m.h - 2 && walkable(m, sx, sy)) return { x: sx, y: sy };
    }
    return { x, y };
  }

  // ---- search & approach ---------------------------------------------------------------------

  private inspectNearest() {
    const ev = this.nearestEvidence();
    if (!ev) return;
    ev.found = true;
    this.audio.found();
    this.effects.push({ kind: 'sparkle', x: ev.x, y: ev.y, t0: this.simT, dur: 0.8 });
    this.emit({ kind: 'clue', text: ev.hint });
    if (ev.kind === 'redirect') {
      this.audio.wrongPlace();
    }
  }

  private nearestEvidence(): EvidenceNode | null {
    let best: EvidenceNode | null = null;
    let bd = 1.6;
    for (const ev of this.evidence) {
      if (ev.found) continue;
      // progressive: only the next unfound clue is inspectable… but allow any within reach
      const d = Math.hypot(ev.x - this.player.x, ev.y - this.player.y);
      if (d < bd) {
        bd = d;
        best = ev;
      }
    }
    return best;
  }

  private offer(gearId: string | null) {
    if (!this.approach || this.approach.stage !== 'near') return;
    const mission = this.mission!;
    if (gearId && mission.lure === gearId) {
      this.usedRightLure = true;
      this.approach.stage = 'calmed';
      this.audio.voice(SPECIES_BY_ID[mission.animal.species].voice, false);
      for (let i = 0; i < 4; i++)
        this.effects.push({ kind: 'heart', x: this.animalPos.x + (Math.random() - 0.5), y: this.animalPos.y - 0.4, t0: this.simT + i * 0.18, dur: 1.2 });
      this.emit({ kind: 'toast', msg: `${mission.animal.name} loves it! Now pet gently…`, icon: GEAR_BY_ID[gearId].icon });
    } else {
      this.approach.offerNeeded--;
      if (this.approach.offerNeeded <= 0) {
        this.approach.stage = 'calmed';
        this.emit({ kind: 'toast', msg: `${mission.animal.name} is starting to trust you…`, icon: '🤍' });
        for (let i = 0; i < 3; i++)
          this.effects.push({ kind: 'heart', x: this.animalPos.x, y: this.animalPos.y - 0.4, t0: this.simT + i * 0.2, dur: 1.1 });
      } else {
        // hops back a little — try again
        const m = getMap(this.place);
        const spot = this.spotNear(m, this.animalPos.x, this.animalPos.y, 2.5, 4);
        this.animalPos = spot;
        this.audio.voice(SPECIES_BY_ID[mission.animal.species].voice, false);
        this.emit({ kind: 'toast', msg: `Almost! ${mission.animal.name} hopped back a little. Stay gentle…`, icon: '🐾' });
      }
    }
    this.emit({ kind: 'hud' });
  }

  private doPet() {
    if (!this.approach || this.approach.stage !== 'calmed') return;
    this.petted = true;
    this.approach.stage = 'carrying';
    this.audio.pet();
    for (let i = 0; i < 6; i++)
      this.effects.push({
        kind: 'heart',
        x: this.animalPos.x + (Math.random() - 0.5) * 1.2,
        y: this.animalPos.y - 0.3,
        t0: this.simT + i * 0.15,
        dur: 1.4,
      });
    if (this.mission!.kind === 'litter') {
      // mama follows; babies hide nearby
      this.mamaFollows = true;
      const m = getMap(this.place);
      const count = this.mission!.babyCount ?? 2;
      this.babies = [];
      for (let i = 0; i < count; i++) {
        const s = this.spotNear(m, this.animalPos.x, this.animalPos.y, 2.5, 5.5);
        this.babies.push({ x: s.x, y: s.y, found: false });
      }
      this.emit({ kind: 'toast', msg: `${this.mission!.animal.name} trusts you! Now listen for the babies nearby…`, icon: '🍼' });
    } else {
      this.emit({ kind: 'toast', msg: 'So soft! Now carry them home 🧺', icon: '🤚' });
    }
    this.emit({ kind: 'hud' });
  }

  private doCarry() {
    if (!this.petted) return;
    if (this.mission!.kind === 'litter' && this.babies.some((b) => !b.found)) return;
    this.carrying = true;
    this.audio.pickup();
    this.emit({ kind: 'toast', msg: 'Tap “Travel home” when you\'re ready! 🏠', icon: '🧺' });
    this.emit({ kind: 'hud' });
  }

  private scoopBaby() {
    const b = this.babies.find((bb) => !bb.found && Math.hypot(bb.x - this.player.x, bb.y - this.player.y) < 1.6);
    if (!b) return;
    b.found = true;
    this.audio.voice(SPECIES_BY_ID[this.mission!.animal.species].voice, true);
    this.audio.pickup();
    for (let i = 0; i < 3; i++) this.effects.push({ kind: 'heart', x: b.x, y: b.y - 0.3, t0: this.simT + i * 0.15, dur: 1.1 });
    const left = this.babies.filter((bb) => !bb.found).length;
    this.emit({
      kind: 'toast',
      msg: left > 0 ? `Got one! ${left} more ${left === 1 ? 'baby' : 'babies'} to find…` : 'That\'s all of them! Carry the family home 🧺',
      icon: '🍼',
    });
    this.emit({ kind: 'hud' });
  }

  private petNearestResident() {
    const res = this.save.residents.find((r) => Math.hypot(r.x - this.player.x, r.y - this.player.y) < 1.8);
    if (!res) return;
    this.audio.pet();
    this.audio.voice(SPECIES_BY_ID[res.species].voice, res.baby);
    for (let i = 0; i < 4; i++)
      this.effects.push({ kind: 'heart', x: res.x + (Math.random() - 0.5), y: res.y - 0.4, t0: this.simT + i * 0.15, dur: 1.3 });
    if (this.save.upgrades.includes('playyard') && !this.pettedResidents.has(res.id)) {
      this.pettedResidents.add(res.id);
      this.save.coins += 1;
      this.audio.coin();
      this.effects.push({ kind: 'text', x: res.x, y: res.y - 1, t0: this.simT, dur: 1.4, text: '+1 🪙' });
      this.emit({ kind: 'hud' });
    }
  }

  // ---- completing a mission ----------------------------------------------------------------------

  private completeMission() {
    if (!this.mission || !this.carrying) return;
    const mission = this.mission;
    const prevLevel = this.save.level;

    let coins = mission.reward;
    if (this.approach && this.approach.spooks === 0) coins += 6;
    if (this.usedRightLure) coins += 4;
    this.save.coins += coins;
    this.save.rescues += 1;
    this.save.day += 1;
    this.save.level = levelForRescues(this.save.rescues);

    const outcome: 'reunited' | 'released' | 'adopted' =
      mission.kind === 'wildlife' ? 'released' : mission.kind === 'pet' ? 'reunited' : 'adopted';

    // pregnancy reveal for adopted strays (needs the medical bay)
    let pregnant = false;
    if (
      (mission.kind === 'stray') &&
      this.save.upgrades.includes('medbay') &&
      SPECIES_BY_ID[mission.animal.species].canBePregnant &&
      mission.animal.sex === 'f' &&
      Math.random() < 0.35
    ) {
      pregnant = true;
    }

    // adopted animals join the rescue center
    if (outcome === 'adopted') {
      this.addResident(mission.animal, pregnant ? 3 : undefined);
      if (mission.kind === 'litter') {
        for (let i = 0; i < (mission.babyCount ?? 2); i++) {
          const baby: AnimalCharacter = {
            id: `${mission.animal.id}b${i}`,
            name: ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)],
            species: mission.animal.species,
            sex: Math.random() < 0.5 ? 'f' : 'm',
            appearance: babyAppearance(Math.random, mission.animal),
            baby: true,
            motherId: mission.animal.id,
          };
          this.addResident(baby);
        }
      }
    }

    this.save.book.push({
      animal: mission.animal,
      owner: mission.owner,
      kind: mission.kind,
      day: this.save.day,
      outcome,
      babies: mission.babyCount,
    });

    // tick pregnancies along
    const births: Resident[] = [];
    for (const r of this.save.residents) {
      if (r.dueIn !== undefined && r.dueIn > 0) {
        r.dueIn -= 1;
        if (r.dueIn === 0) births.push(r);
      }
    }

    // back to HQ
    this.mission = null;
    this.storyHeard = false;
    this.region = null;
    this.evidence = [];
    this.approach = null;
    this.carrying = false;
    this.petted = false;
    this.mamaFollows = false;
    this.babies = [];
    this.ruledOut = null;
    this.usedRightLure = false;
    this.pettedResidents.clear();
    this.place = 'hq';
    const hq = getMap('hq');
    this.player.x = hq.entry.x;
    this.player.y = hq.entry.y;
    this.player.target = null;
    this.painter.camX = this.player.x * TILE;
    this.painter.camY = this.player.y * TILE;
    this.audio.setPlace('hq');
    this.audio.celebrate();
    this.paused = true;
    this.persist();

    const leveledTo = this.save.level > prevLevel ? this.save.level : null;
    if (leveledTo) this.audio.levelUp();
    this.emit({ kind: 'celebrate', mission, coins, outcome, pregnant, leveledTo });

    // any births? (UI shows after the celebration closes)
    for (const mom of births) {
      const litter = this.deliverBabies(mom);
      this.emit({ kind: 'birth', mom, babies: litter });
    }
    this.persist();
  }

  private addResident(ch: AnimalCharacter, dueIn?: number) {
    const hq = getMap('hq');
    const yard = hq.yard!;
    const res: Resident = {
      ...ch,
      pregnant: dueIn !== undefined,
      rescuedDay: this.save.day,
      x: yard.x + (Math.random() - 0.5) * yard.r,
      y: yard.y + (Math.random() - 0.5) * yard.r * 0.7,
      dir: Math.random() < 0.5 ? 1 : -1,
      nextMove: 0,
      dueIn,
    };
    this.save.residents.push(res);
  }

  private deliverBabies(mom: Resident): Resident[] {
    mom.pregnant = false;
    mom.dueIn = undefined;
    const n = 2 + Math.floor(Math.random() * 2);
    const out: Resident[] = [];
    for (let i = 0; i < n; i++) {
      const baby: AnimalCharacter = {
        id: `${mom.id}n${i}${Date.now() % 997}`,
        name: ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)],
        species: mom.species,
        sex: Math.random() < 0.5 ? 'f' : 'm',
        appearance: babyAppearance(Math.random, mom),
        baby: true,
        motherId: mom.id,
      };
      this.addResident(baby);
      out.push(this.save.residents[this.save.residents.length - 1]);
    }
    this.audio.lullaby();
    this.persist();
    return out;
  }

  // ---- shop ------------------------------------------------------------------------------------------

  buyGear(id: string): boolean {
    const g = GEAR_BY_ID[id];
    if (!g || this.save.gear.includes(id) || this.save.coins < g.cost) return false;
    this.save.coins -= g.cost;
    this.save.gear.push(id);
    this.audio.coin();
    this.persist();
    this.emit({ kind: 'hud' });
    return true;
  }

  buyUpgrade(id: string): boolean {
    const def = UPGRADE_BY_ID[id];
    if (!def || this.save.upgrades.includes(id) || this.save.coins < def.cost) return false;
    this.save.coins -= def.cost;
    this.save.upgrades.push(id);
    this.audio.celebrate();
    this.persist();
    this.emit({ kind: 'hud' });
    return true;
  }

  // ---- per-frame simulation ------------------------------------------------------------------------------

  private scatterResidents() {
    const hq = getMap('hq');
    const yard = hq.yard!;
    for (const r of this.save.residents) {
      if (r.x === undefined || Number.isNaN(r.x)) {
        r.x = yard.x + (Math.random() - 0.5) * yard.r;
        r.y = yard.y + (Math.random() - 0.5) * yard.r * 0.7;
      }
      r.nextMove = 0;
      r.dir = Math.random() < 0.5 ? 1 : -1;
    }
  }

  sightRadius(): number {
    return BASE_SIGHT + (this.save.gear.includes('binoculars') ? 1.4 : 0);
  }

  private tick(dt: number, now: number) {
    this.simT += dt;
    if (!this.paused) {
      this.movePlayer(dt, now);
      this.updateApproach(dt, now);
    }
    this.updateResidents(dt, now);
    this.effects = this.effects.filter((e) => this.simT - e.t0 < e.dur);
    this.audio.setPlace(this.place);
  }

  private movePlayer(dt: number, now: number) {
    const p = this.player;
    const m = getMap(this.place);
    let vx = 0;
    let vy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) vy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) vy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) vx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) vx += 1;
    if (vx || vy) {
      p.target = null;
      const mlen = Math.hypot(vx, vy);
      vx /= mlen;
      vy /= mlen;
    } else if (p.target) {
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) p.target = null;
      else {
        vx = dx / d;
        vy = dy / d;
      }
    }
    if (vx || vy) {
      // creep automatically near a wary animal
      const creeping = this.approach && !this.carrying && this.approach.stage !== 'carrying';
      const speed = creeping ? 1.9 : 3.6;
      const nx = p.x + vx * speed * dt;
      const ny = p.y + vy * speed * dt;
      if (walkable(m, nx, ny)) {
        p.x = nx;
        p.y = ny;
      } else if (walkable(m, nx, p.y)) {
        p.x = nx;
        p.target = null;
      } else if (walkable(m, p.x, ny)) {
        p.y = ny;
        p.target = null;
      } else p.target = null;
      p.moving = true;
      p.walkT += dt * 10;
      if (Math.abs(vx) > Math.abs(vy)) p.dir = vx > 0 ? 'right' : 'left';
      else p.dir = vy > 0 ? 'down' : 'up';
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = creeping ? 0.34 : 0.26;
        this.audio.step(!!creeping);
      }
      // spook check: moving while the animal is alert
      if (this.approach && this.approach.alert && !this.approach.tired && this.approach.stage === 'far') {
        const d = Math.hypot(this.animalPos.x - p.x, this.animalPos.y - p.y);
        if (d < 7.5) {
          this.spookMeter += dt * 1.15;
          if (this.spookMeter >= 1) this.spookAnimal();
        }
      }
    } else {
      p.moving = false;
    }
  }

  private spookAnimal() {
    if (!this.approach) return;
    this.spookMeter = 0;
    this.approach.spooks += 1;
    this.audio.spook();
    this.effects.push({ kind: 'poof', x: this.animalPos.x, y: this.animalPos.y, t0: this.simT, dur: 0.6 });
    const m = getMap(this.place);
    const spot = this.spotNear(m, this.animalPos.x, this.animalPos.y, 6, 11);
    this.animalPos = spot;
    this.animalRevealed = false;
    this.approach.stage = 'far';
    if (this.approach.spooks >= 3) {
      this.approach.tired = true;
      this.emit({ kind: 'toast', msg: `${this.mission!.animal.name} is getting sleepy… move in gently now.`, icon: '😴' });
    } else {
      this.emit({ kind: 'toast', msg: `Oh no — too fast! ${this.mission!.animal.name} scampered off. Follow quietly…`, icon: '💨' });
    }
    this.emit({ kind: 'hud' });
  }

  private updateApproach(dt: number, now: number) {
    if (!this.mission || this.place === 'hq' || this.wrongRegion || this.carrying) return;
    const p = this.player;
    const d = Math.hypot(this.animalPos.x - p.x, this.animalPos.y - p.y);

    // reveal when close (and all clues found makes the circle feel meaningful but isn't required)
    if (!this.animalRevealed && d < this.sightRadius() * 0.85) {
      this.animalRevealed = true;
      if (!this.approach) {
        this.approach = { stage: 'far', alert: false, alertT: this.simT + 1.6, spooks: 0, tired: false, offerNeeded: 2, babiesFound: 0 };
      } else {
        this.approach.stage = 'far';
      }
      this.audio.voice(SPECIES_BY_ID[this.mission.animal.species].voice, false);
      this.emit({ kind: 'toast', msg: `There! It's ${this.mission.animal.name}! Move slowly… freeze when ${this.mission.animal.sex === 'f' ? 'she' : 'he'} looks up!`, icon: '👀' });
      this.emit({ kind: 'hud' });
    }
    if (!this.approach || !this.animalRevealed) return;

    // alert cycle (red light / green light)
    const a = this.approach;
    if (!a.tired && (a.stage === 'far' || a.stage === 'near') && this.simT > a.alertT) {
      a.alert = !a.alert;
      a.alertT = this.simT + (a.alert ? 1.1 + Math.random() * 1.1 : 1.4 + Math.random() * 1.6);
      if (a.alert) this.audio.alertSting();
    }
    if (a.tired) a.alert = false;
    // decay spook meter while still
    if (!this.player.moving) this.spookMeter = Math.max(0, this.spookMeter - dt * 0.6);

    // stage transitions by distance
    if (a.stage === 'far' && d < 1.7) {
      a.stage = 'near';
      this.emit({ kind: 'hud' });
    } else if (a.stage === 'near' && d > 2.6) {
      a.stage = 'far';
      this.emit({ kind: 'hud' });
    }

    // mama follower trails the player
    if (this.mamaFollows && this.petted) {
      const fx = p.x - (p.dir === 'right' ? 1.2 : p.dir === 'left' ? -1.2 : 0);
      const fy = p.y - (p.dir === 'down' ? 1.2 : p.dir === 'up' ? -1.2 : 0.6);
      this.animalPos.x += (fx - this.animalPos.x) * Math.min(1, dt * 3);
      this.animalPos.y += (fy - this.animalPos.y) * Math.min(1, dt * 3);
    }

    // occasional little voice
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 6 + Math.random() * 8;
      if (this.animalRevealed && d < 9) this.audio.voice(SPECIES_BY_ID[this.mission.animal.species].voice, false);
      // baby mews to help find them
      if (this.babies.some((b) => !b.found)) {
        this.audio.voice(SPECIES_BY_ID[this.mission.animal.species].voice, true);
        for (const b of this.babies) {
          if (!b.found && Math.hypot(b.x - p.x, b.y - p.y) < this.sightRadius() + 2.5) {
            this.effects.push({ kind: 'note', x: b.x, y: b.y - 0.5, t0: this.simT, dur: 1.6 });
          }
        }
      }
    }
  }

  private updateResidents(dt: number, now: number) {
    if (this.place !== 'hq') return;
    const hq = getMap('hq');
    const yard = hq.yard!;
    for (const r of this.save.residents) {
      if (this.simT > r.nextMove) {
        r.nextMove = this.simT + 2 + Math.random() * 6;
        if (Math.random() < 0.7) {
          const tx = yard.x + (Math.random() - 0.5) * yard.r * 1.6;
          const ty = yard.y + (Math.random() - 0.5) * yard.r;
          if (walkable(hq, tx, ty)) {
            r.dir = tx > r.x ? 1 : -1;
            // store target on the resident via hearts field… use a simple lerp walk
            (r as Resident & { tx?: number; ty?: number }).tx = tx;
            (r as Resident & { tx?: number; ty?: number }).ty = ty;
          }
        }
      }
      const rr = r as Resident & { tx?: number; ty?: number };
      if (rr.tx !== undefined && rr.ty !== undefined) {
        const dx = rr.tx - r.x;
        const dy = rr.ty - r.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.2) {
          const sp = r.baby ? 0.8 : 1.1;
          r.x += (dx / d) * sp * dt;
          r.y += (dy / d) * sp * dt;
        } else {
          rr.tx = undefined;
          rr.ty = undefined;
        }
      }
    }
  }

  // ---- view for the painter -------------------------------------------------------------------------------

  private view(): ViewState {
    const critters: CritterView[] = [];
    const sightR = this.sightRadius();
    if (this.place === 'hq') {
      for (const r of this.save.residents) {
        const moving = (r as Resident & { tx?: number }).tx !== undefined;
        critters.push({
          char: r,
          x: r.x,
          y: r.y,
          dir: r.dir,
          pose: moving ? 'walk' : h2(Math.round(r.x * 10), Math.round(this.simT / 8), 3) < 0.25 ? 'sleep' : 'sit',
          revealed: true,
        });
      }
    } else if (this.mission && !this.wrongRegion && !this.carrying) {
      const d = Math.hypot(this.animalPos.x - this.player.x, this.animalPos.y - this.player.y);
      critters.push({
        char: this.mission.animal,
        x: this.animalPos.x,
        y: this.animalPos.y,
        dir: this.player.x < this.animalPos.x ? -1 : 1,
        pose: this.petted ? 'walk' : this.approach?.alert ? 'alert' : this.approach?.tired ? 'sleep' : 'idle',
        revealed: this.animalRevealed && d < sightR * 1.25,
      });
      for (const b of this.babies) {
        if (b.found) continue;
        const bd = Math.hypot(b.x - this.player.x, b.y - this.player.y);
        critters.push({
          char: { ...this.mission.animal, id: this.mission.animal.id + 'tmp', baby: true, appearance: this.mission.animal.appearance },
          x: b.x,
          y: b.y,
          dir: 1,
          pose: 'sit',
          revealed: bd < sightR * 0.8,
        });
      }
    }

    const hq = getMap('hq');
    return {
      place: this.place,
      player: this.player,
      who: this.slot,
      carrying: this.carrying && this.mission && this.mission.kind !== 'litter' ? this.mission.animal : null,
      carryingBabies: this.carrying && this.mission?.kind === 'litter' ? (this.mission.babyCount ?? 0) : 0,
      critters,
      npc:
        this.place === 'hq'
          ? {
              x: hq.gate!.x,
              y: hq.gate!.y,
              kind: this.mission?.kind === 'wildlife' ? 'ranger' : 'owner',
              hasBubble: !this.mission || !this.storyHeard,
            }
          : null,
      evidence: this.place === 'hq' ? [] : this.evidence,
      effects: this.effects,
      simT: this.simT,
      sightR: this.place === 'hq' ? 9.5 : sightR,
      fogged: this.place === 'marsh',
      upgrades: this.save.upgrades,
      glowTable: this.place === 'hq' && !!this.mission && this.storyHeard,
    };
  }

  // ---- snapshot for the React HUD ------------------------------------------------------------------------------

  buttons(): ActionButton[] {
    const out: ActionButton[] = [];
    const p = this.player;
    if (this.place === 'hq') {
      const hq = getMap('hq');
      if (Math.hypot(hq.gate!.x - p.x, hq.gate!.y - p.y) < 2.4 && (!this.mission || !this.storyHeard)) {
        out.push({ id: 'story', label: 'Hear their story', icon: '💬', primary: true });
      }
      if (this.mission && this.storyHeard && Math.hypot(hq.table!.x - p.x, hq.table!.y - p.y) < 2.4) {
        out.push({ id: 'map', label: 'Plan the search', icon: '🗺️', primary: true });
      }
      if (this.save.residents.some((r) => Math.hypot(r.x - p.x, r.y - p.y) < 1.8)) {
        out.push({ id: 'petResident', label: 'Pet', icon: '🤚' });
      }
    } else {
      if (this.nearestEvidence()) out.push({ id: 'inspect', label: 'Look closer', icon: '🔍', primary: true });
      if (this.approach?.stage === 'near' && !this.petted) {
        const lures = this.pack.filter((g) => GEAR_BY_ID[g]?.kind === 'lure');
        for (const l of lures) out.push({ id: `offer:${l}`, label: `Offer ${GEAR_BY_ID[l].name.split(' ')[1] ?? GEAR_BY_ID[l].name}`, icon: GEAR_BY_ID[l].icon, primary: true });
        out.push({ id: 'approach', label: 'Reach out slowly', icon: '🤲', primary: lures.length === 0 });
      }
      if (this.approach?.stage === 'calmed' && !this.petted) out.push({ id: 'pet', label: 'Pet gently', icon: '🤚', primary: true });
      if (this.petted && !this.carrying) {
        if (this.mission?.kind === 'litter' && this.babies.some((b) => !b.found)) {
          if (this.babies.some((b) => !b.found && Math.hypot(b.x - p.x, b.y - p.y) < 1.6))
            out.push({ id: 'scoop', label: 'Scoop up baby', icon: '🍼', primary: true });
        } else {
          out.push({ id: 'carry', label: 'Pick up', icon: '🧺', primary: true });
        }
      }
      if (this.carrying) out.push({ id: 'home', label: 'Travel home', icon: '🏠', primary: true });
    }
    return out;
  }

  hint(): string {
    if (this.place === 'hq') {
      if (!this.mission || !this.storyHeard) return 'Someone is waiting at the gate…';
      return 'Plan your search at the map table!';
    }
    if (this.wrongRegion) {
      const found = this.evidence.some((e) => e.found);
      return found ? 'Open the map and try the right place!' : 'Hmm… look around for any sign of them.';
    }
    if (this.carrying) return 'Travel home for the celebration! 🏠';
    if (this.petted && this.mission?.kind === 'litter') {
      const left = this.babies.filter((b) => !b.found).length;
      return left ? `Listen for tiny mews… ${left} ${left === 1 ? 'baby is' : 'babies are'} hiding nearby!` : 'You have everyone — head home!';
    }
    if (this.approach?.stage === 'near') return 'So close! Offer something they love…';
    if (this.animalRevealed) return this.approach?.alert ? 'FREEZE! They\'re looking…' : 'Creep closer… slowly, slowly…';
    const next = this.evidence.find((e) => !e.found);
    if (next) return 'Follow the clues. Look for the glowing signs!';
    return 'They must be hiding very close now…';
  }

  /** can the map button be shown in regions (travel between places freely) */
  canOpenMapAnywhere(): boolean {
    return !!this.mission && this.storyHeard && !this.carrying && this.place !== 'hq';
  }
}
