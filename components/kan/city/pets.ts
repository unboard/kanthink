import * as THREE from 'three';
import type { PetKind } from '@/lib/kan/city/interior';
import { hash } from '@/lib/kan/city/layout';
import { mat } from './models';

/**
 * The animals that live inside a building, and the things they play on. Built facing
 * +z with their feet on the floor, so the scene only has to place and turn them.
 * Everything that moves is its own object, so the scene can animate legs, tail,
 * head and eyes without knowing how a cat is put together.
 */

export interface PetFig {
  group: THREE.Group;
  /** Everything above the feet: bobs, hops, sits and lies down. */
  rig: THREE.Group;
  head: THREE.Group;
  /** Front left, front right, back left, back right; each swings from the hip. */
  legs: THREE.Group[];
  tail: THREE.Group;
  eyes: THREE.Group[];
  scale: number;
}

const NAMES: Record<PetKind, string[]> = {
  cat: ['Mochi', 'Pepper', 'Luna', 'Ziggy', 'Biscuit', 'Noodle', 'Olive', 'Tofu'],
  kitten: ['Pip', 'Bean', 'Sprout', 'Button', 'Nugget', 'Fig', 'Dot', 'Jellybean'],
  dog: ['Max', 'Rosie', 'Waffles', 'Scout', 'Pickle', 'Maple', 'Buddy', 'Hazel'],
  puppy: ['Bubbles', 'Taco', 'Peanut', 'Socks', 'Muffin', 'Ollie', 'Pudding', 'Bear'],
  bunny: ['Clover', 'Thumper', 'Daisy', 'Cocoa', 'Marsh', 'Hops', 'Willow', 'Puff'],
};
const FUR: Record<PetKind, string[]> = {
  cat: ['#f2a65a', '#3a3a3a', '#e8e1d6', '#9a9aa2'],
  kitten: ['#f5d6a8', '#f2a65a', '#e8e1d6', '#3a3a3a'],
  dog: ['#c8783c', '#e8d2a8', '#3a2a22', '#f5f0e6'],
  puppy: ['#e8d2a8', '#c8783c', '#f5f0e6', '#7a5236'],
  bunny: ['#f5f0e6', '#c9b49a', '#9a9aa2', '#7a5236'],
};
const SIZE: Record<PetKind, number> = { cat: 1.25, kitten: 0.85, dog: 1.45, puppy: 0.95, bunny: 1.05 };

/** Picks a pet's default name and fur, the same in the scene and the panel. */
export const petSeed = (channelId: string, i: number, kind: PetKind) => hash(`${channelId}:pet${i}:${kind}`) >>> 0;
export const petName = (kind: PetKind, seed: number) => NAMES[kind][seed % NAMES[kind].length];
export const petFur = (kind: PetKind, seed: number) => FUR[kind][seed % FUR[kind].length];
/** Cats climb; everyone else stays on the floor. */
export const climbs = (kind: PetKind) => kind === 'cat' || kind === 'kitten';

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
const sphere = (r: number) => new THREE.SphereGeometry(r, 14, 10);

/** Paler fur for the muzzle and belly. */
function pale(hex: string) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#fff8ee'), 0.6).getHexString();
}

export function petFigure(kind: PetKind, color: string): PetFig {
  const dog = kind === 'dog' || kind === 'puppy', bunny = kind === 'bunny', cat = !dog && !bunny;
  const fur = mat(color, { rough: 0.95 });
  const light = mat(pale(color), { rough: 0.95 });
  const dark = mat('#1b1430');
  const pink = mat('#ff9fb8');
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // Body, with a paler belly.
  const body = add(rig, sphere(0.26), fur, 0, 0.36, 0);
  body.scale.set(0.9, 0.8, bunny ? 1.05 : 1.35);
  add(rig, sphere(0.2), light, 0, 0.3, 0.06).scale.set(0.85, 0.7, 1.2);

  // Legs swing from the hip.
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.11, 0.17], [0.11, 0.17], [-0.11, -0.17], [0.11, -0.17]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.3, bunny ? z * 0.7 : z);
    add(hip, new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8), fur, 0, -0.15, 0);
    add(hip, sphere(0.055), light, 0, -0.29, 0.02).scale.set(1, 0.6, 1.3);
    rig.add(hip);
    legs.push(hip);
  }

  // The head, with a face.
  const head = new THREE.Group();
  head.position.set(0, bunny ? 0.56 : 0.6, bunny ? 0.24 : 0.32);
  rig.add(head);
  add(head, sphere(dog ? 0.2 : 0.19), fur, 0, 0, 0).scale.set(1.05, 0.95, 1);
  add(head, sphere(0.09), light, 0, -0.05, dog ? 0.16 : 0.14).scale.set(1.25, 0.8, dog ? 1.2 : 0.85);
  add(head, sphere(dog ? 0.04 : 0.028), dog ? dark : pink, 0, dog ? -0.01 : -0.02, dog ? 0.26 : 0.215);
  const eyes: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.075, 0.045, 0.155);
    add(eye, sphere(0.045), mat('#ffffff', { rough: 0.3 }));
    add(eye, sphere(0.032), mat(cat ? '#3f8a3c' : '#4a2c1c', { rough: 0.3 }), 0, 0, 0.018);
    add(eye, sphere(0.02), dark, 0, 0, 0.035);
    add(eye, sphere(0.009), mat('#ffffff', { emissive: '#ffffff', intensity: 0.6 }), s * 0.008, 0.012, 0.05);
    head.add(eye);
    eyes.push(eye);
    // Rosy cheeks.
    add(head, sphere(0.03), mat('#ffb3c7', { rough: 1 }), s * 0.12, -0.04, 0.12).scale.set(1, 0.6, 0.4);
    // A little smile: two tiny strokes under the nose.
    const smile = add(head, new THREE.BoxGeometry(0.045, 0.011, 0.01), dark, s * 0.02, dog ? -0.07 : -0.075, dog ? 0.245 : 0.2);
    smile.rotation.z = s * 0.45;
    if (cat) {
      for (const k of [-1, 0, 1]) {
        const w = add(head, new THREE.BoxGeometry(0.16, 0.006, 0.006), mat('#ffffff'), s * 0.16, -0.045 + k * 0.022, 0.15);
        w.rotation.z = s * k * 0.18;
      }
    }
  }
  if (dog) add(head, new THREE.BoxGeometry(0.05, 0.012, 0.06), pink, 0, -0.1, 0.24).rotation.x = 0.5;

  // Ears.
  for (const s of [-1, 1]) {
    if (cat) {
      const ear = add(head, new THREE.ConeGeometry(0.075, 0.15, 4), fur, s * 0.11, 0.16, -0.01);
      ear.rotation.z = -s * 0.3;
      const inner = add(head, new THREE.ConeGeometry(0.04, 0.09, 4), pink, s * 0.105, 0.155, 0.02);
      inner.rotation.z = -s * 0.3;
    } else if (dog) {
      const ear = add(head, sphere(0.08), mat(new THREE.Color(color).multiplyScalar(0.7).getStyle()), s * 0.18, 0.0, -0.02);
      ear.scale.set(0.5, 1.4, 0.8);
      ear.rotation.z = s * 0.25;
    } else {
      const ear = new THREE.Group();
      ear.position.set(s * 0.07, 0.14, -0.03);
      ear.rotation.z = -s * 0.15;
      add(ear, new THREE.CapsuleGeometry(0.045, 0.24, 4, 8), fur, 0, 0.15, 0);
      add(ear, new THREE.CapsuleGeometry(0.025, 0.2, 4, 8), pink, 0, 0.15, 0.025);
      head.add(ear);
    }
  }

  // Tail: long and swishy on a cat, a wagger on a dog, a puff on a bunny.
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, bunny ? -0.25 : -0.33);
  rig.add(tail);
  if (bunny) add(tail, sphere(0.09), mat('#ffffff', { rough: 1 }), 0, 0, -0.02);
  else {
    const len = cat ? 0.42 : 0.26;
    const t = add(tail, new THREE.CylinderGeometry(0.03, cat ? 0.04 : 0.045, len, 8), fur, 0, len / 2, 0);
    tail.rotation.x = cat ? -0.5 : -0.9;
    if (cat) add(tail, sphere(0.04), fur, 0, len, 0);
    void t;
  }

  const scale = SIZE[kind];
  group.scale.setScalar(scale);
  return { group, rig, head, legs, tail, eyes, scale };
}

/** Where a pet can sit on the tower, relative to its base, and how high. */
export const TOWER_PERCHES: [number, number, number][] = [[0.28, 0.8, 0.25], [-0.25, 1.42, -0.18], [0.05, 2.18, 0.02]];

/** A carpeted cat tower: three perches, a cubby on top, a ball on a string. */
export function catTower(tick: (f: (t: number) => void) => void): THREE.Group {
  const g = new THREE.Group();
  const carpet = mat('#c9a27e', { rough: 1 }), sisal = mat('#d8c08f', { rough: 1 }), plush = mat('#f28fae', { rough: 1 });
  add(g, new THREE.BoxGeometry(1.25, 0.12, 1.25), carpet, 0, 0.06, 0);
  for (const [x, z, h] of [[0.28, 0.25, 0.76], [-0.25, -0.18, 1.38], [0.05, 0.02, 1.9]]) add(g, new THREE.CylinderGeometry(0.09, 0.09, h, 10), sisal, x, h / 2, z);
  add(g, new THREE.BoxGeometry(0.75, 0.08, 0.75), carpet, 0.28, 0.76, 0.25);
  add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 18), plush, -0.25, 1.38, -0.18);
  const cubby = add(g, new THREE.BoxGeometry(0.72, 0.45, 0.72), carpet, 0.05, 1.92, 0.02);
  add(cubby, new THREE.CircleGeometry(0.16, 16), mat('#2a1d18'), 0, -0.02, 0.362);
  add(g, new THREE.CylinderGeometry(0.38, 0.38, 0.07, 18), plush, 0.05, 2.16, 0.02);
  const string = new THREE.Group();
  string.position.set(0.55, 0.72, 0.5);
  add(string, new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), mat('#ffffff'), 0, -0.17, 0);
  add(string, sphere(0.06), mat('#ff5fa2'), 0, -0.36, 0);
  g.add(string);
  tick((t) => { string.rotation.z = Math.sin(t * 2.2) * 0.35; string.rotation.x = Math.cos(t * 1.7) * 0.2; });
  return g;
}

/** Something on the floor to chase: a ball, a ball of yarn or a toy mouse. */
export function toy(kind: number): THREE.Group {
  const g = new THREE.Group();
  const k = kind % 3;
  if (k === 0) {
    add(g, sphere(0.13), mat('#ef4444', { rough: 0.5 }), 0, 0.13, 0);
    add(g, new THREE.TorusGeometry(0.13, 0.025, 6, 18), mat('#facc15'), 0, 0.13, 0);
  } else if (k === 1) {
    add(g, sphere(0.14), mat('#a78bfa', { rough: 1 }), 0, 0.14, 0);
    const loop = add(g, new THREE.TorusGeometry(0.14, 0.018, 4, 18), mat('#ddd6fe'), 0, 0.14, 0);
    loop.rotation.y = 0.8;
  } else {
    add(g, sphere(0.1), mat('#9a9aa2', { rough: 1 }), 0, 0.08, 0).scale.set(0.8, 0.7, 1.4);
    for (const s of [-1, 1]) add(g, sphere(0.04), mat('#ff9fb8'), s * 0.06, 0.15, 0.06);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), mat('#ff9fb8'), 0, 0.05, -0.24).rotation.x = Math.PI / 2;
  }
  return g;
}
