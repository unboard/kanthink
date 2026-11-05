import * as THREE from 'three';
import { heightAt, type Kid } from '@/lib/kan/players';

/**
 * One of the girls, as herself: her own hair (long and down, a ponytail or braids),
 * her eye color, her height for her age, and her favorite shirt. Jointed like a real
 * kid (hips, knees, shoulders, elbows), so she walks, runs, swings her arms, blinks
 * and sits down to drive.
 *
 * Every scene moves "you" the same way: it bobs `userData.body` and turns the whole
 * figure. A girl doesn't bob like a mushroom, so `body` here is a stand-in she reads
 * from, and she works out her own stride from how far she's moved each frame. That
 * way she walks properly in the city, the zoo, inside a building and on the Freeway,
 * and none of them needs to know.
 *
 * Built at a real kid's size in meters (the zoo's units). `userData.cam` tells a
 * scene to bring its camera in closer, since she's smaller than the mushroom.
 */

const geos = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
};
const mats = new Map<string, THREE.Material>();
const skinMat = (color: string, rough = 0.62) => {
  const key = `${color}|${rough}`;
  let m = mats.get(key);
  // A touch of its own glow, so the underside of her chin isn't muddy in the shade.
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: new THREE.Color(color), emissiveIntensity: 0.14 }); mats.set(key, m); }
  return m;
};
const flat = (color: string, opacity = 1) => {
  const key = `b|${color}|${opacity}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); mats.set(key, m); }
  return m;
};
const hairMat = (color: string) => {
  const key = `h|${color}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }); mats.set(key, m); }
  return m;
};

const shade = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

/** The figure is built for a kid this tall, then scaled to her real height. */
const BUILT = 1.3;
const HIP = 0.65, THIGH = 0.3, SHIN = 0.29, WAIST = 0.69, SHOULDER = 0.3, UPPER = 0.22, FORE = 0.2;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  parent.add(o);
  return o;
}
const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
};

export interface KidFigure { group: THREE.Group; body: THREE.Object3D }

export function kidFigure(kid: Kid, opts: { sit?: boolean } = {}): KidFigure {
  const root = new THREE.Group();
  root.userData.dynamic = true;
  const tall = heightAt(kid.age);
  // What the scenes bob: she reads it, rather than being lifted by it.
  const driver = new THREE.Group();
  driver.position.y = 0.8;
  root.add(driver);
  const fig = new THREE.Group();
  fig.scale.setScalar(tall / BUILT);
  root.add(fig);

  const skin = skinMat(kid.skin);
  const shirt = skinMat(kid.shirt, 0.88);
  const pants = skinMat(kid.pants, 0.86);
  const shoes = skinMat(kid.shoes, 0.7);
  const hair = hairMat(kid.hair);
  const hairDark = hairMat(shade(kid.hair, 0.72));

  // Hips and legs.
  const hips = joint(fig, 0, HIP, 0);
  mesh(geo('pelvis', () => new THREE.CylinderGeometry(0.128, 0.134, 0.13, 16).scale(1, 1, 0.7).translate(0, 0.03, 0)), pants, hips);
  const legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }[] = [];
  for (const side of [-1, 1]) {
    const hip = joint(hips, side * 0.066, 0, 0);
    mesh(geo('thigh', () => new THREE.CylinderGeometry(0.062, 0.048, THIGH, 12).translate(0, -THIGH / 2, 0)), pants, hip);
    const knee = joint(hip, 0, -THIGH, 0);
    mesh(geo('knee', () => new THREE.SphereGeometry(0.049, 10, 6)), pants, knee);
    mesh(geo('shin', () => new THREE.CylinderGeometry(0.047, 0.036, SHIN, 12).translate(0, -SHIN / 2, 0)), pants, knee);
    const ankle = joint(knee, 0, -SHIN, 0);
    mesh(geo('shoe', () => new THREE.CapsuleGeometry(0.046, 0.1, 4, 10).rotateX(Math.PI / 2).scale(1.05, 0.78, 1).translate(0, -0.032, 0.04)), shoes, ankle);
    mesh(geo('sole', () => new THREE.BoxGeometry(0.094, 0.022, 0.2).translate(0, -0.062, 0.04)), skinMat('#f3f1ec', 0.9), ankle);
    legs.push({ hip, knee, ankle });
  }

  // The body: a T-shirt, a little narrower at the waist, with a round neckline.
  const spine = joint(fig, 0, WAIST, 0);
  mesh(geo('torso', () => {
    const g = new THREE.CylinderGeometry(0.142, 0.122, SHOULDER + 0.02, 18, 3).scale(1, 1, 0.64).translate(0, SHOULDER / 2, 0);
    // Round off the shoulders.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > SHOULDER - 0.02) p.setXYZ(i, p.getX(i) * 0.82, y, p.getZ(i) * 0.9);
    }
    g.computeVertexNormals();
    return g;
  }), shirt, spine);
  mesh(geo('shoulders', () => new THREE.CapsuleGeometry(0.06, 0.17, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.82).translate(0, SHOULDER - 0.03, 0)), shirt, spine);
  mesh(geo('neckline', () => new THREE.TorusGeometry(0.048, 0.01, 6, 16).rotateX(Math.PI / 2).translate(0, SHOULDER + 0.012, 0.004)), skinMat(shade(kid.shirt, 0.8), 0.88), spine);

  // Arms: a sleeve, a bare arm, a hand.
  const arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(spine, side * 0.15, SHOULDER - 0.035, 0);
    shoulder.rotation.z = side * 0.09;
    mesh(geo('sleeve', () => new THREE.CylinderGeometry(0.05, 0.047, 0.11, 12, 1, true).translate(0, -0.045, 0)), shirt, shoulder);
    mesh(geo('sleeveTop', () => new THREE.SphereGeometry(0.05, 12, 8)), shirt, shoulder);
    mesh(geo('upper', () => new THREE.CylinderGeometry(0.036, 0.031, UPPER, 10).translate(0, -UPPER / 2, 0)), skin, shoulder);
    const elbow = joint(shoulder, 0, -UPPER, 0);
    mesh(geo('elbow', () => new THREE.SphereGeometry(0.031, 8, 6)), skin, elbow);
    mesh(geo('fore', () => new THREE.CylinderGeometry(0.031, 0.025, FORE, 10).translate(0, -FORE / 2, 0)), skin, elbow);
    mesh(geo('hand', () => new THREE.SphereGeometry(0.034, 10, 8).scale(0.72, 1.18, 0.55).translate(0, -FORE - 0.035, 0)), skin, elbow);
    arms.push({ shoulder, elbow });
  }

  // Neck and head: a kid's big round head, a soft jaw, ears and a button nose.
  const neck = joint(spine, 0, SHOULDER + 0.01, 0);
  mesh(geo('neck', () => new THREE.CylinderGeometry(0.036, 0.04, 0.08, 10).translate(0, 0.03, 0)), skin, neck);
  const head = joint(neck, 0, 0.155, 0.005);
  const skull = mesh(geo('skull', () => {
    // One smooth piece: a round crown, full cheeks, and a jaw that narrows to a small chin.
    const r = 0.108, g = new THREE.SphereGeometry(r, 32, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ny = y / r;
      if (ny < 0) {
        const d = -ny;
        x *= 1 - 0.2 * Math.pow(d, 1.7);
        z *= 1 - 0.08 * d * d;
        y *= 1 + 0.1 * d;
        // Kids' cheeks: a little fuller just under the eyes.
        if (z > 0) z += 0.008 * Math.sin(Math.min(1, d * 1.8) * Math.PI) * (z / r);
      }
      p.setXYZ(i, x * 0.93, y * 1.02, z * 0.98);
    }
    g.computeVertexNormals();
    return g;
  }), skin, head);
  for (const side of [-1, 1]) mesh(geo('ear', () => new THREE.SphereGeometry(0.024, 8, 6).scale(0.42, 0.85, 0.6)), skin, head, side * 0.099, -0.008, -0.004);
  mesh(geo('nose', () => new THREE.SphereGeometry(0.014, 8, 6).scale(0.95, 0.85, 0.9)), skinMat(shade(kid.skin, 0.97)), head, 0, -0.022, 0.104, false);

  // The face: her own eye color, a glint, brows, a smile and rosy cheeks.
  const eyes = new THREE.Group();
  head.add(eyes);
  for (const side of [-1, 1]) {
    const x = side * 0.038;
    mesh(geo('sclera', () => new THREE.SphereGeometry(0.02, 14, 10).scale(1.12, 0.98, 0.42)), flat('#fbfbf8'), eyes, x, 0.006, 0.091, false);
    mesh(geo('iris', () => new THREE.CircleGeometry(0.0128, 18)), flat(kid.eyes), eyes, x, 0.005, 0.0995, false);
    mesh(geo('pupil', () => new THREE.CircleGeometry(0.0064, 14)), flat('#120c08'), eyes, x, 0.005, 0.1, false);
    mesh(geo('glint', () => new THREE.CircleGeometry(0.0034, 8)), flat('#ffffff'), eyes, x + 0.004, 0.0095, 0.1005, false);
    mesh(geo('lid', () => new THREE.TorusGeometry(0.019, 0.0026, 4, 12, Math.PI).scale(1.1, 0.9, 1)), flat(shade(kid.hair, 0.45)), eyes, x, 0.008, 0.096, false);
    const brow = mesh(geo('brow', () => new THREE.CapsuleGeometry(0.0042, 0.024, 2, 6).rotateZ(Math.PI / 2)), flat(shade(kid.hair, 0.78)), head, side * 0.039, 0.04, 0.097, false);
    brow.rotation.z = side * -0.12;
    const cheek = mesh(geo('cheek', () => new THREE.CircleGeometry(0.017, 14)), flat('#f28b8b', 0.35), head, side * 0.058, -0.03, 0.083, false);
    cheek.rotation.y = side * 0.55;
  }
  const smile = mesh(geo('smile', () => new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI).rotateZ(Math.PI)), flat('#b5524f'), head, 0, -0.052, 0.094, false);
  smile.rotation.x = -0.2;

  // Hair: a cap that leaves her forehead clear, a side-swept fringe, and then how she's
  // wearing it today.
  mesh(geo('hairCap', () => {
    // Over the crown and down the sides, with a soft curved hairline that leaves her
    // forehead clear and comes down at the temples.
    const r = 0.117, g = new THREE.SphereGeometry(r, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      let y = p.getY(i), z = p.getZ(i);
      const nx = x / r, line = r * (0.4 - 0.6 * nx * nx + 0.06 * nx);
      if (z > 0 && y < line) { y = line; z = Math.sqrt(Math.max(0, r * r - x * x - y * y)); }
      p.setXYZ(i, x * 0.94, y * 1.02 + 0.004, z * 0.99 - 0.004);
    }
    g.computeVertexNormals();
    return g;
  }), hair, head);
  mesh(geo('part', () => new THREE.SphereGeometry(0.1195, 14, 6, 0.9, 0.9, 0.1, 0.5).scale(0.94, 1.02, 0.99).translate(0, 0.004, -0.004)), hairDark, head);
  const back = (len: number) => geo(`back${len}`, () => {
    // Her hair falling down her back: full at the top, a little wider and flatter at the ends.
    const g = new THREE.CapsuleGeometry(0.11, len, 8, 20);
    const p = g.attributes.position;
    const top = len / 2 + 0.11, bottom = -top;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = (top - y) / (top - bottom);
      p.setXYZ(i, p.getX(i) * (1 + t * 0.22), y - len / 2 - 0.01, p.getZ(i) * (0.62 - t * 0.12) - 0.042 - t * 0.02);
    }
    g.computeVertexNormals();
    return g;
  });
  if (kid.style === 'down') {
    const len = kid.length === 'long' ? 0.28 : 0.07;
    mesh(back(len), hair, head);
    // Locks that fall in front of her shoulders when it's long, and frame her face either way.
    for (const side of [-1, 1]) {
      const l = kid.length === 'long' ? 0.27 : 0.12;
      const lock = mesh(geo(`lock${l}`, () => new THREE.CapsuleGeometry(0.026, l, 4, 10).scale(1.25, 1, 0.5).translate(0, -l / 2, 0)), hair, head, side * 0.098, 0.0, 0.03);
      lock.rotation.z = side * 0.2;
      lock.rotation.x = kid.length === 'long' ? -0.2 : -0.05;
    }
  } else if (kid.style === 'ponytail') {
    const tie = joint(head, 0, 0.035, -0.11);
    mesh(geo('scrunchie', () => new THREE.TorusGeometry(0.022, 0.011, 6, 14)), skinMat(kid.shirt, 0.9), tie).rotation.x = 1.2;
    const tail = mesh(geo(`tail${kid.length}`, () => new THREE.CapsuleGeometry(0.032, kid.length === 'long' ? 0.3 : 0.18, 4, 10).translate(0, -(kid.length === 'long' ? 0.17 : 0.11), 0).scale(1, 1, 0.8)), hair, tie);
    tail.rotation.x = 0.35;
    root.userData.tail = tie;
  } else {
    for (const side of [-1, 1]) {
      const braid = joint(head, side * 0.085, -0.03, -0.045);
      braid.rotation.z = side * 0.12;
      braid.rotation.x = -0.3;
      const n = kid.length === 'long' ? 8 : 5;
      for (let i = 0; i < n; i++) mesh(geo('plait', () => new THREE.SphereGeometry(0.024, 10, 8).scale(1, 1.25, 1)), i % 2 ? hairDark : hair, braid, (i % 2 ? 0.004 : -0.004), -0.03 - i * 0.04, 0);
      mesh(geo('band', () => new THREE.SphereGeometry(0.015, 8, 6)), skinMat(kid.shirt, 0.9), braid, 0, -0.03 - n * 0.04 + 0.01, 0);
    }
  }

  if (opts.sit) {
    // Sitting down to drive: hips at the seat, knees forward, hands out on the wheel.
    fig.position.y = -(HIP - 0.05) * (tall / BUILT);
    for (const l of legs) { l.hip.rotation.x = -1.45; l.knee.rotation.x = 1.35; }
    for (const a of arms) { a.shoulder.rotation.x = -0.75; a.elbow.rotation.x = -0.55; }
    root.userData.cam = 1;
    return { group: root, body: driver };
  }

  // Her own walk: how far she went since the last frame sets the stride.
  const was = new THREE.Vector3(), now = new THREE.Vector3(), sc = new THREE.Vector3();
  let last = 0, phase = 0, amp = 0, blink = 2 + Math.random() * 3, idle = Math.random() * 10, first = true;
  skull.onBeforeRender = () => {
    const t = performance.now();
    if (t - last < 4) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    root.getWorldPosition(now);
    root.getWorldScale(sc);
    const moved = first ? 0 : Math.hypot(now.x - was.x, now.z - was.z) / Math.max(0.01, sc.x);
    first = false;
    was.copy(now);
    // A jump to somewhere new (a door, a ride) isn't a step.
    const speed = moved / dt > 40 ? 0 : moved / dt;
    const run = THREE.MathUtils.clamp((speed - 2.2) / 3, 0, 1);
    amp += (THREE.MathUtils.clamp(speed / 1.6, 0, 1) * (0.5 + run * 0.35) - amp) * Math.min(1, dt * 8);
    phase += dt * Math.min(speed / 1.25, 2.9) * Math.PI * 2 * (speed > 0.15 ? 1 : 0);
    idle += dt;
    const s = Math.sin(phase), c = Math.cos(phase);
    legs.forEach((l, i) => {
      const lp = i ? -s : s, lc = i ? -c : c;
      l.hip.rotation.x = -amp * lp;
      l.knee.rotation.x = 0.06 + amp * 1.5 * Math.max(0, lc);
      l.ankle.rotation.x = -(l.hip.rotation.x + l.knee.rotation.x) * 0.6;
    });
    arms.forEach((a, i) => {
      a.shoulder.rotation.x = amp * 0.9 * (i ? -s : s);
      a.elbow.rotation.x = -0.12 - amp * 0.5 - run * 0.7;
    });
    const hop = Math.max(0, driver.position.y - 0.8);
    fig.position.y = amp > 0.08 ? (Math.abs(c) - 0.5) * 0.04 * amp : hop * 0.45;
    spine.rotation.x = run * 0.16;
    spine.rotation.y = s * amp * 0.12;
    head.rotation.y = amp > 0.08 ? 0 : Math.sin(idle * 0.37) * 0.25;
    neck.scale.y = 1 + (amp > 0.08 ? 0 : Math.sin(idle * 1.7) * 0.01);
    const tail = root.userData.tail as THREE.Object3D | undefined;
    if (tail) tail.rotation.z = Math.sin(phase) * amp * 0.5;
    // Blink every few seconds.
    blink -= dt;
    eyes.scale.y = blink < 0.12 ? 0.15 : 1;
    if (blink < 0) blink = 2.5 + Math.random() * 3.5;
  };

  root.userData.body = driver;
  root.userData.cam = 0.68;
  root.userData.real = true;
  root.userData.height = tall;
  return { group: root, body: driver };
}
