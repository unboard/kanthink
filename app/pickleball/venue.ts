// Where the game is played. Four venues, each built in code around whatever court the
// sport brings: the sky and its light, the playing surface with its lines, the net, the
// surroundings, and a crowd that gets to its feet when something happens.
//
//   park     golden hour at the neighborhood courts
//   beach    midday sand, palms and surf
//   arena    indoor hardwood under the lights, full stands
//   rooftop  a city roof at night, string lights and skyline
//
// Shared by pickleball and volleyball. Nothing here reads game state; the renderer tells
// the venue how excited the crowd should be and whether the side camera is in use.

import * as THREE from 'three';

export type VenueId = 'park' | 'beach' | 'arena' | 'rooftop';

export const VENUES: Array<{ id: VenueId; name: string; blurb: string }> = [
  { id: 'park', name: 'Sunset Park', blurb: 'Golden hour at the neighborhood courts' },
  { id: 'beach', name: 'Coconut Beach', blurb: 'Sand, palms and the sound of surf' },
  { id: 'arena', name: 'The Fieldhouse', blurb: 'Hardwood, bright lights, a full house' },
  { id: 'rooftop', name: 'Skyline Rooftop', blurb: 'String lights over the city at night' },
];

export function isVenue(v: unknown): v is VenueId {
  return v === 'park' || v === 'beach' || v === 'arena' || v === 'rooftop';
}

export interface CourtSpec {
  sport: 'pickleball' | 'volleyball' | 'soccer';
  halfWidth: number;
  halfLength: number;
  /** top of the net */
  netHeight: number;
  postX: number;
  /** non-volley zone depth; 0 for none */
  kitchen: number;
  /** soccer: the goal mouths (half width, height, depth) and the box in front of them */
  goal?: { half: number; h: number; depth: number; boxHalf: number; boxDepth: number; centerR: number };
}

export interface Venue {
  id: VenueId;
  /** things on the +x side that would block the side camera */
  nearSide: THREE.Object3D[];
  /** the playing surface is loose sand: landings kick it up */
  sand: boolean;
  /** color of the dust a landing kicks up */
  dust: string;
  /** exposure the venue was lit for */
  exposure: number;
  bloom: number;
  kitchenMats: THREE.MeshBasicMaterial[];
  /** 0..1; decays on its own */
  cheer(amount: number): void;
  update(t: number, dt: number): void;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rnd: () => number, dark: number, light: number, size = 1.6) {
  for (let i = 0; i < n; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${dark * rnd()})` : `rgba(255,255,255,${light * rnd()})`;
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
}

interface Look {
  sky: [string, string, string];
  fog: [string, number, number];
  hemi: [string, string, number];
  sun: [string, number, [number, number, number]];
  fill: [string, number];
  exposure: number;
  bloom: number;
  court: string;
  inner: string;
  apron: string;
  line: string;
  ground: string;
  dust: string;
}

const LOOKS: Record<VenueId, Look> = {
  park: {
    sky: ['#f2b184', '#5d7fb0', '#1b2f55'], fog: ['#7f8fa8', 150, 420], hemi: ['#cfe0ff', '#3b4a34', 1.0],
    sun: ['#ffd9b0', 2.5, [-34, 40, 22]], fill: ['#86a8ff', 0.5], exposure: 1.05, bloom: 0.35,
    court: '#2a5f8f', inner: '#3d79aa', apron: '#2f7058', line: '#f6f2e6', ground: '#33503a', dust: '#d8d2c0',
  },
  beach: {
    sky: ['#cdeaf7', '#58b4e6', '#1d6fc0'], fog: ['#bfe3f2', 200, 520], hemi: ['#e8f6ff', '#d8b98a', 1.25],
    sun: ['#fff4d8', 3.0, [-22, 52, -18]], fill: ['#bfe6ff', 0.55], exposure: 1.0, bloom: 0.28,
    court: '#e9cf9c', inner: '#e9cf9c', apron: '#e9cf9c', line: '#1f5fbf', ground: '#e6c88f', dust: '#f1dcae',
  },
  arena: {
    sky: ['#05070c', '#080b12', '#0b0f18'], fog: ['#0a0d14', 120, 330], hemi: ['#dfe8ff', '#3a2b1c', 0.75],
    sun: ['#fff6e6', 2.3, [-10, 60, 8]], fill: ['#9fc0ff', 0.7], exposure: 1.1, bloom: 0.55,
    court: '#c58b4c', inner: '#b87a3e', apron: '#1d3557', line: '#ffffff', ground: '#11151d', dust: '#e8dcc6',
  },
  rooftop: {
    sky: ['#3a2a55', '#141a38', '#05070f'], fog: ['#141a33', 130, 420], hemi: ['#8ea4ff', '#2a1f33', 0.7],
    sun: ['#cfd8ff', 1.5, [26, 46, -20]], fill: ['#ff7ad0', 0.6], exposure: 1.2, bloom: 0.7,
    court: '#3a2f6b', inner: '#4a3c86', apron: '#1f2434', line: '#7df9ff', ground: '#22262f', dust: '#c9cbe0',
  },
};

export function venueLook(id: VenueId): Look {
  return LOOKS[id];
}

export function buildVenue(id: VenueId, spec: CourtSpec, scene: THREE.Scene, low: boolean): Venue {
  const L = LOOKS[id];
  const rnd = seeded(0x9e3779b9 ^ id.length * 7919);
  const HW = spec.halfWidth;
  const HL = spec.halfLength;
  const soccer = spec.sport === 'soccer';
  const padX = soccer ? 7 : spec.sport === 'volleyball' ? 11 : 8;
  const padZ = soccer ? 11 : spec.sport === 'volleyball' ? 13 : 11;
  const nearSide: THREE.Object3D[] = [];
  const tickers: Array<(t: number, dt: number) => void> = [];
  const add = <T extends THREE.Object3D>(o: T, near = false): T => {
    scene.add(o);
    if (near) nearSide.push(o);
    return o;
  };
  const M = (color: string, rough = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, near = false) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    b.receiveShadow = true;
    return add(b, near);
  };

  // ——— sky ———
  scene.fog = new THREE.Fog(new THREE.Color(L.fog[0]), L.fog[1], L.fog[2]);
  {
    const geo = new THREE.SphereGeometry(520, 40, 24);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const low0 = new THREE.Color(L.sky[0]);
    const mid = new THREE.Color(L.sky[1]);
    const top = new THREE.Color(L.sky[2]);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 520;
      if (h < 0.02) col.copy(low0);
      else if (h < 0.28) col.copy(low0).lerp(mid, (h - 0.02) / 0.26);
      else col.copy(mid).lerp(top, Math.min(1, (h - 0.28) / 0.6));
      colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = 'sky';
    add(sky);
  }
  const glowTex = (inner: string, outer: string) => tex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  const sprite = (map: THREE.Texture, x: number, y: number, z: number, sx: number, sy: number, additive = false, near = false) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.set(x, y, z);
    s.scale.set(sx, sy, 1);
    return add(s, near);
  };
  if (id === 'park' || id === 'beach') {
    const sunDir = new THREE.Vector3(...L.sun[2]).normalize();
    sprite(glowTex(id === 'park' ? 'rgba(255,214,150,1)' : 'rgba(255,252,235,1)', 'rgba(255,200,120,0)'), sunDir.x * 440, Math.max(40, sunDir.y * 440 * (id === 'park' ? 0.28 : 0.8)), sunDir.z * 440, 190, 190, true);
    const cloud = tex(256, 128, (g) => {
      for (let k = 0; k < 16; k++) {
        const x = 40 + rnd() * 176;
        const y = 54 + rnd() * 34;
        const r = 18 + rnd() * 26;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, id === 'park' ? 'rgba(255,225,200,0.9)' : 'rgba(255,255,255,0.95)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 128);
      }
    });
    const clouds: THREE.Sprite[] = [];
    for (let k = 0; k < (low ? 7 : 14); k++) {
      const a = rnd() * Math.PI * 2;
      const r = 300 + rnd() * 150;
      const w = 110 + rnd() * 120;
      clouds.push(sprite(cloud, Math.cos(a) * r, 90 + rnd() * 120, Math.sin(a) * r, w, w * 0.45));
    }
    tickers.push((_t, dt) => { for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 460) c.position.x = -460; } });
  } else if (id === 'rooftop') {
    const n = 900;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.12 + rnd() * 1.3;
      pts.set([Math.cos(a) * Math.cos(e) * 480, Math.sin(e) * 480, Math.sin(a) * Math.cos(e) * 480], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe6ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
    sprite(glowTex('rgba(240,244,255,1)', 'rgba(170,190,255,0)'), -210, 250, -330, 70, 70, true);
    sprite(glowTex('rgba(255,120,200,0.45)', 'rgba(255,120,200,0)'), 0, 10, -420, 900, 160, true);
  }

  // ——— light ———
  add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
  const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
  sun.position.set(...L.sun[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -(HW + 16);
  sc.right = HW + 16;
  sc.top = HL + 14;
  sc.bottom = -(HL + 14);
  sc.near = 1;
  sc.far = 170;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  add(sun);
  const fill = new THREE.DirectionalLight(L.fill[0], L.fill[1]);
  fill.position.set(30, 22, -30);
  add(fill);
  const rim = new THREE.DirectionalLight(L.fill[0], L.fill[1] * 0.7);
  rim.position.set(-20, 16, 40);
  add(rim);

  // ——— the playing surface ———
  const PX = 22; // pixels per foot
  const sw = (HW + padX) * 2;
  const sl = (HL + padZ) * 2;
  const sand = id === 'beach' || (id === 'park' && spec.sport === 'volleyball');
  const surface = tex(Math.round(sw * PX), Math.round(sl * PX), (g) => {
    const W = sw * PX;
    const H = sl * PX;
    const X = (x: number) => (x + HW + padX) * PX;
    const Z = (z: number) => (z + HL + padZ) * PX;
    const r2 = seeded(11);
    if (soccer && id === 'park') {
      // a mown pitch: stripes across the width, a little wear in the goalmouths
      g.fillStyle = '#2f6b34';
      g.fillRect(0, 0, W, H);
      const band = 6 * PX;
      for (let y = 0, k = 0; y < H; y += band, k++) {
        g.fillStyle = k % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
        g.fillRect(0, y, W, band);
      }
      speckle(g, W, H, 30000, r2, 0.18, 0.08, 1.8);
      for (const sz of [1, -1]) {
        const grad = g.createRadialGradient(X(0), Z(sz * (HL - 4)), 0, X(0), Z(sz * (HL - 4)), 7 * PX);
        grad.addColorStop(0, 'rgba(120,96,60,0.35)');
        grad.addColorStop(1, 'rgba(120,96,60,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
      }
    } else if (sand) {
      g.fillStyle = id === 'beach' ? '#e9cf9c' : '#e2c79a';
      g.fillRect(0, 0, W, H);
      // raked and trodden: soft blotches, then grain
      for (let k = 0; k < 260; k++) {
        const x = r2() * W;
        const y = r2() * H;
        const r = 30 + r2() * 90;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const d = r2() < 0.5;
        grad.addColorStop(0, d ? 'rgba(150,110,60,0.10)' : 'rgba(255,246,220,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      speckle(g, W, H, 26000, r2, 0.16, 0.22, 2);
      // footprints inside the court
      g.fillStyle = 'rgba(120,85,45,0.13)';
      for (let k = 0; k < 150; k++) {
        const x = X((r2() - 0.5) * 2 * (HW + 3));
        const y = Z((r2() - 0.5) * 2 * (HL + 3));
        g.beginPath();
        g.ellipse(x, y, 5, 9, r2() * 3, 0, Math.PI * 2);
        g.fill();
      }
    } else if (id === 'arena') {
      // maple planks running the length of the court
      g.fillStyle = L.apron;
      g.fillRect(0, 0, W, H);
      const plank = 0.42 * PX;
      for (let x = 0; x < W; x += plank) {
        const tone = 0.9 + r2() * 0.2;
        g.fillStyle = `rgb(${Math.round(205 * tone)},${Math.round(150 * tone)},${Math.round(88 * tone)})`;
        g.fillRect(x, 0, plank - 0.6, H);
        g.fillStyle = 'rgba(70,40,15,0.35)';
        let y = r2() * 120;
        while (y < H) { g.fillRect(x, y, plank, 1); y += 60 + r2() * 150; }
      }
      // painted run-off outside the court
      g.fillStyle = L.apron;
      g.globalAlpha = 0.93;
      g.fillRect(0, 0, W, Z(-HL) - 3 * PX);
      g.fillRect(0, Z(HL) + 3 * PX, W, H);
      g.fillRect(0, 0, X(-HW) - 3 * PX, H);
      g.fillRect(X(HW) + 3 * PX, 0, W, H);
      g.globalAlpha = 1;
      if (spec.sport === 'pickleball') {
        g.fillStyle = 'rgba(29,53,87,0.82)';
        g.fillRect(X(-HW), Z(-HL), HW * 2 * PX, HL * 2 * PX);
        g.fillStyle = 'rgba(42,111,151,0.85)';
        g.fillRect(X(-HW), Z(-spec.kitchen), HW * 2 * PX, spec.kitchen * 2 * PX);
      }
    } else {
      g.fillStyle = L.apron;
      g.fillRect(0, 0, W, H);
      g.fillStyle = L.court;
      g.fillRect(X(-HW), Z(-HL), HW * 2 * PX, HL * 2 * PX);
      if (spec.kitchen > 0) {
        g.fillStyle = L.inner;
        g.fillRect(X(-HW), Z(-spec.kitchen), HW * 2 * PX, spec.kitchen * 2 * PX);
      }
      // acrylic grit and a few scuffs
      speckle(g, W, H, 30000, r2, 0.1, 0.07, 1.6);
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 2;
      for (let k = 0; k < 40; k++) {
        const x = X((r2() - 0.5) * 2 * HW);
        const y = Z((r2() - 0.5) * 2 * HL);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r2() - 0.5) * 40, y + (r2() - 0.5) * 40);
        g.stroke();
      }
    }
    // lines
    const lw = (spec.sport === 'volleyball' ? 0.2 : 0.17) * PX;
    g.strokeStyle = L.line;
    g.lineWidth = lw;
    if (id === 'rooftop') { g.shadowColor = L.line; g.shadowBlur = 10; }
    g.strokeRect(X(-HW), Z(-HL), HW * 2 * PX, HL * 2 * PX);
    const seg = (x1: number, z1: number, x2: number, z2: number) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
    if (spec.sport === 'pickleball') {
      for (const s of [1, -1]) {
        seg(-HW, s * spec.kitchen, HW, s * spec.kitchen);
        seg(0, s * spec.kitchen, 0, s * HL);
      }
    } else if (soccer && spec.goal) {
      const G = spec.goal;
      // halfway line, center circle and spot, and a box and a goal area at each end
      seg(-HW, 0, HW, 0);
      g.beginPath();
      g.arc(X(0), Z(0), G.centerR * PX, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = L.line;
      g.beginPath();
      g.arc(X(0), Z(0), 0.5 * PX, 0, Math.PI * 2);
      g.fill();
      for (const s of [1, -1]) {
        const zb = s * (HL - G.boxDepth);
        seg(-G.boxHalf, s * HL, -G.boxHalf, zb);
        seg(G.boxHalf, s * HL, G.boxHalf, zb);
        seg(-G.boxHalf, zb, G.boxHalf, zb);
        const za = s * (HL - 5);
        seg(-G.half - 2, s * HL, -G.half - 2, za);
        seg(G.half + 2, s * HL, G.half + 2, za);
        seg(-G.half - 2, za, G.half + 2, za);
        g.beginPath();
        g.arc(X(0), Z(s * (HL - G.boxDepth)), 6 * PX, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 2 : Math.PI);
        g.stroke();
        g.beginPath();
        g.arc(X(0), Z(s * (HL - 9)), 0.4 * PX, 0, Math.PI * 2);
        g.fill();
      }
    } else if (!sand) {
      seg(-HW, 0, HW, 0);
      for (const s of [1, -1]) seg(-HW, s * 9.8, HW, s * 9.8); // attack lines
    }
    g.shadowBlur = 0;
    if (id === 'arena') {
      // center-court mark
      g.globalAlpha = 0.16;
      g.fillStyle = '#ffffff';
      g.font = `900 ${Math.round(5.2 * PX)}px ui-sans-serif, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(X(0), Z(HL * 0.55));
      g.fillText('KAN', 0, 0);
      g.restore();
      g.save();
      g.translate(X(0), Z(-HL * 0.55));
      g.rotate(Math.PI);
      g.fillText('KAN', 0, 0);
      g.restore();
      g.globalAlpha = 1;
    }
  });
  const grain = tex(256, 256, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, sand ? 9000 : 5000, seeded(5), 0.5, 0.5, sand ? 2.2 : 1.4);
  }, false);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(sw / 5, sl / 5);
  const floorMat = new THREE.MeshStandardMaterial({
    map: surface, bumpMap: grain, bumpScale: sand ? 2.4 : 0.5,
    roughness: id === 'arena' ? 0.3 : sand ? 1 : 0.82, metalness: id === 'arena' ? 0.05 : 0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sw, sl), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  add(floor);

  // the land around it
  const groundMat = M(L.ground, 1, { bumpMap: grain, bumpScale: sand ? 2 : 0.6 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = id === 'rooftop' ? -0.02 : -0.03;
  ground.receiveShadow = true;
  add(ground);
  if (sand) {
    // boundary tape pinned into the sand, like a real beach court
    const tape = new THREE.MeshStandardMaterial({ color: L.line, roughness: 0.6 });
    const strip = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), tape);
      m.position.set(x, 0.035, z);
      m.receiveShadow = true;
      add(m);
    };
    strip(0.22, HL * 2, -HW, 0);
    strip(0.22, HL * 2, HW, 0);
    strip(HW * 2 + 0.22, 0.22, 0, HL);
    strip(HW * 2 + 0.22, 0.22, 0, -HL);
    (floorMat.map as THREE.Texture).needsUpdate = true;
  }

  // the kitchen warms up under your feet as a reminder
  const kitchenMats: THREE.MeshBasicMaterial[] = [];
  if (spec.kitchen > 0) {
    for (const s of [1, -1]) {
      const m = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false });
      const k = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, spec.kitchen), m);
      k.rotation.x = -Math.PI / 2;
      k.position.set(0, 0.03, (s * spec.kitchen) / 2);
      add(k);
      kitchenMats.push(m);
    }
  }

  if (soccer) buildGoals(spec, id, add);
  else buildNet(spec, id, add);

  // ——— crowd ———
  interface Fan { x: number; y: number; z: number; ph: number; f: number; h: number }
  const fans: Fan[] = [];
  const fanColors = ['#FF5A5F', '#00B4D8', '#F4C430', '#ffffff', '#7B2CBF', '#42D6A4', '#FF8C42', '#2B9BF4', '#F466A6', '#1f2630', '#8AC926'];
  const skins = ['#FDE2C8', '#F4C7A1', '#E0A87E', '#C68658', '#9E623D', '#75452A', '#522E1C'];
  /** a bank of bleachers facing the court; returns nothing, seats its own fans */
  const stand = (cx: number, cz: number, ry: number, width: number, rows: number, fill: number, mat: THREE.Material, near = false) => {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = ry;
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, 1.25 * (r + 1), 2.3), mat);
      step.position.set(0, 0.625 * (r + 1), r * 2.3);
      step.castShadow = !low;
      step.receiveShadow = true;
      g.add(step);
      const n = Math.floor(width / 1.55);
      for (let k = 0; k < n; k++) {
        if (rnd() > fill) continue;
        const lx = -width / 2 + 0.8 + k * 1.55 + (rnd() - 0.5) * 0.3;
        const lz = r * 2.3 - 0.2;
        const wx = cx + lx * Math.cos(ry) + lz * Math.sin(ry);
        const wz = cz - lx * Math.sin(ry) + lz * Math.cos(ry);
        fans.push({ x: wx, y: 1.25 * (r + 1), z: wz, ph: rnd() * 6.28, f: 5 + rnd() * 4, h: 0.85 + rnd() * 0.3 });
      }
    }
    add(g, near);
  };

  // ——— surroundings ———
  const X0 = HW + padX; // edge of the surface
  const Z0 = HL + padZ;
  if (id === 'park') buildPark();
  else if (id === 'beach') buildBeach();
  else if (id === 'arena') buildArena();
  else buildRooftop();

  function tree(x: number, z: number, h: number, w: number, hue: number, near = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.07, w * 0.12, h * 0.5, 8), M('#4a3626', 1));
    trunk.position.y = h * 0.25;
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = M(new THREE.Color().setHSL(hue, 0.42, 0.22 + rnd() * 0.08).getStyle(), 1, { flatShading: false });
    const blobs = low ? 3 : 6;
    for (let k = 0; k < blobs; k++) {
      const geo = new THREE.SphereGeometry(w * (0.42 + rnd() * 0.22), 18, 14);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = 1 + (Math.sin(p.getX(i) * 1.3 + k) * Math.cos(p.getZ(i) * 1.1) + Math.sin(p.getY(i) * 1.7 + k * 2)) * 0.11;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const b = new THREE.Mesh(geo, leaf);
      const a = (k / blobs) * Math.PI * 2;
      b.position.set(Math.cos(a) * w * 0.3 * (k ? 1 : 0), h * (0.55 + (k % 3) * 0.14), Math.sin(a) * w * 0.3 * (k ? 1 : 0));
      b.castShadow = !low;
      g.add(b);
    }
    add(g, near);
    tickers.push((t) => { g.rotation.z = Math.sin(t * 0.7 + x) * 0.012; });
  }

  function lightTower(x: number, z: number, h: number, near = false) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 10), M('#2a3038', 0.5, { metalness: 0.6 }));
    pole.position.set(x, h / 2, z);
    pole.castShadow = true;
    add(pole, near);
    const rack = new THREE.Group();
    rack.position.set(x * 0.95, h, z * 0.97);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.9, 0.3), M('#1b1f26', 0.5, { metalness: 0.5 }));
    rack.add(frame);
    const lamp = new THREE.MeshStandardMaterial({ color: '#fff7e0', emissive: new THREE.Color('#fff1d0'), emissiveIntensity: 3.2 });
    for (let k = 0; k < 6; k++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 14), lamp);
      l.rotation.x = Math.PI / 2;
      l.position.set(-1.4 + (k % 3) * 1.4, k < 3 ? 0.45 : -0.45, -0.2);
      rack.add(l);
    }
    rack.lookAt(0, 0, 0);
    rack.rotateY(Math.PI);
    add(rack, near);
    sprite(glowTex('rgba(255,240,210,0.6)', 'rgba(255,240,210,0)'), x * 0.95, h, z * 0.97, 13, 13, true, near);
  }

  function bench(x: number, z: number, ry: number, near = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const wood = M('#8a5a34', 0.8);
    const steel = M('#2a3038', 0.5, { metalness: 0.6 });
    for (let k = 0; k < 3; k++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.42), wood);
      slat.position.set(0, 1.5, -0.5 + k * 0.5);
      g.add(slat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(6, 0.42, 0.1), wood);
      back.position.set(0, 2.0 + k * 0.5, 0.85);
      g.add(back);
    }
    for (const sx of [-2.6, 2.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.5), steel);
      leg.position.set(sx, 0.75, 0);
      g.add(leg);
    }
    // a towel, a bag and water bottles: someone's stuff
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.0), M(fanColors[Math.floor(rnd() * 5)], 1));
    towel.position.set(-1.6, 1.6, 0);
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 6, 10), M('#1f2630', 0.8));
    bag.rotation.z = Math.PI / 2;
    bag.position.set(1.6, 0.5, -1.2);
    g.add(towel, bag);
    for (let k = 0; k < 2; k++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 10), M(k ? '#00B4D8' : '#FF5A5F', 0.3));
      bottle.position.set(0.4 + k * 0.5, 1.9, 0);
      g.add(bottle);
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    add(g, near);
  }

  /** sponsor-style boards low enough to see over */
  function boards(z: number, colorA: string, colorB: string) {
    const t = tex(1024, 64, (g) => {
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? colorA : colorB;
        g.fillRect(k * 128, 0, 128, 64);
        g.fillStyle = k % 2 ? colorB : colorA;
        g.font = '900 34px ui-sans-serif, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText((spec.sport === 'soccer' ? ['KAN', 'PLAY', 'GOAL', 'KICK', 'SAVE', 'BANK', 'SCORE', 'FAMILY'] : ['KAN', 'PLAY', 'DINK', 'SPIKE', 'RALLY', 'ACE', 'SMASH', 'FAMILY'])[k], k * 128 + 64, 34);
      }
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(X0 * 2 - 2, 2.2, 0.3), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: id === 'arena' || id === 'rooftop' ? 0.7 : 0.08 }));
    m.position.set(0, 1.1, z);
    m.castShadow = true;
    add(m);
  }

  function buildPark() {
    // chain-link down the long sides only; the ends stay open for the cameras
    const link = tex(64, 64, (g) => {
      g.strokeStyle = 'rgba(190,200,205,0.9)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
      g.stroke();
    });
    link.wrapS = link.wrapT = THREE.RepeatWrapping;
    const steel = M('#49525c', 0.45, { metalness: 0.7 });
    for (const sx of [-1, 1]) {
      const t = link.clone();
      t.repeat.set(Z0 * 2 / 0.8, 11 / 0.8);
      t.needsUpdate = true;
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(Z0 * 2, 11), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }));
      fence.rotation.y = Math.PI / 2;
      fence.position.set(sx * (X0 + 1), 5.5, 0);
      add(fence, sx > 0);
      for (let z = -Z0; z <= Z0 + 0.1; z += Z0 / 3) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 11.3, 8), steel);
        post.position.set(sx * (X0 + 1), 5.65, z);
        post.castShadow = true;
        add(post, sx > 0);
      }
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, Z0 * 2, 8), steel);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx * (X0 + 1), 11, 0);
      add(rail, sx > 0);
    }
    stand(-(X0 + 5), 0, -Math.PI / 2, 34, 4, 0.72, M('#8f969c', 0.6, { metalness: 0.3 }));
    bench(X0 - 3, -HL * 0.45, -Math.PI / 2, true);
    bench(X0 - 3, HL * 0.45, -Math.PI / 2, true);
    bench(-(X0 - 3), 0, Math.PI / 2);
    boards(-(Z0 + 2), '#1D3557', '#F4C430');
    for (const [x, z] of [[-(X0 + 9), -(Z0 + 6)], [X0 + 9, -(Z0 + 6)], [-(X0 + 9), Z0 + 6], [X0 + 9, Z0 + 6]] as [number, number][]) lightTower(x, z, 30, x > 0);
    // paths, grass, and trees all the way to the hills
    const path = new THREE.Mesh(new THREE.PlaneGeometry(9, 260), M('#b9ad98', 1));
    path.rotation.x = -Math.PI / 2;
    path.position.set(-(X0 + 22), 0, 0);
    path.receiveShadow = true;
    add(path);
    const n = low ? 46 : 110;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.05;
      const r = 78 + rnd() * 150;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 1.15;
      if (Math.abs(x) < 26 && Math.abs(z) < 130) continue; // sight lines behind each baseline
      tree(x, z, 20 + rnd() * 24, 12 + rnd() * 10, 0.27 + rnd() * 0.1, x > 20 && Math.abs(z) < 60);
    }
    for (let k = 0; k < 5; k++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(150 + rnd() * 80, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(new THREE.Color().setHSL(0.3, 0.3, 0.16 + rnd() * 0.05).getStyle(), 1));
      const a = k * 1.3 + 0.4;
      hill.position.set(Math.cos(a) * 400, -60, Math.sin(a) * 400);
      hill.scale.y = 0.42;
      add(hill);
    }
  }

  function buildBeach() {
    // dunes, then the water
    const dunes = new THREE.PlaneGeometry(700, 700, 70, 70);
    const dp = dunes.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i);
      const y = dp.getY(i);
      const edge = Math.max(0, Math.max(Math.abs(x) - (X0 + 4), Math.abs(y) - (Z0 + 4)));
      const h = Math.min(1, edge / 30) * (Math.sin(x * 0.07) * Math.cos(y * 0.05) * 1.6 + Math.sin(x * 0.19 + y * 0.13) * 0.5);
      dp.setZ(i, h - (x < -60 ? Math.min(6, (-60 - x) * 0.08) : 0));
    }
    dunes.computeVertexNormals();
    const sandMat = M('#e6c88f', 1, { bumpMap: grain, bumpScale: 2 });
    const land = new THREE.Mesh(dunes, sandMat);
    land.rotation.x = -Math.PI / 2;
    land.position.y = -0.04;
    land.receiveShadow = true;
    add(land);
    const waves = tex(256, 256, (g) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, 256, 256);
      const r2 = seeded(3);
      for (let k = 0; k < 90; k++) {
        g.strokeStyle = `rgba(255,255,255,${0.15 + r2() * 0.3})`;
        g.lineWidth = 1 + r2() * 3;
        const y = r2() * 256;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.08 + k) * 5);
        g.stroke();
      }
    }, false);
    waves.wrapS = waves.wrapT = THREE.RepeatWrapping;
    waves.repeat.set(26, 26);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#1f9fc4', roughness: 0.12, metalness: 0.35, bumpMap: waves, bumpScale: 1.6, transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-760, -1.6, 0);
    add(sea);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(10, 1400), new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(-63, -1.3, 0);
    add(foam);
    tickers.push((t) => {
      waves.offset.set(t * 0.012, Math.sin(t * 0.2) * 0.02);
      foam.position.x = -63 + Math.sin(t * 0.7) * 2.4;
      (foam.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 0.7) * 0.3;
    });
    // palms
    const frondTex = tex(64, 256, (g) => {
      g.strokeStyle = '#2f7d32';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke();
      for (let y = 250; y > 6; y -= 7) {
        const w = 30 * Math.sin((y / 256) * Math.PI) + 4;
        g.strokeStyle = y % 14 ? '#3b9440' : '#2a6d2d';
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y - 16); g.moveTo(32, y); g.lineTo(32 + w, y - 16); g.stroke();
      }
    });
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    const palm = (x: number, z: number, h: number, near = false) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const bend = (rnd() - 0.5) * 0.5;
      const bark = M('#8a6b48', 1);
      let px = 0;
      const segs = 9;
      for (let k = 0; k < segs; k++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.62 - k * 0.03, 0.72 - k * 0.03, h / segs + 0.15, 10), bark);
        px += Math.sin((k / segs) * 1.2) * bend * 1.6;
        s.position.set(px, (k + 0.5) * (h / segs), 0);
        s.rotation.z = -Math.sin((k / segs) * 1.2) * bend * 0.5;
        s.castShadow = true;
        g.add(s);
      }
      const crown = new THREE.Group();
      crown.position.set(px, h, 0);
      for (let k = 0; k < 9; k++) {
        const geo = new THREE.PlaneGeometry(3.4, 13, 1, 6);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) + 6.5;
          p.setY(i, y);
          p.setZ(i, -((y / 13) ** 2) * 5.5 + Math.abs(p.getX(i)) * -0.35);
        }
        geo.computeVertexNormals();
        const f = new THREE.Mesh(geo, frondMat);
        f.rotation.set(-1.15 + (k % 3) * 0.2, 0, 0);
        const holder = new THREE.Group();
        holder.rotation.y = (k / 9) * Math.PI * 2;
        holder.add(f);
        f.castShadow = !low;
        crown.add(holder);
      }
      for (let k = 0; k < 3; k++) {
        const nut = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), M('#5b3d22', 0.9));
        nut.position.set(Math.cos(k * 2.1) * 0.6, -0.5, Math.sin(k * 2.1) * 0.6);
        crown.add(nut);
      }
      g.add(crown);
      add(g, near);
      tickers.push((t) => { crown.rotation.z = Math.sin(t * 0.9 + x) * 0.05; crown.rotation.x = Math.cos(t * 0.7 + z) * 0.04; });
    };
    const spots: [number, number][] = [[X0 + 8, -30], [X0 + 13, 4], [X0 + 9, 36], [-(X0 + 12), -44], [-(X0 + 16), 30], [X0 + 26, -54], [X0 + 30, 22], [-(X0 + 4), 58], [X0 + 5, 62], [-(X0 + 9), -66], [X0 + 20, 70], [X0 + 40, -20]];
    spots.slice(0, low ? 7 : 12).forEach(([x, z]) => palm(x, z, 22 + rnd() * 9, x > 0 && Math.abs(z) < 50));
    // umbrellas, towels and a lifeguard chair
    const umbrella = (x: number, z: number, a: string, b: string, near = false) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 8), M('#f2f2f2', 0.4));
      pole.position.y = 4;
      const top = new THREE.Mesh(new THREE.ConeGeometry(5, 1.8, 16, 1, true), new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide, roughness: 0.8,
        map: tex(256, 16, (c) => { for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? a : b; c.fillRect(k * 16, 0, 16, 16); } }),
      }));
      top.position.y = 7.6;
      top.castShadow = true;
      g.rotation.z = (rnd() - 0.5) * 0.2;
      const towel = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 6), M(a, 1));
      towel.position.set(2, 0.05, 1);
      towel.receiveShadow = true;
      g.add(pole, top, towel);
      add(g, near);
    };
    umbrella(-(X0 + 6), -18, '#FF5A5F', '#ffffff');
    umbrella(-(X0 + 10), 12, '#F4C430', '#ffffff');
    umbrella(-(X0 + 5), 34, '#00B4D8', '#ffffff');
    umbrella(X0 + 6, -44, '#7B2CBF', '#FFD166', true);
    umbrella(X0 + 7, 50, '#42D6A4', '#ffffff', true);
    const chair = new THREE.Group();
    chair.position.set(-(X0 + 3), 0, -HL - 4);
    const wood = M('#f4f1e8', 0.7);
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9, 0.3), wood);
      leg.position.set(lx, 4.5, lz);
      leg.rotation.z = -lx * 0.06;
      chair.add(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), wood);
    seat.position.y = 8.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3, 0.3), M('#FF5A5F', 0.7));
    back.position.set(0, 10.2, 1.7);
    chair.add(seat, back);
    chair.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    add(chair);
    stand(-(X0 + 5), 0, -Math.PI / 2, 26, 3, 0.8, M('#d9c7a3', 0.9));
    boards(-(Z0 + 2), '#00B4D8', '#ffffff');
    // pennants along the far side
    const flags: THREE.Mesh[] = [];
    for (let k = 0; k < 14; k++) {
      const z = -Z0 + (k / 13) * Z0 * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 6), M('#f2f2f2', 0.4));
      pole.position.set(-(X0 + 1.5), 4.5, z);
      add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3, 6, 1), new THREE.MeshStandardMaterial({ color: fanColors[k % 5], side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(-(X0 + 1.5), 8.2, z + 1.2);
      flag.rotation.y = Math.PI / 2;
      add(flag);
      flags.push(flag);
    }
    tickers.push((t) => {
      for (let k = 0; k < flags.length; k++) {
        const p = flags[k].geometry.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 6 + p.getX(i) * 2.2 + k) * 0.16 * (p.getX(i) + 1.2));
        p.needsUpdate = true;
      }
    });
    const island = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#3f7d4e', 1));
    island.scale.y = 0.35;
    island.position.set(-420, -2, -160);
    add(island);
  }

  function buildArena() {
    const concrete = M('#1b2130', 0.9);
    const rows = low ? 7 : 10;
    stand(-(X0 + 4), 0, -Math.PI / 2, Z0 * 2 + 30, rows, 0.93, concrete);
    stand(X0 + 4, 0, Math.PI / 2, Z0 * 2 + 30, rows, 0.93, concrete, true);
    // the ends sit back and start high, so the baseline cameras look under them
    for (const s of [1, -1]) stand(0, s * (Z0 + 46), s > 0 ? 0 : Math.PI, X0 * 2 + 40, rows, 0.93, concrete);
    // LED ribbon around the bowl
    const ribbon = tex(1024, 32, (g) => {
      g.fillStyle = '#05070c';
      g.fillRect(0, 0, 1024, 32);
      g.font = '900 24px ui-sans-serif, system-ui, sans-serif';
      g.textBaseline = 'middle';
      ['MAKE SOME NOISE', '★', 'DEFENSE', '★', 'LET’S GO', '★', 'KAN ARENA', '★'].forEach((w, k) => {
        g.fillStyle = ['#dcff3d', '#FF5A5F', '#00B4D8', '#ffffff'][k % 4];
        g.fillText(w, 20 + k * 128, 17);
      });
    });
    ribbon.wrapS = THREE.RepeatWrapping;
    const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbon, fog: false });
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(Z0 * 2 + 30, 1.6), ribbonMat);
      r.rotation.y = -sx * Math.PI / 2;
      r.position.set(sx * (X0 + 4.2 + rows * 2.3), rows * 1.25 + 2.4, 0);
      add(r, sx > 0);
    }
    tickers.push((t) => { ribbon.offset.x = t * 0.05; });
    boards(-(Z0 + 2.5), '#dcff3d', '#0b1424');
    boards(Z0 + 2.5, '#0b1424', '#dcff3d');
    // roof trusses, the scoreboard cube and the spotlights
    const truss = M('#232a36', 0.5, { metalness: 0.7 });
    for (let k = -2; k <= 2; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(170, 1.2, 1.2), truss);
      beam.position.set(0, 62, k * 26);
      add(beam);
    }
    const cube = new THREE.Group();
    cube.position.set(0, 44, 0);
    const screen = tex(256, 128, (g) => {
      const grad = g.createLinearGradient(0, 0, 256, 128);
      grad.addColorStop(0, '#FF5A5F');
      grad.addColorStop(1, '#00B4D8');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#ffffff';
      g.font = '900 54px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(spec.sport === 'volleyball' ? 'SPIKE!' : spec.sport === 'soccer' ? 'GOAL!' : 'DINK!', 128, 66);
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 14), [0, 1, 2, 3, 4, 5].map((k) => (k === 2 || k === 3 ? M('#0b0f18', 0.6) : new THREE.MeshBasicMaterial({ map: screen, fog: false }))));
    cube.add(body);
    for (const [cx, cz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 15, 5), truss);
      cable.position.set(cx, 11, cz);
      cube.add(cable);
    }
    add(cube);
    const cone = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const spots: THREE.Mesh[] = [];
    for (const [x, z] of [[-40, -44], [40, -44], [-40, 44], [40, 44], [-46, 0], [46, 0]] as [number, number][]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(15, 66, 20, 1, true), cone);
      beam.position.set(x * 0.5, 31, z * 0.5);
      beam.lookAt(x, 64, z);
      beam.rotateX(-Math.PI / 2);
      add(beam, x > 20);
      spots.push(beam);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff8e8', fog: false }));
      lamp.position.set(x, 62, z);
      add(lamp);
      sprite(glowTex('rgba(255,244,220,0.9)', 'rgba(255,244,220,0)'), x, 62, z, 16, 16, true);
    }
    tickers.push((t) => { cone.opacity = 0.04 + excitement * 0.05 + Math.sin(t * 2) * 0.004; });
    // championship banners
    for (let k = 0; k < 8; k++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), new THREE.MeshStandardMaterial({ color: fanColors[k % fanColors.length], roughness: 0.9, side: THREE.DoubleSide }));
      b.position.set(-56 + k * 16, 54, -(Z0 + 70));
      add(b);
    }
  }

  function buildRooftop() {
    // the roof itself: parapet, vents, a water tower, planters
    const wall = M('#3a3f4b', 0.9);
    const edgeX = X0 + 12;
    const edgeZ = Z0 + 26;
    box(0.9, 3.4, edgeZ * 2, wall, -edgeX, 1.7, 0);
    box(0.9, 3.4, edgeZ * 2, wall, edgeX, 1.7, 0, true);
    box(edgeX * 2, 3.4, 0.9, wall, 0, 1.7, -edgeZ);
    const steel = M('#7d8794', 0.4, { metalness: 0.7 });
    for (const [x, z] of [[-(X0 + 6), -(Z0 + 14)], [X0 + 7, Z0 + 12]] as [number, number][]) {
      box(6, 4, 5, steel, x, 2, z, x > 0);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 16), M('#2a3038', 0.6));
      fan.position.set(x, 4.3, z);
      add(fan, x > 0);
    }
    const tower = new THREE.Group();
    tower.position.set(-(X0 + 6), 0, Z0 + 12);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 8, 20), M('#6b4a32', 0.9));
    tank.position.y = 14;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3, 20), M('#3b2a1e', 0.9));
    cap.position.y = 19.5;
    tower.add(tank, cap);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 6), M('#2a3038', 0.6));
      leg.position.set(lx, 5, lz);
      tower.add(leg);
    }
    tower.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    add(tower);
    for (let k = 0; k < 6; k++) {
      const z = -Z0 + 6 + k * ((Z0 * 2 - 12) / 5);
      box(2.4, 1.6, 2.4, M('#5a4636', 0.9), -(X0 + 2), 0.8, z);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10), M('#2f6b3a', 1));
      bush.position.set(-(X0 + 2), 2.6, z);
      bush.castShadow = true;
      add(bush);
    }
    stand(-(X0 + 5.5), 0, -Math.PI / 2, 30, 2, 0.85, M('#4a4f5c', 0.8));
    bench(X0 - 2, -HL * 0.4, -Math.PI / 2, true);
    bench(X0 - 2, HL * 0.4, -Math.PI / 2, true);
    boards(-(Z0 + 2), '#ff3fa4', '#141a33');
    // string lights on poles around the court
    const bulbs: THREE.Mesh[] = [];
    const bulbGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const poles: [number, number][] = [[-(X0 - 1), -(Z0 - 2)], [X0 - 1, -(Z0 - 2)], [X0 - 1, Z0 - 2], [-(X0 - 1), Z0 - 2]];
    poles.forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 17, 8), M('#20242c', 0.5, { metalness: 0.5 }));
      pole.position.set(x, 8.5, z);
      pole.castShadow = true;
      add(pole, x > 0);
    });
    const wire: number[] = [];
    const runs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
    runs.forEach(([a, b], r) => {
      const [x1, z1] = poles[a];
      const [x2, z2] = poles[b];
      const n = r < 4 ? 18 : 26;
      let px = x1;
      let py = 17;
      let pz = z1;
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        const x = x1 + (x2 - x1) * u;
        const z = z1 + (z2 - z1) * u;
        const y = 17 - Math.sin(u * Math.PI) * (r < 4 ? 2.6 : 4.2);
        wire.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
        if (k < n) {
          const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: ['#ffe9b0', '#ffb3de', '#b0f4ff'][k % 3], fog: false }));
          bulb.position.set(x, y - 0.25, z);
          add(bulb, r === 1);
          bulbs.push(bulb);
        }
      }
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#0c0e14' })));
    tickers.push((t) => { bulbs.forEach((b, k) => b.scale.setScalar(1 + Math.sin(t * 3 + k * 1.7) * 0.18 + excitement * 0.5)); });
    const warm = new THREE.PointLight('#ffd9a0', 260, 90, 1.6);
    warm.position.set(0, 16, 0);
    add(warm);
    // a neon sign on the far wall
    const neon = new THREE.Group();
    neon.position.set(0, 9.5, -(edgeZ - 0.6));
    const tube = (pts: [number, number][], color: string) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)));
      neon.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.16, 6), new THREE.MeshBasicMaterial({ color, fog: false })));
    };
    tube([[-9, -2], [-9, 2], [-9, 0], [-6.5, 2], [-9, 0], [-6.5, -2]], '#ff3fa4');
    tube([[-4.5, -2], [-3, 2], [-1.5, -2], [-2.2, -0.4], [-3.8, -0.4]], '#7df9ff');
    tube([[0.5, -2], [0.5, 2], [3.5, -2], [3.5, 2]], '#dcff3d');
    tube([[6, 1.6], [7.2, 2.2], [8.4, 1.6], [7.2, 0.6], [8.4, -0.6], [7.2, -2.2], [6, -1.6]], '#ff3fa4');
    add(neon);
    sprite(glowTex('rgba(255,63,164,0.35)', 'rgba(255,63,164,0)'), 0, 9.5, -(edgeZ - 1.5), 40, 14, true);
    // the city
    const windows = tex(64, 128, (g) => {
      g.fillStyle = '#0b0e18';
      g.fillRect(0, 0, 64, 128);
      const r2 = seeded(21);
      for (let y = 4; y < 128; y += 8) {
        for (let x = 4; x < 64; x += 8) {
          const v = r2();
          if (v < 0.42) continue;
          g.fillStyle = v > 0.93 ? '#9fe8ff' : v > 0.8 ? '#ffd58a' : '#ffefc2';
          g.globalAlpha = 0.5 + r2() * 0.5;
          g.fillRect(x, y, 4.5, 4.5);
        }
      }
    });
    windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
    const n = low ? 60 : 130;
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#10131d', roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: windows, emissiveIntensity: 1.3, map: windows }), n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 150 + rnd() * 230;
      const w = 22 + rnd() * 30;
      const h = 60 + rnd() * rnd() * 260;
      m4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 90, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
      city.setMatrixAt(i, m4);
    }
    add(city);
    // we're high up: the "ground" is the roof, and it ends
    ground.scale.set((edgeX * 2) / 1200, (edgeZ * 2) / 1200, 1);
  }

  // the crowd, seated wherever the venue put stands
  let bodies: THREE.InstancedMesh | null = null;
  let heads: THREE.InstancedMesh | null = null;
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  if (fans.length) {
    bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }), fans.length);
    heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), fans.length);
    const col = new THREE.Color();
    fans.forEach((_f, i) => {
      bodies!.setColorAt(i, col.set(fanColors[Math.floor(rnd() * fanColors.length)]));
      heads!.setColorAt(i, col.set(skins[Math.floor(rnd() * skins.length)]));
    });
    bodies.frustumCulled = false;
    heads.frustumCulled = false;
    add(bodies);
    add(heads);
  }
  let excitement = 0;
  let crowdT = 0;
  const seatCrowd = (t: number) => {
    if (!bodies || !heads) return;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      // a few always fidget; everyone bounces when it gets loud
      const amp = 0.05 + excitement * (0.5 + (i % 5) * 0.14);
      const up = Math.abs(Math.sin(t * f.f * (0.4 + excitement * 0.6) + f.ph)) * amp + excitement * 0.5;
      s3.set(1, f.h, 1);
      m4.compose(v3.set(f.x, f.y + 0.75 * f.h + up, f.z), q0, s3);
      bodies.setMatrixAt(i, m4);
      m4.compose(v3.set(f.x, f.y + 1.75 * f.h + up, f.z), q0, s3.set(1, 1, 1));
      heads.setMatrixAt(i, m4);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  seatCrowd(0);

  return {
    id, nearSide, sand, dust: L.dust, exposure: L.exposure, bloom: L.bloom, kitchenMats,
    cheer(amount) { excitement = Math.min(1, Math.max(excitement, amount)); },
    update(t, dt) {
      excitement = Math.max(0, excitement - dt * 0.42);
      for (const tick of tickers) tick(t, dt);
      // the crowd doesn't need 60 fps
      crowdT += dt;
      if (crowdT > (low ? 0.066 : 0.033)) { crowdT = 0; seatCrowd(t); }
    },
  };
}

/**
 * Soccer's furniture: a goal at each end (posts, crossbar, a net you can see the ball
 * hit) and boards all the way round, which the ball comes back off. Above the boards, a
 * see-through panel so the cage reads as a cage without hiding the play.
 */
function buildGoals(spec: CourtSpec, id: VenueId, add: <T extends THREE.Object3D>(o: T, near?: boolean) => T) {
  const G = spec.goal!;
  const HW = spec.halfWidth;
  const HL = spec.halfLength;
  const frame = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.3, metalness: 0.4 });
  const netTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    for (let k = 0; k <= 64; k += 16) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.stroke();
      g.beginPath(); g.moveTo(0, k); g.lineTo(64, k); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const netMat = (rx: number, ry: number) => {
    const t = netTex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
  };
  for (const s of [1, -1]) {
    const z = s * HL;
    const r = 0.22;
    for (const sx of [1, -1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, G.h, 14), frame);
      post.position.set(sx * G.half, G.h / 2, z);
      post.castShadow = true;
      add(post, sx > 0);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, G.half * 2 + r * 2, 14), frame);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, G.h, z);
    bar.castShadow = true;
    add(bar);
    // the net: back, roof, sides
    const back = new THREE.Mesh(new THREE.PlaneGeometry(G.half * 2, G.h), netMat(G.half * 2 / 1.2, G.h / 1.2));
    back.position.set(0, G.h / 2, z + s * G.depth);
    add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(G.half * 2, G.depth), netMat(G.half * 2 / 1.2, G.depth / 1.2));
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, G.h, z + s * G.depth / 2);
    add(roof);
    for (const sx of [1, -1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(G.depth, G.h), netMat(G.depth / 1.2, G.h / 1.2));
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * G.half, G.h / 2, z + s * G.depth / 2);
      add(side, sx > 0);
    }
  }
  // the boards: low and solid, in the venue's colors, then clear panels above
  const boardColor = id === 'beach' ? '#1f6fb2' : id === 'rooftop' ? '#3b2d6e' : id === 'arena' ? '#1d3557' : '#e9e6dc';
  const trim = id === 'rooftop' ? '#7df9ff' : id === 'beach' ? '#ffd23f' : '#ff5a5f';
  const boardMat = new THREE.MeshStandardMaterial({ color: boardColor, roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, emissive: id === 'rooftop' ? trim : '#000000', emissiveIntensity: id === 'rooftop' ? 0.6 : 0 });
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const H = 3.2;
  const panel = (w: number, x: number, z: number, along: 'x' | 'z', near = false) => {
    const t = 0.35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? w : t, H, along === 'x' ? t : w), boardMat);
    b.position.set(x, H / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    add(b, near);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? w : t + 0.05, 0.18, along === 'x' ? t + 0.05 : w), trimMat);
    cap.position.set(x, H + 0.09, z);
    add(cap, near);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.5), glass);
    if (along === 'z') g.rotation.y = Math.PI / 2;
    g.position.set(x, H + 0.18 + 2.25, z);
    add(g, near);
  };
  const t2 = 0.35 / 2;
  panel(HL * 2 + 0.7, HW + t2, 0, 'z', true);
  panel(HL * 2 + 0.7, -HW - t2, 0, 'z');
  for (const s of [1, -1]) {
    const w = HW - G.half - 0.25;
    panel(w, G.half + 0.25 + w / 2, s * (HL + t2), 'x', true);
    panel(w, -(G.half + 0.25 + w / 2), s * (HL + t2), 'x');
  }
}

function buildNet(spec: CourtSpec, id: VenueId, add: <T extends THREE.Object3D>(o: T, near?: boolean) => T) {
  const vb = spec.sport === 'volleyball';
  const PX = spec.postX;
  const top = vb ? spec.netHeight : 3.0;
  const bottom = vb ? spec.netHeight - 3.28 : 0.15;
  const sagAt = (x: number) => (vb ? top - 0.06 * (1 - (x / PX) ** 2) : 3.0 - (3.0 - spec.netHeight) * (1 - (x / PX) ** 2));
  const postMat = new THREE.MeshStandardMaterial({ color: vb ? '#d9dde3' : '#2a2f36', roughness: 0.35, metalness: 0.75 });
  for (const s of [1, -1]) {
    const h = top + (vb ? 0.9 : 0.2);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(vb ? 0.17 : 0.12, vb ? 0.19 : 0.14, h, 16), postMat);
    post.position.set(s * PX, h / 2, 0);
    post.castShadow = true;
    add(post, s > 0);
    const capM = new THREE.Mesh(new THREE.SphereGeometry(vb ? 0.2 : 0.14, 12, 8), postMat);
    capM.position.set(s * PX, h, 0);
    add(capM, s > 0);
    if (vb) {
      // padding around the post, and a referee stand on the far side
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5.6, 18), new THREE.MeshStandardMaterial({ color: s > 0 ? '#00B4D8' : '#FF5A5F', roughness: 0.7 }));
      pad.position.set(s * PX, 2.8, 0);
      pad.castShadow = true;
      add(pad, s > 0);
      if (s < 0 && id !== 'beach') {
        const standM = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5, metalness: 0.3 });
        const plat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), standM);
        plat.position.set(-PX - 2.6, 4.6, 0);
        plat.castShadow = true;
        add(plat);
        for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 6), standM);
          leg.position.set(-PX - 2.6 + lx, 2.3, lz);
          add(leg);
        }
      }
    } else {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.2), postMat);
      foot.position.set(s * PX, 0.07, 0);
      add(foot, s > 0);
    }
  }
  // the mesh: a knotted grid with see-through holes
  const cell = vb ? 0.33 : 0.22;
  const grid = tex(32, 32, (g) => {
    g.strokeStyle = vb ? 'rgba(20,22,28,0.95)' : 'rgba(18,20,24,0.92)';
    g.lineWidth = vb ? 3.2 : 3.6;
    g.strokeRect(0, 0, 32, 32);
  });
  grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
  grid.repeat.set(1 / cell, 1 / cell);
  const shape = new THREE.Shape();
  shape.moveTo(-PX, bottom);
  for (let x = -PX; x <= PX + 0.001; x += 0.5) shape.lineTo(x, sagAt(x));
  shape.lineTo(PX, bottom);
  shape.lineTo(-PX, bottom);
  const net = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: grid, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.9 }));
  net.castShadow = true;
  net.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: grid, alphaTest: 0.25 });
  add(net);
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#f6f2e6', roughness: 0.6 });
  const band = (y: (x: number) => number, r: number, m: THREE.Material = tapeMat) => {
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 14 }, (_, i) => {
      const x = -PX + (i / 13) * PX * 2;
      return new THREE.Vector3(x, y(x), 0);
    }));
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, r, 8, false), m);
    t.scale.z = 0.45;
    t.castShadow = true;
    add(t);
  };
  band(sagAt, vb ? 0.13 : 0.1);
  band(() => bottom, vb ? 0.07 : 0.04, vb ? tapeMat : new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.8 }));
  if (vb) {
    // side bands and the red-and-white antennas over each sideline
    const stripes = tex(8, 64, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#e63946'; g.fillRect(0, k * 8, 8, 8); } });
    for (const s of [1, -1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.18, top - bottom, 0.05), tapeMat);
      side.position.set(s * spec.halfWidth, (top + bottom) / 2, 0);
      add(side);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.9, 8), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }));
      ant.position.set(s * spec.halfWidth, bottom + 2.95 + 0.6, 0);
      add(ant);
    }
  } else {
    // the center strap that pulls a pickleball net down to 34 inches
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, spec.netHeight, 0.03), tapeMat);
    strap.position.set(0, spec.netHeight / 2, 0);
    add(strap);
  }
}
