// The Three.js view, shared by pickleball and volleyball. Reads game state and draws it;
// never changes it. The venue (venue.ts) builds the place, figure.ts the people; this
// file owns the ball, the camera, the effects (sparks, dust, shockwaves, confetti), the
// nameplates and the picture quality. Everything is built in code: no image, model,
// texture or font files.
//
// Quality: phones and slower laptops get the "low" path (no bloom pass, smaller shadows,
// a lower pixel ratio); if the "high" path can't hold its frame rate in the first couple
// of seconds it steps down by itself.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HEAT_WARM, other, sgn, type Team } from './sim';
import type { Character } from './characters';
import { buildFigure, disposeFigure, handPosition, poseFigure, type Figure, type FigureProp } from './figure';
import { buildVenue, type Venue, type VenueId } from './venue';
import type { BaseState, Sport } from './sport';

/** Team colors: coral and teal, from the Neon design pass. */
export const TEAM_COLORS = ['#FF5A5F', '#00B4D8'] as const;
export const SIDE_COLORS = TEAM_COLORS;

const SPARKS = 320;
const PUFFS = 28;
const CONFETTI = 360;

function radialTexture(inner: string, outer: string, mid?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  if (mid) grad.addColorStop(0.5, mid);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** a pickleball's holes, or a beach volleyball's swirling panels, as a little equirectangular map */
function ballTexture(kind: 'pickle' | 'volley'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  if (kind === 'pickle') {
    g.fillStyle = '#dcff3d';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#93ad16';
    [24, 64, 104].forEach((y, r) => {
      const n = r === 1 ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const x = ((i + (r % 2) * 0.5) / n) * 256;
        g.beginPath();
        g.ellipse(x, y, r === 1 ? 9 : 7, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.beginPath();
        g.ellipse(x, y - 2, r === 1 ? 7 : 5, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#93ad16';
      }
    });
  } else {
    // three colors in six swirled panels, stitched
    const colors = ['#ffd23f', '#1d6fd6', '#ffffff'];
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 128; y += 2) {
        const k = Math.floor(((x + Math.sin((y / 128) * Math.PI * 2) * 26 + y * 0.35) / 256) * 6 + 6) % 3;
        g.fillStyle = colors[k];
        g.fillRect(x, y, 1, 2);
      }
    }
    g.strokeStyle = 'rgba(20,30,60,0.45)';
    g.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      for (let y = 0; y <= 128; y += 4) {
        const x = ((k / 6) * 256 - Math.sin((y / 128) * Math.PI * 2) * 26 - y * 0.35 + 512) % 256;
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface Plate {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  key: string;
}

interface Rig {
  fig: Figure;
  plate: Plate;
  /** renderer time the victory move or sulk began, or -1 */
  cheerAt: number;
  sulkAt: number;
  t: number;
  step: number;
}

export interface RenderView {
  /** the team whose baseline the camera sits behind */
  team: Team;
  /** players this screen controls; the camera follows them */
  focus: number[];
  /** players on both teams share this screen: watch from the side */
  broadcast: boolean;
  /** light the patch the local server is aiming for */
  showServeTarget: boolean;
  /** attract mode: a slow orbit */
  orbit: boolean;
}

export function preferLow(): boolean {
  if (typeof window === 'undefined') return true;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return !!coarse || (mem !== undefined && mem <= 4) || Math.min(window.innerWidth, window.innerHeight) < 520;
}

export class CourtRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
  private container: HTMLElement;
  private ro: ResizeObserver;
  private sport: Sport;
  private venue: Venue;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private low: boolean;
  private frames = 0;
  private slow = 0;
  private rigs: Rig[] = [];
  private rosterKey = '';
  private names: string[] = [];
  private ball: THREE.Mesh;
  private ballMat: THREE.MeshStandardMaterial;
  private ballGlow: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private ring: THREE.Mesh;
  private wave: THREE.Mesh;
  private waveAge = 99;
  private flash: THREE.Sprite;
  /** where the ball will come down */
  private landMark: THREE.Mesh;
  private landDot: THREE.Mesh;
  private flashAge = 99;
  private serveTarget: THREE.Mesh;
  private sparks: THREE.Points;
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private sparkNext = 0;
  private puffs: Array<{ s: THREE.Sprite; life: number; vx: number; vy: number; vz: number; grow: number }> = [];
  private puffNext = 0;
  private confetti: THREE.Points;
  private confettiVel = new Float32Array(CONFETTI * 3);
  private confettiOn = false;
  private camPos = new THREE.Vector3(0, 20, 40);
  private camLook = new THREE.Vector3(0, 0, 0);
  private camPosTarget = new THREE.Vector3();
  private camLookTarget = new THREE.Vector3();
  private camReady = false;
  private punch = 0;
  private time = 0;
  private lastBounceTick = -1;
  private ringAge = 99;
  private lastPoint = -1;
  private lastSuper = -1;
  private lastCall = -1;
  private lastOver = false;
  private shake = 0;
  private lastHit = -1;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(container: HTMLElement, sport: Sport, venueId: VenueId) {
    this.container = container;
    this.sport = sport;
    this.low = preferLow();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.low ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const el = this.renderer.domElement;
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.touchAction = 'none';
    container.appendChild(el);

    this.venue = buildVenue(venueId, sport.court, this.scene, this.low);
    this.renderer.toneMappingExposure = this.venue.exposure;
    // the sky lights the scene too: shoes, paddles and hardwood pick up its color
    const sky = this.scene.getObjectByName('sky');
    if (sky) {
      const envScene = new THREE.Scene();
      envScene.add(sky.clone());
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environmentIntensity = venueId === 'arena' ? 0.9 : venueId === 'rooftop' ? 1.4 : 0.55;
      pmrem.dispose();
    }

    const R = sport.ballRadius;
    this.ballMat = new THREE.MeshStandardMaterial({
      map: ballTexture(sport.ball), roughness: sport.ball === 'pickle' ? 0.5 : 0.62,
      emissive: new THREE.Color(sport.ball === 'pickle' ? '#dcff3d' : '#ffffff'), emissiveIntensity: sport.ball === 'pickle' ? 0.16 : 0.03,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), this.ballMat);
    this.ball.castShadow = true;
    // Drawn after the nameplates, so a name never hides the ball.
    this.ballMat.transparent = true;
    this.ball.renderOrder = 12;
    this.scene.add(this.ball);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,190,80,0.95)', 'rgba(255,90,20,0)', 'rgba(255,120,30,0.45)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.ballGlow.visible = false;
    this.scene.add(this.ballGlow);

    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.7)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);

    // the trail: a ribbon that faces the camera and fades toward its tail
    const tg = new THREE.BufferGeometry();
    const TN = 18;
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
    const tc = new Float32Array(TN * 2 * 4);
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 4));
    const idx: number[] = [];
    for (let i = 0; i < TN - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    const flat = (geo: THREE.BufferGeometry, color: string) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05;
      this.scene.add(m);
      return m;
    };
    this.ring = flat(new THREE.RingGeometry(0.42, 0.62, 48), '#b8ff7a');
    this.wave = flat(new THREE.RingGeometry(0.8, 1.0, 64), '#ffb347');
    (this.wave.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
    this.serveTarget = flat(new THREE.PlaneGeometry(1, 1), '#ffffff');
    this.landMark = flat(new THREE.RingGeometry(0.78, 1, 40), '#ffffff');
    this.landDot = flat(new THREE.CircleGeometry(0.22, 20), '#ffffff');
    this.landMark.position.y = 0.07;
    this.landDot.position.y = 0.07;
    this.serveTarget.position.y = 0.04;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.scene.add(this.flash);

    // sparks: fire off the ball and the hands of whoever is hot
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3).fill(-999), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.95, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    // dust and sand kicked up by feet, bounces and dives
    const puffTex = radialTexture('rgba(255,255,255,0.75)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.3)');
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: this.venue.dust, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.scene.add(s);
      this.puffs.push({ s, life: 0, vx: 0, vy: 0, vz: 0, grow: 1 });
    }

    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONFETTI * 3).fill(-999), 3));
    const cc = new Float32Array(CONFETTI * 3);
    const col = new THREE.Color();
    const party = ['#FF5A5F', '#00B4D8', '#F4C430', '#dcff3d', '#F466A6', '#ffffff', '#7B2CBF'];
    for (let i = 0; i < CONFETTI; i++) { col.set(party[i % party.length]); cc.set([col.r, col.g, col.b], i * 3); }
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false }));
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.scene.add(this.confetti);

    if (!this.low) this.buildComposer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  private buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), this.venue.bloom, 0.7, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** step down for good: this machine can't hold the high path */
  private goLow() {
    this.low = true;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.resize();
  }

  /** (re)build the people on court; cheap to call every frame, it only rebuilds on change */
  setRoster(chars: Character[], teams: Team[]) {
    const key = JSON.stringify(chars.map((c) => ({ ...c, id: '' }))) + teams.join('');
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    for (const r of this.rigs) {
      this.scene.remove(r.fig.root, r.plate.sprite);
      disposeFigure(r.fig);
      r.plate.tex.dispose();
    }
    this.rigs = chars.map((c, i) => {
      const fig = buildFigure(c, TEAM_COLORS[teams[i]], this.sport.prop);
      // models face -z; team 1 turns around to face the net from the other end
      fig.root.rotation.y = teams[i] === 0 ? 0 : Math.PI;
      this.scene.add(fig.root);
      const plate = this.makePlate();
      this.scene.add(plate.sprite);
      return { fig, plate, cheerAt: -1, sulkAt: -1, t: i * 1.3, step: 0 };
    });
    this.names = chars.map((c) => c.name);
  }

  private makePlate(): Plate {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // the same size on screen near or far, so the near players' names don't fill the view
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }));
    sprite.renderOrder = 10;
    return { sprite, canvas, tex, key: '' };
  }

  /** name pill with a heat bar under it; redrawn only when something on it changes */
  private drawPlate(p: Plate, name: string, team: Team, heat: number, fire: boolean, you: boolean) {
    const key = `${name}|${team}|${Math.round(heat / 4)}|${fire}|${you}`;
    if (key === p.key) return;
    p.key = key;
    const g = p.canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 72);
    g.font = '700 30px ui-sans-serif, system-ui, sans-serif';
    const w = Math.min(240, g.measureText(name).width + 38);
    const x = 128 - w / 2;
    g.fillStyle = 'rgba(10,16,28,0.8)';
    g.beginPath();
    g.roundRect(x, 4, w, 40, 20);
    g.fill();
    if (you) {
      g.strokeStyle = '#dcff3d';
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = TEAM_COLORS[team];
    g.beginPath();
    g.arc(x + 18, 24, 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = you ? '#ffffff' : 'rgba(255,255,255,0.88)';
    g.textBaseline = 'middle';
    g.fillText(name, x + 30, 25);
    const bw = 120;
    const bx = 128 - bw / 2;
    g.fillStyle = 'rgba(10,16,28,0.6)';
    g.beginPath();
    g.roundRect(bx, 52, bw, 12, 6);
    g.fill();
    const frac = fire ? 1 : Math.max(0, Math.min(1, heat / 100));
    if (frac > 0) {
      const grad = g.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, '#ffd166');
      grad.addColorStop(1, fire ? '#ff3d00' : heat >= HEAT_WARM ? '#ff8c42' : '#ffd166');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(bx, 52, Math.max(12, bw * frac), 12, 6);
      g.fill();
    }
    p.tex.needsUpdate = true;
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // a phone held upright sees a narrow slice: widen the lens so the whole court fits
    this.camera.fov = w >= h ? 50 : Math.min(66, 50 + (1 - w / h) * 30);
    this.camera.updateProjectionMatrix();
  }

  // ————— effects —————

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const i = this.sparkNext;
    this.sparkNext = (this.sparkNext + 1) % SPARKS;
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(i, x, y, z);
    this.sparkVel.set([vx, vy, vz], i * 3);
    this.sparkLife[i] = 1;
  }

  private stepSparks(dt: number) {
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt * 1.5;
      const l = Math.max(0, this.sparkLife[i]);
      this.sparkVel[i * 3 + 1] += dt * 3; // flames rise
      pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt, pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      col.setXYZ(i, l * 1.6, l * l * 0.9, l * l * l * 0.25);
      if (l <= 0) pos.setXYZ(i, 0, -999, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private puff(x: number, y: number, z: number, size: number, vx = 0, vy = 1.2, vz = 0) {
    const p = this.puffs[this.puffNext];
    this.puffNext = (this.puffNext + 1) % PUFFS;
    p.s.position.set(x, y, z);
    p.s.scale.set(size, size, 1);
    p.s.visible = true;
    p.life = 1;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.grow = size * 1.6;
  }

  private burst(x: number, z: number, n: number, size: number, spread: number) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random();
      this.puff(x + Math.cos(a) * 0.3, 0.3, z + Math.sin(a) * 0.3, size * (0.7 + Math.random() * 0.6), Math.cos(a) * spread, 1 + Math.random() * 2.5, Math.sin(a) * spread);
    }
  }

  private stepPuffs(dt: number) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.5;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 2.5;
      p.vz *= 1 - dt * 2.5;
      p.vy -= dt * 2.2;
      const s = p.s.scale.x + p.grow * dt;
      p.s.scale.set(s, s, 1);
      (p.s.material as THREE.SpriteMaterial).opacity = p.life * (this.venue.sand ? 0.6 : 0.3);
    }
  }

  private startConfetti() {
    const pos = this.confetti.geometry.attributes.position as THREE.BufferAttribute;
    const HW = this.sport.court.halfWidth;
    const HL = this.sport.court.halfLength;
    for (let i = 0; i < CONFETTI; i++) {
      pos.setXYZ(i, (Math.random() - 0.5) * (HW * 2 + 14), 16 + Math.random() * 26, (Math.random() - 0.5) * (HL * 2 + 10));
      this.confettiVel.set([(Math.random() - 0.5) * 3, -3 - Math.random() * 4, (Math.random() - 0.5) * 3], i * 3);
    }
    pos.needsUpdate = true;
    this.confetti.visible = true;
    this.confettiOn = true;
  }

  private stepConfetti(dt: number) {
    if (!this.confettiOn) return;
    const pos = this.confetti.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < CONFETTI; i++) {
      let y = pos.getY(i) + this.confettiVel[i * 3 + 1] * dt;
      if (y < 0.1) y = 30 + Math.random() * 10;
      pos.setXYZ(i, pos.getX(i) + (this.confettiVel[i * 3] + Math.sin(this.time * 3 + i) * 1.5) * dt, y, pos.getZ(i) + (this.confettiVel[i * 3 + 2] + Math.cos(this.time * 2.3 + i) * 1.5) * dt);
    }
    pos.needsUpdate = true;
  }

  // ————— per frame —————

  render(state: BaseState, view: RenderView, frameDt: number) {
    this.time += frameDt;
    const sport = this.sport;
    const HW = sport.court.halfWidth;
    const HL = sport.court.halfLength;
    const vb = sport.id === 'volleyball';
    const n = Math.min(this.rigs.length, state.players.length);
    const R = sport.ballRadius;

    // ——— picture quality: give the high path two seconds to prove itself ———
    if (!this.low && this.frames < 150) {
      this.frames += 1;
      if (this.frames > 30 && frameDt > 0.03) this.slow += 1;
      if (this.frames === 150 && this.slow > 55) this.goLow();
    }

    // ——— camera ———
    const aspect = this.camera.aspect;
    const pull = Math.min(1.5, Math.max(1, 1.55 / aspect));
    const b = state.ball;
    if (view.orbit) {
      const a = this.time * 0.11;
      const r = (HL + 30) * Math.min(1.3, pull);
      this.camPosTarget.set(Math.sin(a) * r * 0.85, 17 + Math.sin(a * 0.7) * 4, Math.cos(a) * r);
      this.camLookTarget.set(0, 3, 0);
    } else if (view.broadcast) {
      // from the side, like a TV broadcast: both ends of the court in view
      const bz = Math.max(-8, Math.min(8, b.z * 0.25));
      this.camPosTarget.set((HW + 26 + (vb ? 5 : 0)) * pull, (24 + (vb ? 4 : 0)) * pull, bz);
      this.camLookTarget.set(0, vb ? 3 : 0, bz * 0.6);
    } else {
      const s = sgn(view.team);
      const focus = view.focus.length ? view.focus : state.players.map((_, i) => i).filter((i) => state.players[i].team === view.team);
      const fx = focus.reduce((acc, i) => acc + (state.players[i]?.x ?? 0), 0) / Math.max(1, focus.length);
      // Low and close behind your side, riding with the play: the camera leans toward the
      // ball across the court and lifts its gaze with it, so the ball stays big and in frame.
      const bx = Math.max(-HW, Math.min(HW, b.x));
      const bzc = Math.max(-HL, Math.min(HL, b.z));
      this.camPosTarget.set(fx * 0.3 + bx * 0.25, (vb ? 18 : 13) * pull + Math.min(6, b.y * 0.25), s * (HL + (vb ? 21 : 13.5) * pull) + (bzc - s * HL) * 0.12);
      this.camLookTarget.set(fx * 0.12 + bx * 0.35, (vb ? 3 : 1) + Math.min(5, b.y * 0.3), bzc * 0.4 - s * (vb ? 1 : 3));
    }
    for (const o of this.venue.nearSide) o.visible = !view.broadcast;
    const k = this.camReady ? Math.min(1, frameDt * (view.orbit ? 1.2 : 3)) : 1;
    this.camReady = true;
    this.camPos.lerp(this.camPosTarget, k);
    this.camLook.lerp(this.camLookTarget, k);
    this.shake = Math.max(0, this.shake - frameDt * 2.5);
    this.punch = Math.max(0, this.punch - frameDt * 1.6);
    const sh = this.shake * this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    // a super spike punches the camera in toward the ball for a beat
    this.tmp.copy(this.camLook).lerp(this.tmp2.set(b.x, Math.max(1, b.y * 0.5), b.z), this.punch * 0.45);
    this.camera.lookAt(this.tmp.x, this.tmp.y, this.tmp.z);
    if (this.punch > 0) {
      this.camera.zoom = 1 + this.punch * 0.22;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.zoom !== 1) {
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    }

    // ——— the moments ———
    if (state.pointSeq !== this.lastPoint) {
      if (this.lastPoint >= 0 && state.lastPoint) {
        const win = other(state.lastPoint.faultTeam);
        for (let i = 0; i < n; i++) {
          if (state.players[i].team === win) { this.rigs[i].cheerAt = this.time; this.rigs[i].sulkAt = -1; }
          else { this.rigs[i].sulkAt = this.time; this.rigs[i].cheerAt = -1; }
        }
        this.venue.cheer(0.55);
      }
      this.lastPoint = state.pointSeq;
    }
    if (state.phase === 'serve' || state.phase === 'rally') {
      for (const r of this.rigs) { r.cheerAt = -1; r.sulkAt = -1; }
    }
    const over = state.phase === 'over';
    if (over && !this.lastOver) { this.startConfetti(); this.venue.cheer(1); }
    if (!over && this.lastOver) { this.confettiOn = false; this.confetti.visible = false; }
    this.lastOver = over;
    if (over) this.venue.cheer(0.7);
    if (state.callSeq !== this.lastCall) {
      for (const c of state.calls) if (c.seq > this.lastCall && this.lastCall >= 0) this.venue.cheer(sport.callCheer[c.kind] ?? 0);
      this.lastCall = state.callSeq;
    }
    const superSeq = state.superSeq ?? 0;
    if (superSeq !== this.lastSuper) {
      if (this.lastSuper >= 0) {
        this.punch = 1;
        this.shake = 1.1;
        this.flashAge = 0;
        this.flash.position.set(b.x, b.y, b.z);
        for (let k2 = 0; k2 < 40; k2++) this.spark(b.x, b.y, b.z, (Math.random() - 0.5) * 16, (Math.random() - 0.3) * 12, (Math.random() - 0.5) * 16);
      }
      this.lastSuper = superSeq;
    }
    if (state.hitSeq !== this.lastHit) {
      if (this.lastHit >= 0) {
        if (b.hot) this.shake = Math.max(this.shake, 0.9);
        this.flashAge = b.hot || b.super ? 0 : 0.12;
        this.flash.position.set(b.x, b.y, b.z);
      }
      this.lastHit = state.hitSeq;
    }

    // ——— players ———
    for (let i = 0; i < n; i++) {
      const rig = this.rigs[i];
      const p = state.players[i];
      const s = sgn(p.team);
      const pose = sport.pose(state, i);
      const speed = Math.hypot(p.vx, p.vz);
      rig.t += frameDt;
      rig.fig.root.position.set(p.x, 0, p.z);
      const fire = p.fire > 0;
      const cheer = rig.cheerAt >= 0 ? this.time - rig.cheerAt : -1;
      const sulk = rig.sulkAt >= 0 ? this.time - rig.sulkAt : -1;
      poseFigure(rig.fig, {
        t: rig.t, dt: frameDt, speed, fwd: p.vz * s, side: p.vx * s,
        action: pose.action, phase: pose.phase, air: pose.air,
        ready: state.phase === 'rally' || (state.phase === 'serve' && i !== state.server),
        cheer: over && p.team === state.winner ? (this.time % 3.2) : cheer,
        sulk: over && p.team !== state.winner ? Math.min(1.1, this.time % 6) : sulk,
        look: over || state.phase === 'point' ? null : { x: (b.x - p.x) * s, y: b.y, z: (b.z - p.z) * s },
        heat: p.heat, fire, chef: pose.chef,
        diveYaw: speed > 0.5 ? Math.atan2(-p.vx * s, -p.vz * s) : 0,
      });
      rig.fig.ring.position.y = 0.06;
      const ringMat = rig.fig.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = fire ? 0.7 + Math.sin(this.time * 10) * 0.3 : view.focus.includes(i) ? 0.9 : 0.55;
      ringMat.color.set(fire ? '#ff6a1a' : TEAM_COLORS[p.team]);
      // The name sits under the feet, out of the air where the ball flies.
      rig.plate.sprite.position.set(p.x, 0.1, p.z);
      rig.plate.sprite.center.set(0.5, 1.12);
      const ps = aspect < 1 ? 1.35 : 0.85;
      rig.plate.sprite.scale.set(0.15 * ps, 0.042 * ps, 1);
      rig.plate.sprite.visible = !view.orbit;
      // and steps back when the ball goes past it on screen
      this.tmp.set(p.x, 0.1, p.z).project(this.camera);
      this.tmp2.set(b.x, Math.max(b.y, R), b.z).project(this.camera);
      const nearBall = Math.hypot((this.tmp.x - this.tmp2.x) * aspect, this.tmp.y - 0.06 - this.tmp2.y) < 0.16;
      const pm = rig.plate.sprite.material as THREE.SpriteMaterial;
      pm.opacity += ((nearBall ? 0.25 : view.focus.includes(i) || !view.focus.length ? 1 : 0.8) - pm.opacity) * Math.min(1, frameDt * 12);
      this.drawPlate(rig.plate, this.names[i] ?? '', p.team, p.heat, fire, view.focus.includes(i));
      if (fire && Math.random() < frameDt * 80) {
        handPosition(rig.fig, this.tmp);
        this.spark(this.tmp.x + (Math.random() - 0.5) * 0.6, this.tmp.y, this.tmp.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5);
        if (Math.random() < 0.4) this.spark(p.x + (Math.random() - 0.5) * 1.4, 0.3, p.z + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5));
      }
      // feet kick up dust on sand, and anyone landing or diving throws some
      rig.step += speed * frameDt;
      if (this.venue.sand && pose.air < 0.1 && rig.step > 3.2) {
        rig.step = 0;
        this.puff(p.x, 0.25, p.z, 1.1, -p.vx * 0.08, 0.8, -p.vz * 0.08);
      }
      if (pose.action === 'dive' && pose.phase > 0.25 && pose.phase < 0.4 && Math.random() < frameDt * 40) this.burst(p.x, p.z, 3, 1.6, 2.5);
      if (pose.action === 'down' && pose.phase < 0.12 && Math.random() < frameDt * 40) this.burst(p.x, p.z, 4, 1.8, 3);
    }

    // ——— ball, shadow, trail ———
    const by = Math.max(b.y, R);
    const hot = b.hot || !!b.super;
    this.ball.position.set(b.x, by, b.z);
    this.ball.rotation.x += frameDt * (b.vz * 0.6) / Math.max(0.3, R * 2.4);
    this.ball.rotation.z -= frameDt * (b.vx * 0.6) / Math.max(0.3, R * 2.4);
    this.ballMat.emissive.set(hot ? '#ff5a00' : sport.ball === 'pickle' ? '#dcff3d' : '#ffffff');
    this.ballMat.emissiveIntensity = hot ? 1.3 + Math.sin(this.time * 20) * 0.3 : sport.ball === 'pickle' ? 0.16 : 0.03;
    this.ballGlow.visible = hot;
    this.ballGlow.position.copy(this.ball.position);
    const gs = R * (b.super ? 16 : 9);
    this.ballGlow.scale.set(gs, gs, 1);
    const lift = Math.max(0, b.y);
    const shadowScale = R * 6 + lift * 0.09;
    this.ballShadow.scale.set(shadowScale, shadowScale, 1);
    this.ballShadow.position.set(b.x, 0.045, b.z);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.22, 1 - lift * 0.05);

    const moving = state.phase === 'rally' || state.phase === 'point';
    if (hot && moving) {
      for (let k2 = 0; k2 < (b.super ? 5 : 3); k2++) this.spark(b.x, by, b.z, -b.vx * 0.08 + (Math.random() - 0.5) * 2, (Math.random() - 0.2) * 2, -b.vz * 0.08 + (Math.random() - 0.5) * 2);
    }
    if (moving) this.trailPts.unshift(new THREE.Vector3(b.x, by, b.z));
    else this.trailPts.length = 0;
    if (this.trailPts.length > 18) this.trailPts.length = 18;
    this.drawTrail(hot, R, Math.hypot(b.vx, b.vy, b.vz));
    this.stepSparks(frameDt);
    this.stepPuffs(frameDt);
    this.stepConfetti(frameDt);

    // where it landed: green in, red out, dust, and a shockwave under a super spike
    if (state.lastBounce && state.lastBounce.tick !== this.lastBounceTick) {
      const first = this.lastBounceTick === -1;
      this.lastBounceTick = state.lastBounce.tick;
      if (!first || state.tick - state.lastBounce.tick < 30) {
        this.ringAge = 0;
        this.ring.position.set(state.lastBounce.x, 0.05, state.lastBounce.z);
        (this.ring.material as THREE.MeshBasicMaterial).color.set(state.lastBounce.in ? '#b8ff7a' : '#ff6b5e');
        if (this.venue.sand) this.burst(state.lastBounce.x, state.lastBounce.z, hot ? 9 : 5, hot ? 2.4 : 1.5, hot ? 5 : 2.5);
        else if (hot) this.burst(state.lastBounce.x, state.lastBounce.z, 4, 1.2, 3);
        if (hot) {
          this.waveAge = 0;
          this.wave.position.set(state.lastBounce.x, 0.06, state.lastBounce.z);
          this.shake = Math.max(this.shake, b.super ? 1.3 : 0.7);
        }
      }
    }
    if (!state.lastBounce) { this.ringAge = 99; this.lastBounceTick = -2; }
    this.ringAge += frameDt;
    const ringT = Math.min(1, this.ringAge / 1.2);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = (1 - ringT) * 0.9;
    this.ring.scale.setScalar((1 + ringT * 0.8) * Math.max(1, R * 3));
    this.waveAge += frameDt;
    const waveT = Math.min(1, this.waveAge / 0.7);
    (this.wave.material as THREE.MeshBasicMaterial).opacity = (1 - waveT) * 0.8;
    this.wave.scale.setScalar(1 + waveT * 9);
    this.flashAge += frameDt;
    const flashT = Math.min(1, this.flashAge / 0.22);
    (this.flash.material as THREE.SpriteMaterial).opacity = (1 - flashT) * 0.9;
    this.flash.scale.setScalar((hot ? 5 : 2.2) * (0.5 + flashT));

    // where the ball is going to come down: a ring that tightens as it arrives
    const land = moving && state.phase === 'rally' ? sport.landing?.(state) ?? null : null;
    const lm = this.landMark.material as THREE.MeshBasicMaterial;
    const ld = this.landDot.material as THREE.MeshBasicMaterial;
    if (land && land.t > 0.05) {
      const k = Math.min(1, land.t / 1.4);
      this.landMark.position.set(land.x, 0.07, land.z);
      this.landDot.position.set(land.x, 0.07, land.z);
      this.landMark.scale.setScalar(R * 2.2 * (1 + k * 1.6));
      this.landDot.scale.setScalar(R * 2.2);
      const c = hot ? '#ff8a3d' : '#ffffff';
      lm.color.set(c);
      ld.color.set(c);
      lm.opacity += (0.75 - lm.opacity) * Math.min(1, frameDt * 10);
      ld.opacity = lm.opacity * 0.8;
    } else {
      lm.opacity = Math.max(0, lm.opacity - frameDt * 4);
      ld.opacity = lm.opacity * 0.8;
    }

    // serve target
    const targetMat = this.serveTarget.material as THREE.MeshBasicMaterial;
    const st = view.showServeTarget && state.phase === 'serve' ? sport.serveTarget(state) : null;
    if (st) {
      this.serveTarget.position.set(st.x, 0.04, st.z);
      this.serveTarget.scale.set(st.w, st.d, 1);
      targetMat.opacity = 0.1 + Math.sin(this.time * 3) * 0.04;
    } else {
      targetMat.opacity = 0;
    }

    // the kitchen glows a little while one of your players stands in it, as a reminder not to volley
    const warn = state.phase === 'rally' ? sport.warnZone(state, view.focus) : null;
    this.venue.kitchenMats.forEach((mat, i) => {
      const want = warn === (i === 0 ? 0 : 1) ? 0.2 : 0;
      mat.opacity += (want - mat.opacity) * Math.min(1, frameDt * 8);
    });

    this.venue.update(this.time, frameDt);
    if (this.bloom) this.bloom.strength = this.venue.bloom + (hot ? 0.25 : 0) + this.punch * 0.5;
    if (this.composer) this.composer.render(frameDt);
    else this.renderer.render(this.scene, this.camera);
  }

  private drawTrail(hot: boolean, R: number, speed: number) {
    const pos = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.trail.geometry.attributes.color as THREE.BufferAttribute;
    const pts = this.trailPts;
    const N = 18;
    this.trail.visible = pts.length > 2 && (hot || speed > 20);
    if (!this.trail.visible) return;
    const c = hot ? [1, 0.45, 0.08] : this.sport.ball === 'pickle' ? [0.86, 1, 0.24] : [1, 1, 1];
    const strength = hot ? 0.85 : Math.min(0.3, (speed - 20) / 90);
    const cam = this.camera.position;
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      // widen across the view: perpendicular to both the path and the line of sight
      this.tmp.set(q.x - p.x, q.y - p.y, q.z - p.z);
      const side = new THREE.Vector3(cam.x - p.x, cam.y - p.y, cam.z - p.z).cross(this.tmp).normalize();
      if (!Number.isFinite(side.x)) side.set(0, 1, 0);
      const w = R * (hot ? 1.3 : 0.5) * (1 - i / N);
      pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
      pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      const a = strength * (1 - i / N) ** 1.5;
      col.setXYZW(i * 2, c[0], c[1], c[2], a);
      col.setXYZW(i * 2 + 1, c[0], c[1], c[2], a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  dispose() {
    this.ro.disconnect();
    for (const r of this.rigs) disposeFigure(r.fig);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        const map = (mat as THREE.MeshStandardMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * A turntable preview of one character, for the creator. Its own small renderer, so it
 * can live in a panel next to the controls.
 */
export class FigurePreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.5, 100);
  private fig: Figure | null = null;
  private raf = 0;
  private t = 0;
  private last = 0;
  private angle = -0.35;
  private drag: number | null = null;
  private cheerAt = -1;
  private container: HTMLElement;
  private ro: ResizeObserver;
  private prop: FigureProp;

  constructor(container: HTMLElement, prop: FigureProp = 'paddle') {
    this.container = container;
    this.prop = prop;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#3a3550', 1.5));
    const key = new THREE.DirectionalLight('#fff1dc', 2.4);
    key.position.set(-6, 10, -8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 9; sc.bottom = -2; sc.near = 1; sc.far = 30;
    key.shadow.radius = 5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fb8ff', 1.5);
    rim.position.set(6, 6, 8);
    this.scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#2b5c86', roughness: 0.7 }));
    pad.position.y = -0.15;
    pad.receiveShadow = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 8, 48), new THREE.MeshStandardMaterial({ color: '#dcff3d', roughness: 0.4, emissive: new THREE.Color('#dcff3d'), emissiveIntensity: 0.4 }));
    lip.rotation.x = Math.PI / 2;
    this.scene.add(pad, lip);
    this.camera.position.set(0, 4.4, -19);
    this.camera.lookAt(0, 3.25, 0);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.drag = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.angle += (e.clientX - this.drag) * 0.012; this.drag = e.clientX; } });
    el.addEventListener('pointerup', () => { this.drag = null; });
    el.addEventListener('pointercancel', () => { this.drag = null; });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(c: Character, team: Team = 0) {
    if (this.fig) { this.scene.remove(this.fig.root); disposeFigure(this.fig); }
    this.fig = buildFigure(c, TEAM_COLORS[team], this.prop);
    this.fig.ring.visible = false;
    this.scene.add(this.fig.root);
  }

  /** show off the victory move */
  cheer() {
    this.cheerAt = this.t;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.t += dt;
    if (this.drag === null) this.angle += dt * 0.35;
    if (this.cheerAt >= 0 && this.t - this.cheerAt > 2.2) this.cheerAt = -1;
    if (this.fig) {
      this.fig.root.rotation.y = this.angle;
      poseFigure(this.fig, {
        t: this.t, dt, speed: 0, fwd: 0, side: 0, action: 'none', phase: 0, air: 0, ready: false,
        cheer: this.cheerAt >= 0 ? this.t - this.cheerAt : -1, sulk: -1, look: null, heat: 0, fire: false, chef: false,
      });
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.fig) disposeFigure(this.fig);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
