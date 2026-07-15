// Snowpath — game engine: player, plow, blower, routed cars, kids & snowballs
import * as THREE from 'three';
import {
  TILE, GRID, WORLD, ROAD, DRIVE, PAD, PARK, BLOCKED,
  SNOW_START, SNOW_SLOW, SNOW_STUCK, SNOW_UNSTUCK, SNOW_DEPART,
  HudState, PlayerMode, RequestInfo, loadSave, storeSave, SaveData,
} from './types';
import { World, tileToWorld, worldToTile } from './world';
import { AssetLib, loadAssets, spawn } from './assets';
import { SnowAudio } from './audio';

const ROUTE_COLORS = ['#ffb14d', '#6ec6ff', '#ff7fa5', '#8df0a8', '#d0a5ff', '#ffe066', '#7fe0d6', '#ff9d7f', '#b8ff7f'];

interface Figure {
  root: THREE.Group;
  head: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
  phase: number;
  throwT: number;
}

interface Kid extends Figure {
  pos: THREE.Vector3;
  yaw: number;
  state: 'wander' | 'fight';
  target: THREE.Vector3;
  pauseT: number;
  throwTimer: number;
  hitT: number;
}

interface Wheel { node: THREE.Object3D; q0: THREE.Quaternion; angle: number }

interface Car {
  group: THREE.Group;
  wheels: Wheel[];
  pos: THREE.Vector3;
  yaw: number;
  path: [number, number][];
  seg: number;
  stuck: boolean;
  wasStuck: boolean;
  honkT: number;
  fade: number; // 1 = solid; goes to 0 on despawn
}

interface Request {
  id: number;
  houseIdx: number;
  destIdx: number;
  color: string;
  activateAt: number;   // day-clock seconds when it appears
  active: boolean;
  warmup: number;
  deadline: number;     // day-clock seconds
  phase: 'warming' | 'driving' | 'stuck' | 'done' | 'late';
  car: Car | null;
  ribbon: THREE.Line | null;
  runner: THREE.Mesh | null;
  runnerT: number;
  resolved: boolean;
  onTime: boolean;
  snowedInToastShown: boolean;
}

interface Snowball { mesh: THREE.Mesh; vel: THREE.Vector3; fromKid: boolean; }

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number; }

const X_AXIS = new THREE.Vector3(1, 0, 0);

// models face -Z at yaw 0; returns rotation.y that faces world direction `dir`
function yawFor(dir: THREE.Vector3): number {
  return Math.atan2(-dir.x, -dir.z);
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world!: World;
  private lib!: AssetLib;
  audio = new SnowAudio();

  // player
  private player!: Figure;
  private playerPos = new THREE.Vector3();
  private playerYaw = 0;
  private mode: PlayerMode = 'foot';
  private shoveling = false;
  private actionHeld = false;

  // vehicles
  private plowGroup!: THREE.Group;
  private plowPos = new THREE.Vector3();
  private plowYaw = 0;
  private plowSpeed = 0;
  private plowWheels: Wheel[] = [];
  private bladePivot: THREE.Object3D | null = null;
  private beaconMat: THREE.MeshStandardMaterial | null = null;
  private blowerGroup!: THREE.Group;
  private blowerPos = new THREE.Vector3();
  private blowerYaw = 0;
  private augur: THREE.Object3D | null = null;

  // entities
  private kids: Kid[] = [];
  private requests: Request[] = [];
  private snowballs: Snowball[] = [];
  private particles: Particle[] = [];
  private particlePool: THREE.Mesh[] = [];
  private flakes!: THREE.Points;
  private flakeVel: Float32Array | null = null;

  // input
  private joy = { x: 0, y: 0 };
  private keys = new Set<string>();
  private camYawOff = 0;
  private camDist = 12;

  // day state
  private screen: 'menu' | 'playing' | 'summary' = 'menu';
  private paused = false;
  private day = 1;
  private dayClock = 0;       // seconds elapsed in day
  private dayLength = 300;
  private overtime = false;
  private overtimeT = 0;
  private score = 0;
  private cheer = 50;
  private storm = 0.3;
  private fightHits = 0;
  private save: SaveData;
  private nextReqId = 1;
  private accumT = 0;
  private focusReq = -1;

  // hud
  private onHud: (h: HudState) => void;
  private hudToast: { text: string; at: number } | null = null;
  private frostAt = 0;
  private summary: HudState['summary'] = null;
  private hudT = 0;

  private minimap: HTMLCanvasElement | null = null;
  private bigMap: HTMLCanvasElement | null = null;

  private raf = 0;
  private lastT = 0;
  private disposed = false;
  loadProgress = 0;
  ready = false;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement, onHud: (h: HudState) => void) {
    this.onHud = onHud;
    this.minimap = minimap;
    this.save = loadSave();
    this.day = this.save.day;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });

    this.setupEnvironment();
    this.world = new World();
    this.world.buildGroundMeshes(this.scene);

    loadAssets((f) => { this.loadProgress = f; this.pushHud(); }).then((lib) => {
      if (this.disposed) return;
      this.lib = lib;
      this.buildTown();
      this.ready = true;
      this.pushHud();
    });

    this.lastT = performance.now();
    const loop = (t: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      if (!this.paused) this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.dispose();
  }

  // ---------- environment ----------

  private setupEnvironment() {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4; skyCanvas.height = 256;
    const sctx = skyCanvas.getContext('2d')!;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#8fb0d8');
    grad.addColorStop(0.55, '#c3d3e8');
    grad.addColorStop(1, '#efe3da');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(0xd5deea, 70, 260);

    this.scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x8a93a5, 0.85));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.5);
    sun.position.set(70, 90, -50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 20; sun.shadow.camera.far = 280;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    // falling snow
    const N = 1400;
    const pos = new Float32Array(N * 3);
    this.flakeVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      this.flakeVel[i] = 2.5 + Math.random() * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.32, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true,
    });
    this.flakes = new THREE.Points(geo, mat);
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  // ---------- town ----------

  private makeFigure(name: 'player' | 'kid_a' | 'kid_b' | 'kid_c'): Figure {
    const root = spawn(this.lib, name);
    this.scene.add(root);
    return {
      root,
      head: root.getObjectByName('head') ?? null,
      armL: root.getObjectByName('armL') ?? null,
      armR: root.getObjectByName('armR') ?? null,
      legL: root.getObjectByName('legL') ?? null,
      legR: root.getObjectByName('legR') ?? null,
      phase: 0,
      throwT: 0,
    };
  }

  private grabWheels(g: THREE.Group): Wheel[] {
    const out: Wheel[] = [];
    for (let i = 0; i < 4; i++) {
      const n = g.getObjectByName(`wheel${i}`);
      if (n) out.push({ node: n, q0: n.quaternion.clone(), angle: 0 });
    }
    return out;
  }

  private buildTown() {
    const lib = this.lib;
    for (const h of this.world.houses) {
      const g = spawn(lib, h.model);
      g.position.copy(h.housePos);
      g.rotation.y = h.faceYaw;
      this.scene.add(g);
    }
    // school & store
    const school = spawn(lib, 'school');
    const [scx, scz] = tileToWorld(10, 3.5);
    school.position.set(scx, 0, scz);
    school.rotation.y = Math.PI; // door faces +Z (toward road at gz=6)
    this.scene.add(school);
    const store = spawn(lib, 'store');
    const [stx, stz] = tileToWorld(24, 17.5);
    store.position.set(stx, 0, stz);
    store.rotation.y = Math.PI; // storefront faces the center road
    this.scene.add(store);

    for (const [x, z] of this.world.treeSpots) {
      const t = spawn(lib, 'tree');
      const s = 0.8 + ((x * 13.7 + z * 7.3) % 1 + 1) % 1 * 0.6;
      t.scale.setScalar(s);
      t.position.set(x, 0, z);
      t.rotation.y = (x + z) % Math.PI;
      this.scene.add(t);
    }
    for (const [x, z] of this.world.lampSpots) {
      const l = spawn(lib, 'lamp');
      l.position.set(x, 0, z);
      this.scene.add(l);
    }
    const sm = spawn(lib, 'snowman');
    sm.position.copy(this.world.snowmanPos);
    this.scene.add(sm);

    // player at central intersection
    this.player = this.makeFigure('player');
    const [px, pz] = tileToWorld(19, 21);
    this.playerPos.set(px, 0, pz);

    // plow parked on the road just west of center
    this.plowGroup = spawn(lib, 'plow');
    const [vx, vz] = tileToWorld(17, 20);
    this.plowPos.set(vx, 0, vz);
    this.plowYaw = Math.PI / 2;
    this.plowWheels = this.grabWheels(this.plowGroup);
    this.bladePivot = this.plowGroup.getObjectByName('blade') ?? null;
    this.plowGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'beacon') {
        const cl = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = cl;
        this.beaconMat = cl;
      }
    });
    this.scene.add(this.plowGroup);

    // blower parked on the corner yard by the intersection
    this.blowerGroup = spawn(lib, 'blower');
    const [bx, bz] = tileToWorld(21, 21);
    this.blowerPos.set(bx + 1.2, 0, bz);
    this.blowerYaw = -Math.PI / 2;
    this.augur = this.blowerGroup.getObjectByName('augur') ?? null;
    this.scene.add(this.blowerGroup);

    // kids in the park
    const kidNames: ('kid_a' | 'kid_b' | 'kid_c')[] = ['kid_a', 'kid_b', 'kid_c'];
    kidNames.forEach((kn, i) => {
      const f = this.makeFigure(kn);
      const kid = f as Kid;
      const a = (i / 3) * Math.PI * 2;
      kid.pos = this.world.parkCenter.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8));
      kid.yaw = Math.random() * Math.PI * 2;
      kid.state = 'wander';
      kid.target = kid.pos.clone();
      kid.pauseT = Math.random() * 3;
      kid.throwTimer = 2;
      kid.hitT = 0;
      this.kids.push(kid);
    });

    // particle pool
    const pGeo = new THREE.IcosahedronGeometry(0.14, 0);
    const pMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fd, roughness: 0.9 });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(pGeo, pMat);
      m.visible = false;
      this.scene.add(m);
      this.particlePool.push(m);
    }
    this.syncTransforms();
    this.updateCamera(0.001, true);
  }

  // ---------- public API (React shell) ----------

  setJoystick(x: number, y: number) { this.joy.x = x; this.joy.y = y; }

  startDay() {
    if (!this.ready) return;
    this.audio.ensure();
    this.screen = 'playing';
    this.paused = false;
    this.dayClock = 0;
    this.dayLength = 300;
    this.overtime = false;
    this.overtimeT = 0;
    this.score = 0;
    this.cheer = 50;
    this.fightHits = 0;
    this.summary = null;
    // fresh storm
    for (let i = 0; i < this.world.kind.length; i++) {
      const k = this.world.kind[i];
      if (k === ROAD || k === DRIVE || k === PAD) this.world.depth[i] = SNOW_START;
    }
    const ctx = this.world.snowCtx;
    ctx.clearRect(0, 0, this.world.snowCanvas.width, this.world.snowCanvas.height);
    ctx.fillStyle = 'rgba(247,250,254,0.96)';
    ctx.fillRect(0, 0, this.world.snowCanvas.width, this.world.snowCanvas.height);
    this.world.flushSnowTexture();
    this.world.snowTexture.needsUpdate = true;
    // clear old requests
    for (const r of this.requests) this.cleanupRequest(r);
    this.requests = [];
    this.scheduleRequests();
    this.toast(`Day ${this.day} — the storm is here. Clear the way! ❄️`);
    this.pushHud();
  }

  private scheduleRequests() {
    const count = Math.min(2 + this.day, 9);
    const houseIdxs = this.world.houses.map((_, i) => i);
    for (let i = houseIdxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [houseIdxs[i], houseIdxs[j]] = [houseIdxs[j], houseIdxs[i]];
    }
    let t = 6;
    for (let i = 0; i < count; i++) {
      const destIdx = Math.floor(Math.random() * this.world.destinations.length);
      const houseIdx = houseIdxs[i % houseIdxs.length];
      this.requests.push({
        id: this.nextReqId++,
        houseIdx, destIdx,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        activateAt: t,
        active: false,
        warmup: 0,
        deadline: 0,
        phase: 'warming',
        car: null, ribbon: null, runner: null, runnerT: 0,
        resolved: false, onTime: false, snowedInToastShown: false,
      });
      const gap = Math.max(14, 40 - this.day * 3);
      t += gap * (0.7 + Math.random() * 0.6);
    }
  }

  action(down: boolean) {
    this.actionHeld = down;
    if (!down) { this.shoveling = false; return; }
    this.audio.ensure();
    if (this.screen !== 'playing') return;
    if (this.mode === 'plow') {
      // hop out
      this.mode = 'foot';
      const side = new THREE.Vector3(Math.cos(this.plowYaw), 0, -Math.sin(this.plowYaw));
      this.playerPos.copy(this.plowPos).addScaledVector(side, 2.2);
      this.player.root.visible = true;
      this.plowSpeed = 0;
      return;
    }
    if (this.mode === 'blower') {
      this.mode = 'foot';
      return;
    }
    const ctxAction = this.footContext();
    if (ctxAction === 'plow') {
      this.mode = 'plow';
      this.player.root.visible = false;
      this.toast('Plow the roads — but watch the driveways, banks pile up! 🚜');
    } else if (ctxAction === 'blower') {
      this.mode = 'blower';
      this.toast('Blower clears driveways clean — walk it up to the snow.');
    } else if (ctxAction === 'shovel') {
      this.shoveling = true;
    }
  }

  throwSnowball() {
    if (this.screen !== 'playing' || this.mode !== 'foot') return;
    this.audio.ensure();
    if (this.player.throwT > 0) return;
    this.player.throwT = 0.4;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    );
    mesh.castShadow = true;
    mesh.position.copy(this.playerPos).add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(dir, 0.5);
    this.scene.add(mesh);
    this.playerYaw = yawFor(dir);
    this.snowballs.push({ mesh, vel: dir.multiplyScalar(13).add(new THREE.Vector3(0, 4.6, 0)), fromKid: false });
    this.audio.whoosh();
  }

  focusRequest(id: number) { this.focusReq = this.focusReq === id ? -1 : id; }
  setPaused(p: boolean) { this.paused = p; this.audio.setEngine('off', 0); }
  setMuted(m: boolean) { this.audio.ensure(); this.audio.setMuted(m); }
  attachBigMap(c: HTMLCanvasElement | null) { this.bigMap = c; }

  nextDay() {
    this.day = this.save.day;
    this.startDay();
  }

  // ---------- context ----------

  private footContext(): 'plow' | 'blower' | 'shovel' | null {
    if (this.playerPos.distanceTo(this.plowPos) < 3.6) return 'plow';
    if (this.playerPos.distanceTo(this.blowerPos) < 2.6) return 'blower';
    const [gx, gz] = worldToTile(this.playerPos.x, this.playerPos.z);
    if (this.world.isDrivable(gx, gz) && this.world.depthAt(gx, gz) > 0.8) return 'shovel';
    return null;
  }

  private actionLabel(): string | null {
    if (this.screen !== 'playing') return null;
    if (this.mode === 'plow') return 'Hop out';
    if (this.mode === 'blower') return 'Let go';
    const c = this.footContext();
    if (c === 'plow') return 'Drive plow';
    if (c === 'blower') return 'Push blower';
    if (c === 'shovel') return 'Shovel!';
    return null;
  }

  // ---------- update ----------

  private update(dt: number) {
    if (!this.ready) { if (this.flakes) this.updateFlakes(dt); return; }
    if (this.screen === 'playing') {
      this.dayClock += dt;
      this.updateStorm(dt);
      this.updateRequests(dt);
      this.updateDayEnd(dt);
    }
    this.updateMovement(dt);
    this.updateClearing(dt);
    this.updateKids(dt);
    this.updateSnowballs(dt);
    this.updateParticles(dt);
    this.updateFlakes(dt);
    this.syncTransforms();
    this.updateCamera(dt, false);
    this.world.flushSnowTexture();
    if (this.beaconMat) {
      this.beaconMat.emissiveIntensity = 2.5 + Math.sin(performance.now() * 0.012) * 2;
    }
    this.hudT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; this.pushHud(); this.drawMinimaps(); }
  }

  private updateStorm(dt: number) {
    const t = this.dayClock;
    const wave = Math.sin(t * 0.02) * 0.5 + Math.sin(t * 0.043 + 2) * 0.3;
    this.storm = Math.max(0.12, Math.min(1, 0.3 + this.day * 0.055 + wave * 0.35));
    const rate = this.storm * 0.035; // depth units per second
    this.world.snowfall(rate, dt);
    this.accumT += dt;
    if (this.accumT > 3) {
      this.world.accumulateVisual(rate * this.accumT * 0.09);
      this.accumT = 0;
    }
    this.audio.setStorm(this.storm);
  }

  // ---------- movement ----------

  private inputVec(): { x: number; y: number } {
    let x = this.joy.x, y = this.joy.y;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  private blockedAt(x: number, z: number): boolean {
    const [gx, gz] = worldToTile(x, z);
    return this.world.at(gx, gz) === BLOCKED;
  }

  private tryMove(pos: THREE.Vector3, dx: number, dz: number) {
    const lim = WORLD / 2 - 3;
    const nx = Math.max(-lim, Math.min(lim, pos.x + dx));
    const nz = Math.max(-lim, Math.min(lim, pos.z + dz));
    if (!this.blockedAt(nx, pos.z)) pos.x = nx;
    if (!this.blockedAt(pos.x, nz)) pos.z = nz;
  }

  private updateMovement(dt: number) {
    const inp = this.inputVec();
    const mag = Math.hypot(inp.x, inp.y);
    // camera-relative move direction (up on stick = away from camera)
    const camYaw = this.camYaw();
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    const mx = inp.x * c + inp.y * s;
    const mz = -inp.x * s + inp.y * c;

    if (this.mode === 'foot') {
      if (mag > 0.05 && !this.shoveling) {
        const speed = 2.6 + 3.2 * Math.min(1, mag);
        this.tryMove(this.playerPos, mx / (mag || 1) * speed * mag * dt, mz / (mag || 1) * speed * mag * dt);
        const tYaw = Math.atan2(-mx, -mz);
        this.playerYaw = this.lerpAngle(this.playerYaw, tYaw, Math.min(1, dt * 10));
        this.player.phase += dt * (6 + 6 * mag);
      } else {
        this.player.phase *= 0.9;
      }
      this.audio.setEngine('off', 0);
    } else if (this.mode === 'plow') {
      const throttle = -inp.y; // push up = forward
      const accel = throttle * 7.5;
      this.plowSpeed += accel * dt;
      this.plowSpeed *= (1 - Math.min(1, dt * (Math.abs(throttle) > 0.05 ? 0.4 : 2.4)));
      // ground drag: off-road is slow going
      const [pgx, pgz] = worldToTile(this.plowPos.x, this.plowPos.z);
      const k = this.world.at(pgx, pgz);
      const maxF = (k === ROAD || k === DRIVE || k === PAD) ? 9.5 : 3.2;
      this.plowSpeed = Math.max(-3.5, Math.min(maxF, this.plowSpeed));
      const steer = inp.x;
      if (Math.abs(this.plowSpeed) > 0.3) {
        this.plowYaw -= steer * dt * 1.6 * Math.sign(this.plowSpeed) * Math.min(1, Math.abs(this.plowSpeed) / 4);
      }
      const fwd = this.tmpV.set(-Math.sin(this.plowYaw), 0, -Math.cos(this.plowYaw));
      this.tryMove(this.plowPos, fwd.x * this.plowSpeed * dt, fwd.z * this.plowSpeed * dt);
      for (const w of this.plowWheels) {
        w.angle += (this.plowSpeed / 0.46) * dt;
        w.node.quaternion.setFromAxisAngle(X_AXIS, w.angle).multiply(w.q0);
      }
      if (this.bladePivot) {
        const target = this.plowSpeed < -0.4 ? 0.55 : 0;
        this.bladePivot.rotation.x += (target - this.bladePivot.rotation.x) * Math.min(1, dt * 6);
      }
      this.playerPos.copy(this.plowPos);
      this.audio.setEngine('plow', Math.min(1, Math.abs(this.plowSpeed) / 9));
    } else if (this.mode === 'blower') {
      if (mag > 0.05) {
        const speed = 2.3 * Math.min(1, mag);
        this.tryMove(this.playerPos, mx / (mag || 1) * speed * mag * dt, mz / (mag || 1) * speed * mag * dt);
        const tYaw = Math.atan2(-mx, -mz);
        this.playerYaw = this.lerpAngle(this.playerYaw, tYaw, Math.min(1, dt * 7));
        this.player.phase += dt * 7;
      } else {
        this.player.phase *= 0.9;
      }
      // blower sits in front of the player
      const fwd = this.tmpV.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
      this.blowerPos.copy(this.playerPos).addScaledVector(fwd, 1.05);
      this.blowerYaw = this.playerYaw;
      if (this.augur) this.augur.rotation.x += dt * 9;
      this.audio.setEngine('blower', mag > 0.05 ? 1 : 0.5);
    }

    // player figure walk animation
    const f = this.player;
    const amp = this.mode === 'foot' ? 0.75 : 0.45;
    const swing = Math.sin(f.phase) * amp;
    if (f.legL) f.legL.rotation.x = swing;
    if (f.legR) f.legR.rotation.x = -swing;
    if (f.throwT > 0) {
      f.throwT -= dt;
      const k = Math.max(0, f.throwT / 0.4);
      if (f.armR) f.armR.rotation.x = -2.4 * k + 0.6 * (1 - k);
    } else if (this.shoveling) {
      const s = Math.sin(performance.now() * 0.012);
      if (f.armR) f.armR.rotation.x = -0.9 + s * 0.5;
      if (f.armL) f.armL.rotation.x = -0.9 + s * 0.5;
    } else if (this.mode === 'blower') {
      if (f.armR) f.armR.rotation.x = -0.85;
      if (f.armL) f.armL.rotation.x = -0.85;
    } else {
      if (f.armR) f.armR.rotation.x = -swing * 0.7;
      if (f.armL) f.armL.rotation.x = swing * 0.7;
    }
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // ---------- clearing ----------

  private updateClearing(dt: number) {
    if (this.screen !== 'playing') return;
    if (this.mode === 'plow' && this.plowSpeed > 0.6 && this.bladePivot && this.bladePivot.rotation.x < 0.2) {
      const fwd = this.tmpV.set(-Math.sin(this.plowYaw), 0, -Math.cos(this.plowYaw));
      const bx = this.plowPos.x + fwd.x * 2.2;
      const bz = this.plowPos.z + fwd.z * 2.2;
      const removed = this.world.clearAt(bx, bz, 1.6, 99);
      if (removed > 0.15) {
        // bank the snow to both sides — driveway aprons beware
        const perp = this.tmpV2.set(-fwd.z, 0, fwd.x);
        for (const s of [1, -1]) {
          const [dgx, dgz] = worldToTile(bx + perp.x * TILE * s, bz + perp.z * TILE * s);
          this.world.deposit(dgx, dgz, removed * 0.4);
          if (Math.random() < 0.6) {
            this.spawnPuff(
              new THREE.Vector3(bx + perp.x * 1.4 * s, 0.5, bz + perp.z * 1.4 * s),
              new THREE.Vector3(perp.x * s * 3 + fwd.x * 2, 3.2, perp.z * s * 3 + fwd.z * 2), 2,
            );
          }
        }
        if (Math.random() < 0.12) this.audio.scrape();
      }
    } else if (this.mode === 'blower') {
      const fwd = this.tmpV.set(-Math.sin(this.blowerYaw), 0, -Math.cos(this.blowerYaw));
      const bx = this.blowerPos.x + fwd.x * 0.9;
      const bz = this.blowerPos.z + fwd.z * 0.9;
      const removed = this.world.clearAt(bx, bz, 1.05, 6.5 * dt);
      if (removed > 0.01) {
        const perp = this.tmpV2.set(-fwd.z, 0, fwd.x);
        this.spawnPuff(
          new THREE.Vector3(bx, 0.8, bz),
          new THREE.Vector3(perp.x * 6 + (Math.random() - 0.5), 4.5, perp.z * 6 + (Math.random() - 0.5)), 2,
        );
      }
    } else if (this.mode === 'foot' && this.shoveling && this.actionHeld) {
      const fwd = this.tmpV.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
      const removed = this.world.clearAt(this.playerPos.x + fwd.x * 0.7, this.playerPos.z + fwd.z * 0.7, 0.95, 3.4 * dt);
      if (removed > 0.01 && Math.random() < 0.25) {
        this.spawnPuff(
          new THREE.Vector3(this.playerPos.x + fwd.x, 0.6, this.playerPos.z + fwd.z),
          new THREE.Vector3((Math.random() - 0.5) * 3, 2.8, (Math.random() - 0.5) * 3), 1,
        );
      }
      const [gx, gz] = worldToTile(this.playerPos.x, this.playerPos.z);
      if (!this.world.isDrivable(gx, gz) || this.world.depthAt(gx, gz) < 0.3) this.shoveling = false;
    }
  }

  // ---------- requests & cars ----------

  private updateRequests(dt: number) {
    for (const r of this.requests) {
      if (r.resolved) continue;
      if (!r.active) {
        if (this.dayClock >= r.activateAt) this.activateRequest(r);
        continue;
      }
      const house = this.world.houses[r.houseIdx];
      if (r.phase === 'warming') {
        r.warmup -= dt;
        // exhaust puffs while warming
        if (r.car && Math.random() < dt * 2) {
          const back = this.tmpV.set(Math.sin(r.car.yaw), 0, Math.cos(r.car.yaw));
          this.spawnPuff(
            r.car.pos.clone().add(new THREE.Vector3(back.x * 2, 0.5, back.z * 2)),
            new THREE.Vector3(0, 1.2, 0), 1,
          );
        }
        if (r.warmup <= 0) {
          const dDepth = this.world.depthAt(house.driveTile[0], house.driveTile[1]);
          if (dDepth <= SNOW_DEPART) {
            r.phase = 'driving';
            this.audio.honk();
          } else if (!r.snowedInToastShown) {
            r.snowedInToastShown = true;
            this.toast(`The ${house.family}s are snowed in — clear their driveway! 🧹`);
            this.audio.honk();
          }
        }
      }
      if (r.phase === 'driving' || r.phase === 'stuck') {
        this.driveCar(r, dt);
      }
      if (r.runner && r.ribbon) {
        r.runnerT = (r.runnerT + dt * 0.35) % 1;
        const pts = this.ribbonPoints.get(r.id) ?? [];
        if (pts.length > 1) {
          const fi = r.runnerT * (pts.length - 1);
          const i0 = Math.floor(fi);
          const p0 = pts[i0], p1 = pts[Math.min(pts.length - 1, i0 + 1)];
          r.runner.position.lerpVectors(p0, p1, fi - i0);
        }
      }
    }
  }

  // ribbon path points cache (attached to request via closure)
  private ribbonPoints = new Map<number, THREE.Vector3[]>();

  private activateRequest(r: Request) {
    const house = this.world.houses[r.houseIdx];
    const dest = this.world.destinations[r.destIdx];
    const path = this.world.findPath(house.padTile, dest.tile);
    if (!path) { r.resolved = true; return; } // shouldn't happen
    r.active = true;
    r.warmup = 14 + Math.random() * 10;
    const routeLen = path.length * TILE;
    const budget = r.warmup + routeLen / 3.0 + Math.max(12, 34 - this.day * 3);
    r.deadline = this.dayClock + budget;

    // car
    const color = new THREE.Color(house.carColor);
    const group = spawn(this.lib, 'car', { matName: 'paint', color });
    const [cx, cz] = tileToWorld(house.padTile[0], house.padTile[1]);
    const car: Car = {
      group,
      wheels: this.grabWheels(group),
      pos: new THREE.Vector3(cx, 0, cz),
      yaw: house.faceYaw, // nose toward the road (same heading as the house door)
      path, seg: 0, stuck: false, wasStuck: false, honkT: 0, fade: 1,
    };
    this.scene.add(group);
    r.car = car;

    // route ribbon
    const pts = path.map(([gx, gz]) => {
      const [x, z] = tileToWorld(gx, gz);
      return new THREE.Vector3(x, 0.22, z);
    });
    this.ribbonPoints.set(r.id, pts);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(r.color), transparent: true, opacity: 0.5 });
    r.ribbon = new THREE.Line(geo, mat);
    this.scene.add(r.ribbon);
    const runner = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color) }),
    );
    runner.position.copy(pts[0]);
    this.scene.add(runner);
    r.runner = runner;

    this.toast(`${house.family} family → ${dest.name}. Route is on your map! 🗺️`);
    this.audio.ding();
    this.pushHud();
  }

  private driveCar(r: Request, dt: number) {
    const car = r.car!;
    const pts = this.ribbonPoints.get(r.id)!;
    if (car.seg >= pts.length - 1) { this.arrive(r); return; }
    const target = pts[car.seg + 1];
    const dir = this.tmpV.copy(target).sub(car.pos); dir.y = 0;
    const dist = dir.length();
    if (dist < 0.4) { car.seg++; return; }
    dir.normalize();

    // sample snow ahead
    const ahead = this.tmpV2.copy(car.pos).addScaledVector(dir, 1.4);
    const depth = this.world.depthAtWorld(ahead.x, ahead.z);
    if (car.stuck) {
      r.phase = 'stuck';
      car.honkT -= dt;
      if (car.honkT <= 0) { car.honkT = 6; this.audio.honk(); }
      // wobble while spinning wheels
      car.group.rotation.z = Math.sin(performance.now() * 0.02) * 0.02;
      if (depth < SNOW_UNSTUCK && this.world.depthAtWorld(car.pos.x, car.pos.z) < SNOW_UNSTUCK) {
        car.stuck = false;
        r.phase = 'driving';
        this.score += 30;
        this.cheer = Math.min(100, this.cheer + 4);
        const house = this.world.houses[r.houseIdx];
        this.toast(`You freed the ${house.family}s! +30 ⛏️`);
        this.audio.chime();
      }
      return;
    }
    if (depth > SNOW_STUCK) {
      car.stuck = true;
      if (!car.wasStuck) {
        car.wasStuck = true;
        const house = this.world.houses[r.houseIdx];
        this.toast(`Oh no — the ${house.family}s are stuck in deep snow! 🚗💦`);
      }
      this.audio.honk();
      return;
    }
    const speed = Math.max(1.0, 6.8 * (1 - depth / SNOW_SLOW));
    car.pos.addScaledVector(dir, Math.min(dist, speed * dt));
    car.yaw = this.lerpAngle(car.yaw, yawFor(dir), Math.min(1, dt * 6));
    for (const w of car.wheels) {
      w.angle += (speed / 0.38) * dt;
      w.node.quaternion.setFromAxisAngle(X_AXIS, w.angle).multiply(w.q0);
    }
    // snow kick if driving through snow
    if (depth > 2 && Math.random() < dt * 4) {
      this.spawnPuff(car.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), 1);
    }
  }

  private arrive(r: Request) {
    const house = this.world.houses[r.houseIdx];
    const dest = this.world.destinations[r.destIdx];
    r.resolved = true;
    r.onTime = this.dayClock <= r.deadline;
    r.phase = r.onTime ? 'done' : 'late';
    if (r.onTime) {
      this.score += 100;
      this.cheer = Math.min(100, this.cheer + 8);
      this.toast(`The ${house.family}s made it to ${dest.name} on time! +100 🎉`);
      this.audio.chime();
    } else {
      this.score += 25;
      this.cheer = Math.max(0, this.cheer - 6);
      this.toast(`The ${house.family}s got to ${dest.name}… late. +25 😅`);
      this.audio.sadHorn();
    }
    this.cleanupRequest(r, true);
    this.pushHud();
  }

  private cleanupRequest(r: Request, keepHud = false) {
    if (r.ribbon) { this.scene.remove(r.ribbon); r.ribbon.geometry.dispose(); r.ribbon = null; }
    if (r.runner) { this.scene.remove(r.runner); r.runner = null; }
    if (r.car) { this.scene.remove(r.car.group); r.car = null; }
    this.ribbonPoints.delete(r.id);
    if (!keepHud) r.resolved = true;
  }

  private updateDayEnd(dt: number) {
    const remaining = this.dayLength - this.dayClock;
    const activeLeft = this.requests.some((r) => !r.resolved);
    if (remaining <= 0) {
      if (activeLeft && this.overtimeT < 90) {
        this.overtime = true;
        this.overtimeT += dt;
      } else {
        this.endDay();
      }
    }
  }

  private endDay() {
    const total = this.requests.length;
    const delivered = this.requests.filter((rr) => rr.onTime).length;
    const potential = Math.max(1, total * 100);
    const ratio = this.score / potential;
    const stars = ratio >= 0.72 ? 3 : ratio >= 0.4 ? 2 : 1;
    this.summary = { delivered, total, stars, score: this.score };
    this.screen = 'summary';
    this.audio.setEngine('off', 0);
    this.save.day = this.day + 1;
    this.save.bestScore = Math.max(this.save.bestScore, this.score);
    this.save.stars[this.day] = Math.max(this.save.stars[this.day] ?? 0, stars);
    storeSave(this.save);
    for (const r of this.requests) this.cleanupRequest(r, true);
    this.pushHud();
  }

  // ---------- kids & snowballs ----------

  private updateKids(dt: number) {
    for (const kid of this.kids) {
      const distToPlayer = kid.pos.distanceTo(this.playerPos);
      if (kid.hitT > 0) {
        kid.hitT -= dt;
        kid.root.rotation.x = -Math.sin(Math.min(1, kid.hitT / 0.7) * Math.PI) * 0.9;
        continue;
      }
      kid.root.rotation.x = 0;
      if (kid.state === 'wander') {
        if (kid.pauseT > 0) {
          kid.pauseT -= dt;
          kid.phase *= 0.9;
        } else {
          const d = this.tmpV.copy(kid.target).sub(kid.pos); d.y = 0;
          if (d.length() < 0.5) {
            kid.pauseT = 1 + Math.random() * 3;
            const a = Math.random() * Math.PI * 2;
            kid.target.copy(this.world.parkCenter).add(new THREE.Vector3(Math.cos(a) * (3 + Math.random() * 9), 0, Math.sin(a) * (3 + Math.random() * 9)));
          } else {
            d.normalize();
            kid.pos.addScaledVector(d, 0.9 * dt);
            kid.yaw = this.lerpAngle(kid.yaw, yawFor(d), Math.min(1, dt * 6));
            kid.phase += dt * 7;
          }
        }
        if (distToPlayer > 28) continue;
      } else {
        // fight!
        const toP = this.tmpV.copy(this.playerPos).sub(kid.pos); toP.y = 0;
        kid.yaw = this.lerpAngle(kid.yaw, yawFor(toP.clone().normalize()), Math.min(1, dt * 8));
        kid.throwTimer -= dt;
        // sidestep dodge
        if (Math.random() < dt * 0.7) {
          const perp = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.random() < 0.5 ? 2 : -2);
          kid.target.copy(kid.pos).add(perp);
        }
        const d = this.tmpV2.copy(kid.target).sub(kid.pos); d.y = 0;
        if (d.length() > 0.4) {
          d.normalize();
          kid.pos.addScaledVector(d, 1.6 * dt);
          kid.phase += dt * 9;
        }
        if (kid.throwTimer <= 0 && distToPlayer < 22) {
          kid.throwTimer = 2.2 + Math.random() * 2.2;
          kid.throwT = 0.4;
          this.kidThrow(kid);
        }
        if (distToPlayer > 30) kid.state = 'wander';
      }
      if (kid.throwT > 0) {
        kid.throwT -= dt;
        const k = Math.max(0, kid.throwT / 0.4);
        if (kid.armR) kid.armR.rotation.x = -2.2 * k;
      }
      const swing = Math.sin(kid.phase) * 0.7;
      if (kid.legL) kid.legL.rotation.x = swing;
      if (kid.legR) kid.legR.rotation.x = -swing;
      if (kid.armL) kid.armL.rotation.x = swing * 0.5;
    }
  }

  private kidThrow(kid: Kid) {
    const t = 0.85;
    const g = 18;
    const dp = this.tmpV.copy(this.playerPos).sub(kid.pos).add(new THREE.Vector3(0, 0.8, 0));
    const vel = new THREE.Vector3(dp.x / t, dp.y / t + 0.5 * g * t, dp.z / t);
    if (vel.length() > 22) vel.setLength(22);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
    );
    mesh.position.copy(kid.pos).add(new THREE.Vector3(0, 0.9, 0));
    this.scene.add(mesh);
    this.snowballs.push({ mesh, vel, fromKid: true });
    this.audio.whoosh();
  }

  private updateSnowballs(dt: number) {
    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const b = this.snowballs[i];
      b.vel.y -= 18 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      let hit = false;
      if (!b.fromKid) {
        for (const kid of this.kids) {
          if (kid.hitT <= 0 && b.mesh.position.distanceTo(this.tmpV.copy(kid.pos).add(new THREE.Vector3(0, 0.6, 0))) < 0.75) {
            kid.hitT = 0.9;
            kid.state = 'fight';
            for (const other of this.kids) if (other.pos.distanceTo(kid.pos) < 12) other.state = 'fight';
            this.cheer = Math.min(100, this.cheer + 2);
            this.fightHits++;
            this.audio.giggle();
            this.toast('Snowball hit! The kids giggle. +cheer ⛄');
            hit = true;
            break;
          }
        }
      } else {
        if (this.mode === 'foot' && b.mesh.position.distanceTo(this.tmpV.copy(this.playerPos).add(new THREE.Vector3(0, 1, 0))) < 0.8) {
          this.frostAt = performance.now();
          this.cheer = Math.min(100, this.cheer + 1);
          this.audio.brrr();
          hit = true;
        }
      }
      if (hit || b.mesh.position.y < 0.1) {
        this.spawnPuff(b.mesh.position.clone(), new THREE.Vector3(0, 2, 0), 3);
        if (!hit) this.audio.pop();
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.snowballs.splice(i, 1);
      }
    }
  }

  // ---------- particles ----------

  private spawnPuff(pos: THREE.Vector3, vel: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const mesh = this.particlePool.find((m) => !m.visible);
      if (!mesh) return;
      mesh.visible = true;
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      const life = 0.5 + Math.random() * 0.4;
      this.particles.push({
        mesh,
        vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)),
        life, maxLife: life,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.multiplyScalar(1 - dt * 0.8);
      if (p.life <= 0 || p.mesh.position.y < 0) {
        p.mesh.visible = false;
        this.particles.splice(i, 1);
      }
    }
  }

  private updateFlakes(dt: number) {
    const pos = this.flakes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = pos.count;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const windX = Math.sin(performance.now() * 0.0003) * 1.5 * this.storm;
    for (let i = 0; i < n; i++) {
      arr[i * 3 + 1] -= this.flakeVel![i] * dt;
      arr[i * 3] += windX * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 35 + Math.random() * 5;
        arr[i * 3] = cx + (Math.random() - 0.5) * 90;
        arr[i * 3 + 2] = cz + (Math.random() - 0.5) * 90;
      }
    }
    pos.needsUpdate = true;
    const visN = Math.floor(n * (0.25 + 0.75 * this.storm));
    this.flakes.geometry.setDrawRange(0, visN);
  }

  // ---------- transforms & camera ----------

  private syncTransforms() {
    if (!this.player) return;
    this.player.root.position.copy(this.playerPos);
    this.player.root.rotation.y = this.playerYaw;
    this.plowGroup.position.copy(this.plowPos);
    this.plowGroup.rotation.y = this.plowYaw;
    this.blowerGroup.position.copy(this.blowerPos);
    this.blowerGroup.rotation.y = this.blowerYaw;
    for (const kid of this.kids) {
      kid.root.position.copy(kid.pos);
      kid.root.rotation.y = kid.yaw;
    }
    for (const r of this.requests) {
      if (r.car) {
        r.car.group.position.copy(r.car.pos);
        r.car.group.rotation.y = r.car.yaw;
      }
      if (r.ribbon) {
        const m = r.ribbon.material as THREE.LineBasicMaterial;
        m.opacity = this.focusReq === r.id ? 0.95 : 0.45;
      }
    }
  }

  private camYaw(): number {
    const baseYaw = this.mode === 'plow' ? this.plowYaw : this.playerYaw;
    return baseYaw + this.camYawOff;
  }

  private updateCamera(dt: number, snap: boolean) {
    const target = this.mode === 'plow' ? this.plowPos : this.playerPos;
    const dist = this.mode === 'plow' ? this.camDist * 1.25 : this.camDist;
    const yaw = this.camYaw();
    const h = dist * 0.85;
    const px = target.x + Math.sin(yaw) * dist;
    const pz = target.z + Math.cos(yaw) * dist;
    const k = snap ? 1 : Math.min(1, dt * 5);
    this.camera.position.x += (px - this.camera.position.x) * k;
    this.camera.position.y += (target.y + h - this.camera.position.y) * k;
    this.camera.position.z += (pz - this.camera.position.z) * k;
    this.camera.lookAt(target.x, target.y + 1.2, target.z);
  }

  // ---------- input handlers ----------

  private resize = () => {
    const w = window.innerWidth, ht = window.innerHeight;
    this.renderer.setSize(w, ht);
    this.camera.aspect = w / ht;
    this.camera.updateProjectionMatrix();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyE') this.action(true);
    if (e.code === 'Space') { e.preventDefault(); this.throwSnowball(); }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyE') this.action(false);
  };

  private onPointerDown = (e: PointerEvent) => {
    const startX = e.clientX;
    let lastX = startX;
    const move = (ev: PointerEvent) => {
      this.camYawOff -= (ev.clientX - lastX) * 0.006;
      lastX = ev.clientX;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  private onWheel = (e: WheelEvent) => {
    this.camDist = Math.max(7, Math.min(22, this.camDist + e.deltaY * 0.01));
  };

  // ---------- HUD & minimap ----------

  private toast(text: string) {
    this.hudToast = { text, at: performance.now() };
    this.pushHud();
  }

  private pushHud() {
    const reqs: RequestInfo[] = this.requests
      .filter((r) => r.active && !r.resolved)
      .map((r) => {
        const house = this.world.houses[r.houseIdx];
        const dest = this.world.destinations[r.destIdx];
        return {
          id: r.id,
          family: house.family,
          dest: dest.name,
          color: r.color,
          phase: r.phase === 'stuck' ? 'stuck' as const : r.phase,
          secondsLeft: Math.max(0, r.deadline - this.dayClock),
          warmup: Math.max(0, r.warmup),
        };
      });
    this.onHud({
      screen: this.screen,
      day: this.day,
      timeLeft: Math.max(0, this.dayLength - this.dayClock),
      overtime: this.overtime,
      score: this.score,
      cheer: Math.round(this.cheer),
      snowfall: this.storm,
      mode: this.mode,
      actionLabel: this.actionLabel(),
      requests: reqs,
      toast: this.hudToast,
      frostAt: this.frostAt,
      summary: this.summary,
      bestStars: this.save.stars[this.day] ?? 0,
      fightHits: this.fightHits,
    });
  }

  private drawMinimaps() {
    if (this.minimap) this.drawMap(this.minimap);
    if (this.bigMap) this.drawMap(this.bigMap);
  }

  private drawMap(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const S = canvas.width;
    const t = S / GRID;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,18,30,0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, S * 0.06);
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const k = this.world.kind[gz * GRID + gx];
        if (k === ROAD || k === DRIVE || k === PAD) {
          const d = this.world.depth[gz * GRID + gx];
          const clear = 1 - Math.min(1, d / SNOW_START);
          if (k === ROAD) {
            ctx.fillStyle = `rgb(${Math.round(90 + clear * -40)},${Math.round(110 + clear * -45)},${Math.round(140 + clear * -60)})`;
            ctx.fillStyle = d > SNOW_STUCK ? '#e8eef8' : d > SNOW_DEPART ? '#9fb2cc' : '#3d4654';
          } else {
            ctx.fillStyle = d > SNOW_DEPART ? '#cdd9ea' : '#57606e';
          }
          ctx.fillRect(gx * t, gz * t, t + 0.5, t + 0.5);
        } else if (k === PARK) {
          ctx.fillStyle = 'rgba(90,140,120,0.25)';
          ctx.fillRect(gx * t, gz * t, t, t);
        } else if (k === BLOCKED) {
          ctx.fillStyle = 'rgba(200,180,150,0.28)';
          ctx.fillRect(gx * t, gz * t, t, t);
        }
      }
    }
    const w2m = (x: number) => ((x + WORLD / 2) / WORLD) * S;
    // routes
    for (const r of this.requests) {
      if (!r.active || r.resolved) continue;
      const pts = this.ribbonPoints.get(r.id);
      if (!pts || pts.length < 2) continue;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = this.focusReq === r.id ? 3 : 1.8;
      ctx.globalAlpha = this.focusReq === r.id ? 1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(w2m(pts[0].x), w2m(pts[0].z));
      for (const p of pts) ctx.lineTo(w2m(p.x), w2m(p.z));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (r.car) {
        ctx.fillStyle = r.phase === 'stuck' ? '#ff5566' : r.color;
        ctx.beginPath();
        ctx.arc(w2m(r.car.pos.x), w2m(r.car.pos.z), r.phase === 'stuck' ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // vehicles
    ctx.fillStyle = '#ff9a3d';
    ctx.beginPath();
    ctx.arc(w2m(this.plowPos.x), w2m(this.plowPos.z), 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5544';
    ctx.beginPath();
    ctx.arc(w2m(this.blowerPos.x), w2m(this.blowerPos.z), 2.6, 0, Math.PI * 2);
    ctx.fill();
    // player arrow
    const px = w2m(this.playerPos.x), pz = w2m(this.playerPos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-this.playerYaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(3.6, 4); ctx.lineTo(-3.6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
