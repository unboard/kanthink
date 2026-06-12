// Wildwood — game simulation.
// Bird ecology & behavior, binocular identification, song quizzes, fishing,
// nest lifecycle, building, and persistence.

import {
  BIRDS,
  BIRD_BY_ID,
  FISH,
  FISH_BY_ID,
  STRUCTURE_BY_ID,
  SEEDS,
  type BirdSpecies,
} from './species';
import {
  generateWorld,
  tileAt,
  isWalkable,
  habitatAt,
  waterKindAt,
  nearestTree,
  isWater,
  T,
  MAP,
} from './world';
import { Renderer, nightness } from './render';
import { WildwoodAudio } from './audio';
import type {
  GameState,
  BirdEntity,
  Nest,
  QuizState,
  StructureInstance,
  FishingState,
} from './types';

const DAY_LEN = 600; // real seconds per in-game day
const SAVE_KEY = 'wildwood-save-v1';

export type GameEvent =
  | { kind: 'discover'; speciesId: string; isNew: boolean; how: 'seen' | 'heard' }
  | { kind: 'quiz'; quiz: QuizState }
  | { kind: 'catch'; fishId: string; len: number; isNew: boolean; isRecord: boolean }
  | { kind: 'nest'; nest: Nest }
  | { kind: 'toast'; msg: string; icon?: string }
  | { kind: 'fledge'; speciesId: string }
  | { kind: 'hud' };

export class Game {
  s: GameState;
  renderer: Renderer;
  audio: WildwoodAudio;
  private listeners: ((e: GameEvent) => void)[] = [];
  private keys = new Set<string>();
  private uidCounter = 1;
  private lastTick = 0;
  private spawnTimer = 0;
  private ambTimer = 0;
  private saveTimer = 0;
  private raf = 0;
  private holdReel = false;
  private pinchDist: number | null = null;
  private lastDawnDay = -1;
  private destroyed = false;
  paused = false; // true while a modal is up — world keeps rendering, input ignored

  constructor(canvas: HTMLCanvasElement) {
    const world = generateWorld();
    const saved = this.loadSave();
    this.s = {
      world,
      cam: { x: world.spawn.x, y: world.spawn.y, zoom: 1.3 },
      player: { x: world.spawn.x, y: world.spawn.y, facing: 1, moving: false, walkPhase: 0, moveTarget: null },
      birds: [],
      structures: saved?.structures ?? [],
      nests: saved?.nests ?? [],
      effects: [],
      songMarkers: [],
      time: { day: saved?.day ?? 1, t: saved?.timeT ?? 0.22 },
      simT: 0,
      seeds: saved?.seeds ?? SEEDS.starting,
      journal: saved?.journal ?? {},
      fishRecords: saved?.fishRecords ?? {},
      nestsFound: saved?.nestsFound ?? 0,
      nestsFledged: saved?.nestsFledged ?? 0,
      mode: 'explore',
      bino: { active: false, x: 0, y: 0, targetUid: null, progress: 0 },
      fishing: null,
      buildSelection: null,
      buildPreview: null,
      hintFish: false,
      muted: saved?.muted ?? false,
    };
    if (saved?.player) {
      this.s.player.x = saved.player.x;
      this.s.player.y = saved.player.y;
      this.s.cam.x = saved.player.x;
      this.s.cam.y = saved.player.y;
    }
    this.renderer = new Renderer(canvas, world);
    this.renderer.resize();
    this.audio = new WildwoodAudio();
    this.audio.muted = this.s.muted;
    this.bindInput(canvas);
    this.lastTick = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, (now - this.lastTick) / 1000);
      this.lastTick = now;
      this.tick(dt, now / 1000);
      this.renderer.draw(this.s, now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.save();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }
  private emit(e: GameEvent) {
    for (const fn of this.listeners) fn(e);
  }

  // ---- persistence -------------------------------------------------------------

  private loadSave(): {
    seeds: number;
    journal: GameState['journal'];
    fishRecords: GameState['fishRecords'];
    structures: StructureInstance[];
    nests: Nest[];
    day: number;
    timeT: number;
    player: { x: number; y: number };
    nestsFound: number;
    nestsFledged: number;
    muted: boolean;
  } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save() {
    try {
      const s = this.s;
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          seeds: s.seeds,
          journal: s.journal,
          fishRecords: s.fishRecords,
          structures: s.structures,
          nests: s.nests,
          day: s.time.day,
          timeT: s.time.t,
          player: { x: s.player.x, y: s.player.y },
          nestsFound: s.nestsFound,
          nestsFledged: s.nestsFledged,
          muted: s.muted,
        })
      );
    } catch {
      // storage full/blocked — play on without saving
    }
  }

  // ---- input ---------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
    if (k === 'b') this.toggleBinoculars();
    if (k === 'f') this.actionFish();
    if (k === 'escape') this.cancelMode();
    if (k === ' ') {
      if (this.s.fishing?.phase === 'strike') this.hookSet();
      else if (this.s.fishing?.phase === 'reel') this.holdReel = true;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    if (e.key === ' ') this.holdReel = false;
  };
  private onResize = () => this.renderer.resize();

  private bindInput(cv: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);

    cv.addEventListener('pointermove', (e) => {
      const rect = cv.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      this.s.bino.x = px;
      this.s.bino.y = py;
      if (this.s.mode === 'build' && this.s.buildSelection) {
        const w = this.renderer.screenToWorld(this.s, px, py);
        this.s.buildPreview = { x: w.x, y: w.y, ok: this.canPlace(w.x, w.y) };
      }
    });

    cv.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      this.audio.init();
      const rect = cv.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.s.fishing) {
        if (this.s.fishing.phase === 'strike') this.hookSet();
        else if (this.s.fishing.phase === 'reel') this.holdReel = true;
        else if (this.s.fishing.phase === 'wait' || this.s.fishing.phase === 'nibble') {
          // reel in early / recast
          this.endFishing();
        }
        return;
      }
      if (this.s.mode === 'build' && this.s.buildSelection) {
        const w = this.renderer.screenToWorld(this.s, px, py);
        this.placeStructure(w.x, w.y);
        return;
      }
      if (this.s.mode === 'bino') return; // aiming handled by pointermove

      // clicked a song marker?
      for (const m of this.s.songMarkers) {
        if (m.identified) continue;
        const mx = this.renderer.sx(this.s, m.x, m.y);
        const my = this.renderer.sy(this.s, m.x, m.y) - 26 * this.s.cam.zoom;
        if (Math.hypot(px - mx, py - my) < 22) {
          this.openQuiz(m.uid, m.species);
          return;
        }
      }
      // walk there
      const w = this.renderer.screenToWorld(this.s, px, py);
      if (isWalkable(this.s.world, w.x, w.y)) {
        this.s.player.moveTarget = { x: w.x, y: w.y };
      }
    });

    cv.addEventListener('pointerup', () => (this.holdReel = false));
    cv.addEventListener('pointercancel', () => (this.holdReel = false));

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const z = this.s.cam.zoom * (e.deltaY > 0 ? 0.92 : 1.09);
        this.s.cam.zoom = Math.max(0.75, Math.min(2.1, z));
      },
      { passive: false }
    );

    // pinch zoom
    const pointers = new Map<number, { x: number; y: number }>();
    cv.addEventListener('pointerdown', (e) => pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }));
    cv.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist !== null) {
          const z = this.s.cam.zoom * (d / this.pinchDist);
          this.s.cam.zoom = Math.max(0.75, Math.min(2.1, z));
        }
        this.pinchDist = d;
      }
    });
    const clearPinch = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) this.pinchDist = null;
    };
    cv.addEventListener('pointerup', clearPinch);
    cv.addEventListener('pointercancel', clearPinch);
  }

  // ---- public actions (also used by mobile buttons / React UI) ---------------------

  toggleBinoculars() {
    if (this.s.fishing) return;
    if (this.s.mode === 'bino') {
      this.s.mode = 'explore';
      this.s.bino.targetUid = null;
      this.s.bino.progress = 0;
    } else {
      this.s.mode = 'bino';
      this.s.player.moveTarget = null;
      this.audio.uiOpen();
    }
    this.emit({ kind: 'hud' });
  }

  cancelMode() {
    if (this.s.fishing) this.endFishing();
    this.s.mode = 'explore';
    this.s.buildSelection = null;
    this.s.buildPreview = null;
    this.s.bino.targetUid = null;
    this.s.bino.progress = 0;
    this.emit({ kind: 'hud' });
  }

  setMuted(m: boolean) {
    this.s.muted = m;
    this.audio.setMuted(m);
    this.save();
  }

  enterBuildMode(typeId: string) {
    this.s.mode = 'build';
    this.s.buildSelection = typeId;
    this.s.buildPreview = null;
    this.emit({ kind: 'hud' });
  }

  /** Is the player close enough to water to fish? */
  nearWater(): { x: number; y: number } | null {
    const p = this.s.player;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = Math.floor(p.x) + dx;
        const ty = Math.floor(p.y) + dy;
        if (isWater(tileAt(this.s.world, tx + 0.5, ty + 0.5)) && Math.hypot(dx, dy) <= 2.4) {
          return { x: tx + 0.5, y: ty + 0.5 };
        }
      }
    }
    return null;
  }

  actionFish() {
    if (this.s.fishing) {
      this.endFishing();
      return;
    }
    const spot = this.nearWater();
    if (!spot) {
      this.emit({ kind: 'toast', msg: 'Walk to the water\'s edge to fish', icon: '🎣' });
      return;
    }
    // cast a bit beyond the nearest water tile, away from shore
    const p = this.s.player;
    const dx = spot.x - p.x;
    const dy = spot.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    let bx = spot.x + (dx / d) * 2.2;
    let by = spot.y + (dy / d) * 2.2;
    if (!isWater(tileAt(this.s.world, bx, by))) {
      bx = spot.x;
      by = spot.y;
    }
    p.facing = dx >= 0 ? 1 : -1;
    p.moveTarget = null;
    this.s.mode = 'fishing';
    this.s.fishing = {
      phase: 'cast',
      bobX: bx,
      bobY: by,
      castT: 0,
      nextEvent: 0.55,
      tension: 0.4,
      progress: 0,
      pull: 0,
      pullPhase: 0,
      reeling: false,
    };
    this.audio.cast();
    this.emit({ kind: 'hud' });
  }

  endFishing() {
    this.s.fishing = null;
    this.s.mode = 'explore';
    this.holdReel = false;
    this.emit({ kind: 'hud' });
  }

  setReeling(r: boolean) {
    this.holdReel = r;
  }

  strikeNow() {
    if (this.s.fishing?.phase === 'strike') this.hookSet();
  }

  playPreview(speciesId: string) {
    this.audio.init();
    const sp = BIRD_BY_ID[speciesId];
    if (sp) this.audio.playSong(sp.song, 0, 0.9);
  }

  // ---- quiz -------------------------------------------------------------------------

  private openQuiz(birdUid: number, speciesId: string) {
    const correct = BIRD_BY_ID[speciesId];
    const pool = BIRDS.filter((b) => b.id !== speciesId);
    // prefer plausible confusions: same broad habitat
    pool.sort(
      (a, b) =>
        (b.habitats.some((h) => correct.habitats.includes(h)) ? 1 : 0) -
          (a.habitats.some((h) => correct.habitats.includes(h)) ? 1 : 0) || Math.random() - 0.5
    );
    const options = [speciesId, pool[0].id, pool[1].id].sort(() => Math.random() - 0.5);
    const quiz: QuizState = { speciesId, options, birdUid };
    this.paused = true;
    this.audio.playSong(correct.song, 0, 0.85);
    this.emit({ kind: 'quiz', quiz });
  }

  replayQuizSong(quiz: QuizState) {
    this.audio.playSong(BIRD_BY_ID[quiz.speciesId].song, 0, 0.85);
  }

  answerQuiz(quiz: QuizState, choice: string): boolean {
    // stays paused until the quiz modal closes (UI calls setPaused(false))
    const correct = choice === quiz.speciesId;
    const bird = this.s.birds.find((b) => b.uid === quiz.birdUid);
    if (correct) {
      this.recordSpecies(quiz.speciesId, 'heard');
      this.addSeeds(SEEDS.quizCorrect, bird?.x ?? this.s.player.x, bird?.y ?? this.s.player.y);
      this.audio.discover();
    } else {
      this.audio.wrong();
      // the singer goes quiet for a while
      if (bird) bird.nextSong = this.s.simT + 70;
      this.s.songMarkers = this.s.songMarkers.filter((m) => m.uid !== quiz.birdUid);
    }
    return correct;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  // ---- journal & rewards --------------------------------------------------------------

  private recordSpecies(id: string, how: 'seen' | 'heard') {
    const j = this.s.journal;
    const entry = j[id] ?? { seen: false, heard: false, count: 0, firstDay: this.s.time.day };
    const isNew = how === 'seen' ? !entry.seen : !entry.heard;
    if (how === 'seen') {
      entry.seen = true;
      entry.count++;
    } else entry.heard = true;
    j[id] = entry;
    this.save();
    this.emit({ kind: 'discover', speciesId: id, isNew, how });
    return isNew;
  }

  private addSeeds(n: number, x?: number, y?: number) {
    this.s.seeds += n;
    if (x !== undefined && y !== undefined) {
      this.s.effects.push({ kind: 'text', x, y, z: 30, t0: this.s.simT, dur: 1.6, text: `+${n} seeds`, color: '#ffe9a8' });
    }
    this.audio.seeds();
    this.emit({ kind: 'hud' });
  }

  // ---- building --------------------------------------------------------------------------

  canPlace(x: number, y: number): boolean {
    const w = this.s.world;
    const d = Math.hypot(x - w.cabin.x, y - w.cabin.y);
    if (d > 14 || d < 1.6) return false;
    if (!isWalkable(w, x, y)) return false;
    const t = tileAt(w, x, y);
    if (t === T.MARSH) return false;
    for (const st of this.s.structures) {
      if (Math.hypot(st.x - x, st.y - y) < 1.6) return false;
    }
    if (nearestTree(w, x, y, 1.2)) return false;
    return true;
  }

  placeStructure(x: number, y: number) {
    const typeId = this.s.buildSelection;
    if (!typeId) return;
    const type = STRUCTURE_BY_ID[typeId];
    if (!this.canPlace(x, y)) {
      this.emit({ kind: 'toast', msg: 'Place it on open ground near the cabin', icon: '📍' });
      return;
    }
    if (this.s.seeds < type.cost) {
      this.emit({ kind: 'toast', msg: 'Not enough seeds yet', icon: '🌰' });
      return;
    }
    this.s.seeds -= type.cost;
    this.s.structures.push({ id: `st${Date.now()}`, type: typeId, x, y, placedDay: this.s.time.day });
    this.audio.buildThunk();
    this.s.effects.push({ kind: 'sparkle', x, y, z: 20, t0: this.s.simT, dur: 0.8 });
    this.s.mode = 'explore';
    this.s.buildSelection = null;
    this.s.buildPreview = null;
    this.save();
    this.emit({ kind: 'toast', msg: `${type.name} placed — keep an eye on it`, icon: type.icon });
    this.emit({ kind: 'hud' });
  }

  // ---- main tick -----------------------------------------------------------------------------

  private tick(dt: number, now: number) {
    const s = this.s;
    s.simT += dt;

    // time of day
    s.time.t += dt / DAY_LEN;
    if (s.time.t >= 1) {
      s.time.t -= 1;
      s.time.day++;
      this.emit({ kind: 'toast', msg: `Day ${s.time.day} in the valley`, icon: '🌄' });
    }
    // dawn: nest checks once per day
    if (s.time.t > 0.24 && this.lastDawnDay !== s.time.day) {
      this.lastDawnDay = s.time.day;
      this.dawnUpdate();
    }

    if (!this.paused) {
      this.updatePlayer(dt);
      this.updateFishing(dt);
      this.updateBino(dt);
    }
    this.updateBirds(dt, now);

    // camera follows player
    s.cam.x += (s.player.x - s.cam.x) * Math.min(1, dt * 3.5);
    s.cam.y += (s.player.y - s.cam.y) * Math.min(1, dt * 3.5);

    // spawner
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.trySpawnBird();
    }

    // ambience + housekeeping
    this.ambTimer -= dt;
    if (this.ambTimer <= 0) {
      this.ambTimer = 0.6;
      const spot = this.nearWater();
      this.s.hintFish = !!spot && !s.fishing;
      let prox = 0;
      if (spot) prox = 1;
      else {
        // coarser check for distant water sound
        for (let r = 3; r <= 7 && !prox; r += 2) {
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            if (isWater(tileAt(s.world, s.player.x + Math.cos(ang) * r, s.player.y + Math.sin(ang) * r))) {
              prox = 1 - r / 9;
              break;
            }
          }
        }
      }
      this.audio.setWaterProximity(prox);
      this.audio.setNight(nightness(s.time.t));
    }

    // expire effects & markers
    s.effects = s.effects.filter((e) => s.simT - e.t0 < e.dur);
    s.songMarkers = s.songMarkers.filter((m) => m.until > s.simT);

    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      this.save();
    }
  }

  // ---- player ------------------------------------------------------------------------

  private updatePlayer(dt: number) {
    const s = this.s;
    const p = s.player;
    if (s.fishing || s.mode === 'bino') {
      p.moving = false;
      return;
    }
    let vx = 0;
    let vy = 0;
    // keyboard: screen-relative movement (up = up on screen)
    const up = this.keys.has('w') || this.keys.has('arrowup');
    const down = this.keys.has('s') || this.keys.has('arrowdown');
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    if (up) {
      vx -= 1;
      vy -= 1;
    }
    if (down) {
      vx += 1;
      vy += 1;
    }
    if (left) {
      vx -= 1;
      vy += 1;
    }
    if (right) {
      vx += 1;
      vy -= 1;
    }
    if (vx || vy) {
      p.moveTarget = null;
      const m = Math.hypot(vx, vy);
      vx /= m;
      vy /= m;
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x;
      const dy = p.moveTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) {
        p.moveTarget = null;
      } else {
        vx = dx / d;
        vy = dy / d;
      }
    }
    const SPEED = 4.2;
    if (vx || vy) {
      const nx = p.x + vx * SPEED * dt;
      const ny = p.y + vy * SPEED * dt;
      // slide along water edges
      if (isWalkable(s.world, nx, ny)) {
        p.x = nx;
        p.y = ny;
      } else if (isWalkable(s.world, nx, p.y)) {
        p.x = nx;
        p.moveTarget = null;
      } else if (isWalkable(s.world, p.x, ny)) {
        p.y = ny;
        p.moveTarget = null;
      } else {
        p.moveTarget = null;
      }
      p.x = Math.max(1, Math.min(MAP - 1, p.x));
      p.y = Math.max(1, Math.min(MAP - 1, p.y));
      p.moving = true;
      p.walkPhase += dt * 11;
      const sx = vx - vy; // screen-space horizontal
      if (Math.abs(sx) > 0.1) p.facing = sx > 0 ? 1 : -1;
    } else {
      p.moving = false;
    }
  }

  // ---- binoculars ------------------------------------------------------------------------

  private updateBino(dt: number) {
    const s = this.s;
    if (s.mode !== 'bino') return;
    const R = Math.min(this.renderer.W, this.renderer.H) * 0.3;
    // find candidate: bird near lens center, reasonably close to the player
    let best: BirdEntity | null = null;
    let bestD = R * 0.75;
    for (const b of s.birds) {
      if (Math.hypot(b.x - s.player.x, b.y - s.player.y) > 16) continue;
      const bx = this.renderer.sx(s, b.x, b.y);
      const by = this.renderer.sy(s, b.x, b.y) - b.z * s.cam.zoom;
      const d = Math.hypot(bx - s.bino.x, by - s.bino.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    // nests can be focused too
    if (!best) {
      for (const n of s.nests) {
        if (n.discovered || n.done) continue;
        if (Math.hypot(n.x - s.player.x, n.y - s.player.y) > 14) continue;
        const nx = this.renderer.sx(s, n.x, n.y);
        const ny = this.renderer.sy(s, n.x, n.y) - 52 * s.cam.zoom;
        if (Math.hypot(nx - s.bino.x, ny - s.bino.y) < R * 0.5) {
          s.bino.targetUid = -2;
          s.bino.progress += dt / 1.6;
          if (s.bino.progress >= 1) {
            s.bino.progress = 0;
            this.discoverNest(n);
          }
          return;
        }
      }
    }
    if (best) {
      if (s.bino.targetUid !== best.uid) {
        s.bino.targetUid = best.uid;
        s.bino.progress = 0;
      }
      s.bino.progress += dt / 1.7;
      if (s.bino.progress >= 1) {
        s.bino.progress = 0;
        s.bino.targetUid = null;
        this.identifyBird(best);
      }
    } else {
      s.bino.targetUid = null;
      s.bino.progress = Math.max(0, s.bino.progress - dt * 1.5);
    }
  }

  private identifyBird(b: BirdEntity) {
    const entry = this.s.journal[b.species];
    const isNew = !entry?.seen;
    this.recordSpecies(b.species, 'seen');
    this.s.effects.push({ kind: 'sparkle', x: b.x, y: b.y, z: b.z + 14, t0: this.s.simT, dur: 0.9 });
    if (isNew) {
      this.audio.discover();
      this.addSeeds(SEEDS.newSpeciesSeen, b.x, b.y);
      this.paused = true; // species card modal opens
    } else {
      this.addSeeds(SEEDS.repeatSighting, b.x, b.y);
      const sp = BIRD_BY_ID[b.species];
      this.emit({ kind: 'toast', msg: `${sp.name} — noted`, icon: '🔭' });
    }
  }

  private discoverNest(n: Nest) {
    n.discovered = true;
    this.s.nestsFound++;
    this.s.effects.push({ kind: 'sparkle', x: n.x, y: n.y, z: 52, t0: this.s.simT, dur: 1.2 });
    this.audio.discover();
    this.addSeeds(SEEDS.nestFound, n.x, n.y);
    this.paused = true;
    this.emit({ kind: 'nest', nest: n });
    this.save();
  }

  // ---- birds --------------------------------------------------------------------------------

  private timeMatches(sp: BirdSpecies): boolean {
    const t = this.s.time.t;
    switch (sp.time) {
      case 'all':
        return t > 0.18 && t < 0.92; // most birds sleep in deep night
      case 'day':
        return t > 0.25 && t < 0.8;
      case 'dawnDusk':
        return (t > 0.18 && t < 0.38) || (t > 0.7 && t < 0.9);
      case 'night':
        return t > 0.82 || t < 0.2;
    }
  }

  private trySpawnBird() {
    const s = this.s;
    const nearby = s.birds.filter((b) => Math.hypot(b.x - s.player.x, b.y - s.player.y) < 30);
    const target = 13;
    if (nearby.length >= target) return;

    // feeders are magnets: 35% of spawns try a feeder visit
    if (Math.random() < 0.35 && s.structures.length) {
      const st = s.structures[Math.floor(Math.random() * s.structures.length)];
      const type = STRUCTURE_BY_ID[st.type];
      if (type && type.attracts.length && Math.hypot(st.x - s.player.x, st.y - s.player.y) < 34) {
        const candidates = type.attracts
          .map((id) => BIRD_BY_ID[id])
          .filter((sp) => this.timeMatches(sp));
        if (candidates.length) {
          const sp = candidates[Math.floor(Math.random() * candidates.length)];
          const already = s.birds.filter((b) => Math.hypot(b.x - st.x, b.y - st.y) < 3).length;
          if (already < 2) {
            this.spawnBird(sp, st.x + (Math.random() - 0.5) * 1.4, st.y + (Math.random() - 0.5) * 1.4, true);
            return;
          }
        }
      }
    }

    // habitat spawn around the player
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 16;
      const x = s.player.x + Math.cos(ang) * r;
      const y = s.player.y + Math.sin(ang) * r;
      if (x < 2 || y < 2 || x > MAP - 2 || y > MAP - 2) continue;
      const hab = habitatAt(s.world, x, y);
      const candidates: { sp: BirdSpecies; w: number }[] = [];
      for (const sp of BIRDS) {
        if (!this.timeMatches(sp)) continue;
        if (!sp.habitats.includes(hab) && !(hab === 'meadow' && sp.habitats.includes('sky'))) continue;
        const w = sp.rarity === 1 ? 10 : sp.rarity === 2 ? 3.2 : 0.9;
        candidates.push({ sp, w });
      }
      if (!candidates.length) continue;
      // cap duplicates of a species
      const total = candidates.reduce((a, c) => a + c.w, 0);
      let roll = Math.random() * total;
      let chosen = candidates[0].sp;
      for (const c of candidates) {
        roll -= c.w;
        if (roll <= 0) {
          chosen = c.sp;
          break;
        }
      }
      if (s.birds.filter((b) => b.species === chosen.id).length >= 2) continue;
      const water = chosen.look.shape === 'duck' || chosen.look.shape === 'loon';
      if (water && !isWater(tileAt(s.world, x, y))) continue;
      if (!water && chosen.look.shape !== 'heron' && isWater(tileAt(s.world, x, y))) continue;
      this.spawnBird(chosen, x, y, false);
      return;
    }
  }

  private spawnBird(sp: BirdSpecies, x: number, y: number, toFeeder: boolean) {
    const s = this.s;
    const soarer = sp.look.shape === 'raptor';
    // decide the landing spot/height once, up front
    let landZ = 0;
    let lx = x;
    let ly = y;
    if (sp.look.shape === 'woodpecker') {
      const tr = nearestTree(s.world, x, y, 5);
      if (tr) {
        lx = tr.x + 0.18;
        ly = tr.y + 0.18;
        landZ = 22 + Math.random() * 18;
      }
    } else if (sp.look.shape === 'hummingbird') {
      landZ = 6 + Math.random() * 8;
    } else if (!toFeeder && sp.look.shape !== 'duck' && sp.look.shape !== 'loon' && sp.look.shape !== 'heron' && sp.look.shape !== 'dove') {
      const tr = nearestTree(s.world, x, y, 1.5);
      if (tr && Math.random() < 0.35) landZ = 40 + Math.random() * 25;
    }
    const b: BirdEntity = {
      uid: this.uidCounter++,
      species: sp.id,
      x: x + (Math.random() - 0.5) * 24,
      y: y - 14 - Math.random() * 8,
      z: soarer ? 95 : 70,
      zTarget: soarer ? 95 : landZ,
      state: soarer ? 'soar' : 'fly',
      facing: 1,
      vx: 0,
      vy: 0,
      targetX: lx,
      targetY: ly,
      anchorX: lx,
      anchorY: ly,
      landZ,
      nextAction: s.simT + 1,
      nextSong: s.simT + 2 + Math.random() * 8,
      singingUntil: 0,
      wingPhase: Math.random() * 10,
      despawnAt: s.simT + 70 + Math.random() * 130,
      onWater: sp.look.shape === 'duck' || sp.look.shape === 'loon',
      pecking: toFeeder ? 1 : 0,
    };
    s.birds.push(b);
  }

  private updateBirds(dt: number, now: number) {
    const s = this.s;
    const chorus = s.time.t > 0.2 && s.time.t < 0.33;
    for (const b of s.birds) {
      const sp = BIRD_BY_ID[b.species];
      const look = sp.look;
      b.wingPhase += dt * (look.shape === 'hummingbird' ? 50 : look.size > 1.6 ? 7 : 14);

      const distP = Math.hypot(b.x - s.player.x, b.y - s.player.y);

      // flush if the player gets too close (rushing scares them more)
      if (b.state !== 'flee' && b.state !== 'fly' && look.shape !== 'raptor') {
        const flushD = (s.player.moving ? 3.4 : 2.0) + look.size * 0.4;
        if (distP < flushD) {
          b.state = 'flee';
          b.zTarget = 80;
          b.targetX = b.x + (b.x - s.player.x) * 6 + (Math.random() - 0.5) * 8;
          b.targetY = b.y + (b.y - s.player.y) * 6 + (Math.random() - 0.5) * 8;
          b.despawnAt = Math.min(b.despawnAt, s.simT + 6);
          if (distP < 12) this.audio.flushWings();
          this.s.effects.push({ kind: 'poof', x: b.x, y: b.y, z: b.z, t0: s.simT, dur: 0.5 });
          if (s.bino.targetUid === b.uid) {
            s.bino.targetUid = null;
            s.bino.progress = 0;
          }
        }
      }

      // leave when their hour ends or timer expires
      if (!b.leaving && (s.simT > b.despawnAt || !this.timeMatches(sp))) {
        b.leaving = true;
        b.state = b.state === 'soar' ? 'soar' : 'fly';
        b.zTarget = 85;
        b.targetX = b.x + (Math.random() - 0.5) * 80;
        b.targetY = b.y - 50;
      }

      switch (b.state) {
        case 'fly':
        case 'flee': {
          const dx = b.targetX - b.x;
          const dy = b.targetY - b.y;
          const d = Math.hypot(dx, dy);
          const speed = b.state === 'flee' ? 11 : 7.5;
          if (d > 0.4) {
            b.x += (dx / d) * speed * dt;
            b.y += (dy / d) * speed * dt;
            const sxd = dx - dy;
            if (Math.abs(sxd) > 0.2) b.facing = sxd > 0 ? 1 : -1;
          }
          // altitude
          b.z += (b.zTarget - b.z) * Math.min(1, dt * 2);
          if (!b.leaving && b.state === 'fly' && d < 0.5) {
            b.zTarget = b.landZ;
            if (Math.abs(b.z - b.zTarget) < 3) {
              b.z = b.zTarget;
              b.state = b.onWater ? 'swim' : 'idle';
              b.nextAction = s.simT + 0.5 + Math.random() * 2;
              if (b.onWater) this.s.effects.push({ kind: 'ripple', x: b.x, y: b.y, t0: s.simT, dur: 1.2 });
            }
          }
          break;
        }
        case 'soar': {
          // big lazy circles around the anchor
          const ang = now * 0.25 + b.uid;
          b.x = b.anchorX + Math.cos(ang) * 9;
          b.y = b.anchorY + Math.sin(ang) * 9;
          b.facing = Math.cos(ang + Math.PI / 2) - Math.sin(ang + Math.PI / 2) > 0 ? 1 : -1;
          b.z = 90 + Math.sin(now * 0.5 + b.uid) * 8;
          break;
        }
        case 'swim': {
          if (s.simT > b.nextAction) {
            b.nextAction = s.simT + 2 + Math.random() * 5;
            const tx = b.x + (Math.random() - 0.5) * 5;
            const ty = b.y + (Math.random() - 0.5) * 5;
            if (isWater(tileAt(s.world, tx, ty))) {
              b.targetX = tx;
              b.targetY = ty;
            }
          }
          const dx = b.targetX - b.x;
          const dy = b.targetY - b.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.2) {
            b.x += (dx / d) * 0.8 * dt;
            b.y += (dy / d) * 0.8 * dt;
            const sxd = dx - dy;
            if (Math.abs(sxd) > 0.1) b.facing = sxd > 0 ? 1 : -1;
            if (Math.random() < dt * 0.6)
              this.s.effects.push({ kind: 'ripple', x: b.x - 0.3 * b.facing, y: b.y, t0: s.simT, dur: 1.4 });
          }
          break;
        }
        case 'idle':
        case 'feed': {
          if (s.simT > b.nextAction) {
            const r = Math.random();
            if (look.shape === 'heron') {
              b.pecking = r < 0.4 ? 1 : 0;
              b.nextAction = s.simT + 3 + Math.random() * 5;
            } else if (look.shape === 'woodpecker') {
              b.pecking = r < 0.6 ? 1 : 0;
              b.nextAction = s.simT + 1.5 + Math.random() * 3;
            } else if (look.shape === 'hummingbird') {
              // dart to a new hover spot
              b.targetX = b.anchorX + (Math.random() - 0.5) * 3;
              b.targetY = b.anchorY + (Math.random() - 0.5) * 3;
              b.state = 'fly';
              b.landZ = 6 + Math.random() * 8;
              b.zTarget = b.landZ;
              b.nextAction = s.simT + 1;
            } else if (r < 0.45 && b.landZ < 5) {
              // hop somewhere close (ground birds only)
              const tx = b.x + (Math.random() - 0.5) * 2.4;
              const ty = b.y + (Math.random() - 0.5) * 2.4;
              if (isWalkable(s.world, tx, ty)) {
                b.state = 'hop';
                b.targetX = tx;
                b.targetY = ty;
              }
              b.nextAction = s.simT + 0.8 + Math.random() * 2.5;
            } else if (r < 0.75) {
              b.state = 'feed';
              b.pecking = 1;
              b.nextAction = s.simT + 1.5 + Math.random() * 2;
            } else {
              b.state = 'idle';
              b.pecking = 0;
              b.nextAction = s.simT + 1 + Math.random() * 3;
            }
          }
          break;
        }
        case 'hop': {
          const dx = b.targetX - b.x;
          const dy = b.targetY - b.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.12) {
            b.state = 'idle';
            b.z = b.landZ;
          } else {
            b.x += (dx / d) * 3.2 * dt;
            b.y += (dy / d) * 3.2 * dt;
            b.z = b.landZ + Math.abs(Math.sin(now * 14)) * 2.5;
            const sxd = dx - dy;
            if (Math.abs(sxd) > 0.1) b.facing = sxd > 0 ? 1 : -1;
          }
          break;
        }
        case 'sing': {
          if (s.simT > b.singingUntil) {
            b.state = 'idle';
            b.nextAction = s.simT + 0.5;
          }
          break;
        }
      }

      // singing
      if (
        s.simT > b.nextSong &&
        (b.state === 'idle' || b.state === 'feed' || b.state === 'swim' || b.state === 'soar') &&
        !b.leaving
      ) {
        const [mn, mx] = sp.songEvery;
        const factor = chorus ? 0.35 : 1;
        b.nextSong = s.simT + (mn + Math.random() * (mx - mn)) * factor;
        if (distP < 30) {
          const pan = Math.max(-1, Math.min(1, (this.renderer.sx(s, b.x, b.y) - this.renderer.W / 2) / (this.renderer.W * 0.6)));
          const gain = Math.max(0, 1 - distP / 30) * (sp.look.size > 1.5 ? 0.8 : 1);
          const dur = this.audio.playSong(sp.song, pan, gain);
          if (b.state !== 'soar' && b.state !== 'swim') {
            b.state = 'sing';
            b.singingUntil = s.simT + dur;
          }
          const entry = s.journal[b.species];
          const known = !!(entry?.seen || entry?.heard);
          // marker so you can find (or quiz on) the singer
          const existing = s.songMarkers.find((m) => m.uid === b.uid);
          if (existing) {
            existing.until = s.simT + dur + 4;
            existing.x = b.x;
            existing.y = b.y;
          } else {
            s.songMarkers.push({
              uid: b.uid,
              species: b.species,
              x: b.x,
              y: b.y,
              until: s.simT + dur + 4,
              identified: known,
            });
          }
          if (known) {
            this.s.effects.push({ kind: 'note', x: b.x, y: b.y, z: b.z + 16, t0: s.simT, dur: 1.6 });
          }
        }
      }
    }

    // remove departed birds
    this.s.birds = this.s.birds.filter(
      (b) => !(b.leaving && (b.z > 75 || Math.hypot(b.x - s.player.x, b.y - s.player.y) > 45))
    );
  }

  // ---- nests ------------------------------------------------------------------------------------

  private dawnUpdate() {
    const s = this.s;
    // advance existing nests
    for (const n of s.nests) {
      if (n.done) continue;
      const age = s.time.day - n.stageStartDay;
      if (n.stage === 'building' && age >= 1) {
        n.stage = 'eggs';
        n.stageStartDay = s.time.day;
        if (n.discovered) this.emit({ kind: 'toast', msg: `Eggs in the ${BIRD_BY_ID[n.species].name} nest!`, icon: '🥚' });
      } else if (n.stage === 'eggs' && age >= 2) {
        n.stage = 'chicks';
        n.stageStartDay = s.time.day;
        if (n.discovered) this.emit({ kind: 'toast', msg: `The ${BIRD_BY_ID[n.species].name} eggs have hatched!`, icon: '🐣' });
      } else if (n.stage === 'chicks' && age >= 2) {
        n.stage = 'fledged';
        n.stageStartDay = s.time.day;
        if (n.discovered) {
          s.nestsFledged++;
          this.addSeeds(SEEDS.nestFledged);
          this.emit({ kind: 'fledge', speciesId: n.species });
        }
      } else if (n.stage === 'fledged' && age >= 1) {
        n.done = true;
      }
    }
    s.nests = s.nests.filter((n) => !n.done);

    // maybe a new pair starts building
    const active = s.nests.filter((n) => !n.done);
    if (active.length >= 3) {
      this.save();
      return;
    }
    const candidates = BIRDS.filter((sp) => {
      const j = s.journal[sp.id];
      if (!j || !j.seen || j.count < 2) return false;
      if (!sp.nest) return false;
      if (active.some((n) => n.species === sp.id)) return false;
      return true;
    });
    if (candidates.length && Math.random() < 0.5) {
      const sp = candidates[Math.floor(Math.random() * candidates.length)];
      let spot: { x: number; y: number; inBox?: boolean } | null = null;
      if (sp.nest === 'box') {
        const boxes = s.structures.filter(
          (st) => st.type === 'nestbox' && !s.nests.some((n) => !n.done && n.inBox && Math.hypot(n.x - st.x, n.y - st.y) < 0.5)
        );
        if (boxes.length) {
          const bx = boxes[Math.floor(Math.random() * boxes.length)];
          spot = { x: bx.x, y: bx.y, inBox: true };
        }
      }
      if (!spot && sp.nest === 'marsh') {
        const marshes = s.world.shoreTiles.filter((t) => tileAt(s.world, t.x + 0.5, t.y + 0.5) === T.MARSH);
        if (marshes.length) {
          const m = marshes[Math.floor(Math.random() * marshes.length)];
          spot = { x: m.x + 0.5, y: m.y + 0.5 };
        }
      }
      if (!spot && sp.nest !== 'box') {
        // a tree within wandering distance of the cabin
        const near = s.world.trees.filter((tr) => Math.hypot(tr.x - s.world.cabin.x, tr.y - s.world.cabin.y) < 26);
        if (near.length) {
          const tr = near[Math.floor(Math.random() * near.length)];
          spot = { x: tr.x, y: tr.y };
        }
      }
      if (spot) {
        s.nests.push({
          id: `n${Date.now()}`,
          species: sp.id,
          x: spot.x,
          y: spot.y,
          inBox: spot.inBox,
          stage: 'building',
          stageStartDay: s.time.day,
          discovered: false,
        });
        this.emit({
          kind: 'toast',
          msg: 'You hear busy wingbeats… a pair is building a nest somewhere nearby',
          icon: '🪺',
        });
      }
    }
    this.save();
  }

  // ---- fishing ------------------------------------------------------------------------------------

  private updateFishing(dt: number) {
    const f = this.s.fishing;
    if (!f) return;
    f.castT += dt;

    switch (f.phase) {
      case 'cast':
        if (f.castT > 0.55) {
          f.phase = 'wait';
          f.castT = 0;
          f.nextEvent = 2.5 + Math.random() * 7;
          this.audio.plop();
          this.s.effects.push({ kind: 'ripple', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 1.4 });
        }
        break;
      case 'wait':
        if (f.castT > f.nextEvent) {
          f.castT = 0;
          // pick what's biting
          const fish = this.pickFish(f.bobX, f.bobY);
          if (!fish) {
            f.nextEvent = 3 + Math.random() * 6;
            break;
          }
          f.fishId = fish.id;
          if (Math.random() < 0.55) {
            f.phase = 'nibble';
            f.nextEvent = 0.5 + Math.random() * 0.6;
            this.audio.nibble();
            this.s.effects.push({ kind: 'ripple', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 0.8 });
          } else {
            this.startStrike(f);
          }
        }
        break;
      case 'nibble':
        if (f.castT > f.nextEvent) {
          f.castT = 0;
          this.startStrike(f);
        }
        break;
      case 'strike':
        if (f.castT > 1.0) {
          // missed it
          f.phase = 'wait';
          f.castT = 0;
          f.nextEvent = 3 + Math.random() * 6;
          f.fishId = undefined;
          this.s.effects.push({ kind: 'ripple', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 1.2 });
        }
        break;
      case 'reel': {
        const sp = FISH_BY_ID[f.fishId!];
        // fish pulls in bursts
        f.pullPhase += dt * (0.6 + sp.fight * 0.25);
        const burst = Math.max(0, Math.sin(f.pullPhase * 2.2) - 0.25);
        f.pull = burst * sp.fight * 0.32;
        f.reeling = this.holdReel;
        if (this.holdReel) {
          f.progress += dt * 0.115;
          f.tension += dt * (0.32 + sp.fight * 0.1 + f.pull);
          if (Math.random() < dt * 8) this.audio.reelTick();
        } else {
          f.tension -= dt * 0.5;
          f.progress -= dt * 0.025;
          f.tension += dt * f.pull * 0.4;
        }
        f.tension = Math.max(0, Math.min(1.001, f.tension));
        f.progress = Math.max(0, f.progress);
        if (Math.random() < dt * 1.5)
          this.s.effects.push({ kind: 'ripple', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 1.0 });
        if (f.tension >= 1) {
          this.audio.lineSnap();
          this.emit({ kind: 'toast', msg: 'Snap! It broke the line…', icon: '💔' });
          this.endFishing();
          return;
        }
        if (f.progress >= 1) this.landFish(f);
        break;
      }
      default:
        break;
    }
  }

  private startStrike(f: FishingState) {
    f.phase = 'strike';
    f.castT = 0;
    this.audio.strike();
    this.s.effects.push({ kind: 'splash', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 0.7 });
  }

  private hookSet() {
    const f = this.s.fishing;
    if (!f || f.phase !== 'strike') return;
    f.phase = 'reel';
    f.castT = 0;
    f.tension = 0.35;
    f.progress = 0.08;
    f.pullPhase = Math.random() * 5;
    this.audio.reelTick();
    this.emit({ kind: 'hud' });
  }

  private pickFish(x: number, y: number) {
    const kind = waterKindAt(this.s.world, x, y);
    const t = this.s.time.t;
    const matches = FISH.filter((fs) => {
      if (!fs.water.includes(kind) && !(kind === 'deep' && fs.water.includes('lake'))) return false;
      switch (fs.time) {
        case 'all':
          return true;
        case 'day':
          return t > 0.25 && t < 0.8;
        case 'dawnDusk':
          return (t > 0.18 && t < 0.38) || (t > 0.7 && t < 0.9);
        case 'night':
          return t > 0.78 || t < 0.22;
      }
    });
    if (!matches.length) return null;
    const weighted = matches.map((fs) => ({ fs, w: fs.rarity === 1 ? 10 : fs.rarity === 2 ? 3.5 : 1 }));
    const total = weighted.reduce((a, c) => a + c.w, 0);
    let roll = Math.random() * total;
    for (const c of weighted) {
      roll -= c.w;
      if (roll <= 0) return c.fs;
    }
    return weighted[0].fs;
  }

  private landFish(f: FishingState) {
    const sp = FISH_BY_ID[f.fishId!];
    // skewed toward smaller fish; trophies are rare
    const r = Math.pow(Math.random(), 2.2);
    const len = Math.round((sp.minLen + (sp.maxLen - sp.minLen) * (1 - r)) * 10) / 10;
    const rec = this.s.fishRecords[sp.id];
    const isNew = !rec;
    const isRecord = !!rec && len > rec.best;
    this.s.fishRecords[sp.id] = {
      count: (rec?.count ?? 0) + 1,
      best: Math.max(rec?.best ?? 0, len),
      firstDay: rec?.firstDay ?? this.s.time.day,
    };
    this.addSeeds(SEEDS.fishByRarity[sp.rarity], f.bobX, f.bobY);
    this.audio.catchFanfare();
    this.s.effects.push({ kind: 'splash', x: f.bobX, y: f.bobY, t0: this.s.simT, dur: 0.9 });
    this.endFishing();
    this.paused = true;
    this.save();
    this.emit({ kind: 'catch', fishId: sp.id, len, isNew, isRecord });
  }
}
