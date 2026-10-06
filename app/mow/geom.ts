// Plain 2D geometry on the XZ plane.

import type { Poly, Vec2 } from './types';

export function rect(x0: number, z0: number, x1: number, z1: number): Poly {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

export function circlePoly(cx: number, cz: number, r: number, n = 28): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** A soft, irregular ellipse — garden beds, islands. */
export function blob(cx: number, cz: number, rx: number, rz: number, wobble: number, phase: number, n = 32, rot = 0): Poly {
  const out: Poly = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(a * 2 + phase) * 0.6 + Math.sin(a * 3 + phase * 1.7) * 0.4);
    const x = Math.cos(a) * rx * k;
    const z = Math.sin(a) * rz * k;
    out.push([cx + x * c - z * s, cz + x * s + z * c]);
  }
  return out;
}

/** Local → world on the XZ plane, matching three.js `rotation.y = rot`. */
export function rotXZ(x: number, z: number, rot: number): Vec2 {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x * c + z * s, -x * s + z * c];
}

/** Rotated rectangle centered at (cx,cz), rotated like a three.js object with rotation.y = rot. */
export function obb(cx: number, cz: number, w: number, d: number, rot: number): Poly {
  const hw = w / 2;
  const hd = d / 2;
  const pts: Vec2[] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  return pts.map(([x, z]) => {
    const [rx, rz] = rotXZ(x, z, rot);
    return [cx + rx, cz + rz] as Vec2;
  });
}

/** Thick polyline as a list of quads (one per segment) plus round-ish joints. */
export function stripPolys(pts: Vec2[], width: number): Poly[] {
  const out: Poly[] = [];
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * hw;
    const nz = (dx / len) * hw;
    out.push([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]);
    if (i > 0) out.push(circlePoly(ax, az, hw, 16));
  }
  return out;
}

/** Smooth a polyline with Chaikin corner cutting. */
export function chaikin(pts: Vec2[], iterations = 2): Vec2[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const q: Vec2[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      q.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

export function pointInPoly(x: number, z: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: Poly): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

export function polyBounds(polys: Poly[]) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of polys) {
    for (const [x, z] of p) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
  }
  return { x0, z0, x1, z1 };
}

export function polyPerimeter(poly: Poly): number {
  let l = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    l += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
  }
  return l;
}

/** Closest point on segment ab to p; returns [x, z, t]. */
export function closestOnSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, az + dz * t, t];
}

export function polyCentroid(poly: Poly): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

export function angleWrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
