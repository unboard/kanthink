// Whisker Wilds — game engine
// Owns the Three.js scene, physics, AI, modes, duels, challenges, and the
// bridge to the React UI shell (HUD state, overlays, touch input).

import * as THREE from 'three';
import { World, type Critter, type TreeInfo, type YarnBall } from './world';
import { CatAvatar } from './cats';
import { AudioEngine } from './audio';
import {
  WATER_LEVEL, DAY_LENGTH, RIVAL_CLANS, BUILDABLES, RANKS,
  generateCat, generateKitten, generateBaby, generateWanderer, genderOf,
  rankFor, xpForLevel, clanCapacity,
} from './data';
import type {
  CatSpec, ContextTarget, ChallengeState, DuelState, GameEvents, GameMode,
  HudState, SaveData, BuildingInstance,
} from './types';
import { persistSave } from './save';
import { mulberry32, hash2 } from './rng';

const GRAVITY = -24;
const PLAYER_RADIUS = 0.45;

interface RivalCat {
  spec: CatSpec;
  avatar: CatAvatar;
  clanId: string;
  x: number; z: number; y: number;
  heading: number;
  state: 'wander' | 'seek' | 'return' | 'rest' | 'facing';
  stateT: number;
  targetYarn: YarnBall | null;
  level: number;
}

interface FollowerKitten {
  spec: CatSpec;
  avatar: CatAvatar;
  x: number; z: number; y: number;
  heading: number;
  hopVy: number;
  hopY: number;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private audio = new AudioEngine();
  private events: GameEvents;
  save: SaveData;

  // player state
  private player!: CatAvatar;
  private px = 0; private py = 0; private pz = 0;
  private vy = 0;
  private heading = 0;
  private grounded = true;
  private swimming = false;
  private sneaking = false;
  private climbing: { tree: TreeInfo; h: number } | null = null;
  private busyT = 0;               // dig/scratch/pounce lock timer
  private busyKind: 'dig' | 'scratch' | 'pounce' | null = null;
  private busyPayload: (() => void) | null = null;
  private idleT = 0;
  private lastMoveDir = { x: 0, z: 1 };
  private pounceVel: { x: number; z: number } | null = null;

  // input
  private joyX = 0; private joyY = 0;
  private keys = new Set<string>();
  private camYaw = 0.5;
  private camPitch = 0.42;
  private camDist = 6.8;

  mode: GameMode = 'explore';
  private context: ContextTarget | null = null;

  // rivals + AI
  private rivals: RivalCat[] = [];

  // kittens: followers mimic the player; extras hang out at camp
  private followers: FollowerKitten[] = [];
  private campKittens: { avatar: CatAvatar; x: number; z: number; heading: number; t: number }[] = [];
  private actionHistory: { t: number; a: import('./types').CatAction }[] = [];
  private rescue: { tree: TreeInfo; spec: CatSpec; avatar: CatAvatar; meowT: number; perchY: number } | null = null;
  private nextRescueAt = 40;

  // ground strays that can Join, and a carried kitten in your mouth
  private stray: { spec: CatSpec; avatar: CatAvatar; x: number; z: number; t: number } | null = null;
  private nextStrayAt = 90;
  private carrying: FollowerKitten | null = null;

  // love & family
  private wanderers: { spec: CatSpec; avatar: CatAvatar; x: number; z: number; y: number; heading: number; state: 'wander' | 'shy' | 'responding' | 'approach' | 'noserub'; stateT: number; cooldown: number }[] = [];
  private babies: { avatar: CatAvatar; idx: number }[] = []; // nursery avatars at camp
  private nursingT = 0;
  private dadHuntAt = 60;

  // camp clanmates (non-active clan cats hang out and babysit)
  private clanmates: { avatar: CatAvatar; x: number; z: number; heading: number; t: number }[] = [];

  // hopscotch race court
  private hop: {
    rows: number[]; playerRow: number; rivalRow: number;
    lockT: number; rivalT: number; rivalInterval: number;
    origin: { x: number; z: number; dirX: number; dirZ: number };
    courtY: number;                     // the board floats flat above the terrain
    meshes: THREE.Object3D[];
    rowSquares: THREE.Mesh[][];         // player-lane squares per row (for highlighting)
    marker: THREE.Mesh | null;          // golden arrow over the row being counted
    playerHopT: number; rivalHopT: number;
  } | null = null;

  // pushable toy balls
  private toys: { mesh: THREE.Mesh; x: number; z: number; y: number; vx: number; vz: number }[] = [];

  // cat tower trial
  private towerDoneAt = -999;

  // duel
  private duel: DuelState | null = null;
  private duelRival: RivalCat | null = null;
  private duelMarker = 0;           // 0..1 position
  private duelDir = 1;
  private duelTimer = 0;

  // challenges
  private challenge: ChallengeState | null = null;
  private challengeBeacon: THREE.Group | null = null;
  private racerCat: { avatar: CatAvatar; x: number; z: number; progress: number; speed: number } | null = null;
  private hideKitten: { avatar: CatAvatar; x: number; z: number; meowT: number } | null = null;
  private challengeStartYarn = 0;

  // agility
  private agility: { running: boolean; t: number; nextGate: number; countdown: number } = { running: false, t: 0, nextGate: 0, countdown: 0 };
  private gateRing: THREE.Mesh;
  private agilityPar = 46;

  // build mode
  private buildSel: string | null = null;
  private buildGhost: THREE.Group | null = null;
  private buildValid = false;

  // particles
  private particles: Particle[] = [];
  private particleGeo: THREE.BufferGeometry;
  private particlePoints: THREE.Points;
  private readonly MAX_PARTICLES = 300;

  // adaptive quality (fps-driven, one-way downgrades)
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsCheckAt = 9;
  private qualityStep = 0;

  // time
  private timeOfDay = 0.35; // start morning
  private elapsed = 0;
  private lastHud = 0;
  private lastSave = 0;
  private raf = 0;
  private disposed = false;
  private lastFrame = 0;
  private stepAcc = 0;

  constructor(canvas: HTMLCanvasElement, save: SaveData, events: GameEvents) {
    this.save = save;
    this.events = events;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#cfe3ee', 70, 260);
    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);

    this.world = new World(save.seed, this.scene);
    this.world.spawnYarn(save.wave, save.collectedYarn, save.goldenDone);

    // buildings from save
    for (const b of save.buildings) this.world.addBuilding(b);

    // player avatar at camp
    const spec = save.cats.find((c) => c.id === save.activeCatId) ?? save.cats[0];
    this.spawnPlayer(spec);

    this.spawnRivals();
    this.syncKittens();
    this.syncFamily();
    this.spawnWanderers();
    this.spawnToys();

    // agility gate highlight ring
    this.gateRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.9 })
    );
    this.gateRing.rotation.x = Math.PI / 2;
    this.gateRing.visible = false;
    this.scene.add(this.gateRing);

    // particles
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES * 3), 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTICLES * 3), 3));
    // soft round puff sprite so dust/sparkles aren't hard squares
    const pc = document.createElement('canvas');
    pc.width = 32; pc.height = 32;
    const pctx = pc.getContext('2d')!;
    const grad = pctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, 32, 32);
    const puffTex = new THREE.CanvasTexture(pc);
    const pMat = new THREE.PointsMaterial({
      size: 0.3, vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, map: puffTex,
    });
    this.particlePoints = new THREE.Points(this.particleGeo, pMat);
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);

    // input listeners
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);

    this.audio.setSound(save.soundOn);
    this.audio.setMusic(save.musicOn);

    // debug handle (also handy on a tablet: window.__ww in devtools)
    (window as unknown as { __ww?: Game }).__ww = this;
  }

  // ——— lifecycle ———

  start() {
    // first-ever session: gentle staggered welcome tips
    // (flag is set when the first tip fires, so a StrictMode double-mount
    // in dev doesn't consume it before the surviving instance starts)
    if (!this.save.tutorialDone.includes('welcome')) {
      const tips = [
        `Welcome to the Wilds, ${this.player.spec.name}! 🐾`,
        'Use the joystick to run around — push far to sprint!',
        'Find yarn balls 🧶 — golden ones ✨ unlock challenges that recruit new cats!',
      ];
      tips.forEach((t, i) =>
        setTimeout(() => {
          if (this.disposed || (i === 0 && this.save.tutorialDone.includes('welcome'))) return;
          if (i === 0) this.save.tutorialDone.push('welcome');
          this.toast(t);
        }, 1200 + i * 4000)
      );
    }
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    for (const f of this.followers) f.avatar.dispose();
    for (const ck of this.campKittens) ck.avatar.dispose();
    for (const w of this.wanderers) w.avatar.dispose();
    for (const b of this.babies) b.avatar.dispose();
    for (const cm of this.clanmates) cm.avatar.dispose();
    if (this.rescue) this.rescue.avatar.dispose();
    if (this.stray) this.stray.avatar.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.persist();
  }

  /** call from first user gesture to unlock audio */
  unlockAudio() {
    this.audio.init();
  }

  private onResize = () => {
    const c = this.renderer.domElement;
    const w = c.clientWidth, h = c.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ——— spawn ———

  private spawnPlayer(spec: CatSpec) {
    if (this.player) {
      this.scene.remove(this.player.root);
      this.player.dispose();
    }
    this.player = new CatAvatar(spec);
    this.scene.add(this.player.root);
    if (this.px === 0 && this.pz === 0) {
      this.px = this.world.playerCamp.x + 3;
      this.pz = this.world.playerCamp.z + 3;
    }
    this.py = this.world.heightAt(this.px, this.pz);
    this.player.root.position.set(this.px, this.py, this.pz);
  }

  private spawnRivals() {
    for (let ci = 0; ci < RIVAL_CLANS.length; ci++) {
      const clan = RIVAL_CLANS[ci];
      const camp = this.world.camps.find((c) => c.clanId === clan.id)!;
      for (let i = 0; i < 3; i++) {
        // recruited rivals joined the player's clan — the clan sends a new cat
        let gen = 0;
        while (this.save.rivals[clan.id]?.records[gen === 0 ? `${clan.id}_${i}` : `${clan.id}_${i}_g${gen}`]?.recruited) gen++;
        const spec = generateCat(this.save.seed + ci * 1000 + i * 17 + gen * 7717, clan.id, {
          paletteIdx: clan.palette[i % clan.palette.length],
          idOverride: gen === 0 ? `${clan.id}_${i}` : `${clan.id}_${i}_g${gen}`,
        });
        // rivals carry earned records from save
        const rec = this.save.rivals[clan.id]?.records[spec.id];
        if (rec) { spec.wins = rec.wins; spec.losses = rec.losses; }
        spec.level = 1 + ((this.save.seed + ci * 3 + i) % 5);
        const avatar = new CatAvatar(spec);
        const a = (i / 3) * Math.PI * 2;
        const x = camp.x + Math.cos(a) * 6;
        const z = camp.z + Math.sin(a) * 6;
        avatar.root.position.set(x, this.world.heightAt(x, z), z);
        this.scene.add(avatar.root);
        this.rivals.push({
          spec, avatar, clanId: clan.id,
          x, z, y: this.world.heightAt(x, z),
          heading: Math.random() * Math.PI * 2,
          state: 'wander', stateT: Math.random() * 5,
          targetYarn: null,
          level: spec.level,
        });
      }
    }
  }

  // ——— kittens ———

  /** rebuild follower + camp-kitten avatars from the save */
  private syncKittens() {
    this.carrying = null;
    for (const f of this.followers) {
      this.scene.remove(f.avatar.root);
      f.avatar.dispose();
    }
    for (const ck of this.campKittens) {
      this.scene.remove(ck.avatar.root);
      ck.avatar.dispose();
    }
    this.followers = [];
    this.campKittens = [];

    const following = this.save.kittens.slice(0, 5); // a whole pile of kittens
    following.forEach((spec, i) => {
      const avatar = new CatAvatar(spec, { kitten: true });
      const x = this.px - Math.sin(this.heading) * (1.4 + i) + (i - 1) * 0.7;
      const z = this.pz - Math.cos(this.heading) * (1.4 + i);
      avatar.root.position.set(x, this.world.heightAt(x, z), z);
      this.scene.add(avatar.root);
      this.followers.push({ spec, avatar, x, z, y: this.world.heightAt(x, z), heading: this.heading, hopVy: 0, hopY: 0 });
    });

    for (const spec of this.save.kittens.slice(5, 10)) {
      const avatar = new CatAvatar(spec, { kitten: true });
      const a = Math.random() * Math.PI * 2;
      const x = this.world.playerCamp.x + Math.cos(a) * 5;
      const z = this.world.playerCamp.z + Math.sin(a) * 5;
      avatar.root.position.set(x, this.world.heightAt(x, z), z);
      this.scene.add(avatar.root);
      this.campKittens.push({ avatar, x, z, heading: a, t: Math.random() * 10 });
    }
  }

  /** the player's action, as it was `delay` seconds ago — kittens copy with a lag */
  private delayedAction(delay: number): import('./types').CatAction {
    const cutoff = this.elapsed - delay;
    for (let i = this.actionHistory.length - 1; i >= 0; i--) {
      if (this.actionHistory[i].t <= cutoff) return this.actionHistory[i].a;
    }
    return this.actionHistory[0]?.a ?? 'idle';
  }

  private updateFollowers(dt: number) {
    // record player action history (~120 entries ≈ 2s at 60fps is plenty for 1.2s max lag)
    this.actionHistory.push({ t: this.elapsed, a: this.player.action });
    if (this.actionHistory.length > 160) this.actionHistory.shift();

    const n = this.followers.length;
    for (let i = 0; i < n; i++) {
      const f = this.followers[i];
      // carried kitten dangles from the mouth, limp and purring
      if (f === this.carrying) {
        f.x = this.px + Math.sin(this.heading) * 0.62;
        f.z = this.pz + Math.cos(this.heading) * 0.62;
        f.y = this.py + 0.52;
        f.avatar.root.position.set(f.x, f.y, f.z);
        f.avatar.root.rotation.y = this.heading;
        f.avatar.setAction('nap');
        f.avatar.moveSpeed = 0;
        f.avatar.update(dt, this.elapsed);
        continue;
      }
      const delay = 0.35 + i * 0.28;
      const mimic = this.delayedAction(delay);

      // trail formation: staggered line behind the player
      const back = this.heading + Math.PI;
      const side = (i - (n - 1) / 2) * 1.0;
      const dist = 1.5 + i * 0.75;
      const tx = this.px + Math.sin(back) * dist + Math.sin(back + Math.PI / 2) * side;
      const tz = this.pz + Math.cos(back) * dist + Math.cos(back + Math.PI / 2) * side;
      const d = Math.hypot(tx - f.x, tz - f.z);

      // lost kittens (swam off, glitched) pop back to the player's side
      if (Math.hypot(f.x - this.px, f.z - this.pz) > 34) {
        f.x = this.px + Math.sin(back) * 1.5;
        f.z = this.pz + Math.cos(back) * 1.5;
      }

      let speed = 0;
      if (d > 0.35) {
        speed = Math.min(9.5, d * 2.4);
        const a = Math.atan2(tx - f.x, tz - f.z);
        f.x += Math.sin(a) * speed * dt;
        f.z += Math.cos(a) * speed * dt;
        let dh = a - f.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        f.heading += dh * Math.min(1, dt * 8);
      } else {
        // idle: face where the player faces (mimicry!)
        let dh = this.heading - f.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        f.heading += dh * Math.min(1, dt * 3);
      }

      const groundY = this.world.heightAt(f.x, f.z);
      const inWater = WATER_LEVEL - groundY > 0.5;

      // hop mimicry
      if (mimic === 'jump' && f.hopY === 0 && f.hopVy === 0 && !inWater) {
        f.hopVy = 5.5;
        f.hopY = 0.001;
      }
      if (f.hopY > 0) {
        f.hopVy -= 22 * dt;
        f.hopY += f.hopVy * dt;
        if (f.hopY <= 0) { f.hopY = 0; f.hopVy = 0; }
      }

      f.y = inWater ? WATER_LEVEL - 0.22 : groundY + f.hopY;
      f.avatar.root.position.set(f.x, f.y, f.z);
      f.avatar.root.rotation.y = f.heading;
      f.avatar.moveSpeed = speed;

      // choose the mimicked pose
      if (inWater) f.avatar.setAction('swim');
      else if (f.hopY > 0) f.avatar.setAction(f.hopVy > 0 ? 'jump' : 'fall');
      else if (speed > 0.3) f.avatar.setAction(mimic === 'sneak' ? 'sneak' : speed > 4.2 ? 'run' : 'walk');
      else if (mimic === 'dig' || mimic === 'scratch' || mimic === 'sit' || mimic === 'nap' || mimic === 'sneak' || mimic === 'pounce') {
        f.avatar.setAction(mimic);
      } else f.avatar.setAction('idle');

      f.avatar.update(dt, this.elapsed + i * 1.7);
    }

    // camp kittens: gentle wandering around the stone circle
    for (const ck of this.campKittens) {
      ck.t += dt;
      const camp = this.world.playerCamp;
      const phase = Math.sin(ck.t * 0.25);
      if (phase > 0.2) {
        ck.heading += Math.sin(ck.t * 0.6) * dt * 0.8;
        ck.x += Math.sin(ck.heading) * 0.8 * dt;
        ck.z += Math.cos(ck.heading) * 0.8 * dt;
        if (Math.hypot(ck.x - camp.x, ck.z - camp.z) > 9) {
          ck.heading = Math.atan2(camp.x - ck.x, camp.z - ck.z);
        }
        ck.avatar.setAction('walk');
        ck.avatar.moveSpeed = 0.8;
      } else {
        ck.avatar.setAction(phase < -0.7 ? 'nap' : 'sit');
        ck.avatar.moveSpeed = 0;
      }
      ck.avatar.root.position.set(ck.x, this.world.heightAt(ck.x, ck.z), ck.z);
      ck.avatar.root.rotation.y = ck.heading;
      if (Math.hypot(ck.x - this.px, ck.z - this.pz) < 60) ck.avatar.update(dt, this.elapsed + ck.t);
    }
  }

  // ——— love & family ———

  /** rebuild nursery babies + camp clanmate avatars from the save */
  private syncFamily() {
    for (const b of this.babies) {
      this.scene.remove(b.avatar.root);
      b.avatar.dispose();
    }
    this.babies = [];
    const camp = this.world.playerCamp;
    this.save.nursery.forEach((entry, i) => {
      const avatar = new CatAvatar(entry.spec, { kitten: true });
      const a = (i / Math.max(1, this.save.nursery.length)) * Math.PI * 2;
      const x = camp.x + Math.cos(a) * 2.2;
      const z = camp.z + Math.sin(a) * 2.2;
      avatar.root.position.set(x, this.world.heightAt(x, z), z);
      avatar.setAction(i % 2 ? 'nap' : 'sit');
      this.scene.add(avatar.root);
      this.babies.push({ avatar, idx: i });
    });

    for (const cm of this.clanmates) {
      this.scene.remove(cm.avatar.root);
      cm.avatar.dispose();
    }
    this.clanmates = [];
    const others = this.save.cats.filter((c) => c.id !== this.save.activeCatId).slice(0, 3);
    others.forEach((spec, i) => {
      const avatar = new CatAvatar(spec);
      const a = i * 2.3 + 1;
      const x = camp.x + Math.cos(a) * 6.5;
      const z = camp.z + Math.sin(a) * 6.5;
      avatar.root.position.set(x, this.world.heightAt(x, z), z);
      this.scene.add(avatar.root);
      this.clanmates.push({ avatar, x, z, heading: Math.random() * Math.PI * 2, t: Math.random() * 10 });
    });
  }

  private spawnWanderers() {
    for (const w of this.wanderers) {
      this.scene.remove(w.avatar.root);
      w.avatar.dispose();
    }
    this.wanderers = [];
    const rng = mulberry32(this.save.seed + 424242 + this.save.cats.length * 31);
    for (let i = 0; i < 3; i++) {
      const gender: 'girl' | 'boy' = i === 0 ? 'boy' : rng() < 0.6 ? 'boy' : 'girl';
      const spec = generateWanderer(this.save.seed + 5555 + i * 977 + this.save.cats.length * 13, gender);
      const avatar = new CatAvatar(spec);
      let x = 0, z = 0;
      for (let t = 0; t < 20; t++) {
        const a = rng() * Math.PI * 2;
        const d = 60 + rng() * 90;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
        if (this.world.heightAt(x, z) > 1.5) break;
      }
      avatar.root.position.set(x, this.world.heightAt(x, z), z);
      this.scene.add(avatar.root);
      this.wanderers.push({
        spec, avatar, x, z, y: 0,
        heading: rng() * Math.PI * 2,
        state: 'wander', stateT: 0, cooldown: 0,
      });
    }
  }

  /** meow sweetly at a wanderer — hearts by your mouth; maybe hearts back */
  private tryLove(wandererId: string) {
    const w = this.wanderers.find((ww) => ww.spec.id === wandererId);
    if (!w || w.state !== 'wander' || w.cooldown > 0) return;
    const me = this.player.spec;
    this.player.meow();
    this.audio.meow(me.voicePitch, 0.5);
    this.player.showEmote('heart', 2.2);
    w.state = 'responding';
    w.stateT = 0;
    setTimeout(() => {
      if (this.disposed || w.state !== 'responding') return;
      const smitten = Math.random() < 0.65;
      if (smitten) {
        w.avatar.showEmote('heart', 3);
        w.avatar.meow();
        this.audio.meow(w.spec.voicePitch, 0.4);
        w.state = 'approach';
        w.stateT = 0;
      } else {
        w.avatar.showEmote('?', 2);
        w.state = 'shy';
        w.stateT = 0;
        w.cooldown = 45;
        this.toast(`${w.spec.name} is feeling shy… maybe another cat, or try again later!`);
      }
    }, 1300);
  }

  private updateWanderers(dt: number) {
    for (const w of this.wanderers) {
      w.stateT += dt;
      w.cooldown = Math.max(0, w.cooldown - dt);
      const distP = Math.hypot(w.x - this.px, w.z - this.pz);
      let speed = 0;
      switch (w.state) {
        case 'wander': {
          if (distP > 60) break; // far wanderers idle (cheap)
          speed = 1.3;
          w.heading += (hash2((w.x * 7) | 0, (this.elapsed * 0.4) | 0, 5) - 0.5) * dt * 2;
          if (this.world.heightAt(w.x + Math.sin(w.heading), w.z + Math.cos(w.heading)) < WATER_LEVEL + 0.4) {
            w.heading += Math.PI * 0.7;
          }
          w.avatar.setAction(Math.sin(this.elapsed * 0.1 + w.x) > 0.6 ? 'sit' : 'walk');
          if (w.avatar.action !== 'walk') speed = 0;
          break;
        }
        case 'shy': {
          speed = 2.8; // hurries off a little way
          if (w.stateT > 2.5) { w.state = 'wander'; w.stateT = 0; }
          w.avatar.setAction('run');
          break;
        }
        case 'responding': {
          w.heading = Math.atan2(this.px - w.x, this.pz - w.z);
          w.avatar.setAction('sit');
          break;
        }
        case 'approach': {
          w.heading = Math.atan2(this.px - w.x, this.pz - w.z);
          speed = 2.6;
          w.avatar.setAction('walk');
          if (distP < 1.35) {
            w.state = 'noserub';
            w.stateT = 0;
            this.audio.purr(2.4, w.spec.voicePitch);
            this.audio.purr(2.4, this.player.spec.voicePitch);
          }
          break;
        }
        case 'noserub': {
          // the kiss: noses together, hearts everywhere
          w.heading = Math.atan2(this.px - w.x, this.pz - w.z);
          w.avatar.setAction('idle');
          this.player.setAction('idle');
          this.heading = Math.atan2(w.x - this.px, w.z - this.pz);
          this.applyAvatarTransform();
          if (Math.random() < dt * 4) {
            this.burst((w.x + this.px) / 2, this.py + 0.9, (w.z + this.pz) / 2, '#f2a7c3', 3);
            w.avatar.showEmote('heart', 1);
            this.player.showEmote('heart', 1);
          }
          if (w.stateT > 3) this.marry(w);
          break;
        }
      }
      if (speed > 0) {
        const nx = w.x + Math.sin(w.heading) * speed * dt;
        const nz = w.z + Math.cos(w.heading) * speed * dt;
        const solved = this.world.collide(nx, nz, 0.4, w.y);
        w.x = solved.x;
        w.z = solved.z;
      }
      w.y = this.world.heightAt(w.x, w.z);
      w.avatar.root.position.set(w.x, w.y, w.z);
      w.avatar.root.rotation.y = w.heading;
      w.avatar.moveSpeed = speed;
      if (distP < 70) w.avatar.update(dt, this.elapsed + w.x);
    }
  }

  private marry(w: (typeof this.wanderers)[number]) {
    this.wanderers = this.wanderers.filter((ww) => ww !== w);
    this.scene.remove(w.avatar.root);
    w.avatar.dispose();
    const spec = w.spec;
    spec.clanId = 'player';
    spec.isMate = true;
    this.save.cats.push(spec); // love ignores the den capacity — family is family
    this.audio.catJoin();
    this.events.onCelebrate('recruit', `${this.player.spec.name} and ${spec.name} are in love! 💕 ${spec.name} joins the family!`);
    this.tutorialOnce('litter', 'Head back to your camp — you might hear tiny squeaks soon… 🍼');
    this.syncFamily();
    this.persist();
    this.events.onSaveChanged();
  }

  private updateFamily(dt: number) {
    // a new litter arrives when you come home with a mate
    const camp = this.world.playerCamp;
    const atCamp = Math.hypot(this.px - camp.x, this.pz - camp.z) < 22;
    if (atCamp) {
      const mate = this.save.cats.find((c) => c.isMate && !this.save.hadLitter.includes(c.id));
      if (mate) {
        this.save.hadLitter.push(mate.id);
        const mom = genderOf(mate) === 'boy' ? this.player.spec : mate;
        const dad = mom === mate ? this.player.spec : mate;
        const n = 2 + ((Date.now() % 2) as number);
        for (let i = 0; i < n; i++) {
          this.save.nursery.push({ spec: generateBaby(Date.now() % 999999937 + i * 101, mom, dad), growth: 0 });
        }
        this.audio.fanfare();
        this.events.onCelebrate('recruit', `${mom.name} and ${dad.name} have ${n} newborn kittens! 🍼 Nurse them to help them grow!`);
        this.syncFamily();
        this.persist();
        this.events.onSaveChanged();
      }
    }

    // daddy hunts prey for the family
    if (this.save.cats.some((c) => c.isMate) && this.elapsed > this.dadHuntAt) {
      this.dadHuntAt = this.elapsed + 100 + Math.random() * 60;
      const dad = this.save.cats.find((c) => c.isMate)!;
      this.save.treats += 1;
      this.toast(`${dad.name} brought back a mouse for the family! 🐭 +1 treat`);
      this.persist();
      this.events.onSaveChanged();
    }

    // nursing in progress
    if (this.nursingT > 0) {
      this.nursingT -= dt;
      this.player.setAction('nap');
      for (const b of this.babies) {
        b.avatar.setAction('nap');
        const bx = this.px + Math.cos(b.idx * 2.1) * 0.85;
        const bz = this.pz + Math.sin(b.idx * 2.1) * 0.85;
        b.avatar.root.position.set(bx, this.world.heightAt(bx, bz), bz);
      }
      if (Math.random() < dt * 2) this.audio.purr(1, 1.6);
      if (this.nursingT <= 0) this.finishNursing();
      return;
    }

    // idle nursery babies wobble around camp
    for (const b of this.babies) {
      const entry = this.save.nursery[b.idx];
      if (!entry) continue;
      b.avatar.update(dt, this.elapsed + b.idx * 3.1);
    }

    // clanmates hang around camp babysitting
    for (const cm of this.clanmates) {
      cm.t += dt;
      const phase = Math.sin(cm.t * 0.2 + cm.x);
      if (phase > 0.35) {
        cm.heading += Math.sin(cm.t * 0.5) * dt * 0.7;
        cm.x += Math.sin(cm.heading) * 0.9 * dt;
        cm.z += Math.cos(cm.heading) * 0.9 * dt;
        if (Math.hypot(cm.x - camp.x, cm.z - camp.z) > 11) {
          cm.heading = Math.atan2(camp.x - cm.x, camp.z - cm.z);
        }
        cm.avatar.setAction('walk');
        cm.avatar.moveSpeed = 0.9;
      } else {
        cm.avatar.setAction(phase < -0.6 ? 'nap' : 'sit');
        cm.avatar.moveSpeed = 0;
      }
      cm.avatar.root.position.set(cm.x, this.world.heightAt(cm.x, cm.z), cm.z);
      cm.avatar.root.rotation.y = cm.heading;
      if (Math.hypot(cm.x - this.px, cm.z - this.pz) < 60) cm.avatar.update(dt, this.elapsed + cm.t);
    }
  }

  private startNursing() {
    if (this.save.nursery.length === 0 || this.nursingT > 0) return;
    this.nursingT = 3.2;
    this.audio.purr(2.5, this.player.spec.voicePitch);
    this.toast('The kittens snuggle in to nurse… 🍼');
  }

  private finishNursing() {
    const grown: string[] = [];
    for (const entry of this.save.nursery) {
      entry.growth += 1;
      if (entry.growth >= 3) grown.push(entry.spec.id);
    }
    // babies that finished growing become kittens and join the follow line
    for (const id of grown) {
      const idx = this.save.nursery.findIndex((e) => e.spec.id === id);
      if (idx < 0) continue;
      const [entry] = this.save.nursery.splice(idx, 1);
      entry.spec.stage = 'kitten';
      entry.spec.size = Math.min(0.66, entry.spec.size + 0.14);
      this.save.kittens.push(entry.spec);
      this.events.onCelebrate('levelup', `${entry.spec.name} grew bigger — look, their pattern is coming in! 🐱`);
    }
    if (grown.length === 0) this.toast('The kittens drank their fill and grew a little! 🍼');
    this.audio.success();
    this.syncFamily();
    this.syncKittens();
    this.persist();
    this.events.onSaveChanged();
  }

  /** guide button: feed a grown kitten treats until it becomes a full clan cat */
  growKitten(kittenId: string): boolean {
    if (this.save.treats < 2) return false;
    const idx = this.save.kittens.findIndex((k) => k.id === kittenId);
    if (idx < 0) return false;
    this.save.treats -= 2;
    const [spec] = this.save.kittens.splice(idx, 1);
    spec.stage = 'adult';
    spec.size = 0.85 + Math.random() * 0.2;
    spec.voicePitch = Math.max(0.75, spec.voicePitch - 0.6);
    this.save.cats.push(spec);
    this.audio.catJoin();
    this.events.onCelebrate('recruit', `${spec.name} is all grown up — a full member of ${this.save.clanName}! 🎉`);
    this.syncKittens();
    this.syncFamily();
    this.persist();
    this.events.onSaveChanged();
    return true;
  }

  // ——— ground strays + carrying ———

  private updateStray(dt: number) {
    if (!this.stray) {
      if (this.elapsed > this.nextStrayAt && this.save.kittens.length < 14) {
        // a stray kitten waits at the base of a tree near the player
        let tree: TreeInfo | null = null;
        for (let i = 0; i < 40; i++) {
          const cand = this.world.trees[(Math.random() * this.world.trees.length) | 0];
          if (!cand) break;
          const dd = Math.hypot(cand.x - this.px, cand.z - this.pz);
          if (dd > 25 && dd < 80) { tree = cand; break; }
        }
        if (tree) {
          const spec = generateKitten((Date.now() + 7) % 999999937);
          const avatar = new CatAvatar(spec, { kitten: true });
          const x = tree.x + 1.4;
          const z = tree.z + 0.6;
          avatar.root.position.set(x, this.world.heightAt(x, z), z);
          avatar.setAction('sit');
          this.scene.add(avatar.root);
          this.stray = { spec, avatar, x, z, t: 0 };
        }
        this.nextStrayAt = this.elapsed + 80 + Math.random() * 70;
      }
      return;
    }
    const s = this.stray;
    s.t += dt;
    const d = Math.hypot(s.x - this.px, s.z - this.pz);
    if (d < 18 && Math.random() < dt * 0.5) {
      this.audio.meow(s.spec.voicePitch, 0.3);
      s.avatar.meow();
      s.avatar.showEmote('!', 1.5);
    }
    s.avatar.update(dt, this.elapsed + s.t);
    // strays give up and wander off eventually
    if (s.t > 150 && d > 60) {
      this.scene.remove(s.avatar.root);
      s.avatar.dispose();
      this.stray = null;
    }
  }

  private joinStray() {
    const s = this.stray;
    if (!s) return;
    this.stray = null;
    this.scene.remove(s.avatar.root);
    s.avatar.dispose();
    this.save.kittens.push(s.spec);
    this.audio.catJoin();
    this.audio.purr(2, s.spec.voicePitch);
    this.events.onCelebrate('recruit', `${s.spec.name} joins your kitten pile! 💛`);
    this.syncKittens();
    this.persist();
    this.events.onSaveChanged();
  }

  private pickUpKitten(kittenId: string) {
    const f = this.followers.find((ff) => ff.spec.id === kittenId);
    if (!f || this.carrying) return;
    this.carrying = f;
    f.avatar.setAction('nap'); // goes limp like mama's carrying it
    this.audio.purr(1.6, f.spec.voicePitch);
    this.tutorialOnce('carry', `You're carrying ${f.spec.name} in your mouth! Walk them home and set them down gently.`);
  }

  private setDownKitten() {
    const f = this.carrying;
    if (!f) return;
    this.carrying = null;
    f.x = this.px + Math.sin(this.heading) * 0.9;
    f.z = this.pz + Math.cos(this.heading) * 0.9;
    f.avatar.showEmote('heart', 2);
    this.audio.meow(f.spec.voicePitch, 0.3);
  }

  // ——— pushable toy balls ———

  private spawnToys() {
    const colors: [string, string][] = [['#e05d7e', '#f5efe6'], ['#2980b9', '#f5efe6'], ['#5c7a3f', '#f5d76e']];
    const camp = this.world.playerCamp;
    for (let i = 0; i < 3; i++) {
      const tex = this.world.paintYarnTexture(colors[i][0], colors[i][1]);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 14, 10),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })
      );
      mesh.castShadow = true;
      const a = i * 2.1 + 0.7;
      const x = camp.x + Math.cos(a) * (4 + i);
      const z = camp.z + Math.sin(a) * (4 + i);
      mesh.position.set(x, this.world.heightAt(x, z) + 0.34, z);
      this.scene.add(mesh);
      this.toys.push({ mesh, x, z, y: 0, vx: 0, vz: 0 });
    }
  }

  private updateToys(dt: number) {
    for (const t of this.toys) {
      // player bumps the ball — pounces send it flying
      const d = Math.hypot(t.x - this.px, t.z - this.pz);
      if (d < 0.85) {
        const push = this.busyKind === 'pounce' ? 9 : Math.max(2, this.player.moveSpeed * 1.4);
        const a = Math.atan2(t.x - this.px, t.z - this.pz);
        t.vx = Math.sin(a) * push;
        t.vz = Math.cos(a) * push;
        if (push > 3) this.audio.uiTick();
      }
      // kittens chase the ball a little (pure charm)
      const speed = Math.hypot(t.vx, t.vz);
      if (speed > 0.05) {
        // rolls downhill
        const gx = (this.world.heightAt(t.x + 0.5, t.z) - this.world.heightAt(t.x - 0.5, t.z)) * 2;
        const gz = (this.world.heightAt(t.x, t.z + 0.5) - this.world.heightAt(t.x, t.z - 0.5)) * 2;
        t.vx -= gx * dt * 2;
        t.vz -= gz * dt * 2;
        const fr = Math.max(0, 1 - dt * 1.4);
        t.vx *= fr;
        t.vz *= fr;
        const nx = t.x + t.vx * dt;
        const nz = t.z + t.vz * dt;
        const solved = this.world.collide(nx, nz, 0.34, t.y);
        if (Math.abs(solved.x - nx) > 0.001) t.vx *= -0.55;
        if (Math.abs(solved.z - nz) > 0.001) t.vz *= -0.55;
        t.x = solved.x;
        t.z = solved.z;
        const groundY = this.world.heightAt(t.x, t.z);
        t.y = Math.max(groundY, WATER_LEVEL - 0.1); // floats in water
        t.mesh.position.set(t.x, t.y + 0.34, t.z);
        t.mesh.rotation.x += t.vz * dt * 3;
        t.mesh.rotation.z -= t.vx * dt * 3;
      }
    }
  }

  // ——— kitten tree rescue ———

  private spawnRescue() {
    let tree: TreeInfo | null = null;
    for (let i = 0; i < 60; i++) {
      const cand = this.world.trees[(Math.random() * this.world.trees.length) | 0];
      if (!cand) return;
      const d = Math.hypot(cand.x - this.px, cand.z - this.pz);
      if (d > 40 && d < 130 && this.world.heightAt(cand.x, cand.z) > 1) { tree = cand; break; }
    }
    if (!tree) return;
    const spec = generateKitten(Date.now() % 999999937);
    const avatar = new CatAvatar(spec, { kitten: true });
    // cling to the trunk BELOW the canopy so the kitten is actually visible
    // (the leaves used to swallow them — great catch, Lennon)
    const baseY = this.world.heightAt(tree.x, tree.z);
    const perchY = baseY + tree.trunkH * 0.42;
    const outAngle = Math.random() * Math.PI * 2;
    avatar.root.position.set(
      tree.x + Math.cos(outAngle) * (tree.r + 0.5),
      perchY,
      tree.z + Math.sin(outAngle) * (tree.r + 0.5)
    );
    avatar.root.rotation.y = outAngle + Math.PI / 2;
    avatar.setAction('climb');
    avatar.showEmote('drop', 4);
    this.scene.add(avatar.root);
    this.rescue = { tree, spec, avatar, meowT: 1.5, perchY };
    this.toast('You hear tiny meows… a kitten is stuck in a tree! Follow the 🐱 arrow!');
  }

  private updateRescue(dt: number) {
    if (!this.rescue) {
      if (this.elapsed > this.nextRescueAt && this.save.kittens.length < 12 && !this.challenge && !this.duel) {
        this.spawnRescue();
      }
      return;
    }
    const r = this.rescue;
    r.avatar.update(dt, this.elapsed);
    r.meowT -= dt;
    const d = Math.hypot(r.tree.x - this.px, r.tree.z - this.pz);
    if (r.meowT <= 0) {
      r.meowT = 3.4;
      this.audio.meow(r.spec.voicePitch, Math.max(0.08, Math.min(0.7, 1.5 - d / 60)));
      r.avatar.meow();
      r.avatar.showEmote('drop', 2);
      if (d < 25) this.burst(r.avatar.root.position.x, r.perchY + 0.5, r.avatar.root.position.z, '#ffd54a', 5);
    }
    // rescued when the player climbs up close to it
    if (this.climbing && this.climbing.tree.id === r.tree.id) {
      const baseY = this.world.heightAt(r.tree.x, r.tree.z);
      if (baseY + this.climbing.h > r.perchY - 0.9) this.completeRescue();
    }
  }

  private completeRescue() {
    const r = this.rescue;
    if (!r) return;
    this.rescue = null;
    this.scene.remove(r.avatar.root);
    r.avatar.dispose();
    this.save.kittens.push(r.spec);
    this.nextRescueAt = this.elapsed + 110 + Math.random() * 90;
    this.audio.catJoin();
    this.burst(r.tree.x, r.perchY, r.tree.z, '#ffd54a', 22);
    const following = this.save.kittens.length <= 5;
    this.events.onCelebrate(
      'recruit',
      following
        ? `You rescued ${r.spec.name}! The kitten will follow you everywhere 🐾`
        : `You rescued ${r.spec.name}! They'll play safe at your camp 🏕`
    );
    this.syncKittens();
    this.persist();
    this.events.onSaveChanged();
  }

  // ——— input API (called from React) ———

  setJoystick(x: number, y: number) {
    this.joyX = x;
    this.joyY = y;
  }

  camDrag(dx: number, dy: number) {
    this.camYaw -= dx * 0.006;
    this.camPitch = Math.max(-0.1, Math.min(1.1, this.camPitch + dy * 0.005));
  }

  pinchZoom(factor: number) {
    this.camDist = Math.max(3.5, Math.min(14, this.camDist / factor));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.key.toLowerCase());
    if (e.key === ' ') { this.pressJump(); e.preventDefault(); }
    if (e.key.toLowerCase() === 'e') this.pressAction();
    if (e.key.toLowerCase() === 'm') this.pressMeow();
    if (e.key.toLowerCase() === 'q') this.toggleSneak();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  toggleSneak() {
    this.sneaking = !this.sneaking;
    this.emitHud(true);
  }

  pressJump() {
    this.unlockAudio();
    if (this.duel || this.challenge?.phase === 'offer') return;
    if (this.climbing) {
      // leap off the tree
      const t = this.climbing;
      this.climbing = null;
      this.vy = 5.5;
      this.px += Math.cos(this.heading) * -0.1;
      const away = Math.atan2(this.pz - t.tree.z, this.px - t.tree.x);
      this.px = t.tree.x + Math.cos(away) * (t.tree.r + 0.8);
      this.pz = t.tree.z + Math.sin(away) * (t.tree.r + 0.8);
      this.audio.jump();
      return;
    }
    if (this.grounded && !this.swimming && this.busyT <= 0) {
      this.vy = 8.6;
      this.grounded = false;
      this.audio.jump();
      this.player.setAction('jump');
    }
  }

  pressMeow() {
    this.unlockAudio();
    const spec = this.player.spec;
    this.player.meow();
    this.player.showEmote('music', 1.2);
    this.audio.meow(spec.voicePitch);
    // nearby cats meow back (staggered) — and the hiding kitten answers loudly
    let delay = 500;
    for (const r of this.rivals) {
      if (Math.hypot(r.x - this.px, r.z - this.pz) < 14) {
        const rr = r;
        setTimeout(() => {
          if (this.disposed) return;
          this.audio.meow(rr.spec.voicePitch, 0.3);
          rr.avatar.meow();
        }, delay);
        delay += 400;
      }
    }
    if (this.hideKitten) {
      const d = Math.hypot(this.hideKitten.x - this.px, this.hideKitten.z - this.pz);
      const vol = Math.max(0.1, Math.min(0.9, 1.6 - d / 45));
      setTimeout(() => {
        if (this.disposed) return;
        this.audio.meow(1.5, vol);
      }, 700);
    }
    // follower kittens squeak back, one after another
    this.followers.forEach((f, i) => {
      setTimeout(() => {
        if (this.disposed) return;
        f.avatar.meow();
        this.audio.meow(f.spec.voicePitch, 0.22);
      }, 650 + i * 380);
    });
  }

  pressAction() {
    this.unlockAudio();
    if (this.busyT > 0 || this.duel) return;
    const ctx = this.context;
    if (!ctx) {
      // free pounce (for fun / catching critters mid-sneak)
      this.doPounce();
      return;
    }
    switch (ctx.kind) {
      case 'yarn': case 'golden': break; // proximity auto-collects; action not needed
      case 'dig': this.doDig(ctx.id); break;
      case 'climb': this.startClimb(ctx.id); break;
      case 'scratch': this.doScratch(ctx.id); break;
      case 'duel': this.startDuel(ctx.id); break;
      case 'prey': this.doPounce(); break;
      case 'agility': this.startAgility(); break;
      case 'rescue': this.startClimb(ctx.id); break;
      case 'love': this.tryLove(ctx.id); break;
      case 'nurse': this.startNursing(); break;
      case 'stray': this.joinStray(); break;
      case 'pickup': this.pickUpKitten(ctx.id); break;
      case 'setdown': this.setDownKitten(); break;
    }
  }

  // ——— actions ———

  private doPounce() {
    if (!this.grounded || this.swimming || this.climbing) return;
    this.busyT = 0.55;
    this.busyKind = 'pounce';
    this.player.setAction('pounce');
    this.audio.pounce();
    const dir = this.lastMoveDir;
    this.pounceVel = { x: dir.x * 7, z: dir.z * 7 };
    this.vy = 3.4;
    this.grounded = false;
    // resolve catch on landing
    this.busyPayload = () => {
      for (const c of this.world.critters) {
        if (c.state === 'gone' || c.state === 'caught') continue;
        if (Math.hypot(c.x - this.px, c.z - this.pz) < 1.5) {
          this.world.catchCritter(c);
          this.save.treats += 1;
          this.addXp(4);
          this.audio.treatFound();
          this.burst(this.px, this.py + 0.5, this.pz, '#f5d76e', 12);
          this.toast(c.kind === 'mouse' ? 'Caught a mouse! +1 treat 🐭' : c.kind === 'bird' ? 'Caught a bird! +1 treat 🐦' : 'Caught a butterfly! +1 treat 🦋');
          this.persist();
          return;
        }
      }
    };
  }

  private doDig(moundId: string) {
    const mound = this.world.digMounds.find((mn) => mn.id === moundId);
    if (!mound || mound.dug) return;
    this.busyT = 1.3;
    this.busyKind = 'dig';
    this.player.setAction('dig');
    this.audio.dig();
    const digInterval = setInterval(() => {
      if (this.disposed) { clearInterval(digInterval); return; }
      this.audio.dig();
      this.burst(mound.x, this.py + 0.2, mound.z, '#8a6a48', 6);
    }, 300);
    this.busyPayload = () => {
      clearInterval(digInterval);
      mound.dug = true;
      mound.mesh.visible = false;
      const roll = hash2(Math.round(mound.x), Math.round(mound.z), this.save.wave + this.save.totalYarn);
      if (roll < 0.5) {
        this.save.yarn += 1;
        this.save.totalYarn += 1;
        this.addXp(2);
        this.audio.yarnPickup();
        this.burst(mound.x, this.py + 0.5, mound.z, '#e05d7e', 14);
        this.toast('Dug up a yarn ball! 🧶');
      } else if (roll < 0.85) {
        this.save.treats += 1;
        this.addXp(2);
        this.audio.treatFound();
        this.burst(mound.x, this.py + 0.5, mound.z, '#f5d76e', 10);
        this.toast('Found a crunchy treat! 🍪');
      } else {
        this.toast('Just dirt... but digging is still fun!');
      }
      this.persist();
      this.events.onSaveChanged();
    };
  }

  private doScratch(id: string) {
    this.busyT = 1.4;
    this.busyKind = 'scratch';
    this.player.setAction('scratch');
    const scratchInterval = setInterval(() => {
      if (this.disposed) { clearInterval(scratchInterval); return; }
      this.audio.scratch();
    }, 350);
    const isPost = id.startsWith('b_') || this.world.scratchSpots.some((s) => s.id === id);
    this.busyPayload = () => {
      clearInterval(scratchInterval);
      this.addXp(1);
      const spec = this.player.spec;
      if (isPost && spec.traits.strength < 10 && Math.random() < 0.3) {
        spec.traits.strength += 1;
        this.toast(`${spec.name} feels stronger! 💪 Strength ${spec.traits.strength}`);
        this.audio.levelUp();
      } else {
        this.toast('Sharp claws! ✨');
      }
      this.persist();
      this.events.onSaveChanged();
    };
  }

  private startClimb(treeId: string) {
    const tree = this.world.trees.find((t) => t.id === treeId);
    if (!tree) return;
    this.climbing = { tree, h: Math.max(0.5, this.py - this.world.heightAt(tree.x, tree.z)) };
    this.player.setAction('climb');
    this.audio.climbGrip();
    this.tutorialOnce('climb', 'Push up on the joystick to climb — jump to leap off!');
  }

  // ——— duels ———

  private startDuel(rivalCatId: string) {
    const rival = this.rivals.find((r) => r.spec.id === rivalCatId);
    if (!rival || this.duel) return;
    this.duelRival = rival;
    rival.state = 'facing';
    const clan = RIVAL_CLANS.find((c) => c.id === rival.clanId)!;
    const stake = this.save.yarn >= 1 && (this.save.rivals[rival.clanId]?.yarn ?? 0) >= 1;
    const strength = rival.spec.traits.strength + rival.level;
    this.duel = {
      rivalCat: rival.spec,
      rivalClanName: clan.name,
      kind: 'pounce',
      round: 0,
      playerScore: 0,
      rivalScore: 0,
      stake,
      markerSpeed: 1.1 + strength * 0.06,
      zoneSize: Math.max(0.18, 0.34 - this.player.spec.traits.strength * 0.008),
      results: [],
      phase: 'choose',
    };
    this.mode = 'duel';
    this.duelMarker = 0;
    this.duelDir = 1;
    this.duelTimer = 0;
    this.audio.duelWhoosh();
    this.events.onDuel(this.duel);
    this.emitHud(true);
  }

  /** the challenger picks the game: classic pounce or a hopscotch race */
  chooseDuelKind(kind: 'pounce' | 'hopscotch') {
    if (!this.duel || this.duel.phase !== 'choose') return;
    this.duel.kind = kind;
    this.duel.phase = 'intro';
    this.duelTimer = 1.5;
    if (kind === 'hopscotch') this.buildHopscotch();
    this.events.onDuel({ ...this.duel });
  }

  // ——— hopscotch race ———

  private hopPre = { x: 0, z: 0 };

  private buildHopscotch() {
    const r = this.duelRival!;
    this.hopPre = { x: this.px, z: this.pz };
    const midX = (this.px + r.x) / 2;
    const midZ = (this.pz + r.z) / 2;
    // court runs toward the island centre (keeps it on land)
    let dirX = -midX, dirZ = -midZ;
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl; dirZ /= dl;
    const perpX = -dirZ, perpZ = dirX;

    const nRows = 8 + Math.min(5, r.level);
    const rows: number[] = [];
    for (let i = 0; i < nRows; i++) rows.push(1 + ((Math.random() * 4) | 0));

    // the court is a FLAT floating game board — terrain never hides a square
    let courtY = -999;
    for (let i = 0; i <= nRows + 1; i++) {
      for (const lane of [-1, 0, 1]) {
        const sx = midX + dirX * i * 2.1 + perpX * lane * 3.6;
        const sz = midZ + dirZ * i * 2.1 + perpZ * lane * 3.6;
        courtY = Math.max(courtY, this.world.heightAt(sx, sz));
      }
    }
    courtY += 1.0;

    const meshes: THREE.Object3D[] = [];
    const yawRot = Math.atan2(dirX, dirZ);
    const courtLen = (nRows + 2.5) * 2.1;

    // the board itself
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(13.8, 0.35, courtLen),
      new THREE.MeshStandardMaterial({ color: '#7ba05b', roughness: 0.95 })
    );
    slab.position.set(
      midX + dirX * (courtLen / 2 + 0.4),
      courtY - 0.22,
      midZ + dirZ * (courtLen / 2 + 0.4)
    );
    slab.rotation.y = yawRot;
    slab.castShadow = true;
    this.scene.add(slab);
    meshes.push(slab);

    const sqGeo = new THREE.BoxGeometry(1.45, 0.12, 1.45);
    const rowSquares: THREE.Mesh[][] = [];
    for (const lane of [-1, 1]) {
      for (let i = 0; i <= nRows; i++) {
        const cx = midX + dirX * (i + 1) * 2.1 + perpX * lane * 3.6;
        const cz = midZ + dirZ * (i + 1) * 2.1 + perpZ * lane * 3.6;
        const k = i === nRows ? 1 : rows[i];
        const rowList: THREE.Mesh[] = [];
        for (let s = 0; s < k; s++) {
          const off = (s - (k - 1) / 2) * 1.62;
          // own material per square so the active row can glow
          const mat = new THREE.MeshStandardMaterial({
            color: i === nRows ? '#e8c34a' : (i + s) % 2 ? '#fdf6ea' : '#f2d9b8',
            roughness: 0.75,
          });
          const sq = new THREE.Mesh(sqGeo, mat);
          sq.position.set(cx + perpX * off, courtY, cz + perpZ * off);
          sq.rotation.y = yawRot;
          this.scene.add(sq);
          meshes.push(sq);
          rowList.push(sq);
        }
        if (lane === -1) rowSquares.push(rowList); // player lane, for highlighting
      }
    }

    // golden arrow bouncing over the row you're counting
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.0, 4),
      new THREE.MeshStandardMaterial({ color: '#e8c34a', emissive: '#c99a1e', emissiveIntensity: 0.9, roughness: 0.5 })
    );
    marker.rotation.x = Math.PI; // point down at the row
    this.scene.add(marker);
    meshes.push(marker);

    // rival difficulty: faster at higher levels, but always beatable by a kid
    const rivalInterval = Math.max(1.05, 1.8 - r.level * 0.12);
    this.hop = {
      rows, playerRow: 0, rivalRow: 0,
      lockT: 0, rivalT: 0, rivalInterval,
      origin: { x: midX, z: midZ, dirX, dirZ },
      courtY,
      meshes,
      rowSquares,
      marker,
      playerHopT: 0, rivalHopT: 0,
    };
    this.duel!.hs = { rows, playerRow: 0, rivalRow: 0, locked: false };

    // snap straight to the top-down view — no drifting through the sky
    const startX = midX + dirX * 0.55 * 2.1 - perpX * 3.6;
    const startZ = midZ + dirZ * 0.55 * 2.1 - perpZ * 3.6;
    this.camera.position.set(startX - dirX * 2.9, courtY + 11.5, startZ - dirZ * 2.9);
    this.camera.lookAt(startX + dirX * 1.3, courtY, startZ + dirZ * 1.3);
  }

  /** kid taps 1-4 — must match the number of squares in the next row */
  hopscotchTap(n: number) {
    const h = this.hop;
    const d = this.duel;
    if (!h || !d || d.phase !== 'aim' || h.lockT > 0 || h.playerHopT > 0) return;
    if (h.playerRow >= h.rows.length) return;
    if (n === h.rows[h.playerRow]) {
      h.playerRow++;
      h.playerHopT = 0.4;
      this.player.setAction('jump');
      this.audio.jump();
      this.audio.uiTick();
    } else {
      h.lockT = 0.85;
      this.player.showEmote('?', 1);
      this.audio.land();
    }
  }

  private updateHopscotch(dt: number) {
    const h = this.hop;
    const d = this.duel;
    if (!h || !d) return;
    h.lockT = Math.max(0, h.lockT - dt);
    h.playerHopT = Math.max(0, h.playerHopT - dt);
    h.rivalHopT = Math.max(0, h.rivalHopT - dt);

    // rival hops on a timer with the occasional flub
    if (h.rivalRow <= h.rows.length) {
      h.rivalT += dt;
      if (h.rivalT >= h.rivalInterval) {
        h.rivalT = 0;
        if (Math.random() < 0.12) {
          this.duelRival?.avatar.showEmote('?', 1);
          h.rivalT = -0.9; // stumbled
        } else {
          h.rivalRow++;
          h.rivalHopT = 0.4;
          this.duelRival?.avatar.setAction('jump');
        }
      }
    }

    // move the cats along their lanes — on the flat board, never in the dirt
    const o = h.origin;
    const perpX = -o.dirZ, perpZ = o.dirX;
    const place = (row: number, hopT: number, lane: number, isPlayer: boolean) => {
      const along = (row + 0.55) * 2.1;
      const tx = o.x + o.dirX * along + perpX * lane * 3.6;
      const tz = o.z + o.dirZ * along + perpZ * lane * 3.6;
      const arc = hopT > 0 ? Math.sin((1 - hopT / 0.4) * Math.PI) * 0.7 : 0;
      if (isPlayer) {
        this.px += (tx - this.px) * Math.min(1, dt * 9);
        this.pz += (tz - this.pz) * Math.min(1, dt * 9);
        this.py = h.courtY + 0.06 + arc;
        this.heading = Math.atan2(o.dirX, o.dirZ);
        if (hopT <= 0 && this.player.action === 'jump') this.player.setAction('idle');
        this.applyAvatarTransform();
      } else {
        const r = this.duelRival!;
        r.x += (tx - r.x) * Math.min(1, dt * 9);
        r.z += (tz - r.z) * Math.min(1, dt * 9);
        r.y = h.courtY + 0.06 + arc;
        r.heading = Math.atan2(o.dirX, o.dirZ);
        r.avatar.root.position.set(r.x, r.y, r.z);
        r.avatar.root.rotation.y = r.heading;
        if (hopT <= 0 && r.avatar.action === 'jump') r.avatar.setAction('idle');
      }
    };
    place(h.playerRow, h.playerHopT, -1, true);
    place(h.rivalRow, h.rivalHopT, 1, false);

    // highlight the row being counted: golden pulse + bouncing arrow above it
    const pulse = 0.35 + Math.abs(Math.sin(this.elapsed * 4)) * 0.5;
    for (let i = 0; i < h.rowSquares.length; i++) {
      for (const sq of h.rowSquares[i]) {
        const mat = sq.material as THREE.MeshStandardMaterial;
        if (i === h.playerRow) {
          mat.emissive.set('#e8a020');
          mat.emissiveIntensity = pulse;
        } else if (mat.emissiveIntensity !== 0) {
          mat.emissive.set('#000000');
          mat.emissiveIntensity = 0;
        }
        // completed rows fade back into the board
        if (i < h.playerRow && (mat.color.r > 0.7 || mat.color.g > 0.6)) mat.color.set('#a8b98c');
      }
    }
    if (h.marker && h.playerRow < h.rows.length) {
      const along = (h.playerRow + 1) * 2.1;
      h.marker.position.set(
        o.x + o.dirX * along - perpX * 3.6,
        h.courtY + 1.6 + Math.abs(Math.sin(this.elapsed * 5)) * 0.45,
        o.z + o.dirZ * along - perpZ * 3.6
      );
      h.marker.rotation.y = this.elapsed * 2;
    } else if (h.marker) {
      h.marker.visible = false;
    }

    d.hs = { rows: h.rows, playerRow: h.playerRow, rivalRow: h.rivalRow, locked: h.lockT > 0 };

    // first to hop past the last row wins
    if (h.playerRow > h.rows.length - 1 || h.rivalRow > h.rows.length - 1) {
      d.phase = 'done';
      d.won = h.playerRow > h.rivalRow || (h.playerRow === h.rivalRow && Math.random() < 0.5);
      this.resolveDuel(d);
      this.events.onDuel({ ...d });
      return;
    }
    this.events.onDuel({ ...d });
  }

  private cleanupHopscotch() {
    if (!this.hop) return;
    for (const msh of this.hop.meshes) this.scene.remove(msh);
    this.px = this.hopPre.x;
    this.pz = this.hopPre.z;
    this.py = this.world.heightAt(this.px, this.pz);
    this.hop = null;
  }

  /** live marker position 0..1 — React polls this with rAF while the duel bar is up */
  getDuelMarker(): number {
    return this.duelMarker;
  }

  /** the tap in the pounce-duel minigame */
  duelTap() {
    if (!this.duel || this.duel.phase !== 'aim') return;
    const d = this.duel;
    // accuracy: 1 at center of bar, 0 at edges
    const playerAcc = Math.max(0, 1 - Math.abs(this.duelMarker - 0.5) * 2);
    // rival roll: strength-informed
    const str = (d.rivalCat.traits.strength + (this.duelRival?.level ?? 1)) / 16;
    const rivalAcc = Math.min(1, Math.max(0.05, str * 0.55 + Math.random() * 0.5));
    d.results.push({ player: playerAcc, rival: rivalAcc });
    if (playerAcc > rivalAcc) d.playerScore++;
    else if (rivalAcc > playerAcc) d.rivalScore++;
    d.phase = 'reveal';
    this.duelTimer = 1.4;
    this.audio.pounce();
    this.player.setAction('pounce');
    this.duelRival?.avatar.setAction('pounce');
    this.events.onDuel({ ...d });
  }

  private updateDuel(dt: number) {
    if (!this.duel) return;
    const d = this.duel;
    if (d.phase === 'choose') return; // waiting for the kid to pick a game
    this.duelTimer -= dt;

    if (d.kind === 'hopscotch') {
      if (d.phase === 'intro' && this.duelTimer <= 0) {
        d.phase = 'aim';
        this.events.onDuel({ ...d });
      } else if (d.phase === 'aim') {
        this.updateHopscotch(dt);
      }
      return;
    }

    if (d.phase === 'intro' && this.duelTimer <= 0) {
      d.phase = 'aim';
      this.duelMarker = 0;
      this.duelDir = 1;
      this.events.onDuel({ ...d });
    } else if (d.phase === 'aim') {
      this.duelMarker += this.duelDir * d.markerSpeed * dt;
      if (this.duelMarker > 1) { this.duelMarker = 1; this.duelDir = -1; }
      if (this.duelMarker < 0) { this.duelMarker = 0; this.duelDir = 1; }
    } else if (d.phase === 'reveal' && this.duelTimer <= 0) {
      d.round++;
      if (d.round >= 3 || d.playerScore === 2 || d.rivalScore === 2) {
        d.phase = 'done';
        d.won = d.playerScore > d.rivalScore || (d.playerScore === d.rivalScore && Math.random() < 0.5);
        this.resolveDuel(d);
      } else {
        d.phase = 'aim';
        this.duelMarker = 0;
      }
      this.events.onDuel({ ...d });
    }
  }

  private resolveDuel(d: DuelState) {
    const rival = this.duelRival!;
    const spec = this.player.spec;
    const clanState = this.save.rivals[rival.clanId] ?? { yarn: 5, records: {} };
    this.save.rivals[rival.clanId] = clanState;
    const rec = clanState.records[rival.spec.id] ?? { wins: 0, losses: 0 };
    clanState.records[rival.spec.id] = rec;

    if (d.won) {
      spec.wins++;
      rec.losses++;
      this.addXp(6);
      if (d.stake) {
        this.save.yarn++;
        this.save.totalYarn++;
        clanState.yarn = Math.max(0, clanState.yarn - 1);
      }
      this.audio.success();
      rival.avatar.showEmote('drop', 2);
    } else {
      spec.losses++;
      rec.wins++;
      this.addXp(2);
      if (d.stake) {
        this.save.yarn = Math.max(0, this.save.yarn - 1);
        clanState.yarn++;
      }
      this.audio.sadTrombone();
      this.player.showEmote('drop', 2);
      rival.avatar.showEmote('heart', 2);
    }
    this.checkRankUp(spec);

    // beat the same cat twice and it's so impressed it joins your clan
    if (d.won && rec.losses >= 2 && !rec.recruited) {
      const cap = clanCapacity(this.save.buildings);
      if (this.save.cats.length < cap) {
        rec.recruited = true;
        d.recruited = true;
        const spec2 = rival.spec;
        spec2.clanId = 'player';
        this.save.cats.push(spec2);
        // remove them from the rival roster (their clan sends a new cat later)
        this.scene.remove(rival.avatar.root);
        this.rivals = this.rivals.filter((rv) => rv !== rival);
        this.audio.catJoin();
        this.events.onCelebrate('recruit', `${spec2.name} is so impressed, they're joining ${this.save.clanName}! No more fighting — they'll help babysit at camp. 🤝`);
        this.syncFamily();
      } else {
        this.toast(`${rival.spec.name} wants to join your clan — build another den to make room!`);
      }
    }

    this.persist();
    this.events.onSaveChanged();
  }

  /** UI closes the duel overlay */
  endDuel() {
    this.cleanupHopscotch();
    this.duel = null;
    if (this.duelRival) {
      this.duelRival.state = 'wander';
      this.duelRival.stateT = 0;
      this.duelRival = null;
    }
    this.mode = 'explore';
    this.events.onDuel(null);
    this.emitHud(true);
  }

  // ——— challenges (golden yarn) ———

  private offerChallenge(goldenId: string) {
    const kinds = ['race', 'yarnrush', 'hideseek', 'agility'] as const;
    const kind = kinds[Math.abs(hash2(goldenId.length, this.save.goldenDone.length, this.save.seed) * 4) | 0] ?? 'yarnrush';
    const titles: Record<string, [string, string, number, number]> = {
      race: ['The Great Race! 🏁', 'A rival racer appears! Reach the glowing beacon before they do.', 90, 1],
      yarnrush: ['Yarn Rush! 🧶', 'Collect 5 yarn balls before time runs out!', 75, 5],
      hideseek: ['Lost Kitten! 🔍', 'A kitten is hiding somewhere nearby. Meow to hear it answer — find it in time!', 90, 1],
      agility: ['Trial of Paws! ⚡', 'Run the agility course and beat the par time!', 120, 1],
    };
    const [title, desc, timeLimit, goal] = titles[kind];
    this.challenge = {
      kind, goldenId, title, desc, timeLimit, t: 0, progress: 0, goal, phase: 'offer',
    };
    this.events.onChallenge({ ...this.challenge });
  }

  acceptChallenge() {
    if (!this.challenge || this.challenge.phase !== 'offer') return;
    const c = this.challenge;
    c.phase = 'running';
    c.t = 0;
    this.challengeStartYarn = this.save.totalYarn;

    if (c.kind === 'race') {
      // beacon at a far land point
      const rng = mulberry32(this.save.seed + this.save.goldenDone.length * 7);
      let bx = 0, bz = 0;
      for (let i = 0; i < 30; i++) {
        const a = rng() * Math.PI * 2;
        const dd = 60 + rng() * 60;
        bx = this.px + Math.cos(a) * dd;
        bz = this.pz + Math.sin(a) * dd;
        if (this.world.heightAt(bx, bz) > 1.5) break;
      }
      this.spawnBeacon(bx, bz);
      // racer rival
      const spec = generateCat(Date.now() % 100000, 'maple', {});
      const avatar = new CatAvatar(spec);
      avatar.root.position.set(this.px + 2, this.py, this.pz + 2);
      this.scene.add(avatar.root);
      this.racerCat = { avatar, x: this.px + 2, z: this.pz + 2, progress: 0, speed: 4.2 + Math.random() * 0.6 };
    } else if (c.kind === 'hideseek') {
      // kitten hides behind a far tree
      const trees = this.world.trees;
      let best: TreeInfo | null = null;
      for (let i = 0; i < 40; i++) {
        const t = trees[(Math.random() * trees.length) | 0];
        const dd = Math.hypot(t.x - this.px, t.z - this.pz);
        if (dd > 40 && dd < 90) { best = t; break; }
      }
      const t = best ?? trees[0];
      const spec = generateCat(Date.now() % 99991, 'player', {});
      spec.size = 0.7; // it's a kitten!
      const avatar = new CatAvatar(spec);
      const kx = t.x + 1.2, kz = t.z + 1.2;
      avatar.root.position.set(kx, this.world.heightAt(kx, kz), kz);
      avatar.setAction('sit');
      this.scene.add(avatar.root);
      this.hideKitten = { avatar, x: kx, z: kz, meowT: 2 };
    } else if (c.kind === 'agility') {
      this.toast('Head to the agility course — flags on your compass! 🚩');
      this.spawnBeacon(this.world.agilityGates[0].x, this.world.agilityGates[0].z);
    }
    this.events.onChallenge({ ...c });
    this.emitHud(true);
  }

  declineChallenge() {
    if (!this.challenge) return;
    // golden yarn stays "done" — but grant consolation yarn
    this.save.yarn += 2;
    this.save.totalYarn += 2;
    this.toast('The golden yarn unravels into 2 normal yarn. 🧶🧶');
    this.challenge = null;
    this.events.onChallenge(null);
    this.persist();
    this.events.onSaveChanged();
  }

  dismissChallenge() {
    this.challenge = null;
    this.events.onChallenge(null);
  }

  private spawnBeacon(x: number, z: number) {
    this.removeBeacon();
    const g = new THREE.Group();
    const y = this.world.heightAt(x, z);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.4, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.set(x, y + 13, z);
    g.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.2, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ffb830' })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.3, z);
    g.add(ring);
    g.userData = { x, z };
    this.scene.add(g);
    this.challengeBeacon = g;
  }

  private removeBeacon() {
    if (this.challengeBeacon) {
      this.scene.remove(this.challengeBeacon);
      this.challengeBeacon = null;
    }
  }

  private updateChallenge(dt: number) {
    const c = this.challenge;
    if (!c || c.phase !== 'running') return;
    c.t += dt;

    if (c.kind === 'yarnrush') {
      c.progress = this.save.totalYarn - this.challengeStartYarn;
    } else if (c.kind === 'race' && this.racerCat && this.challengeBeacon) {
      const r = this.racerCat;
      const { x, z } = this.challengeBeacon.userData as { x: number; z: number };
      const d = Math.hypot(x - r.x, z - r.z);
      if (d > 2) {
        // rival takes a curvy path with random dawdles (fair for kids)
        let dawdle = Math.sin(c.t * 0.7) > 0.55 ? 0.25 : 1;
        // rubber-band: if it's way ahead of you, it stops to sniff flowers
        const pd0 = Math.hypot(x - this.px, z - this.pz);
        if (pd0 - d > 16) dawdle *= 0.4;
        const a = Math.atan2(z - r.z, x - r.x) + Math.sin(c.t * 1.3) * 0.4;
        const gy = this.world.heightAt(r.x, r.z);
        const inWater = WATER_LEVEL - gy > 0.5;
        // it has to actually swim — no sprinting along the lake bottom!
        const speedEff = r.speed * dawdle * (inWater ? 0.32 : 1);
        r.x += Math.cos(a) * speedEff * dt;
        r.z += Math.sin(a) * speedEff * dt;
        const gy2 = this.world.heightAt(r.x, r.z);
        const swimming = WATER_LEVEL - gy2 > 0.5;
        r.avatar.root.position.set(r.x, swimming ? WATER_LEVEL - 0.2 : gy2, r.z);
        r.avatar.root.rotation.y = -a + Math.PI / 2;
        r.avatar.setAction(swimming ? 'swim' : 'run');
        r.avatar.moveSpeed = speedEff;
      } else {
        this.failChallenge('The rival racer got there first! Rematch anytime.');
        return;
      }
      const pd = Math.hypot(x - this.px, z - this.pz);
      if (pd < 3) { this.winChallenge(); return; }
    } else if (c.kind === 'hideseek' && this.hideKitten) {
      const k = this.hideKitten;
      k.meowT -= dt;
      if (k.meowT <= 0) {
        k.meowT = 3.2;
        const d = Math.hypot(k.x - this.px, k.z - this.pz);
        const vol = Math.max(0.06, Math.min(0.8, 1.4 - d / 50));
        this.audio.meow(1.5, vol);
        if (d < 15) this.burst(k.x, this.world.heightAt(k.x, k.z) + 1.2, k.z, '#ffd54a', 4);
      }
      if (Math.hypot(k.x - this.px, k.z - this.pz) < 2.2) { this.winChallenge(); return; }
    } else if (c.kind === 'agility') {
      // won via agility finish hook
      if (this.agility.running) c.desc = 'Course started — go go go!';
    }

    if (c.progress >= c.goal && c.kind === 'yarnrush') { this.winChallenge(); return; }
    if (c.t > c.timeLimit) {
      this.failChallenge('Time ran out — but that golden yarn was still lucky!');
      return;
    }
    // stream timer to UI (throttled by HUD cadence below)
  }

  private winChallenge() {
    const c = this.challenge;
    if (!c) return;
    c.phase = 'won';
    this.save.goldenDone.push(c.goldenId);
    this.cleanupChallengeActors();
    const cap = clanCapacity(this.save.buildings);
    if (this.save.cats.length < cap) {
      const newCat = generateCat(Date.now() % 999983, 'player', { rarePattern: true, minStat: 3 });
      c.rewardCat = newCat;
      this.save.cats.push(newCat);
      this.audio.catJoin();
      this.events.onCelebrate('recruit', `${newCat.name} joins ${this.save.clanName}! 🎉`);
    } else {
      this.save.yarn += 8;
      this.save.totalYarn += 8;
      this.audio.fanfare();
      this.toast('Clan den is full — the wanderer gifts you 8 yarn instead! Build a den for more room.');
    }
    this.addXp(10);
    this.persist();
    this.events.onSaveChanged();
    this.events.onChallenge({ ...c });
  }

  private failChallenge(msg: string) {
    const c = this.challenge;
    if (!c) return;
    c.phase = 'lost';
    this.save.goldenDone.push(c.goldenId);
    this.save.yarn += 1;
    this.save.totalYarn += 1;
    this.cleanupChallengeActors();
    this.audio.sadTrombone();
    this.toast(msg + ' +1 yarn for trying!');
    this.persist();
    this.events.onSaveChanged();
    this.events.onChallenge({ ...c });
  }

  private cleanupChallengeActors() {
    this.removeBeacon();
    if (this.racerCat) {
      this.scene.remove(this.racerCat.avatar.root);
      this.racerCat.avatar.dispose();
      this.racerCat = null;
    }
    if (this.hideKitten) {
      this.scene.remove(this.hideKitten.avatar.root);
      this.hideKitten.avatar.dispose();
      this.hideKitten = null;
    }
  }

  // ——— agility ———

  private startAgility() {
    if (this.agility.running) return;
    this.agility = { running: true, t: 0, nextGate: 1, countdown: 3 };
    this.agilityPar = Math.max(28, 48 - this.player.spec.traits.agility * 1.6);
    this.mode = 'agility';
    this.audio.uiTick();
    this.toast('Ready... 3... 2... 1...');
    this.emitHud(true);
  }

  private updateAgility(dt: number) {
    const a = this.agility;
    if (!a.running) return;
    if (a.countdown > 0) {
      const before = Math.ceil(a.countdown);
      a.countdown -= dt;
      const after = Math.ceil(a.countdown);
      if (after < before && after > 0) this.audio.uiTick();
      if (a.countdown <= 0) {
        this.audio.success();
        this.toast('GO! 🐾');
      }
      return;
    }
    a.t += dt;
    const gates = this.world.agilityGates;
    const gate = gates[a.nextGate];
    if (!gate) return;
    // highlight ring on current gate
    this.gateRing.visible = true;
    const gy = this.world.heightAt(gate.x, gate.z);
    this.gateRing.position.set(gate.x, gy + 0.25, gate.z);
    this.gateRing.rotation.z = this.elapsed * 2;

    if (Math.hypot(gate.x - this.px, gate.z - this.pz) < 3.2) {
      a.nextGate++;
      this.audio.uiTick();
      this.burst(gate.x, gy + 0.6, gate.z, '#ffd54a', 10);
      if (a.nextGate >= gates.length) {
        // finished!
        a.running = false;
        this.gateRing.visible = false;
        this.mode = 'explore';
        const time = a.t;
        const spec = this.player.spec;
        const beat = time <= this.agilityPar;
        if (spec.bestAgility === null || time < spec.bestAgility) spec.bestAgility = Math.round(time * 10) / 10;
        if (beat) {
          spec.level++;
          spec.xp = 0;
          this.bumpRandomStat(spec);
          this.audio.levelUp();
          this.events.onCelebrate('levelup', `${spec.name} beat the course in ${time.toFixed(1)}s — LEVEL UP! Now level ${spec.level} ⚡`);
          this.checkRankUp(spec);
        } else {
          this.addXp(4);
          this.toast(`Finished in ${time.toFixed(1)}s (par ${this.agilityPar.toFixed(0)}s). So close — try again!`);
        }
        if (this.challenge?.kind === 'agility' && this.challenge.phase === 'running') {
          if (beat) this.winChallenge();
          else this.failChallenge('Beat the par time to win the trial.');
        }
        this.persist();
        this.events.onSaveChanged();
      }
    }
  }

  cancelAgility() {
    this.agility.running = false;
    this.gateRing.visible = false;
    if (this.mode === 'agility') this.mode = 'explore';
    this.emitHud(true);
  }

  // ——— build mode ———

  enterBuildMode() {
    const d = Math.hypot(this.px - this.world.playerCamp.x, this.pz - this.world.playerCamp.z);
    if (d > 45) {
      this.toast('Build near your camp — follow the 🏕 compass home!');
      return false;
    }
    this.mode = 'build';
    this.emitHud(true);
    return true;
  }

  exitBuildMode() {
    this.clearGhost();
    this.buildSel = null;
    if (this.mode === 'build') this.mode = 'explore';
    this.emitHud(true);
  }

  selectBuildable(type: string | null) {
    this.buildSel = type;
    this.clearGhost();
    if (type) {
      // simple ghost: translucent box sized per buildable
      const g = new THREE.Group();
      const sizes: Record<string, [number, number]> = {
        den: [3.8, 2], post: [1.4, 2], tower: [2.8, 3.5], basket: [1.8, 1], flowers: [3.2, 0.6],
        lantern: [0.8, 2.4], tent: [3.8, 2.4], pond: [3.4, 0.5], banner: [1, 4.4], statue: [2.5, 2.8],
      };
      const [w, h] = sizes[type] ?? [2, 2];
      const box = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2, w / 2, h, 14),
        new THREE.MeshBasicMaterial({ color: '#6fe08c', transparent: true, opacity: 0.35, depthWrite: false })
      );
      box.position.y = h / 2;
      g.add(box);
      this.scene.add(g);
      this.buildGhost = g;
    }
  }

  private clearGhost() {
    if (this.buildGhost) {
      this.scene.remove(this.buildGhost);
      this.buildGhost = null;
    }
  }

  private updateBuildGhost() {
    if (this.mode !== 'build' || !this.buildGhost || !this.buildSel) return;
    // ghost sits in front of the cat
    const gx = this.px + this.lastMoveDir.x * 3.2;
    const gz = this.pz + this.lastMoveDir.z * 3.2;
    const gy = this.world.heightAt(gx, gz);
    this.buildGhost.position.set(gx, gy, gz);
    // validity: near camp, flat-ish, no collisions, affordable
    const nearCamp = Math.hypot(gx - this.world.playerCamp.x, gz - this.world.playerCamp.z) < 42;
    const n = this.world.normalAt(gx, gz);
    const flat = n.y > 0.93;
    const collided = this.world.collide(gx, gz, 1.6);
    const clear = Math.abs(collided.x - gx) < 0.01 && Math.abs(collided.z - gz) < 0.01;
    let clearOfBuildings = true;
    for (const b of this.save.buildings) {
      if (Math.hypot(b.x - gx, b.z - gz) < 3) { clearOfBuildings = false; break; }
    }
    const def = BUILDABLES.find((bd) => bd.id === this.buildSel);
    const affordable = !!def && this.save.yarn >= def.cost;
    this.buildValid = nearCamp && flat && clear && clearOfBuildings && affordable && gy > WATER_LEVEL + 0.4;
    const mesh = this.buildGhost.children[0] as THREE.Mesh;
    (mesh.material as THREE.MeshBasicMaterial).color.set(this.buildValid ? '#6fe08c' : '#e05d5d');
  }

  placeBuilding(): boolean {
    if (!this.buildValid || !this.buildSel || !this.buildGhost) {
      this.audio.uiTick();
      return false;
    }
    const def = BUILDABLES.find((b) => b.id === this.buildSel)!;
    const inst: BuildingInstance = {
      id: `b_${Date.now().toString(36)}`,
      type: this.buildSel,
      x: this.buildGhost.position.x,
      z: this.buildGhost.position.z,
      rot: Math.atan2(this.px - this.buildGhost.position.x, this.pz - this.buildGhost.position.z),
    };
    this.save.yarn -= def.cost;
    this.save.buildings.push(inst);
    this.world.addBuilding(inst);
    this.audio.success();
    this.burst(inst.x, this.world.heightAt(inst.x, inst.z) + 1, inst.z, '#6fe08c', 20);
    this.events.onCelebrate('build', `${def.name} built! 🔨`);
    this.persist();
    this.events.onSaveChanged();
    this.emitHud(true);
    return true;
  }

  // ——— cats / clan management (React calls these) ———

  switchCat(catId: string) {
    const spec = this.save.cats.find((c) => c.id === catId);
    if (!spec) return;
    this.save.activeCatId = catId;
    this.spawnPlayer(spec);
    this.syncFamily(); // camp clanmates change when the active cat changes
    this.persist();
    this.events.onSaveChanged();
    this.emitHud(true);
  }

  setAccessory(catId: string, acc: CatSpec['accessory']) {
    const spec = this.save.cats.find((c) => c.id === catId);
    if (!spec) return;
    spec.accessory = acc;
    if (catId === this.save.activeCatId) this.player.setAccessory(acc);
    this.persist();
    this.events.onSaveChanged();
  }

  setPattern(catId: string, pattern: CatSpec['coat']['pattern']) {
    const spec = this.save.cats.find((c) => c.id === catId);
    if (!spec) return;
    spec.coat.pattern = pattern;
    if (catId === this.save.activeCatId) this.spawnPlayer(spec);
    this.persist();
    this.events.onSaveChanged();
  }

  renameClan(name: string) {
    this.save.clanName = name.slice(0, 24) || this.save.clanName;
    this.persist();
    this.events.onSaveChanged();
  }

  setSound(on: boolean) {
    this.save.soundOn = on;
    this.audio.setSound(on);
    this.persist();
  }

  setMusic(on: boolean) {
    this.save.musicOn = on;
    this.audio.setMusic(on);
    this.persist();
  }

  feedTreat(catId: string): boolean {
    if (this.save.treats <= 0) return false;
    const spec = this.save.cats.find((c) => c.id === catId);
    if (!spec) return false;
    this.save.treats--;
    if (catId === this.save.activeCatId) {
      this.addXp(5);
      this.player.showEmote('heart', 2);
      this.audio.purr(1.2, spec.voicePitch);
    } else {
      spec.xp += 5;
      while (spec.xp >= xpForLevel(spec.level)) {
        spec.xp -= xpForLevel(spec.level);
        spec.level++;
        this.bumpRandomStat(spec);
      }
    }
    this.persist();
    this.events.onSaveChanged();
    return true;
  }

  // ——— xp / ranks ———

  private addXp(amount: number) {
    const spec = this.player.spec;
    spec.xp += amount;
    while (spec.xp >= xpForLevel(spec.level)) {
      spec.xp -= xpForLevel(spec.level);
      spec.level++;
      this.bumpRandomStat(spec);
      this.audio.levelUp();
      this.events.onCelebrate('levelup', `${spec.name} reached level ${spec.level}! ⭐`);
      this.checkRankUp(spec);
    }
  }

  private bumpRandomStat(spec: CatSpec) {
    const stats = ['speed', 'strength', 'agility'] as const;
    const st = stats[(Math.random() * 3) | 0];
    if (spec.traits[st] < 10) spec.traits[st]++;
  }

  private checkRankUp(spec: CatSpec) {
    const rank = rankFor(spec);
    const key = `rank_${spec.id}_${rank.name}`;
    if (rank.minScore > 0 && !this.save.tutorialDone.includes(key)) {
      this.save.tutorialDone.push(key);
      // unlocks
      let unlockMsg = '';
      if (rank.unlockAccessories) {
        for (const acc of rank.unlockAccessories) {
          if (!this.save.unlockedAccessories.includes(acc)) this.save.unlockedAccessories.push(acc);
        }
        unlockMsg += ' New accessories unlocked!';
      }
      if (rank.unlockPatterns) {
        for (const p of rank.unlockPatterns) {
          if (!this.save.unlockedPatterns.includes(p)) this.save.unlockedPatterns.push(p);
        }
        unlockMsg += ' New fur patterns unlocked!';
      }
      this.audio.fanfare();
      this.events.onCelebrate('rankup', `${spec.name} is now a ${rank.name}!${unlockMsg} 🏅`);
    }
  }

  // ——— main update ———

  private update(dt: number) {
    this.elapsed += dt;
    // nights pass 2.5x faster — kids spend most of their time in daylight
    const isNightNow = this.timeOfDay < 0.23 || this.timeOfDay > 0.77;
    this.timeOfDay = (this.timeOfDay + (dt / DAY_LENGTH) * (isNightNow ? 2.5 : 1)) % 1;

    if (this.duel) {
      this.updateDuel(dt);
      this.updateDuelCamera(dt);
      this.player.update(dt, this.elapsed);
      this.updateFollowers(dt); // kittens gather round to watch
      for (const r of this.rivals) r.avatar.update(dt, this.elapsed);
      this.world.update(dt, this.elapsed, this.px, this.pz);
      this.world.setTimeOfDay(this.timeOfDay, this.px, this.pz);
      return;
    }

    const paused = this.challenge?.phase === 'offer';
    if (!paused) {
      this.updatePlayer(dt);
      this.updateContext();
      this.updateRivals(dt);
      this.updateFollowers(dt);
      this.updateRescue(dt);
      this.updateStray(dt);
      this.updateWanderers(dt);
      this.updateFamily(dt);
      this.updateToys(dt);
      this.updateChallenge(dt);
      this.updateAgility(dt);
      this.updateBuildGhost();
    }
    this.world.updateCritters(dt, this.elapsed, this.px, this.pz, this.sneaking);
    this.world.update(dt, this.elapsed, this.px, this.pz);
    this.world.setTimeOfDay(this.timeOfDay, this.px, this.pz);
    this.audio.setNight(this.timeOfDay < 0.22 || this.timeOfDay > 0.78);
    this.updateFog();
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.player.update(dt, this.elapsed);

    // adaptive quality: if a tablet can't hold frame rate, shed grass +
    // shadow resolution rather than let the game chug. (skipped under test
    // automation, where software rendering would always trigger it)
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.elapsed > this.fpsCheckAt && !navigator.webdriver) {
      const fps = this.fpsFrames / Math.max(0.001, this.fpsAcc);
      this.fpsFrames = 0;
      this.fpsAcc = 0;
      this.fpsCheckAt = this.elapsed + 5;
      if (fps < 36 && this.qualityStep === 0) {
        this.qualityStep = 1;
        this.world.setQuality(0.55);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
      } else if (fps < 29 && this.qualityStep === 1) {
        this.qualityStep = 2;
        this.world.setQuality(0.3);
        this.renderer.setPixelRatio(1);
      }
    }

    // autosave
    if (this.elapsed - this.lastSave > 10) {
      this.lastSave = this.elapsed;
      this.persist();
    }
    // HUD at ~12fps (challenge running: also stream timer)
    if (this.elapsed - this.lastHud > 0.085) {
      this.lastHud = this.elapsed;
      this.emitHud();
      if (this.challenge?.phase === 'running') this.events.onChallenge({ ...this.challenge });
    }
  }

  private updatePlayer(dt: number) {
    const spec = this.player.spec;

    // keyboard → joystick
    let jx = this.joyX, jy = this.joyY;
    if (this.keys.size) {
      if (this.keys.has('w') || this.keys.has('arrowup')) jy = -1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) jy = 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) jx = -1;
      if (this.keys.has('d') || this.keys.has('arrowright')) jx = 1;
      if (this.keys.has('shift')) { jx *= 0.45; jy *= 0.45; }
    }
    const mag = Math.min(1, Math.hypot(jx, jy));

    // busy actions lock movement
    if (this.busyT > 0) {
      this.busyT -= dt;
      if (this.pounceVel) {
        this.px += this.pounceVel.x * dt;
        this.pz += this.pounceVel.z * dt;
      }
      if (this.busyT <= 0) {
        const payload = this.busyPayload;
        this.busyPayload = null;
        this.busyKind = null;
        this.pounceVel = null;
        payload?.();
        this.player.setAction('idle');
      }
    }

    // ——— climbing ———
    if (this.climbing) {
      const { tree } = this.climbing;
      const baseY = this.world.heightAt(tree.x, tree.z);
      this.climbing.h += -jy * 2.2 * dt * (this.keys.size || Math.abs(jy) > 0.1 ? 1 : 0);
      this.climbing.h = Math.max(0.4, Math.min(tree.trunkH * 0.82, this.climbing.h));
      if (Math.abs(jy) > 0.3 && Math.random() < dt * 4) this.audio.climbGrip();
      // stick to trunk
      const a = Math.atan2(this.pz - tree.z, this.px - tree.x);
      this.px = tree.x + Math.cos(a) * (tree.r + 0.35);
      this.pz = tree.z + Math.sin(a) * (tree.r + 0.35);
      this.py = baseY + this.climbing.h;
      this.heading = a + Math.PI; // face the trunk
      this.player.setAction('climb');
      this.player.moveSpeed = Math.abs(jy) * 2;
      // slide down and off at the bottom
      if (this.climbing.h <= 0.45 && jy > 0.4) {
        this.climbing = null;
        this.player.setAction('idle');
      }
      this.applyAvatarTransform();
      return;
    }

    // ——— ground / water movement ———
    const groundY = this.world.heightAt(this.px, this.pz);
    const waterDepth = WATER_LEVEL - groundY;
    const inDeepWater = waterDepth > 0.55;

    // swim state transitions
    if (inDeepWater && !this.swimming) {
      if (spec.traits.canSwim) {
        this.swimming = true;
        this.audio.splash();
        this.burst(this.px, WATER_LEVEL, this.pz, '#9fd8e8', 16);
        this.tutorialOnce('swim', `${spec.name} loves the water! Some cats are too scared to swim.`);
      }
    } else if (!inDeepWater && this.swimming) {
      this.swimming = false;
      this.audio.splash();
      this.burst(this.px, WATER_LEVEL + 0.2, this.pz, '#9fd8e8', 10);
    }

    let speed = 0;
    if (mag > 0.05 && this.busyT <= 0) {
      this.idleT = 0;
      const runThreshold = 0.72;
      const wantRun = mag > runThreshold && !this.sneaking;
      const baseSpeed = this.swimming
        ? 2.4 + spec.traits.speed * 0.1
        : this.sneaking
          ? 1.5
          : wantRun
            ? 5.6 + spec.traits.speed * 0.22
            : 3.0;
      speed = baseSpeed * Math.min(1, mag * 1.3);

      // camera-relative direction
      const ang = Math.atan2(jx, jy) + this.camYaw + Math.PI;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      let nx = this.px + dx * speed * dt;
      let nz = this.pz + dz * speed * dt;

      // scaredy-cats refuse deep water
      const nGroundY = this.world.heightAt(nx, nz);
      if (!spec.traits.canSwim && WATER_LEVEL - nGroundY > 0.5 && this.grounded) {
        nx = this.px;
        nz = this.pz;
        if (this.player.action !== 'sit') {
          this.player.showEmote('drop', 1.5);
          this.tutorialOnce('noswim', `${spec.name} is scared of deep water! Switch to a Swimmer cat to reach the islets. 🌊`);
        }
      }

      const solved = this.world.collide(nx, nz, PLAYER_RADIUS, this.py);
      this.px = solved.x;
      this.pz = solved.z;
      // smooth heading toward movement
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 10);
      this.lastMoveDir = { x: dx, z: dz };

      // footsteps + dust kicked up by running paws
      if (this.grounded && !this.swimming) {
        this.stepAcc += speed * dt;
        if (this.stepAcc > 1.1) {
          this.stepAcc = 0;
          const onSand = groundY < WATER_LEVEL + 1.2;
          this.audio.footstep(this.sneaking, onSand);
          if (!this.sneaking && speed > 4.2) {
            this.burst(
              this.px - this.lastMoveDir.x * 0.5,
              this.py + 0.06,
              this.pz - this.lastMoveDir.z * 0.5,
              onSand ? '#ddcb96' : '#9a835f',
              3
            );
          }
        }
      } else if (this.swimming) {
        this.stepAcc += speed * dt;
        if (this.stepAcc > 1.8) {
          this.stepAcc = 0;
          this.audio.swimStroke();
        }
      }
    } else if (this.busyT <= 0) {
      this.idleT += dt;
    }

    // ——— vertical physics ———
    if (this.swimming) {
      this.py += ((WATER_LEVEL - 0.18) - this.py) * Math.min(1, dt * 6);
      this.vy = 0;
      this.grounded = false;
    } else {
      this.vy += GRAVITY * dt;
      this.py += this.vy * dt;
      // ground includes standable platforms (rocks, logs, dens, tower pillars)
      const gy = this.world.groundHeight(this.px, this.pz, this.py - this.vy * dt);
      if (this.py <= gy && this.vy <= 0) {
        if (!this.grounded && this.vy < -9) {
          this.audio.land();
          this.burst(this.px, gy + 0.1, this.pz, '#c9b28a', 8);
        }
        this.py = gy;
        this.vy = 0;
        this.grounded = true;
      } else if (this.py > gy + 0.05) {
        this.grounded = false;
      }
      // Cat Tower Trial: reach the golden summit
      const top = this.world.towerTop;
      if (
        top && this.grounded && this.elapsed - this.towerDoneAt > 120 &&
        Math.abs(this.py - top.topY) < 0.4 && Math.hypot(this.px - top.x, this.pz - top.z) < top.r
      ) {
        this.towerDoneAt = this.elapsed;
        this.audio.fanfare();
        this.burst(top.x, top.topY + 1, top.z, '#ffd54a', 26);
        if (!this.save.tutorialDone.includes('towerFirst')) {
          this.save.tutorialDone.push('towerFirst');
          const spec = this.player.spec;
          spec.level++;
          this.bumpRandomStat(spec);
          this.events.onCelebrate('levelup', `${spec.name} conquered the Cat Tower! LEVEL UP! 🗼⭐`);
          this.checkRankUp(spec);
        } else {
          this.addXp(6);
          this.toast('Top of the Cat Tower! +6 xp 🗼');
        }
        this.persist();
        this.events.onSaveChanged();
      }
    }

    // ——— pick avatar action ———
    if (this.busyT <= 0) {
      if (this.swimming) this.player.setAction('swim');
      else if (!this.grounded) this.player.setAction(this.vy > 1 ? 'jump' : 'fall');
      else if (speed > 0.1) this.player.setAction(this.sneaking ? 'sneak' : speed > 4.4 ? 'run' : 'walk');
      else if (this.idleT > 24) {
        this.player.setAction('nap');
        if (Math.random() < dt * 0.4) this.player.showEmote('zzz', 2.5);
      }
      else if (this.idleT > 7) this.player.setAction('sit');
      else this.player.setAction('idle');
    }
    this.player.moveSpeed = speed;

    // ——— yarn auto-collect ———
    for (const y of this.world.yarn) {
      if (y.collected) continue;
      const dy = Math.abs(y.mesh.position.y - (this.py + 0.4));
      if (Math.hypot(y.x - this.px, y.z - this.pz) < 1.25 && dy < 1.6) {
        y.collected = true;
        y.mesh.visible = false;
        if (y.golden) {
          this.audio.goldenPickup();
          this.burst(y.x, y.mesh.position.y, y.z, '#ffd54a', 24);
          this.addXp(5);
          this.offerChallenge(y.id);
        } else if (y.surprise) {
          // the pink yarn egg cracks open — what's inside?!
          this.save.collectedYarn.push(y.id);
          this.audio.purr(2, 1.2);
          this.burst(y.x, y.mesh.position.y, y.z, '#f5c3d8', 26);
          this.addXp(3);
          const roll = Math.random();
          if (roll < 0.35 && this.save.kittens.length < 14) {
            const spec = generateKitten((Date.now() + 13) % 999999937);
            this.save.kittens.push(spec);
            this.audio.catJoin();
            this.events.onCelebrate('recruit', `The yarn cracked open — there was a kitten inside! ${spec.name} joins you! 🐱💗`);
            this.syncKittens();
          } else if (roll < 0.7) {
            this.save.treats += 2;
            this.toast('The surprise yarn unraveled into 2 crunchy treats! 🍪🍪');
          } else {
            this.save.yarn += 3;
            this.save.totalYarn += 3;
            this.toast('The surprise yarn was extra thick — 3 yarn! 🧶✨');
          }
        } else {
          this.save.collectedYarn.push(y.id);
          this.save.yarn++;
          this.save.totalYarn++;
          this.addXp(2);
          this.audio.yarnPickup();
          this.burst(y.x, y.mesh.position.y, y.z, '#e05d7e', 14);
          this.tutorialOnce('yarn', 'Yarn collected! 🧶 Spend it in Build mode at your camp.');
        }
        this.persist();
        this.events.onSaveChanged();
      }
    }

    // yarn wave respawn when picked clean
    const normalsLeft = this.world.yarn.filter((y) => !y.golden && !y.collected).length;
    if (normalsLeft <= 4) {
      this.save.wave++;
      this.save.collectedYarn = [];
      this.world.spawnYarn(this.save.wave, [], this.save.goldenDone);
      for (const mound of this.world.digMounds) {
        mound.dug = false;
        mound.mesh.visible = true;
      }
      this.toast('Fresh yarn has appeared across the island! 🧶✨');
      this.persist();
    }

    this.applyAvatarTransform();
  }

  private applyAvatarTransform() {
    this.player.root.position.set(this.px, this.py, this.pz);
    this.player.root.rotation.y = this.heading;
  }

  // context-sensitive action detection
  private updateContext() {
    let best: ContextTarget | null = null;
    const set = (kind: ContextTarget['kind'], label: string, id: string, x: number, z: number, d: number, priority: number) => {
      const cur = best as (ContextTarget & { d?: number; p?: number }) | null;
      if (!cur || priority > (cur.p ?? 0) || (priority === cur.p && d < (cur.d ?? 99))) {
        best = { kind, label, id, x, z } as ContextTarget;
        (best as ContextTarget & { d: number; p: number }).d = d;
        (best as ContextTarget & { d: number; p: number }).p = priority;
      }
    };

    if (!this.climbing && this.busyT <= 0) {
      // carrying a kitten: the action button is always "set down"
      if (this.carrying) {
        this.context = { kind: 'setdown', label: `Set ${this.carrying.spec.name} down`, id: this.carrying.spec.id, x: this.px, z: this.pz };
        this.emitHud(true);
        return;
      }
      // kitten rescue takes top billing
      if (this.rescue) {
        const d = Math.hypot(this.rescue.tree.x - this.px, this.rescue.tree.z - this.pz);
        if (d < 2.6) set('rescue', `Rescue ${this.rescue.spec.name}!`, this.rescue.tree.id, this.rescue.tree.x, this.rescue.tree.z, d, 8);
      }
      // stray kitten wants to join
      if (this.stray) {
        const d = Math.hypot(this.stray.x - this.px, this.stray.z - this.pz);
        if (d < 2.6) set('stray', `Join ${this.stray.spec.name} 💛`, this.stray.spec.id, this.stray.x, this.stray.z, d, 8);
      }
      // wanderer cats: say a sweet meow
      for (const w of this.wanderers) {
        if (w.state !== 'wander' || w.cooldown > 0) continue;
        const d = Math.hypot(w.x - this.px, w.z - this.pz);
        if (d < 4) set('love', `Meow at ${w.spec.name} 💕`, w.spec.id, w.x, w.z, d, 6);
      }
      // nurse the newborns at camp
      if (this.save.nursery.length > 0 && this.nursingT <= 0) {
        for (const b of this.babies) {
          const bp = b.avatar.root.position;
          const d = Math.hypot(bp.x - this.px, bp.z - this.pz);
          if (d < 2.4) { set('nurse', 'Nurse kittens 🍼', 'nursery', bp.x, bp.z, d, 7); break; }
        }
      }
      // pick up a follower kitten
      for (const f of this.followers) {
        const d = Math.hypot(f.x - this.px, f.z - this.pz);
        if (d < 1.6) set('pickup', `Carry ${f.spec.name}`, f.spec.id, f.x, f.z, d, 1);
      }
      // rival duel
      for (const r of this.rivals) {
        const d = Math.hypot(r.x - this.px, r.z - this.pz);
        if (d < 3.4) set('duel', `Duel ${r.spec.name}`, r.spec.id, r.x, r.z, d, 5);
      }
      // dig mounds
      for (const m of this.world.digMounds) {
        if (m.dug) continue;
        const d = Math.hypot(m.x - this.px, m.z - this.pz);
        if (d < 2) set('dig', 'Dig', m.id, m.x, m.z, d, 4);
      }
      // agility start
      const startGate = this.world.agilityGates[0];
      if (startGate && !this.agility.running) {
        const d = Math.hypot(startGate.x - this.px, startGate.z - this.pz);
        if (d < 4) set('agility', 'Start Course', 'agility', startGate.x, startGate.z, d, 4);
      }
      // scratch posts (built)
      for (const s of this.world.scratchSpots) {
        const d = Math.hypot(s.x - this.px, s.z - this.pz);
        if (d < 2.2) set('scratch', 'Scratch Post', s.id, s.x, s.z, d, 3);
      }
      // trees: climb or scratch
      if (!this.swimming && this.grounded) {
        const tree = this.world.nearestTree(this.px, this.pz, 1.9);
        if (tree) {
          const hasYarnUp = this.world.yarn.some((y) => !y.collected && y.spot === 'tree' && Math.hypot(y.x - tree.x, y.z - tree.z) < 2);
          set('climb', hasYarnUp ? 'Climb (yarn up top!)' : 'Climb', tree.id, tree.x, tree.z, 1, 2);
        }
      }
      // prey nearby → pounce
      for (const cr of this.world.critters) {
        if (cr.state !== 'wander') continue;
        const d = Math.hypot(cr.x - this.px, cr.z - this.pz);
        if (d < 3.4) set('prey', 'Pounce!', cr.kind, cr.x, cr.z, d, this.sneaking ? 6 : 1);
      }
    }

    const changed = JSON.stringify(best) !== JSON.stringify(this.context);
    this.context = best;
    if (changed) this.emitHud(true);
  }

  private updateRivals(dt: number) {
    for (const r of this.rivals) {
      r.stateT += dt;
      const camp = this.world.camps.find((c) => c.clanId === r.clanId)!;
      const distPlayer = Math.hypot(r.x - this.px, r.z - this.pz);

      // face the player when close (invites a duel)
      if (r.state !== 'facing' && distPlayer < 3.2 && this.busyT <= 0) {
        r.state = 'facing';
        r.stateT = 0;
        r.avatar.showEmote('!', 1.5);
      }

      let speed = 0;
      switch (r.state) {
        case 'facing': {
          r.heading = Math.atan2(this.px - r.x, this.pz - r.z);
          r.avatar.setAction('sit');
          if (distPlayer > 5) { r.state = 'wander'; r.stateT = 0; }
          break;
        }
        case 'rest': {
          r.avatar.setAction(r.stateT % 20 > 12 ? 'nap' : 'sit');
          if (r.stateT > 14) { r.state = 'wander'; r.stateT = 0; }
          break;
        }
        case 'wander': {
          // look for yarn occasionally
          if (r.stateT > 3 && !r.targetYarn && hash2(r.x | 0, this.elapsed | 0, 3) < 0.3) {
            let bestY: YarnBall | null = null;
            let bd = 30;
            for (const y of this.world.yarn) {
              if (y.collected || y.golden || y.spot === 'tree') continue;
              const d = Math.hypot(y.x - r.x, y.z - r.z);
              if (d < bd) { bd = d; bestY = y; }
            }
            if (bestY) { r.targetYarn = bestY; r.state = 'seek'; break; }
          }
          speed = 1.6;
          r.heading += (hash2((r.x * 10) | 0, (this.elapsed * 0.5) | 0, 7) - 0.5) * dt * 2.5;
          // stay near camp territory
          const dc = Math.hypot(r.x - camp.x, r.z - camp.z);
          if (dc > 55) r.heading = Math.atan2(camp.x - r.x, camp.z - r.z);
          if (r.stateT > 20) { r.state = 'rest'; r.stateT = 0; }
          r.avatar.setAction('walk');
          break;
        }
        case 'seek': {
          const y = r.targetYarn;
          if (!y || y.collected) { r.targetYarn = null; r.state = 'wander'; r.stateT = 0; break; }
          const d = Math.hypot(y.x - r.x, y.z - r.z);
          r.heading = Math.atan2(y.x - r.x, y.z - r.z);
          speed = 3.4;
          r.avatar.setAction('run');
          if (d < 1.2) {
            // rival claims the yarn for their clan!
            y.collected = true;
            y.mesh.visible = false;
            this.save.collectedYarn.push(y.id);
            const clanState = this.save.rivals[r.clanId];
            if (clanState) clanState.yarn++;
            r.targetYarn = null;
            r.state = 'return';
            r.stateT = 0;
            if (distPlayer < 30) this.toast(`${r.spec.name} of ${RIVAL_CLANS.find((c) => c.id === r.clanId)?.name} grabbed a yarn ball! 🧶`);
          }
          break;
        }
        case 'return': {
          const d = Math.hypot(camp.x - r.x, camp.z - r.z);
          r.heading = Math.atan2(camp.x - r.x, camp.z - r.z);
          speed = 2.4;
          r.avatar.setAction('walk');
          if (d < 6) { r.state = 'rest'; r.stateT = 0; }
          break;
        }
      }

      if (speed > 0) {
        let nx = r.x + Math.sin(r.heading) * speed * dt;
        let nz = r.z + Math.cos(r.heading) * speed * dt;
        // rivals don't swim off the island
        if (this.world.heightAt(nx, nz) < WATER_LEVEL + 0.3) {
          r.heading += Math.PI * 0.6;
          nx = r.x; nz = r.z;
        }
        const solved = this.world.collide(nx, nz, 0.4);
        r.x = solved.x;
        r.z = solved.z;
      }
      r.y = this.world.heightAt(r.x, r.z);
      r.avatar.root.position.set(r.x, r.y, r.z);
      r.avatar.root.rotation.y = r.heading;
      r.avatar.moveSpeed = speed;

      // cheap LOD: skip animation for far-away cats
      if (distPlayer < 70) r.avatar.update(dt, this.elapsed);
    }
  }

  // ——— camera ———

  private updateCamera(dt: number) {
    let dist = this.camDist;
    let pitchBias = 0;
    let fov = 60;
    if (this.mode === 'build') { dist = 11; pitchBias = 0.35; }
    else if (this.sneaking) { dist = 4.6; fov = 55; }
    else if (this.swimming) { dist = 7.5; }
    else if (this.mode === 'agility' && this.agility.running) { dist = 7.8; fov = 66; }
    if (this.climbing) { dist = 5.4; pitchBias = -0.1; }

    const pitch = Math.max(0.05, Math.min(1.25, this.camPitch + pitchBias));
    const cx = this.px - Math.sin(this.camYaw) * Math.cos(pitch) * dist;
    const cz = this.pz - Math.cos(this.camYaw) * Math.cos(pitch) * dist;
    let cy = this.py + Math.sin(pitch) * dist + 0.8;
    // keep camera above terrain
    const groundAtCam = this.world.heightAt(cx, cz);
    if (cy < groundAtCam + 0.7) cy = groundAtCam + 0.7;
    if (cy < WATER_LEVEL + 0.4) cy = WATER_LEVEL + 0.4;

    const k = Math.min(1, dt * 7);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.lookAt(this.px, this.py + 0.9, this.pz);
    if (Math.abs(this.camera.fov - fov) > 0.3) {
      this.camera.fov += (fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateDuelCamera(dt: number) {
    if (!this.duelRival) return;
    // hopscotch: steep top-down view; the counted row rides above the UI panel
    if (this.duel?.kind === 'hopscotch' && this.hop) {
      const o = this.hop.origin;
      // cat rides screen-centre so the counted row (just ahead) clears the UI panel
      const cx = this.px - o.dirX * 2.9;
      const cz = this.pz - o.dirZ * 2.9;
      const cy = this.hop.courtY + 11.5;
      const k2 = Math.min(1, dt * 5);
      this.camera.position.x += (cx - this.camera.position.x) * k2;
      this.camera.position.y += (cy - this.camera.position.y) * k2;
      this.camera.position.z += (cz - this.camera.position.z) * k2;
      this.camera.lookAt(this.px + o.dirX * 1.3, this.hop.courtY, this.pz + o.dirZ * 1.3);
      return;
    }
    const r = this.duelRival;
    const mx = (this.px + r.x) / 2;
    const mz = (this.pz + r.z) / 2;
    const my = (this.py + r.y) / 2;
    // slow cinematic orbit around the duelists
    const a = this.elapsed * 0.25;
    const cx = mx + Math.cos(a) * 5.5;
    const cz = mz + Math.sin(a) * 5.5;
    const cy = Math.max(my + 2.4, this.world.heightAt(cx, cz) + 1);
    const k = Math.min(1, dt * 4);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.lookAt(mx, my + 0.6, mz);
    // duelists face each other
    this.heading = Math.atan2(r.x - this.px, r.z - this.pz);
    this.applyAvatarTransform();
    r.heading = Math.atan2(this.px - r.x, this.pz - r.z);
    r.avatar.root.rotation.y = r.heading;
  }

  private updateFog() {
    const fog = this.scene.fog as THREE.Fog;
    const t = this.timeOfDay;
    const day = Math.max(0, Math.min(1, Math.sin((t - 0.25) * Math.PI * 2) * 3 + 0.1));
    fog.color.setHSL(0.55, 0.25, 0.12 + day * 0.68);
  }

  // ——— particles ———

  private burst(x: number, y: number, z: number, color: string, count: number) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.particles.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 0.15 + Math.random() * 0.15,
        color: c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
      });
    }
  }

  private updateParticles(dt: number) {
    const pos = this.particleGeo.attributes.position as THREE.BufferAttribute;
    const col = this.particleGeo.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life > p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 7 * dt;
      p.pos.addScaledVector(p.vel, dt);
      pos.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
      col.setXYZ(n, p.color.r, p.color.g, p.color.b);
      n++;
    }
    // stash leftovers far away
    for (let i = n; i < this.MAX_PARTICLES; i++) pos.setXYZ(i, 0, -999, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ——— misc ———

  private toastId = 0;
  private toast(text: string) {
    this.events.onToast({ id: ++this.toastId, text });
  }

  private tutorialOnce(key: string, text: string) {
    if (this.save.tutorialDone.includes(key)) return;
    this.save.tutorialDone.push(key);
    this.toast(text);
    this.persist();
  }

  private persist() {
    persistSave(this.save);
  }

  private emitHud(force = false) {
    void force;
    const spec = this.player?.spec;
    const hud: HudState = {
      yarn: this.save.yarn,
      treats: this.save.treats,
      mode: this.mode,
      activeCat: spec ? { name: spec.name, level: spec.level, rank: rankFor(spec).name } : null,
      context: this.context,
      swimming: this.swimming,
      climbing: !!this.climbing,
      sneaking: this.sneaking,
      timeOfDay: this.timeOfDay,
      agility: this.agility.running
        ? { running: true, t: this.agility.countdown > 0 ? 0 : this.agility.t, par: this.agilityPar, nextGate: this.agility.nextGate, total: this.world.agilityGates.length }
        : null,
      compass: this.camYaw,
      camp: this.campCompass(),
      rescue: this.rescue
        ? {
            angle: Math.atan2(this.rescue.tree.x - this.px, this.rescue.tree.z - this.pz) - this.camYaw,
            dist: Math.hypot(this.rescue.tree.x - this.px, this.rescue.tree.z - this.pz),
          }
        : null,
      kittens: this.save.kittens.length,
    };
    this.events.onHud(hud);
  }

  /** direction (radians in camera space) + distance from player to camp — for the HUD compass */
  campCompass(): { angle: number; dist: number } {
    const dx = this.world.playerCamp.x - this.px;
    const dz = this.world.playerCamp.z - this.pz;
    return { angle: Math.atan2(dx, dz) - this.camYaw, dist: Math.hypot(dx, dz) };
  }

  clanYarnStandings(): { id: string; name: string; color: string; yarn: number; isPlayer: boolean }[] {
    const rows = RIVAL_CLANS.map((c) => ({
      id: c.id, name: c.name, color: c.color,
      yarn: this.save.rivals[c.id]?.yarn ?? 0,
      isPlayer: false,
    }));
    rows.push({ id: 'player', name: this.save.clanName, color: '#d4a017', yarn: this.save.totalYarn, isPlayer: true });
    return rows.sort((a, b) => b.yarn - a.yarn);
  }
}
