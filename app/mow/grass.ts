// Clean Cut — the lawn itself.
//
// Two layers of real instanced blades (a dense one near the camera, a sparser wide one
// further out) plus a ground plane that carries the look into the distance. All three
// read the same state texture from the Field, so cutting a cell shortens its blades,
// tilts them the way you were driving, and shades them light or dark depending on
// which way you look at them — which is exactly how real lawn stripes work.

import * as THREE from 'three';
import type { Field } from './field';
import { RES } from './field';
import type { Quality, SiteDef } from './types';
import { grassBlockers } from './shapes';

export interface GrassUniforms {
  uState: { value: THREE.DataTexture };
  uStateBox: { value: THREE.Vector4 };
  uMask: { value: THREE.Texture };
  uMaskBox: { value: THREE.Vector4 };
  uTime: { value: number };
  uWind: { value: number };
  uPush: { value: THREE.Vector4[] };
  uHighlight: { value: number };
  uDetail: { value: THREE.Texture };
  uSunDir: { value: THREE.Vector3 };
}

/** GLSL shared by blades and ground: reading the lawn and colouring grass. */
const COMMON = /* glsl */ `
uniform sampler2D uState;
uniform vec4 uStateBox;
uniform sampler2D uMask;
uniform vec4 uMaskBox;
uniform float uTime;
uniform float uWind;
uniform float uHighlight;

// x: height class (1 uncut, else cut height 0..1), y: mowable, zw: stripe vector
vec4 lawnState(vec2 xz, out float inBox) {
  vec2 uv = (xz - uStateBox.xy) / uStateBox.zw;
  inBox = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 s = texture2D(uState, uv);
  return vec4(s.r, s.g, s.b * 2.0 - 1.0, s.a * 2.0 - 1.0);
}

float worldGrass(vec2 xz) {
  vec2 uv = (xz - uMaskBox.xy) / uMaskBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uMask, uv).r;
}

// neighbours' lawns: already mowed, with their own tidy stripes
vec2 neighbourStripe(vec2 xz) {
  float s = sin(xz.x * 3.14159 / 1.25 + 0.4);
  return vec2(0.0, s > 0.0 ? 0.42 : -0.42);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Base grass colours (linear). Cut turf is a deep, even green; long grass is lighter,
// patchier and goes olive at the tips.
vec3 cutGreen(vec2 xz) {
  float n = vnoise(xz * 0.45);
  return mix(vec3(0.052, 0.16, 0.026), vec3(0.075, 0.2, 0.034), n);
}
vec3 longGreen(vec2 xz) {
  float n = vnoise(xz * 0.6 + 7.0);
  return mix(vec3(0.085, 0.19, 0.03), vec3(0.15, 0.24, 0.045), n);
}

// how bright a patch looks given the blades' lean and where the camera is
float stripeLight(vec2 dirv, vec2 xz) {
  vec2 v = xz - cameraPosition.xz;
  float l = length(v);
  v = l > 0.001 ? v / l : vec2(0.0, 1.0);
  return dot(dirv, v);
}
`;

// ———————————————————————————————————————— blades

function bladeGeometry(segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const y = i / segments;
    const w = 1 - Math.pow(y, 1.4) * 0.92;
    pos.push(-0.5 * w, y, 0, 0.5 * w, y, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const top = segments * 2;
  idx.push((segments - 1) * 2, (segments - 1) * 2 + 1, top);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

interface Layer {
  mesh: THREE.Mesh;
  center: THREE.Vector2;
  tile: number;
}

function makeLayer(count: number, tile: number, segments: number, opts: { width: number; fadeNear: number; fadeFar: number; tileFade: number; seed: number }, uniforms: GrassUniforms): Layer {
  const base = bladeGeometry(segments);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('normal', base.getAttribute('normal'));
  const aPos = new Float32Array(count * 2);
  const aRnd = new Float32Array(count * 4);
  // jittered grid for even coverage
  const side = Math.ceil(Math.sqrt(count));
  const cell = tile / side;
  let s = opts.seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const gx = i % side;
    const gz = Math.floor(i / side);
    aPos[i * 2] = (gx + rnd()) * cell;
    aPos[i * 2 + 1] = (gz + rnd()) * cell;
    aRnd[i * 4] = rnd() * Math.PI * 2;
    aRnd[i * 4 + 1] = rnd();
    aRnd[i * 4 + 2] = rnd();
    aRnd[i * 4 + 3] = rnd();
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 2));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(aRnd, 4));
  geo.instanceCount = count;

  const center = new THREE.Vector2();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uCenter: { value: center },
      uTile: { value: tile },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${COMMON}
uniform vec2 uCenter;
uniform float uTile;
uniform vec4 uPush[4];
attribute vec2 aPos;
attribute vec4 aRnd;
varying vec3 vGrassCol;
varying float vHi;
`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
  vec2 tileBase = uCenter - vec2(uTile * 0.5);
  vec2 root = tileBase + mod(aPos - tileBase, vec2(uTile));
  vec2 jitter = vec2(hash12(root * 13.1), hash12(root * 7.7)) * 0.0;
  float camD = distance(root, cameraPosition.xz);
  float inBox;
  vec4 st = lawnState(root, inBox);
  float wg = worldGrass(root);
  float lawn = inBox * step(0.5, st.y);
  float grassHere = max(lawn, step(0.5, wg));
  float uncut = lawn * step(0.985, st.x);
  float cutH = clamp((st.x * 255.0 - 30.0) / 132.0, 0.0, 1.0);
  float H;
  vec2 stripe;
  if (lawn > 0.5) {
    if (uncut > 0.5) {
      H = 0.11 + 0.09 * aRnd.y + 0.04 * vnoise(root * 0.8);
      stripe = vec2(0.0);
    } else {
      H = mix(0.03, 0.085, cutH) * (0.8 + 0.4 * aRnd.y);
      stripe = st.zw;
    }
  } else {
    H = 0.05 * (0.8 + 0.4 * aRnd.y);
    stripe = neighbourStripe(root);
  }
  // dithered fades: by camera distance and toward the tile edge
  vec2 local = abs(root - uCenter) / (uTile * 0.5);
  float edgeFade = 1.0 - smoothstep(${opts.tileFade.toFixed(3)}, 1.0, max(local.x, local.y));
  float distFade = 1.0 - smoothstep(${opts.fadeNear.toFixed(2)}, ${opts.fadeFar.toFixed(2)}, camD);
  float keep = step(aRnd.w, edgeFade * distFade) * grassHere;
  H *= keep;

  // which way the blade leans
  float slen = length(stripe);
  vec2 rdir = vec2(cos(aRnd.x * 2.7), sin(aRnd.x * 2.7));
  vec2 leanDir = slen > 0.05 ? normalize(mix(rdir, stripe / slen, clamp(slen * 1.25, 0.0, 0.9))) : rdir;
  float lean = mix(0.18 + 0.35 * aRnd.z, 0.55 + 0.2 * aRnd.z, step(0.05, slen) * (1.0 - uncut));
  // wind: long grass moves a lot more
  float gust = sin(uTime * 1.3 + root.x * 0.35 + root.y * 0.22) * 0.5 + 0.5;
  float wv = sin(uTime * 3.1 + root.x * 1.9 + root.y * 1.3 + aRnd.x) * (0.25 + gust * 0.75);
  vec2 windV = vec2(0.8, 0.45) * wv * uWind * mix(0.25, 1.0, uncut);
  // pushed flat by wheels / boots
  vec2 push = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 dv = root - uPush[i].xy;
    float dl = length(dv);
    float infl = (1.0 - smoothstep(uPush[i].z * 0.4, uPush[i].z, dl)) * uPush[i].w;
    push += (dl > 0.001 ? dv / dl : vec2(0.0)) * infl;
  }
  float pushL = min(length(push), 1.0);
  vec2 bend = leanDir * lean + windV * 0.35 + push * 1.2;

  float bw = ${opts.width.toFixed(4)} * (0.75 + 0.5 * aRnd.z) * (1.0 + camD * 0.02) * (uncut > 0.5 ? 1.0 : 1.15);
  // blade faces across its lean, so we see its broad side bending over
  float fa = aRnd.x;
  vec2 across = vec2(cos(fa), sin(fa));
  vec3 bladeN = normalize(vec3(-across.y, 0.0, across.x));
  vec3 objectNormal = normalize(mix(bladeN, vec3(0.0, 1.0, 0.0), 0.62) + vec3(bend.x, 0.0, bend.y) * 0.2);

  // colour
  vec3 baseC = uncut > 0.5 ? longGreen(root) : cutGreen(root);
  baseC *= 0.86 + 0.28 * aRnd.w;
  float y = position.y;
  vec3 tipC = uncut > 0.5 ? mix(baseC * 1.35, vec3(0.32, 0.33, 0.1), 0.35 * aRnd.z) : baseC * 1.22;
  vec3 col = mix(baseC * 0.42, tipC, smoothstep(0.0, 1.0, y));
  float sl = stripeLight(stripe, root);
  col *= 1.0 + 0.42 * sl * (1.0 - uncut);
  vGrassCol = col;
  vHi = uncut * uHighlight * (0.55 + 0.45 * sin(uTime * 5.0 + root.x * 0.7 + root.y * 0.5));
`)
      .replace('#include <begin_vertex>', /* glsl */ `
  float yy = position.y;
  float curve = yy * yy;
  float flat_ = 1.0 - 0.55 * pushL;
  vec3 transformed = vec3(root.x, 0.0, root.y);
  transformed.xz += across * position.x * bw;
  transformed.xz += bend * curve * H;
  transformed.y = yy * H * flat_ * (1.0 - 0.25 * dot(bend, bend));
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGrassCol;
varying float vHi;
`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassCol;')
      .replace('#include <normal_fragment_begin>', `
float faceDirection = 1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.55, 0.42, 0.05) * vHi * 0.35;
`);
  };
  mat.customProgramCacheKey = () => `grass-${tile}-${opts.width}-${opts.fadeNear}`;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, center, tile };
}

// ———————————————————————————————————————— ground

function groundMaterial(uniforms: GrassUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec2 vXZ;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${COMMON}
uniform sampler2D uDetail;
varying vec2 vXZ;`)
      .replace('#include <color_fragment>', /* glsl */ `
  float inBox;
  vec4 st = lawnState(vXZ, inBox);
  float lawn = inBox * smoothstep(0.35, 0.65, st.y);
  float uncut = lawn * smoothstep(0.96, 0.995, st.x);
  float det = texture2D(uDetail, vXZ * 0.9).r * 0.6 + texture2D(uDetail, vXZ * 0.137).r * 0.4;
  vec2 stripe = mix(neighbourStripe(vXZ), st.zw, lawn);
  vec3 c = uncut > 0.5 ? longGreen(vXZ) * 0.78 : (uncut > 0.0 ? mix(cutGreen(vXZ), longGreen(vXZ) * 0.78, uncut) : cutGreen(vXZ));
  c *= 0.72 + 0.5 * det;
  c *= 1.0 + 0.46 * stripeLight(stripe, vXZ) * (1.0 - uncut);
  // bare soil peeks through where the grass ends
  float wg = worldGrass(vXZ);
  vec3 soil = vec3(0.09, 0.065, 0.04) * (0.7 + 0.6 * det);
  c = mix(soil, c, max(lawn, smoothstep(0.2, 0.8, wg)));
  float hl = uncut * uHighlight * (0.55 + 0.45 * sin(uTime * 5.0 + vXZ.x * 0.7 + vXZ.y * 0.5));
  c += vec3(0.25, 0.19, 0.02) * hl * 0.25;
  diffuseColor.rgb = c;
`);
  };
  mat.customProgramCacheKey = () => 'lawn-ground';
  return mat;
}

/** World mask: white where grass grows anywhere in the neighbourhood. Drawn with canvas. */
function worldMask(site: SiteDef): { tex: THREE.Texture; box: THREE.Vector4 } {
  const W = site.world;
  const ppm = 4;
  const cw = Math.ceil((W.x1 - W.x0) * ppm);
  const ch = Math.ceil((W.z1 - W.z0) * ppm);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  const tx = (x: number) => (x - W.x0) * ppm;
  const tz = (z: number) => (z - W.z0) * ppm;
  const b = grassBlockers(site);
  for (const p of b.polys) {
    ctx.beginPath();
    p.forEach(([x, z], i) => (i ? ctx.lineTo(tx(x), tz(z)) : ctx.moveTo(tx(x), tz(z))));
    ctx.closePath();
    ctx.fill();
  }
  for (const [x, z, r] of b.circles) {
    ctx.beginPath();
    ctx.arc(tx(x), tz(z), r * ppm, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [ax, az, bx, bz, r] of b.segs) {
    ctx.lineWidth = r * 2 * ppm;
    ctx.beginPath();
    ctx.moveTo(tx(ax), tz(az));
    ctx.lineTo(tx(bx), tz(bz));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return { tex, box: new THREE.Vector4(W.x0, W.z0, W.x1 - W.x0, W.z1 - W.z0) };
}

function detailTexture(): THREE.Texture {
  // tiling speckle: clumps of turf, a few darker gaps
  const n = 256;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  let s = 1234567;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const vals = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) vals[i] = rnd();
  // blur a little, wrapping, for clumps
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let acc = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += vals[((y + dy + n) % n) * n + ((x + dx + n) % n)];
      out[y * n + x] = acc / 9 * 0.6 + vals[y * n + x] * 0.4;
    }
  }
  for (let i = 0; i < n * n; i++) {
    const v = Math.max(0, Math.min(255, Math.round((out[i] - 0.5) * 2.2 * 128 + 128)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

const COUNTS: Record<Quality, [number, number]> = {
  low: [55_000, 35_000],
  medium: [110_000, 65_000],
  high: [260_000, 150_000],
  ultra: [420_000, 240_000],
};

export class Lawn {
  readonly group = new THREE.Group();
  readonly uniforms: GrassUniforms;
  private near: Layer;
  private far: Layer;
  private stateTex: THREE.DataTexture;
  private field: Field;

  constructor(site: SiteDef, field: Field, quality: Quality) {
    this.field = field;
    this.stateTex = new THREE.DataTexture(field.tex, field.w, field.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.stateTex.minFilter = THREE.LinearFilter;
    this.stateTex.magFilter = THREE.LinearFilter;
    this.stateTex.generateMipmaps = false;
    this.stateTex.colorSpace = THREE.NoColorSpace;
    this.stateTex.needsUpdate = true;
    const mask = worldMask(site);
    this.uniforms = {
      uState: { value: this.stateTex },
      uStateBox: { value: new THREE.Vector4(field.x0, field.z0, field.w / RES, field.h / RES) },
      uMask: { value: mask.tex },
      uMaskBox: { value: mask.box },
      uTime: { value: 0 },
      uWind: { value: 1 },
      uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uHighlight: { value: 0 },
      uDetail: { value: detailTexture() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    };
    const [nNear, nFar] = COUNTS[quality];
    this.near = makeLayer(nNear, 22, 4, { width: 0.016, fadeNear: 9, fadeFar: 12.5, tileFade: 0.8, seed: 11 }, this.uniforms);
    this.far = makeLayer(nFar, 66, 3, { width: 0.03, fadeNear: 22, fadeFar: 32, tileFade: 0.85, seed: 97 }, this.uniforms);
    this.group.add(this.near.mesh, this.far.mesh);

    const W = site.world;
    const pad = 260;
    const groundGeo = new THREE.PlaneGeometry(W.x1 - W.x0 + pad * 2, W.z1 - W.z0 + pad * 2, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMaterial(this.uniforms));
    ground.position.set((W.x0 + W.x1) / 2, 0, (W.z0 + W.z1) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  /** Recentre the blade tiles ahead of the camera. */
  update(time: number, camPos: THREE.Vector3, camDir: THREE.Vector3) {
    this.uniforms.uTime.value = time;
    const fx = camDir.x;
    const fz = camDir.z;
    const fl = Math.hypot(fx, fz) || 1;
    this.near.center.set(camPos.x + (fx / fl) * 8, camPos.z + (fz / fl) * 8);
    this.far.center.set(camPos.x + (fx / fl) * 22, camPos.z + (fz / fl) * 22);
    if (this.field.dirty) {
      this.stateTex.needsUpdate = true;
      this.field.dirty = false;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    this.stateTex.dispose();
    this.uniforms.uMask.value.dispose();
    this.uniforms.uDetail.value.dispose();
  }
}
