// Pickleball: Three.js view. Reads GameState and draws it; never changes it.
// Everything on screen is built from primitives or tiny canvases drawn here and in
// figure.ts: no image, model, texture or font files.

import * as THREE from 'three';
import {
  BALL_R, HALF_LENGTH, HALF_WIDTH, HEAT_WARM, KITCHEN, POST_X, SWING_TOTAL,
  other, serveCourtSign, sgn, type GameState, type Team,
} from './sim';
import type { Character } from './characters';
import { buildFigure, poseFigure, type Figure } from './figure';

/** Team colors: coral and teal, from the Neon design pass. */
export const TEAM_COLORS = ['#FF5A5F', '#00B4D8'] as const;
export const SIDE_COLORS = TEAM_COLORS;

const C = {
  skyTop: new THREE.Color('#0d1a2e'),
  skyMid: new THREE.Color('#2b4669'),
  skyLow: new THREE.Color('#e3a77d'),
  ground: '#17241f',
  apron: '#2f6a55',
  court: '#2b5c86',
  kitchen: '#3871a0',
  line: '#f3efe4',
  net: '#15181c',
  post: '#2a2f36',
  fence: '#0f1612',
  ball: '#dcff3d',
  trees: '#14231d',
};

const BALL_VIS = BALL_R * 2.4; // drawn a little larger than life so it reads on screen
const SPARKS = 160;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** a pickleball's holes, drawn into a little equirectangular canvas */
function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = C.ball;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#a7c21f';
  const rows = [12, 32, 52];
  rows.forEach((y, r) => {
    const n = r === 1 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const x = ((i + (r % 2) * 0.5) / n) * 128;
      g.beginPath();
      g.ellipse(x, y, r === 1 ? 4.5 : 3.5, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  hop: number;
  t: number;
}

export interface RenderView {
  /** the team whose baseline the camera sits behind */
  team: Team;
  /** players this screen controls; the camera follows them */
  focus: number[];
  /** players on both teams share this screen: watch from the side */
  broadcast: boolean;
  /** tint the service court the local server is aiming for */
  showServeTarget: boolean;
}

export class CourtRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
  private container: HTMLElement;
  private ro: ResizeObserver;
  private rigs: Rig[] = [];
  private rosterKey = '';
  private ball: THREE.Mesh;
  private ballMat: THREE.MeshStandardMaterial;
  private ballGlow: THREE.Sprite;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private ring: THREE.Mesh;
  private serveTarget: THREE.Mesh;
  private kitchenMats: THREE.MeshStandardMaterial[] = [];
  private sparks: THREE.Points;
  private sparkVel = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private sparkNext = 0;
  private nearSide: THREE.Object3D[] = [];
  private camPos = new THREE.Vector3(0, 20, 40);
  private camLook = new THREE.Vector3(0, 0, 0);
  private camReady = false;
  private time = 0;
  private lastBounceTick = -1;
  private ringAge = 99;
  private lastPoint = -1;
  private shake = 0;
  private lastHit = -1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(new THREE.Color('#2a3f58'), 120, 330);
    this.buildSky();
    this.buildLights();
    this.buildGrounds();
    this.buildCourt();
    this.buildNet();
    this.buildSurroundings();
    // poles and towers along the +x side stand between the side camera and the court
    this.nearSide = this.scene.children.filter((o) => o.position.x > 15 && Math.abs(o.position.z) < 40 && o.position.y > 0);

    this.ballMat = new THREE.MeshStandardMaterial({
      map: ballTexture(), roughness: 0.55, emissive: new THREE.Color(C.ball), emissiveIntensity: 0.18,
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_VIS, 24, 16), this.ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,170,60,0.9)', 'rgba(255,90,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.ballGlow.scale.set(2.4, 2.4, 1);
    this.ballGlow.visible = false;
    this.scene.add(this.ballGlow);

    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: C.ball, transparent: true, opacity: 0.35 }),
    );
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: '#b8ff7a', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.scene.add(this.ring);

    this.serveTarget = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_WIDTH, HALF_LENGTH - KITCHEN),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.serveTarget.rotation.x = -Math.PI / 2;
    this.serveTarget.position.y = 0.04;
    this.scene.add(this.serveTarget);

    // sparks: fire off the ball and the feet of whoever is on fire
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3).fill(-999), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  /** (re)build the people on court; cheap to call every frame, it only rebuilds on change */
  setRoster(chars: Character[], teams: Team[]) {
    const key = JSON.stringify(chars.map((c) => ({ ...c, id: '' }))) + teams.join('');
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    for (const r of this.rigs) {
      this.scene.remove(r.fig.root, r.plate.sprite);
      r.plate.tex.dispose();
    }
    this.rigs = chars.map((c, i) => {
      const fig = buildFigure(c, TEAM_COLORS[teams[i]]);
      // models face -z; team 1 turns around to face the net from the other end
      fig.root.rotation.y = teams[i] === 0 ? 0 : Math.PI;
      this.scene.add(fig.root);
      const plate = this.makePlate();
      this.scene.add(plate.sprite);
      return { fig, plate, hop: 0, t: i * 1.3 };
    });
    this.names = chars.map((c) => c.name);
    this.teamsOf = teams;
  }
  private names: string[] = [];
  private teamsOf: Team[] = [];

  private makePlate(): Plate {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // the same size on screen near or far, so the near players' names don't fill the view
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
    sprite.scale.set(0.15, 0.042, 1);
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
    g.font = '600 30px ui-sans-serif, system-ui, sans-serif';
    const w = Math.min(240, g.measureText(name).width + 34);
    const x = 128 - w / 2;
    g.fillStyle = 'rgba(10,16,28,0.78)';
    g.beginPath();
    g.roundRect(x, 4, w, 40, 20);
    g.fill();
    g.fillStyle = TEAM_COLORS[team];
    g.beginPath();
    g.arc(x + 17, 24, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = you ? '#ffffff' : 'rgba(255,255,255,0.88)';
    g.textBaseline = 'middle';
    g.fillText(name, x + 28, 25);
    // heat bar
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

  // ————— scene building —————

  private buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 20);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 400; // -1..1
      if (h < 0.02) col.copy(C.skyLow);
      else if (h < 0.25) col.copy(C.skyLow).lerp(C.skyMid, (h - 0.02) / 0.23);
      else col.copy(C.skyMid).lerp(C.skyTop, Math.min(1, (h - 0.25) / 0.6));
      colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    this.scene.add(sky);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#bcd3ff', '#2a3b2c', 1.1));
    const sun = new THREE.DirectionalLight('#ffe2c4', 2.1);
    sun.position.set(-26, 46, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#7fa6ff', 0.45);
    fill.position.set(30, 20, -30);
    this.scene.add(fill);
  }

  private flat(w: number, d: number, color: string, y: number, x = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private buildGrounds() {
    this.flat(900, 900, C.ground, -0.02);
    this.flat(34, 64, C.apron, 0);
  }

  private buildCourt() {
    this.flat(HALF_WIDTH * 2, HALF_LENGTH * 2, C.court, 0.01);
    for (const s of [1, -1]) {
      const k = this.flat(HALF_WIDTH * 2, KITCHEN, C.kitchen, 0.02, 0, (s * KITCHEN) / 2);
      this.kitchenMats.push(k.material as THREE.MeshStandardMaterial);
    }
    const lineMat = new THREE.MeshStandardMaterial({ color: C.line, roughness: 0.6 });
    const W = 0.17;
    const line = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    line(W, HALF_LENGTH * 2 + W, -HALF_WIDTH, 0); // sidelines
    line(W, HALF_LENGTH * 2 + W, HALF_WIDTH, 0);
    for (const s of [1, -1]) {
      line(HALF_WIDTH * 2, W, 0, s * HALF_LENGTH); // baseline
      line(HALF_WIDTH * 2, W, 0, s * KITCHEN); // kitchen (non-volley) line
      line(W, HALF_LENGTH - KITCHEN, 0, s * (KITCHEN + (HALF_LENGTH - KITCHEN) / 2)); // centerline
      line(W, 0.8, 0, s * (HALF_LENGTH - 0.4)); // center mark
    }
  }

  private buildNet() {
    const postMat = new THREE.MeshStandardMaterial({ color: C.post, roughness: 0.5, metalness: 0.4 });
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 12), postMat);
      post.position.set(s * POST_X, 1.6, 0);
      post.castShadow = true;
      this.scene.add(post);
    }
    // net hangs from 36" at the posts to 34" at the center
    const sag = (x: number) => 3.0 - (3.0 - 2.83) * (1 - (x / POST_X) ** 2);
    const pts: number[] = [];
    for (let x = -POST_X; x <= POST_X + 0.001; x += 0.33) {
      pts.push(x, 0.15, 0, x, sag(x), 0);
    }
    for (let y = 0.15; y < 2.85; y += 0.33) {
      for (let x = -POST_X; x < POST_X - 0.001; x += 0.33) {
        const x2 = Math.min(POST_X, x + 0.33);
        if (y < sag(x) && y < sag(x2)) pts.push(x, y, 0, x2, y, 0);
      }
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: C.net, transparent: true, opacity: 0.85 })));

    // a faint backing so the net reads as a surface and casts a soft shadow
    const curtainShape = new THREE.Shape();
    curtainShape.moveTo(-POST_X, 0.15);
    for (let x = -POST_X; x <= POST_X + 0.001; x += 1) curtainShape.lineTo(x, sag(x));
    curtainShape.lineTo(POST_X, 0.15);
    const curtain = new THREE.Mesh(
      new THREE.ShapeGeometry(curtainShape),
      new THREE.MeshStandardMaterial({ color: C.net, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    curtain.castShadow = true;
    this.scene.add(curtain);

    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 12 }, (_, i) => {
        const x = -POST_X + (i / 11) * POST_X * 2;
        return new THREE.Vector3(x, sag(x), 0);
      }),
    );
    const tape = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.09, 6, false),
      new THREE.MeshStandardMaterial({ color: C.line, roughness: 0.5 }),
    );
    tape.castShadow = true;
    this.scene.add(tape);
  }

  private buildSurroundings() {
    // chain-link fence around the apron
    const fx = 17;
    const fz = 32;
    const fh = 10;
    const pts: number[] = [];
    const seg = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.round(len / 0.9);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x1 + (x2 - x1) * t;
        const z = z1 + (z2 - z1) * t;
        pts.push(x, 0, z, x, fh, z);
      }
      for (let y = 0.9; y < fh; y += 0.9) pts.push(x1, y, z1, x2, y, z2);
    };
    seg(-fx, -fz, fx, -fz);
    seg(-fx, fz, fx, fz);
    seg(-fx, -fz, -fx, fz);
    seg(fx, -fz, fx, fz);
    const fenceGeo = new THREE.BufferGeometry();
    fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(fenceGeo, new THREE.LineBasicMaterial({ color: '#0b120f', transparent: true, opacity: 0.35 })));

    const poleMat = new THREE.MeshStandardMaterial({ color: '#1c2420', roughness: 0.6, metalness: 0.3 });
    const corners: [number, number][] = [];
    // Corners only on the end fences: a pole at the middle would stand right in front of each player's camera.
    for (const x of [-fx, fx]) for (const z of [-fz, fz]) corners.push([x, z]);
    for (let z = -fz + 8; z < fz; z += 8) for (const x of [-fx, fx]) corners.push([x, z]);
    for (const [x, z] of corners) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, fh, 8), poleMat);
      pole.position.set(x, fh / 2, z);
      this.scene.add(pole);
    }
    // four light towers with glowing heads
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#fff1d0'), emissiveIntensity: 2.2 });
    for (const [x, z] of [[-22, -36], [22, -36], [-22, 36], [22, 36]] as [number, number][]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 26, 8), poleMat);
      tower.position.set(x, 13, z);
      this.scene.add(tower);
      const head = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.5), headMat);
      head.position.set(x * 0.94, 26, z * 0.97);
      head.lookAt(0, 0, 0);
      this.scene.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture('rgba(255,240,210,0.55)', 'rgba(255,240,210,0)'), depthWrite: false, transparent: true,
      }));
      glow.position.copy(head.position);
      glow.scale.set(9, 9, 1);
      this.scene.add(glow);
    }

    // a ring of trees on the horizon
    const rnd = seeded(0x9e3779b9);
    const n = 140;
    const trees = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 7),
      new THREE.MeshStandardMaterial({ color: C.trees, roughness: 1 }),
      n,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.04;
      const r = 95 + rnd() * 60;
      const h = 18 + rnd() * 26;
      const w = 5 + rnd() * 5;
      m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
      trees.setMatrixAt(i, m);
    }
    this.scene.add(trees);
  }


  // ————— per frame —————

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, hot: boolean) {
    const i = this.sparkNext;
    this.sparkNext = (this.sparkNext + 1) % SPARKS;
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    pos.setXYZ(i, x, y, z);
    this.sparkVel.set([vx, vy, vz], i * 3);
    this.sparkLife[i] = 1;
    col.setXYZ(i, 1, hot ? 0.55 : 0.85, hot ? 0.1 : 0.4);
  }

  private stepSparks(dt: number) {
    const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt * 1.6;
      const l = Math.max(0, this.sparkLife[i]);
      this.sparkVel[i * 3 + 1] += dt * 3; // flames rise
      pos.setXYZ(i, pos.getX(i) + this.sparkVel[i * 3] * dt, pos.getY(i) + this.sparkVel[i * 3 + 1] * dt, pos.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      col.setXYZ(i, l, l * 0.45, l * 0.08);
      if (l <= 0) pos.setXYZ(i, 0, -999, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  render(state: GameState, view: RenderView, frameDt: number) {
    this.time += frameDt;
    const n = Math.min(this.rigs.length, state.players.length);

    // ——— camera ———
    const aspect = this.camera.aspect;
    const pull = Math.min(1.45, Math.max(1, 1.55 / aspect));
    if (view.broadcast) {
      // from the side, like a TV broadcast: both ends of the court in view
      const bz = Math.max(-8, Math.min(8, state.ball.z * 0.25));
      this.camPosTarget.set(36 * pull, 24 * pull, bz);
      this.camLookTarget.set(0, 0, bz * 0.6);
    } else {
      const s = sgn(view.team);
      const focus = view.focus.length ? view.focus : state.players.map((_, i) => i).filter((i) => state.players[i].team === view.team);
      const fx = focus.reduce((a, i) => a + (state.players[i]?.x ?? 0), 0) / Math.max(1, focus.length);
      this.camPosTarget.set(fx * 0.35, 15.5 * pull, s * (HALF_LENGTH + 19 * pull));
      this.camLookTarget.set(fx * 0.14, 0, -s * 4);
    }
    for (const o of this.nearSide) o.visible = !view.broadcast;
    const k = this.camReady ? Math.min(1, frameDt * 3) : 1;
    this.camReady = true;
    this.camPos.lerp(this.camPosTarget, k);
    this.camLook.lerp(this.camLookTarget, k);
    this.shake = Math.max(0, this.shake - frameDt * 2.5);
    const sh = this.shake * this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    this.camera.lookAt(this.camLook);

    // ——— celebrations: the team that won the rally hops ———
    if (state.pointSeq !== this.lastPoint) {
      if (this.lastPoint >= 0 && state.lastPoint) {
        const win = other(state.lastPoint.faultTeam);
        for (let i = 0; i < n; i++) if (state.players[i].team === win) this.rigs[i].hop = 1.1;
      }
      this.lastPoint = state.pointSeq;
    }
    if (state.hitSeq !== this.lastHit) {
      if (state.ball.hot && this.lastHit >= 0) this.shake = 0.9;
      this.lastHit = state.hitSeq;
    }

    // ——— players ———
    for (let i = 0; i < n; i++) {
      const rig = this.rigs[i];
      const p = state.players[i];
      rig.t += frameDt;
      rig.hop = Math.max(0, rig.hop - frameDt);
      const hopT = 1.1 - rig.hop;
      const hop = rig.hop > 0 ? Math.max(0, Math.sin((hopT / 0.42) * Math.PI)) * (hopT < 0.84 ? 1 : 0) : 0;
      rig.fig.root.position.set(p.x, 0, p.z);
      const s = sgn(p.team);
      poseFigure(rig.fig, {
        t: rig.t, speed: Math.hypot(p.vx, p.vz), fwd: p.vz * s, side: p.vx * s,
        swing: p.swingT >= 0 ? p.swingT / SWING_TOTAL : -1, hop, heat: p.heat, fire: p.fire > 0,
        chef: p.chefUntil > state.tick, dt: frameDt,
      });
      const ringMat = (rig.fig.root.getObjectByName('ring') as THREE.Mesh).material as THREE.MeshBasicMaterial;
      ringMat.opacity = p.fire > 0 ? 0.7 + Math.sin(this.time * 10) * 0.3 : 0.75;
      ringMat.color.set(p.fire > 0 ? '#ff6a1a' : TEAM_COLORS[p.team]);
      const top = 7.2 * rig.fig.scale + hop * 1.6;
      rig.plate.sprite.position.set(p.x, top, p.z);
      this.drawPlate(rig.plate, this.names[i] ?? '', p.team, p.heat, p.fire > 0, view.focus.includes(i));
      if (p.fire > 0 && Math.random() < frameDt * 70) {
        this.spark(p.x + (Math.random() - 0.5) * 1.4, 0.3 + Math.random() * 2, p.z + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5, true);
      }
    }

    // ——— ball, shadow, trail ———
    const b = state.ball;
    const by = Math.max(b.y, BALL_VIS);
    this.ball.position.set(b.x, by, b.z);
    this.ball.rotation.x += frameDt * (b.vz * 0.6);
    this.ball.rotation.z -= frameDt * (b.vx * 0.6);
    this.ballMat.emissive.set(b.hot ? '#ff5a00' : C.ball);
    this.ballMat.emissiveIntensity = b.hot ? 1.1 + Math.sin(this.time * 20) * 0.3 : 0.18;
    this.ballGlow.visible = b.hot;
    this.ballGlow.position.copy(this.ball.position);
    const lift = Math.max(0, b.y);
    const shadowScale = 0.75 + lift * 0.08;
    this.ballShadow.scale.set(shadowScale, shadowScale, 1);
    this.ballShadow.position.set(b.x, 0.045, b.z);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - lift * 0.07);

    const moving = state.phase === 'rally' || state.phase === 'point';
    if (b.hot && moving) {
      for (let k2 = 0; k2 < 3; k2++) this.spark(b.x, by, b.z, -b.vx * 0.08 + (Math.random() - 0.5) * 2, (Math.random() - 0.2) * 2, -b.vz * 0.08 + (Math.random() - 0.5) * 2, true);
    }
    if (moving) this.trailPts.push(new THREE.Vector3(b.x, by, b.z));
    else this.trailPts.length = 0;
    while (this.trailPts.length > 16) this.trailPts.shift();
    const arr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 16; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)] ?? this.ball.position;
      arr.setXYZ(i, p.x, p.y, p.z);
    }
    arr.needsUpdate = true;
    this.trail.visible = this.trailPts.length > 2;
    const trailMat = this.trail.material as THREE.LineBasicMaterial;
    trailMat.color.set(b.hot ? '#ff7a1a' : C.ball);
    trailMat.opacity = b.hot ? 0.8 : 0.35;
    this.stepSparks(frameDt);

    // bounce ring: green when in, red when out
    if (state.lastBounce && state.lastBounce.tick !== this.lastBounceTick) {
      this.lastBounceTick = state.lastBounce.tick;
      this.ringAge = 0;
      this.ring.position.set(state.lastBounce.x, 0.05, state.lastBounce.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(state.lastBounce.in ? '#b8ff7a' : '#ff6b5e');
    }
    if (!state.lastBounce) this.ringAge = 99;
    this.ringAge += frameDt;
    const ringT = Math.min(1, this.ringAge / 1.2);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = (1 - ringT) * 0.9;
    this.ring.scale.setScalar(1 + ringT * 0.8);

    // serve target: the diagonal court past the kitchen line
    const targetMat = this.serveTarget.material as THREE.MeshBasicMaterial;
    if (view.showServeTarget && state.phase === 'serve') {
      const rcv = other(state.servingTeam);
      const cx = serveCourtSign(state, rcv) * HALF_WIDTH / 2;
      const cz = sgn(rcv) * (KITCHEN + (HALF_LENGTH - KITCHEN) / 2);
      this.serveTarget.position.set(cx, 0.04, cz);
      targetMat.opacity = 0.1 + Math.sin(this.time * 3) * 0.04;
    } else {
      targetMat.opacity = 0;
    }

    // the kitchen glows a little while one of your players stands in it, as a reminder not to volley
    const inKitchen = state.phase === 'rally' && view.focus.some((i) => state.players[i] && Math.abs(state.players[i].z) <= KITCHEN);
    this.kitchenMats.forEach((mat, i) => {
      const half: Team = i === 0 ? 0 : 1;
      const mine = view.focus.some((f) => state.players[f]?.team === half);
      const target = mine && inKitchen ? 0.22 : 0;
      mat.emissive.set('#ffd27a');
      mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, frameDt * 8);
    });

    this.renderer.render(this.scene, this.camera);
  }
  private camPosTarget = new THREE.Vector3();
  private camLookTarget = new THREE.Vector3();

  dispose() {
    this.ro.disconnect();
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
  private hop = 0;
  private container: HTMLElement;
  private ro: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#2a3b2c', 1.4));
    const key = new THREE.DirectionalLight('#fff1dc', 2.2);
    key.position.set(-6, 10, -8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fb8ff', 1.2);
    rim.position.set(6, 6, 8);
    this.scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.3, 40), new THREE.MeshStandardMaterial({ color: '#2b5c86', roughness: 0.9 }));
    pad.position.y = -0.15;
    this.scene.add(pad);
    this.camera.position.set(0, 4.6, -17);
    this.camera.lookAt(0, 3.3, 0);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { this.drag = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.angle += (e.clientX - this.drag) * 0.012; this.drag = e.clientX; } });
    el.addEventListener('pointerup', () => { this.drag = null; });
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
    if (this.fig) this.scene.remove(this.fig.root);
    this.fig = buildFigure(c, TEAM_COLORS[team]);
    (this.fig.root.getObjectByName('ring') as THREE.Mesh).visible = false;
    this.scene.add(this.fig.root);
    this.hop = 0.6; // a happy hop on every change
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.t += dt;
    if (this.drag === null) this.angle += dt * 0.35;
    this.hop = Math.max(0, this.hop - dt);
    if (this.fig) {
      this.fig.root.rotation.y = this.angle;
      poseFigure(this.fig, { t: this.t, speed: 0, fwd: 0, side: 0, swing: -1, hop: Math.max(0, Math.sin(((0.6 - this.hop) / 0.4) * Math.PI)) * (this.hop > 0.2 ? 0.5 : 0), heat: 0, fire: false, chef: false, dt });
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
