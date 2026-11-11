// Pickleball — Three.js view. Reads GameState and draws it; never changes it.
// Everything on screen is built from primitives or tiny canvases drawn here:
// no image, model, texture or font files.

import * as THREE from 'three';
import {
  BALL_R, HALF_LENGTH, HALF_WIDTH, KITCHEN, POST_X, SWING_TOTAL,
  serveCourtSign, sgn, other, type GameState, type Side,
} from './sim';

export const SIDE_COLORS = ['#ff7a59', '#8f80ff'] as const;

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
  skin: '#e9c3a0',
  trees: '#14231d',
};

const BALL_VIS = BALL_R * 2.2; // drawn a little larger than life so it reads on screen

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

interface PlayerRig {
  root: THREE.Group;
  body: THREE.Group;
  paddlePivot: THREE.Group;
  lastX: number;
  lastZ: number;
  phase: number;
}

export interface RenderView {
  side: Side;
  /** tint the service court the local server is aiming for */
  showServeTarget: boolean;
}

export class CourtRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
  private container: HTMLElement;
  private ro: ResizeObserver;
  private rigs: [PlayerRig, PlayerRig];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private ring: THREE.Mesh;
  private serveTarget: THREE.Mesh;
  private kitchenMats: THREE.MeshStandardMaterial[] = [];
  private camX = 0;
  private time = 0;
  private lastBounceTick = -1;
  private ringAge = 99;

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

    this.rigs = [this.buildPlayer(0), this.buildPlayer(1)];

    const ballGeo = new THREE.SphereGeometry(BALL_VIS, 24, 16);
    this.ball = new THREE.Mesh(
      ballGeo,
      new THREE.MeshStandardMaterial({
        map: ballTexture(), roughness: 0.55, emissive: new THREE.Color(C.ball), emissiveIntensity: 0.18,
      }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);

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

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
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

  private buildPlayer(side: Side): PlayerRig {
    const color = new THREE.Color(SIDE_COLORS[side]);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const shorts = new THREE.MeshStandardMaterial({ color: '#1f2630', roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.3, 6, 14), shirt);
    torso.position.y = 3.0;
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 0.5, 6, 14), shorts);
    hips.position.y = 2.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), skin);
    head.position.y = 4.35;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.16, 20, 1, false, 0, Math.PI * 2), shirt);
    visor.position.y = 4.55;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20, 1, false, Math.PI / 2, Math.PI), shirt);
    brim.position.set(0, 4.5, -0.32);
    for (const sx of [-0.28, 0.28]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.3, 4, 10), skin);
      leg.position.set(sx, 0.9, 0);
      leg.name = sx < 0 ? 'legL' : 'legR';
      body.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.6 }));
      shoe.position.set(0, -0.75, -0.1);
      leg.add(shoe);
    }
    const offArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.0, 4, 8), skin);
    offArm.position.set(-0.78, 2.95, -0.1);
    offArm.rotation.z = -0.25;
    body.add(torso, hips, head, visor, brim, offArm);

    // paddle on the player's right, pivoting at the shoulder
    const paddlePivot = new THREE.Group();
    paddlePivot.position.set(0.72, 3.4, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.2, 4, 8), skin);
    arm.position.set(0.45, -0.35, -0.2);
    arm.rotation.z = Math.PI / 2.6;
    paddlePivot.add(arm);

    const shape = new THREE.Shape();
    const w = 0.42;
    const h = 0.58;
    const r = 0.2;
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const face = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 2 }),
      new THREE.MeshStandardMaterial({ color: '#20242b', roughness: 0.35, metalness: 0.2 }),
    );
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
    );
    edge.scale.set(0.8, 0.8, 1);
    edge.position.z = 0.09;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.6, 10), new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.9 }));
    handle.position.y = -h - 0.32;
    const paddle = new THREE.Group();
    paddle.add(face, edge, handle);
    paddle.position.set(1.05, -0.55, -0.45);
    paddle.rotation.y = Math.PI / 2;
    paddlePivot.add(paddle);
    body.add(paddlePivot);

    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    // models face -z; side 1 turns around to face the net from the other end
    root.rotation.y = side === 0 ? 0 : Math.PI;
    this.scene.add(root);
    return { root, body, paddlePivot, lastX: 0, lastZ: 0, phase: 0 };
  }

  // ————— per frame —————

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(state: GameState, view: RenderView, frameDt: number) {
    this.time += frameDt;
    const s = sgn(view.side);

    // camera: three-quarter view from behind the local baseline, easing with the player
    const me = state.players[view.side];
    this.camX += (me.x * 0.35 - this.camX) * Math.min(1, frameDt * 3);
    const aspect = this.camera.aspect;
    const pull = Math.min(1.45, Math.max(1, 1.55 / aspect));
    this.camera.position.set(this.camX, 15.5 * pull, s * (HALF_LENGTH + 19 * pull));
    this.camera.lookAt(this.camX * 0.4, 0, -s * 4);

    for (const side of [0, 1] as Side[]) this.poseRig(this.rigs[side], state, side, frameDt);

    // ball, shadow, trail
    const b = state.ball;
    const by = Math.max(b.y, BALL_VIS);
    this.ball.position.set(b.x, by, b.z);
    this.ball.rotation.x += frameDt * (b.vz * 0.6);
    this.ball.rotation.z -= frameDt * (b.vx * 0.6);
    const lift = Math.max(0, b.y);
    const shadowScale = 0.75 + lift * 0.08;
    this.ballShadow.scale.set(shadowScale, shadowScale, 1);
    this.ballShadow.position.set(b.x, 0.045, b.z);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - lift * 0.07);

    const moving = state.phase === 'rally' || state.phase === 'point';
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
      const rcv = other(state.server);
      const cx = serveCourtSign(state, rcv) * HALF_WIDTH / 2;
      const cz = sgn(rcv) * (KITCHEN + (HALF_LENGTH - KITCHEN) / 2);
      this.serveTarget.position.set(cx, 0.04, cz);
      targetMat.opacity = 0.1 + Math.sin(this.time * 3) * 0.04;
    } else {
      targetMat.opacity = 0;
    }

    // the kitchen glows a little while you stand in it, as a reminder not to volley
    const inKitchen = state.phase === 'rally' && Math.abs(me.z) <= KITCHEN;
    this.kitchenMats.forEach((mat, i) => {
      const mine = (i === 0 ? 0 : 1) === view.side;
      const target = mine && inKitchen ? 0.22 : 0;
      mat.emissive.set('#ffd27a');
      mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, frameDt * 8);
    });

    this.renderer.render(this.scene, this.camera);
  }

  private poseRig(rig: PlayerRig, state: GameState, side: Side, dt: number) {
    const p = state.players[side];
    rig.root.position.set(p.x, 0, p.z);
    const speed = Math.hypot(p.vx, p.vz);
    rig.phase += dt * (4 + speed * 0.7);
    const stride = Math.min(1, speed / 12);
    const legL = rig.body.getObjectByName('legL');
    const legR = rig.body.getObjectByName('legR');
    if (legL && legR) {
      legL.rotation.x = Math.sin(rig.phase * 2) * 0.6 * stride;
      legR.rotation.x = -Math.sin(rig.phase * 2) * 0.6 * stride;
    }
    rig.body.position.y = Math.abs(Math.sin(rig.phase * 2)) * 0.15 * stride;
    // lean into the run, in the player's own frame
    const s = sgn(side);
    rig.body.rotation.x = (p.vz * s) * 0.012;
    rig.body.rotation.z = -(p.vx * s) * 0.01;

    // swing: back, through, follow-through; idle in a ready position
    const pv = rig.paddlePivot;
    if (p.swingT >= 0) {
      const t = p.swingT / SWING_TOTAL;
      const e = t < 0.25 ? -t / 0.25 : (t - 0.25) / 0.75;
      const k = t < 0.25 ? e : 1 - (1 - e) ** 3;
      pv.rotation.y = t < 0.25 ? 0.2 + k * 0.9 : -0.7 - k * 1.5 + 1.6 * (1 - k);
      pv.rotation.x = t < 0.25 ? -k * 0.3 : -0.3 + k * 0.8;
    } else {
      pv.rotation.y += (0.35 - pv.rotation.y) * Math.min(1, dt * 8);
      pv.rotation.x += (0 - pv.rotation.x) * Math.min(1, dt * 8);
    }
  }

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
