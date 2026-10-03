// Footprints (what kills grass) and colliders (what stops the mower), derived from site data.
// The renderer builds meshes at the same spots, so both read from here.

import { circlePoly, obb } from './geom';
import type { HouseDef, Poly, PropDef, SiteDef } from './types';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; tag: string; soft?: boolean }
  | { kind: 'poly'; pts: Poly; tag: string }
  | { kind: 'seg'; ax: number; az: number; bx: number; bz: number; r: number; tag: string };

export function houseFootprints(h: HouseDef): Poly[] {
  const out: Poly[] = [obb(h.x, h.z, h.w, h.d, h.rot)];
  if (h.porch && h.kind !== 'office') {
    // porch sits on the front (+Z local) face, centred a little off the middle
    const pw = Math.min(h.w * 0.42, 7);
    const off = h.garage === 'right' ? -h.w * 0.18 : h.garage === 'left' ? h.w * 0.18 : 0;
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    const lx = off;
    const lz = h.d / 2 + 1;
    out.push(obb(h.x + lx * c + lz * s, h.z - lx * s + lz * c, pw, 2, h.rot));
  }
  return out;
}

export interface PropShape {
  poly?: Poly; // removes grass + solid
  circle?: { r: number; removesGrass: boolean };
  solid: boolean;
  tag: string;
}

export function propShape(p: PropDef): PropShape {
  const s = p.scale ?? 1;
  switch (p.kind) {
    case 'shed': return { poly: obb(p.x, p.z, 3.2, 2.6, p.rot), solid: true, tag: 'shed' };
    case 'trampoline': return { circle: { r: 2.15, removesGrass: true }, solid: true, tag: 'trampoline' };
    case 'playset': return { poly: obb(p.x, p.z, 3.8, 2.4, p.rot), solid: true, tag: 'playset' };
    case 'raisedbed': return { poly: obb(p.x, p.z, 3.0, 1.2, p.rot), solid: true, tag: 'garden bed' };
    case 'ac': return { poly: obb(p.x, p.z, 1.0, 1.0, p.rot), solid: true, tag: 'A/C unit' };
    case 'fountain': return { circle: { r: 2.1, removesGrass: true }, solid: true, tag: 'fountain' };
    case 'boulder': return { circle: { r: 0.75 * s, removesGrass: true }, solid: true, tag: 'boulder' };
    case 'bench': return { poly: obb(p.x, p.z, 1.8, 0.7, p.rot), solid: true, tag: 'bench' };
    case 'car': return { poly: obb(p.x, p.z, 4.5, 1.9, p.rot), solid: true, tag: 'car' };
    case 'grill': return { circle: { r: 0.45, removesGrass: false }, solid: true, tag: 'grill' };
    case 'birdbath': return { circle: { r: 0.32, removesGrass: false }, solid: true, tag: 'birdbath' };
    case 'gnome': return { circle: { r: 0.16, removesGrass: false }, solid: true, tag: 'gnome' };
    case 'mailbox': return { circle: { r: 0.12, removesGrass: false }, solid: true, tag: 'mailbox' };
    case 'lamp': return { circle: { r: 0.14, removesGrass: false }, solid: true, tag: 'lamp post' };
    case 'hydrant': return { circle: { r: 0.18, removesGrass: false }, solid: true, tag: 'hydrant' };
    case 'flagpole': return { circle: { r: 0.12, removesGrass: false }, solid: true, tag: 'flagpole' };
    case 'sign': return { circle: { r: 0.12 * s, removesGrass: false }, solid: true, tag: 'sign' };
    case 'sprinkler': return { circle: { r: 0.07, removesGrass: false }, solid: false, tag: 'sprinkler head' };
    case 'trailer': return { poly: obb(p.x, p.z, 4, 2, p.rot), solid: true, tag: 'trailer' };
    default: return { circle: { r: 0.3, removesGrass: false }, solid: true, tag: p.kind };
  }
}

/** Everything that removes grass inside the lawn. */
export function grassBlockers(site: SiteDef): { polys: Poly[]; circles: [number, number, number][]; segs: [number, number, number, number, number][] } {
  const polys: Poly[] = [];
  const circles: [number, number, number][] = [];
  const segs: [number, number, number, number, number][] = [];
  for (const h of site.houses) polys.push(...houseFootprints(h));
  for (const hd of site.hard) polys.push(hd.poly);
  for (const b of site.beds) polys.push(b.poly);
  for (const t of site.trees) circles.push([t.x, t.z, t.ring ?? t.trunk + 0.02]);
  for (const p of site.props) {
    const sh = propShape(p);
    if (sh.poly) polys.push(sh.poly);
    else if (sh.circle && sh.circle.removesGrass) circles.push([p.x, p.z, sh.circle.r]);
    else if (sh.circle) circles.push([p.x, p.z, Math.min(sh.circle.r, 0.12)]);
  }
  for (const f of site.fences) {
    const r = f.kind === 'hedge' ? 0.55 : 0.06;
    for (let i = 0; i < f.pts.length - 1; i++) segs.push([f.pts[i][0], f.pts[i][1], f.pts[i + 1][0], f.pts[i + 1][1], r]);
  }
  return { polys, circles, segs };
}

export function buildColliders(site: SiteDef): Collider[] {
  const out: Collider[] = [];
  for (const h of site.houses) for (const p of houseFootprints(h)) out.push({ kind: 'poly', pts: p, tag: h.kind === 'office' ? 'building' : 'house' });
  for (const t of site.trees) out.push({ kind: 'circle', x: t.x, z: t.z, r: t.trunk + 0.04, tag: 'tree' });
  for (const p of site.props) {
    const sh = propShape(p);
    if (!sh.solid) continue;
    if (sh.poly) out.push({ kind: 'poly', pts: sh.poly, tag: sh.tag });
    else if (sh.circle) out.push({ kind: 'circle', x: p.x, z: p.z, r: sh.circle.r, tag: sh.tag, soft: p.kind === 'gnome' });
  }
  for (const f of site.fences) {
    const r = f.kind === 'hedge' ? 0.55 : 0.07;
    for (let i = 0; i < f.pts.length - 1; i++) {
      out.push({ kind: 'seg', ax: f.pts[i][0], az: f.pts[i][1], bx: f.pts[i + 1][0], bz: f.pts[i + 1][1], r, tag: f.kind === 'hedge' ? 'hedge' : 'fence' });
    }
  }
  // the trailer you arrived with
  const t = site.trailer;
  out.push({ kind: 'poly', pts: obb(t.x - Math.cos(t.heading) * 0.2, t.z - Math.sin(t.heading) * 0.2, 4.2, 2.1, -t.heading), tag: 'trailer' });
  const tx = t.x + Math.cos(t.heading) * 5.6;
  const tz = t.z + Math.sin(t.heading) * 5.6;
  out.push({ kind: 'poly', pts: obb(tx, tz, 5.6, 2.1, -t.heading), tag: 'truck' });
  return out;
}

export { circlePoly };
