// Whisker Wilds — procedural cat models + animation
// v2: sculpted anatomy — shoulder/haunch masses, neck, cheeked muzzle, almond
// eyes, tapered legs, 8-segment tail, fur-stroke coats. Kittens get oversized
// heads, eyes and ears. Every cat is still 100% procedural and unique.

import * as THREE from 'three';
import type { AccessoryId, CatAction, CatSpec, CatStyle } from './types';
import { DEFAULT_STYLE } from './types';
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
  private jawRestY: number;
  // pregnancy belly: grows with setPregnancy(0..1)
  private torsoMesh: THREE.Mesh;
  private torsoBase = new THREE.Vector3();
  private bellyBump: THREE.Mesh;
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
  // style-driven animation params (set from spec.style in the constructor)
  private lidOpenY = 0.92;
  private earFold = 0;
  private tailCurl = 0;
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
    const style: CatStyle = { ...DEFAULT_STYLE, ...spec.style };

    // ——— torso: main barrel + chest + hip masses (organic silhouette) ———
    const torso = new THREE.Mesh(g.sphere, coatMat);
    torso.scale.set(0.33 * S, 0.29 * S, (kit ? 0.44 : 0.5) * S);
    torso.castShadow = true;
    this.body.add(torso);
    this.torsoMesh = torso;
    this.torsoBase.copy(torso.scale);

    // round mama belly, hidden until setPregnancy() grows it
    this.bellyBump = new THREE.Mesh(g.sphere, bellyMat);
    this.bellyBump.position.set(0, -0.1 * S, -0.04 * S);
    this.bellyBump.scale.setScalar(0.001);
    this.bellyBump.visible = false;
    this.body.add(this.bellyBump);

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

    // face shape sculpts the skull + cheeks
    const faceW = style.face === 'slim' ? 0.88 : style.face === 'chubby' ? 1.14 : 1;
    const faceD = style.face === 'chubby' ? 1.05 : style.face === 'slim' ? 0.97 : 1;
    const cheekMul = style.face === 'chubby' ? 1.32 : style.face === 'slim' ? 0.85 : 1;
    const skull = new THREE.Mesh(g.sphere, coatMat);
    skull.scale.set(0.26 * S * faceW, 0.245 * S, 0.235 * S * faceD);
    skull.castShadow = true;
    this.head.add(skull);

    // extra-fluffy faces get a ruff of fur clumps around the cheeks
    if (style.face === 'fluffy') {
      for (const [fx, fy, fz, fr] of [
        [-0.2, -0.04, 0.1, 0.1], [0.2, -0.04, 0.1, 0.1],
        [-0.17, -0.12, 0.14, 0.08], [0.17, -0.12, 0.14, 0.08],
        [-0.22, 0.06, 0.05, 0.075], [0.22, 0.06, 0.05, 0.075],
      ] as const) {
        const fluff = new THREE.Mesh(g.sphere, coatMat);
        fluff.scale.set(fr * S, fr * 1.25 * S, fr * 0.8 * S);
        fluff.position.set(fx * S, fy * S, fz * S);
        this.head.add(fluff);
      }
    }

    // cheeks + chin form a real muzzle instead of a stuck-on ball
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(g.sphere, bellyMat);
      cheek.scale.set(0.092 * S * cheekMul, 0.082 * S * cheekMul, 0.088 * S);
      cheek.position.set(side * 0.078 * S * faceW, -0.095 * S, 0.175 * S);
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

    // mouth style — each one reads differently at a glance (Lennon's request):
    // sweet = little ω smile · smiley = big open grin with a tongue ·
    // pouty = downturned frown with a big chin · toothy = smile with two fangs
    const jawW = style.mouth === 'smiley' ? 1.4 : style.mouth === 'pouty' ? 0.78 : 1;
    const jawY = style.mouth === 'smiley' ? -0.115 : style.mouth === 'pouty' ? -0.135 : -0.125;
    if (style.mouth === 'pouty') chin.scale.setScalar(0.075 * S);
    this.jaw = new THREE.Mesh(g.sphere, mouthMat);
    this.jaw.scale.set(0.07 * S * jawW, 0.042 * S, 0.07 * S);
    this.jaw.position.set(0, jawY * S, 0.16 * S);
    this.jawRestY = jawY * S;
    this.head.add(this.jaw);

    const lipMat = new THREE.MeshStandardMaterial({ color: '#5a3030', roughness: 0.85 });
    this.disposables.push(lipMat);
    // one little lip arc (half-torus); flip=1 bulges down (smile), -1 up (frown)
    const lipGeo = new THREE.TorusGeometry(0.028 * S, 0.0075 * S, 6, 14, Math.PI);
    this.disposables.push(lipGeo);
    const mkLip = (x: number, y: number, flip: number) => {
      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.position.set(x, y, 0.252 * S);
      lip.rotation.z = flip > 0 ? Math.PI : 0; // arc opening up = happy ω
      lip.rotation.x = -0.25; // follow the muzzle slope
      this.head.add(lip);
      return lip;
    };
    switch (style.mouth) {
      case 'sweet': {
        // the classic cat "ω" — two small arcs meeting under the nose
        mkLip(-0.026 * S, -0.096 * S, 1);
        mkLip(0.026 * S, -0.096 * S, 1);
        break;
      }
      case 'smiley': {
        // a big open happy grin: dark open mouth + pink tongue poking out
        const openMouth = new THREE.Mesh(g.sphere, mouthMat);
        openMouth.scale.set(0.055 * S, 0.042 * S, 0.024 * S);
        openMouth.position.set(0, -0.105 * S, 0.245 * S);
        openMouth.rotation.x = -0.3;
        this.head.add(openMouth);
        const tongueMat = new THREE.MeshStandardMaterial({ color: '#e8899a', roughness: 0.7 });
        this.disposables.push(tongueMat);
        const tongue = new THREE.Mesh(g.sphere, tongueMat);
        tongue.scale.set(0.03 * S, 0.014 * S, 0.028 * S);
        tongue.position.set(0, -0.124 * S, 0.256 * S);
        tongue.rotation.x = -0.35;
        this.head.add(tongue);
        // wide grin corners curling up on the cheeks
        mkLip(-0.052 * S, -0.092 * S, 1);
        mkLip(0.052 * S, -0.092 * S, 1);
        break;
      }
      case 'pouty': {
        // one downturned arc = an unmistakable little frown
        mkLip(0, -0.1 * S, -1);
        break;
      }
      case 'toothy': {
        // the ω smile plus two fangs growing right out of the smile line
        const lipL = mkLip(-0.026 * S, -0.096 * S, 1);
        const lipR = mkLip(0.026 * S, -0.096 * S, 1);
        const fangMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 });
        // a dark open-mouth sliver behind the fangs so they pop on light coats too
        const gap = new THREE.Mesh(g.sphere, mouthMat);
        gap.scale.set(0.052 * S, 0.02 * S, 0.016 * S);
        gap.position.set(0, -0.108 * S, 0.248 * S);
        this.head.add(gap);
        this.disposables.push(fangMat);
        for (const side of [-1, 1]) {
          const fang = new THREE.Mesh(g.cone, fangMat);
          fang.scale.set(0.017 * S, 0.055 * S, 0.014 * S);
          fang.rotation.x = Math.PI - 0.25; // hang along the muzzle slope
          // base tucked up into the lip arc so the fang is clearly attached
          const anchor = side < 0 ? lipL : lipR;
          fang.position.set(
            anchor.position.x + side * 0.024 * S,
            anchor.position.y - 0.026 * S,
            anchor.position.z + 0.006 * S
          );
          this.head.add(fang);
        }
        break;
      }
    }

    const nose = new THREE.Mesh(g.cone, noseMat);
    nose.scale.set(0.042 * S, 0.034 * S, 0.03 * S);
    nose.rotation.x = Math.PI;
    nose.position.set(0, -0.062 * S, 0.268 * S);
    this.head.add(nose);

    // eyes — shape chosen in the Style Studio, with a catchlight sparkle
    const eyeScale = (kit ? 1.28 : 1) * (style.eyes === 'round' ? 1.12 : 1);
    this.lidOpenY = style.eyes === 'sleepy' ? 0.52 : 0.92;
    const mkEye = (side: number) => {
      const socket = new THREE.Group();
      socket.position.set(side * 0.112 * S * faceW, 0.035 * S, 0.195 * S);
      socket.rotation.z = side * (style.eyes === 'round' ? -0.04 : -0.16);
      socket.rotation.y = side * 0.22;
      this.head.add(socket);
      const eye = new THREE.Mesh(g.sphere, eyeMat);
      if (style.eyes === 'round') eye.scale.set(0.074 * S * eyeScale, 0.076 * S * eyeScale, 0.05 * S);
      else eye.scale.set(0.06 * S * eyeScale, 0.082 * S * eyeScale, 0.05 * S);
      socket.add(eye);
      const pupil = new THREE.Mesh(g.sphere, pupilMat);
      if (style.eyes === 'round') pupil.scale.set(0.6, 0.66, 0.42);
      else pupil.scale.set(0.42, 0.78, 0.42);
      pupil.position.z = 0.62;
      eye.add(pupil);
      const glint = new THREE.Mesh(g.sphere, glintMat);
      glint.scale.setScalar(style.eyes === 'starry' ? 0.3 : 0.2);
      glint.position.set(0.28, 0.34, 0.92);
      eye.add(glint);
      if (style.eyes === 'starry') {
        const glint2 = new THREE.Mesh(g.sphere, glintMat);
        glint2.scale.setScalar(0.14);
        glint2.position.set(-0.26, -0.2, 0.9);
        eye.add(glint2);
      }
      const lid = new THREE.Mesh(g.sphere, coatMat);
      lid.scale.setScalar(1.14);
      lid.position.y = this.lidOpenY;
      eye.add(lid);
      return { eye, lid };
    };
    const eL = mkEye(-1);
    const eR = mkEye(1);
    this.lidL = eL.lid;
    this.lidR = eR.lid;

    // ears — style picks the shape: pointy, rounded, folded, big, or lynx-tufted
    const earScale = (kit ? 1.22 : 1) * (style.ears === 'big' ? 1.42 : style.ears === 'folded' ? 0.82 : 1);
    this.earFold = style.ears === 'folded' ? 1.0 : 0;
    const earMat = isPointed ? markMat : limbMat;
    const mkEar = (side: number) => {
      const grp = new THREE.Group();
      grp.position.set(side * 0.145 * S * faceW, 0.195 * S, -0.015 * S);
      grp.rotation.z = side * -0.3;
      grp.rotation.x = -0.12 + this.earFold;
      if (style.ears === 'round') {
        const outer = new THREE.Mesh(g.sphere, earMat);
        outer.scale.set(0.095 * S * earScale, 0.115 * S * earScale, 0.04 * S);
        outer.position.y = 0.01 * S;
        outer.castShadow = true;
        grp.add(outer);
        const inner = new THREE.Mesh(g.sphere, innerEarMat);
        inner.scale.set(0.056 * S * earScale, 0.072 * S * earScale, 0.02 * S);
        inner.position.set(0, 0, 0.026 * S);
        grp.add(inner);
      } else {
        const outer = new THREE.Mesh(g.cone, earMat);
        outer.scale.set(0.1 * S * earScale, 0.165 * S * earScale, 0.045 * S);
        outer.castShadow = true;
        grp.add(outer);
        const inner = new THREE.Mesh(g.cone, innerEarMat);
        inner.scale.set(0.058 * S * earScale, 0.105 * S * earScale, 0.024 * S);
        inner.position.set(0, -0.012 * S, 0.02 * S);
        grp.add(inner);
        if (style.ears === 'tufted') {
          const tuft = new THREE.Mesh(g.cone, bellyMat);
          tuft.scale.set(0.02 * S, 0.07 * S, 0.014 * S);
          tuft.position.set(0, 0.11 * S * earScale, 0);
          tuft.rotation.z = side * -0.2;
          grp.add(tuft);
        }
      }
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
    // whisker style: length multiplier + an upward curl at the tips
    const wLen = style.whiskers === 'long' ? 1.55 : style.whiskers === 'short' ? 0.62 : style.whiskers === 'curly' ? 1.1 : 1;
    const wCurl = style.whiskers === 'curly' ? 0.07 : 0;
    for (const side of [-1, 1]) {
      for (const [dy, droop] of [[-0.075, -0.01], [-0.095, -0.035], [-0.115, -0.06]] as const) {
        addWhisker(
          side * 0.075 * S, dy * S, 0.24 * S,
          side * (0.075 + 0.345 * wLen) * S, (dy + droop * wLen + wCurl) * S, 0.16 * S
        );
      }
      // brow whiskers
      addWhisker(side * 0.09 * S, 0.11 * S, 0.19 * S, side * (0.09 + 0.11 * wLen) * S, (0.11 + 0.11 * wLen) * S, 0.12 * S);
    }
    const wGeo = new THREE.BufferGeometry().setFromPoints(wPts);
    this.disposables.push(wGeo);
    this.head.add(new THREE.LineSegments(wGeo, whiskerMat));

    // ——— tail: style picks the build — classic, floofy, bobtail, or curly-Q ———
    let tailSegs = kit ? 6 : 8;
    let tailR = 1;
    if (style.tail === 'bobtail') { tailSegs = kit ? 3 : 4; tailR = 1.3; }
    else if (style.tail === 'fluffy') tailR = 1.75;
    else if (style.tail === 'curly') this.tailCurl = 0.48;
    let parent: THREE.Object3D = this.body;
    let px = 0, py = 0.1 * S, pz = (kit ? -0.42 : -0.48) * S;
    for (let i = 0; i < tailSegs; i++) {
      const seg = new THREE.Group();
      seg.position.set(px, py, pz);
      const isTip = i >= tailSegs - 2;
      const m = new THREE.Mesh(g.sphere, isTip && (isPointed || spec.coat.pattern !== 'solid') ? markMat : limbMat);
      const r = (0.055 - i * 0.0034) * S * tailR;
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
    // paw style from the Style Studio: socks, toe beans, fluff, and claw length
    const sock = style.paws === 'socks' ||
      (style.paws === 'classic' && (spec.coat.pattern === 'tuxedo' || spec.coat.pattern === 'calico' || hashStr(spec.id) % 3 === 0));
    const beanMat = new THREE.MeshStandardMaterial({ color: '#e89aae', roughness: 0.6 });
    const clawMat = new THREE.MeshStandardMaterial({ color: '#f5f0e2', roughness: 0.35 });
    this.disposables.push(beanMat, clawMat);
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
      const lower = new THREE.Mesh(g.taperCyl, sock && style.paws === 'socks' ? bellyMat : limbMat);
      lower.scale.set(0.052 * S, 0.165 * S, 0.052 * S);
      lower.position.y = -0.082 * S;
      knee.add(lower);
      const paw = new THREE.Mesh(g.sphere, sock ? bellyMat : limbMat);
      paw.scale.set(0.068 * S, 0.048 * S, 0.098 * S);
      paw.position.set(0, -0.175 * S, 0.02 * S);
      knee.add(paw);

      // toe beans: three chubby toes with squishy pink pads peeking out front
      if (style.paws === 'toebeans') {
        for (const [tx, tz] of [[-0.036, 0.088], [0, 0.1], [0.036, 0.088]] as const) {
          const toe = new THREE.Mesh(g.sphere, sock ? bellyMat : limbMat);
          toe.scale.set(0.024 * S, 0.026 * S, 0.03 * S);
          toe.position.set(tx * S, -0.178 * S, (0.02 + tz * 0.5) * S + 0.045 * S);
          knee.add(toe);
          const bean = new THREE.Mesh(g.sphere, beanMat);
          bean.scale.set(0.013 * S, 0.013 * S, 0.01 * S);
          bean.position.set(tx * S, -0.186 * S, (0.02 + tz * 0.5) * S + 0.068 * S);
          knee.add(bean);
        }
      }
      // fluffy tufts around the ankle
      if (style.paws === 'fluffy') {
        for (const [fx, fz] of [[-0.05, 0.02], [0.05, 0.02], [0, -0.045], [0, 0.075]] as const) {
          const fluff = new THREE.Mesh(g.sphere, bellyMat);
          fluff.scale.set(0.028 * S, 0.038 * S, 0.03 * S);
          fluff.position.set(fx * S, -0.15 * S, (0.02 + fz) * S);
          knee.add(fluff);
        }
      }
      // claws poking out of the front edge of the paw
      if (style.claws !== 'tucked') {
        const len = style.claws === 'long' ? 0.05 : 0.026;
        for (const cx of [-0.034, 0, 0.034]) {
          const claw = new THREE.Mesh(g.cone, clawMat);
          claw.scale.set(0.009 * S, len * S, 0.007 * S);
          claw.rotation.x = Math.PI / 2 + 0.35; // point forward and a bit down
          claw.position.set(cx * S, -0.19 * S, (0.115 + len * 0.4) * S);
          knee.add(claw);
        }
      }
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
      case 'heartcollar': {
        const pink = new THREE.MeshStandardMaterial({ color: '#e0507a', roughness: 0.45 });
        const t = new THREE.Mesh(g.torus, accent);
        t.scale.setScalar(0.175 * S);
        t.rotation.x = Math.PI / 2 - 0.35;
        t.position.set(0, neckY, neckZ - 0.03 * S);
        this.accessoryGroup.add(t);
        // pendant heart: two lobes + a point
        const hy = neckY - 0.16 * S, hz = neckZ + 0.12 * S;
        for (const side of [-1, 1]) {
          const lobe = new THREE.Mesh(g.sphere, pink);
          lobe.scale.setScalar(0.034 * S);
          lobe.position.set(side * 0.023 * S, hy + 0.014 * S, hz);
          this.accessoryGroup.add(lobe);
        }
        const point = new THREE.Mesh(g.cone, pink);
        point.scale.set(0.045 * S, 0.055 * S, 0.03 * S);
        point.rotation.x = Math.PI;
        point.position.set(0, hy - 0.026 * S, hz);
        this.accessoryGroup.add(point);
        break;
      }
      case 'starcollar': {
        const t = new THREE.Mesh(g.torus, gold);
        t.scale.setScalar(0.175 * S);
        t.rotation.x = Math.PI / 2 - 0.35;
        t.position.set(0, neckY, neckZ - 0.03 * S);
        this.accessoryGroup.add(t);
        // pendant star: a core with five little points
        const sy = neckY - 0.16 * S, sz = neckZ + 0.12 * S;
        const core = new THREE.Mesh(g.sphere, gold);
        core.scale.setScalar(0.03 * S);
        core.position.set(0, sy, sz);
        this.accessoryGroup.add(core);
        for (let i = 0; i < 5; i++) {
          const a2 = Math.PI / 2 + (i * Math.PI * 2) / 5;
          const spike = new THREE.Mesh(g.cone, gold);
          spike.scale.set(0.016 * S, 0.042 * S, 0.012 * S);
          spike.position.set(Math.cos(a2) * 0.04 * S, sy + Math.sin(a2) * 0.04 * S, sz);
          spike.rotation.z = a2 - Math.PI / 2;
          this.accessoryGroup.add(spike);
        }
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

  /** grow the mama belly: t 0 = normal, 1 = kittens due any second */
  setPregnancy(t: number) {
    const S = this.s * 2;
    const b = Math.max(0, Math.min(1, t));
    this.torsoMesh.scale.set(
      this.torsoBase.x * (1 + b * 0.3),
      this.torsoBase.y * (1 + b * 0.32),
      this.torsoBase.z * (1 + b * 0.08)
    );
    this.bellyBump.visible = b > 0.12;
    const r = b * 0.19 * S;
    this.bellyBump.scale.set(r * 1.15, r, r * 1.5);
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
      // curly tails coil up over the back on top of whatever the pose wants
      const targetX = (i === 0 ? -tailLift - this.tailCurl * 0.5 : -tailLift * 0.28 - this.tailCurl);
      seg.rotation.x += (targetX - seg.rotation.x) * Math.min(1, dt * 6);
      seg.rotation.y = Math.sin(time * 2 + i * 0.7) * 0.1 + tailWave * (i / this.tail.length);
    }

    // blink
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5;
    const closed = a === 'nap' || this.blinkT < 0;
    const lidY = closed ? 0.18 : this.lidOpenY;
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
    const earPitch = (a === 'sneak' ? -0.75 : -0.12) + this.earFold;
    this.earL.rotation.x += (earPitch - this.earL.rotation.x) * k;
    this.earR.rotation.x += (earPitch - this.earR.rotation.x) * k;

    // meow mouth
    if (this.meowT > 0) {
      this.meowT -= dt;
      const open = Math.sin((1 - this.meowT / 0.5) * Math.PI) * 0.08;
      this.jaw.position.y = this.jawRestY - open * S;
      this.head.rotation.x = -0.4;
    } else {
      this.jaw.position.y += (this.jawRestY - this.jaw.position.y) * Math.min(1, dt * 12);
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
