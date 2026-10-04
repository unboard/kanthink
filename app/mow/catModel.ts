// Clean Cut — the cat you find: a little procedural kitty with a coat, a swishy tail,
// blinking eyes and a loaf pose. Plus floating hearts and the owner's speech bubble.

import * as THREE from 'three';
import { COATS, type CoatId } from './cats';

export type CatPose = 'loaf' | 'stand' | 'walk' | 'held';

export interface CatRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group[];
  legs: THREE.Group[];
  lids: THREE.Mesh[];
  ears: THREE.Group[];
  /** pose + animation; `look` turns the head (radians, + = left) */
  animate: (t: number, pose: CatPose, walkPhase: number, look: number) => void;
}

function coatTexture(coat: CoatId): THREE.Texture {
  const c = COATS[coat];
  const W = 256;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = c.base;
  ctx.fillRect(0, 0, W, H);
  let s = coat.length * 977 + 13;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  if (c.pattern === 'tabby' && c.marks) {
    // bands across the length of the body (v runs along it), a little wobbly
    ctx.strokeStyle = c.marks;
    for (let i = 0; i < 9; i++) {
      const y = (i + 0.5) * (H / 9);
      ctx.lineWidth = 6 + rnd() * 7;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin(x * 0.05 + i) * 5 + (rnd() - 0.5) * 4;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (c.pattern === 'patches' && c.marks) {
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? c.marks : c.marks2 ?? c.marks;
      ctx.beginPath();
      const x = rnd() * W;
      const y = rnd() * H;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 18 + rnd() * 22;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.8;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // soft fur speckle
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 4 + rnd() * 5);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildCat(coat: CoatId): CatRig {
  const c = COATS[coat];
  const fur = new THREE.MeshStandardMaterial({ map: coatTexture(coat), roughness: 0.95, color: '#ffffff' });
  const plain = new THREE.MeshStandardMaterial({ color: c.base, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.95 });
  const point = c.pattern === 'points' && c.marks ? new THREE.MeshStandardMaterial({ color: c.marks, roughness: 0.95 }) : plain;
  const pink = new THREE.MeshStandardMaterial({ color: '#f2a0a8', roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: c.eyes, roughness: 0.15, emissive: c.eyes, emissiveIntensity: 0.25 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.1 });
  const lidMat = c.pattern === 'points' ? point : plain;
  const paws = c.bib ? white : c.pattern === 'points' ? point : plain;

  const m = (g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const grp = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  // torso along +X
  const torsoGeo = new THREE.CapsuleGeometry(0.085, 0.2, 6, 16);
  torsoGeo.rotateZ(Math.PI / 2);
  const torso = m(torsoGeo, fur, 0, 0.19, 0);
  torso.scale.set(1, 0.95, 0.88);
  body.add(torso);
  if (c.bib) {
    const bib = m(new THREE.SphereGeometry(0.075, 16, 12), white, 0.13, 0.16, 0);
    bib.scale.set(0.8, 1, 0.9);
    body.add(bib);
  }
  // head
  const head = grp(body, 0.2, 0.29, 0);
  const skull = m(new THREE.SphereGeometry(0.072, 20, 16), c.pattern === 'tabby' || c.pattern === 'patches' ? fur : plain, 0, 0, 0);
  skull.scale.set(0.95, 0.88, 1.05);
  head.add(skull);
  if (c.pattern === 'points') {
    const mask = m(new THREE.SphereGeometry(0.05, 16, 12), point, 0.04, -0.012, 0);
    mask.scale.set(0.8, 0.9, 1);
    head.add(mask);
  }
  const muzzleMat = c.bib || coat === 'snow' || coat === 'calico' ? white : c.pattern === 'points' ? point : plain;
  for (const z of [-0.016, 0.016]) {
    const cheek = m(new THREE.SphereGeometry(0.026, 12, 10), muzzleMat, 0.055, -0.025, z);
    head.add(cheek);
  }
  head.add(m(new THREE.SphereGeometry(0.011, 8, 6), pink, 0.078, -0.008, 0)); // nose
  const lids: THREE.Mesh[] = [];
  for (const z of [-0.03, 0.03]) {
    const e = m(new THREE.SphereGeometry(0.017, 12, 10), eye, 0.054, 0.014, z);
    head.add(e);
    const p = m(new THREE.SphereGeometry(0.008, 8, 8), pupil, 0.066, 0.014, z);
    p.scale.set(0.6, 1.6, 0.6);
    head.add(p);
    const lid = m(new THREE.SphereGeometry(0.019, 12, 10), lidMat, 0.054, 0.014, z);
    lid.scale.set(1, 0.05, 1);
    head.add(lid);
    lids.push(lid);
  }
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = grp(head, -0.005, 0.05, side * 0.04);
    ear.rotation.x = side * -0.3;
    const outer = m(new THREE.ConeGeometry(0.03, 0.06, 4), c.pattern === 'points' ? point : plain, 0, 0.025, 0);
    outer.rotation.y = Math.PI / 4;
    ear.add(outer);
    const inner = m(new THREE.ConeGeometry(0.018, 0.04, 4), pink, 0.008, 0.02, 0);
    inner.rotation.y = Math.PI / 4;
    ear.add(inner);
    ears.push(ear);
  }
  // whiskers
  const wMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.08, 3), wMat);
      w.position.set(0.07, -0.02 + k * 0.008, side * 0.05);
      w.rotation.set(Math.PI / 2 + side * (0.25 - k * 0.15), 0, 0);
      w.rotation.order = 'XYZ';
      head.add(w);
    }
  }
  // legs: front pair and back pair, each a hip group with a paw
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.12, -0.045], [0.12, 0.045], [-0.11, -0.05], [-0.11, 0.05]] as const) {
    const hip = grp(body, x, 0.16, z);
    const legGeo = new THREE.CapsuleGeometry(0.022, 0.1, 4, 10);
    hip.add(m(legGeo, x > 0 && c.bib ? white : c.pattern === 'points' ? point : plain, 0, -0.07, 0));
    hip.add(m(new THREE.SphereGeometry(0.026, 10, 8), paws, 0.008, -0.14, 0));
    legs.push(hip);
  }
  // tail: a chain of segments that curl and swish
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = grp(body, -0.2, 0.22, 0);
  for (let i = 0; i < 7; i++) {
    const seg = grp(parent, i === 0 ? 0 : -0.048, 0, 0);
    const r = 0.022 - i * 0.0015;
    const g = new THREE.CapsuleGeometry(r, 0.035, 4, 8);
    g.rotateZ(Math.PI / 2);
    const tip = i >= 5 && (coat === 'creamsicle' || coat === 'tuxedo') ? white : c.pattern === 'points' ? point : c.pattern === 'tabby' ? fur : plain;
    seg.add(m(g, tip, -0.024, 0, 0));
    tail.push(seg);
    parent = seg;
  }

  let blinkAt = 2;
  const animate = (t: number, pose: CatPose, walkPhase: number, look: number) => {
    const breathe = 1 + Math.sin(t * 2.4) * 0.02;
    torso.scale.set(1, 0.95 * breathe, 0.88 * breathe);
    // blink every few seconds
    if (t > blinkAt + 0.14) blinkAt = t + 2 + Math.random() * 4;
    const closed = t > blinkAt && t < blinkAt + 0.14;
    for (const l of lids) l.scale.y = closed ? 1 : 0.05;
    head.rotation.set(0, look, Math.sin(t * 0.7) * 0.08);
    ears[0].rotation.z = Math.sin(t * 3.1) > 0.97 ? 0.4 : 0;
    ears[1].rotation.z = Math.sin(t * 2.3 + 1) > 0.97 ? 0.4 : 0;
    if (pose === 'loaf' || pose === 'held') {
      // tucked paws, tail wrapped round
      body.position.y = pose === 'held' ? 0 : -0.1;
      for (const l of legs) {
        l.rotation.z = 0;
        l.scale.y = pose === 'held' ? 0.9 : 0.25;
      }
      tail.forEach((s, i) => {
        s.rotation.z = i === 0 ? -0.5 : 0.05;
        s.rotation.y = (i === 0 ? 0.9 : 0.32) + Math.sin(t * 1.6 + i * 0.5) * 0.06;
      });
      if (pose === 'held') legs.forEach((l) => (l.rotation.z = -0.3));
    } else {
      body.position.y = 0;
      const sp = pose === 'walk' ? 1 : 0;
      legs.forEach((l, i) => {
        l.scale.y = 1;
        const ph = walkPhase + (i === 0 || i === 3 ? 0 : Math.PI);
        l.rotation.z = Math.sin(ph) * 0.6 * sp;
      });
      // tail up like a happy question mark
      tail.forEach((s, i) => {
        s.rotation.y = Math.sin(t * 2.2 - i * 0.6) * 0.12;
        s.rotation.z = i === 0 ? -1.25 : i >= 5 ? -0.3 : 0.06;
      });
      body.position.y = pose === 'walk' ? Math.abs(Math.sin(walkPhase)) * 0.01 : 0;
    }
  };

  return { root, body, head, tail, legs, lids, ears, animate };
}

// ———————————————————————————————————————— hearts

function heartTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff5c8a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 54);
  ctx.bezierCurveTo(4, 36, 6, 10, 22, 10);
  ctx.bezierCurveTo(28, 10, 32, 15, 32, 19);
  ctx.bezierCurveTo(32, 15, 36, 10, 42, 10);
  ctx.bezierCurveTo(58, 10, 60, 36, 32, 54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Hearts {
  readonly group = new THREE.Group();
  private mat: THREE.SpriteMaterial;
  private live: { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number }[] = [];

  constructor() {
    this.mat = new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false });
  }

  burst(at: THREE.Vector3, n: number, spread = 0.4) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.mat.clone());
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 0.2, (Math.random() - 0.5) * spread));
      const size = 0.12 + Math.random() * 0.12;
      s.scale.set(size, size, size);
      this.group.add(s);
      const max = 1.4 + Math.random() * 1.2;
      this.live.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4), life: max, max });
    }
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const h = this.live[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.group.remove(h.s);
        h.s.material.dispose();
        this.live.splice(i, 1);
        continue;
      }
      h.s.position.addScaledVector(h.v, dt);
      h.s.position.x += Math.sin(h.life * 5) * dt * 0.15;
      h.s.material.opacity = Math.min(1, h.life / (h.max * 0.4));
    }
  }

  clear() {
    for (const h of this.live) {
      this.group.remove(h.s);
      h.s.material.dispose();
    }
    this.live = [];
  }
}

// ———————————————————————————————————————— speech bubble

export class Bubble {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private text = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 160;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.sprite.scale.set(2.6, 0.82, 1);
    this.sprite.renderOrder = 10;
  }

  set(text: string, tone: 'ask' | 'happy' = 'ask') {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 50px Inter, system-ui, sans-serif';
    const tw = Math.min(W - 40, ctx.measureText(text).width + 60);
    const x0 = (W - tw) / 2;
    ctx.fillStyle = tone === 'happy' ? '#ff5c8a' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x0, 8, tw, H - 44, 36);
    ctx.moveTo(W / 2 - 18, H - 37);
    ctx.lineTo(W / 2, H - 8);
    ctx.lineTo(W / 2 + 18, H - 37);
    ctx.fill();
    ctx.fillStyle = tone === 'happy' ? '#ffffff' : '#1c1c1c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, (H - 36) / 2 + 8, W - 60);
    this.tex.needsUpdate = true;
  }
}
