// Clean Cut — the engine: rendering, driving, cutting, trimming, camera.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Audio } from './audio';
import { Environment } from './env';
import { Field, computePayout, RES, type Payout } from './field';
import { closestOnSeg, pointInPoly, angleWrap } from './geom';
import { Lawn } from './grass';
import { buildSite, DAY_END, DECK_HEIGHTS } from './lawns';
import { buildBeds, buildFence, buildHard, buildHouse, buildProp, buildRig, buildTree, buildTreeLine, sceneMaterials, type FlowerSet, type SceneMats } from './scenery';
import { buildColliders, houseFootprints, propShape, type Collider } from './shapes';
import { TexLib } from './textures';
import type { HudState, JobDef, Quality, SiteDef, Toast } from './types';
import { buildMower, buildPerson, buildTrimmer, poseOwner, poseSeated, poseWalk, vehicleMaterials, type Materials, type MowerRig, type PersonRig, type TrimmerRig } from './vehicle';
import { planLostCat, type LostCat } from './cats';
import { Bubble, buildCat, Hearts, type CatRig } from './catModel';
import { makeRng } from './rng';

export interface GameEvents {
  hud: (h: HudState) => void;
  toast: (text: string, tone: Toast['tone']) => void;
  timeUp: () => void;
  catHome?: (cat: LostCat) => void;
}

// pr = the most pixels we'll ever render; dynamic resolution scales down from there to hold the frame rate
const QUALITY: Record<Quality, { pr: number; minPr: number; shadow: number; msaa: number; post: boolean; aa: boolean; softShadow: boolean }> = {
  low: { pr: 0.8, minPr: 0.5, shadow: 1024, msaa: 0, post: false, aa: false, softShadow: false },
  medium: { pr: 1.0, minPr: 0.6, shadow: 2048, msaa: 0, post: false, aa: true, softShadow: false },
  high: { pr: 1.5, minPr: 0.75, shadow: 2048, msaa: 4, post: true, aa: false, softShadow: false },
  ultra: { pr: 2, minPr: 1, shadow: 4096, msaa: 4, post: true, aa: false, softShadow: true },
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uVig: { value: 0.32 }, uSat: { value: 1.12 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb *= vec3(1.03, 1.0, 0.96);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};

// ———————————————————————————————————————— particles

class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private max: number;
  private p: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private rot: Float32Array;
  private size: Float32Array;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private vs = new THREE.Vector3();
  private vp = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(max: number) {
    this.max = max;
    const g = new THREE.PlaneGeometry(0.045, 0.012);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.rot = new Float32Array(max * 3);
    this.size = new Float32Array(max);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, life = 2.5, size = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.life[i] = life;
    this.size[i] = size;
    this.mesh.setColorAt(i, color);
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.n;
        if (i !== last) {
          this.p.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.v.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.rot.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.life[i] = this.life[last];
          this.size[i] = this.size[last];
          this.mesh.getColorAt(last, this.col);
          this.mesh.setColorAt(i, this.col);
        }
        continue;
      }
      const o = i * 3;
      const grounded = this.p[o + 1] <= 0.03;
      if (!grounded) {
        this.v[o + 1] -= 9.8 * dt * 0.55;
        const drag = Math.exp(-dt * 2.2);
        this.v[o] *= drag;
        this.v[o + 2] *= drag;
        this.p[o] += this.v[o] * dt;
        this.p[o + 1] += this.v[o + 1] * dt;
        this.p[o + 2] += this.v[o + 2] * dt;
        this.rot[o] += dt * 9;
        this.rot[o + 1] += dt * 7;
        if (this.p[o + 1] < 0.03) {
          this.p[o + 1] = 0.03;
          this.rot[o] = Math.PI / 2;
          this.rot[o + 2] = 0;
        }
      }
      const s = this.size[i] * Math.min(1, this.life[i] * 1.5);
      this.e.set(this.rot[o], this.rot[o + 1], this.rot[o + 2]);
      this.q.setFromEuler(this.e);
      this.vs.set(s, s, s);
      this.vp.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.m4.compose(this.vp, this.q, this.vs);
      this.mesh.setMatrixAt(i, this.m4);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

// ———————————————————————————————————————— collision

function pushOut(x: number, z: number, r: number, colliders: Collider[], out: { x: number; z: number; tag: string | null; depth: number }) {
  out.x = 0;
  out.z = 0;
  out.tag = null;
  out.depth = 0;
  for (const c of colliders) {
    let dx = 0;
    let dz = 0;
    if (c.kind === 'circle') {
      const ex = x - c.x;
      const ez = z - c.z;
      const d = Math.hypot(ex, ez);
      const rr = r + c.r;
      if (d >= rr) continue;
      if (d < 1e-5) {
        dx = rr;
      } else {
        dx = (ex / d) * (rr - d);
        dz = (ez / d) * (rr - d);
      }
    } else if (c.kind === 'seg') {
      const [cx, cz] = closestOnSeg(x, z, c.ax, c.az, c.bx, c.bz);
      const ex = x - cx;
      const ez = z - cz;
      const d = Math.hypot(ex, ez);
      const rr = r + c.r;
      if (d >= rr) continue;
      if (d < 1e-5) continue;
      dx = (ex / d) * (rr - d);
      dz = (ez / d) * (rr - d);
    } else {
      // quick reject on bounds
      const pts = c.pts;
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const [px, pz] of pts) {
        if (px < minx) minx = px;
        if (px > maxx) maxx = px;
        if (pz < minz) minz = pz;
        if (pz > maxz) maxz = pz;
      }
      if (x < minx - r || x > maxx + r || z < minz - r || z > maxz + r) continue;
      const inside = pointInPoly(x, z, pts);
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [cx, cz] = closestOnSeg(x, z, pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
        const d = Math.hypot(x - cx, z - cz);
        if (d < best) {
          best = d;
          bx = cx;
          bz = cz;
        }
      }
      if (inside) {
        const ex = bx - x;
        const ez = bz - z;
        const d = Math.hypot(ex, ez) || 1e-5;
        dx = (ex / d) * (d + r);
        dz = (ez / d) * (d + r);
      } else {
        if (best >= r) continue;
        const ex = x - bx;
        const ez = z - bz;
        const d = best || 1e-5;
        dx = (ex / d) * (r - d);
        dz = (ez / d) * (r - d);
      }
    }
    const depth = Math.hypot(dx, dz);
    out.x += dx;
    out.z += dz;
    if (depth > out.depth) {
      out.depth = depth;
      out.tag = c.tag;
    }
  }
}

// ———————————————————————————————————————— the game

export function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

type Mode = 'idle' | 'attract' | 'play' | 'flyover';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly audio = new Audio();
  composer: EffectComposer;
  private post: boolean;
  private prMax: number;
  private prMin: number;
  private pr: number;
  private frameAvg = 16;
  private prTimer = 0;
  env: Environment;
  private lib = new TexLib();
  private vmats: Materials;
  private smats: SceneMats;
  private quality: Quality;
  private container: HTMLElement;
  private events: GameEvents;
  private timeU = { value: 0 };
  private raf = 0;
  private last = 0;
  private running = false;

  // world
  private world = new THREE.Group();
  private site: SiteDef | null = null;
  field: Field | null = null;
  private lawn: Lawn | null = null;
  private colliders: Collider[] = [];
  private blockers: THREE.Object3D[] = [];
  private flowers: FlowerSet | null = null;
  private anims: ((t: number) => void)[] = [];
  private particles: Particles;
  private mower: MowerRig;
  private person: PersonRig;
  private trimmer: TrimmerRig;
  private mowerShadow: THREE.Mesh;
  private personShadow: THREE.Mesh;
  job: JobDef | null = null;

  // state
  mode: Mode = 'idle';
  paused = false;
  minute = 8 * 60;
  money = 0;
  private timeUpFired = false;
  private mounted = true;
  private mx = 0;
  private mz = 0;
  private heading = 0;
  private speed = 0;
  private steer = 0;
  private blades = false;
  private bladeRpm = 0;
  private engineRpm = 0;
  deckIndex = 3;
  private px = 0;
  private pz = 0;
  private pFacing = 0;
  private pSpeed = 0;
  private walkPhase = 0;
  private trimRpm = 0;
  private trimSwing = 0;
  private trimLoad = 0;
  private cutLoad = 0;
  bumps = 0;
  private lastBump = 0;
  private lastFlowerToast = 0;
  private lastCutX = 0;
  private lastCutZ = 0;
  private stripeRun = 0;
  private stripeHeading = 0;
  private overlapFlash = 0;
  private overlapAcc = 0;
  private styleBonus = 0;
  private hudTimer = 0;
  private shake = 0;
  private highlight = 0;
  private groupsDoneCount = 0;
  private flyT = 0;
  private cut = { fresh: 0, overlap: 0, groupsDone: [] as number[] };
  private simT = 0;

  // input
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0 };
  private touchLook = { x: 0, y: 0 };
  private trigger = false;
  private mouseIdle = 99;
  camMode = 1;
  private camYaw = 0;
  private camPitch = 0.32;
  private camDist = 6.5;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private push = { x: 0, z: 0, tag: null as string | null, depth: 0 };
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapBg: HTMLCanvasElement | null = null;
  private minimapTimer = 0;

  // the lost cat (some jobs)
  lostCat: LostCat | null = null;
  catState: 'lost' | 'bolting' | 'carried' | 'home' = 'lost';
  private catRig: CatRig | null = null;
  private owner: PersonRig | null = null;
  private bubble: Bubble | null = null;
  private hearts = new Hearts();
  private catX = 0;
  private catZ = 0;
  private catHeading = 0;
  private catSpot = 0;
  private catWalk = 0;
  private catLook = 0;
  private boltFrom = { x: 0, z: 0 };
  private catMeow = 3;
  private catHeard = false;
  private catSpooked = false;
  private catHintAt = 0;
  private catParent: THREE.Object3D | null = null;
  private homeT = 0;
  private catCollider: Extract<Collider, { kind: 'circle' }> = { kind: 'circle', x: 1e6, z: 1e6, r: 0.32, tag: 'cat' };

  constructor(container: HTMLElement, quality: Quality, events: GameEvents) {
    this.container = container;
    this.quality = quality;
    this.events = events;
    const q = QUALITY[quality];
    const phone = isPhone();
    // phones: no half-float post chain, no baked environment — both are where mobile GPUs go black
    this.post = q.post && !phone;
    this.renderer = new THREE.WebGLRenderer({ antialias: q.aa, powerPreference: 'high-performance', stencil: false });
    this.prMax = Math.min(window.devicePixelRatio || 1, q.pr);
    this.prMin = Math.min(this.prMax, q.minPr);
    this.pr = this.prMax;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = q.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.lib.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.camera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 0.08, 1500);
    this.env = new Environment(this.renderer, this.scene, q.shadow, !phone && quality !== 'low');

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
    this.resize();

    this.vmats = vehicleMaterials();
    this.smats = sceneMaterials(this.lib, this.vmats, this.timeU);
    this.mower = buildMower(this.lib, this.vmats);
    this.person = buildPerson();
    this.trimmer = buildTrimmer(this.vmats);
    this.particles = new Particles(3500);
    const blob = this.lib.blob();
    const shadowMat = new THREE.MeshBasicMaterial({ map: blob, color: '#000', transparent: true, opacity: 0.5, depthWrite: false });
    this.mowerShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), shadowMat);
    this.mowerShadow.rotation.x = -Math.PI / 2;
    this.personShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), shadowMat);
    this.personShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('webglcontextlost', this.onContextLost, false);
  }

  /** The GPU dropped us (common on phones under memory pressure): say so instead of sitting on a black screen. */
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.events.toast('Graphics reset — reloading…', 'bad');
    setTimeout(() => window.location.reload(), 1200);
  };

  // ——————————————————————————— lifecycle

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.clearWorld();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.audio.dispose();
    this.env.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private clearWorld() {
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) m.geometry?.dispose();
    });
    this.world.clear();
    this.lawn?.dispose();
    this.lawn = null;
    this.anims = [];
    this.flowers = null;
    this.particles.clear();
    this.hearts.clear();
    this.lostCat = null;
    this.catRig = null;
    this.owner = null;
    this.bubble = null;
    this.catParent = null;
  }

  /** Build a yard. `attract` pre-mows it for the title screen. */
  async load(job: JobDef | null, mode: 'play' | 'attract', onProgress?: (p: number) => void) {
    this.clearWorld();
    this.job = job;
    const site = job ? buildSite(job.template, job.seed) : buildSite('estate', 4242);
    this.site = site;
    onProgress?.(0.1);
    await new Promise((r) => setTimeout(r, 0));
    const field = new Field(site);
    this.field = field;
    this.colliders = buildColliders(site);
    onProgress?.(0.25);
    await new Promise((r) => setTimeout(r, 0));

    const world = this.world;
    this.blockers = [];
    let seed = (job?.seed ?? 4242) * 7;
    for (const h of site.houses) {
      const { group } = buildHouse(h, this.smats, seed++);
      world.add(group);
      this.blockers.push(group);
    }
    onProgress?.(0.4);
    await new Promise((r) => setTimeout(r, 0));
    for (const t of site.trees) world.add(buildTree(t, this.smats, seed++));
    onProgress?.(0.55);
    await new Promise((r) => setTimeout(r, 0));
    for (const f of site.fences) {
      const g = buildFence(f, this.smats, seed++);
      world.add(g);
      if (f.kind !== 'hedge') this.blockers.push(g);
    }
    world.add(buildHard(site.hard, site.lines, this.smats));
    const beds = buildBeds(site.beds, this.smats, seed++);
    world.add(beds.group);
    this.flowers = beds.flowers;
    for (const p of site.props) {
      const { group, anim } = buildProp(p, this.smats, this.lib, seed++);
      world.add(group);
      if (anim) this.anims.push(anim);
      if (p.kind === 'shed' || p.kind === 'playset') this.blockers.push(group);
    }
    world.add(buildRig(this.smats, this.lib, site.trailer.x, site.trailer.z, site.trailer.heading));
    world.add(buildTreeLine(this.smats, site.world, seed++));
    onProgress?.(0.75);
    await new Promise((r) => setTimeout(r, 0));

    this.lawn = new Lawn(site, field, this.quality);
    world.add(this.lawn.group);
    world.add(this.mower.root, this.particles.mesh, this.mowerShadow, this.personShadow, this.trimmer.root, this.hearts.group);
    if (job && mode === 'play') this.setupCat(job, site);
    this.buildMinimapBg(site);

    // reset state
    this.mx = site.start.x;
    this.mz = site.start.z;
    this.heading = site.start.heading;
    this.speed = 0;
    this.steer = 0;
    this.blades = false;
    this.bladeRpm = 0;
    this.mounted = true;
    this.bumps = 0;
    this.styleBonus = 0;
    this.stripeRun = 0;
    this.groupsDoneCount = 0;
    this.timeUpFired = false;
    this.deckIndex = job ? Math.max(0, DECK_HEIGHTS.indexOf(job.heightIn)) : 3;
    this.mower.body.add(this.person.root);
    this.person.root.position.copy(this.mower.driverSeat).setY(this.mower.driverSeat.y - 0.86);
    this.trimmer.root.visible = false;
    this.camYaw = this.heading;
    this.camPitch = 0.32;
    this.camMode = 1;
    this.applyCamMode();
    this.camPos.set(this.mx - Math.cos(this.heading) * 7, 3, this.mz - Math.sin(this.heading) * 7);

    if (mode === 'attract') {
      this.premow(field, site);
      this.minute = 17 * 60 + 40;
    }
    // a play load waits, paused, until the shell sets the clock and says go — otherwise the
    // previous day's late clock can fire time-up while the truck is still "driving"
    this.paused = mode === 'play';
    this.mode = mode;
    await this.lib.ready();
    onProgress?.(1);
    // compile everything once so the first frame doesn't hitch
    this.env.setTime(this.minute, new THREE.Vector3(this.mx, 0, this.mz));
    this.renderer.compile(this.scene, this.camera);
  }

  /** Mow a showroom pattern into the title-screen lawn and park the mower at the edge of it. */
  private premow(field: Field, site: SiteDef) {
    const b = site.bounds;
    const w = 1.2;
    let lane = 0;
    let t = 0;
    const out = { fresh: 0, overlap: 0, groupsDone: [] as number[] };
    const stopZ = b.z1 - 6;
    let lastZ = b.z0;
    for (let z = b.z0 + w / 2; z < stopZ; z += w) {
      const fwd = lane % 2 === 0;
      for (let s = 0; s <= 1; s += 0.004) {
        const x = fwd ? b.x0 + (b.x1 - b.x0) * s : b.x1 - (b.x1 - b.x0) * s;
        field.deck(x, z, fwd ? 0 : Math.PI, 0.3, 0.66, 4, t, out);
        t += 0.01;
      }
      t += 3;
      lane++;
      lastZ = z;
    }
    this.mx = b.x0 + (b.x1 - b.x0) * 0.62;
    this.mz = lastZ + w + 0.2;
    this.heading = Math.PI;
    this.blades = true;
    this.bladeRpm = 1;
  }

  setQuality(q: Quality) {
    this.quality = q;
  }

  // ——————————————————————————— input

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'play' || this.paused) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    this.audio.start();
    if (k === ' ') {
      if (this.mounted) this.toggleBlades();
      else this.trigger = true;
    }
    if (k === 'r' || k === 'q') this.deck(1);
    if (k === 'f' && this.mounted) this.deck(-1);
    if (k === 'e') this.toggleMount();
    if (k === 'c') this.cycleCam();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === ' ' && !this.mounted) this.trigger = false;
  };

  private onBlur = () => {
    this.keys.clear();
    this.trigger = false;
  };

  private dragging = false;
  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== 'play' || this.paused) return;
    this.audio.start();
    if (e.button === 0 && !this.mounted) this.trigger = true;
    this.dragging = true;
    if (document.pointerLockElement !== this.renderer.domElement && !('ontouchstart' in window)) {
      void this.renderer.domElement.requestPointerLock?.();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.trigger = false;
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.mode !== 'play' || this.paused) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && !this.dragging) return;
    this.camYaw += e.movementX * 0.0032;
    this.camPitch = Math.max(-0.05, Math.min(1.35, this.camPitch + e.movementY * 0.0026));
    this.mouseIdle = 0;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'play') return;
    e.preventDefault();
    this.camDist = Math.max(2.8, Math.min(24, this.camDist * (1 + Math.sign(e.deltaY) * 0.1)));
  };

  setTouch(move: { x: number; y: number }, look: { x: number; y: number }) {
    this.touchMove = move;
    if (look.x || look.y) {
      this.camYaw += look.x * 0.006;
      this.camPitch = Math.max(-0.05, Math.min(1.35, this.camPitch + look.y * 0.005));
      this.mouseIdle = 0;
    }
  }

  setTrigger(on: boolean) {
    this.trigger = on;
    this.audio.start();
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  toggleBlades() {
    if (!this.mounted) return;
    this.blades = !this.blades;
    this.audio.bladesToggle(this.blades);
  }

  deck(dir: number) {
    const next = Math.max(0, Math.min(DECK_HEIGHTS.length - 1, this.deckIndex + dir));
    if (next !== this.deckIndex) {
      this.deckIndex = next;
      this.audio.tick();
    }
  }

  cycleCam() {
    this.camMode = (this.camMode + 1) % 4;
    this.applyCamMode();
    this.audio.tick();
  }

  private applyCamMode() {
    const presets = [
      [4.6, 0.26],
      [6.8, 0.33],
      [11, 0.45],
      [20, 1.18],
    ];
    const [d, p] = presets[this.camMode];
    this.camDist = d;
    this.camPitch = p;
  }

  toggleMount() {
    if (this.mode !== 'play') return;
    if (this.mounted) {
      if (Math.abs(this.speed) > 1.2) return;
      this.mounted = false;
      this.blades = false;
      this.speed = 0;
      this.mower.body.remove(this.person.root);
      this.world.add(this.person.root);
      const lx = -Math.sin(this.heading);
      const lz = Math.cos(this.heading);
      // step off on the left
      this.px = this.mx - lx * 1.05;
      this.pz = this.mz - lz * 1.05;
      this.pFacing = this.heading;
      this.trimmer.root.visible = true;
      this.events.toast('On foot — hold Space / click to trim', 'info');
    } else {
      if (Math.hypot(this.px - this.mx, this.pz - this.mz) > 2.6) {
        this.events.toast('Walk back to the mower to climb on', 'info');
        return;
      }
      this.mounted = true;
      this.trigger = false;
      this.world.remove(this.person.root);
      this.mower.body.add(this.person.root);
      this.person.root.position.copy(this.mower.driverSeat).setY(this.mower.driverSeat.y - 0.86);
      this.person.root.rotation.set(0, 0, 0);
      this.trimmer.root.visible = false;
    }
    this.audio.tick();
  }

  // ——————————————————————————— main loop

  private frame(dt: number) {
    const t = performance.now() / 1000;
    this.timeU.value = t;
    if (this.mode === 'play' && !this.paused) this.play(dt);
    else if (this.mode === 'attract') this.attract(dt, t);
    else if (this.mode === 'flyover') this.flyover(dt);
    if (this.mode !== 'idle') {
      this.updateVisuals(dt, t);
      const focus = this.mounted ? this.tmp.set(this.mx, 0, this.mz) : this.tmp.set(this.px, 0, this.pz);
      this.env.setTime(this.minute, focus);
      if (this.lawn) {
        this.camera.getWorldDirection(this.tmp2);
        this.lawn.update(t, this.camera.position, this.tmp2);
      }
      for (const a of this.anims) a(t);
      if (this.post) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
      this.adaptResolution(dt);
    }
  }

  /** Dynamic resolution: trade pixels for frame rate, smoothly, a step at a time. */
  private adaptResolution(dt: number) {
    if (dt <= 0 || dt >= 0.2) return;
    this.frameAvg = this.frameAvg * 0.95 + dt * 1000 * 0.05;
    this.prTimer += dt;
    if (this.prTimer < 1.2) return;
    this.prTimer = 0;
    let next = this.pr;
    if (this.frameAvg > 21 && this.pr > this.prMin) next = Math.max(this.prMin, this.pr - 0.1);
    else if (this.frameAvg < 14 && this.pr < this.prMax) next = Math.min(this.prMax, this.pr + 0.05);
    if (Math.abs(next - this.pr) > 0.001) {
      this.pr = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  private attract(dt: number, t: number) {
    const site = this.site;
    if (!site) return;
    const b = site.bounds;
    const cx = this.mx;
    const cz = this.mz;
    const a = t * 0.07;
    this.camera.position.set(cx + Math.cos(a) * 12, 3.2 + Math.sin(t * 0.13) * 0.6, cz + Math.sin(a) * 12);
    this.camera.lookAt(cx, 0.6, cz);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    void b;
    void dt;
  }

  private flyover(dt: number) {
    const site = this.site;
    if (!site) return;
    this.flyT += dt;
    const b = site.bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.62 + 6;
    const a = this.flyT * 0.12 + Math.PI / 2;
    this.camera.position.set(cx + Math.cos(a) * r, r * 0.42 + 4, cz + Math.sin(a) * r);
    this.camera.lookAt(cx, 0, cz);
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.audio.update(dt, { engineOn: true, rpm: 0.1, blade: 0, load: 0, trim: 0, trimLoad: 0, near: 0.35 });
  }

  private play(dt: number) {
    const field = this.field!;
    this.minute += dt; // one real second = one minute on the clock
    this.simT += dt;
    if (this.minute >= DAY_END && !this.timeUpFired) {
      this.timeUpFired = true;
      this.events.timeUp();
    }
    const k = this.keys;
    const up = k.has('w') || k.has('arrowup') ? 1 : 0;
    const down = k.has('s') || k.has('arrowdown') ? 1 : 0;
    const left = k.has('a') || k.has('arrowleft') ? 1 : 0;
    const right = k.has('d') || k.has('arrowright') ? 1 : 0;
    const throttle = Math.max(-1, Math.min(1, up - down - this.touchMove.y));
    const steerIn = Math.max(-1, Math.min(1, right - left + this.touchMove.x));
    this.mouseIdle += dt;
    this.cut.fresh = 0;
    this.cut.overlap = 0;
    this.cut.groupsDone.length = 0;

    if (this.mounted) this.driveMower(dt, throttle, steerIn, field);
    else this.walk(dt, throttle, steerIn, field);

    // trim-group completions
    for (const g of this.cut.groupsDone) {
      const grp = field.groups[g];
      this.groupsDoneCount++;
      if (!this.mounted || grp.total > 120) {
        this.audio.chime(this.groupsDoneCount);
        this.events.toast(`${grp.name} ✓ crisp`, 'gold');
        this.styleBonus += 2;
      }
    }
    // overlap warning
    this.overlapAcc = this.overlapAcc * Math.exp(-dt * 3) + this.cut.overlap;
    if (this.overlapAcc > 60) this.overlapFlash = 1;
    this.overlapFlash = Math.max(0, this.overlapFlash - dt * 1.5);

    this.updateCat(dt);
    this.updateCamera(dt);
    this.particles.update(dt);
    this.audio.update(dt, {
      engineOn: true,
      rpm: this.engineRpm,
      blade: this.bladeRpm,
      load: this.cutLoad,
      trim: this.mounted ? 0 : this.trimRpm,
      trimLoad: this.trimLoad,
      near: this.mounted ? 1 : Math.max(0.25, 1 - Math.hypot(this.px - this.mx, this.pz - this.mz) / 25),
    });
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.emitHud();
    }
  }

  private driveMower(dt: number, throttle: number, steerIn: number, field: Field) {
    const maxF = this.blades ? 4.4 : 5.6;
    const maxR = 2.2;
    if (throttle > 0) {
      if (this.speed < 0) this.speed = Math.min(0, this.speed + 9 * dt);
      else this.speed += (throttle * maxF - this.speed) * Math.min(1, dt * 1.5);
    } else if (throttle < 0) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - 9 * dt);
      else this.speed += (throttle * maxR - this.speed) * Math.min(1, dt * 2);
    } else {
      const f = 3.2 * dt;
      this.speed = Math.abs(this.speed) <= f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    const steerMax = 0.68 * (1 - 0.3 * Math.min(1, Math.abs(this.speed) / 5));
    this.steer += (steerIn * steerMax - this.steer) * Math.min(1, dt * 7);
    const yaw = (this.speed / 1.25) * Math.tan(this.steer);
    this.heading = angleWrap(this.heading + yaw * dt);
    const fx = Math.cos(this.heading);
    const fz = Math.sin(this.heading);
    this.mx += fx * this.speed * dt;
    this.mz += fz * this.speed * dt;

    // collide: three circles along the body
    let hitTag: string | null = null;
    let pushX = 0;
    let pushZ = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (const [off, r] of [[0.78, 0.48], [0.05, 0.6], [-0.62, 0.58]] as const) {
        const cx = this.mx + fx * off;
        const cz = this.mz + fz * off;
        pushOut(cx, cz, r, this.colliders, this.push);
        if (this.push.tag) {
          this.mx += this.push.x;
          this.mz += this.push.z;
          pushX += this.push.x;
          pushZ += this.push.z;
          hitTag = this.push.tag;
        }
      }
    }
    const W = this.site!.world;
    this.mx = Math.max(W.x0 + 2, Math.min(W.x1 - 2, this.mx));
    this.mz = Math.max(W.z0 + 2, Math.min(W.z1 - 2, this.mz));
    // only driving *into* something costs speed (sliding along a fence is fine)
    const into = -(pushX * fx + pushZ * fz) * Math.sign(this.speed);
    if (hitTag && into > 0.004) {
      const impact = Math.abs(this.speed);
      if (impact > 1.6 && hitTag !== 'cat' && hitTag !== 'neighbour' && performance.now() - this.lastBump > 900) {
        this.lastBump = performance.now();
        this.bumps++;
        this.shake = Math.min(1, impact / 4);
        this.audio.thud();
        this.events.toast(`Bumped the ${hitTag} −$4`, 'bad');
      }
      this.speed *= into > 0.03 ? 0.2 : 0.7;
    }

    // blades spin up/down; engine labours with load
    this.bladeRpm += ((this.blades ? 1 : 0) - this.bladeRpm) * Math.min(1, dt * (this.blades ? 2.2 : 1.4));
    const targetRpm = 0.25 + 0.45 * Math.min(1, Math.abs(throttle)) + 0.3 * this.bladeRpm;
    this.engineRpm += (targetRpm - this.engineRpm) * Math.min(1, dt * 3);

    // cutting — sub-step so fast driving never leaves gaps
    if (this.bladeRpm > 0.7) {
      const code = this.deckIndex + 1;
      const now = this.simT;
      const dcx = this.mx + fx * 0.06;
      const dcz = this.mz + fz * 0.06;
      const dist = Math.hypot(dcx - this.lastCutX, dcz - this.lastCutZ);
      const steps = Math.min(8, Math.max(1, Math.ceil(dist / 0.22)));
      for (let s = 1; s <= steps; s++) {
        const tt = dist > 3 ? 1 : s / steps;
        field.deck(this.lastCutX + (dcx - this.lastCutX) * tt, this.lastCutZ + (dcz - this.lastCutZ) * tt, this.heading, 0.34, 0.66, code, now, this.cut);
      }
      this.lastCutX = dcx;
      this.lastCutZ = dcz;
      this.cutLoad += (Math.min(1, this.cut.fresh / 40) - this.cutLoad) * Math.min(1, dt * 6);
      // clippings out of the chute
      const n = Math.min(14, Math.round(this.cut.fresh * 0.18 + (this.cut.overlap > 0 ? 0.3 : 0)));
      if (n > 0) {
        this.mower.root.updateMatrixWorld();
        const mouth = this.tmp.copy(this.mower.chuteMouth).applyMatrix4(this.mower.root.matrixWorld);
        const rx = -fz;
        const rz = fx;
        const col = new THREE.Color();
        for (let i = 0; i < n; i++) {
          col.setRGB(0.09 + Math.random() * 0.06, 0.22 + Math.random() * 0.1, 0.04);
          const sp = 2.5 + Math.random() * 2.5;
          this.particles.spawn(
            mouth.x, mouth.y, mouth.z,
            rx * sp + fx * this.speed * 0.8 + (Math.random() - 0.5) * 1.2,
            0.8 + Math.random() * 1.6,
            rz * sp + fz * this.speed * 0.8 + (Math.random() - 0.5) * 1.2,
            col, 1.5 + Math.random() * 2.5, 0.8 + Math.random() * 0.6,
          );
        }
      }
      // stripe runs: straight, fresh, blades down
      const turning = Math.abs(this.steer) > 0.07;
      if (this.cut.fresh > 4 && !turning && Math.abs(angleWrap(this.heading - this.stripeHeading)) < 0.1) {
        this.stripeRun += Math.abs(this.speed) * dt;
      } else {
        this.endStripe();
        this.stripeHeading = this.heading;
      }
    } else {
      this.lastCutX = this.mx + fx * 0.06;
      this.lastCutZ = this.mz + fz * 0.06;
      this.cutLoad *= Math.exp(-dt * 5);
      this.endStripe();
    }

    // wheels through beds
    let trampled = 0;
    const rx = -fz;
    const rz = fx;
    for (const [off, side] of [[-0.55, 0.47], [-0.55, -0.47], [0.7, 0.38], [0.7, -0.38]] as const) {
      trampled += field.trample(this.mx + fx * off + rx * side, this.mz + fz * off + rz * side, 0.16);
    }
    if (this.flowers) this.crushFlowers(this.mx, this.mz, fx, fz, 0.95);
    if (trampled > 0 && performance.now() - this.lastFlowerToast > 2500) {
      this.lastFlowerToast = performance.now();
      this.events.toast('Off the flower bed!', 'bad');
    }
  }

  private endStripe() {
    if (this.stripeRun >= 8) {
      const m = Math.round(this.stripeRun);
      this.styleBonus += Math.min(6, m / 4);
      this.audio.stripe();
      this.events.toast(`Clean stripe · ${m} m`, 'good');
    }
    this.stripeRun = 0;
  }

  private crushFlowers(x: number, z: number, fx: number, fz: number, r: number) {
    const fl = this.flowers!;
    const m4 = new THREE.Matrix4();
    let changed = false;
    const col = new THREE.Color();
    for (let i = 0; i < fl.alive.length; i++) {
      if (!fl.alive[i]) continue;
      const dx = fl.pos[i * 2] - x;
      const dz = fl.pos[i * 2 + 1] - z;
      if (Math.abs(dx) > 1.6 || Math.abs(dz) > 1.6) continue;
      const u = dx * fx + dz * fz;
      const v = -dx * fz + dz * fx;
      if (Math.abs(u) > r + 0.4 || Math.abs(v) > 0.66) continue;
      fl.alive[i] = 0;
      fl.mesh.getColorAt(i, col);
      fl.mesh.getMatrixAt(i, m4);
      m4.scale(new THREE.Vector3(0, 0, 0));
      fl.mesh.setMatrixAt(i, m4);
      changed = true;
      for (let k = 0; k < 5; k++) this.particles.spawn(fl.pos[i * 2], 0.25, fl.pos[i * 2 + 1], (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, col, 2.5, 0.7);
    }
    if (changed) fl.mesh.instanceMatrix.needsUpdate = true;
  }

  private walk(dt: number, fwdIn: number, sideIn: number, field: Field) {
    if (this.trigger && this.catState === 'carried' && this.lostCat) {
      this.trigger = false;
      if (performance.now() - this.catHintAt > 3000) {
        this.catHintAt = performance.now();
        this.events.toast(`Can't trim while you're holding ${this.lostCat.name}!`, 'info');
      }
    }
    // camera-relative movement, like any third-person game
    const cy = this.camYaw;
    const fx = Math.cos(cy);
    const fz = Math.sin(cy);
    const rx = -fz;
    const rz = fx;
    let mvx = fx * fwdIn + rx * sideIn;
    let mvz = fz * fwdIn + rz * sideIn;
    const ml = Math.hypot(mvx, mvz);
    const run = this.keys.has('shift');
    const target = ml > 0.05 ? (run && !this.trigger ? 3.6 : this.trigger ? 1.25 : 2.1) * Math.min(1, ml) : 0;
    this.pSpeed += (target - this.pSpeed) * Math.min(1, dt * 8);
    if (ml > 0.05) {
      mvx /= ml;
      mvz /= ml;
      // while trimming, keep facing the work and strafe
      if (!this.trigger) {
        const want = Math.atan2(mvz, mvx);
        this.pFacing = angleWrap(this.pFacing + angleWrap(want - this.pFacing) * Math.min(1, dt * 10));
      } else {
        const want = Math.atan2(mvz, mvx);
        const diff = angleWrap(want - this.pFacing);
        if (Math.abs(diff) < 2.2) this.pFacing = angleWrap(this.pFacing + diff * Math.min(1, dt * 2.5));
      }
      this.px += mvx * this.pSpeed * dt;
      this.pz += mvz * this.pSpeed * dt;
    }
    for (let iter = 0; iter < 2; iter++) {
      pushOut(this.px, this.pz, 0.28, this.colliders, this.push);
      this.px += this.push.x;
      this.pz += this.push.z;
      // the mower is an obstacle on foot
      const dx = this.px - this.mx;
      const dz = this.pz - this.mz;
      const d = Math.hypot(dx, dz);
      if (d < 1.15 && d > 1e-4) {
        this.px = this.mx + (dx / d) * 1.15;
        this.pz = this.mz + (dz / d) * 1.15;
      }
    }
    this.walkPhase += this.pSpeed * dt * 4.2;

    // trimmer
    this.trimRpm += ((this.trigger ? 1 : 0.12) - this.trimRpm) * Math.min(1, dt * (this.trigger ? 6 : 3));
    this.trimSwing = this.trigger ? Math.sin(performance.now() / 1000 * 4.2) : this.trimSwing * Math.exp(-dt * 4);
    const pf = this.pFacing;
    const pfx = Math.cos(pf);
    const pfz = Math.sin(pf);
    let hx = this.px + pfx * 1.02 + -pfz * this.trimSwing * 0.42;
    let hz = this.pz + pfz * 1.02 + pfx * this.trimSwing * 0.42;
    // the head can kiss walls and trunks but not pass through them
    pushOut(hx, hz, 0.06, this.colliders, this.push);
    hx += this.push.x;
    hz += this.push.z;
    this.trimHead.set(hx, 0.05, hz);
    this.trimLoad *= Math.exp(-dt * 8);
    if (this.trigger && this.trimRpm > 0.5) {
      const before = this.cut.fresh;
      field.trim(hx, hz, 0.23, pf, this.cut);
      const fresh = this.cut.fresh - before;
      this.trimLoad = Math.min(1, this.trimLoad + fresh * 0.04);
      const n = Math.min(10, Math.round(fresh * 0.5) + (Math.random() < 0.3 ? 1 : 0));
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3;
        col.setRGB(0.1 + Math.random() * 0.08, 0.24 + Math.random() * 0.1, 0.05);
        this.particles.spawn(hx, 0.08, hz, Math.cos(a) * sp, 0.6 + Math.random() * 1.6, Math.sin(a) * sp, col, 1.2 + Math.random() * 1.8, 0.7 + Math.random() * 0.5);
      }
      if (fresh > 0) this.shake = Math.max(this.shake, 0.06);
    }
    // the mower idles while you're off it
    this.bladeRpm *= Math.exp(-dt * 1.5);
    this.engineRpm += (0.22 - this.engineRpm) * Math.min(1, dt * 2);
    this.cutLoad *= Math.exp(-dt * 5);
    this.speed = 0;
  }

  private trimHead = new THREE.Vector3();

  // ——————————————————————————— camera

  private updateCamera(dt: number) {
    const onFoot = !this.mounted;
    const tx = onFoot ? this.px : this.mx;
    const tz = onFoot ? this.pz : this.mz;
    const ty = onFoot ? 1.55 : 1.35;
    const moving = onFoot ? this.pSpeed > 0.3 : Math.abs(this.speed) > 0.4;
    // GTA: the camera drifts back behind the vehicle once you stop steering it with the mouse
    if (!onFoot && this.mouseIdle > 1.1 && moving && this.camMode !== 3 && this.speed > 0) {
      const k = Math.min(1, dt * (0.6 + Math.abs(this.speed) * 0.35));
      this.camYaw = angleWrap(this.camYaw + angleWrap(this.heading - this.camYaw) * k);
    }
    const dist = onFoot ? Math.min(this.camDist, 4.2) : this.camDist;
    const pitch = this.camPitch;
    const back = Math.cos(pitch) * dist;
    const desired = this.tmp.set(tx - Math.cos(this.camYaw) * back, ty + Math.sin(pitch) * dist, tz - Math.sin(this.camYaw) * back);
    if (onFoot) {
      // over the right shoulder
      desired.x += -Math.sin(this.camYaw) * 0.55;
      desired.z += Math.cos(this.camYaw) * 0.55;
    }
    // don't put the camera inside the house
    const origin = this.tmp2.set(tx, ty, tz);
    const dir = desired.clone().sub(origin);
    const len = dir.length();
    dir.normalize();
    this.ray.set(origin, dir);
    this.ray.far = len;
    const hits = this.blockers.length ? this.ray.intersectObjects(this.blockers, true) : [];
    if (hits.length) desired.copy(origin).addScaledVector(dir, Math.max(1.2, hits[0].distance - 0.35));
    desired.y = Math.max(0.45, desired.y);
    const k = 1 - Math.exp(-dt * (onFoot ? 12 : 9));
    this.camPos.lerp(desired, k);
    const look = new THREE.Vector3(tx, ty - 0.25, tz);
    if (!onFoot) {
      look.x += Math.cos(this.heading) * Math.min(2, Math.abs(this.speed) * 0.4) * Math.sign(this.speed);
      look.z += Math.sin(this.heading) * Math.min(2, Math.abs(this.speed) * 0.4) * Math.sign(this.speed);
    }
    if (this.camMode === 3) look.y = 0;
    this.camLook.lerp(look, 1 - Math.exp(-dt * 10));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.12;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.camera.lookAt(this.camLook);
    const fov = 56 + (onFoot ? 0 : Math.abs(this.speed) * 1.4);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  // ——————————————————————————— visuals

  private updateVisuals(dt: number, t: number) {
    const m = this.mower;
    m.root.position.set(this.mx, 0, this.mz);
    m.root.rotation.y = -this.heading;
    for (const w of m.wheels) w.obj.rotation.z -= (this.speed * dt) / w.r;
    for (const p of m.frontPivots) p.rotation.y = -this.steer;
    m.steering.rotation.order = 'ZYX';
    m.steering.rotation.y = -this.steer * 2.6;
    m.deck.position.y = 0.1 + this.deckIndex * 0.018;
    m.lever.rotation.z = 0.6 - this.deckIndex * 0.22;
    m.body.position.y = Math.sin(t * 40) * 0.0025 * (0.3 + this.engineRpm) + Math.sin(t * 7.3) * 0.002 * Math.abs(this.speed);
    m.body.rotation.z = -this.speed * 0.004 + Math.sin(t * 2.1) * 0.003 * Math.abs(this.speed);
    m.body.rotation.x = this.steer * this.speed * 0.012;
    const lensI = Math.max(0.6, (1 - this.env.sunDir.y) * 3);
    for (const h of m.headlights) (h.material as THREE.MeshStandardMaterial).emissiveIntensity = lensI;
    this.mowerShadow.position.set(this.mx + Math.cos(this.heading) * 0.05, 0.035, this.mz + Math.sin(this.heading) * 0.05);
    this.mowerShadow.rotation.z = -this.heading;

    // pushers flatten grass under wheels and boots
    if (this.lawn) {
      const pu = this.lawn.uniforms.uPush.value;
      const fx = Math.cos(this.heading);
      const fz = Math.sin(this.heading);
      pu[0].set(this.mx - fx * 0.5, this.mz - fz * 0.5, 0.9, 1);
      pu[1].set(this.mx + fx * 0.65, this.mz + fz * 0.65, 0.7, 1);
      if (!this.mounted) {
        pu[2].set(this.px, this.pz, 0.45, 1);
        pu[3].set(this.trimHead.x, this.trimHead.z, 0.35, this.trimRpm > 0.5 && this.trigger ? 1 : 0);
      } else {
        pu[2].set(0, 0, 0.01, 0);
        pu[3].set(0, 0, 0.01, 0);
      }
      const hlTarget = this.mode === 'play' && !this.mounted ? 1 : 0;
      this.highlight += (hlTarget - this.highlight) * Math.min(1, dt * 3);
      this.lawn.uniforms.uHighlight.value = this.highlight;
    }

    if (this.mounted) {
      poseSeated(this.person, this.steer, Math.sin(t * 7) * Math.abs(this.speed) * 0.2);
      this.personShadow.visible = false;
    } else {
      const p = this.person;
      p.root.position.set(this.px, 0, this.pz);
      p.root.rotation.set(0, -this.pFacing, 0);
      const carrying = this.catState === 'carried' && !!this.lostCat;
      poseWalk(p, this.walkPhase, Math.min(1, this.pSpeed / 2), this.trigger, this.trimSwing, carrying);
      this.trimmer.root.visible = !carrying;
      this.personShadow.visible = true;
      this.personShadow.position.set(this.px, 0.036, this.pz);
      // trimmer from the hip to the head
      const tr = this.trimmer;
      const pfx = Math.cos(this.pFacing);
      const pfz = Math.sin(this.pFacing);
      const base = new THREE.Vector3(this.px + pfx * 0.18 + -pfz * 0.22, 0.92, this.pz + pfz * 0.18 + pfx * 0.22);
      const dir = this.trimHead.clone().sub(base);
      const len = dir.length();
      dir.normalize();
      tr.root.position.copy(base);
      tr.root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      tr.root.scale.set(len / 1.35, 1, 1);
      tr.head.quaternion.copy(tr.root.quaternion).invert();
      tr.head.scale.set(1.35 / len, 1, 1);
      tr.head.rotation.y += t * 40;
      const lm = tr.line.material as THREE.MeshBasicMaterial;
      lm.opacity = this.trimRpm > 0.4 ? 0.22 + Math.random() * 0.08 : 0;
    }
    m.bladeDisc.visible = false;
    this.catVisuals(dt, t);
  }

  // ——————————————————————————— HUD + minimap

  private emitHud() {
    const f = this.field!;
    this.events.hud({
      mode: this.mounted ? 'mower' : 'foot',
      clock: this.minute,
      money: this.money,
      coverage: f.coverage,
      efficiency: f.efficiency,
      edges: f.edgeCoverage,
      speedMph: Math.abs(this.speed) * 2.237,
      blades: this.blades,
      bladeRpm: this.bladeRpm,
      deckIndex: this.deckIndex,
      heightIn: DECK_HEIGHTS[this.deckIndex],
      nearMower: !this.mounted && Math.hypot(this.px - this.mx, this.pz - this.mz) < 2.6,
      trimming: !this.mounted && this.trigger,
      camMode: this.camMode,
      stripeRun: this.stripeRun,
      overlapFlash: this.overlapFlash,
      cat: this.lostCat
        ? { name: this.lostCat.name, coat: this.lostCat.coat, owner: this.lostCat.owner, reward: this.lostCat.reward, state: this.catState === 'bolting' ? 'lost' : this.catState }
        : null,
      nearCat: this.mounted && !!this.lostCat && this.catState === 'lost' && Math.hypot(this.catX - this.mx, this.catZ - this.mz) < 3.5,
    });
  }

  private buildMinimapBg(site: SiteDef) {
    const W = site.world;
    const ppm = 3;
    const c = document.createElement('canvas');
    c.width = Math.ceil((W.x1 - W.x0) * ppm);
    c.height = Math.ceil((W.z1 - W.z0) * ppm);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#34512a';
    ctx.fillRect(0, 0, c.width, c.height);
    const tx = (x: number) => (x - W.x0) * ppm;
    const tz = (z: number) => (z - W.z0) * ppm;
    const poly = (p: [number, number][], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      p.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
      ctx.closePath();
      ctx.fill();
    };
    for (const h of site.hard) poly(h.poly, h.kind === 'road' || h.kind === 'parking' ? '#3b3e42' : h.kind === 'curb' ? '#9a9a96' : '#8d8b84');
    for (const b of site.beds) poly(b.poly, '#6b4a30');
    for (const h of site.houses) for (const p of houseFootprints(h)) poly(p, '#1d1f22');
    for (const p of site.props) {
      const sh = propShape(p);
      if (sh.poly) poly(sh.poly, '#2a2c2f');
      else if (sh.circle) {
        ctx.fillStyle = '#d8d4c4';
        ctx.beginPath();
        ctx.arc(tx(p.x), tz(p.z), Math.max(1.5, sh.circle.r * ppm), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#c8b48a';
    ctx.lineWidth = 1.5;
    for (const f of site.fences) {
      ctx.beginPath();
      f.pts.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
      ctx.stroke();
    }
    for (const t of site.trees) {
      ctx.fillStyle = 'rgba(20,45,15,0.75)';
      ctx.beginPath();
      ctx.arc(tx(t.x), tz(t.z), t.crown * ppm * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3b22';
      ctx.beginPath();
      ctx.arc(tx(t.x), tz(t.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    this.minimapBg = c;
    const f = this.field!;
    const lc = document.createElement('canvas');
    lc.width = f.w;
    lc.height = f.h;
    this.minimapCanvas = lc;
    this.minimapTimer = 0;
  }

  /** Data for the radar: background, live lawn overlay, positions. */
  minimap() {
    const f = this.field;
    if (!f || !this.minimapCanvas || !this.minimapBg || !this.site) return null;
    const now = performance.now();
    if (now - this.minimapTimer > 300) {
      this.minimapTimer = now;
      const ctx = this.minimapCanvas.getContext('2d')!;
      const img = ctx.createImageData(f.w, f.h);
      const d = img.data;
      for (let i = 0; i < f.n; i++) {
        if (!f.grass[i]) continue;
        const o = i * 4;
        const hgt = f.height[i];
        if (hgt === 255) {
          d[o] = 176; d[o + 1] = 168; d[o + 2] = 64; d[o + 3] = 255;
        } else {
          const vz = f.tex[o + 3] / 127.5 - 1;
          const vx = f.tex[o + 2] / 127.5 - 1;
          const s = vz * 0.8 + vx * 0.2;
          const l = 1 + s * 0.35;
          d[o] = 52 * l; d[o + 1] = 150 * l; d[o + 2] = 48 * l; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    const W = this.site.world;
    return {
      bg: this.minimapBg,
      bgBox: [W.x0, W.z0, W.x1 - W.x0, W.z1 - W.z0] as const,
      lawn: this.minimapCanvas,
      lawnBox: [f.x0, f.z0, f.w / RES, f.h / RES] as const,
      x: this.mounted ? this.mx : this.px,
      z: this.mounted ? this.mz : this.pz,
      heading: this.mounted ? this.heading : this.pFacing,
      camYaw: this.camYaw,
      mower: { x: this.mx, z: this.mz, heading: this.heading },
      onFoot: !this.mounted,
      owner: this.lostCat && this.catState !== 'home' ? { x: this.lostCat.ownerAt.x, z: this.lostCat.ownerAt.z, urgent: this.catState === 'carried' } : null,
    };
  }

  // ——————————————————————————— finishing

  finishJob(): Payout | null {
    if (!this.field || !this.job) return null;
    const wanted = Math.max(0, DECK_HEIGHTS.indexOf(this.job.heightIn));
    const p = computePayout(this.field, this.job.pay, this.job.pattern, wanted, this.bumps);
    // straight-stripe and crisp-edge flourishes add a little to the tip
    const flourish = Math.round(Math.min(this.job.pay * 0.08, this.styleBonus * 0.6) * p.success);
    p.tip += flourish;
    p.earned += flourish;
    const cat = this.catHome;
    if (cat) p.earned += cat.reward;
    this.mode = 'flyover';
    this.flyT = 0;
    this.blades = false;
    this.releasePointer();
    this.keys.clear();
    this.trigger = false;
    return p;
  }

  /** The cat you brought home this job, if any — its reward is already in the payout. */
  get catHome() {
    return this.lostCat && this.catState === 'home' ? this.lostCat : null;
  }

  // ——————————————————————————— the lost cat

  private setupCat(job: JobDef, site: SiteDef) {
    const plan = planLostCat(job, site);
    if (!plan) return;
    this.lostCat = plan;
    this.catState = 'lost';
    this.catSpot = 0;
    [this.catX, this.catZ] = plan.spots[0];
    this.catHeading = Math.random() * Math.PI * 2;
    this.catMeow = 4;
    this.catHeard = false;
    this.catSpooked = false;
    this.homeT = 0;
    this.catRig = buildCat(plan.coat);
    this.catRig.root.scale.setScalar(1.25); // storybook-sized, so it reads from the mower
    this.world.add(this.catRig.root);
    this.catParent = this.world;
    // the owner, in their own clothes
    const r = makeRng((job.seed ^ 0x0a11ce) >>> 0);
    this.owner = buildPerson({
      skin: r.pick(['#f1c9a5', '#c58a64', '#8d5a3b', '#e8b48c', '#5c3a24']),
      shirt: r.pick(['#e85d9a', '#7e57c2', '#2f80ed', '#f2994a', '#27ae60', '#eb5757']),
      pants: r.pick(['#3a4656', '#6b5b4b', '#2d3142', '#8e7d6a']),
      hair: r.pick(['#3a2a1c', '#c9c4bd', '#8a5a2b', '#121212', '#e0b860']),
      cap: null,
      vest: false,
      muffs: false,
      shades: false,
    });
    this.owner.root.position.set(plan.ownerAt.x, 0, plan.ownerAt.z);
    this.owner.root.rotation.y = -plan.ownerAt.facing;
    this.world.add(this.owner.root);
    this.bubble = new Bubble();
    this.bubble.set(`Have you seen ${plan.name}?`);
    this.bubble.sprite.position.set(plan.ownerAt.x, 2.35, plan.ownerAt.z);
    this.world.add(this.bubble.sprite);
    this.colliders.push({ kind: 'circle', x: plan.ownerAt.x, z: plan.ownerAt.z, r: 0.35, tag: 'neighbour' });
    this.catCollider = { kind: 'circle', x: this.catX, z: this.catZ, r: 0.32, tag: 'cat' };
    this.colliders.push(this.catCollider);
  }

  private updateCat(dt: number) {
    const c = this.lostCat;
    if (!c || !this.catRig) return;
    const ux = this.mounted ? this.mx : this.px;
    const uz = this.mounted ? this.mz : this.pz;
    const d = Math.hypot(this.catX - ux, this.catZ - uz);
    if (this.catState === 'lost') {
      this.catMeow -= dt;
      if (this.catMeow <= 0) {
        this.catMeow = 4.5 + Math.random() * 4;
        // follow the meows: louder as you get close
        this.audio.meow(Math.max(0, 1 - d / 40), 1.05);
      }
      if (d < 9 && !this.catHeard) {
        this.catHeard = true;
        this.catMeow = Math.min(this.catMeow, 0.6);
        this.events.toast('Mrrrow? Something is meowing close by…', 'info');
      }
      if (this.mounted && d < 4.5 && Math.abs(this.speed) > 0.6 && this.catSpot < c.spots.length - 1) {
        // the mower is loud and scary: off it goes to another hiding place
        this.catSpot++;
        this.catState = 'bolting';
        this.boltFrom = { x: this.catX, z: this.catZ };
        this.audio.meow(1, 1.3);
        if (!this.catSpooked) {
          this.catSpooked = true;
          this.events.toast(`${c.name} got scared of the mower! Hop off and tiptoe up.`, 'bad');
        }
      } else if (!this.mounted && d < 1.05) {
        this.catState = 'carried';
        this.audio.meow(1, 1.15);
        this.audio.purr(3);
        this.audio.chime(2);
        this.hearts.burst(new THREE.Vector3(this.px, 1.4, this.pz), 8);
        this.styleBonus += 2;
        this.events.toast(`You found ${c.name}! ♥`, 'gold');
        setTimeout(() => this.lostCat === c && this.events.toast(`Take ${c.name} back to ${c.owner}`, 'info'), 1600);
        this.bubble?.set(`${c.name}!! ♥`, 'happy');
      } else if (this.mounted && d < 3.5 && performance.now() - this.catHintAt > 6000) {
        this.catHintAt = performance.now();
        this.events.toast(`Hop off (E) to pick up ${c.name}`, 'info');
      }
      // watch you come closer
      if (d < 7) {
        const want = Math.atan2(uz - this.catZ, ux - this.catX);
        this.catLook = Math.max(-0.9, Math.min(0.9, -angleWrap(want - this.catHeading)));
      } else this.catLook *= Math.exp(-dt * 2);
    } else if (this.catState === 'bolting') {
      const [tx, tz] = c.spots[this.catSpot];
      const dx = tx - this.catX;
      const dz = tz - this.catZ;
      const dl = Math.hypot(dx, dz);
      const step = 5.5 * dt;
      this.catHeading = Math.atan2(dz, dx);
      this.catWalk += dt * 22;
      this.catLook = 0;
      if (dl <= step) {
        this.catX = tx;
        this.catZ = tz;
        this.catState = 'lost';
        this.catHeading = Math.atan2(this.boltFrom.z - tz, this.boltFrom.x - tx);
        this.catMeow = 2.5;
      } else {
        this.catX += (dx / dl) * step;
        this.catZ += (dz / dl) * step;
      }
    } else if (this.catState === 'carried') {
      const o = c.ownerAt;
      if (Math.hypot(o.x - ux, o.z - uz) < 2.9) this.reunite();
    } else {
      this.homeT += dt;
    }
    const free = this.catState === 'lost' || this.catState === 'bolting';
    this.catCollider.x = free ? this.catX : 1e6;
    this.catCollider.z = free ? this.catZ : 1e6;
  }

  private reunite() {
    const c = this.lostCat!;
    this.catState = 'home';
    this.homeT = 0;
    this.audio.reunite();
    this.audio.purr(4);
    setTimeout(() => this.audio.meow(0.9, 1.2), 700);
    this.hearts.burst(new THREE.Vector3(c.ownerAt.x, 1.6, c.ownerAt.z), 22, 0.9);
    this.styleBonus += 4;
    this.bubble?.set('Thank you!! ♥', 'happy');
    this.events.toast(`${c.name} is home! ${c.owner} gives you $${c.reward} ♥`, 'gold');
    this.events.catHome?.(c);
  }

  private catVisuals(dt: number, t: number) {
    this.hearts.update(dt);
    const c = this.lostCat;
    const rig = this.catRig;
    if (!c || !rig) return;
    const ux = this.mounted ? this.mx : this.px;
    const uz = this.mounted ? this.mz : this.pz;
    // whoever is holding the cat decides where it sits
    let parent: THREE.Object3D = this.world;
    if (this.catState === 'carried') parent = this.mounted ? this.mower.body : this.person.torso;
    else if (this.catState === 'home' && this.owner) parent = this.owner.torso;
    if (parent !== this.catParent) {
      parent.add(rig.root);
      this.catParent = parent;
    }
    if (parent === this.world) {
      rig.root.position.set(this.catX, 0, this.catZ);
      rig.root.rotation.set(0, -this.catHeading, 0);
      rig.root.scale.setScalar(1.25);
      const close = !this.mounted && Math.hypot(this.catX - ux, this.catZ - uz) < 5;
      rig.animate(t, this.catState === 'bolting' ? 'walk' : close ? 'stand' : 'loaf', this.catWalk, this.catLook);
    } else if (parent === this.mower.body) {
      // riding up front on the hood like a little hood ornament
      rig.root.position.set(0.52, 0.86, 0);
      rig.root.rotation.set(0, 0, 0);
      rig.root.scale.setScalar(1.25);
      rig.animate(t, 'loaf', 0, Math.sin(t * 0.5) * 0.4);
    } else {
      // cradled in someone's arms
      rig.root.position.set(0.24, 0.12, 0.08);
      rig.root.rotation.set(0, Math.PI / 2, 0);
      rig.root.scale.setScalar(1.1);
      rig.animate(t, 'held', 0, -0.6 + Math.sin(t * 0.8) * 0.2);
    }
    const o = this.owner;
    if (o) {
      const oa = c.ownerAt;
      const near = Math.hypot(oa.x - ux, oa.z - uz) < 14;
      let mood: 'worried' | 'excited' | 'cuddle' = 'worried';
      if (this.catState === 'home') mood = this.homeT < 2.5 ? 'excited' : 'cuddle';
      else if (this.catState === 'carried' && near) mood = 'excited';
      o.root.rotation.y = -(mood === 'worried' ? oa.facing : Math.atan2(uz - oa.z, ux - oa.x));
      poseOwner(o, t, mood);
      // held up high while they celebrate
      if (this.catState === 'home' && mood === 'excited') rig.root.position.set(0.2, 0.45, 0);
    }
    if (this.bubble) {
      const b = this.bubble.sprite;
      b.visible = this.catState !== 'home' || this.homeT < 6;
      b.position.y = 2.35 + Math.sin(t * 2.5) * (this.catState === 'carried' ? 0.08 : 0.03);
      const sc = this.catState === 'carried' ? 1.25 : 1;
      b.scale.set(2.6 * sc, 0.82 * sc, 1);
    }
    if (this.catState === 'home' && this.homeT < 6 && Math.random() < dt * 2.2) {
      this.hearts.burst(new THREE.Vector3(c.ownerAt.x, 1.7, c.ownerAt.z), 1, 0.5);
    }
  }

  get styleEarned() {
    return Math.round(this.styleBonus);
  }

  setIdle() {
    this.mode = 'idle';
    this.clearWorld();
    this.audio.update(0, { engineOn: false, rpm: 0, blade: 0, load: 0, trim: 0, trimLoad: 0, near: 0 });
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.keys.clear();
      this.trigger = false;
      this.releasePointer();
      this.audio.update(0, { engineOn: false, rpm: 0, blade: 0, load: 0, trim: 0, trimLoad: 0, near: 0 });
    }
  }
}
