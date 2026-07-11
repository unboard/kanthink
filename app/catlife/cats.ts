// Whisker Wilds — procedural cat models + animation
// Every cat is built from primitives with a canvas-painted coat texture,
// so each one is visually unique (base color, markings, pattern, eyes, size).

import * as THREE from 'three';
import type { AccessoryId, CatAction, CatSpec } from './types';
import { mulberry32 } from './rng';

// ——— shared geometries (cached across all cats) ———
let GEO: {
  sphere: THREE.SphereGeometry;
  cone: THREE.ConeGeometry;
  cyl: THREE.CylinderGeometry;
  torus: THREE.TorusGeometry;
} | null = null;

function geo() {
  if (!GEO) {
    GEO = {
      sphere: new THREE.SphereGeometry(1, 20, 16),
      cone: new THREE.ConeGeometry(1, 1, 12),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
      torus: new THREE.TorusGeometry(1, 0.14, 8, 20),
    };
  }
  return GEO;
}

// ——— coat texture painting ———
export function paintCoatTexture(spec: CatSpec): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const { base, marking, belly, pattern } = spec.coat;
  const rng = mulberry32(hashStr(spec.id));

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // Sphere UV: v=0 bottom pole (belly), v=1 top pole (back). u wraps around.
  const paintBelly = (h: number) => {
    const g = ctx.createLinearGradient(0, 256, 0, 256 - h - 30);
    g.addColorStop(0, belly);
    g.addColorStop(1, base + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 256 - h - 30, 256, h + 30);
  };

  switch (pattern) {
    case 'solid':
      paintBelly(50);
      break;
    case 'tabby': {
      paintBelly(60);
      ctx.strokeStyle = marking;
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = 10 + i * 28 + rng() * 10;
        ctx.lineWidth = 8 + rng() * 8;
        ctx.beginPath();
        ctx.moveTo(x, 10 + rng() * 15);
        ctx.quadraticCurveTo(x + 12, 90 + rng() * 20, x - 6, 150 + rng() * 25);
        ctx.stroke();
      }
      break;
    }
    case 'spots': {
      paintBelly(60);
      ctx.fillStyle = marking;
      for (let i = 0; i < 18; i++) {
        const x = rng() * 256;
        const y = rng() * 170;
        const r = 8 + rng() * 14;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'tuxedo': {
      // dark coat, crisp white belly/chest
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#f2efe8';
      ctx.beginPath();
      ctx.ellipse(128, 256, 150, 110, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'calico': {
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(0, 0, 256, 256);
      const cols = [marking, '#e8963c', marking];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = cols[i % cols.length];
        const x = rng() * 256;
        const y = rng() * 180;
        ctx.beginPath();
        ctx.ellipse(x, y, 26 + rng() * 30, 20 + rng() * 26, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'siamese': {
      // warm light body — the dark "points" live on the ears/legs/tail meshes
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, shade(base, -18));
      g.addColorStop(0.55, base);
      g.addColorStop(1, belly);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      break;
    }
    case 'star': {
      paintBelly(55);
      ctx.fillStyle = '#ffe9a8';
      for (let i = 0; i < 22; i++) drawStar(ctx, rng() * 256, rng() * 180, 4 + rng() * 6, rng);
      break;
    }
    case 'moon': {
      const g = ctx.createLinearGradient(0, 0, 256, 256);
      g.addColorStop(0, base);
      g.addColorStop(1, marking);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#e8ecf5';
      for (let i = 0; i < 7; i++) {
        const x = rng() * 256, y = rng() * 170, r = 8 + rng() * 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = i % 2 ? '#e8ecf5' : '#cdd6e8';
      }
      paintBelly(45);
      break;
    }
  }

  // subtle fur noise
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(rng() * 256, rng() * 256, 2, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rng: () => number) {
  ctx.beginPath();
  const rot = rng() * Math.PI;
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ——— the cat avatar ———

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  paw: THREE.Mesh;
}

export class CatAvatar {
  root: THREE.Group;          // world position/heading; y = ground contact
  spec: CatSpec;
  action: CatAction = 'idle';
  moveSpeed = 0;              // world units/sec, drives gait
  s: number;                  // overall scale

  private body: THREE.Group;
  private torso: THREE.Mesh;
  private head: THREE.Group;
  private jaw: THREE.Mesh;
  private earL: THREE.Group;
  private earR: THREE.Group;
  private eyeL: THREE.Mesh;
  private eyeR: THREE.Mesh;
  private lidL: THREE.Mesh;
  private lidR: THREE.Mesh;
  private tail: THREE.Group[] = [];
  private legs: Leg[] = [];   // FL, FR, BL, BR
  private accessoryGroup: THREE.Group;
  private emote: THREE.Sprite;
  private emoteTex: { [k: string]: THREE.CanvasTexture } = {};

  private phase = 0;
  private blinkT = 0;
  private earFlickT = 0;
  private meowT = 0;
  private actionT = 0;        // time since action started
  private disposables: (THREE.Material | THREE.Texture | THREE.BufferGeometry)[] = [];

  constructor(spec: CatSpec) {
    this.spec = spec;
    this.s = 0.55 * spec.size;
    const s = this.s;
    const g = geo();

    const coatTex = paintCoatTexture(spec);
    this.disposables.push(coatTex);
    const coatMat = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.92 });
    const isPointed = spec.coat.pattern === 'siamese';
    const limbColor = isPointed ? spec.coat.marking : spec.coat.base;
    const limbMat = new THREE.MeshStandardMaterial({ color: limbColor, roughness: 0.92 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: spec.coat.belly, roughness: 0.92 });
    const markMat = new THREE.MeshStandardMaterial({ color: spec.coat.marking, roughness: 0.92 });
    const innerEarMat = new THREE.MeshStandardMaterial({ color: '#e8a9a9', roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: spec.coat.noseColor, roughness: 0.6 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: spec.coat.eyeColor, roughness: 0.25 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#7a3b3b', roughness: 0.8 });
    this.disposables.push(coatMat, limbMat, bellyMat, markMat, innerEarMat, noseMat, eyeMat, pupilMat, mouthMat);

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.52 * s * 2;
    this.root.add(this.body);

    // torso (faces +Z)
    this.torso = new THREE.Mesh(g.sphere, coatMat);
    this.torso.scale.set(0.37 * s * 2, 0.32 * s * 2, 0.58 * s * 2);
    this.torso.castShadow = true;
    this.body.add(this.torso);

    // chest fluff
    const chest = new THREE.Mesh(g.sphere, bellyMat);
    chest.scale.set(0.3 * s * 2, 0.28 * s * 2, 0.3 * s * 2);
    chest.position.set(0, -0.08 * s * 2, 0.4 * s * 2);
    this.body.add(chest);

    // ——— head ———
    this.head = new THREE.Group();
    this.head.position.set(0, 0.3 * s * 2, 0.58 * s * 2);
    this.body.add(this.head);

    const skull = new THREE.Mesh(g.sphere, coatMat);
    skull.scale.setScalar(0.3 * s * 2);
    skull.castShadow = true;
    this.head.add(skull);

    const muzzle = new THREE.Mesh(g.sphere, bellyMat);
    muzzle.scale.set(0.16 * s * 2, 0.12 * s * 2, 0.14 * s * 2);
    muzzle.position.set(0, -0.08 * s * 2, 0.24 * s * 2);
    this.head.add(muzzle);

    this.jaw = new THREE.Mesh(g.sphere, mouthMat);
    this.jaw.scale.set(0.09 * s * 2, 0.05 * s * 2, 0.09 * s * 2);
    this.jaw.position.set(0, -0.15 * s * 2, 0.24 * s * 2);
    this.head.add(this.jaw);

    const nose = new THREE.Mesh(g.cone, noseMat);
    nose.scale.set(0.05 * s * 2, 0.04 * s * 2, 0.04 * s * 2);
    nose.rotation.x = Math.PI; // point down
    nose.position.set(0, -0.045 * s * 2, 0.36 * s * 2);
    this.head.add(nose);

    // eyes + lids
    const mkEye = (side: number) => {
      const eye = new THREE.Mesh(g.sphere, eyeMat);
      eye.scale.set(0.065 * s * 2, 0.08 * s * 2, 0.045 * s * 2);
      eye.position.set(side * 0.13 * s * 2, 0.05 * s * 2, 0.245 * s * 2);
      this.head.add(eye);
      const pupil = new THREE.Mesh(g.sphere, pupilMat);
      pupil.scale.set(0.35, 0.55, 0.4);
      pupil.position.z = 0.72;
      eye.add(pupil);
      const lid = new THREE.Mesh(g.sphere, coatMat);
      lid.scale.setScalar(1.12);
      lid.position.y = 0.9;
      eye.add(lid);
      return { eye, lid };
    };
    const eL = mkEye(-1);
    const eR = mkEye(1);
    this.eyeL = eL.eye; this.eyeR = eR.eye;
    this.lidL = eL.lid; this.lidR = eR.lid;

    // ears
    const mkEar = (side: number) => {
      const grp = new THREE.Group();
      grp.position.set(side * 0.17 * s * 2, 0.24 * s * 2, 0.02 * s * 2);
      const outer = new THREE.Mesh(g.cone, isPointed ? markMat : limbMat);
      outer.scale.set(0.09 * s * 2, 0.16 * s * 2, 0.05 * s * 2);
      outer.rotation.z = side * -0.25;
      outer.castShadow = true;
      grp.add(outer);
      const inner = new THREE.Mesh(g.cone, innerEarMat);
      inner.scale.set(0.05 * s * 2, 0.1 * s * 2, 0.03 * s * 2);
      inner.position.set(0, 0.005 * s * 2, 0.02 * s * 2);
      inner.rotation.z = side * -0.25;
      grp.add(inner);
      this.head.add(grp);
      return grp;
    };
    this.earL = mkEar(-1);
    this.earR = mkEar(1);

    // whiskers
    const whiskerMat = new THREE.LineBasicMaterial({ color: '#e9e6df', transparent: true, opacity: 0.7 });
    this.disposables.push(whiskerMat);
    const wPts: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      for (const dy of [-0.01, -0.035, -0.06]) {
        wPts.push(new THREE.Vector3(side * 0.1 * s * 2, -0.06 * s * 2 + dy, 0.3 * s * 2));
        wPts.push(new THREE.Vector3(side * 0.42 * s * 2, -0.04 * s * 2 + dy * 2.4, 0.26 * s * 2));
      }
    }
    const wGeo = new THREE.BufferGeometry().setFromPoints(wPts);
    this.disposables.push(wGeo);
    this.head.add(new THREE.LineSegments(wGeo, whiskerMat));

    // ——— tail: chain of 5 ———
    let parent: THREE.Object3D = this.body;
    let px = 0, py = 0.12 * s * 2, pz = -0.58 * s * 2;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(px, py, pz);
      const m = new THREE.Mesh(g.sphere, i >= 3 && isPointed ? markMat : i === 4 && spec.coat.pattern !== 'solid' ? markMat : limbMat);
      const r = (0.075 - i * 0.008) * s * 2;
      m.scale.set(r, r, 0.14 * s * 2);
      m.position.z = -0.06 * s * 2;
      m.castShadow = i < 2;
      seg.add(m);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      px = 0; py = 0; pz = -0.12 * s * 2;
    }

    // ——— legs (FL, FR, BL, BR) ———
    const sock = spec.coat.pattern === 'tuxedo' || spec.coat.pattern === 'calico' || hashStr(spec.id) % 3 === 0;
    const mkLeg = (x: number, z: number): Leg => {
      const hip = new THREE.Group();
      hip.position.set(x, -0.14 * s * 2, z);
      this.body.add(hip);
      const upper = new THREE.Mesh(g.cyl, limbMat);
      upper.scale.set(0.07 * s * 2, 0.21 * s * 2, 0.07 * s * 2);
      upper.position.y = -0.105 * s * 2;
      upper.castShadow = true;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.21 * s * 2;
      hip.add(knee);
      const lower = new THREE.Mesh(g.cyl, limbMat);
      lower.scale.set(0.055 * s * 2, 0.18 * s * 2, 0.055 * s * 2);
      lower.position.y = -0.09 * s * 2;
      knee.add(lower);
      const paw = new THREE.Mesh(g.sphere, sock ? bellyMat : limbMat);
      paw.scale.set(0.075 * s * 2, 0.055 * s * 2, 0.095 * s * 2);
      paw.position.set(0, -0.185 * s * 2, 0.02 * s * 2);
      knee.add(paw);
      return { hip, knee, paw };
    };
    const lx = 0.21 * s * 2;
    const fz = 0.36 * s * 2;
    const bz = -0.34 * s * 2;
    this.legs.push(mkLeg(-lx, fz), mkLeg(lx, fz), mkLeg(-lx, bz), mkLeg(lx, bz));

    // accessory
    this.accessoryGroup = new THREE.Group();
    this.body.add(this.accessoryGroup);
    this.setAccessory(spec.accessory);

    // emote sprite (!, ?, 💧, ♥, 🎵)
    const emoteMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    this.disposables.push(emoteMat);
    this.emote = new THREE.Sprite(emoteMat);
    this.emote.scale.setScalar(0.55);
    this.emote.position.y = 1.35 * s * 2;
    this.root.add(this.emote);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = false;
    });
  }

  setAccessory(acc: AccessoryId) {
    this.spec.accessory = acc;
    // clear old
    while (this.accessoryGroup.children.length) {
      const c = this.accessoryGroup.children[0];
      this.accessoryGroup.remove(c);
    }
    const s = this.s;
    const g = geo();
    const accent = new THREE.MeshStandardMaterial({ color: this.spec.coat.accentColor, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#e8c34a', roughness: 0.3, metalness: 0.6 });
    const neckY = 0.18 * s * 2;
    const neckZ = 0.5 * s * 2;
    switch (acc) {
      case 'collar': case 'goldcollar': {
        const mat = acc === 'goldcollar' ? gold : accent;
        const t = new THREE.Mesh(g.torus, mat);
        t.scale.setScalar(0.19 * s * 2);
        t.rotation.x = Math.PI / 2 - 0.25;
        t.position.set(0, neckY, neckZ - 0.04 * s * 2);
        this.accessoryGroup.add(t);
        const bell = new THREE.Mesh(g.sphere, gold);
        bell.scale.setScalar(0.05 * s * 2);
        bell.position.set(0, neckY - 0.16 * s * 2, neckZ + 0.13 * s * 2);
        this.accessoryGroup.add(bell);
        break;
      }
      case 'bandana': case 'scarf': {
        const t = new THREE.Mesh(g.torus, accent);
        t.scale.setScalar(0.2 * s * 2);
        t.rotation.x = Math.PI / 2 - 0.25;
        t.position.set(0, neckY, neckZ - 0.04 * s * 2);
        this.accessoryGroup.add(t);
        const flap = new THREE.Mesh(g.cone, accent);
        flap.scale.set(0.16 * s * 2, 0.22 * s * 2, 0.05 * s * 2);
        flap.rotation.x = Math.PI;
        flap.position.set(acc === 'scarf' ? 0.12 * s * 2 : 0, neckY - 0.14 * s * 2, neckZ + 0.12 * s * 2);
        this.accessoryGroup.add(flap);
        break;
      }
      case 'bow': {
        const y = 0.62 * s * 2, z = 0.58 * s * 2;
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(g.cone, accent);
          wing.scale.set(0.1 * s * 2, 0.12 * s * 2, 0.045 * s * 2);
          wing.rotation.z = side * (Math.PI / 2);
          wing.position.set(side * 0.09 * s * 2, y, z);
          this.accessoryGroup.add(wing);
        }
        const knot = new THREE.Mesh(g.sphere, accent);
        knot.scale.setScalar(0.045 * s * 2);
        knot.position.set(0, y, z);
        this.accessoryGroup.add(knot);
        break;
      }
      case 'flowercrown': {
        const petals = ['#f2a7c3', '#f5d76e', '#c39bd3', '#f1948a', '#85c1e9'];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const f = new THREE.Mesh(g.sphere, new THREE.MeshStandardMaterial({ color: petals[i % petals.length], roughness: 0.8 }));
          f.scale.setScalar(0.045 * s * 2);
          f.position.set(Math.cos(a) * 0.2 * s * 2, 0.62 * s * 2, 0.55 * s * 2 + Math.sin(a) * 0.14 * s * 2);
          this.accessoryGroup.add(f);
        }
        break;
      }
    }
  }

  showEmote(kind: '!' | '?' | 'drop' | 'heart' | 'music' | 'zzz', secs = 1.6) {
    let tex = this.emoteTex[kind];
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = { '!': '❗', '?': '❓', drop: '💧', heart: '💛', music: '🎵', zzz: '💤' }[kind];
      ctx.fillText(glyph, 32, 36);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.emoteTex[kind] = tex;
      this.disposables.push(tex);
    }
    const m = this.emote.material as THREE.SpriteMaterial;
    m.map = tex;
    m.opacity = 1;
    m.needsUpdate = true;
    this.emoteUntil = performance.now() / 1000 + secs;
  }
  private emoteUntil = 0;

  setAction(a: CatAction) {
    if (this.action !== a) {
      this.action = a;
      this.actionT = 0;
    }
  }

  meow() {
    this.meowT = 0.5;
  }

  /** dt seconds. Call every frame. */
  update(dt: number, time: number) {
    const a = this.action;
    this.actionT += dt;

    // gait phase from movement speed
    const gaitRate = a === 'sneak' ? 4.5 : a === 'run' ? 13 : a === 'swim' ? 8 : 8.5;
    if (this.moveSpeed > 0.05 || a === 'swim') this.phase += dt * gaitRate * (a === 'swim' ? 1 : Math.min(1.4, 0.4 + this.moveSpeed / 4));
    const p = this.phase;
    const s = this.s;

    // defaults (lerped toward each frame for smooth transitions)
    let bodyY = 0.52 * s * 2;
    let bodyPitch = 0;
    let headPitch = 0;
    let tailLift = 0.45;      // base curl upward
    let tailWave = Math.sin(time * 1.8) * 0.15;
    let legSwing = [0, 0, 0, 0];
    let kneeBend = [0.15, 0.15, 0.15, 0.15];

    const swing = (off: number, amp: number) => Math.sin(p + off) * amp;

    switch (a) {
      case 'idle': {
        bodyY += Math.sin(time * 2.2) * 0.008;
        tailWave = Math.sin(time * 1.6) * 0.3;
        break;
      }
      case 'sit': {
        bodyPitch = -0.5;
        bodyY -= 0.1 * s * 2;
        headPitch = 0.35;
        kneeBend = [0.05, 0.05, 1.5, 1.5];
        legSwing = [0.45, 0.45, -1.2, -1.2];
        tailLift = -0.2;
        tailWave = Math.sin(time * 1.2) * 0.35;
        break;
      }
      case 'nap': {
        bodyY -= 0.22 * s * 2;
        bodyPitch = 0.06;
        kneeBend = [1.6, 1.6, 1.6, 1.6];
        legSwing = [1.1, 1.1, -1.1, -1.1];
        tailLift = -0.4;
        tailWave = 0.4;
        headPitch = 0.5;
        break;
      }
      case 'walk': case 'run': {
        const amp = a === 'run' ? 0.85 : 0.5;
        legSwing = [swing(0, amp), swing(Math.PI, amp), swing(Math.PI, amp), swing(0, amp)];
        kneeBend = [
          0.2 + Math.max(0, Math.sin(p + 0.9)) * 0.5,
          0.2 + Math.max(0, Math.sin(p + Math.PI + 0.9)) * 0.5,
          0.2 + Math.max(0, Math.sin(p + Math.PI + 0.9)) * 0.5,
          0.2 + Math.max(0, Math.sin(p + 0.9)) * 0.5,
        ];
        bodyY += Math.abs(Math.sin(p)) * (a === 'run' ? 0.05 : 0.02);
        bodyPitch = a === 'run' ? Math.sin(p * 2) * 0.05 : 0;
        tailLift = a === 'run' ? 0.15 : 0.4;
        tailWave = Math.sin(p * 0.5) * 0.25;
        break;
      }
      case 'sneak': {
        bodyY -= 0.16 * s * 2;
        kneeBend = [0.9, 0.9, 0.9, 0.9].map((k, i) => k + Math.max(0, Math.sin(p + (i % 2 ? Math.PI : 0))) * 0.3);
        legSwing = [swing(0, 0.35), swing(Math.PI, 0.35), swing(Math.PI, 0.35), swing(0, 0.35)];
        headPitch = -0.15;
        tailLift = -0.3;
        tailWave = Math.sin(time * 0.9) * 0.06;
        break;
      }
      case 'jump': {
        legSwing = [0.9, 0.9, -0.7, -0.7];
        kneeBend = [0.1, 0.1, 0.9, 0.9];
        bodyPitch = 0.25;
        tailLift = 0.1;
        break;
      }
      case 'fall': {
        legSwing = [0.5, 0.5, -0.4, -0.4];
        kneeBend = [0.4, 0.4, 0.5, 0.5];
        bodyPitch = -0.2;
        tailLift = 0.8;
        tailWave = Math.sin(time * 9) * 0.2;
        break;
      }
      case 'climb': {
        bodyPitch = 1.25; // near vertical, belly to trunk
        const c = Math.sin(p) * 0.5;
        legSwing = [0.9 + c, 0.9 - c, -0.4 - c, -0.4 + c];
        kneeBend = [0.6, 0.6, 0.8, 0.8];
        headPitch = -0.7;
        tailLift = -0.5;
        tailWave = Math.sin(time * 2.5) * 0.25;
        break;
      }
      case 'swim': {
        bodyY -= 0.14 * s * 2;
        bodyPitch = -0.22;
        headPitch = 0.45;
        const paddle = 0.55;
        legSwing = [swing(0, paddle) + 0.4, swing(Math.PI, paddle) + 0.4, swing(Math.PI * 0.5, paddle), swing(Math.PI * 1.5, paddle)];
        kneeBend = [0.8, 0.8, 0.8, 0.8];
        tailLift = 0.05;
        tailWave = Math.sin(p * 0.7) * 0.5;
        break;
      }
      case 'dig': {
        bodyPitch = -0.3;
        headPitch = -0.5;
        const d = this.actionT * 16;
        legSwing = [0.7 + Math.sin(d) * 0.8, 0.7 + Math.sin(d + Math.PI) * 0.8, -0.4, -0.4];
        kneeBend = [0.5, 0.5, 0.7, 0.7];
        tailLift = 0.7;
        tailWave = Math.sin(time * 6) * 0.2;
        break;
      }
      case 'scratch': {
        bodyPitch = 1.05; // rearing up
        const d = this.actionT * 10;
        legSwing = [1.5 + Math.sin(d) * 0.35, 1.5 + Math.sin(d + Math.PI) * 0.35, -0.5, -0.5];
        kneeBend = [0.3, 0.3, 1.0, 1.0];
        headPitch = -0.5;
        break;
      }
      case 'pounce': {
        const t = Math.min(1, this.actionT / 0.35);
        bodyPitch = 0.35 - t * 0.5;
        legSwing = [1.2, 1.2, -0.9, -0.9];
        kneeBend = [0.1, 0.1, 0.2, 0.2];
        tailLift = 0.3;
        break;
      }
      case 'meow': {
        headPitch = 0.5;
        tailWave = Math.sin(time * 3) * 0.3;
        break;
      }
    }

    // smooth-apply body pose
    const k = Math.min(1, dt * 10);
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x += (-bodyPitch - this.body.rotation.x) * k;
    this.head.rotation.x += (-headPitch - this.head.rotation.x) * k;

    // legs
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      leg.hip.rotation.x += (legSwing[i] - leg.hip.rotation.x) * Math.min(1, dt * 14);
      leg.knee.rotation.x += (-kneeBend[i] - leg.knee.rotation.x) * Math.min(1, dt * 14);
    }

    // tail chain
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      const targetX = i === 0 ? -tailLift : -tailLift * 0.35;
      seg.rotation.x += (targetX - seg.rotation.x) * Math.min(1, dt * 6);
      seg.rotation.y = Math.sin(time * 2 + i * 0.9) * 0.12 + tailWave * (i / this.tail.length);
    }

    // blink
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5;
    const closed = a === 'nap' || this.blinkT < 0;
    const lidY = closed ? 0.15 : 0.9;
    this.lidL.position.y += (lidY - this.lidL.position.y) * Math.min(1, dt * 20);
    this.lidR.position.y = this.lidL.position.y;

    // ear flicks
    this.earFlickT -= dt;
    if (this.earFlickT < 0) {
      this.earFlickT = 3 + Math.random() * 5;
      const ear = Math.random() > 0.5 ? this.earL : this.earR;
      ear.rotation.z = 0.5;
    }
    this.earL.rotation.z *= 1 - Math.min(1, dt * 6);
    this.earR.rotation.z *= 1 - Math.min(1, dt * 6);
    // ears back when sneaking/scared
    const earPitch = a === 'sneak' ? -0.7 : 0;
    this.earL.rotation.x += (earPitch - this.earL.rotation.x) * k;
    this.earR.rotation.x += (earPitch - this.earR.rotation.x) * k;

    // meow mouth
    if (this.meowT > 0) {
      this.meowT -= dt;
      const open = Math.sin((1 - this.meowT / 0.5) * Math.PI) * 0.09;
      this.jaw.position.y = (-0.15 - open) * s * 2;
      this.head.rotation.x = -0.4;
    } else {
      this.jaw.position.y += (-0.15 * s * 2 - this.jaw.position.y) * Math.min(1, dt * 12);
    }

    // emote fade
    const now = performance.now() / 1000;
    const m = this.emote.material as THREE.SpriteMaterial;
    if (now > this.emoteUntil && m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 3);
    if (m.opacity > 0) this.emote.position.y = 1.35 * s * 2 + Math.sin(time * 3) * 0.05;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !this.disposables.includes(o.material)) {
        o.material.dispose();
      }
    });
  }
}
