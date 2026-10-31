import * as THREE from 'three';
import type { PlotTheme } from '@/lib/kan/city/style';
import { dyn, mat } from './models';

/**
 * Themes dress a building without rebuilding it: colors go in through the building's
 * own wall and roof, and the decorations here sit on and around it. Everything stays
 * inside the plot's cell (a building's footprint is about ±4 from its center, the
 * front yard is +z) so nothing pokes into the street or a neighbor.
 */

export const THEME_COLORS: Record<PlotTheme, { walls: string; roof: string }> = {
  cat: { walls: '#fbe3c8', roof: '#f28fae' },
  candy: { walls: '#ffd6e8', roof: '#5fd3b0' },
  garden: { walls: '#eef6dc', roof: '#4f9a5a' },
  space: { walls: '#2b2f5a', roof: '#7c3aed' },
  castle: { walls: '#cfc8bb', roof: '#5f6a7a' },
  ocean: { walls: '#d9f1fb', roof: '#2f76b8' },
  spooky: { walls: '#3b2f4a', roof: '#ff8a1f' },
};

type Tick = (t: number, dt: number) => void;

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
const lit = (color: string, intensity = 1.2) => mat(color, { emissive: color, intensity });

/** The height of whatever is under (x, z) in the building: the roof, usually. */
function heightAt(group: THREE.Object3D, x: number, z: number, fallback: number) {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(group, true)[0];
  return hit ? hit.point.y : fallback;
}

/** Put a theme's decorations on a building (in its own coordinates, before it's placed). */
export function decorate(theme: PlotTheme, group: THREE.Group, top: number, seed: number): Tick | undefined {
  const roofL = heightAt(group, -1.8, -0.6, top * 0.7);
  const roofR = heightAt(group, 1.8, -0.6, top * 0.7);
  const roof = Math.min(roofL, roofR);
  const ticks: Tick[] = [];
  switch (theme) {
    case 'cat': {
      const fur = mat('#f2a65a', { rough: 0.8 });
      const pink = mat('#ff9eb5', { rough: 0.7 });
      // Ears on the roof.
      for (const [x, y] of [[-1.8, roofL], [1.8, roofR]] as const) {
        const ear = add(group, new THREE.ConeGeometry(0.9, 1.6, 4), fur, x, y + 0.7, -0.6);
        ear.rotation.y = Math.PI / 4;
        const inner = add(group, new THREE.ConeGeometry(0.5, 1.0, 4), pink, x, y + 0.62, -0.25);
        inner.rotation.y = Math.PI / 4;
      }
      // A tail curling down the side wall.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(3.3, roof * 0.9, -1.5), new THREE.Vector3(4.1, roof * 0.6, -0.5),
        new THREE.Vector3(3.8, roof * 0.3, 0.6), new THREE.Vector3(4.3, 0.6, 1.2), new THREE.Vector3(4.0, 1.4, 2.0),
      ]);
      add(group, new THREE.TubeGeometry(curve, 24, 0.3, 8, false), fur, 0, 0, 0);
      // A cat napping on the roof, tail swishing.
      const cat = dyn(new THREE.Group());
      cat.position.set(0, roof, 0.4);
      const body = add(cat, new THREE.CapsuleGeometry(0.42, 0.9, 4, 10), mat('#4a4a4a', { rough: 0.8 }), 0, 0.42, 0);
      body.rotation.z = Math.PI / 2;
      add(cat, new THREE.SphereGeometry(0.36, 10, 8), mat('#4a4a4a', { rough: 0.8 }), 0.75, 0.62, 0.05);
      for (const z of [-0.18, 0.2]) add(cat, new THREE.ConeGeometry(0.12, 0.26, 4), mat('#4a4a4a'), 0.8, 0.98, z);
      const tail = new THREE.Group();
      tail.position.set(-0.75, 0.45, 0);
      add(tail, new THREE.CapsuleGeometry(0.08, 0.7, 3, 6), mat('#4a4a4a'), 0, 0.4, 0);
      cat.add(tail);
      group.add(cat);
      ticks.push((t) => { tail.rotation.x = Math.sin(t * 2.4 + seed) * 0.5; });
      // Paw prints up the path and a ball of yarn.
      const paw = mat('#7a4a3a', { rough: 0.9 });
      for (let i = 0; i < 4; i++) {
        const x = -0.9 + (i % 2) * 0.6, z = 2.7 + i * 0.55;
        add(group, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), paw, x, 0.03, z);
        for (let k = -1; k <= 1; k++) add(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), paw, x + k * 0.12, 0.03, z - 0.2);
      }
      add(group, new THREE.SphereGeometry(0.45, 10, 8), mat('#e05a8a', { rough: 0.9 }), -3.4, 0.45, 3.8);
      const strand = add(group, new THREE.TorusGeometry(0.46, 0.05, 6, 16), mat('#ffb3cd'), -3.4, 0.45, 3.8);
      strand.rotation.x = 1.1;
      break;
    }
    case 'candy': {
      const colors = ['#ff6fa8', '#ffd23f', '#5fd3b0', '#9b7bff'];
      for (const [x, z, i] of [[-3.6, 3.8, 0], [-2.6, 4.3, 1], [3.8, -3.4, 2]] as const) {
        add(group, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), mat('#ffffff'), x, 0.8, z);
        const pop = add(group, new THREE.CylinderGeometry(0.5, 0.5, 0.14, 16), mat(colors[i], { rough: 0.3 }), x, 1.75, z);
        pop.rotation.x = Math.PI / 2;
        const swirl = add(group, new THREE.TorusGeometry(0.3, 0.05, 6, 16), mat('#ffffff'), x, 1.75, z + 0.08);
        swirl.rotation.z = 0.3;
      }
      for (let i = 0; i < 5; i++) add(group, new THREE.SphereGeometry(0.32, 10, 8), mat(colors[i % colors.length], { rough: 0.25 }), -2 + i, roof + 0.2, -0.6 + (i % 2) * 0.5);
      for (const x of [-4.2, 4.2]) {
        for (let k = 0; k < 4; k++) add(group, new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8), mat(k % 2 ? '#ffffff' : '#ff4d6d'), x, 0.2 + k * 0.4, 4.2);
      }
      break;
    }
    case 'garden': {
      const petals = ['#ff6b6b', '#ffd23f', '#f472b6', '#ffffff', '#a78bfa'];
      for (let i = 0; i < 14; i++) {
        const side = i < 7 ? -1 : 1, k = i % 7;
        const x = side * (2.2 + (k % 2) * 0.5 + Math.floor(k / 2) * 0.55), z = 3.4 + (k % 3) * 0.4;
        add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), mat('#3f8a3f'), x, 0.25, z);
        add(group, new THREE.SphereGeometry(0.16, 8, 6), mat(petals[(i + seed) % petals.length], { rough: 0.6 }), x, 0.55, z);
      }
      // A sunflower taller than the door.
      add(group, new THREE.CylinderGeometry(0.07, 0.09, 3, 6), mat('#3f8a3f'), 3.8, 1.5, 3.2);
      const head = add(group, new THREE.CylinderGeometry(0.6, 0.6, 0.12, 14), mat('#ffcc22', { rough: 0.6 }), 3.8, 3.1, 3.3);
      head.rotation.x = Math.PI / 2.4;
      const eye = add(group, new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12), mat('#6b3f1f'), 3.8, 3.12, 3.36);
      eye.rotation.x = Math.PI / 2.4;
      for (const x of [-1.6, 0, 1.6]) add(group, new THREE.SphereGeometry(0.55, 8, 6), mat('#4caf50', { rough: 0.9 }), x, roof + 0.3, -0.8);
      break;
    }
    case 'space': {
      // A rocket in the yard.
      add(group, new THREE.CylinderGeometry(0.42, 0.42, 2.4, 12), mat('#f1f5f9', { rough: 0.3, metal: 0.4 }), -3.5, 1.5, 3.4);
      add(group, new THREE.ConeGeometry(0.42, 0.9, 12), mat('#ef4444', { rough: 0.4 }), -3.5, 3.15, 3.4);
      add(group, new THREE.CylinderGeometry(0.18, 0.18, 0.08, 10), lit('#38bdf8', 1.4), -3.5, 2.0, 3.83).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const fin = add(group, new THREE.BoxGeometry(0.06, 0.7, 0.5), mat('#ef4444'), -3.5 + Math.sin(a) * 0.45, 0.55, 3.4 + Math.cos(a) * 0.45);
        fin.rotation.y = a;
      }
      // A dish on the roof.
      const dish = add(group, new THREE.SphereGeometry(0.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), mat('#e2e8f0', { rough: 0.3, metal: 0.5 }), 1.6, roofR + 0.9, -0.6);
      dish.rotation.x = Math.PI * 0.85;
      add(group, new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), mat('#94a3b8'), 1.6, roofR + 0.4, -0.6);
      // A ringed planet and stars, drifting.
      const sky = dyn(new THREE.Group());
      sky.position.set(-1.5, top + 1.6, -0.5);
      add(sky, new THREE.SphereGeometry(0.7, 14, 10), mat('#f59e0b', { rough: 0.5 }), 0, 0, 0);
      const ring = add(sky, new THREE.TorusGeometry(1.1, 0.07, 6, 28), mat('#fde68a'), 0, 0, 0);
      ring.rotation.x = 1.2;
      const stars: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) stars.push(add(sky, new THREE.OctahedronGeometry(0.16), lit('#fff7c2', 2), Math.sin(i * 2.4) * 2.6, Math.cos(i * 1.7) * 0.8, Math.cos(i * 2.4) * 2.2));
      group.add(sky);
      ticks.push((t) => {
        sky.rotation.y = t * 0.25;
        sky.position.y = top + 1.6 + Math.sin(t * 0.9) * 0.3;
        stars.forEach((s, i) => s.scale.setScalar(0.7 + Math.abs(Math.sin(t * 2 + i)) * 0.6));
      });
      break;
    }
    case 'castle': {
      const stone = mat('#b9b2a5', { rough: 0.95 });
      for (const [x, z] of [[-3.3, -3.0], [3.3, -3.0], [-3.3, 2.4], [3.3, 2.4]] as const) {
        const h = Math.max(roof, 3) + 1.2;
        add(group, new THREE.CylinderGeometry(0.75, 0.85, h, 10), stone, x, h / 2, z);
        add(group, new THREE.ConeGeometry(0.95, 1.4, 10), mat('#5f6a7a', { rough: 0.7 }), x, h + 0.7, z);
        add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), mat('#444'), x, h + 1.8, z);
        add(group, new THREE.BoxGeometry(0.5, 0.3, 0.03), mat(seed % 2 ? '#e11d48' : '#7c3aed'), x + 0.26, h + 2.05, z);
      }
      for (let i = 0; i < 6; i++) add(group, new THREE.BoxGeometry(0.45, 0.45, 0.45), stone, -2.5 + i, roof + 0.22, 1.2);
      break;
    }
    case 'ocean': {
      // A pool with fish that leap.
      const pool = add(group, new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20), mat('#38bdf8', { rough: 0.15, metal: 0.2 }), -3.1, 0.08, 3.5);
      pool.castShadow = false;
      add(group, new THREE.TorusGeometry(1.1, 0.12, 6, 20), mat('#f1e4c8'), -3.1, 0.12, 3.5).rotation.x = Math.PI / 2;
      const fish = dyn(new THREE.Group());
      fish.position.set(-3.1, 0, 3.5);
      add(fish, new THREE.SphereGeometry(0.22, 8, 6), mat('#ff8a3d', { rough: 0.4 }), 0, 0, 0).scale.set(1.6, 1, 0.7);
      add(fish, new THREE.ConeGeometry(0.16, 0.3, 4), mat('#ff8a3d'), -0.42, 0, 0).rotation.z = Math.PI / 2;
      group.add(fish);
      ticks.push((t) => {
        const k = (t * 0.5 + seed * 0.01) % 1;
        const up = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
        fish.position.set(-3.1 - 0.6 + (k < 0.35 ? (k / 0.35) * 1.2 : 0), 0.1 + up * 1.4, 3.5);
        fish.rotation.z = up > 0 ? Math.cos((k / 0.35) * Math.PI) * 0.9 : 0;
        fish.visible = up > 0.02;
      });
      // Shells and a starfish.
      for (const [x, z] of [[2.4, 4.2], [3.0, 3.7], [3.7, 4.3]] as const) add(group, new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#fde7e1', { rough: 0.6 }), x, 0.02, z);
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.18 : 0.45;
        if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(r, 0);
      }
      const sf = add(group, new THREE.ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: false }), mat('#ff7a59', { rough: 0.7 }), 3.0, 0.06, 2.9);
      sf.rotation.x = -Math.PI / 2;
      break;
    }
    case 'spooky': {
      // Jack-o'-lanterns by the door, glowing.
      for (const [x, z, s] of [[-1.6, 3.4, 0.55], [-2.5, 3.9, 0.4], [1.7, 3.6, 0.48]] as const) {
        const p = add(group, new THREE.SphereGeometry(s, 12, 8), mat('#ff8a1f', { rough: 0.6 }), x, s * 0.8, z);
        p.scale.y = 0.8;
        add(group, new THREE.CylinderGeometry(0.05, 0.07, 0.2, 5), mat('#3f6b2a'), x, s * 1.5, z);
        for (const dx of [-0.16, 0.16]) add(group, new THREE.ConeGeometry(0.07, 0.1, 3), lit('#ffd23f', 2.2), x + dx * s * 2, s * 0.95, z + s * 0.92).rotation.x = Math.PI / 2;
        add(group, new THREE.BoxGeometry(s * 0.7, 0.07, 0.05), lit('#ffd23f', 2.2), x, s * 0.6, z + s * 0.93);
      }
      // Bats around the roof.
      const bats = dyn(new THREE.Group());
      bats.position.set(0, top + 0.8, 0);
      const wing = mat('#1f1726');
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Group();
        add(b, new THREE.SphereGeometry(0.14, 6, 4), wing, 0, 0, 0);
        for (const s of [-1, 1]) add(b, new THREE.ConeGeometry(0.22, 0.5, 3), wing, s * 0.3, 0, 0).rotation.z = s * Math.PI / 2;
        b.userData.a = (i / 4) * Math.PI * 2;
        bats.add(b);
      }
      // A little ghost bobbing in the yard.
      const ghost = dyn(new THREE.Group());
      add(ghost, new THREE.CapsuleGeometry(0.4, 0.6, 4, 10), mat('#f5f3ff', { rough: 0.4, opacity: 0.85 }), 0, 0, 0);
      for (const x of [-0.13, 0.13]) add(ghost, new THREE.SphereGeometry(0.06, 6, 4), mat('#1f1726'), x, 0.25, 0.36);
      group.add(bats, ghost);
      ticks.push((t) => {
        bats.children.forEach((b, i) => {
          const a = (b.userData.a as number) + t * 1.4;
          b.position.set(Math.cos(a) * 3, Math.sin(t * 3 + i) * 0.4, Math.sin(a) * 3);
          b.rotation.y = -a;
        });
        ghost.position.set(3.3, 1.2 + Math.sin(t * 1.6) * 0.3, 3.4);
      });
      break;
    }
  }
  return ticks.length ? (t, dt) => { for (const f of ticks) f(t, dt); } : undefined;
}
