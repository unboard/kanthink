/**
 * Kanthink game kit, v1. Apps import it as 'kit/game'.
 *
 * The shared pieces small browser games are built from: a world that fits any screen,
 * a posed stick figure with an animation queue, ink drawing helpers, particles, popups
 * and screen shake, a synthesized sound engine, and the test modes (?bot, ?autoplay,
 * ?still) that let a game be played and checked without a person.
 *
 * Adapted from goofyfish (https://github.com/nilbuild/goofyfish,
 * .claude/skills/game/references/snippets.js), MIT License, Copyright (c) 2026 Kamran
 * Ahmed. Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal in the
 * Software without restriction, including without limitation the rights to use, copy,
 * modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions: The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software. THE SOFTWARE IS
 * PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 *
 * Changes from the original: globals became module state and factories that take the
 * 2D context, so several canvases can share it; colors are parameters rather than a
 * fixed house palette; storage goes through window.kanthinkData when it's there.
 *
 * Contract: the API documented in lib/playground/skills/game.ts (GAME_PROMPT). Change
 * one, change the other. Versioned by filename, never edited in a way that breaks an
 * app already built against it.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

export const lerp = (a, b, k) => a + (b - a) * k;
export const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const EASE = {
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  lin: (k) => k,
  soft: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
};

/** A seeded random number generator: rng(seed)() → [0, 1). Same seed, same game. */
export function rng(seed) {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Roughly normal noise in about [-1, 1], from a generator. */
export function gauss(r) {
  return (r() + r() + r() - 1.5) / 1.5;
}

// ── Fitting the world to any screen ────────────────────────────────────────
// Design the game in fixed world units (a view box), then scale it to the screen,
// leaving room for the HUD. Portrait phones can't fit a wide world at a readable size,
// so they show at least minW units centered on focusX, and the rest scrolls into view.

/**
 * fitView({ x0, x1, y0, y1, minW, focusX }, { width, height, top, bottom, maxScale })
 * → { s, x, y, dpr, w, h }. Then: applyCam(ctx, cam, shakeX, shakeY) and draw in world units.
 */
export function fitView(view, opts = {}) {
  const w = opts.width ?? window.innerWidth;
  const h = opts.height ?? window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const narrow = w < h;
  const top = opts.top ?? (narrow ? 150 : 110);
  const bottom = opts.bottom ?? 64;
  const maxS = opts.maxScale ?? 1.75;
  const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
  const minW = view.minW ?? vw;
  const fitH = (h - top - bottom) / vh;
  const s = narrow ? Math.min(fitH, w / minW, maxS) : Math.min((w - 120) / vw, fitH, maxS);
  const center = narrow && view.focusX != null ? view.focusX : (view.x0 + view.x1) / 2;
  return {
    s, dpr, w, h,
    x: w / 2 - center * s,
    y: top + (h - top - bottom - vh * s) * (narrow ? 0.85 : 0.6) - view.y0 * s,
  };
}
/** Size a canvas to its CSS box at device resolution. Call on resize, before fitView. */
export function sizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  return { width: r.width, height: r.height, dpr };
}
export function applyCam(ctx, cam, sx = 0, sy = 0) {
  ctx.setTransform(cam.dpr * cam.s, 0, 0, cam.dpr * cam.s, cam.dpr * (cam.x + sx), cam.dpr * (cam.y + sy));
}
/** Screen point (CSS pixels) → world point. */
export function toWorld(cam, px, py) {
  return [(px - cam.x) / cam.s, (py - cam.y) / cam.s];
}
/** The world x range that's on screen, for spawning things just off the edge and keeping popups in view. */
export function visibleX(cam) {
  return [-cam.x / cam.s, (cam.w - cam.x) / cam.s];
}

// ── Stick figure ───────────────────────────────────────────────────────────
// Poses are joint positions in figure space: facing right, feet near y = -8, head near
// y = -121. Draw at (x, groundY + 8) so the feet touch the ground. Make new poses with
// mk({...}) by moving a few joints of an existing one; play them with an Actor.
// `ax` is a prop angle in radians (0 forward, -PI/2 straight up) that blends like a joint.

const THIGH = 30, SHIN = 30, UARM = 21, FARM = 21;
const LIMB = 5, ARM = 4.2, TORSO = 8.5, HEAD_R = 7.8;
const BASE = {
  face: 1, ax: 0,
  head: [0, -121], chest: [0, -96], hip: [0, -65],
  fF: [1, -8], fB: [-4, -8], kF: [22, -38], kB: [10, -38],
  hF: [3, -57], hB: [-1, -57], eF: [-6, -78], eB: [-6, -78],
};
export const mk = (o, base = BASE) => Object.assign({}, base, o);
export const P = {};
P.stand = mk({});
P.ready = mk({ head: [2, -121], hF: [15, -84], eF: [5, -71], hB: [-4, -56], eB: [-6, -77] });
P.crouch = mk({ head: [6, -100], chest: [4, -76], hip: [-2, -46], kF: [24, -30], kB: [12, -28], hF: [16, -60], eF: [10, -56], hB: [-8, -52], eB: [-8, -60] });
P.leap = mk({ head: [4, -124], chest: [2, -99], hip: [0, -68], fF: [14, -30], fB: [-14, -26], kF: [20, -52], kB: [-2, -48], hF: [18, -140], eF: [16, -120], hB: [-14, -134], eB: [-12, -116] });
P.cheer = mk({ head: [0, -122], chest: [0, -97], hip: [0, -67], hF: [16, -136], hB: [-12, -134], eF: [14, -118], eB: [-12, -116] });
P.wince = mk({ head: [-3, -118], chest: [-2, -94], hip: [0, -65], kF: [20, -37], hF: [7, -125], eF: [19, -111], hB: [-7, -125], eB: [-20, -109] });
P.phew = mk({ head: [-1, -120], chest: [-1, -95], hip: [0, -65], hF: [13, -80], eF: [4, -68], hB: [2, -122], eB: [-14, -106] });
P.punch = mk({ head: [8, -118], chest: [6, -94], hip: [0, -64], kF: [24, -36], kB: [-8, -34], fF: [18, -8], fB: [-16, -8], hF: [44, -98], eF: [26, -96], hB: [2, -88], eB: [-6, -78] });

const PTS = ['head', 'chest', 'hip', 'fF', 'fB', 'kF', 'kB', 'hF', 'hB', 'eF', 'eB'];

// Joints only bend the way real ones do: an elbow folds the forearm toward the front of
// the body, a knee folds the shin back.
const ARM_BEND = -1, KNEE_BEND = 1;
function ik(a, b, l1, l2, hint, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const L = l1 + l2, soft = L * 0.96;
  if (d > soft) d = soft + (L - soft) * (1 - Math.exp(-(d - soft) / (L - soft)));
  d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(L - 0.001, d));
  const c = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const ang = Math.acos(c);
  const j1 = [a[0] + l1 * Math.cos(base + ang), a[1] + l1 * Math.sin(base + ang)];
  const j2 = [a[0] + l1 * Math.cos(base - ang), a[1] + l1 * Math.sin(base - ang)];
  if (bend) {
    const side = (j) => (j[0] - a[0]) * (b[1] - j[1]) - (j[1] - a[1]) * (b[0] - j[0]);
    return Math.sign(side(j1)) === bend ? j1 : j2;
  }
  const d1 = Math.hypot(j1[0] - hint[0], j1[1] - hint[1]);
  const d2 = Math.hypot(j2[0] - hint[0], j2[1] - hint[1]);
  return d1 < d2 ? j1 : j2;
}
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function pathPose(list, u) {
  const n = list.length - 1;
  const x = Math.min(n - 1e-6, Math.max(0, u * n));
  const i = Math.floor(x), t = x - i;
  const a = list[Math.max(0, i - 1)], b = list[i], c = list[i + 1], d = list[Math.min(n, i + 2)];
  const o = Object.assign({}, c, { face: lerp(b.face, c.face, t), hang: lerp(b.hang ?? 1, c.hang ?? 1, t), ax: lerp(b.ax ?? 0, c.ax ?? 0, t) });
  for (const k of PTS) o[k] = [catmull(a[k][0], b[k][0], c[k][0], d[k][0], t), catmull(a[k][1], b[k][1], c[k][1], d[k][1], t)];
  return o;
}

/**
 * Plays queued pose steps: actor.push({ pose: P.crouch, d: 0.12 }, { pose: P.leap, d: 0.2, ez: 'out' }).
 * A step can be { path: [P.a, P.b], d } to curve through several poses (a swing over the
 * head), or { fn: () => {} } to run code at that point. Call actor.update(dt) every frame.
 */
export class Actor {
  constructor(pose) {
    this.pose = pose || P.ready;
    this.q = [];
    this.step = null;
    this.t = 0;
    this.id = Math.random().toString(36).slice(2);
  }
  push(...steps) { this.q.push(...steps); }
  clear() { this.q = []; this.step = null; }
  get idle() { return !this.step && !this.q.length; }
  update(dt) {
    for (let guard = 0; guard < 20; guard++) {
      if (!this.step) {
        if (!this.q.length) return;
        this.step = this.q.shift();
        this.t = 0;
        if (this.step.fn) {
          const fn = this.step.fn;
          this.step = null;
          fn();
          continue;
        }
        const targets = this.step.path || (this.step.pose ? [this.step.pose] : [this.pose]);
        this.step.list = [this.pose, ...targets];
      }
      this.t += dt;
      const s = this.step;
      const k = Math.min(1, this.t / s.d);
      this.pose = pathPose(s.list, (EASE[s.ez] || EASE.soft)(k));
      if (k < 1) return;
      dt = this.t - s.d;
      this.step = null;
    }
  }
}

function relax(sh, t, amount) {
  const dx = t[0] - sh[0], dy = t[1] - sh[1];
  const d = Math.hypot(dx, dy);
  const want = (UARM + FARM) * 0.96;
  if (dy <= 0 || d < 1 || d >= want) return t;
  const w = (amount ?? 1) * Math.min(1, Math.max(0, (dy / d - 0.8) / 0.18));
  const k = w * w * (3 - 2 * w);
  const nd = d + (want - d) * k;
  return [sh[0] + (dx / d) * nd, sh[1] + (dy / d) * nd];
}
function reach(a, b, max) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  if (d <= max) return b;
  return [a[0] + (dx / d) * max, a[1] + (dy / d) * max];
}
function breathe(p, amt) {
  if (!amt) return p;
  const o = Object.assign({}, p);
  const up = (v, k) => [v[0], v[1] - amt * k];
  o.head = up(p.head, 1);
  o.chest = up(p.chest, 0.85);
  o.hF = up(p.hF, 0.6);
  o.hB = up(p.hB, 0.6);
  return o;
}
const prevJ = {};
function mirrorJoint(a, b, j) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1;
  const t = ((j[0] - a[0]) * dx + (j[1] - a[1]) * dy) / L2;
  const px = a[0] + dx * t, py = a[1] + dy * t;
  return [2 * px - j[0], 2 * py - j[1]];
}
function ikC(key, a, b, l1, l2, hint, bend) {
  const j = ik(a, b, l1, l2, hint, bend);
  if (bend) { prevJ[key] = j; return j; }
  const pj = prevJ[key];
  if (pj) {
    const alt = mirrorJoint(a, b, j);
    const dj = Math.hypot(j[0] - pj[0], j[1] - pj[1]);
    const da = Math.hypot(alt[0] - pj[0], alt[1] - pj[1]);
    const dh = Math.hypot(j[0] - hint[0], j[1] - hint[1]) - Math.hypot(alt[0] - hint[0], alt[1] - hint[1]);
    if (da + 1.5 < dj && Math.abs(dh) < 4) { prevJ[key] = alt; return alt; }
  }
  prevJ[key] = j;
  return j;
}

/**
 * Body styles. classic: solid head, thick torso, gray far limbs. doodle: big hollow head
 * with line eyes. doodleshirt: doodle in a shirt (opts.shirt colors it; teams). sketch:
 * wobbly pen lines that redraw. chunky: thick limbs, mitten hands, boots. googly: big
 * head with googly eyes.
 */
export const FIGURE_STYLES = {
  classic: { head: 1, arm: 1, leg: 1, torso: TORSO },
  doodle: { head: 1.75, arm: 1, leg: 0.92, torso: 4.8, hollow: true, sameFar: true, eyes: true },
  doodleshirt: { head: 1.75, arm: 1, leg: 0.92, torso: 4.8, hollow: true, sameFar: true, eyes: true, shirt: true },
  sketch: { head: 1.6, arm: 0.78, leg: 0.74, torso: 3.6, hollow: true, sameFar: true, sketch: true },
  chunky: { head: 1.15, arm: 1.45, leg: 1.45, torso: TORSO * 1.3, mitts: true },
  googly: { head: 1.6, arm: 1, leg: 1, torso: TORSO, googly: true },
};

// The context the figure is being drawn on, set for the length of one drawFigure call.
let ctx = null;
let SK = null;
function jit(i) {
  const v = Math.sin((SK ? SK.seed : 0) * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v) - 0.5;
}
function sketchStroke(pts, w) {
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass ? w * 0.55 : w;
    ctx.globalAlpha = pass ? 0.55 : 1;
    ctx.beginPath();
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const off = jit(s * 10 + i + pass * 50) * (pass ? 1.6 : 0.9) * Math.sin(t * Math.PI + 0.3);
        const ext = pass && s === 0 && i === 0 ? -2 : pass && s === pts.length - 2 && i === 4 ? 2 : 0;
        const px = a[0] + dx * t + nx * off + (dx / L) * ext, py = a[1] + dy * t + ny * off + (dy / L) * ext;
        if (s === 0 && i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function strokePath(pts, w, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (SK) { sketchStroke(pts, w); return; }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function figFill(fill, lw, stroke, paper) {
  if (fill) { ctx.fillStyle = fill === 'paper' ? paper : fill; ctx.fill(); }
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function figSeg(a, b, w, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}
function drawShirt(p, u, n, J, fill) {
  const c = p.chest, h = p.hip;
  const pt = (b, side, w, along) => [b[0] + n[0] * side * w + u[0] * along, b[1] + n[1] * side * w + u[1] * along];
  ctx.beginPath();
  const q = [pt(c, 1, 6.5, 1), pt(c, -1, 6.5, 1), pt(h, -1, 9.5, -8), pt(h, 1, 9.5, -8)];
  ctx.moveTo(q[0][0], q[0][1]);
  for (const v of q.slice(1)) ctx.lineTo(v[0], v[1]);
  ctx.closePath();
  figFill(fill, 2 * J.m, J.ink);
  figSeg(pt(h, 1, 8, 6), pt(h, -1, 8, 6), 2 * J.m, J.ink);
}
function drawMitt(h, col, m, paper) {
  ctx.beginPath();
  ctx.arc(h[0], h[1], 4.8, 0, Math.PI * 2);
  figFill(paper, 2.2 * m, col);
}
function drawBoot(f, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(f[0] + 3.5, f[1] + 1.5, 7.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawHead(B, hc, hr, ink, m, paper) {
  ctx.beginPath();
  if (B.sketch) {
    const a0 = jit(5) * 3;
    for (let i = 0; i <= 26; i++) {
      const a = a0 + (i / 24) * Math.PI * 2;
      const r = hr * (1 + 0.06 * Math.sin(a * 3 + SK.seed));
      ctx[i ? 'lineTo' : 'moveTo'](hc[0] + Math.cos(a) * r, hc[1] + Math.sin(a) * r);
    }
    figFill(paper, 2.4 * m, ink);
    return;
  }
  ctx.arc(hc[0], hc[1], hr, 0, Math.PI * 2);
  if (!B.hollow) { ctx.fillStyle = ink; ctx.fill(); }
  else figFill(paper, 3.6 * m, ink);
  if (B.eyes) {
    const y0 = hc[1] - hr * 0.22, y1 = hc[1] + hr * 0.12;
    figSeg([hc[0] + hr * 0.12, y0], [hc[0] + hr * 0.12, y1], 2.6 * m, ink);
    figSeg([hc[0] + hr * 0.52, y0], [hc[0] + hr * 0.52, y1], 2.6 * m, ink);
  }
  if (B.googly) {
    const r = hr * 0.34;
    for (const [ex, ey] of [[hc[0] + hr * 0.02, hc[1] - hr * 0.18], [hc[0] + hr * 0.6, hc[1] - hr * 0.12]]) {
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      figFill('#fff', 1.1 * m, ink);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(ex + r * 0.38, ey + r * 0.1, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * drawFigure(ctx, actor, x, y, opts) draws an Actor (or anything with a .pose) at a world point.
 * opts: { style, flip, scale, ink, far, paper, shirt, breath, lw, rot, pivot, seed, live,
 * under(J), mid(J), over(J) }. flip faces left; ink/far recolor (draw enemies in gray);
 * paper is the fill behind hollow heads (the game's background); breath is a small idle
 * bob in units; rot/pivot tip the body (falls, rolls); live: false for one-off drawings.
 * under/mid/over draw props behind the body, behind the front arm, and on top, given
 * J = { head, hr, k, chest, hip, handF, handB, eF, eB, shF, shB, ax, ink, far, m }.
 * Returns J, so a game can hit-test hands and head.
 */
export function drawFigure(context, a, x, y, opts) {
  const o = opts || {};
  ctx = context;
  const B = FIGURE_STYLES[o.style] || FIGURE_STYLES.classic;
  const m = o.lw || 1;
  const ink = o.ink || '#141414';
  const far = B.sameFar ? ink : o.far || '#9a9a9a';
  const paper = o.paper || '#ffffff';
  const p = breathe(a.pose, o.breath || 0);
  const af = Math.min(1, Math.abs(p.face));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((o.flip ? -1 : 1) * (o.scale || 1), o.scale || 1);
  if (o.rot) {
    const pv = o.pivot || [0, -8];
    ctx.translate(pv[0], pv[1]);
    ctx.rotate(o.rot);
    ctx.translate(-pv[0], -pv[1]);
  }
  SK = B.sketch ? { seed: (o.seed || 0) * 7.3 + Math.floor(performance.now() / 130) * 3.1 } : null;
  const sx = p.chest[0] - p.hip[0], sy = p.chest[1] - p.hip[1];
  const sl = Math.hypot(sx, sy) || 1;
  const u = [sx / sl, sy / sl];
  const n = [-u[1], u[0]];
  const sideOff = 6.2 * (1 - af);
  const shF = [p.chest[0] + n[0] * sideOff - u[0], p.chest[1] + n[1] * sideOff - u[1]];
  const shB = [p.chest[0] - n[0] * sideOff - u[0], p.chest[1] - n[1] * sideOff - u[1]];
  const key = a.id || 'me';
  const solve = o.live === false ? (k, aa, bb, l1, l2, h, bd) => ik(aa, bb, l1, l2, h, bd) : (k, aa, bb, l1, l2, h, bd) => ikC(key + k, aa, bb, l1, l2, h, bd);
  const kF = solve('kF', p.hip, p.fF, THIGH, SHIN, p.kF, KNEE_BEND);
  const kB = solve('kB', p.hip, p.fB, THIGH, SHIN, p.kB, KNEE_BEND);
  const handF = reach(shF, p.hF, UARM + FARM);
  const handB = reach(shB, relax(shB, p.hB, p.hang), UARM + FARM);
  const eF = solve('eF', shF, handF, UARM, FARM, p.eF, ARM_BEND);
  const eB = solve('eB', shB, handB, UARM, FARM, p.eB, ARM_BEND);
  const hr = HEAD_R * B.head;
  const hd = [p.head[0] - p.chest[0], p.head[1] - p.chest[1]];
  const hl = Math.hypot(hd[0], hd[1]) || 1;
  const hu = [hd[0] / hl, hd[1] / hl];
  const neck = B.hollow ? 13 + hr : 20.5 + (hr - HEAD_R) * 0.9;
  const hc = [p.chest[0] + hu[0] * neck, p.chest[1] + hu[1] * neck];
  const J = { head: hc, hr, k: B.head, chest: p.chest, hip: p.hip, handF, handB, eF, eB, shF, shB, ax: p.ax || 0, ink, far, m };
  if (o.under) o.under(J);
  strokePath([shB, eB, handB], ARM * m * B.arm, far);
  if (B.mitts) drawMitt(handB, far, m, paper);
  strokePath([p.hip, kB, p.fB], LIMB * m * B.leg, far);
  if (B.mitts) drawBoot(p.fB, far);
  const neckTop = B.hollow ? [hc[0] - hu[0] * hr, hc[1] - hu[1] * hr] : [p.chest[0] + u[0] * 0.5, p.chest[1] + u[1] * 0.5];
  strokePath([[p.hip[0] + u[0], p.hip[1] + u[1]], neckTop], B.torso * m, ink);
  strokePath([p.hip, kF, p.fF], LIMB * m * B.leg, ink);
  if (B.mitts) drawBoot(p.fF, ink);
  if (B.shirt) drawShirt(p, u, n, J, o.shirt || '#fcd34d');
  drawHead(B, hc, hr, ink, m, paper);
  if (o.mid) o.mid(J);
  strokePath([shF, eF, handF], ARM * m * B.arm, ink);
  if (B.mitts) drawMitt(handF, ink, m, paper);
  if (o.over) o.over(J);
  SK = null;
  ctx.restore();
  return J;
}

// A walk cycle laid over any pose: blendPose(pose, walkPose(pose, phase), w), w easing
// 0..1 as the figure starts and stops, phase advancing about 1 per 17 units walked.
const WALK = [
  { hip: [0, -63], fF: [15, -8], fB: [-13, -8] },
  { hip: [0, -66], fF: [1, -8], fB: [-1, -22] },
  { hip: [0, -63], fF: [-13, -8], fB: [15, -8] },
  { hip: [0, -66], fF: [-1, -22], fB: [1, -8] },
];
export function walkPose(base, ph) {
  const x = (((ph % 1) + 1) % 1) * 4;
  const i = Math.floor(x), t = x - i;
  const g = (k) => WALK[(i + k + 4) % 4];
  const cm = (key, c) => catmull(g(-1)[key][c], g(0)[key][c], g(1)[key][c], g(2)[key][c], t);
  const hip = [cm('hip', 0), cm('hip', 1)];
  const dy = hip[1] - base.hip[1];
  const s = Math.cos(ph * Math.PI * 2);
  const o = Object.assign({}, base);
  o.hip = hip;
  o.fF = [cm('fF', 0), cm('fF', 1)];
  o.fB = [cm('fB', 0), cm('fB', 1)];
  o.chest = [base.chest[0] + 1.5, base.chest[1] + dy];
  o.head = [base.head[0] + 2, base.head[1] + dy];
  o.hF = base.free === true ? [2 - 13 * s, -60 + dy + Math.abs(s) * 2] : [base.hF[0] + s * 2, base.hF[1] + dy];
  const swing = base.free === false ? 0 : clamp(((base.hang ?? 1) - 0.3) / 0.6, 0, 1);
  o.hB = lerp2([base.hB[0] - s * 2, base.hB[1] + dy], [2 + 13 * s, -60 + dy + Math.abs(s) * 2], swing);
  return o;
}
export function blendPose(a, b, k) {
  if (k <= 0.001) return a;
  const o = Object.assign({}, a, { face: lerp(a.face, b.face, k), hang: lerp(a.hang ?? 1, b.hang ?? 1, k), ax: lerp(a.ax ?? 0, b.ax ?? 0, k) });
  for (const key of PTS) o[key] = [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)];
  return o;
}

// ── Ink drawing ────────────────────────────────────────────────────────────

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
const WOBBLE = Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.37) * 0.35 + Math.sin(i * 1.71 + 1) * 0.22);
/** A hand-drawn ground line at world y (default 0) from xl to xr. */
export function drawGround(c, xl, xr, color = '#141414', y = 0, width = 2.2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  const x0 = Math.floor(xl / 6) * 6;
  for (let x = x0; x <= xr + 6; x += 6) {
    const w = y + WOBBLE[((x / 6) % 512 + 512) % 512];
    if (x === x0) c.moveTo(x, w);
    else c.lineTo(x, w);
  }
  c.stroke();
}
/** A soft flat shadow under something touching the ground. alpha around 0.08 to 0.14. */
export function contactShadow(c, x, w, alpha = 0.1, y = 0) {
  c.save();
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.beginPath();
  c.ellipse(x, y + 1.2, w, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
/** Fill and outline the current path: roundRect(ctx, ...); inkShape(ctx, '#fff'). */
export function inkShape(c, fill, lw = 1.5, color = '#141414') {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = color;
  c.lineJoin = 'round';
  c.stroke();
}
/** A thick outlined stick: handles, poles, planks. */
export function inkBar(c, x0, y0, x1, y1, w, fill, color = '#141414') {
  c.lineCap = 'round';
  for (const [col, lw] of [[color, w + 3], [fill, w]]) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
}

// ── Popups, particles and shake ────────────────────────────────────────────

/**
 * createFx({ ink, accent, font }) → { popup, burst, dust, kick, update(dt), draw(ctx, left, right), shake, clear }.
 * popup('Perfect!', 'CHAIN ×2', hot, x, y) over the action; burst(x, y, n, colors?) for hits;
 * dust(x, y, w, n) for landings; kick(amount) on big moments, then offset the camera by fx.shake.
 * Call update(dt) in the step and draw() last in world space; left/right are the visible
 * world edges (visibleX(cam)) so popups are never cut off on a narrow phone.
 */
export function createFx(opts = {}) {
  const ink = opts.ink || '#141414';
  const accent = opts.accent || '#b45309';
  const font = opts.font || 'system-ui, sans-serif';
  const popups = [];
  const bits = [];
  let shakeV = 0;
  const fx = {
    shake: 0,
    popup(text, sub, hot, x, y) { popups.push({ text, sub, hot, x, y, t: 0 }); },
    burst(x, y, n, colors) {
      const cols = colors || [ink, ink, '#8d8d8d', '#c8c8c8'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const sp = 70 + Math.random() * 120;
        bits.push({ x: x + (Math.random() - 0.5) * 30, y: y - 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 18, c: cols[i % cols.length], t: 0, life: 0.8 + Math.random() * 0.5, w: 2 + Math.random() * 1.6, g: 260, drag: 1.5 });
      }
    },
    dust(x, y, w, n) {
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        bits.push({ x: x + side * (w / 2 - 2 - Math.random() * 6), y: y - 1, vx: side * (35 + Math.random() * 75), vy: -(4 + Math.random() * 22), r: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 4, c: i % 3 ? '#b0b0b0' : '#8d8d8d', t: 0, life: 0.3 + Math.random() * 0.25, w: 2 + Math.random() * 2.5, g: 80, drag: 5 });
      }
    },
    kick(amount) { shakeV += amount; },
    clear() { popups.length = 0; bits.length = 0; fx.shake = 0; shakeV = 0; },
    update(dt) {
      shakeV += (-260 * fx.shake - 15 * shakeV) * dt;
      fx.shake += shakeV * dt;
      for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].t += dt;
        if (popups[i].t > 1.1) popups.splice(i, 1);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt;
        b.vy += b.g * dt;
        b.vx *= 1 - Math.min(1, b.drag * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r += b.vr * dt;
        if (b.t > b.life) bits.splice(i, 1);
      }
    },
    draw(c, left = -Infinity, right = Infinity) {
      for (const b of bits) {
        c.save();
        c.globalAlpha = Math.max(0, 1 - b.t / b.life);
        c.translate(b.x, b.y);
        c.rotate(b.r);
        c.fillStyle = b.c;
        c.fillRect(-b.w / 2, -0.9, b.w, 1.8);
        c.restore();
      }
      for (const p of popups) {
        const k = p.t / 1.1;
        const a = k < 0.12 ? k / 0.12 : clamp(1 - (k - 0.55) / 0.45, 0, 1);
        const y = p.y - 26 - 24 * EASE.out(Math.min(1, k * 1.3));
        const sc = 1 + 0.22 * Math.max(0, 1 - k * 5);
        c.save();
        c.globalAlpha = a;
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        c.font = `600 24px ${font}`;
        let half = c.measureText(p.text).width / 2;
        if (p.sub) {
          c.font = `600 10px ${font}`;
          half = Math.max(half, c.measureText(p.sub).width / 2 + p.sub.length * 0.75);
        }
        half = half * sc + 10;
        const x = right - left > half * 2 ? clamp(p.x, left + half, right - half) : (left + right) / 2;
        c.translate(x, y);
        c.scale(sc, sc);
        c.fillStyle = p.hot ? accent : ink;
        c.font = `600 24px ${font}`;
        c.fillText(p.text, 0, 0);
        if (p.sub) {
          c.font = `600 10px ${font}`;
          c.fillText(p.sub, 0, 12);
        }
        c.restore();
      }
    },
  };
  return fx;
}

// ── Sound ──────────────────────────────────────────────────────────────────

/**
 * createSound() → { unlock, partial, hiss, buzz, SND, muted }. Everything is synthesized;
 * there are no audio files. Call unlock() inside the first tap or key handler (browsers
 * block sound before that). partial(freq, toFreq, dur, vol, type, wet, delay) is a
 * pitched blip; hiss(dur, vol, filterType, f0, f1, q, wet, attack, delay) a filtered noise
 * burst. SND has a starter set: thunk(k), tok(k), whoosh(), perfect(), streak(n), record(), lose().
 */
export function createSound() {
  let actx = null, bus = null, verb = null;
  const s = {
    muted: false,
    unlock() {
      if (!actx) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          const comp = actx.createDynamicsCompressor();
          comp.threshold.value = -14;
          comp.ratio.value = 4;
          comp.connect(actx.destination);
          bus = actx.createGain();
          bus.gain.value = 0.9;
          bus.connect(comp);
          const len = Math.floor(actx.sampleRate * 1.1);
          const ir = actx.createBuffer(2, len, actx.sampleRate);
          for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
          }
          const conv = actx.createConvolver();
          conv.buffer = ir;
          verb = actx.createGain();
          verb.gain.value = 0.16;
          verb.connect(conv).connect(comp);
        } catch {
          actx = null;
        }
      }
      if (actx && actx.state === 'suspended') actx.resume();
    },
    partial(freq, f1, dur, vol, type, wet, delay) {
      if (!actx || s.muted || vol < 0.003) return;
      const t = actx.currentTime + (delay || 0);
      const o = actx.createOscillator();
      const g = voice(wet);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (f1 && f1 !== freq) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    hiss(dur, vol, type, f0, f1, q, wet, attack, delay) {
      if (!actx || s.muted || vol < 0.003) return;
      const t = actx.currentTime + (delay || 0);
      const n = Math.max(1, Math.floor(actx.sampleRate * dur));
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource();
      src.buffer = buf;
      const f = actx.createBiquadFilter();
      f.type = type;
      f.Q.value = q || 0.7;
      f.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = voice(wet);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + (attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g);
      src.start(t);
    },
    buzz(ms) {
      try { if (!s.muted && navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ }
    },
  };
  function voice(wet) {
    const g = actx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    if (wet) {
      const w = actx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(verb);
    }
    return g;
  }
  const { partial, hiss } = s;
  s.SND = {
    thunk(k = 1) { partial(108, 50, 0.22, 0.6 * k, 'sine', 0.12); hiss(0.07, 0.34 * k, 'bandpass', 430, 240, 1.1, 0.18); },
    tok(k = 1) { partial(190, 140, 0.07, 0.3 * k, 'sine', 0.1); hiss(0.03, 0.16 * k, 'bandpass', 520, 400, 1.2, 0.1); },
    whoosh() { hiss(0.25, 0.08, 'bandpass', 600, 1600, 1.4, 0.1, 0.06); },
    perfect() { partial(1568, 1568, 0.5, 0.035, 'sine', 0.5, 0.04); partial(2093, 2093, 0.45, 0.028, 'sine', 0.5, 0.1); },
    streak(m = 1) { const b = m >= 6 ? 784 : 659; partial(b, b, 0.22, 0.045, 'triangle', 0.4); partial(b * 1.5, b * 1.5, 0.3, 0.035, 'triangle', 0.4, 0.08); },
    record() { [523, 659, 784, 1047].forEach((f, i) => partial(f, f, 0.32, 0.05, 'triangle', 0.45, 0.1 + i * 0.075)); },
    lose() { partial(220, 90, 0.5, 0.25, 'triangle', 0.3); hiss(0.3, 0.1, 'lowpass', 900, 200, 0.7, 0.3); },
  };
  return s;
}

// ── Game loop ──────────────────────────────────────────────────────────────

/**
 * loop(step) runs step(dt, now) every animation frame with dt in seconds, capped so a
 * background tab doesn't teleport the world. Returns stop(). In ?still mode it draws one
 * frame and stops, for screenshots.
 */
export function loop(step) {
  let raf = 0, last = 0, alive = true;
  const frame = (t) => {
    if (!alive) return;
    const now = t / 1000;
    const dt = last ? Math.min(0.05, now - last) : 1 / 60;
    last = now;
    step(dt, now);
    if (!testMode().still) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

// ── Test modes ─────────────────────────────────────────────────────────────

/**
 * Read once from the URL: ?bot (the game plays itself like a decent first-timer),
 * ?autoplay (skip the start card), ?still (freeze after one frame). test is true for any
 * of them, and a test run never saves stats.
 */
export function testMode() {
  let q;
  try { q = new URLSearchParams(window.location.search); } catch { q = new URLSearchParams(); }
  const bot = q.has('bot'), still = q.has('still'), autoplay = q.has('autoplay');
  if (bot && typeof window !== 'undefined') window.__bot = true;
  return { bot, still, autoplay: autoplay || bot, test: bot || still || autoplay };
}

/**
 * A bot that reacts like a person: decide once per threat, act after a human delay
 * with some aim error. createBot({ seed, delay, jitter, aimError }) → tick(now, threat, act),
 * where threat has a stable id and act(aimOffset) does what a tap would.
 */
export function createBot(opts = {}) {
  const r = rng(opts.seed ?? 7);
  const delay = opts.delay ?? 0.18, jitter = opts.jitter ?? 0.12, aimError = opts.aimError ?? 12;
  let plan = null;
  return function tick(now, threat, act) {
    if (!threat) return;
    if (!plan || plan.id !== threat.id) plan = { id: threat.id, at: now + delay + Math.abs(gauss(r)) * jitter, aim: gauss(r) * aimError, done: false };
    if (now >= plan.at && !plan.done) { plan.done = true; act(plan.aim); }
  };
}

/** Call when a run ends, so a checker can read how long a run lasted: window.__lastRun = { score, time }. */
export function reportRun(score, time) {
  try {
    window.__lastRun = { score, time };
    window.__runs = (window.__runs || []).concat([{ score, time }]);
  } catch { /* no window */ }
}

// ── Stats ──────────────────────────────────────────────────────────────────

/**
 * createStats(key) → { initial(), save(stats) }: lifetime stats (best, plays, ...).
 * initial() is synchronous, for first render. When the player is signed in they live in
 * window.kanthinkData and follow them to any device; otherwise in this browser only.
 * Test modes never save. save() is async and never throws.
 */
export function createStats(key) {
  const name = `game:${key}`;
  const data = () => (typeof window !== 'undefined' ? window.kanthinkData : null);
  const local = () => { try { return JSON.parse(window.localStorage.getItem(name) || 'null'); } catch { return null; } };
  return {
    initial() {
      const d = data();
      return (d && d.initial && d.initial[name]) || local() || {};
    },
    async save(stats) {
      if (testMode().test) return;
      try { window.localStorage.setItem(name, JSON.stringify(stats)); } catch { /* storage blocked */ }
      try {
        const d = data();
        if (d && d.signedIn && typeof d.set === 'function') await d.set(name, stats);
      } catch { /* kept locally */ }
    },
  };
}
