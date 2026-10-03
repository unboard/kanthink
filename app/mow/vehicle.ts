// Clean Cut — the riding mower, the operator and the string trimmer.
// Everything faces +X; +Z is the right-hand side (where the chute throws clippings).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TexLib } from './textures';

const rbox = (w: number, h: number, d: number, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export interface Materials {
  paint: THREE.MeshPhysicalMaterial;
  paint2: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  rim: THREE.MeshPhysicalMaterial;
  seat: THREE.MeshPhysicalMaterial;
  lens: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
}

export function vehicleMaterials(): Materials {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: '#c8361a', roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    paint2: new THREE.MeshPhysicalMaterial({ color: '#f2c230', roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.5, metalness: 0.55 }),
    plastic: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.62, metalness: 0 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.12, metalness: 1 }),
    tire: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshPhysicalMaterial({ color: '#f2c230', roughness: 0.3, metalness: 0.3, clearcoat: 0.7 }),
    seat: new THREE.MeshPhysicalMaterial({ color: '#111111', roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    lens: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4cc', emissiveIntensity: 0.6, roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0b0b', emissive: '#ff2a1a', emissiveIntensity: 0.25, roughness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1d262c', roughness: 0.04, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.4 }),
  };
}

/** A tyre as a lathe (rounded section) plus chevron tread lugs, axis along Z. */
function wheel(r: number, w: number, mats: Materials, lugs = 22): THREE.Group {
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  const rr = Math.min(w * 0.35, r * 0.25);
  const inner = r * 0.62;
  prof.push(new THREE.Vector2(inner, -w / 2));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr));
  }
  prof.push(new THREE.Vector2(inner, w / 2));
  const tireGeo = new THREE.LatheGeometry(prof, 40);
  tireGeo.rotateX(Math.PI / 2);
  g.add(mesh(tireGeo, mats.tire));
  // tread lugs
  const lugGeo = rbox(r * 0.16, r * 0.07, w * 0.42, 0.01, 1);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const l = mesh(lugGeo, mats.tire, Math.cos(a) * (r + r * 0.02), Math.sin(a) * (r + r * 0.02), side * w * 0.22, false);
      l.rotation.z = a + Math.PI / 2;
      l.rotation.y = side * 0.45;
      g.add(l);
    }
  }
  // rim + hub
  const rim = new THREE.CylinderGeometry(inner * 1.02, inner * 1.02, w * 0.82, 28);
  rim.rotateX(Math.PI / 2);
  g.add(mesh(rim, mats.rim));
  const dish = new THREE.CylinderGeometry(inner * 0.55, inner * 0.8, 0.02, 28);
  dish.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const d = mesh(dish, mats.rim, 0, 0, side * w * 0.42);
    d.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(d);
    const cap = new THREE.SphereGeometry(inner * 0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateX(side * Math.PI / 2);
    g.add(mesh(cap, mats.chrome, 0, 0, side * w * 0.43, false));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), mats.chrome, Math.cos(a) * inner * 0.42, Math.sin(a) * inner * 0.42, side * w * 0.44, false));
    }
  }
  return g;
}

export interface MowerRig {
  root: THREE.Group;
  body: THREE.Group; // bobs and tilts
  frontPivots: THREE.Group[];
  wheels: { obj: THREE.Group; r: number }[];
  steering: THREE.Group;
  deck: THREE.Group;
  lever: THREE.Group;
  driverSeat: THREE.Vector3;
  headlights: THREE.Mesh[];
  chuteMouth: THREE.Vector3;
  bladeDisc: THREE.Mesh;
}

export function buildMower(lib: TexLib, mats: Materials): MowerRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // —— hood: an extruded, bevelled side profile
  const s = new THREE.Shape();
  s.moveTo(0.16, 0.38);
  s.lineTo(0.9, 0.38);
  s.quadraticCurveTo(1.0, 0.39, 1.0, 0.5);
  s.lineTo(0.985, 0.6);
  s.quadraticCurveTo(0.96, 0.71, 0.83, 0.735);
  s.lineTo(0.3, 0.8);
  s.quadraticCurveTo(0.18, 0.815, 0.16, 0.74);
  s.closePath();
  const hood = new THREE.ExtrudeGeometry(s, { depth: 0.58, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.04, bevelSegments: 5, curveSegments: 14 });
  hood.translate(0, 0, -0.29);
  body.add(mesh(hood, mats.paint));
  // hood seam + vents
  for (const z of [-0.18, 0.18]) {
    for (let i = 0; i < 4; i++) body.add(mesh(rbox(0.12, 0.012, 0.02, 0.005, 1), mats.plastic, 0.55 + i * 0.07, 0.78 - i * 0.008, z, false));
  }
  // grille + headlights
  body.add(mesh(rbox(0.05, 0.2, 0.46, 0.02), mats.plastic, 1.02, 0.5, 0));
  for (let i = 0; i < 5; i++) body.add(mesh(rbox(0.02, 0.012, 0.42, 0.004, 1), mats.chrome, 1.05, 0.43 + i * 0.035, 0, false));
  const headlights: THREE.Mesh[] = [];
  for (const z of [-0.2, 0.2]) {
    const bezel = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 20);
    bezel.rotateZ(Math.PI / 2);
    body.add(mesh(bezel, mats.chrome, 1.0, 0.63, z, false));
    const lens = new THREE.CylinderGeometry(0.046, 0.046, 0.02, 20);
    lens.rotateZ(Math.PI / 2);
    const l = mesh(lens, mats.lens, 1.02, 0.63, z, false);
    headlights.push(l);
    body.add(l);
  }
  // decals on the hood flanks
  const decalMat = new THREE.MeshStandardMaterial({ map: lib.decal(), transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115), decalMat);
    p.position.set(0.6, 0.6, side * 0.336);
    p.rotation.y = side > 0 ? 0 : Math.PI;
    body.add(p);
  }

  // —— chassis, rear body, fenders
  body.add(mesh(rbox(1.75, 0.08, 0.5, 0.02), mats.dark, 0.02, 0.3, 0));
  body.add(mesh(rbox(1.05, 0.22, 0.68, 0.05), mats.paint, -0.42, 0.48, 0));
  body.add(mesh(rbox(0.86, 0.06, 1.1, 0.03), mats.paint, -0.52, 0.62, 0));
  const fenderMat = mats.paint.clone();
  fenderMat.side = THREE.DoubleSide;
  for (const z of [-0.47, 0.47]) {
    // upper half-shell over each rear tyre
    const f = new THREE.CylinderGeometry(0.43, 0.43, 0.28, 32, 1, true, Math.PI / 2, Math.PI);
    f.rotateX(Math.PI / 2);
    body.add(mesh(f, fenderMat, -0.55, 0.36, z));
  }
  // footrests
  for (const z of [-0.4, 0.4]) {
    body.add(mesh(rbox(0.5, 0.03, 0.2, 0.01), mats.dark, 0.0, 0.37, z));
    for (let i = 0; i < 6; i++) body.add(mesh(rbox(0.05, 0.006, 0.16, 0.002, 1), mats.chrome, -0.2 + i * 0.08, 0.388, z, false));
  }
  // dash console, column, wheel
  body.add(mesh(rbox(0.22, 0.34, 0.52, 0.06), mats.paint, 0.16, 0.8, 0));
  body.add(mesh(rbox(0.16, 0.04, 0.4, 0.02), mats.plastic, 0.14, 0.98, 0));
  for (const z of [-0.1, 0.1]) {
    const gauge = new THREE.CylinderGeometry(0.035, 0.035, 0.01, 18);
    body.add(mesh(gauge, mats.chrome, 0.12, 1.0, z, false));
  }
  const col = new THREE.CylinderGeometry(0.022, 0.026, 0.38, 12);
  const colM = mesh(col, mats.plastic, 0.06, 1.04, 0);
  colM.rotation.z = 0.55;
  body.add(colM);
  const steering = new THREE.Group();
  steering.position.set(-0.04, 1.18, 0);
  steering.rotation.z = 0.95;
  const ring = new THREE.TorusGeometry(0.165, 0.018, 12, 40);
  ring.rotateX(Math.PI / 2);
  steering.add(mesh(ring, mats.plastic));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const sp = mesh(rbox(0.16, 0.012, 0.025, 0.005, 1), mats.plastic, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, false);
    sp.rotation.y = -a;
    steering.add(sp);
  }
  steering.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), mats.chrome));
  body.add(steering);
  // seat
  const seatBase = mesh(rbox(0.46, 0.1, 0.5, 0.045, 4), mats.seat, -0.45, 0.72, 0);
  body.add(seatBase);
  const back = mesh(rbox(0.1, 0.44, 0.5, 0.045, 4), mats.seat, -0.7, 0.94, 0);
  back.rotation.z = 0.2;
  body.add(back);
  body.add(mesh(rbox(0.3, 0.08, 0.36, 0.02), mats.dark, -0.45, 0.65, 0));
  // lift lever on the left fender
  const lever = new THREE.Group();
  lever.position.set(-0.2, 0.66, -0.5);
  lever.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), mats.chrome, 0, 0.15, 0, false));
  lever.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), mats.paint2, 0, 0.31, 0, false));
  body.add(lever);
  // fuel cap, exhaust, tail lights, hitch
  body.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16), mats.plastic, -0.3, 0.66, 0.42, false));
  const ex = new THREE.CylinderGeometry(0.028, 0.028, 0.22, 12);
  const exm = mesh(ex, mats.chrome, 0.5, 0.52, -0.38, false);
  exm.rotation.z = Math.PI / 2;
  body.add(exm);
  for (const z of [-0.26, 0.26]) body.add(mesh(rbox(0.03, 0.06, 0.1, 0.01, 1), mats.tail, -0.96, 0.52, z, false));
  body.add(mesh(rbox(0.08, 0.04, 0.16, 0.01, 1), mats.dark, -0.98, 0.33, 0));

  // —— deck (raised/lowered with the deck height)
  const deck = new THREE.Group();
  deck.position.set(0.06, 0.16, 0.04);
  deck.add(mesh(rbox(0.8, 0.13, 1.34, 0.06, 4), mats.dark, 0, 0, 0));
  deck.add(mesh(rbox(0.6, 0.03, 0.9, 0.02), mats.paint, 0, 0.075, -0.1));
  const chute = mesh(rbox(0.34, 0.08, 0.26, 0.03), mats.plastic, 0.0, 0.0, 0.76);
  chute.rotation.x = -0.25;
  deck.add(chute);
  for (const z of [-0.6, 0.6]) {
    const aw = new THREE.CylinderGeometry(0.04, 0.04, 0.035, 14);
    aw.rotateX(Math.PI / 2);
    deck.add(mesh(aw, mats.plastic, 0.42, -0.04, z, false));
  }
  // blur disc under the deck (seen when tipping over curbs)
  const bladeDisc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: '#999', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
  bladeDisc.rotation.x = Math.PI / 2;
  bladeDisc.position.y = -0.07;
  deck.add(bladeDisc);
  body.add(deck);

  // —— wheels
  const wheels: { obj: THREE.Group; r: number }[] = [];
  for (const z of [-0.47, 0.47]) {
    const w = wheel(0.36, 0.26, mats, 22);
    w.position.set(-0.55, 0.36, z);
    root.add(w);
    wheels.push({ obj: w, r: 0.36 });
  }
  const frontPivots: THREE.Group[] = [];
  for (const z of [-0.38, 0.38]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.7, 0.2, z);
    const w = wheel(0.2, 0.15, mats, 16);
    pivot.add(w);
    root.add(pivot);
    frontPivots.push(pivot);
    wheels.push({ obj: w, r: 0.2 });
  }
  // front axle
  body.add(mesh(rbox(0.08, 0.06, 0.72, 0.02), mats.dark, 0.7, 0.24, 0));

  return {
    root,
    body,
    frontPivots,
    wheels,
    steering,
    deck,
    lever,
    driverSeat: new THREE.Vector3(-0.47, 0.78, 0),
    headlights,
    chuteMouth: new THREE.Vector3(0.06, 0.1, 0.9),
    bladeDisc,
  };
}

// ———————————————————————————————————————— the operator

export interface PersonRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  lArm: THREE.Group;
  lFore: THREE.Group;
  rArm: THREE.Group;
  rFore: THREE.Group;
  lLeg: THREE.Group;
  lShin: THREE.Group;
  rLeg: THREE.Group;
  rShin: THREE.Group;
}

export function buildPerson(): PersonRig {
  const skin = new THREE.MeshPhysicalMaterial({ color: '#c58a64', roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#ffb59a') });
  const shirt = new THREE.MeshStandardMaterial({ color: '#2b7a4b', roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: '#3a4656', roughness: 0.9 });
  const boots = new THREE.MeshStandardMaterial({ color: '#5a3c22', roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: '#c8361a', roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3, metalness: 0.3 });
  const muff = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: '#d7ff3a', roughness: 0.7, emissive: '#222f00', emissiveIntensity: 0.4 });

  const cap_ = (r: number, len: number, mat: THREE.Material, y: number) => {
    const m = mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat, 0, y, 0);
    return m;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const pelvis = cap_(0.15, 0.1, pants, 0.02);
  pelvis.scale.set(0.75, 1, 1.05);
  pelvis.rotation.x = Math.PI / 2;
  hips.add(pelvis);
  hips.add(mesh(rbox(0.08, 0.05, 0.36, 0.02), dark, 0, 0.1, 0)); // belt

  const torso = new THREE.Group();
  torso.position.y = 0.08;
  hips.add(torso);
  const chest = cap_(0.17, 0.3, shirt, 0.3);
  chest.scale.set(0.7, 1, 1.12);
  torso.add(chest);
  const vestM = cap_(0.175, 0.24, vest, 0.3);
  vestM.scale.set(0.72, 0.98, 1.13);
  torso.add(vestM);
  torso.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin, 0, 0.6, 0));
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.11, 24, 18), skin, 0, 0.1, 0);
  skull.scale.set(1.0, 1.12, 0.92);
  head.add(skull);
  const hairM = mesh(new THREE.SphereGeometry(0.112, 20, 14), hair, -0.012, 0.11, 0);
  hairM.scale.set(1, 1.08, 0.94);
  head.add(hairM);
  head.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), skin, 0.105, 0.09, 0)); // nose
  // cap
  const dome = new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeM = mesh(dome, cap, 0, 0.15, 0);
  domeM.scale.set(1.05, 0.85, 0.98);
  head.add(domeM);
  const brim = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), cap, 0.06, 0.155, 0);
  brim.scale.set(1.1, 1, 0.9);
  head.add(brim);
  // sunglasses + ear defenders
  head.add(mesh(rbox(0.03, 0.035, 0.17, 0.012), dark, 0.1, 0.115, 0));
  for (const z of [-0.105, 0.105]) {
    const cup = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16);
    cup.rotateX(Math.PI / 2);
    head.add(mesh(cup, muff, -0.005, 0.1, z));
  }
  const band = new THREE.TorusGeometry(0.12, 0.01, 6, 20, Math.PI);
  band.rotateY(Math.PI / 2);
  const bandM = mesh(band, dark, -0.005, 0.1, 0);
  head.add(bandM);

  const limb = (parent: THREE.Group, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  // arms (short sleeves)
  const lArm = limb(torso, 0, 0.5, -0.21);
  const rArm = limb(torso, 0, 0.5, 0.21);
  for (const a of [lArm, rArm]) {
    a.add(cap_(0.058, 0.12, shirt, -0.08));
    a.add(cap_(0.048, 0.16, skin, -0.17));
  }
  const lFore = limb(lArm, 0, -0.29, 0);
  const rFore = limb(rArm, 0, -0.29, 0);
  for (const f of [lFore, rFore]) {
    f.add(cap_(0.043, 0.2, skin, -0.13));
    f.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: '#6b4a2c', roughness: 0.8 }), 0, -0.28, 0)); // glove
  }
  // legs
  const lLeg = limb(hips, 0, -0.02, -0.1);
  const rLeg = limb(hips, 0, -0.02, 0.1);
  for (const l of [lLeg, rLeg]) l.add(cap_(0.078, 0.3, pants, -0.22));
  const lShin = limb(lLeg, 0, -0.45, 0);
  const rShin = limb(rLeg, 0, -0.45, 0);
  for (const s2 of [lShin, rShin]) {
    s2.add(cap_(0.064, 0.3, pants, -0.2));
    s2.add(mesh(rbox(0.28, 0.11, 0.12, 0.04), boots, 0.05, -0.44, 0));
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, hips, torso, head, lArm, lFore, rArm, rFore, lLeg, lShin, rLeg, rShin };
}

export function poseSeated(p: PersonRig, steer: number, bounce: number) {
  p.root.rotation.set(0, 0, 0);
  p.hips.position.set(0, 0, 0);
  p.hips.rotation.set(0, 0, -0.08 + bounce * 0.02);
  p.torso.rotation.set(steer * 0.08, 0, -0.06);
  p.head.rotation.set(0, -steer * 0.25, 0.08);
  for (const [leg, shin, side] of [[p.lLeg, p.lShin, -1], [p.rLeg, p.rShin, 1]] as const) {
    leg.rotation.set(side * 0.08, 0, 1.42);
    shin.rotation.set(0, 0, -1.25);
  }
  p.lArm.rotation.set(-0.15 - steer * 0.25, 0, 1.0 + steer * 0.25);
  p.rArm.rotation.set(0.15 - steer * 0.25, 0, 1.0 - steer * 0.25);
  p.lFore.rotation.set(0.2, 0, 0.55);
  p.rFore.rotation.set(-0.2, 0, 0.55);
}

export function poseWalk(p: PersonRig, phase: number, amt: number, trimming: boolean, swing: number) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p.hips.position.set(0, Math.abs(c) * 0.03 * amt, 0);
  p.hips.rotation.set(0, s * 0.06 * amt, 0);
  p.torso.rotation.set(0, trimming ? swing * 0.35 : -s * 0.1 * amt, trimming ? -0.18 : -0.04);
  p.head.rotation.set(0, trimming ? -swing * 0.25 : 0, trimming ? 0.25 : 0);
  p.lLeg.rotation.set(0, 0, s * 0.55 * amt);
  p.rLeg.rotation.set(0, 0, -s * 0.55 * amt);
  p.lShin.rotation.set(0, 0, -Math.max(0, -c) * 0.8 * amt - 0.05);
  p.rShin.rotation.set(0, 0, -Math.max(0, c) * 0.8 * amt - 0.05);
  if (trimming) {
    p.lArm.rotation.set(-0.35, 0, 0.75);
    p.rArm.rotation.set(0.25, 0, 0.35);
    p.lFore.rotation.set(0.3, 0, 0.6);
    p.rFore.rotation.set(-0.2, 0, 0.9);
  } else {
    p.lArm.rotation.set(-0.08, 0, -s * 0.5 * amt);
    p.rArm.rotation.set(0.08, 0, s * 0.5 * amt);
    p.lFore.rotation.set(0, 0, 0.25 + Math.max(0, s) * 0.4 * amt);
    p.rFore.rotation.set(0, 0, 0.25 + Math.max(0, -s) * 0.4 * amt);
  }
}

// ———————————————————————————————————————— string trimmer

export interface TrimmerRig {
  root: THREE.Group;
  head: THREE.Group;
  line: THREE.Mesh;
}

export function buildTrimmer(mats: Materials): TrimmerRig {
  const root = new THREE.Group();
  const orange = new THREE.MeshPhysicalMaterial({ color: '#e8641c', roughness: 0.4, clearcoat: 0.6 });
  // shaft from the engine (local origin, at the hip) down to the head at +X
  const len = 1.35;
  const shaft = new THREE.CylinderGeometry(0.014, 0.014, len, 10);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(len / 2, 0, 0);
  root.add(mesh(shaft, mats.chrome));
  root.add(mesh(rbox(0.26, 0.2, 0.16, 0.05), orange, -0.1, 0.02, 0));
  root.add(mesh(rbox(0.12, 0.1, 0.18, 0.03), mats.plastic, -0.02, -0.1, 0));
  // handle loop
  const loop = new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI * 1.4);
  const lm = mesh(loop, mats.plastic, 0.38, 0.06, 0);
  lm.rotation.y = Math.PI / 2;
  root.add(lm);
  const head = new THREE.Group();
  head.position.set(len, 0, 0);
  root.add(head);
  // head tilts so it sits flat on the ground; the game rotates `root`
  const guard = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24, 1, false, Math.PI * 0.1, Math.PI * 0.95);
  head.add(mesh(guard, orange, -0.04, 0.05, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 18), mats.plastic, 0, 0, 0));
  const line = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    new THREE.MeshBasicMaterial({ color: '#f6f2c0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = -0.03;
  head.add(line);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== line) o.castShadow = true;
  });
  return { root, head, line };
}
