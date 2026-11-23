// Pickleball: the 3D character. Built from Three.js primitives and small canvases, so
// it can be drawn for any Character with no model or texture files. Arcade proportions:
// the head is about 45% of the body's height, so people recognize each other from the
// far baseline, and the back of the figure (hair silhouette, jersey number, shoulder
// stripes) carries identity for the near players who face away from the camera.
//
// Shared by the court (render.ts) and the creator's turntable preview.

import * as THREE from 'three';
import { HEIGHT_SCALE, drawFace, wearsSkirt, type Character } from './characters';

export interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  paddlePivot: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  offArm: THREE.Object3D;
  chef: THREE.Object3D;
  /** materials that glow when the player is warming up or on fire */
  glow: THREE.MeshStandardMaterial[];
  scale: number;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.75): THREE.MeshStandardMaterial {
  // Shared per color; figures are rebuilt rarely, and the court disposes everything at the end.
  const key = `${color}|${rough}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    mats.set(key, m);
  }
  return m;
}
/** a material of its own, for parts that glow per player */
function own(color: string, rough = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 });
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const HEAD_R = 1.05;
const HEAD_Y = 4.55;

export function buildFigure(c: Character, teamColor: string): Figure {
  const scale = HEIGHT_SCALE[c.height];
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const shirt = own(c.primary, 0.7);
  const skinM = mat(c.skin, 0.8);
  const accent = mat(c.accent, 0.6);
  const lower = mat(c.outfit === 'tank' ? '#2a3140' : c.outfit === 'hoodie' ? c.accent : '#1f2630', 0.85);
  const hairM = mat(c.hairColor, 0.9);
  const glow = [shirt];

  // torso, tapered, with shoulder caps and an accent stripe across them
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 1.55, 16), shirt);
  torso.position.y = 2.95;
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 6, 12), shirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 3.62;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 6, 24), accent);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 3.35;
  body.add(torso, shoulders, stripe);
  if (c.outfit === 'hoodie') {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.18, 8, 20), shirt);
    hood.rotation.x = Math.PI / 2 + 0.25;
    hood.position.set(0, 3.95, 0.18);
    body.add(hood);
  }

  // back of the jersey: a big number, for the players facing away from the camera
  const num = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({
      transparent: true,
      map: canvasTex(128, 128, (g) => {
        g.font = 'bold 92px ui-sans-serif, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.strokeText(String(c.number), 64, 70);
        g.fillStyle = c.accent;
        g.fillText(String(c.number), 64, 70);
      }),
    }),
  );
  num.position.set(0, 3.0, 0.72);
  body.add(num);

  // hips: shorts, joggers, or a flared skirt
  if (wearsSkirt(c)) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.95, 0.75, 16), accent);
    skirt.position.y = 2.0;
    body.add(skirt);
  } else {
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.35, 6, 14), lower);
    hips.position.y = 2.1;
    body.add(hips);
  }

  // legs and sneakers
  const legs: THREE.Object3D[] = [];
  for (const sx of [-0.3, 0.3]) {
    const hip = new THREE.Group();
    hip.position.set(sx, 1.85, 0);
    const legMat = c.outfit === 'tank' ? lower : skinM;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.15, 4, 10), legMat);
    leg.position.y = -0.8;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.72), mat('#f4f4ef', 0.55));
    shoe.position.set(0, -1.5, -0.12);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.74), mat(teamColor, 0.5));
    sole.position.set(0, -1.62, -0.12);
    hip.add(leg, shoe, sole);
    body.add(hip);
    legs.push(hip);
  }

  // off arm
  const offArm = new THREE.Group();
  offArm.position.set(-0.85, 3.6, 0);
  const oa = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.0, 4, 8), skinM);
  oa.position.y = -0.6;
  const oh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skinM);
  oh.position.y = -1.2;
  offArm.add(oa, oh);
  offArm.rotation.z = -0.25;
  body.add(offArm);

  // head
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 28, 20), skinM);
  head.add(skull);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinM);
    ear.position.set(sx * HEAD_R * 0.98, -0.05, 0);
    head.add(ear);
  }
  // the face: a canvas on a curved patch at the front (models face -z)
  const face = new THREE.Mesh(
    // centered on phi = 1.5π, which three.js puts at -z: the front
    new THREE.SphereGeometry(HEAD_R * 1.005, 32, 24, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.2, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.8,
      map: canvasTex(256, 256, (g) => drawFace(g, { ...c, accessory: c.accessory === 'glasses' || c.accessory === 'shades' ? c.accessory : 'none' }, 128, 128, 108)),
      depthWrite: false,
    }),
  );
  head.add(face);
  addHair(head, c, hairM);
  addHeadwear(head, c);
  const chef = new THREE.Group();
  const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.75, 16), mat('#ffffff', 0.6));
  toque.position.y = HEAD_R + 0.25;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), mat('#ffffff', 0.6));
  puff.position.y = HEAD_R + 0.85;
  chef.add(toque, puff);
  chef.visible = false;
  head.add(chef);
  body.add(head);

  // paddle on the player's right, pivoting at the shoulder; oversized so it reads
  const paddlePivot = new THREE.Group();
  paddlePivot.position.set(0.85, 3.6, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.15, 4, 8), skinM);
  arm.position.set(0.45, -0.35, -0.2);
  arm.rotation.z = Math.PI / 2.6;
  paddlePivot.add(arm);
  const shape = new THREE.Shape();
  const w = 0.5;
  const h = 0.68;
  const r = 0.24;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const paddleMat = own(c.paddle, 0.35);
  glow.push(paddleMat);
  const faceP = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.025, bevelSegments: 2 }), paddleMat);
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), mat('#1d2028', 0.4));
  edge.scale.set(0.72, 0.72, 1);
  edge.position.z = 0.1;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.65, 10), mat('#d9d4c7', 0.9));
  handle.position.y = -h - 0.34;
  const paddle = new THREE.Group();
  paddle.add(faceP, edge, handle);
  paddle.position.set(1.15, -0.55, -0.5);
  paddle.rotation.y = Math.PI / 2;
  paddlePivot.add(paddle);
  body.add(paddlePivot);

  // the team ring on the ground, and a notch showing which way they face
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.5, 40),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.name = 'ring';
  root.add(ring);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== ring && o !== face && o !== num) o.castShadow = true;
  });
  return { root, body, head, paddlePivot, legL: legs[0], legR: legs[1], offArm, chef, glow, scale };
}

function addHair(head: THREE.Group, c: Character, m: THREE.MeshStandardMaterial) {
  const R = HEAD_R;
  const cap = (scale: number, thetaLen: number, y = 0) => {
    // a cap over the top and back of the skull, leaving the face clear
    // tipped back so the forehead shows and the back of the head is covered to the neck
    const g = new THREE.SphereGeometry(R * scale, 24, 16, 0, Math.PI * 2, 0, thetaLen + 0.1 * Math.PI);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.rotation.x = 0.6;
    head.add(mesh);
    return mesh;
  };
  switch (c.hair) {
    case 'bald':
      return;
    case 'buzz':
      cap(1.02, Math.PI * 0.42).material = new THREE.MeshStandardMaterial({ color: c.hairColor, roughness: 1, transparent: true, opacity: 0.75 });
      return;
    case 'crop':
      cap(1.07, Math.PI * 0.45);
      return;
    case 'sidepart': {
      cap(1.08, Math.PI * 0.47);
      const swoop = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), m);
      swoop.scale.set(1.6, 0.6, 1);
      swoop.position.set(0.35, R * 0.75, -0.55);
      head.add(swoop);
      return;
    }
    case 'spiky': {
      cap(1.05, Math.PI * 0.42);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 8), m);
        const tilt = 0.55;
        spike.position.set(Math.cos(a) * R * 0.55, R * 0.85, Math.sin(a) * R * 0.55 + 0.1);
        spike.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        head.add(spike);
      }
      return;
    }
    case 'afro':
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const ring = k % 2;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), m);
        ball.position.set(Math.cos(a) * R * (ring ? 0.75 : 0.95), R * (ring ? 0.75 : 0.35), Math.sin(a) * R * (ring ? 0.75 : 0.95) + 0.25);
        head.add(ball);
      }
      return;
    case 'bob': {
      const bob = cap(1.12, Math.PI * 0.7, -0.05);
      bob.rotation.x = 0.55;
      return;
    }
    case 'long': {
      cap(1.09, Math.PI * 0.5);
      const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.3, 6, 12), m);
      fall.position.set(0, -0.75, 0.55);
      head.add(fall);
      return;
    }
    case 'ponytail': {
      cap(1.07, Math.PI * 0.47);
      const tie = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(c.accent, 0.5));
      tie.position.set(0, R * 0.55, R * 0.95);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.6, 10), m);
      tail.position.set(0, -0.05, R * 1.25);
      tail.rotation.x = Math.PI - 0.35;
      tail.name = 'swing';
      head.add(tie, tail);
      return;
    }
    case 'pigtails':
      cap(1.07, Math.PI * 0.47);
      for (const sx of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), m);
        tail.scale.set(0.8, 1.25, 0.8);
        tail.position.set(sx * R * 1.15, R * 0.05, 0.25);
        tail.name = 'swing';
        head.add(tail);
      }
      return;
  }
}

function addHeadwear(head: THREE.Group, c: Character) {
  const R = HEAD_R;
  if (c.accessory === 'sweatband') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.13, 8, 28), mat(c.accent, 0.8));
    band.rotation.x = Math.PI / 2 - 0.2;
    band.position.y = R * 0.42;
    head.add(band);
  } else if (c.accessory === 'visor' || c.accessory === 'cap') {
    if (c.accessory === 'cap') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), mat(c.primary, 0.7));
      crown.position.y = 0.08;
      head.add(crown);
    } else {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.06, 0.32, 24, 1, true), mat(c.primary, 0.7));
      band.position.y = R * 0.5;
      (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      head.add(band);
    }
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.08, 20, 1, false, Math.PI / 2, Math.PI), mat(c.accent, 0.6));
    brim.position.set(0, R * 0.42, -R * 0.75);
    head.add(brim);
  } else if (c.accessory === 'clips') {
    for (const sx of [-1, 1]) {
      const clip = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), mat('#FFD166', 0.4));
      clip.position.set(sx * R * 0.62, R * 0.72, -R * 0.35);
      head.add(clip);
    }
  }
}

/** pose the figure for this frame: run cycle, lean, swing, celebration */
export function poseFigure(f: Figure, opts: {
  t: number;
  speed: number;
  /** velocity in the player's own frame: forward (toward the net), right */
  fwd: number;
  side: number;
  /** -1 not swinging, else 0..1 */
  swing: number;
  /** 0..1 jump for a celebration */
  hop: number;
  heat: number;
  fire: boolean;
  chef: boolean;
  dt: number;
}) {
  const stride = Math.min(1, opts.speed / 12);
  const ph = opts.t * (4 + opts.speed * 0.7);
  f.legL.rotation.x = Math.sin(ph * 2) * 0.65 * stride;
  f.legR.rotation.x = -Math.sin(ph * 2) * 0.65 * stride;
  f.body.position.y = Math.abs(Math.sin(ph * 2)) * 0.18 * stride + opts.hop * 1.6;
  f.body.rotation.x = -opts.fwd * 0.012;
  f.body.rotation.z = -opts.side * 0.01;
  f.offArm.rotation.x = Math.sin(ph * 2) * 0.5 * stride;
  f.offArm.rotation.z = opts.hop > 0.05 ? -2.6 : -0.25;
  // hair that swings
  f.head.children.forEach((o) => {
    if (o.name === 'swing') o.rotation.z = Math.sin(ph * 2 + 1) * 0.25 * stride;
  });
  f.head.rotation.z = Math.sin(opts.t * 1.7) * 0.03;

  const pv = f.paddlePivot;
  if (opts.swing >= 0) {
    const t = opts.swing;
    const e = t < 0.25 ? -t / 0.25 : (t - 0.25) / 0.75;
    const k = t < 0.25 ? e : 1 - (1 - e) ** 3;
    pv.rotation.y = t < 0.25 ? 0.2 + k * 0.9 : -0.7 - k * 1.5 + 1.6 * (1 - k);
    pv.rotation.x = t < 0.25 ? -k * 0.3 : -0.3 + k * 0.8;
    pv.rotation.z = 0;
  } else if (opts.hop > 0.05) {
    pv.rotation.y += (0.35 - pv.rotation.y) * Math.min(1, opts.dt * 8);
    pv.rotation.z += (2.2 - pv.rotation.z) * Math.min(1, opts.dt * 10);
  } else {
    pv.rotation.y += (0.35 - pv.rotation.y) * Math.min(1, opts.dt * 8);
    pv.rotation.x += (0 - pv.rotation.x) * Math.min(1, opts.dt * 8);
    pv.rotation.z += (0 - pv.rotation.z) * Math.min(1, opts.dt * 8);
  }

  // heat: a warm glow from 50, a pulsing blaze on fire
  // mostly on the paddle: the shirt only warms a little, so people stay recognizable
  const target = opts.fire ? 0.8 + Math.sin(opts.t * 12) * 0.3 : opts.heat >= 50 ? 0.15 + ((opts.heat - 50) / 50) * 0.3 : 0;
  f.glow.forEach((m, k) => {
    const want = target * (k === 0 ? (opts.fire ? 0.12 : 0.05) : 1.1);
    m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, opts.dt * 6);
  });
  f.chef.visible = opts.chef;
}
