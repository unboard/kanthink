import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from '@/lib/kan/city/layout';
import { BLOCK, CELL, GAP, Grid, PITCH, ROAD, rng, type Vec } from './grid';
import {
  botFigure, building, car, centralPark, constructionSite, crane, freeLot, grove, kanFigure, lamp, mat,
  nightGlows, sharedMaterials, shroomFigure, townHall, windowMaterials, type Built,
} from './models';
import type { BotStatus, CityData, CityPlot, Pick } from './types';

/**
 * Kan City's scene. It draws the city once per layout and then only moves what the
 * data says is moving: bots walking to work, queueing at Town Hall when they need
 * you, wandering the park when they're idle; shrooms hopping when they've just run;
 * a crane over any building with an app being built.
 *
 * Labels are DOM, positioned over the canvas each frame, so they stay crisp and
 * clickable, and so the page can style them like the rest of Kanthink.
 */

const GROUND_Y = 0.36;
const LAWNS = ['#c3e2a8', '#b5dccd', '#e6d6aa', '#d2c5ea', '#f0cfc9', '#c6dcef', '#dfe8b8', '#e9c8dc'];

export type Sky = 'day' | 'dusk' | 'night' | 'dawn';
export function skyFor(hour: number): Sky {
  if (hour >= 6 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
export const SKY_CSS: Record<Sky, string> = {
  dawn: 'linear-gradient(180deg, #a993d6 0%, #f4b7a1 70%, #ffd9b8 100%)',
  day: 'linear-gradient(180deg, #8ec9f2 0%, #cde9fb 65%, #f1f8ff 100%)',
  dusk: 'linear-gradient(180deg, #5c4594 0%, #b07aa8 50%, #f0a77c 100%)',
  night: 'linear-gradient(180deg, #0c1030 0%, #241c4a 60%, #3d2a5e 100%)',
};
const LIGHT: Record<Sky, { sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number; windows: number; glows: number; sunPos: [number, number, number] }> = {
  dawn: { sun: '#ffc9a0', sunI: 1.6, hemiSky: '#d9c6ff', hemiGround: '#a6806a', hemiI: 1.1, windows: 0.7, glows: 0.9, sunPos: [-80, 50, 40] },
  day: { sun: '#fff6e8', sunI: 2.4, hemiSky: '#d6ecff', hemiGround: '#a39a7a', hemiI: 1.3, windows: 0.25, glows: 0.25, sunPos: [60, 110, 50] },
  dusk: { sun: '#ffb38a', sunI: 1.5, hemiSky: '#b9a0e6', hemiGround: '#8a6070', hemiI: 1.05, windows: 0.9, glows: 1.1, sunPos: [90, 45, -30] },
  night: { sun: '#9aa8ff', sunI: 0.9, hemiSky: '#7a78c8', hemiGround: '#3a3058', hemiI: 1.25, windows: 1.5, glows: 1.8, sunPos: [-40, 90, 60] },
};

interface Walker {
  obj: THREE.Object3D;
  /** Where it is on the road line. */
  pos: Vec;
  /** How far it stands off the line, toward its side of the road. */
  off: Vec;
  isCar?: boolean;
  path: Vec[];
  speed: number;
  lateral: number;
  wait: number;
  phase: number;
  /** Bots go in when they reach work. */
  inside?: boolean;
}

interface Citizen {
  plotId: string;
  status: BotStatus;
  fig: ReturnType<typeof botFigure>;
  walker: Walker;
  /** Where it's headed, so a new status only reroutes when the goal changes. */
  goal: string;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  arrivedBy?: THREE.Object3D;
}

interface PlotView {
  plot: CityPlot;
  center: Vec;
  facing: 1 | -1;
  built: Built;
  label: HTMLDivElement;
  beacon: THREE.Mesh;
  crane: (Built & { jib: THREE.Group }) | null;
  shrooms: { obj: THREE.Object3D; hop: boolean; phase: number }[];
  importance: number;
  /** A warm glow on the lawn where you spent time today. */
  yours: THREE.Mesh | null;
}

export interface EngineCallbacks {
  onPick(p: Pick | null): void;
  /** In drive or fly mode: the building you're next to, so the page can offer to go in. */
  onNear?(p: { id: string; name: string } | null): void;
  /** Escape out of drive or fly mode. */
  onExitMode?(): void;
}

/** How you see the city: the map from above, or first-person behind the wheel or the wings. */
export type ViewMode = 'map' | 'drive' | 'fly';

const FOG: Record<Sky, string> = { dawn: '#f2c3b4', day: '#d7ecfa', dusk: '#b98aa9', night: '#2a2150' };

export class CityEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: MapControls;
  private sun = new THREE.DirectionalLight('#fff', 2);
  private hemi = new THREE.HemisphereLight('#fff', '#888', 1);
  private last = performance.now();
  private elapsed = 0;
  private raf = 0;
  private grid: Grid | null = null;
  private layoutKey = '';
  private city = new THREE.Group();
  private plots = new Map<string, PlotView>();
  private citizens = new Map<string, Citizen>();
  private kan: Walker | null = null;
  private kanBubble: HTMLDivElement | null = null;
  private cars: (Walker & { k: number; m: number; pk: number; pm: number })[] = [];
  private cabs: { walker: Walker; onArrive: () => void; leaving: boolean }[] = [];
  private kanSays = false;
  private ticks: ((t: number, dt: number) => void)[] = [];
  private pickables: THREE.Object3D[] = [];
  private pickGroup = new THREE.Group();
  private pickMat = new THREE.MeshBasicMaterial({ visible: false });
  private fixedLabels: { el: HTMLDivElement; pos: THREE.Vector3; always?: boolean }[] = [];
  private proposalLots = new Map<string, { group: THREE.Group; label: HTMLDivElement }>();
  private selectRing: THREE.Mesh;
  private selected: Pick | null = null;
  private hovered: string | null = null;
  private data: CityData | null = null;
  private sky: Sky = 'dusk';
  private resizeObs: ResizeObserver;
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
  private down: { x: number; y: number } | null = null;
  private fpsSamples: number[] = [];
  private lowPower = false;
  private disposed = false;
  /** Screen space the page covers with panels, so focusing keeps the thing in view. */
  private insets = { right: 0, bottom: 0 };
  /** Short-lived effects: pulses where Kan just did something, buildings going up. */
  private effects: { t: number; life: number; update: (k: number, dt: number) => void; done?: () => void }[] = [];
  /** Plots seen before and where, so a new or moved building rises instead of just appearing. */
  private knownPlots: Map<string, string> | null = null;
  private kanNote: { text: string; kicker: string; until: number } | null = null;
  private kanVisitUntil = 0;
  private parcels: { group: THREE.Group; label: HTMLDivElement; count: number } | null = null;
  /** Plots picked for a new neighborhood. */
  private marked = new Set<string>();
  private mode: ViewMode = 'map';
  private persp = new THREE.PerspectiveCamera(62, 1, 0.5, 2500);
  private player: { obj: THREE.Group; x: number; y: number; z: number; heading: number; speed: number; roll: number } | null = null;
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private near: string | null = null;
  /** How tall what stands on each cell is, so a flyer can't go through it. */
  private tops = new Map<string, number>();

  constructor(private host: HTMLDivElement, private labels: HTMLDivElement, private cb: EngineCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, -500, 1000);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = this.controls.maxPolarAngle = 0.96;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 4.5;
    this.controls.zoomToCursor = true;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.city, this.pickGroup);

    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(6.6, 7.2, 40),
      new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerleave', () => this.setHover(null));
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    this.resize();
    this.loop();
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __kanCity?: CityEngine }).__kanCity = this;
  }

  /** Draw calls and triangles in the last frame, for checking the city stays light. */
  stats() {
    const { calls, triangles } = this.renderer.info.render;
    return { calls, triangles, lowPower: this.lowPower };
  }

  // ---------- Public ----------

  setSky(sky: Sky) {
    this.sky = sky;
    const L = LIGHT[sky];
    this.sun.color.set(L.sun);
    this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemiSky);
    this.hemi.groundColor.set(L.hemiGround);
    this.hemi.intensity = L.hemiI;
    this.sun.position.set(...L.sunPos);
    for (const m of windowMaterials) m.emissiveIntensity = L.windows;
    for (const m of nightGlows) m.emissiveIntensity = L.glows;
    for (const v of this.plots.values()) this.lightPlot(v);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.set(FOG[sky]);
  }

  setData(data: CityData) {
    const key = JSON.stringify([data.layout.cols, data.layout.rows, data.plots.map((p) => [p.channelId, p.archetype, p.cx, p.cz, p.size, p.attention]), data.proposals.map((p) => p.name)]);
    const first = !this.grid;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.build(data);
    }
    this.data = data;
    this.syncProposals(data);
    this.syncPlots(data);
    this.syncCitizens(data, first);
    this.syncKan();
    this.syncArrivals(data, first);
    if (first) this.frameAll();
  }

  select(p: Pick | null, focus = false) {
    this.selected = p;
    const pos = p ? this.pickPosition(p) : null;
    this.selectRing.visible = Boolean(pos);
    if (pos) {
      const big = p?.kind === 'townhall' || p?.kind === 'park';
      this.selectRing.scale.setScalar(big ? 2.05 : 1);
      this.selectRing.position.set(pos.x, GROUND_Y + 0.08, pos.z);
      if (focus && this.mode === 'map') this.focus(pos, big ? 1.5 : 2.1);
    }
  }

  /** Follow a bot: look at wherever it is right now. */
  focusBot(plotId: string) {
    const c = this.citizens.get(plotId);
    const v = this.plots.get(plotId);
    const p = c && !c.walker.inside ? c.walker.pos : v ? v.center : null;
    if (p) this.focus({ x: p.x, z: p.z }, 2.4);
  }

  frameAll() {
    if (!this.grid) return;
    this.controls.target.set(0, 0, 0);
    // A tall phone screen fits the city's width, which leaves it small; lean in.
    const aspect = (this.host.clientWidth || 1) / (this.host.clientHeight || 1);
    this.camera.zoom = aspect < 0.8 ? 1.45 : 0.9;
    this.placeCamera();
    this.camera.updateProjectionMatrix();
  }

  rotate(dir: 1 | -1) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), dir * Math.PI / 4);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  zoomBy(f: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * f, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get in and drive the streets, or take off and fly over the rooftops. The map
   * camera waits where you left it.
   */
  setMode(mode: ViewMode) {
    if (mode === this.mode || !this.grid || !this.data) return;
    if (this.player) { this.player.obj.removeFromParent(); this.player = null; }
    this.mode = mode;
    this.controls.enabled = mode === 'map';
    this.near = null;
    this.cb.onNear?.(null);
    this.focusAnim = null;
    if (mode === 'map') {
      this.scene.fog = null;
      this.selectRing.visible = Boolean(this.selected);
      return;
    }
    this.selectRing.visible = false;
    this.scene.fog = new THREE.Fog(FOG[this.sky], 90, 380);
    const start = this.townHallSpot(-2);
    const obj = mode === 'drive' ? this.makeDriver() : this.makeFlyer();
    this.scene.add(obj);
    // Pointed away from Kan, who waits outside Town Hall.
    this.player = { obj, x: start.x, y: mode === 'fly' ? 26 : 0.1, z: start.z, heading: -Math.PI / 2, speed: mode === 'fly' ? 16 : 0, roll: 0 };
    // Start the chase camera right behind, not swooping in from the map.
    const f = this.forward(this.player.heading);
    this.persp.position.set(start.x - f.x * 14, this.player.y + 7, start.z - f.z * 14);
    this.persp.lookAt(start.x, this.player.y, start.z);
  }

  getMode() { return this.mode; }

  /** The on-screen joystick, -1 to 1 each way; up is +y. */
  setStick(x: number, y: number) { this.stick = { x, y }; }

  /** Highlight plots, e.g. the ones you're gathering into a neighborhood. */
  mark(ids: string[]) { this.marked = new Set(ids); }

  /** How much of the canvas the page's panels cover, in px. */
  setInsets(right: number, bottom: number) {
    this.insets = { right: Math.max(0, right), bottom: Math.max(0, bottom) };
  }

  /**
   * Show that something just happened at a place: a ring and sparks rise from it.
   * `where` is a channel id, or 'townhall'. Kan walks over when it was Kan's doing.
   */
  pulse(where: string, opts: { tone?: 'write' | 'read'; kanGoes?: boolean } = {}) {
    if (!this.grid || !this.data) return;
    const L = this.data.layout;
    const v = this.plots.get(where);
    const at = v ? v.center : where === 'townhall' ? this.grid.blockCenter(L.townHall.cx, L.townHall.cz) : null;
    if (!at) return;
    const color = opts.tone === 'read' ? '#7dd3fc' : '#a78bfa';
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, GROUND_Y + 0.15, at.z);
    this.scene.add(ring);
    const sparks: THREE.Mesh[] = [];
    const top = v ? v.built.top : 8;
    const sm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    const sg = new THREE.OctahedronGeometry(0.42, 0);
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(sg, sm);
      const a = (i / 10) * Math.PI * 2;
      sp.userData.v = new THREE.Vector3(Math.cos(a) * (1.5 + Math.random()), 5 + Math.random() * 5, Math.sin(a) * (1.5 + Math.random()));
      sp.position.set(at.x, GROUND_Y + top * 0.6, at.z);
      this.scene.add(sp);
      sparks.push(sp);
    }
    const lit = Boolean(v && opts.tone !== 'read');
    if (v && lit) v.beacon.visible = true;
    this.effects.push({
      t: 0, life: 1.8,
      update: (k, dt) => {
        ring.scale.setScalar(1 + k * 3.2);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        for (const sp of sparks) {
          const vel = sp.userData.v as THREE.Vector3;
          vel.y -= 9 * dt;
          sp.position.addScaledVector(vel, dt);
          sp.rotation.y += dt * 4;
        }
        sm.opacity = 1 - k * k;
        if (v && lit) (v.beacon.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k) + 0.05;
      },
      done: () => {
        ring.removeFromParent(); ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
        for (const sp of sparks) sp.removeFromParent();
        sg.dispose(); sm.dispose();
        if (v) v.beacon.visible = v.plot.bot.status === 'working';
      },
    });
    if (opts.kanGoes && this.kan) {
      const door = v ? this.doorOf(where) : this.townHallSpot(-4);
      if (door) { this.walkTo(this.kan, door); this.kan.wait = 9; this.kanVisitUntil = performance.now() + 12_000; }
    }
  }

  /** Put words in Kan's mouth for a little while: what it's doing for you right now. */
  kanSay(text: string | null, kicker = 'Kan', ms = 6000) {
    this.kanNote = text ? { text, kicker, until: performance.now() + ms } : null;
    this.renderKanBubble();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.controls.dispose();
    this.clearCity();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.innerHTML = '';
  }

  // ---------- Building the city ----------

  private clearCity() {
    this.city.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.city.clear();
    windowMaterials.clear();
    this.plots.clear();
    for (const c of this.citizens.values()) { c.label.remove(); c.bubble.remove(); }
    this.citizens.clear();
    this.cars = [];
    this.cabs = [];
    this.ticks = [];
    this.pickables = [];
    for (const c of this.pickGroup.children) (c as THREE.Mesh).geometry.dispose();
    this.pickGroup.clear();
    this.fixedLabels = [];
    this.proposalLots.clear();
    this.parcels = null;
    this.kan = null;
    this.labels.innerHTML = '';
  }

  private build(data: CityData) {
    this.clearCity();
    const L = data.layout;
    const grid = new Grid(L.cols, L.rows);
    this.grid = grid;
    const W = grid.width, D = grid.depth;

    // The island: a thick base, then asphalt, then raised blocks.
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 5, D + 6), mat('#4a4560'));
    base.position.y = -2.6;
    base.receiveShadow = true;
    this.city.add(base);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 6.4, 0.5, D + 6.4), mat('#5d5875'));
    lip.position.y = -0.2;
    this.city.add(lip);
    const asphalt = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 0.2, D + 6), mat('#3d4152', { rough: 0.95 }));
    asphalt.position.y = 0;
    asphalt.receiveShadow = true;
    this.city.add(asphalt);

    // Lawns take their district's color.
    const districtOf = new Map<string, number>();
    for (const d of L.districts) for (const c of d.cells) districtOf.set(`${c.cx},${c.cz}`, d.tint);
    for (let bx = 0; bx < grid.blocksX; bx++) {
      for (let bz = 0; bz < grid.blocksZ; bz++) {
        const o = grid.blockOrigin(bx, bz);
        const curb = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 1, 0.3, BLOCK + 1), mat('#d8d4de'));
        curb.position.set(o.x + BLOCK / 2, 0.15, o.z + BLOCK / 2);
        curb.receiveShadow = true;
        this.city.add(curb);
        for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
          const cx = bx * 2 + lx, cz = bz * 2 + lz;
          const tint = districtOf.get(`${cx},${cz}`);
          const c = grid.cellCenter(cx, cz);
          const lawn = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.06, CELL), mat(tint === undefined ? '#cfd5c0' : LAWNS[tint % LAWNS.length]));
          lawn.position.set(c.x, 0.33, c.z);
          lawn.receiveShadow = true;
          this.city.add(lawn);
        }
        // Lamps on the block corners.
        const g = new THREE.Group();
        lamp(g, o.x - 0.1, o.z - 0.1);
        lamp(g, o.x + BLOCK + 0.1, o.z + BLOCK + 0.1);
        g.position.y = 0.3;
        this.city.add(g);
      }
    }
    this.roadMarkings(grid);

    // Town Hall and the park.
    const th = townHall();
    const thc = grid.blockCenter(L.townHall.cx, L.townHall.cz);
    th.group.position.set(thc.x, GROUND_Y - 0.05, thc.z);
    th.group.rotation.y = 0;
    this.addPickable(th.group, { kind: 'townhall' });
    this.city.add(th.group);
    if (th.tick) this.ticks.push(th.tick);
    this.tops.clear();
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) this.tops.set(`${L.townHall.cx + dx},${L.townHall.cz + dz}`, th.top + 1);
    this.fixedLabels.push({ el: this.makeLabel('Town Hall', 'townhall', () => this.cb.onPick({ kind: 'townhall' })), pos: new THREE.Vector3(thc.x, GROUND_Y + th.top, thc.z - 3.4), always: true });

    const pk = centralPark();
    const pkc = grid.blockCenter(L.park.cx, L.park.cz);
    pk.group.position.set(pkc.x, GROUND_Y - 0.05, pkc.z);
    this.addPickable(pk.group, { kind: 'park' });
    this.city.add(pk.group);
    this.fixedLabels.push({ el: this.makeLabel('Central Park', 'park', () => this.cb.onPick({ kind: 'park' })), pos: new THREE.Vector3(pkc.x, GROUND_Y + pk.top, pkc.z), always: true });

    // Every channel's building. One that wasn't here last time rises out of the ground.
    // So does one that just moved to another neighborhood.
    const known = this.knownPlots;
    const fresh = new Set(known ? data.plots.filter((p) => known.get(p.channelId) !== p.district).map((p) => p.channelId) : []);
    this.knownPlots = new Map(data.plots.map((p) => [p.channelId, p.district]));
    for (const p of data.plots) this.addPlot(grid, p, fresh.has(p.channelId));

    // Free lots: the first few that no proposal takes.
    const proposed = new Set(data.proposals.filter((p) => p.lot).map((p) => `${p.lot!.cx},${p.lot!.cz}`));
    for (const f of L.free.slice(0, 6)) {
      if (proposed.has(`${f.cx},${f.cz}`)) continue;
      const lot = freeLot();
      const c = grid.cellCenter(f.cx, f.cz);
      lot.group.position.set(c.x, GROUND_Y, c.z);
      lot.group.rotation.y = grid.door(f.cx, f.cz).facing === -1 ? Math.PI : 0;
      lot.group.userData.freeKey = `${f.cx},${f.cz}`;
      this.addPickable(lot.group, { kind: 'free' });
      this.city.add(lot.group);
    }

    // Everything else is still countryside.
    const used = new Set<string>([...data.plots.map((p) => `${p.cx},${p.cz}`), ...L.free.slice(0, 6).map((f) => `${f.cx},${f.cz}`)])
    for (const b of [L.townHall, L.park]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) used.add(`${b.cx + dx},${b.cz + dz}`);
    for (let cz = 0; cz < L.rows; cz++) for (let cx = 0; cx < L.cols; cx++) {
      if (used.has(`${cx},${cz}`)) continue;
      const gr = grove(cx * 131 + cz * 977);
      const c = grid.cellCenter(cx, cz);
      gr.group.position.set(c.x, GROUND_Y - 0.02, c.z);
      gr.group.userData.freeKey = `${cx},${cz}`;
      this.addPickable(gr.group, { kind: 'free' });
      this.city.add(gr.group);
    }

    // District names float over their neighborhoods.
    for (const d of L.districts) {
      if (!d.cells.length) continue;
      const pts = d.cells.map((c) => grid.cellCenter(c.cx, c.cz));
      const x = pts.reduce((n, p) => n + p.x, 0) / pts.length;
      const z = pts.reduce((n, p) => n + p.z, 0) / pts.length;
      const el = document.createElement('div');
      el.className = 'kc-district';
      el.textContent = d.name;
      this.labels.appendChild(el);
      this.fixedLabels.push({ el, pos: new THREE.Vector3(x, 0.5, z), always: true });
    }

    // Traffic.
    const r = rng(7);
    const n = Math.min(14, 4 + grid.blocksX * 2);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(r() * (grid.blocksX + 1)), m = Math.floor(r() * (grid.blocksZ + 1));
      const obj = this.noShadows(car(i));
      const p = grid.node(k, m);
      obj.position.set(p.x, 0.1, p.z);
      this.city.add(obj);
      this.cars.push({ obj, pos: { ...p }, off: { x: 0, z: 0 }, isCar: true, path: [], speed: 7 + r() * 4, lateral: 1.25, wait: r() * 2, phase: 0, k, m, pk: -1, pm: -1 });
    }

    // Clouds drifting over.
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, roughness: 1, flatShading: true });
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 2, 7, 5), cm);
        s.position.set(j * 2.6 - 4, r() * 1.2, r() * 2);
        cloud.add(s);
      }
      // They drift behind the island, in the sky, never over the buildings.
      const y = 18 + r() * 22;
      const back = -Math.max(W, D) / 2 - 25 - r() * 30;
      const speed = 1 + r() * 1.5;
      const span = W + D + 80;
      const off = r() * span;
      this.city.add(cloud);
      this.ticks.push((t) => {
        const k = ((t * speed + off) % span) - span / 2;
        cloud.position.set(back + k * 0.7071, y, back - k * 0.7071);
      });
    }

    const shadowSize = Math.max(W, D) * 0.72;
    const sc = this.sun.shadow.camera;
    sc.left = -shadowSize; sc.right = shadowSize; sc.top = shadowSize; sc.bottom = -shadowSize;
    sc.near = 1; sc.far = 400;
    sc.updateProjectionMatrix();

    this.kan = null;
    this.mergeStatic();
    this.setSky(this.sky);
  }

  /**
   * Fold everything that never moves into one mesh per material. A city is a few
   * thousand little boxes; drawn one by one that's a few thousand draw calls, which
   * an integrated GPU can't keep up with. Merged, it's a few dozen.
   */
  private mergeStatic() {
    this.city.updateMatrixWorld(true);
    const buckets = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    const victims: THREE.Mesh[] = [];
    const moving = (o: THREE.Object3D) => {
      for (let x: THREE.Object3D | null = o; x && x !== this.city; x = x.parent) if (x.userData.dynamic) return true;
      return false;
    };
    this.city.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
      if (!sharedMaterials.has(m.material) || !m.visible || moving(m)) return;
      let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}`;
      const b = buckets.get(key) ?? { material: m.material, cast: m.castShadow, geos: [] };
      b.geos.push(g);
      buckets.set(key, b);
      victims.push(m);
    });
    for (const m of victims) m.removeFromParent();
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.city.add(mesh);
    }
  }

  private roadMarkings(grid: Grid) {
    const dashGeo = new THREE.BoxGeometry(1.4, 0.04, 0.16);
    const stripeGeo = new THREE.BoxGeometry(0.5, 0.04, ROAD * 0.75);
    const white = mat('#e9e6ef', { rough: 0.9 });
    const dashes: THREE.Matrix4[] = [];
    const stripes: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    for (let m = 0; m <= grid.blocksZ; m++) {
      const z = grid.lineZ(m);
      for (let k = 0; k < grid.blocksX; k++) {
        const x0 = grid.lineX(k) + ROAD / 2 + 1.5, x1 = grid.lineX(k + 1) - ROAD / 2 - 1.5;
        for (let x = x0; x < x1; x += 3) dashes.push(new THREE.Matrix4().compose(new THREE.Vector3(x + 0.7, 0.12, z), q, one));
      }
    }
    for (let k = 0; k <= grid.blocksX; k++) {
      const x = grid.lineX(k);
      for (let m = 0; m < grid.blocksZ; m++) {
        const z0 = grid.lineZ(m) + ROAD / 2 + 1.5, z1 = grid.lineZ(m + 1) - ROAD / 2 - 1.5;
        for (let z = z0; z < z1; z += 3) dashes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.12, z + 0.7), turn, one));
      }
    }
    // Crosswalks on the inner intersections.
    for (let k = 1; k < grid.blocksX; k++) for (let m = 1; m < grid.blocksZ; m++) {
      const c = grid.node(k, m);
      for (let i = -2; i <= 2; i++) {
        stripes.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x + i * 0.9, 0.12, c.z - ROAD / 2 - 0.9), turn, new THREE.Vector3(0.9, 1, 0.5)));
        stripes.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x - ROAD / 2 - 0.9, 0.12, c.z + i * 0.9), q, new THREE.Vector3(0.9, 1, 0.5)));
      }
    }
    const a = new THREE.InstancedMesh(dashGeo, white, dashes.length);
    dashes.forEach((m, i) => a.setMatrixAt(i, m));
    const b = new THREE.InstancedMesh(stripeGeo, white, stripes.length);
    stripes.forEach((m, i) => b.setMatrixAt(i, m));
    a.receiveShadow = b.receiveShadow = true;
    this.city.add(a, b);
  }

  private litFor(p: CityPlot) {
    if (p.attention === 'muted') return 0;
    const recent = p.lastActivityAt ? Math.max(0, 1 - (Date.now() - p.lastActivityAt) / (30 * 86400_000)) : 0;
    const base = p.attention === 'quiet' ? 0.15 : p.attention === 'active' ? 0.5 : 0.25;
    return Math.min(0.85, base + recent * 0.35 + Math.min(0.15, p.recentActivity * 0.03));
  }

  private addPlot(grid: Grid, p: CityPlot, rise = false) {
    const seed = hash(p.channelId);
    const built = building(p.archetype, { size: p.size, seed, lit: this.litFor(p), muted: p.attention === 'muted' });
    if (rise) {
      // Kept out of the merge so it can grow.
      built.group.userData.dynamic = true;
      built.group.scale.set(1, 0.02, 1);
      const g = built.group;
      this.effects.push({ t: -0.3, life: 1.8, update: (k) => {
        // Ease out with a little overshoot, like it popped up.
        const e = k <= 0 ? 0.02 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
        g.scale.set(1, Math.max(0.02, e), 1);
      } });
      setTimeout(() => this.pulse(p.channelId, { kanGoes: true }), 700);
    }
    const c = grid.cellCenter(p.cx, p.cz);
    const d = grid.door(p.cx, p.cz);
    built.group.position.set(c.x, GROUND_Y, c.z);
    built.group.rotation.y = d.facing === -1 ? Math.PI : 0;
    this.addPickable(built.group, { kind: 'plot', id: p.channelId });
    this.city.add(built.group);
    this.tops.set(`${p.cx},${p.cz}`, built.top);
    if (built.tick) this.ticks.push(built.tick);

    // A beam of light over a building whose bot is at work.
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.6, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#8b5cf6', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beacon.position.set(c.x, GROUND_Y + built.top + 13, c.z);
    beacon.visible = false;
    this.city.add(beacon);

    const label = this.makeLabel(p.name, 'plot', () => this.cb.onPick({ kind: 'plot', id: p.channelId }));
    const importance = (p.recentActivity * 4) + Math.log2(1 + p.cards) + (p.apps ? 2 : 0) + (p.lastActivityAt ? Math.max(0, 6 - (Date.now() - p.lastActivityAt) / (5 * 86400_000)) : 0) - (p.attention === 'muted' ? 20 : 0);
    const view: PlotView = { plot: p, center: c, facing: d.facing, built, label, beacon, crane: null, shrooms: [], importance, yours: null };
    this.plots.set(p.channelId, view);
  }

  /** Shrooms live in the front yard, a few steps from the street. */
  private placeShrooms(v: PlotView) {
    for (const s of v.shrooms) s.obj.removeFromParent();
    v.shrooms = [];
    const list = v.plot.shrooms.slice(0, 8);
    list.forEach((s, i) => {
      const obj = this.noShadows(shroomFigure(hash(s.id), s.automatic));
      const x = 1.6 + (i % 4) * 0.75;
      const z = 4.1 - Math.floor(i / 4) * 0.7;
      obj.position.set(v.facing === 1 ? x : -x, 0.02, v.facing === 1 ? z : -z);
      obj.scale.setScalar(1.25);
      v.built.group.parent?.add(obj);
      obj.position.add(new THREE.Vector3(v.center.x, GROUND_Y, v.center.z));
      const hop = Boolean(s.lastRanAt && Date.now() - s.lastRanAt < 6 * 3600_000);
      v.shrooms.push({ obj, hop, phase: i * 0.7 });
    });
  }

  private lightPlot(v: PlotView) {
    const L = LIGHT[this.sky];
    const busy = v.plot.bot.status === 'working' || Boolean(v.plot.building);
    for (const m of v.built.windows) m.emissiveIntensity = busy ? Math.max(L.windows, 0.9) * 1.6 : L.windows;
  }

  private syncPlots(data: CityData) {
    for (const p of data.plots) {
      const v = this.plots.get(p.channelId);
      if (!v) continue;
      const shroomsChanged = JSON.stringify(v.plot.shrooms) !== JSON.stringify(p.shrooms) || !v.shrooms.length;
      v.plot = p;
      if (shroomsChanged) this.placeShrooms(v);
      this.lightPlot(v);
      const working = p.bot.status === 'working';
      v.beacon.visible = working;
      // A crane while an app is being built here.
      if (p.building && !v.crane) {
        const c = crane(Math.max(10, v.built.top + 3), '#f2b632');
        c.group.position.set(v.center.x + 3.8, GROUND_Y, v.center.z - 3.8 * v.facing);
        this.city.add(c.group);
        v.crane = c;
      } else if (!p.building && v.crane) {
        v.crane.group.removeFromParent();
        v.crane = null;
      }
      // Where your own time went today (Kanwatch): a warm ring, brighter the longer you stayed.
      const mins = p.yourTime?.minutes ?? 0;
      if (mins && !v.yours) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(5.2, 6.4, 40),
          new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(v.center.x, GROUND_Y + 0.06, v.center.z);
        this.city.add(ring);
        v.yours = ring;
      } else if (!mins && v.yours) { v.yours.removeFromParent(); v.yours = null; }
      if (v.yours) (v.yours.material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, 0.25 + mins / 120);
      const badge = p.waiting.length + p.bot.asks.length;
      v.label.querySelector('.kc-name')!.textContent = p.name;
      const b = v.label.querySelector('.kc-badge') as HTMLSpanElement;
      b.textContent = badge ? String(badge) : working ? '●' : p.building ? '◆' : '';
      b.dataset.tone = badge ? 'needs' : working ? 'working' : p.building ? 'building' : '';
      b.style.display = b.textContent ? '' : 'none';
      v.label.dataset.muted = p.attention === 'muted' ? '1' : '';
    }
  }

  private syncProposals(data: CityData) {
    if (!this.grid) return;
    const want = new Map(data.proposals.filter((p) => p.lot).map((p) => [p.name, p]));
    for (const [name, lot] of this.proposalLots) {
      if (!want.has(name)) { lot.group.removeFromParent(); lot.label.remove(); this.proposalLots.delete(name); }
    }
    for (const [name, p] of want) {
      if (this.proposalLots.has(name)) continue;
      const site = constructionSite();
      const c = this.grid.cellCenter(p.lot!.cx, p.lot!.cz);
      site.group.position.set(c.x, GROUND_Y, c.z);
      this.addPickable(site.group, { kind: 'proposal', name });
      this.city.add(site.group);
      if (site.tick) this.ticks.push(site.tick);
      const label = this.makeLabel(name, 'proposal', () => this.cb.onPick({ kind: 'proposal', name }));
      (label.querySelector('.kc-badge') as HTMLSpanElement).textContent = 'Kan wants to build';
      (label.querySelector('.kc-badge') as HTMLSpanElement).dataset.tone = 'proposal';
      this.fixedLabels.push({ el: label, pos: new THREE.Vector3(c.x, GROUND_Y + site.top, c.z), always: true });
      this.proposalLots.set(name, { group: site.group, label });
    }
  }

  // ---------- Citizens ----------

  private doorOf(plotId: string): (Vec & { m: number }) | null {
    const v = this.plots.get(plotId);
    if (!v || !this.grid) return null;
    return this.grid.door(v.plot.cx, v.plot.cz);
  }

  private townHallSpot(i: number): Vec & { m: number } {
    const L = this.data!.layout;
    const d = this.grid!.door(L.townHall.cx, L.townHall.cz + 1);
    // The queue runs along the street in front of Town Hall's steps.
    return { x: d.x + 5.6 - i * 2.8, z: d.z, m: d.m };
  }

  private parkSpot(r: () => number): Vec & { m: number } {
    const L = this.data!.layout;
    const d = this.grid!.door(L.park.cx + (r() < 0.5 ? 0 : 1), L.park.cz + 1);
    return { x: d.x + (r() - 0.5) * 6, z: d.z, m: d.m };
  }

  private syncCitizens(data: CityData, first: boolean) {
    if (!this.grid) return;
    const present = new Set<string>();
    const queue = data.plots.filter((p) => p.bot.status === 'needs');
    for (const p of data.plots) {
      if (p.bot.status === 'off' && !p.waiting.length) continue;
      present.add(p.channelId);
      let c = this.citizens.get(p.channelId);
      if (!c) {
        const fig = botFigure(hash(p.channelId));
        fig.group.scale.setScalar(1.7);
        const home = this.doorOf(p.channelId)!;
        fig.group.position.set(home.x, GROUND_Y, home.z);
        this.city.add(fig.group);
        const label = this.makeLabel(p.name.split(/[\s:&]+/)[0], 'bot', () => this.cb.onPick({ kind: 'plot', id: p.channelId }));
        label.style.setProperty('--dot', fig.color);
        const bubble = document.createElement('div');
        bubble.className = 'kc-bubble';
        bubble.addEventListener('click', () => this.cb.onPick({ kind: 'townhall' }));
        this.labels.appendChild(bubble);
        c = { plotId: p.channelId, status: p.bot.status, fig, label, bubble, goal: '', walker: { obj: fig.group, pos: { x: home.x, z: home.z }, off: { x: 0, z: 0 }, path: [], speed: 4.2 + (hash(p.channelId) % 10) / 10, lateral: ((hash(p.channelId) % 7) - 3) * 0.45, wait: 0, phase: Math.random() * 6 } };
        this.citizens.set(p.channelId, c);
        // A bot that just joined arrives by cab.
        if (!first) this.arriveByCab(c, home);
      }
      c.status = p.bot.status;
      this.route(c, p, queue.findIndex((q) => q.channelId === p.channelId));
      c.bubble.innerHTML = '';
      // Only the bot at the front of the line speaks up; the rest wait their turn.
      if (p.bot.status === 'needs' && queue[0]?.channelId === p.channelId) {
        const t = document.createElement('div');
        t.className = 'kc-bubble-kicker';
        t.textContent = queue.length > 1 ? `Needs you · ${queue.length} in line` : 'Needs you';
        const b = document.createElement('div');
        b.textContent = p.waiting[0] ? `Can I build “${p.waiting[0].title}”?` : p.bot.asks[0] ?? '';
        c.bubble.append(t, b);
      }
    }
    for (const [id, c] of this.citizens) {
      if (present.has(id)) continue;
      c.fig.group.removeFromParent();
      c.label.remove();
      c.bubble.remove();
      this.citizens.delete(id);
    }
  }

  private route(c: Citizen, p: CityPlot, queueIndex: number) {
    const home = this.doorOf(p.channelId);
    if (!home) return;
    let goal = '';
    let to: (Vec & { m: number }) | null = null;
    if (p.bot.status === 'working') { goal = 'work'; to = home; }
    else if (p.bot.status === 'needs') { goal = `hall:${queueIndex}`; to = this.townHallSpot(Math.max(0, queueIndex)); }
    else if (p.bot.status === 'paused') { goal = 'home'; to = home; }
    else { goal = c.goal.startsWith('wander') ? c.goal : 'wander'; }
    if (goal === c.goal) return;
    c.goal = goal;
    c.walker.inside = false;
    c.walker.obj.visible = true;
    if (to) this.walkTo(c.walker, to);
    else c.walker.path = [];
  }

  private walkTo(w: Walker, to: Vec & { m: number }) {
    if (!this.grid) return;
    // Snap to the nearest street first, in case it was set down off one.
    w.path = this.grid.route(this.snap(w.pos), to);
  }

  private snap(p: Vec): Vec {
    const g = this.grid!;
    const n = g.nearestNode(p);
    const node = g.node(n.k, n.m);
    // On whichever road line is closer.
    return Math.abs(p.z - node.z) < Math.abs(p.x - node.x) ? { x: p.x, z: node.z } : { x: node.x, z: p.z };
  }

  private arriveByCab(c: Citizen, home: Vec & { m: number }) {
    const g = this.grid!;
    const cab = this.noShadows(car(0, true));
    const start = g.node(0, home.m);
    cab.position.set(start.x - 6, 0.1, start.z);
    this.city.add(cab);
    c.walker.obj.visible = false;
    const walker: Walker = { obj: cab, pos: { x: start.x - 6, z: start.z }, off: { x: 0, z: 0 }, isCar: true, path: [{ x: start.x, z: start.z }, { x: home.x, z: home.z }], speed: 12, lateral: 1.25, wait: 0.8, phase: 0 };
    const entry = { walker, leaving: false, onArrive: () => {
      c.walker.obj.visible = !c.walker.inside;
      // The cab drives on out of town.
      walker.path = [{ x: g.lineX(g.blocksX) + 10, z: home.z }];
      entry.leaving = true;
    } };
    this.cabs.push(entry);
  }

  private syncKan() {
    if (!this.grid) return;
    if (!this.kan) {
      const obj = kanFigure();
      obj.scale.setScalar(1.9);
      const s = this.townHallSpot(-4);
      obj.position.set(s.x, GROUND_Y, s.z);
      this.city.add(obj);
      this.kan = { obj, pos: { x: s.x, z: s.z }, off: { x: 0, z: 0 }, path: [], speed: 3.6, lateral: 0, wait: 2, phase: 0 };
      this.kanBubble = document.createElement('div');
      this.kanBubble.className = 'kc-bubble kc-bubble-kan';
      this.kanBubble.addEventListener('click', () => this.cb.onPick({ kind: 'townhall' }));
      this.labels.appendChild(this.kanBubble);
      const lab = this.makeLabel('Kan', 'kan', () => this.cb.onPick({ kind: 'townhall' }));
      this.fixedLabels.push({ el: lab, pos: obj.position, always: true });
      lab.dataset.follow = '1';
    }
    this.renderKanBubble();
  }

  /** What Kan's bubble says: what you just asked it to do, else what's waiting. */
  private renderKanBubble() {
    const b = this.kanBubble;
    const data = this.data;
    if (!b || !data) return;
    const note = this.kanNote && this.kanNote.until > performance.now() ? this.kanNote : null;
    const th = data.townHall;
    let kicker = 'Kan', text = '';
    if (note) { kicker = note.kicker; text = note.text; }
    else if (th.passRunning) { kicker = 'Kan is thinking'; text = 'Reading everything you gave me…'; }
    else if (th.pass) text = 'I noticed a few things. Come see?';
    b.innerHTML = '';
    if (text) {
      const k = document.createElement('div');
      k.className = 'kc-bubble-kicker';
      k.textContent = kicker;
      const t = document.createElement('div');
      t.textContent = text;
      b.append(k, t);
    }
    // A bot in line at Town Hall speaks first; Kan waits, unless you're talking to it.
    this.kanSays = Boolean(text) && (Boolean(note) || !data.plots.some((p) => p.bot.status === 'needs'));
  }

  /**
   * What came in since Kan last looked waits in a pile of parcels by Town Hall. When
   * more arrives, a van brings it.
   */
  private syncArrivals(data: CityData, first: boolean) {
    if (!this.grid) return;
    const n = data.arrivals.count;
    if (this.parcels?.count === n) return;
    const prev = this.parcels?.count ?? n;
    const L = data.layout;
    const o = this.grid.blockOrigin(Math.floor(L.townHall.cx / 2), Math.floor(L.townHall.cz / 2));
    const spot = { x: o.x + 1.6, z: o.z + BLOCK - 1.6 };
    const draw = () => {
      if (this.parcels) {
        const old = this.parcels;
        old.group.removeFromParent();
        old.label.remove();
        this.fixedLabels = this.fixedLabels.filter((f) => f.el !== old.label);
        this.parcels = null;
      }
      if (!n) return;
      const g = new THREE.Group();
      g.userData.dynamic = true;
      const tones = ['#c89b63', '#d9ae73', '#b98a55'];
      const shown = Math.min(n, 9);
      for (let i = 0; i < shown; i++) {
        const sz = 0.9 + ((i * 37) % 5) * 0.12;
        const box = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.8, sz), mat(tones[i % 3]));
        const layer = i < 4 ? 0 : i < 7 ? 1 : 2;
        const j = layer === 0 ? i : layer === 1 ? i - 4 : i - 7;
        box.position.set((j % 2) * 1.05 - 0.5 + layer * 0.25, 0.4 + layer * 0.78, Math.floor(j / 2) * 1.05 - 0.5 + layer * 0.2);
        box.rotation.y = ((i * 53) % 7) * 0.12;
        box.castShadow = true;
        const tape = new THREE.Mesh(new THREE.BoxGeometry(sz * 1.02, 0.08, 0.18), mat('#f4e3c0'));
        tape.position.y = sz * 0.4;
        box.add(tape);
        g.add(box);
      }
      g.position.set(spot.x, GROUND_Y, spot.z);
      this.city.add(g);
      this.addPickable(g, { kind: 'arrivals' });
      const label = this.makeLabel(`${n} new for Kan`, 'arrivals', () => this.cb.onPick({ kind: 'arrivals' }));
      this.fixedLabels.push({ el: label, pos: new THREE.Vector3(spot.x, GROUND_Y + 3.2, spot.z), always: true });
      this.parcels = { group: g, label, count: n };
    };
    if (n > prev && !first && this.parcels) {
      // A van pulls up with the new things, then the pile grows.
      this.parcels.count = n;
      const g = this.grid;
      const van = this.noShadows(car(3));
      van.scale.setScalar(1.25);
      const near = g.nearestNode(spot);
      const start = g.node(0, near.m);
      const stop = { x: g.node(near.k, near.m).x, z: start.z };
      this.city.add(van);
      const walker: Walker = { obj: van, pos: { x: start.x - 14, z: start.z }, off: { x: 0, z: 0 }, isCar: true, path: [{ x: start.x, z: start.z }, stop], speed: 13, lateral: 1.25, wait: 0, phase: 0 };
      const entry = { walker, leaving: false, onArrive: () => {
        draw();
        this.pulse('townhall', { tone: 'read' });
        walker.path = [{ x: g.lineX(g.blocksX) + 14, z: stop.z }];
        entry.leaving = true;
      } };
      this.cabs.push(entry);
    } else draw();
  }

  /** Kan's rounds: Town Hall, then wherever things happened lately, then the post office. */
  private nextKanStop(r: () => number): Vec & { m: number } {
    const d = this.data!;
    if (d.townHall.pass || d.townHall.approvals.length || r() < 0.35) return this.townHallSpot(-4);
    const busy = d.plots.filter((p) => p.attention !== 'muted').sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)).slice(0, 8);
    const pick = busy[Math.floor(r() * busy.length)];
    return (pick && this.doorOf(pick.channelId)) || this.parkSpot(r);
  }

  // ---------- Frame loop ----------

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.elapsed += dt;
    const t = this.elapsed;
    this.watchFps(raw);

    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt * 1.8);
      const e = 1 - Math.pow(1 - f.t, 3);
      const target = f.from.clone().lerp(f.to, e);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(offset);
      this.camera.zoom = f.z0 + (f.z1 - f.z0) * e;
      this.camera.updateProjectionMatrix();
      if (f.t >= 1) this.focusAnim = null;
    }
    if (this.mode === 'map') {
      this.controls.update();
      this.clampTarget();
    } else this.stepPlayer(dt);
    for (const f of this.ticks) f(t, dt);

    const r = Math.random;
    // Bots.
    for (const c of this.citizens.values()) {
      const w = c.walker;
      const moving = this.step(w, dt, GROUND_Y);
      if (!moving && !w.path.length) {
        if (c.goal === 'work' && !w.inside) { w.inside = true; w.obj.visible = false; }
        if (c.goal.startsWith('wander')) {
          w.wait -= dt;
          if (w.wait <= 0) {
            // Bots visit their own neighborhood, never another one. Downtown bots keep to home and the park.
            const own = this.plots.get(c.plotId)?.plot;
            const plots = own?.folderId ? [...this.plots.values()].filter((v) => v.plot.folderId === own.folderId && v.plot.attention !== 'muted') : [];
            const pick = r() < 0.4 ? this.parkSpot(r) : r() < 0.5 || !plots.length ? this.doorOf(c.plotId)! : this.doorOf(plots[Math.floor(r() * plots.length)].plot.channelId)!;
            this.walkTo(w, pick);
            w.wait = 3 + r() * 6;
          }
        }
      }
      // A waiting bot bounces, a little impatiently.
      const bounce = c.status === 'needs' && !moving ? Math.abs(Math.sin(t * 3 + w.phase)) * 0.35 : 0;
      c.fig.body.position.y = 0.8 + bounce + (moving ? Math.abs(Math.sin(t * 10 + w.phase)) * 0.12 : 0);
      c.fig.body.scale.y = 0.95 - (moving ? 0 : Math.sin(t * 2 + w.phase) * 0.03);
    }
    // Kan.
    if (this.kan) {
      const w = this.kan;
      const moving = this.step(w, dt, GROUND_Y);
      if (!moving && !w.path.length) {
        w.wait -= dt;
        if (w.wait <= 0 && performance.now() > this.kanVisitUntil) { this.walkTo(w, this.nextKanStop(r)); w.wait = 4 + r() * 6; }
      }
      w.obj.position.y = GROUND_Y + (moving ? Math.abs(Math.sin(t * 8)) * 0.15 : Math.abs(Math.sin(t * 1.5)) * 0.05);
    }
    // Cars wander the grid, one intersection at a time.
    if (this.grid) {
      for (const c of this.cars) {
        if (!this.step(c, dt, 0.1)) {
          c.wait -= dt;
          if (c.wait <= 0) {
            // Onward to a neighboring corner, and not straight back unless it must.
            const nb = this.grid.neighbors(c.k, c.m);
            const ahead = nb.filter((n) => n.k !== c.pk || n.m !== c.pm);
            const n = (ahead.length ? ahead : nb)[Math.floor(r() * (ahead.length || nb.length))];
            c.pk = c.k; c.pm = c.m;
            c.k = n.k; c.m = n.m;
            c.path = [this.grid.node(n.k, n.m)];
            c.wait = r() < 0.15 ? 0.6 + r() * 1.5 : 0;
          }
        }
      }
      for (const cab of [...this.cabs]) {
        if (cab.walker.wait > 0) { cab.walker.wait -= dt; continue; }
        if (this.step(cab.walker, dt, 0.1) || cab.walker.path.length) continue;
        if (!cab.leaving) { cab.onArrive(); cab.walker.wait = 0.8; continue; }
        cab.walker.obj.removeFromParent();
        this.cabs = this.cabs.filter((x) => x !== cab);
      }
    }
    // Shrooms that ran lately hop.
    for (const v of this.plots.values()) {
      for (const s of v.shrooms) s.obj.position.y = GROUND_Y + (s.hop ? Math.abs(Math.sin(t * 4 + s.phase)) * 0.5 : 0);
      if (v.beacon.visible) (v.beacon.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 3) * 0.06;
    }
    this.selectRing.rotation.z = t * 0.3;
    if (this.effects.length) {
      for (const e of [...this.effects]) {
        e.t += dt / e.life;
        e.update(Math.min(1, e.t), dt);
        if (e.t >= 1) { e.done?.(); this.effects = this.effects.filter((x) => x !== e); }
      }
    }
    if (this.kanNote && this.kanNote.until < performance.now()) { this.kanNote = null; this.renderKanBubble(); }

    this.renderer.render(this.scene, this.view);
    this.placeLabels();
  };

  /**
   * Move a walker along its path; returns whether it moved. Its place on the road
   * line is kept apart from its lane, so routes stay exact while people spread out
   * and cars keep to the right.
   */
  private step(w: Walker, dt: number, y: number) {
    let moving = false;
    let dirX = 0, dirZ = 0;
    if (w.path.length) {
      const target = w.path[0];
      const dx = target.x - w.pos.x, dz = target.z - w.pos.z;
      const dist = Math.hypot(dx, dz);
      const stepLen = w.speed * dt;
      if (dist > 0.0001) { dirX = dx / dist; dirZ = dz / dist; }
      if (dist <= stepLen) {
        w.pos.x = target.x; w.pos.z = target.z;
        w.path.shift();
      } else {
        w.pos.x += dirX * stepLen;
        w.pos.z += dirZ * stepLen;
      }
      moving = dist > 0.0001;
      if (moving) w.obj.rotation.y = Math.atan2(dirX, dirZ) - (w.isCar ? Math.PI / 2 : 0);
    }
    // Right-hand side of the direction of travel, eased so corners look natural.
    if (moving && w.lateral) {
      const wantX = -dirZ * w.lateral, wantZ = dirX * w.lateral;
      w.off.x += (wantX - w.off.x) * Math.min(1, dt * 6);
      w.off.z += (wantZ - w.off.z) * Math.min(1, dt * 6);
    }
    w.obj.position.set(w.pos.x + w.off.x, y, w.pos.z + w.off.z);
    return moving;
  }

  // ---------- Driving and flying ----------

  private get view(): THREE.Camera { return this.mode === 'map' ? this.camera : this.persp; }

  private forward(heading: number) { return { x: Math.sin(heading), z: Math.cos(heading) }; }

  /** A little car with Kan at the wheel. */
  private makeDriver(): THREE.Group {
    const g = car(5);
    g.traverse((o) => { o.castShadow = true; });
    const k = kanFigure();
    k.scale.setScalar(0.3);
    k.position.set(-0.15, 0.6, 0);
    k.rotation.y = Math.PI / 2;
    g.add(k);
    g.scale.setScalar(1.6);
    return g;
  }

  /** A violet glider with Kan riding on top. */
  private makeFlyer(): THREE.Group {
    const g = new THREE.Group();
    g.userData.dynamic = true;
    const body = mat('#7c3aed', { rough: 0.45 });
    const wing = mat('#c4b5fd', { rough: 0.5 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const fuselage = add(new THREE.CapsuleGeometry(0.42, 2.6, 4, 10), body, 0, 0, 0);
    fuselage.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(7.2, 0.12, 1.3), wing, 0, 0.1, 0.25);
    add(new THREE.BoxGeometry(2.6, 0.1, 0.7), wing, 0, 0.15, -1.7);
    add(new THREE.BoxGeometry(0.1, 0.9, 0.7), body, 0, 0.55, -1.75);
    for (const x of [-3.5, 3.5]) add(new THREE.BoxGeometry(0.16, 0.5, 0.9), body, x, 0.3, 0.25);
    const k = kanFigure();
    k.scale.setScalar(0.5);
    k.position.set(0, 0.32, 0.55);
    g.add(k);
    g.scale.setScalar(1.3);
    return g;
  }

  /** Inside a block: lawns and buildings, off the road. */
  private onBlock(x: number, z: number, pad: number) {
    const g = this.grid!;
    const lx = x + g.width / 2 - ROAD, lz = z + g.depth / 2 - ROAD;
    const bx = Math.floor(lx / PITCH), bz = Math.floor(lz / PITCH);
    if (bx < 0 || bz < 0 || bx >= g.blocksX || bz >= g.blocksZ) return null;
    const ox = lx - bx * PITCH, oz = lz - bz * PITCH;
    if (ox < -pad || ox > BLOCK + pad || oz < -pad || oz > BLOCK + pad) return null;
    const cx = bx * 2 + (ox > CELL + GAP / 2 ? 1 : 0), cz = bz * 2 + (oz > CELL + GAP / 2 ? 1 : 0);
    return { cx, cz };
  }

  private stepPlayer(dt: number) {
    const p = this.player, g = this.grid;
    if (!p || !g) return;
    const k = this.keys;
    const steer = THREE.MathUtils.clamp((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.stick.x, -1, 1);
    const push = THREE.MathUtils.clamp((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.stick.y, -1, 1);
    const boost = k.has('shift');
    const edge = Math.max(g.width, g.depth) / 2;

    if (this.mode === 'drive') {
      const top = boost ? 36 : 24;
      if (push > 0) p.speed = Math.min(top, p.speed + push * 26 * dt);
      else if (push < 0) p.speed = Math.max(-9, p.speed + push * (p.speed > 0 ? 40 : 16) * dt);
      else p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), 9 * dt);
      p.heading -= steer * 2.3 * dt * THREE.MathUtils.clamp(Math.abs(p.speed) / 7, 0, 1) * Math.sign(p.speed || 1);
      const f = this.forward(p.heading);
      const nx = p.x + f.x * p.speed * dt, nz = p.z + f.z * p.speed * dt;
      // Streets only: slide along a curb rather than stop dead, and stay on the island.
      const blocked = (x: number, z: number) => Math.abs(x) > g.width / 2 - 1.2 || Math.abs(z) > g.depth / 2 - 1.2 || this.onBlock(x, z, 1.3) !== null;
      if (!blocked(nx, nz)) { p.x = nx; p.z = nz; }
      else if (!blocked(nx, p.z)) { p.x = nx; p.speed *= 1 - 2 * dt; }
      else if (!blocked(p.x, nz)) { p.z = nz; p.speed *= 1 - 2 * dt; }
      else p.speed *= -0.25;
      p.roll += (-steer * Math.min(1, Math.abs(p.speed) / 20) * 0.08 - p.roll) * Math.min(1, dt * 6);
      p.obj.position.set(p.x, 0.12, p.z);
      p.obj.rotation.set(0, p.heading - Math.PI / 2, 0);
      p.obj.rotateX(p.roll);
      // Chase camera, low and close.
      const want = new THREE.Vector3(p.x - f.x * 13, 6.2, p.z - f.z * 13);
      this.persp.position.lerp(want, 1 - Math.exp(-dt * 5));
      this.persp.lookAt(p.x + f.x * 8, 1.6, p.z + f.z * 8);
    } else {
      // Always flying forward; up on the stick (or W) climbs, A and D bank and turn.
      const target = boost ? 46 : 22;
      p.speed += (target - p.speed) * Math.min(1, dt * 1.5);
      p.heading -= steer * 1.35 * dt;
      p.y += push * 15 * dt;
      const cell = this.onBlock(p.x, p.z, 0);
      const floor = (cell ? this.tops.get(`${cell.cx},${cell.cz}`) ?? 0.5 : 0.5) + GROUND_Y + 3;
      p.y = THREE.MathUtils.clamp(p.y, floor, 150);
      const f = this.forward(p.heading);
      p.x += f.x * p.speed * dt;
      p.z += f.z * p.speed * dt;
      // Past the edge of town, it banks you back toward the middle.
      const out = Math.hypot(p.x, p.z) - (edge + 70);
      if (out > 0) {
        const home = Math.atan2(-p.x, -p.z);
        let d = home - p.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.heading += Math.sign(d) * Math.min(Math.abs(d), dt * 1.2);
      }
      p.roll += (steer * 0.55 - p.roll) * Math.min(1, dt * 4);
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.rotation.set(0, p.heading, 0);
      p.obj.rotateZ(p.roll);
      p.obj.rotateX(-push * 0.18);
      const want = new THREE.Vector3(p.x - f.x * 15, p.y + 5.5, p.z - f.z * 15);
      this.persp.position.lerp(want, 1 - Math.exp(-dt * 4));
      this.persp.lookAt(p.x + f.x * 10, p.y - 1, p.z + f.z * 10);
    }

    // What you're next to: a door when driving, a rooftop when flying.
    let best: PlotView | null = null, bestD = Infinity;
    for (const v of this.plots.values()) {
      const d = Math.hypot(v.center.x - p.x, v.center.z - p.z);
      const reach = this.mode === 'drive' ? 11 : 13 + Math.max(0, p.y - v.built.top) * 0.15;
      if (d < reach && d < bestD && (this.mode === 'drive' || p.y < v.built.top + 30)) { best = v; bestD = d; }
    }
    const id = best?.plot.channelId ?? null;
    if (id !== this.near) {
      this.near = id;
      this.cb.onNear?.(best ? { id: best.plot.channelId, name: best.plot.name } : null);
    }
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (this.mode === 'map') return;
    const key = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (key === 'escape') { this.cb.onExitMode?.(); return; }
      if ((key === 'e' || key === 'enter') && this.near) { this.cb.onPick({ kind: 'plot', id: this.near }); return; }
      this.keys.add(key);
      if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    } else this.keys.delete(key);
  };

  private onBlur = () => { this.keys.clear(); };

  // ---------- Labels ----------

  private makeLabel(text: string, kind: 'plot' | 'townhall' | 'park' | 'bot' | 'kan' | 'proposal' | 'arrivals', onClick: () => void) {
    const el = document.createElement('div');
    el.className = `kc-label kc-${kind}`;
    const dot = document.createElement('span');
    dot.className = 'kc-dot';
    const name = document.createElement('span');
    name.className = 'kc-name';
    name.textContent = text;
    const badge = document.createElement('span');
    badge.className = 'kc-badge';
    badge.style.display = 'none';
    el.append(dot, name, badge);
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    el.addEventListener('pointerenter', () => { if (kind === 'plot') this.setHover(text); });
    this.labels.appendChild(el);
    return el;
  }

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    const put = (el: HTMLElement, pos: THREE.Vector3, show: boolean, dy = 0) => {
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      v.copy(pos).project(this.view);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h + dy;
      // Behind a first-person camera counts as off screen; so does too far to read.
      const far = fpv && (v.z > 1 || pos.distanceTo(this.persp.position) > 150);
      const off = far || x < -80 || x > w + 80 || y < -40 || y > h + 40;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    };
    const fpv = this.mode !== 'map';
    // Up close in first person, everything nearby says its name.
    const zoom = fpv ? 3 : this.camera.zoom;
    // The busiest buildings always say their names; the rest appear as you zoom in.
    const ranked = [...this.plots.values()].sort((a, b) => b.importance - a.importance);
    // A phone has room for far fewer names than a desktop.
    const room = Math.max(0.3, Math.min(1, w / 1100));
    const shown = Math.round(7 * zoom * zoom * room);
    const sel = this.selected?.kind === 'plot' ? this.selected.id : null;
    ranked.forEach((pv, i) => {
      const p = pv.plot;
      const marked = this.marked.has(p.channelId);
      const loud = marked || p.bot.status === 'working' || p.waiting.length > 0 || Boolean(p.building) || sel === p.channelId || this.hovered === p.name;
      const show = fpv ? Math.hypot(pv.center.x - this.persp.position.x, pv.center.z - this.persp.position.z) < 95 : loud || (i < shown && (p.attention !== 'muted' || zoom > 2.2));
      put(pv.label, v.set(pv.center.x, GROUND_Y + pv.built.top + 0.6, pv.center.z).clone(), show);
      pv.label.dataset.selected = sel === p.channelId || marked ? '1' : '';
    });
    for (const f of this.fixedLabels) {
      const isKan = f.el.dataset.follow === '1';
      put(f.el, isKan ? f.pos.clone().setY(GROUND_Y + 4.4) : f.pos, f.always || zoom > 1);
      if (f.el.classList.contains('kc-district')) f.el.style.opacity = !fpv && zoom < 1.6 ? '1' : '0';
    }
    for (const c of this.citizens.values()) {
      const visible = c.walker.obj.visible && !c.walker.inside;
      const pos = c.walker.obj.position.clone().setY(GROUND_Y + 3.4);
      put(c.label, pos, visible && (fpv ? pos.distanceTo(this.persp.position) < 45 : zoom > (w < 640 ? 2.4 : 1.25)));
      put(c.bubble, pos.clone().setY(GROUND_Y + 2.4), visible && c.status === 'needs' && c.bubble.childElementCount > 0, -4);
    }
    if (this.kan && this.kanBubble) put(this.kanBubble, this.kan.obj.position.clone().setY(GROUND_Y + 4.6), this.kanSays, -30);
  }

  // ---------- Input ----------

  /**
   * What you can tap is an invisible box the size of the thing, since the thing
   * itself gets merged into the rest of the city.
   */
  /** Small moving things don't cast shadows: each would be another draw call. */
  private noShadows(o: THREE.Object3D) {
    o.traverse((x) => { x.castShadow = false; });
    return o;
  }

  private addPickable(o: THREE.Object3D, p: Pick) {
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 1), Math.max(size.y, 1), Math.max(size.z, 1)), this.pickMat);
    box.getCenter(proxy.position);
    proxy.userData.pick = p;
    this.pickGroup.add(proxy);
    this.pickables.push(proxy);
  }

  private pickAt(clientX: number, clientY: number): Pick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.view);
    const hits = ray.intersectObjects(this.pickables, false);
    return (hits[0]?.object.userData.pick as Pick | undefined) ?? null;
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; this.focusAnim = null; };
  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 6) return;
    this.cb.onPick(this.pickAt(e.clientX, e.clientY));
  };
  private hoverQueued = false;
  private onMove = (e: PointerEvent) => {
    if (this.down || this.hoverQueued || e.pointerType !== 'mouse') return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      const p = this.pickAt(e.clientX, e.clientY);
      const name = p?.kind === 'plot' ? this.plots.get(p.id)?.plot.name ?? null : null;
      this.setHover(name);
      this.renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    });
  };
  private setHover(name: string | null) { this.hovered = name; }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else { this.last = performance.now(); this.loop(); }
  };

  // ---------- Camera ----------

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const span = this.grid ? Math.max(this.grid.width, this.grid.depth) * 0.8 : 100;
    const aspect = w / h;
    // Fit the whole island whichever way the screen is shaped.
    const halfH = aspect > 1.2 ? span * 0.5 : (span * 0.62) / aspect;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
  }

  private placeCamera() {
    this.resize();
    const d = 220;
    this.camera.position.set(d * 0.66, d * 0.68, d * 0.66).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  private clampTarget() {
    if (!this.grid) return;
    const t = this.controls.target;
    const lx = this.grid.width / 2 + 30, lz = this.grid.depth / 2 + 30;
    const cx = THREE.MathUtils.clamp(t.x, -lx, lx), cz = THREE.MathUtils.clamp(t.z, -lz, lz);
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x, dz = cz - t.z;
      t.x = cx; t.z = cz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
    t.y = 0;
  }

  private focus(p: Vec, zoom: number) {
    const z1 = Math.max(this.camera.zoom, zoom);
    // Aim off-center so what you picked sits in the part of the screen you can see.
    const w = this.host.clientWidth || 1;
    const perPx = (this.camera.right - this.camera.left) / z1 / w;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = this.controls.target.clone().sub(this.camera.position).setY(0).normalize();
    const to = new THREE.Vector3(p.x, 0, p.z)
      .addScaledVector(right, (this.insets.right / 2) * perPx)
      .addScaledVector(fwd, -((this.insets.bottom / 2) * perPx) / Math.cos(0.96));
    this.focusAnim = { from: this.controls.target.clone(), to, z0: this.camera.zoom, z1, t: 0 };
  }

  private pickPosition(p: Pick): Vec | null {
    if (!this.grid || !this.data) return null;
    const L = this.data.layout;
    if (p.kind === 'plot') { const v = this.plots.get(p.id); return v ? v.center : null; }
    if (p.kind === 'townhall' || p.kind === 'arrivals') return this.grid.blockCenter(L.townHall.cx, L.townHall.cz);
    if (p.kind === 'park') return this.grid.blockCenter(L.park.cx, L.park.cz);
    if (p.kind === 'proposal') {
      const lot = this.data.proposals.find((x) => x.name === p.name)?.lot;
      return lot ? this.grid.cellCenter(lot.cx, lot.cz) : null;
    }
    return null;
  }

  /** On a slow GPU, drop to plain resolution and skip shadows rather than stutter. */
  private watchFps(dt: number) {
    if (this.lowPower || this.fpsSamples.length > 240) return;
    // A throttled tab (hidden, or its window covered) isn't a slow GPU.
    if (dt > 0.25) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length === 240) {
      const avg = this.fpsSamples.slice(60).reduce((a, b) => a + b, 0) / 180;
      if (avg > 1 / 38) {
        this.lowPower = true;
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
        this.resize();
      }
    }
  }
}

export { PITCH, GAP };
