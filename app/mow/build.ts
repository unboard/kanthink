// Merge-by-material builder: lots of little parts, few draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  /** Add a geometry (consumed) with position / rotation (euler XYZ) / scale. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    return this.addM(geo, mat, this.m);
  }

  addM(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(matrix);
    // keep attribute sets uniform so mergeGeometries is happy
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
    return this;
  }

  build(opts: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const hasColor = list.some((g) => g.getAttribute('color'));
      if (hasColor) {
        for (const g of list) {
          if (!g.getAttribute('color')) {
            const n = g.getAttribute('position').count;
            g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
          }
        }
      }
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Paint a flat color into a geometry's vertex colors (for AO-ish gradients and variety). */
export function tintGeo(geo: THREE.BufferGeometry, color: THREE.Color, fn?: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = fn ? fn(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
    col[i * 3] = color.r * k;
    col[i * 3 + 1] = color.g * k;
    col[i * 3 + 2] = color.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
