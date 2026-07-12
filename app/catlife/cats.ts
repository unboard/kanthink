// Whisker Wilds — procedural cat models + animation
// v2: sculpted anatomy — shoulder/haunch masses, neck, cheeked muzzle, almond
// eyes, tapered legs, 8-segment tail, fur-stroke coats. Kittens get oversized
// heads, eyes and ears. Every cat is still 100% procedural and unique.

import * as THREE from 'three';
import type { AccessoryId, CatAction, CatSpec } from './types';
import { mulberry32 } from './rng';

// ——— shared geometries (cached across all cats) ———
let GEO: {
  sphere: THREE.SphereGeometry;
  cone: THREE.ConeGeometry;
  cyl: THREE.CylinderGeometry;
  taperCyl: THREE.CylinderGeometry;   // slightly narrower at the bottom (legs)
  torus: THREE.TorusGeometry;
} | null = null;

function geo() {
  if (!GEO) {
    GEO = {
      sphere: new THREE.SphereGeometry(1, 24, 18),
      cone: new THREE.ConeGeometry(1, 1, 14),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
      taperCyl: new THREE.CylinderGeometry(1, 0.74, 1, 12),
      torus: new THREE.TorusGeometry(1, 0.14, 8, 20),
    };
  }
  return GEO;
}

// ——— coat texture painting (512px, drawn in 256 space) ———
export function paintCoatTexture(spec: CatSpec): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2); // draw everything in familiar 256-space
  const { base, marking, belly, pattern } = spec.coat;
  const rng = mulberry32(hashStr(spec.id));

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // patterns grow in with age: babies are plain, kittens show a faint pattern
  const stage = spec.stage ?? 'adult';
  const pat = stage === 'baby' ? 'solid' : pattern;
  if (stage === 'kitten') ctx.globalAlpha = 0.55;

  // Sphere UV on the torso: v=1 (canvas top) is the back, v=0 (bottom) the belly.
  const paintBelly = (h: number) => {
    const g = ctx.createLinearGradient(0, 256, 0, 256 - h - 34);
    g.addColorStop(0, belly);
    g.addColorStop(1, base + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 256 - h - 34, 256, h + 34);
  };

  switch (pat) {
    case 'solid':
      paintBelly(52);
      break;
    case 'tabby': {
      paintBelly(58);
      // dorsal stripe along the spine
      ctx.strokeStyle = marking;
      ctx.lineCap = 'round';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.lineTo(260, 8);
      ctx.stroke();
      // rib stripes that taper and break like real tabby marbling
      for (let i = 0; i < 10; i++) {
        const x = 6 + i * 26 + rng() * 8;
        ctx.lineWidth = 6 + rng() * 7;
        ctx.beginPath();
        ctx.moveTo(x, 6 + rng() * 12);
        ctx.quadraticCurveTo(x + 14, 80 + rng() * 20, x - 8, 140 + rng() * 30);
        ctx.stroke();
        if (rng() > 0.5) {
          ctx.lineWidth = 4 + rng() * 4;
          ctx.beginPath();
          ctx.moveTo(x + 12, 30 + rng() * 20);
          ctx.quadraticCurveTo(x + 20, 90, x + 8, 120 + rng() * 20);
          ctx.stroke();
        }
      }
      break;
    }
    case 'spots': {
      paintBelly(58);
      ctx.fillStyle = marking;
      for (let i = 0; i < 22; i++) {
        const x = rng() * 256;
        const y = rng() * 175;
        const r = 6 + rng() * 13;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.55 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        // rosette hint: lighter core in bigger spots
        if (r > 12) {
          ctx.fillStyle = base;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.45, r * 0.3, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = marking;
        }
      }
      break;
    }
    case 'tuxedo': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#f2efe8';
      ctx.beginPath();
      ctx.ellipse(128, 262, 148, 112, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'calico': {
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(0, 0, 256, 256);
      const cols = [marking, '#e8963c', marking, '#d97c2a'];
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = cols[i % cols.length];
        const x = rng() * 256;
        const y = rng() * 185;
        ctx.beginPath();
        // lumpy patch: 3 overlapping ellipses
        for (let j = 0; j < 3; j++) {
          ctx.ellipse(
            x + (rng() - 0.5) * 28, y + (rng() - 0.5) * 22,
            18 + rng() * 24, 14 + rng() * 20, rng() * Math.PI, 0, Math.PI * 2
          );
        }
        ctx.fill();
      }
      break;
    }
    case 'siamese': {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, shade(base, -16));
      g.addColorStop(0.55, base);
      g.addColorStop(1, belly);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      break;
    }
    case 'star': {
      paintBelly(52);
      ctx.fillStyle = '#ffe9a8';
      for (let i = 0; i < 26; i++) drawStar(ctx, rng() * 256, rng() * 185, 3.5 + rng() * 6, rng);
      break;
    }
    case 'moon': {
      const g = ctx.createLinearGradient(0, 0, 256, 256);
      g.addColorStop(0, base);
      g.addColorStop(1, marking);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#e8ecf5' : '#cdd6e8';
        const x = rng() * 256, y = rng() * 175, r = 7 + rng() * 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      paintBelly(46);
      break;
    }
  }

  ctx.globalAlpha = 1;

  // dorsal shading — subtle darkening along the back gives the body depth
  if (pat !== 'tuxedo' && pat !== 'calico') {
    const dg = ctx.createLinearGradient(0, 0, 0, 72);
    dg.addColorStop(0, 'rgba(20,14,8,0.14)');
    dg.addColorStop(1, 'rgba(20,14,8,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, 256, 72);
  }

  // fur strokes — hundreds of tiny directional hairs make the coat read as fur
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const len = 4 + rng() * 8;
    const a = Math.PI / 2 + (rng() - 0.5) * 0.9; // mostly "down the ribs"
    const light = rng() > 0.5;
    ctx.strokeStyle = light ? 'rgba(255,252,240,0.07)' : 'rgba(25,18,10,0.07)';
    ctx.lineWidth = 0.7 + rng() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.3) * len * 0.5, y + Math.sin(a + 0.3) * len * 0.5,
      x + Math.cos(a) * len, y + Math.sin(a) * len
    );
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rng: () => number) {
  ctx.beginPath();
  const rot = rng() * Math.PI;
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
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
  readonly isKitten: boolean;

  private body: THREE.Group;
  private head: THREE.Group;
  private jaw: THREE.Mesh;
  private earL: THREE.Group;
  private earR: THREE.Group;
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
  private actionT = 0;
  private disposables: (THREE.Material | THREE.Texture | THREE.BufferGeometry)[] = [];

  constructor(spec: CatSpec, opts?: { kitten?: boolean }) {
    this.spec = spec;
    this.isKitten = opts?.kitten ?? spec.size < 0.7;
    this.s = 0.55 * spec.size;
    const S = this.s * 2;
    const g = geo();

    const coatTex = paintCoatTexture(spec);
    this.disposables.push(coatTex);
    const coatMat = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.93 });
    const isPointed = spec.coat.pattern === 'siamese';
    const limbColor = isPointed ? spec.coat.marking : spec.coat.base;
    const limbMat = new THREE.MeshStandardMaterial({ color: limbColor, roughness: 0.93 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: spec.coat.belly, roughness: 0.93 });
    const markMat = new THREE.MeshStandardMaterial({ color: spec.coat.marking, roughness: 0.93 });
    const innerEarMat = new THREE.MeshStandardMaterial({ color: '#e0a2a2', roughness: 0.9 });
    const noseMat = new THREE.MeshStandardMaterial({ color: spec.coat.noseColor, roughness: 0.55 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: spec.coat.eyeColor, roughness: 0.2 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.25 });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#6e3434', roughness: 0.8 });
    this.disposables.push(coatMat, limbMat, bellyMat, markMat, innerEarMat, noseMat, eyeMat, pupilMat, glintMat, mouthMat);

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.5 * S;
    this.root.add(this.body);

    const kit = this.isKitten;

    // ——— torso: main barrel + chest + hip masses (organic silhouette) ———
    const torso = new THREE.Mesh(g.sphere, coatMat);
    torso.scale.set(0.33 * S, 0.29 * S, (kit ? 0.44 : 0.5) * S);
    torso.castShadow = true;
    this.body.add(torso);

    const chestBulge = new THREE.Mesh(g.sphere, bellyMat);
    chestBulge.scale.set(0.235 * S, 0.235 * S, 0.25 * S);
    chestBulge.position.set(0, -0.045 * S, (kit ? 0.23 : 0.27) * S);
    this.body.add(chestBulge);

    const hipBulge = new THREE.Mesh(g.sphere, coatMat);
    hipBulge.scale.set(0.285 * S, 0.27 * S, 0.28 * S);
    hipBulge.position.set(0, 0, (kit ? -0.22 : -0.26) * S);
    hipBulge.castShadow = true;
    this.body.add(hipBulge);

    // shoulder + haunch muscle masses — break up the "ball" look
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(g.sphere, limbMat);
      shoulder.scale.set(0.105 * S, 0.125 * S, 0.13 * S);
      shoulder.position.set(side * 0.15 * S, -0.045 * S, (kit ? 0.25 : 0.3) * S);
      this.body.add(shoulder);
      const haunch = new THREE.Mesh(g.sphere, limbMat);
      haunch.scale.set(0.11 * S, 0.175 * S, 0.21 * S);
      haunch.position.set(side * 0.165 * S, -0.02 * S, (kit ? -0.22 : -0.27) * S);
      haunch.castShadow = true;
      this.body.add(haunch);
    }

    // neck — connects chest to head so the head doesn't float
    const neck = new THREE.Mesh(g.cyl, coatMat);
    neck.scale.set(0.135 * S, 0.24 * S, 0.135 * S);
    neck.position.set(0, 0.2 * S, (kit ? 0.32 : 0.38) * S);
    neck.rotation.x = -0.55;
    this.body.add(neck);

    // chest ruff — clumpy fluff, not one smooth ball
    const ruffSpots: [number, number, number, number][] = [
      [0, 0.02, 0.4, 0.135], [-0.075, -0.06, 0.38, 0.105], [0.075, -0.06, 0.38, 0.105], [0, -0.11, 0.36, 0.09],
    ];
    for (const [rx, ry, rz, rr] of ruffSpots) {
      const fluff = new THREE.Mesh(g.sphere, bellyMat);
      fluff.scale.setScalar(rr * S);
      fluff.position.set(rx * S, ry * S, rz * S * (kit ? 0.88 : 1));
      this.body.add(fluff);
    }

    // ——— head ———
    this.head = new THREE.Group();
    this.head.position.set(0, 0.36 * S, (kit ? 0.48 : 0.56) * S);
    if (kit) this.head.scale.setScalar(1.32); // kittens: big head = instant baby
    this.body.add(this.head);

    const skull = new THREE.Mesh(g.sphere, coatMat);
    skull.scale.set(0.26 * S, 0.245 * S, 0.235 * S);
    skull.castShadow = true;
    this.head.add(skull);

    // cheeks + chin form a real muzzle instead of a stuck-on ball
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(g.sphere, bellyMat);
      cheek.scale.set(0.092 * S, 0.082 * S, 0.088 * S);
      cheek.position.set(side * 0.078 * S, -0.095 * S, 0.175 * S);
      this.head.add(cheek);
    }
    const chin = new THREE.Mesh(g.sphere, bellyMat);
    chin.scale.setScalar(0.052 * S);
    chin.position.set(0, -0.145 * S, 0.18 * S);
    this.head.add(chin);

    // snout bridge from brow to nose
    const bridge = new THREE.Mesh(g.sphere, coatMat);
    bridge.scale.set(0.055 * S, 0.06 * S, 0.09 * S);
    bridge.position.set(0, -0.03 * S, 0.2 * S);
    this.head.add(bridge);

    this.jaw = new THREE.Mesh(g.sphere, mouthMat);
    this.jaw.scale.set(0.07 * S, 0.042 * S, 0.07 * S);
    this.jaw.position.set(0, -0.125 * S, 0.16 * S);
    this.head.add(this.jaw);

    const nose = new THREE.Mesh(g.cone, noseMat);
    nose.scale.set(0.042 * S, 0.034 * S, 0.03 * S);
    nose.rotation.x = Math.PI;
    nose.position.set(0, -0.062 * S, 0.268 * S);
    this.head.add(nose);

    // eyes — almond-set, angled, with a catchlight sparkle
    const eyeScale = kit ? 1.28 : 1;
    const mkEye = (side: number) => {
      const socket = new THREE.Group();
      socket.position.set(side * 0.112 * S, 0.035 * S, 0.195 * S);
      socket.rotation.z = side * -0.16;
      socket.rotation.y = side * 0.22;
      this.head.add(socket);
      const eye = new THREE.Mesh(g.sphere, eyeMat);
      eye.scale.set(0.06 * S * eyeScale, 0.082 * S * eyeScale, 0.05 * S);
      socket.add(eye);
      const pupil = new THREE.Mesh(g.sphere, pupilMat);
      pupil.scale.set(0.42, 0.78, 0.42);
      pupil.position.z = 0.62;
      eye.add(pupil);
      const glint = new THREE.Mesh(g.sphere, glintMat);
      glint.scale.setScalar(0.2);
      glint.position.set(0.28, 0.34, 0.92);
      eye.add(glint);
      const lid = new THREE.Mesh(g.sphere, coatMat);
      lid.scale.setScalar(1.14);
      lid.position.y = 0.92;
      eye.add(lid);
      return { eye, lid };
    };
    const eL = mkEye(-1);
    const eR = mkEye(1);
    this.lidL = eL.lid;
    this.lidR = eR.lid;

    // ears — wide-set triangles with pink inner, slight outward splay
    const earScale = kit ? 1.22 : 1;
    const mkEar = (side: number) => {
      const grp = new THREE.Group();
      grp.position.set(side * 0.145 * S, 0.195 * S, -0.015 * S);
      grp.rotation.z = side * -0.3;
      grp.rotation.x = -0.12;
      const outer = new THREE.Mesh(g.cone, isPointed ? markMat : limbMat);
      outer.scale.set(0.1 * S * earScale, 0.165 * S * earScale, 0.045 * S);
      outer.castShadow = true;
      grp.add(outer);
      const inner = new THREE.Mesh(g.cone, innerEarMat);
      inner.scale.set(0.058 * S * earScale, 0.105 * S * earScale, 0.024 * S);
      inner.position.set(0, -0.012 * S, 0.02 * S);
      grp.add(inner);
      this.head.add(grp);
      return grp;
    };
    this.earL = mkEar(-1);
    this.earR = mkEar(1);

    // whiskers — curved, drooping slightly, plus brow whiskers
    const whiskerMat = new THREE.LineBasicMaterial({ color: '#f2efe6', transparent: true, opacity: 0.75 });
    this.disposables.push(whiskerMat);
    const wPts: THREE.Vector3[] = [];
    const addWhisker = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      // sample a soft quadratic droop into 4 segments
      const mid = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + 0.02 * S, (z0 + z1) / 2 + 0.01 * S);
      const a = new THREE.Vector3(x0, y0, z0);
      const b = new THREE.Vector3(x1, y1, z1);
      let prev = a;
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        const p = new THREE.Vector3()
          .copy(a).multiplyScalar((1 - t) * (1 - t))
          .addScaledVector(mid, 2 * (1 - t) * t)
          .addScaledVector(b, t * t);
        wPts.push(prev.clone(), p.clone());
        prev = p;
      }
    };
    for (const side of [-1, 1]) {
      for (const [dy, droop] of [[-0.075, -0.01], [-0.095, -0.035], [-0.115, -0.06]] as const) {
        addWhisker(
          side * 0.075 * S, dy * S, 0.24 * S,
          side * 0.42 * S, (dy + droop) * S, 0.16 * S
        );
      }
      // brow whiskers
      addWhisker(side * 0.09 * S, 0.11 * S, 0.19 * S, side * 0.2 * S, 0.22 * S, 0.12 * S);
    }
    const wGeo = new THREE.BufferGeometry().setFromPoints(wPts);
    this.disposables.push(wGeo);
    this.head.add(new THREE.LineSegments(wGeo, whiskerMat));

    // ——— tail: 8 tapering segments = smooth curl ———
    const tailSegs = kit ? 6 : 8;
    let parent: THREE.Object3D = this.body;
    let px = 0, py = 0.1 * S, pz = (kit ? -0.42 : -0.48) * S;
    for (let i = 0; i < tailSegs; i++) {
      const seg = new THREE.Group();
      seg.position.set(px, py, pz);
      const isTip = i >= tailSegs - 2;
      const m = new THREE.Mesh(g.sphere, isTip && (isPointed || spec.coat.pattern !== 'solid') ? markMat : limbMat);
      const r = (0.055 - i * 0.0034) * S;
      m.scale.set(r, r, 0.085 * S);
      m.position.z = -0.045 * S;
      m.castShadow = i < 2;
      seg.add(m);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      px = 0; py = 0; pz = -0.082 * S;
    }

    // ——— legs (FL, FR, BL, BR) — tapered, under the shoulder/haunch masses ———
    const sock = spec.coat.pattern === 'tuxedo' || spec.coat.pattern === 'calico' || hashStr(spec.id) % 3 === 0;
    const mkLeg = (x: number, z: number): Leg => {
      const hip = new THREE.Group();
      hip.position.set(x, -0.12 * S, z);
      this.body.add(hip);
      const upper = new THREE.Mesh(g.taperCyl, limbMat);
      upper.scale.set(0.072 * S, 0.19 * S, 0.072 * S);
      upper.position.y = -0.095 * S;
      upper.castShadow = true;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.19 * S;
      hip.add(knee);
      const lower = new THREE.Mesh(g.taperCyl, limbMat);
      lower.scale.set(0.052 * S, 0.165 * S, 0.052 * S);
      lower.position.y = -0.082 * S;
      knee.add(lower);
      const paw = new THREE.Mesh(g.sphere, sock ? bellyMat : limbMat);
      paw.scale.set(0.068 * S, 0.048 * S, 0.098 * S);
      paw.position.set(0, -0.175 * S, 0.02 * S);
      knee.add(paw);
      return { hip, knee, paw };
    };
    const fz = (kit ? 0.25 : 0.3) * S;
    const bz = (kit ? -0.22 : -0.27) * S;
    this.legs.push(mkLeg(-0.15 * S, fz), mkLeg(0.15 * S, fz), mkLeg(-0.165 * S, bz), mkLeg(0.165 * S, bz));

    // accessory
    this.accessoryGroup = new THREE.Group();
    this.body.add(this.accessoryGroup);
    this.setAccessory(spec.accessory);

    // emote sprite
    const emoteMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
    this.disposables.push(emoteMat);
    this.emote = new THREE.Sprite(emoteMat);
    this.emote.scale.setScalar(0.55);
    this.emote.position.y = 1.35 * S;
    this.root.add(this.emote);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = false;
    });
  }

  setAccessory(acc: AccessoryId) {
    this.spec.accessory = acc;
    while (this.accessoryGroup.children.length) {
      this.accessoryGroup.remove(this.accessoryGroup.children[0]);
    }
    const S = this.s * 2;
    const g = geo();
    const accent = new THREE.MeshStandardMaterial({ color: this.spec.coat.accentColor, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#e8c34a', roughness: 0.3, metalness: 0.6 });
    const neckY = 0.16 * S;
    const neckZ = 0.42 * S;
    switch (acc) {
      case 'collar': case 'goldcollar': {
        const mat = acc === 'goldcollar' ? gold : accent;
        const t = new THREE.Mesh(g.torus, mat);
        t.scale.setScalar(0.175 * S);
        t.rotation.x = Math.PI / 2 - 0.35;
        t.position.set(0, neckY, neckZ - 0.03 * S);
        this.accessoryGroup.add(t);
        const bell = new THREE.Mesh(g.sphere, gold);
        bell.scale.setScalar(0.05 * S);
        bell.position.set(0, neckY - 0.15 * S, neckZ + 0.12 * S);
        this.accessoryGroup.add(bell);
        break;
      }
      case 'bandana': case 'scarf': {
        const t = new THREE.Mesh(g.torus, accent);
        t.scale.setScalar(0.185 * S);
        t.rotation.x = Math.PI / 2 - 0.35;
        t.position.set(0, neckY, neckZ - 0.03 * S);
        this.accessoryGroup.add(t);
        const flap = new THREE.Mesh(g.cone, accent);
        flap.scale.set(0.15 * S, 0.21 * S, 0.05 * S);
        flap.rotation.x = Math.PI;
        flap.position.set(acc === 'scarf' ? 0.11 * S : 0, neckY - 0.14 * S, neckZ + 0.11 * S);
        this.accessoryGroup.add(flap);
        break;
      }
      case 'bow': {
        const y = 0.6 * S, z = 0.52 * S;
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(g.cone, accent);
          wing.scale.set(0.095 * S, 0.115 * S, 0.045 * S);
          wing.rotation.z = side * (Math.PI / 2);
          wing.position.set(side * 0.085 * S, y, z);
          this.accessoryGroup.add(wing);
        }
        const knot = new THREE.Mesh(g.sphere, accent);
        knot.scale.setScalar(0.042 * S);
        knot.position.set(0, y, z);
        this.accessoryGroup.add(knot);
        break;
      }
      case 'flowercrown': {
        const petals = ['#f2a7c3', '#f5d76e', '#c39bd3', '#f1948a', '#85c1e9'];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const f = new THREE.Mesh(g.sphere, new THREE.MeshStandardMaterial({ color: petals[i % petals.length], roughness: 0.8 }));
          f.scale.setScalar(0.042 * S);
          f.position.set(Math.cos(a) * 0.19 * S, 0.6 * S, 0.5 * S + Math.sin(a) * 0.13 * S);
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

    const gaitRate = a === 'sneak' ? 4.5 : a === 'run' ? 13 : a === 'swim' ? 8 : 8.5;
    if (this.moveSpeed > 0.05 || a === 'swim') this.phase += dt * gaitRate * (a === 'swim' ? 1 : Math.min(1.4, 0.4 + this.moveSpeed / 4));
    const p = this.phase;
    const S = this.s * 2;

    let bodyY = 0.5 * S;
    let bodyPitch = 0;
    let headPitch = 0;
    let tailLift = 0.45;
    let tailWave = Math.sin(time * 1.8) * 0.15;
    let legSwing = [0, 0, 0, 0];
    let kneeBend = [0.15, 0.15, 0.28, 0.28]; // rear legs naturally more bent

    const swing = (off: number, amp: number) => Math.sin(p + off) * amp;

    switch (a) {
      case 'idle': {
        bodyY += Math.sin(time * 2.2) * 0.008;
        tailWave = Math.sin(time * 1.6) * 0.3;
        break;
      }
      case 'sit': {
        bodyPitch = -0.5;
        bodyY -= 0.1 * S;
        headPitch = 0.35;
        kneeBend = [0.05, 0.05, 1.5, 1.5];
        legSwing = [0.45, 0.45, -1.2, -1.2];
        tailLift = -0.2;
        tailWave = Math.sin(time * 1.2) * 0.35;
        break;
      }
      case 'nap': {
        bodyY -= 0.22 * S;
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
          0.15 + Math.max(0, Math.sin(p + 0.9)) * 0.5,
          0.15 + Math.max(0, Math.sin(p + Math.PI + 0.9)) * 0.5,
          0.3 + Math.max(0, Math.sin(p + Math.PI + 0.9)) * 0.5,
          0.3 + Math.max(0, Math.sin(p + 0.9)) * 0.5,
        ];
        bodyY += Math.abs(Math.sin(p)) * (a === 'run' ? 0.05 : 0.02);
        bodyPitch = a === 'run' ? Math.sin(p * 2) * 0.05 : 0;
        tailLift = a === 'run' ? 0.15 : 0.4;
        tailWave = Math.sin(p * 0.5) * 0.25;
        break;
      }
      case 'sneak': {
        bodyY -= 0.16 * S;
        kneeBend = [0.9, 0.9, 1.0, 1.0].map((k, i) => k + Math.max(0, Math.sin(p + (i % 2 ? Math.PI : 0))) * 0.3);
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
        bodyPitch = 1.25;
        const c = Math.sin(p) * 0.5;
        legSwing = [0.9 + c, 0.9 - c, -0.4 - c, -0.4 + c];
        kneeBend = [0.6, 0.6, 0.8, 0.8];
        headPitch = -0.7;
        tailLift = -0.5;
        tailWave = Math.sin(time * 2.5) * 0.25;
        break;
      }
      case 'swim': {
        bodyY -= 0.14 * S;
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
        bodyPitch = 1.05;
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

    const k = Math.min(1, dt * 10);
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x += (-bodyPitch - this.body.rotation.x) * k;
    this.head.rotation.x += (-headPitch - this.head.rotation.x) * k;

    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      leg.hip.rotation.x += (legSwing[i] - leg.hip.rotation.x) * Math.min(1, dt * 14);
      leg.knee.rotation.x += (-kneeBend[i] - leg.knee.rotation.x) * Math.min(1, dt * 14);
    }

    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      const targetX = i === 0 ? -tailLift : -tailLift * 0.28;
      seg.rotation.x += (targetX - seg.rotation.x) * Math.min(1, dt * 6);
      seg.rotation.y = Math.sin(time * 2 + i * 0.7) * 0.1 + tailWave * (i / this.tail.length);
    }

    // blink
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5;
    const closed = a === 'nap' || this.blinkT < 0;
    const lidY = closed ? 0.18 : 0.92;
    this.lidL.position.y += (lidY - this.lidL.position.y) * Math.min(1, dt * 20);
    this.lidR.position.y = this.lidL.position.y;

    // ear flicks
    this.earFlickT -= dt;
    if (this.earFlickT < 0) {
      this.earFlickT = 3 + Math.random() * 5;
      const ear = Math.random() > 0.5 ? this.earL : this.earR;
      ear.rotation.z += ear === this.earL ? 0.5 : -0.5;
    }
    const baseZL = 0.3, baseZR = -0.3;
    this.earL.rotation.z += (baseZL - this.earL.rotation.z) * Math.min(1, dt * 6);
    this.earR.rotation.z += (baseZR - this.earR.rotation.z) * Math.min(1, dt * 6);
    const earPitch = a === 'sneak' ? -0.75 : -0.12;
    this.earL.rotation.x += (earPitch - this.earL.rotation.x) * k;
    this.earR.rotation.x += (earPitch - this.earR.rotation.x) * k;

    // meow mouth
    if (this.meowT > 0) {
      this.meowT -= dt;
      const open = Math.sin((1 - this.meowT / 0.5) * Math.PI) * 0.08;
      this.jaw.position.y = (-0.125 - open) * S;
      this.head.rotation.x = -0.4;
    } else {
      this.jaw.position.y += (-0.125 * S - this.jaw.position.y) * Math.min(1, dt * 12);
    }

    // emote fade
    const now = performance.now() / 1000;
    const m = this.emote.material as THREE.SpriteMaterial;
    if (now > this.emoteUntil && m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 3);
    if (m.opacity > 0) this.emote.position.y = 1.35 * S + Math.sin(time * 3) * 0.05;
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
