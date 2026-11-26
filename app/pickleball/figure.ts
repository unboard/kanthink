// The 3D character, shared by pickleball, volleyball and the creator's turntable.
//
// Built in code from lathes, capsules and small canvases, so any Character can be drawn
// with no model or texture files. It is a jointed figure: pelvis, spine, neck, shoulders,
// elbows, hands, hips, knees and feet, with a printed jersey (number, name, panels), sewn
// shorts or a pleated skirt, laced sneakers and bump-mapped hair. Arcade proportions: the
// head is about 40% of the height, so people recognize each other from the far baseline.
//
// poseFigure() turns "what this player is doing" into joint angles: a run cycle with
// bending knees, a ready stance, a paddle swing, and volleyball's bump, set, spike, block,
// dive and knock-down, plus a victory move and a sulk that differ from person to person.
// Models face -z; their right is +x.

import * as THREE from 'three';
import { HEIGHT_SCALE, victoryOf, wearsSkirt, type Character, type Mood } from './characters';

export type FigureAction = 'none' | 'swing' | 'bump' | 'set' | 'spike' | 'block' | 'dive' | 'down' | 'toss' | 'kick' | 'slide';
export type FigureProp = 'paddle' | 'none';

interface Arm { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group }
interface Leg { hip: THREE.Group; knee: THREE.Group; foot: THREE.Group }

export interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  /** everything above the ground, pivoting at the pelvis */
  rig: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: Arm;
  armR: Arm;
  legL: Leg;
  legR: Leg;
  chef: THREE.Object3D;
  ring: THREE.Mesh;
  mouthMat: THREE.MeshStandardMaterial;
  mouths: Partial<Record<Mood, THREE.CanvasTexture>>;
  lids: THREE.Mesh[];
  brows: THREE.Mesh[];
  mood: Mood;
  /** materials that glow when the player is warming up or on fire */
  glow: THREE.MeshStandardMaterial[];
  swingers: THREE.Object3D[];
  scale: number;
  victory: ReturnType<typeof victoryOf>;
  character: Character;
  /** smoothed joint values, so poses blend instead of snapping */
  j: Record<string, number>;
  blinkAt: number;
}

// ————— materials and textures —————

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let fabricBump: THREE.CanvasTexture | null = null;
let hairBump: THREE.CanvasTexture | null = null;
let gripTex: THREE.CanvasTexture | null = null;

/** a fine weave, shared by every shirt and pair of shorts */
function fabric(): THREE.CanvasTexture {
  if (fabricBump) return fabricBump;
  fabricBump = canvasTex(128, 128, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) {
      for (let x = 0; x < 128; x += 2) {
        const v = 118 + (((x * 7 + y * 13) % 5) * 6) + ((x + y) % 4 === 0 ? 14 : 0);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 2, 2);
      }
    }
  }, false);
  fabricBump.wrapS = fabricBump.wrapT = THREE.RepeatWrapping;
  fabricBump.repeat.set(6, 6);
  return fabricBump;
}

/** strands running down the head */
function strands(): THREE.CanvasTexture {
  if (hairBump) return hairBump;
  hairBump = canvasTex(256, 256, (g) => {
    g.fillStyle = '#7a7a7a';
    g.fillRect(0, 0, 256, 256);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 420; k++) {
      const x = rnd() * 256;
      const v = 70 + Math.floor(rnd() * 150);
      g.strokeStyle = `rgba(${v},${v},${v},0.7)`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rnd() - 0.5) * 14, 80, x + (rnd() - 0.5) * 14, 170, x + (rnd() - 0.5) * 10, 256);
      g.stroke();
    }
  }, false);
  hairBump.wrapS = hairBump.wrapT = THREE.RepeatWrapping;
  hairBump.repeat.set(3, 1);
  return hairBump;
}

function grip(): THREE.CanvasTexture {
  if (gripTex) return gripTex;
  gripTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#e9e4d6';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 3;
    for (let k = -64; k < 128; k += 12) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 40, 64);
      g.stroke();
    }
  });
  gripTex.wrapS = gripTex.wrapT = THREE.RepeatWrapping;
  return gripTex;
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return `#${c.getHexString()}`;
}

function std(color: string, rough = 0.7, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
}

/** the jersey, printed: panels, piping, a chest number, and the name and number on the back */
function jerseyTexture(c: Character): THREE.CanvasTexture {
  // u: 0 right side, 0.25 front, 0.5 left side, 0.75 back. v: 0 hem, 1 collar.
  return canvasTex(1024, 512, (g) => {
    const W = 1024;
    const H = 512;
    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, shade(c.primary, 0.1));
    base.addColorStop(1, shade(c.primary, -0.14));
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // side panels under the arms, wrapping across the seam
    g.fillStyle = c.accent;
    for (const cx of [0, 512, 1024]) {
      g.beginPath();
      g.moveTo(cx - 52, H);
      g.quadraticCurveTo(cx - 20, H * 0.5, cx - 34, 120);
      g.lineTo(cx + 34, 120);
      g.quadraticCurveTo(cx + 20, H * 0.5, cx + 52, H);
      g.fill();
    }
    g.fillStyle = shade(c.accent, -0.3);
    for (const cx of [0, 512, 1024]) for (const sx of [-1, 1]) g.fillRect(cx + sx * 58 - 3, 150, 6, H);
    // hem and shoulder piping
    g.fillStyle = c.accent;
    g.fillRect(0, H - 22, W, 10);
    g.fillRect(0, 74, W, 8);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, H - 10, W, 10);
    // collar
    g.fillStyle = shade(c.accent, -0.15);
    g.fillRect(0, 0, W, c.outfit === 'polo-skirt' ? 40 : 26);
    if (c.outfit === 'polo-skirt') {
      // placket and buttons
      g.fillStyle = shade(c.primary, -0.2);
      g.fillRect(256 - 13, 54, 26, 120);
      g.fillStyle = '#ffffff';
      for (const y of [84, 122, 158]) { g.beginPath(); g.arc(256, y, 6, 0, Math.PI * 2); g.fill(); }
    }
    if (c.outfit === 'hoodie') {
      // kangaroo pocket and drawstrings
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(256 - 110, 470);
      g.lineTo(256 - 80, 350);
      g.lineTo(256 + 80, 350);
      g.lineTo(256 + 110, 470);
      g.stroke();
      g.strokeStyle = '#f2efe6';
      g.lineWidth = 7;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(256 + sx * 26, 40); g.lineTo(256 + sx * 30, 190); g.stroke(); }
    }
    const ink = c.accent.toLowerCase() === c.primary.toLowerCase() ? '#ffffff' : c.accent;
    const outline = 'rgba(0,0,0,0.42)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    // chest number, on the wearer's left
    if (c.outfit !== 'hoodie') {
      g.font = '900 82px ui-sans-serif, system-ui, sans-serif';
      g.lineWidth = 12;
      g.strokeStyle = outline;
      g.strokeText(String(c.number), 256 + 78, 196);
      g.fillStyle = ink;
      g.fillText(String(c.number), 256 + 78, 196);
    }
    // the back: name over a big number
    g.font = '900 60px ui-sans-serif, system-ui, sans-serif';
    g.lineWidth = 10;
    g.strokeStyle = outline;
    const name = c.name.toUpperCase().slice(0, 10);
    g.strokeText(name, 768, 132, 280);
    g.fillStyle = '#ffffff';
    g.fillText(name, 768, 132, 280);
    g.font = '900 210px ui-sans-serif, system-ui, sans-serif';
    g.lineWidth = 20;
    g.strokeText(String(c.number), 768, 282);
    g.fillStyle = ink;
    g.fillText(String(c.number), 768, 282);
    // soft folds
    for (let k = 0; k < 9; k++) {
      const x = 60 + k * 118;
      const f = g.createLinearGradient(x - 26, 0, x + 26, 0);
      f.addColorStop(0, 'rgba(0,0,0,0)');
      f.addColorStop(0.5, 'rgba(0,0,0,0.07)');
      f.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = f;
      g.fillRect(x - 26, 260, 52, 252);
    }
  });
}

/** the radius the hair and hats are modeled around; they are scaled onto the sculpted head */
const HEAD_R = 1.05;
/** the sculpted head's own radius */
const HR = 0.62;
/** joint heights, measured from the pelvis */
const HIP_Y = -0.12;
const THIGH = 1.34;
const SHIN = 1.3;
const WAIST_Y = 0.32;
const SHOULDER_Y = 1.24;
const SHOULDER_X = 0.69;
const UPPER = 0.92;
const FORE = 0.84;
const HEAD_Y = 2.24;
const PELVIS = 3.02;
/** poses were written for a shorter-legged figure; this carries their heights over */
const YS = PELVIS / 2.0;

interface Section { y: number; rx: number; rz: number; cx?: number; cz?: number }

/**
 * A smooth skin stretched over elliptical cross-sections: the shape of a thigh, a calf,
 * a forearm or a rib cage rather than a cylinder. u runs around (0 at the figure's right,
 * 0.25 at the front), v runs from the first section to the last.
 */
function loft(sections: Section[], around = 24, per = 5, caps = true): THREE.BufferGeometry {
  const rings: Section[] = [];
  const n = sections.length;
  const at = (i: number) => sections[Math.max(0, Math.min(n - 1, i))];
  const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      rings.push({
        y: b.y + (c.y - b.y) * t,
        rx: Math.max(0.001, cr(a.rx, b.rx, c.rx, d.rx, t)), rz: Math.max(0.001, cr(a.rz, b.rz, c.rz, d.rz, t)),
        cx: cr(a.cx ?? 0, b.cx ?? 0, c.cx ?? 0, d.cx ?? 0, t), cz: cr(a.cz ?? 0, b.cz ?? 0, c.cz ?? 0, d.cz ?? 0, t),
      });
    }
  }
  rings.push({ ...sections[n - 1] });
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const y0 = sections[0].y;
  const y1 = sections[n - 1].y;
  rings.forEach((r) => {
    for (let k = 0; k <= around; k++) {
      const u = k / around;
      const phi = Math.PI / 2 + u * Math.PI * 2;
      pos.push((r.cx ?? 0) + r.rx * Math.sin(phi), r.y, (r.cz ?? 0) + r.rz * Math.cos(phi));
      uv.push(u, (r.y - y0) / (y1 - y0 || 1));
    }
  });
  const W = around + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * W + k;
      const b = a + W;
      // wind so the outside faces out whichever way the sections run
      if (y1 > y0) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (caps) {
    for (const end of [0, rings.length - 1]) {
      const r = rings[end];
      const c = pos.length / 3;
      pos.push(r.cx ?? 0, r.y, r.cz ?? 0);
      uv.push(0.5, end ? 1 : 0);
      for (let k = 0; k < around; k++) {
        const a = end * W + k;
        if ((end === 0) === (y1 > y0)) idx.push(c, a + 1, a);
        else idx.push(c, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the seam shares positions but not vertices: average its normals so no line shows
  const nm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < rings.length; i++) {
    const a = i * W;
    const b = a + around;
    const x = nm.getX(a) + nm.getX(b);
    const y = nm.getY(a) + nm.getY(b);
    const z = nm.getZ(a) + nm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nm.setXYZ(a, x / l, y / l, z / l);
    nm.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  b.position.set(x, y, z);
  b.scale.set(sx, sy, sz);
  return b;
}

/**
 * The head's shape. Takes a direction from the center of the head and returns the point
 * on the surface: a cranium, cheekbones, a jaw that narrows to a chin, brow ridge and
 * eye sockets. The face, the beard and the mouth are all cut from this same surface, so
 * they sit on it exactly. `grow` lifts a layer off the skin.
 */
function sculpt(x: number, y: number, z: number, out: THREE.Vector3, grow = 1): THREE.Vector3 {
  const r = HR * grow;
  let px = x * r * 0.97;
  let py = y * r * 1.08;
  let pz = z * r * 1.02;
  if (y < 0) {
    const t = -y;
    px *= 1 - 0.24 * t * t;
    pz *= 1 - 0.1 * t * t;
    py *= 1 + 0.07 * t;
    if (z < 0) pz -= 0.075 * t * t * -z * grow; // the chin comes forward
  }
  if (z < 0) {
    const f = -z;
    // eye sockets, brow ridge above them, cheekbones below
    for (const sx of [-1, 1]) {
      const d = (x - sx * 0.37) ** 2 + (y - 0.06) ** 2;
      pz += Math.exp(-d / 0.02) * 0.05 * f;
      const c = (x - sx * 0.46) ** 2 + (y + 0.2) ** 2;
      pz -= Math.exp(-c / 0.03) * 0.02 * f;
    }
    pz -= Math.exp(-((y - 0.27) ** 2) / 0.012) * 0.028 * f * (1 - x * x);
    // the muzzle: a soft rise around the mouth
    pz -= Math.exp(-((y + 0.42) ** 2 + x * x) / 0.05) * 0.03 * f;
  }
  return out.set(px, py, pz);
}

/** a piece of the head's surface between two heights and across an arc centered on the face */
function headPatch(thetaA: number, thetaB: number, halfArc: number, grow: number, cols = 28, rows = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    const th = thetaA + (thetaB - thetaA) * (j / rows);
    for (let i = 0; i <= cols; i++) {
      const a = -halfArc + 2 * halfArc * (i / cols); // 0 = straight ahead; + = the figure's left (-x)
      sculpt(-Math.sin(a) * Math.sin(th), Math.cos(th), -Math.cos(a) * Math.sin(th), v, grow);
      pos.push(v.x, v.y, v.z);
      uv.push(i / cols, 1 - j / rows);
    }
  }
  const W = cols + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * W + i;
    idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** lips, teeth and tongue for a mood, on a see-through patch over the lower face */
function mouthTexture(c: Character, mood: Mood): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const cx = 128;
    const my = 132;
    const lip = shade(c.skin, -0.42);
    const inside = '#4a1a22';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // a little color in the cheeks
    for (const sx of [-1, 1]) {
      const grad = g.createRadialGradient(cx + sx * 86, 70, 0, cx + sx * 86, 70, 34);
      grad.addColorStop(0, 'rgba(255,105,115,0.26)');
      grad.addColorStop(1, 'rgba(255,105,115,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
    }
    const open = (w: number, h: number, teeth: boolean, tongue: boolean) => {
      g.beginPath();
      g.moveTo(cx - w, my - h * 0.2);
      g.quadraticCurveTo(cx, my - h * 0.05, cx + w, my - h * 0.2);
      g.quadraticCurveTo(cx + w * 0.7, my + h, cx, my + h);
      g.quadraticCurveTo(cx - w * 0.7, my + h, cx - w, my - h * 0.2);
      g.closePath();
      g.fillStyle = inside;
      g.fill();
      g.save();
      g.clip();
      if (teeth) { g.fillStyle = '#fbfbf6'; g.fillRect(cx - w, my - h * 0.3, w * 2, h * 0.52); }
      if (tongue) { g.fillStyle = '#f0808c'; g.beginPath(); g.ellipse(cx, my + h * 0.95, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      // lips around an open mouth: a soft rim of lip color, then the line
      g.strokeStyle = shade(c.skin, -0.22);
      g.lineWidth = 9;
      g.stroke();
      g.strokeStyle = lip;
      g.lineWidth = 3;
      g.stroke();
    };
    const line = (pts: number[], w = 7) => {
      // A closed mouth is two lips meeting, not a drawn line: a soft lower lip with a
      // touch of color under the parting, then the parting itself.
      g.fillStyle = 'rgba(170,80,80,0.2)';
      g.beginPath();
      g.moveTo(cx + pts[0], my + pts[1]);
      g.quadraticCurveTo(cx + pts[2], my + pts[3] + 18, cx + pts[4], my + pts[5]);
      g.quadraticCurveTo(cx + pts[2], my + pts[3] + 2, cx + pts[0], my + pts[1]);
      g.fill();
      g.strokeStyle = shade(c.skin, -0.18);
      g.globalAlpha = 0.45;
      g.lineWidth = w + 5;
      g.beginPath();
      g.moveTo(cx + pts[0] * 0.75, my + pts[1] + 7);
      g.quadraticCurveTo(cx + pts[2], my + pts[3] + 13, cx + pts[4] * 0.75, my + pts[5] + 7);
      g.stroke();
      g.globalAlpha = 1;
      g.strokeStyle = lip;
      g.lineWidth = w - 2;
      g.beginPath();
      g.moveTo(cx + pts[0], my + pts[1]);
      g.quadraticCurveTo(cx + pts[2], my + pts[3], cx + pts[4], my + pts[5]);
      g.stroke();
    };
    const face = mood === 'play' || mood === 'blink' ? c.face : mood;
    switch (face) {
      case 'joy': open(46, 44, true, true); break;
      case 'effort': {
        g.fillStyle = '#fbfbf6';
        g.strokeStyle = lip;
        g.lineWidth = 6;
        g.beginPath();
        g.roundRect(cx - 38, my - 12, 76, 30, 10);
        g.fill();
        g.stroke();
        g.lineWidth = 2.5;
        g.beginPath();
        for (const k of [-19, 0, 19]) { g.moveTo(cx + k, my - 12); g.lineTo(cx + k, my + 18); }
        g.moveTo(cx - 38, my + 3); g.lineTo(cx + 38, my + 3);
        g.stroke();
        break;
      }
      case 'sad': line([-30, 16, 0, -10, 30, 16]); break;
      case 'ouch': {
        g.strokeStyle = lip;
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx - 36, my + 4);
        for (let k = 1; k <= 6; k++) g.lineTo(cx - 36 + k * 12, my + 4 + (k % 2 ? -9 : 9));
        g.stroke();
        break;
      }
      case 'grin': open(38, 26, true, false); break;
      case 'sparkle': open(42, 34, true, true); break;
      case 'tongue': {
        line([-34, -4, 0, 26, 34, -4]);
        g.fillStyle = '#f0808c';
        g.beginPath();
        g.ellipse(cx + 8, my + 22, 14, 17, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'smirk': line([-28, 6, 6, 14, 36, -10]); break;
      case 'focused': line([-26, 4, 0, 6, 26, 4]); break;
      default: line([-34, -4, 0, 24, 34, -4]);
    }
  });
}

function irisTexture(color: string): THREE.CanvasTexture {
  // A real iris: lighter around the pupil, fine fibers out to a dark limbal ring,
  // a modest pupil and one soft catchlight. The old one was a flat disc with a
  // pupil half its size and two big white dots, which read as a cartoon hole.
  return canvasTex(128, 128, (g) => {
    const c = 64;
    const grad = g.createRadialGradient(c, c, 8, c, c, 62);
    grad.addColorStop(0, shade(color, 0.45));
    grad.addColorStop(0.45, shade(color, 0.12));
    grad.addColorStop(0.8, color);
    grad.addColorStop(0.93, shade(color, -0.6));
    grad.addColorStop(1, '#14141a');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, 62, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.2;
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2 + Math.sin(k * 7.3) * 0.03;
      g.strokeStyle = k % 3 ? `rgba(0,0,0,${0.08 + (k % 5) * 0.02})` : `rgba(255,255,255,${0.06 + (k % 4) * 0.02})`;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 20, c + Math.sin(a) * 20);
      g.lineTo(c + Math.cos(a) * 55, c + Math.sin(a) * 55);
      g.stroke();
    }
    g.fillStyle = '#08080b';
    g.beginPath();
    g.arc(c, c, 19, 0, Math.PI * 2);
    g.fill();
    const hi = g.createRadialGradient(c + 18, c - 20, 0, c + 18, c - 20, 11);
    hi.addColorStop(0, 'rgba(255,255,255,0.95)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 128, 128);
  });
}

/**
 * An eyebrow: an arch that is thick at the inner end and tapers to the tail, laid
 * along y so the pose code's rotation.z = PI/2 lays it flat (the arch rises to +y).
 * The old capsule was a straight bar of even width, which is most of why the faces
 * looked startled and unfinished.
 */
function browGeometry(side: number): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.005, -0.13, 0), new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(0.0, 0.14, 0));
  const g = new THREE.TubeGeometry(curve, 16, 0.03, 8, false);
  const pos = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) + 0.13) / 0.27));
    curve.getPoint(t, p);
    // inner end: +y for the figure's right brow (side 1), -y for the left
    const inner = side > 0 ? t : 1 - t;
    const k = 0.35 + 0.75 * Math.pow(inner, 0.7);
    pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * k, pos.getY(i), (pos.getZ(i) - p.z) * k * 0.55);
  }
  g.computeVertexNormals();
  return g;
}

function buildArm(side: 1 | -1, c: Character, skin: THREE.Material, sleeve: THREE.Material | null, sleeveLong: boolean): Arm {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
  // deltoid, biceps and triceps, tapering to the elbow
  const upper = new THREE.Mesh(loft([
    { y: 0.12, rx: 0.12, rz: 0.14 }, { y: 0, rx: 0.215, rz: 0.225 }, { y: -0.2, rx: 0.2, rz: 0.215 }, { y: -0.45, rx: 0.175, rz: 0.2, cz: -0.012 },
    { y: -0.72, rx: 0.15, rz: 0.165 }, { y: -UPPER, rx: 0.135, rz: 0.14 },
  ]), sleeve && sleeveLong ? sleeve : skin);
  shoulder.add(upper);
  // the deltoid rounds the shoulder into the chest
  shoulder.add(ball(0.235, sleeve ?? skin, -side * 0.03, 0.02, 0, 1, 0.95, 1.02));
  if (sleeve && !sleeveLong) {
    const cap = new THREE.Mesh(loft([
      { y: 0.16, rx: 0.14, rz: 0.16 }, { y: 0.02, rx: 0.25, rz: 0.26 }, { y: -0.2, rx: 0.245, rz: 0.255 }, { y: -0.42, rx: 0.235, rz: 0.25 },
    ], 24, 5, false), sleeve);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 8, 24), std(c.accent, 0.6));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.42;
    shoulder.add(cap, cuff);
  }
  const elbow = new THREE.Group();
  elbow.position.y = -UPPER;
  elbow.add(ball(0.138, sleeve && sleeveLong ? sleeve : skin));
  elbow.add(new THREE.Mesh(loft([
    { y: 0, rx: 0.135, rz: 0.14 }, { y: -0.16, rx: 0.15, rz: 0.158 }, { y: -0.4, rx: 0.13, rz: 0.135 }, { y: -0.66, rx: 0.098, rz: 0.088 }, { y: -FORE, rx: 0.092, rz: 0.075 },
  ]), sleeve && sleeveLong ? sleeve : skin));
  if (sleeve && sleeveLong) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 16), std(c.accent, 0.7));
    cuff.position.y = -FORE + 0.06;
    elbow.add(cuff);
  }
  // a hand: palm, four fingers with a slight curl, and a thumb
  const hand = new THREE.Group();
  hand.position.y = -FORE;
  const palm = ball(0.12, skin, 0, -0.13, 0, 0.5, 1.05, 0.92);
  hand.add(palm);
  for (let k = 0; k < 4; k++) {
    const z = -0.078 + k * 0.052;
    const len = k === 1 || k === 2 ? 0.15 : 0.12;
    const knuckle = new THREE.Group();
    knuckle.position.set(0, -0.24, z);
    knuckle.rotation.z = -side * 0.22;
    const f1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, len, 4, 8), skin);
    f1.position.y = -len / 2;
    const tip = new THREE.Group();
    tip.position.y = -len;
    tip.rotation.z = -side * 0.45;
    const f2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.023, len * 0.7, 4, 8), skin);
    f2.position.y = -len * 0.35;
    tip.add(f2);
    knuckle.add(f1, tip);
    hand.add(knuckle);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), skin);
  thumb.position.set(side * 0.03, -0.14, -0.13);
  thumb.rotation.set(0.75, 0, side * 0.35);
  hand.add(thumb);
  elbow.add(hand);
  shoulder.add(elbow);
  return { shoulder, elbow, hand };
}

function buildShoe(teamColor: string): THREE.Group {
  // heel at +z, toe at -z, the sole's underside 0.3 below the ankle
  const shoe = new THREE.Group();
  const white = std('#f6f5f0', 0.45, { bumpMap: fabric(), bumpScale: 0.4 });
  const flatCap = (r: number, len: number, m: THREE.Material, y: number, z: number, wide: number, thick: number) => {
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m);
    c.rotation.x = Math.PI / 2;
    c.scale.set(wide, 1, thick);
    c.position.set(0, y, z);
    return c;
  };
  shoe.add(
    flatCap(0.16, 0.5, std(teamColor, 0.6), -0.265, -0.2, 1.08, 0.24),
    flatCap(0.16, 0.5, std('#ffffff', 0.5), -0.215, -0.2, 1.04, 0.3),
    ball(0.17, white, 0, -0.1, -0.16, 0.9, 0.82, 1.75),
    ball(0.16, white, 0, -0.14, -0.42, 0.98, 0.68, 1.25),
    ball(0.14, std(shade(teamColor, 0.1), 0.4), 0, -0.155, -0.55, 1.05, 0.62, 0.9),
    ball(0.15, std(teamColor, 0.5), 0, -0.08, 0.1, 0.95, 1.05, 0.65),
  );
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.042, 8, 20), white);
  collar.rotation.x = Math.PI / 2 + 0.15;
  collar.scale.set(1, 1.2, 1);
  collar.position.set(0, 0.04, -0.01);
  const tongue = ball(0.1, white, 0, 0.03, -0.17, 0.85, 0.5, 1.3);
  tongue.rotation.x = -0.5;
  shoe.add(collar, tongue);
  const lace = std('#dfe3ea', 0.6);
  for (let k = 0; k < 4; k++) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.16, 3, 6), lace);
    l.rotation.z = Math.PI / 2 + (k % 2 ? 0.35 : -0.35);
    l.position.set(0, 0.035 - k * 0.022, -0.2 - k * 0.07);
    shoe.add(l);
  }
  for (const sx of [-1, 1]) {
    const swoosh = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.22, 3, 6), std(teamColor, 0.4));
    swoosh.rotation.x = Math.PI / 2 - 0.3;
    swoosh.position.set(sx * 0.15, -0.1, -0.2);
    shoe.add(swoosh);
  }
  return shoe;
}

function buildLeg(side: 1 | -1, teamColor: string, skin: THREE.Material, pant: THREE.Material | null, shorts: THREE.Material | null, accent: THREE.Material): Leg {
  const hip = new THREE.Group();
  hip.position.set(side * 0.3, HIP_Y, 0);
  // quad in front, hamstring behind, narrowing to the knee
  hip.add(new THREE.Mesh(loft([
    { y: 0.1, rx: 0.2, rz: 0.22 }, { y: -0.1, rx: 0.3, rz: 0.31 }, { y: -0.45, rx: 0.275, rz: 0.3, cz: -0.02 }, { y: -0.9, rx: 0.22, rz: 0.24, cz: -0.015 },
    { y: -1.2, rx: 0.18, rz: 0.19 }, { y: -THIGH, rx: 0.172, rz: 0.18 },
  ]), pant ?? skin));
  if (shorts) {
    const leg = new THREE.Mesh(loft([
      { y: 0.12, rx: 0.22, rz: 0.24 }, { y: -0.1, rx: 0.335, rz: 0.345 }, { y: -0.45, rx: 0.33, rz: 0.35, cz: -0.02 }, { y: -0.78, rx: 0.325, rz: 0.345, cz: -0.02 },
    ], 24, 5, false), shorts);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.02, 8, 26), accent);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, -0.78, -0.02);
    hip.add(leg, trim);
  }
  const knee = new THREE.Group();
  knee.position.y = -THIGH;
  knee.add(ball(0.176, pant ?? skin, 0, 0, -0.01));
  // a calf that bulges behind and a shin that runs straight in front
  knee.add(new THREE.Mesh(loft([
    { y: 0, rx: 0.172, rz: 0.18 }, { y: -0.28, rx: 0.178, rz: 0.2, cz: 0.035 }, { y: -0.55, rx: 0.155, rz: 0.17, cz: 0.03 }, { y: -0.95, rx: 0.105, rz: 0.115, cz: 0.01 }, { y: -SHIN, rx: 0.095, rz: 0.105 },
  ]), pant ?? skin));
  const sock = new THREE.Mesh(loft([
    { y: -SHIN + 0.34, rx: 0.118, rz: 0.13, cz: 0.012 }, { y: -SHIN + 0.2, rx: 0.115, rz: 0.125 }, { y: -SHIN - 0.02, rx: 0.112, rz: 0.12 },
  ], 20, 4, false), std('#f4f4ef', 0.95, { bumpMap: fabric(), bumpScale: 0.8 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.014, 6, 20), accent);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, -SHIN + 0.28, 0.01);
  knee.add(sock, band);
  const foot = new THREE.Group();
  foot.position.y = -SHIN + 0.02;
  const shoe = buildShoe(teamColor);
  foot.add(shoe);
  knee.add(foot);
  hip.add(knee);
  return { hip, knee, foot };
}

export function buildFigure(c: Character, teamColor: string, prop: FigureProp = 'paddle'): Figure {
  // a touch larger than life, so faces read from the far baseline
  const scale = HEIGHT_SCALE[c.height] * 1.1;
  const kid = c.height === 'kid' || c.height === 'youth';
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const rig = new THREE.Group();
  rig.position.y = PELVIS;
  body.add(rig);

  const skin = new THREE.MeshPhysicalMaterial({ color: c.skin, roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(shade(c.skin, 0.3)) });
  const accent = std(c.accent, 0.6, { bumpMap: fabric(), bumpScale: 0.5 });
  const shirt = new THREE.MeshStandardMaterial({
    map: jerseyTexture(c), roughness: 0.8, bumpMap: fabric(), bumpScale: 0.7,
    emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0,
  });
  const sleeve = std(c.primary, 0.8, { bumpMap: fabric(), bumpScale: 0.7 });
  const lowerColor = c.outfit === 'tank' ? '#2a3140' : c.outfit === 'hoodie' ? shade(c.accent, -0.1) : '#1f2630';
  const lower = std(lowerColor, 0.85, { bumpMap: fabric(), bumpScale: 0.7 });
  const glow = [shirt];

  // ——— pelvis: shorts, joggers or a pleated skirt ———
  const skirt = wearsSkirt(c);
  rig.add(new THREE.Mesh(loft([
    { y: -0.46, rx: 0.2, rz: 0.2 }, { y: -0.3, rx: 0.5, rz: 0.36 }, { y: -0.08, rx: 0.56, rz: 0.39, cz: 0.02 }, { y: 0.16, rx: 0.52, rz: 0.36 }, { y: 0.36, rx: 0.47, rz: 0.33 },
  ]), skirt ? accent : lower));
  if (skirt) {
    const prof = [new THREE.Vector2(0.5, 0.3), new THREE.Vector2(0.58, 0.05), new THREE.Vector2(0.76, -0.45), new THREE.Vector2(0.9, -0.92)];
    const geo = new THREE.LatheGeometry(prof, 56);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // pleats: the hem ripples in and out
      const y = pos.getY(i);
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const k = 1 + Math.sin(a * 16) * 0.05 * Math.min(1, (0.3 - y) / 0.7);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k * 0.8);
    }
    geo.computeVertexNormals();
    rig.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.7, side: THREE.DoubleSide, bumpMap: fabric(), bumpScale: 0.5 })));
  } else {
    const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.04, 8, 30), std(shade(lowerColor, 0.25), 0.7));
    waistband.rotation.x = Math.PI / 2;
    waistband.scale.set(1, 0.7, 1);
    waistband.position.y = 0.3;
    rig.add(waistband);
  }
  const joggers = c.outfit === 'tank';
  const legL = buildLeg(-1, teamColor, skin, joggers ? lower : null, !joggers && !skirt ? lower : null, accent);
  const legR = buildLeg(1, teamColor, skin, joggers ? lower : null, !joggers && !skirt ? lower : null, accent);
  rig.add(legL.hip, legR.hip);

  // ——— spine: a rib cage that widens to the shoulders, neck, arms, head ———
  const spine = new THREE.Group();
  spine.position.y = WAIST_Y;
  rig.add(spine);
  const broad = kid ? 0.93 : 1;
  const torso = new THREE.Mesh(loft([
    { y: -0.34, rx: 0.5, rz: 0.36 }, { y: -0.1, rx: 0.47, rz: 0.335 }, { y: 0.2, rx: 0.49, rz: 0.34, cz: -0.01 }, { y: 0.6, rx: 0.6 * broad, rz: 0.39, cz: -0.035 },
    { y: 0.95, rx: 0.7 * broad, rz: 0.4, cz: -0.03 }, { y: 1.2, rx: 0.74 * broad, rz: 0.34, cz: 0 }, { y: 1.36, rx: 0.52, rz: 0.27, cz: 0.02 }, { y: 1.47, rx: 0.24, rz: 0.22, cz: 0.02 }, { y: 1.52, rx: 0.19, rz: 0.19, cz: 0.02 },
  ], 40, 6, false), shirt);
  spine.add(torso);
  const neck = new THREE.Mesh(loft([{ y: 1.4, rx: 0.19, rz: 0.19, cz: 0.02 }, { y: 1.6, rx: 0.16, rz: 0.165, cz: 0.01 }, { y: 1.95, rx: 0.165, rz: 0.175, cz: 0 }], 20, 4), skin);
  spine.add(neck);
  if (c.outfit === 'polo-skirt') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.055, 8, 24, Math.PI * 1.7), std(shade(c.accent, -0.15), 0.7));
    collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.65);
    collar.position.set(0, 1.5, 0.02);
    spine.add(collar);
  }
  if (c.outfit === 'hoodie') {
    const hood = ball(0.42, sleeve, 0, 1.36, 0.3, 1, 0.75, 0.8);
    spine.add(hood);
  }
  const hasSleeves = c.outfit !== 'tank';
  const armL = buildArm(-1, c, skin, hasSleeves ? sleeve : null, c.outfit === 'hoodie');
  const armR = buildArm(1, c, skin, hasSleeves ? sleeve : null, c.outfit === 'hoodie');
  armL.shoulder.position.x *= broad;
  armR.shoulder.position.x *= broad;
  spine.add(armL.shoulder, armR.shoulder);

  // ——— head: sculpted, with eyes, lids, brows, nose, ears and a mouth ———
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  // a slightly larger head on kids, the way kids are
  head.scale.setScalar(kid ? 1.26 : 1.16);
  const skullGeo = new THREE.SphereGeometry(1, 56, 40);
  const sp = skullGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    sculpt(sp.getX(i), sp.getY(i), sp.getZ(i), v);
    sp.setXYZ(i, v.x, v.y, v.z);
  }
  skullGeo.computeVertexNormals();
  head.add(new THREE.Mesh(skullGeo, skin));
  const innerEar = std(shade(c.skin, -0.25), 0.7);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * HR * 0.93, -0.02, 0.06);
    ear.rotation.y = -sx * 0.35;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.036, 8, 18), skin);
    rim.rotation.y = Math.PI / 2;
    rim.scale.set(1, 1.35, 1);
    const lobe = ball(0.085, innerEar, 0, 0, 0, 0.3, 1.25, 0.9);
    ear.add(rim, lobe);
    head.add(ear);
  }
  // nose: a bridge running down to a rounded tip with nostril wings
  const noseM = new THREE.MeshPhysicalMaterial({ color: shade(c.skin, -0.04), roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(shade(c.skin, 0.3)) });
  const nose = new THREE.Group();
  nose.position.set(0, -0.1, -HR * 1.0);
  // Slimmer than it was: three equal balls made a clown's nose. A narrow bridge,
  // a modest tip, and wings tucked back into the cheeks.
  const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.17, 4, 12), noseM);
  bridge.position.set(0, 0.095, 0.045);
  bridge.rotation.x = 0.3;
  bridge.scale.set(0.9, 1, 1);
  nose.add(bridge, ball(0.052, noseM, 0, -0.03, -0.035, 1.05, 0.8, 0.95), ball(0.032, noseM, -0.045, -0.045, 0.01, 1.1, 0.8, 1), ball(0.032, noseM, 0.045, -0.045, 0.01, 1.1, 0.8, 1));
  head.add(nose);

  // eyes set into the sockets, each with a lid that can close
  const eyeColor = ['#6b4423', '#3f7fae', '#4f8a3f', '#3a2a1c'][(c.number + c.name.length) % 4];
  const iris = irisTexture(eyeColor);
  const lids: THREE.Mesh[] = [];
  const brows: THREE.Mesh[] = [];
  const white = std('#fdfdfb', 0.25);
  const browM = std(c.hair === 'bald' ? shade(c.skin, -0.55) : shade(c.hairColor, -0.15), 0.8);
  for (const sx of [-1, 1]) {
    sculpt(sx * 0.37, 0.06, -0.927, v);
    const eye = new THREE.Group();
    // seated less deep, so the white shows and the eye isn't lost in its socket
    eye.position.set(v.x * 0.97, v.y, v.z + 0.065);
    eye.rotation.y = -sx * 0.16;
    const big = c.face === 'sparkle' ? 1.12 : 1;
    eye.scale.set(big, big * 1.12, 0.7);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), white);
    // An iris about half the eye's width, as in life; at 0.105 of a 0.15 eye it
    // filled it, and the eyes read as dark holes.
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.082, 32), new THREE.MeshStandardMaterial({ map: iris, roughness: 0.12 }));
    ir.position.set(0, -0.004, -0.1515);
    ir.rotation.y = Math.PI;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin);
    // the upper lid rests just over the top of the iris, as relaxed eyes do
    lid.rotation.x = 0.8;
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.009, 6, 24, Math.PI), std('#1b1b22', 0.6));
    lash.rotation.set(Math.PI / 2, 0, Math.PI);
    lid.add(lash);
    eye.add(globe, ir, lid);
    head.add(eye);
    lids.push(lid);
    const brow = new THREE.Mesh(browGeometry(sx), browM);
    brow.position.set(v.x * 1.0, v.y + 0.2, v.z - 0.035);
    brow.rotation.set(0, -sx * 0.3, Math.PI / 2);
    brow.userData.side = sx;
    head.add(brow);
    brows.push(brow);
  }
  const mouths: Partial<Record<Mood, THREE.CanvasTexture>> = { play: mouthTexture(c, 'play') };
  const mouthMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6, map: mouths.play, depthWrite: false });
  const mouth = new THREE.Mesh(headPatch(Math.PI * 0.47, Math.PI * 0.8, 0.82, 1.008), mouthMat);
  mouth.renderOrder = 1;
  head.add(mouth);

  // facial hair grows on the same surface as the face
  const hairM = new THREE.MeshStandardMaterial({ color: c.hairColor, roughness: 0.55, bumpMap: strands(), bumpScale: 1.6 });
  if (c.facialHair === 'beard' || c.facialHair === 'stubble') {
    const full = c.facialHair === 'beard';
    const m = full ? hairM : new THREE.MeshStandardMaterial({ color: shade(c.hairColor, -0.2), roughness: 1, transparent: true, opacity: 0.32, depthWrite: false });
    // chin and jaw, then up the cheeks to the sideburns
    const chin = new THREE.Mesh(headPatch(Math.PI * 0.74, Math.PI * 0.97, 1.3, full ? 1.035 : 1.01, 40, 14), m);
    const sides = [-1, 1].map((sx) => {
      const g = headPatch(Math.PI * 0.5, Math.PI * 0.77, 0.2, full ? 1.025 : 1.01, 8, 12);
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.y = sx * 1.12;
      return mesh;
    });
    head.add(chin, ...sides);
  }
  if (c.facialHair === 'beard' || c.facialHair === 'mustache') {
    for (const sx of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 8), hairM);
      half.position.set(sx * 0.095, -0.235, -HR * 0.985);
      half.rotation.set(0, -sx * 0.25, Math.PI / 2 + sx * 0.38);
      head.add(half);
    }
  }

  // hair and hats are modeled around a bigger ball; fit them to this head
  const crown = new THREE.Group();
  const hk = (HR * 1.0) / HEAD_R;
  crown.scale.set(hk * 0.99, hk * 1.09, hk * 1.03);
  head.add(crown);
  const swingers: THREE.Object3D[] = [];
  addHair(crown, c, hairM, swingers);
  addHeadwear(crown, c);
  if (c.accessory === 'glasses' || c.accessory === 'shades') {
    const frame = std('#16161c', 0.35);
    const lens = c.accessory === 'shades'
      ? new THREE.MeshStandardMaterial({ color: '#0d0f16', roughness: 0.08, metalness: 0.7 })
      : new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25 });
    const specs = new THREE.Group();
    for (const sx of [-1, 1]) {
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 26), frame);
      rimM.position.set(sx * 0.225, 0.06, -HR * 0.99);
      rimM.rotation.y = -sx * 0.14;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), lens);
      glass.position.copy(rimM.position);
      glass.rotation.y = Math.PI - sx * 0.14;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.6, 3, 6), frame);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(sx * 0.4, 0.07, -HR * 0.52);
      arm.rotation.z = sx * 0.3;
      specs.add(rimM, glass, arm);
    }
    const bridgeM = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.12, 3, 6), frame);
    bridgeM.rotation.z = Math.PI / 2;
    bridgeM.position.set(0, 0.08, -HR * 1.02);
    specs.add(bridgeM);
    head.add(specs);
  }
  const chef = new THREE.Group();
  const cloth = std('#ffffff', 0.6, { bumpMap: fabric(), bumpScale: 0.5 });
  const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 0.75, 24), cloth);
  toque.position.y = HEAD_R + 0.25;
  chef.add(toque);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    chef.add(ball(0.42, cloth, Math.cos(a) * 0.42, HEAD_R + 0.78, Math.sin(a) * 0.42));
  }
  chef.add(ball(0.55, cloth, 0, HEAD_R + 0.95, 0));
  chef.visible = false;
  crown.add(chef);
  spine.add(head);

  if (prop === 'paddle') {
    const paddle = buildPaddle(c);
    glow.push(paddle.mat);
    // gripped by the handle: the face carries on past the hand, edge up, like a handshake
    paddle.group.position.y = 0.68 + 0.44;
    paddle.group.rotation.y = Math.PI / 2;
    const grip = new THREE.Group();
    grip.add(paddle.group);
    grip.position.set(0, -0.16, -0.02);
    grip.rotation.x = Math.PI + 0.55;
    grip.scale.setScalar(0.9);
    armR.hand.add(grip);
  }

  // the team ring on the ground
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.14, 48),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.name = 'ring';
  root.add(ring);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && o !== ring && o !== mouth) { m.castShadow = true; m.receiveShadow = false; }
  });
  return {
    root, body, rig, spine, head, armL, armR, legL, legR, chef, ring, mouthMat, mouths, lids, brows, mood: 'play', glow, swingers, scale,
    victory: victoryOf(c), character: c, j: {}, blinkAt: 2 + (c.number % 5),
  };
}

function buildPaddle(c: Character): { group: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const w = 0.5;
  const h = 0.68;
  const r = 0.24;
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.42, metalness: 0.05, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0,
    map: canvasTex(256, 256, (g) => {
      g.fillStyle = c.paddle;
      g.fillRect(0, 0, 256, 256);
      // honeycomb face with a swoop of the accent color
      g.strokeStyle = 'rgba(255,255,255,0.13)';
      g.lineWidth = 1.5;
      for (let y = 0; y < 256; y += 14) {
        for (let x = (y / 14) % 2 ? 0 : 8; x < 256; x += 16) {
          g.beginPath();
          g.arc(x, y, 6.5, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.fillStyle = c.accent;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(0, 190);
      g.quadraticCurveTo(128, 110, 256, 170);
      g.lineTo(256, 205);
      g.quadraticCurveTo(128, 150, 0, 225);
      g.fill();
      g.globalAlpha = 1;
    }),
  });
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 16 }), mat);
  // extrude UVs are in shape units; fit the texture to the face
  const uv = face.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w) / (2 * w), (uv.getY(i) + h) / (2 * h));
  face.position.z = -0.035;
  const guard = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 16 }), std('#14161c', 0.5));
  guard.scale.set(1.05, 1.04, 1);
  guard.position.z = -0.03;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.2, 12), std('#14161c', 0.5));
  neck.position.y = -h - 0.08;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.6, 14), new THREE.MeshStandardMaterial({ map: grip(), roughness: 0.95 }));
  handle.position.y = -h - 0.44;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14), std('#14161c', 0.5));
  butt.position.y = -h - 0.75;
  const group = new THREE.Group();
  group.add(guard, face, neck, handle, butt);
  return { group, mat };
}

function addHair(head: THREE.Group, c: Character, m: THREE.MeshStandardMaterial, swingers: THREE.Object3D[]) {
  // modeled around a ball of radius HEAD_R; the caller scales it onto the sculpted head
  const R = HEAD_R;
  const cap = (scale: number, thetaLen: number, y = 0) => {
    // a cap over the top and back of the skull, tipped back so the forehead shows
    const g = new THREE.SphereGeometry(R * scale, 36, 22, 0, Math.PI * 2, 0, thetaLen + 0.1 * Math.PI);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.rotation.x = 0.6;
    head.add(mesh);
    return mesh;
  };
  const tuft = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), m);
    t.scale.set(sx, sy, sz);
    t.position.set(x, y, z);
    t.rotation.z = rz;
    head.add(t);
    return t;
  };
  /**
   * A fringe across the forehead: one sheet of hair over the brow with a choppy
   * edge of locks, rather than a row of separate balls (which read as sausages).
   * `drop` brings it lower; `sweep` pushes it to one side.
   */
  const bangs = (n: number, drop: number, sweep = 0) => {
    const cols = 40;
    const rows = 10;
    const half = 0.95;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const a = -half + 2 * half * u;
        // the edge: higher at the temples, a point per lock, a little longer on the sweep side
        const lock = Math.pow(Math.abs(Math.sin((u * n + 0.5) * Math.PI)), 0.6);
        const edge = 0.68 + drop * 0.12 - Math.abs(a) * 0.28 + lock * 0.07 + sweep * a * 0.12;
        const th = 0.2 + (edge - 0.2) * (j / rows);
        // thicker toward the edge, so it has a body and doesn't look painted on
        const r = R * (1.075 + 0.05 * Math.pow(j / rows, 2));
        const aa = a + sweep * 0.25 * (j / rows);
        pos.push(Math.sin(aa) * Math.sin(th) * r, Math.cos(th) * r, -Math.cos(aa) * Math.sin(th) * r);
        uv.push(u * 3, 1 - j / rows);
      }
    }
    const W = cols + 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * W + i;
      idx.push(k, k + 1, k + W, k + 1, k + W + 1, k + W);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = m.clone();
    mat.side = THREE.DoubleSide;
    head.add(new THREE.Mesh(g, mat));
  };
  switch (c.hair) {
    case 'bald':
      return;
    case 'buzz':
      cap(1.018, Math.PI * 0.42).material = new THREE.MeshStandardMaterial({ color: c.hairColor, roughness: 1, transparent: true, opacity: 0.8, bumpMap: strands(), bumpScale: 0.8 });
      return;
    case 'crop':
      cap(1.07, Math.PI * 0.45);
      bangs(5, 0);
      return;
    case 'sidepart':
      cap(1.08, Math.PI * 0.47);
      bangs(5, 0.6, 0.35);
      tuft(0.5, R * 0.86, -0.3, 1.5, 0.55, 1.2, 0.25);
      return;
    case 'spiky': {
      cap(1.05, Math.PI * 0.42);
      for (let k = 0; k < 17; k++) {
        const ringK = k < 10 ? 0 : 1;
        const n = ringK ? 7 : 10;
        const a = ((k - (ringK ? 10 : 0)) / n) * Math.PI * 2 + ringK * 0.3;
        const rad = ringK ? 0.32 : 0.68;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25, ringK ? 1.0 : 0.82, 10), m);
        const tilt = ringK ? 0.25 : 0.62;
        spike.position.set(Math.cos(a) * R * rad, R * (ringK ? 1.0 : 0.82), Math.sin(a) * R * rad + 0.08);
        spike.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        head.add(spike);
      }
      return;
    }
    case 'afro':
      for (let k = 0; k < 34; k++) {
        // curls packed over the top and back of the head
        const u = (k * 0.618034) % 1;
        const v = k / 34;
        const th = Math.acos(1 - v * 1.25);
        const ph = u * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph);
        const z = Math.sin(th) * Math.sin(ph);
        const y = Math.cos(th);
        if (z < -0.45 && y < 0.55) continue; // keep the face clear
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.44 + ((k * 7) % 5) * 0.025, 12, 10), m);
        ball.position.set(x * R * 1.02, y * R * 1.02 + 0.08, z * R * 1.02 + 0.12);
        head.add(ball);
      }
      return;
    case 'bob': {
      const bob = cap(1.12, Math.PI * 0.7, -0.05);
      bob.rotation.x = 0.55;
      bangs(6, 0.9);
      return;
    }
    case 'long': {
      cap(1.09, Math.PI * 0.5);
      bangs(5, 0.4, 0.2);
      const prof = [new THREE.Vector2(0.92, 0.5), new THREE.Vector2(1.0, 0), new THREE.Vector2(0.9, -0.9), new THREE.Vector2(0.7, -1.7), new THREE.Vector2(0.35, -2.05)];
      const fall = new THREE.Mesh(new THREE.LatheGeometry(prof, 28, Math.PI * 1.5 - 1.45, 2.9), new THREE.MeshStandardMaterial({ color: c.hairColor, roughness: 0.55, bumpMap: strands(), bumpScale: 1.6, side: THREE.DoubleSide }));
      // lathe phi 0 is +z; open toward the face
      fall.rotation.y = Math.PI;
      fall.scale.set(1.12, 1, 1.05);
      fall.position.set(0, 0.05, 0.12);
      fall.name = 'sway';
      head.add(fall);
      swingers.push(fall);
      return;
    }
    case 'ponytail': {
      cap(1.07, Math.PI * 0.47);
      bangs(4, 0.2);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 16), std(c.accent, 0.5));
      tie.position.set(0, R * 0.5, R * 1.0);
      head.add(tie);
      const tail = new THREE.Group();
      tail.position.set(0, R * 0.5, R * 1.02);
      for (let k = 0; k < 6; k++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.34 - k * 0.04, 12, 10), m);
        seg.scale.set(1, 1.25, 1);
        seg.position.set(0, -k * 0.3, 0.12 + Math.sin(k * 0.5) * 0.12);
        tail.add(seg);
      }
      head.add(tail);
      swingers.push(tail);
      return;
    }
    case 'pigtails':
      cap(1.07, Math.PI * 0.47);
      bangs(5, 0.5);
      for (const sx of [-1, 1]) {
        const tail = new THREE.Group();
        tail.position.set(sx * R * 1.02, R * 0.25, 0.2);
        const tie = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), std(c.accent, 0.5));
        tail.add(tie);
        for (let k = 0; k < 4; k++) {
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.36 - k * 0.05, 12, 10), m);
          seg.position.set(sx * (0.2 + k * 0.05), -0.15 - k * 0.3, 0);
          tail.add(seg);
        }
        head.add(tail);
        swingers.push(tail);
      }
      return;
  }
}

function addHeadwear(head: THREE.Group, c: Character) {
  const R = HEAD_R;
  const cloth = (color: string) => std(color, 0.75, { bumpMap: fabric(), bumpScale: 0.6 });
  if (c.accessory === 'sweatband') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.14, 10, 36), std(c.accent, 0.95, { bumpMap: fabric(), bumpScale: 1.2 }));
    band.rotation.x = Math.PI / 2 - 0.2;
    band.scale.z = 1.5;
    band.position.y = R * 0.42;
    head.add(band);
  } else if (c.accessory === 'visor' || c.accessory === 'cap') {
    if (c.accessory === 'cap') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), cloth(c.primary));
      crown.position.y = 0.08;
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), cloth(c.accent));
      button.position.y = R * 1.1 + 0.07;
      head.add(crown, button);
    } else {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.06, 0.32, 32, 1, true), cloth(c.primary));
      band.position.y = R * 0.5;
      (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      head.add(band);
    }
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.86, 0.07, 28, 1, false, Math.PI / 2, Math.PI), cloth(c.accent));
    brim.position.set(0, R * 0.42, -R * 0.75);
    brim.rotation.x = 0.12;
    head.add(brim);
  } else if (c.accessory === 'clips') {
    for (const sx of [-1, 1]) {
      const clip = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), std('#FFD166', 0.25, { metalness: 0.6 }));
      clip.position.set(sx * R * 0.62, R * 0.72, -R * 0.35);
      head.add(clip);
    }
  }
}

// ————— posing —————

export interface PoseInput {
  t: number;
  dt: number;
  speed: number;
  /** velocity in the player's own frame: forward (toward the net), right */
  fwd: number;
  side: number;
  action: FigureAction;
  /** 0..1 through the action */
  phase: number;
  /** a swing on the backhand side */
  backhand?: boolean;
  /** feet off the ground */
  air: number;
  /** a rally is on: stand ready on the balls of your feet */
  ready: boolean;
  /** seconds into a victory move, or -1 */
  cheer: number;
  /** seconds into a sulk, or -1 */
  sulk: number;
  /** where to look, in the figure's own frame (x right, y up, z back), or null */
  look: { x: number; y: number; z: number } | null;
  heat: number;
  fire: boolean;
  chef: boolean;
  /** which way a dive is going, in the figure's own frame */
  diveYaw?: number;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b */
const ramp = (t: number, a: number, b: number) => ease((t - a) / (b - a));

/** every joint the animator drives; angles in radians */
function rest(): Record<string, number> {
  return {
    y: 0, lean: 0, roll: 0, yaw: 0, pitch: 0,
    spX: 0, spY: 0, spZ: 0, hdX: 0, hdY: 0, hdZ: 0,
    sLx: 0, sLz: -0.14, eL: 0.18, sRx: 0, sRz: 0.14, eR: 0.18, sRy: 0, sLy: 0,
    hLx: 0, hLz: 0, kL: 0, hRx: 0, hRz: 0, kR: 0, fL: 0, fR: 0,
  };
}

export function poseFigure(f: Figure, o: PoseInput) {
  const p = rest();
  const stride = Math.min(1, o.speed / 11);
  const ph = o.t * (5 + o.speed * 0.55);
  const breath = Math.sin(o.t * 2.1);
  let rate = 16;

  // ——— standing, ready, running ———
  const crouch = o.ready ? 0.34 : 0.06;
  p.hLx = crouch;
  p.hRx = crouch;
  p.kL = -crouch * 1.9;
  p.kR = -crouch * 1.9;
  p.fL = crouch * 0.9;
  p.fR = crouch * 0.9;
  p.hLz = -0.07 - crouch * 0.25;
  p.hRz = 0.07 + crouch * 0.25;
  p.y = -crouch * crouch * 1.3 + breath * 0.012;
  p.spX = -crouch * 0.42 + breath * 0.012;
  p.hdX = crouch * 0.3;
  if (o.ready) {
    p.sLx = 0.55; p.sRx = 0.55; p.eL = 1.25; p.eR = 1.25; p.sLz = -0.3; p.sRz = 0.3;
    // weight shifting from foot to foot
    p.roll = Math.sin(o.t * 2.6) * 0.03;
    p.y += Math.abs(Math.sin(o.t * 5.2)) * 0.03;
  }
  if (stride > 0.02) {
    const s = Math.sin(ph * 2);
    const c2 = Math.cos(ph * 2);
    const run = stride;
    p.hLx = mix(p.hLx, 0.2 + s * 0.85, run);
    p.hRx = mix(p.hRx, 0.2 - s * 0.85, run);
    p.kL = mix(p.kL, -(0.35 + Math.max(0, -c2) * 1.25 + Math.max(0, -s) * 0.3), run);
    p.kR = mix(p.kR, -(0.35 + Math.max(0, c2) * 1.25 + Math.max(0, s) * 0.3), run);
    p.fL = mix(p.fL, Math.max(0, -s) * 0.5, run);
    p.fR = mix(p.fR, Math.max(0, s) * 0.5, run);
    p.y += Math.abs(Math.sin(ph * 2)) * 0.14 * run - 0.06 * run;
    p.sLx = mix(p.sLx, -s * 0.9 + 0.1, run);
    p.sRx = mix(p.sRx, s * 0.9 + 0.1, run);
    p.eL = mix(p.eL, 1.35, run);
    p.eR = mix(p.eR, 1.35, run);
    p.spY = s * 0.16 * run;
    p.lean = -o.fwd * 0.016;
    p.roll += -o.side * 0.013;
    p.spX -= 0.12 * run;
  }

  // ——— in the air ———
  if (o.air > 0.05 && o.action !== 'dive' && o.action !== 'down') {
    const up = Math.min(1, o.air / 2.2);
    p.hLx = 0.1; p.hRx = 0.35; p.kL = -0.9 * up - 0.2; p.kR = -1.25 * up - 0.2; p.fL = 0.7; p.fR = 0.7;
    p.hLz = -0.05; p.hRz = 0.05;
    p.y = 0;
    p.spX = -0.05;
  }

  const a = o.phase;
  switch (o.action) {
    case 'swing': if (o.backhand) {
      // backhand: turn the paddle shoulder toward the net, take it back across the body
      // to the left hip, then swing out and through to the right
      rate = 34;
      const back = ramp(a, 0, 0.22);
      const thru = ramp(a, 0.22, 0.5);
      const rec = ramp(a, 0.62, 1);
      const w = thru * (1 - rec);
      p.spY = mix(0.8 * back, -0.45, thru) * (1 - rec);
      p.sRx = mix(mix(0.5, 0.55, back), 1.35, thru);
      p.sRz = mix(mix(0.3, -0.55, back), 1.2, thru);
      p.sRy = mix(mix(0, 0.5, back), 0.7, thru);
      p.eR = mix(mix(1.25, 1.55, back), 0.2, thru);
      p.sRx = mix(p.sRx, 0.55, rec); p.sRz = mix(p.sRz, 0.3, rec); p.sRy = mix(p.sRy, 0, rec); p.eR = mix(p.eR, 1.25, rec);
      // the free hand steadies the paddle on the way back, then opens out behind
      p.sLx = mix(mix(0.55, 0.8, back), 0.2, thru) * (1 - rec) + 0.55 * rec;
      p.sLz = mix(mix(-0.3, 0.25, back), -0.9, thru) * (1 - rec) - 0.3 * rec;
      p.eL = mix(1.25, 1.5, back) * (1 - w) + 0.6 * w;
      p.spX -= 0.12 * w;
      p.hLx += 0.25 * w; p.kL -= 0.2 * w;
      p.hdY = -p.spY * 0.6;
      break;
    } else {
      // forehand: turn and take the paddle back, then whip through and across
      rate = 34;
      const back = ramp(a, 0, 0.22);
      const thru = ramp(a, 0.22, 0.5);
      const rec = ramp(a, 0.62, 1);
      const w = thru * (1 - rec);
      p.spY = mix(-0.75 * back, 0.7, thru) * (1 - rec);
      p.sRx = mix(mix(0.5, -0.5, back), 1.55, thru);
      p.sRz = mix(mix(0.3, 1.25, back), 0.15, thru);
      p.sRy = mix(0, -0.9, thru);
      p.eR = mix(mix(1.25, 1.0, back), 0.35, thru);
      p.sRx = mix(p.sRx, 0.55, rec); p.sRz = mix(p.sRz, 0.3, rec); p.sRy = mix(p.sRy, 0, rec); p.eR = mix(p.eR, 1.25, rec);
      p.sLx = mix(0.55, 0.9, back) * (1 - w) + 0.2 * w;
      p.sLz = -0.5 - back * 0.3;
      p.spX -= 0.12 * w;
      p.hRx += 0.25 * w; p.kR -= 0.2 * w;
      p.hdY = -p.spY * 0.6;
      break;
    }
    case 'bump': {
      // platform: arms locked out together, sink, then lift through the ball
      rate = 30;
      const set = ramp(a, 0, 0.25);
      const lift = ramp(a, 0.28, 0.55);
      const rec = ramp(a, 0.7, 1);
      const k = set * (1 - rec);
      const deep = k * (1 - lift * 0.75);
      p.sLx = mix(p.sLx, 0.85 + lift * 0.55, k); p.sRx = mix(p.sRx, 0.85 + lift * 0.55, k);
      p.sLz = mix(p.sLz, 0.36, k); p.sRz = mix(p.sRz, -0.36, k);
      p.eL = mix(p.eL, 0.04, k); p.eR = mix(p.eR, 0.04, k);
      p.hLx = mix(p.hLx, 0.95, deep); p.hRx = mix(p.hRx, 0.95, deep);
      p.kL = mix(p.kL, -1.7, deep); p.kR = mix(p.kR, -1.7, deep);
      p.fL = mix(p.fL, 0.75, deep); p.fR = mix(p.fR, 0.75, deep);
      p.hLz = -0.3 * k; p.hRz = 0.3 * k;
      p.y = mix(p.y, -0.72, deep);
      p.spX = mix(p.spX, -0.38 + lift * 0.2, k);
      p.hdX = 0.3 * k;
      break;
    }
    case 'set': {
      // hands above the forehead, elbows out, then push up through the fingers
      rate = 30;
      const up = ramp(a, 0, 0.25);
      const push = ramp(a, 0.28, 0.5);
      const rec = ramp(a, 0.72, 1);
      const k = up * (1 - rec);
      p.sLx = mix(p.sLx, 2.35 + push * 0.5, k); p.sRx = mix(p.sRx, 2.35 + push * 0.5, k);
      p.sLz = mix(p.sLz, -0.42, k); p.sRz = mix(p.sRz, 0.42, k);
      p.eL = mix(p.eL, 1.5 - push * 1.3, k); p.eR = mix(p.eR, 1.5 - push * 1.3, k);
      const sink = k * (1 - push);
      p.hLx = mix(p.hLx, 0.5, sink); p.hRx = mix(p.hRx, 0.5, sink);
      p.kL = mix(p.kL, -0.95, sink); p.kR = mix(p.kR, -0.95, sink);
      p.fL = mix(p.fL, 0.45, sink); p.fR = mix(p.fR, 0.45, sink);
      p.y = mix(p.y, -0.24, sink) + push * k * 0.12;
      p.spX = mix(p.spX, 0.12, k);
      p.hdX = -0.45 * k;
      break;
    }
    case 'toss':
    case 'spike': {
      // load both arms back, bow the body, point with the left, then snap the right through
      rate = 36;
      const load = ramp(a, 0, 0.2);
      const bow = ramp(a, 0.15, 0.42);
      const snap = ramp(a, 0.42, 0.56);
      const rec = ramp(a, 0.75, 1);
      const live = 1 - rec;
      if (o.action === 'toss') {
        // the toss: left hand lifts the ball, right arm draws back
        p.sLx = mix(0.6, 2.9, ramp(a, 0, 0.5)); p.eL = 0.1; p.sLz = -0.1;
        p.sRx = mix(0.5, 2.4, ramp(a, 0.2, 0.9)); p.sRz = 0.7; p.eR = 1.7;
        p.spX = 0.14 * ramp(a, 0.2, 1);
        p.hdX = -0.5 * ramp(a, 0, 0.6);
        break;
      }
      p.sLx = mix(mix(-0.9 * load, 2.9, bow), 0.5, snap) * live + 0.3 * rec;
      p.eL = mix(0.15, 0.5, snap);
      p.sLz = -0.2;
      p.sRx = mix(mix(-0.9 * load, 2.75, bow), 0.55, snap) * live + 0.3 * rec;
      p.sRz = mix(0.2, 0.85, bow) * (1 - snap) + 0.1 * snap;
      p.eR = mix(mix(0.3, 2.0, bow), 0.08, snap) * live + 0.6 * rec;
      p.spX = mix(mix(-0.2 * load, 0.42, bow), -0.5, snap) * live;
      p.spY = mix(-0.5 * bow, 0.45, snap) * live;
      p.hdX = mix(-0.4 * bow, 0.2, snap) * live;
      if (o.air > 0.05) {
        p.kL = mix(-1.5 * bow - 0.3, -0.25, snap); p.kR = mix(-1.7 * bow - 0.3, -0.35, snap);
        p.hLx = mix(-0.25 * bow, 0.55, snap); p.hRx = mix(-0.4 * bow, 0.65, snap);
      }
      break;
    }
    case 'block': {
      // straight up, hands wide, pressing over the net
      rate = 34;
      const up = ramp(a, 0, 0.18);
      const rec = ramp(a, 0.8, 1);
      const k = up * (1 - rec);
      p.sLx = mix(p.sLx, 3.0, k); p.sRx = mix(p.sRx, 3.0, k);
      p.sLz = mix(p.sLz, -0.2, k); p.sRz = mix(p.sRz, 0.2, k);
      p.eL = mix(p.eL, 0.04, k); p.eR = mix(p.eR, 0.04, k);
      p.spX = mix(p.spX, -0.1, k);
      if (o.air > 0.05) { p.kL = -0.12; p.kR = -0.12; p.hLx = 0.05; p.hRx = 0.05; p.fL = 0.9; p.fR = 0.9; }
      p.hdX = -0.3 * k;
      break;
    }
    case 'kick': {
      // soccer, big and readable from the far end: plant, draw the leg right back with
      // the knee bent, lean back, then whip it through the ball and follow up high, the
      // whole body following, a little hop off the standing foot and the arms flung wide
      rate = 40;
      const back = ramp(a, 0, 0.32);
      const thru = ramp(a, 0.32, 0.5);
      const settle = ramp(a, 0.72, 1);
      const k = 1 - settle;
      p.hRx = mix(p.hRx, mix(-1.25 * back, 1.85, thru), k);
      p.kR = mix(p.kR, mix(-1.9 * back - 0.2, -0.05, thru), k);
      p.fR = mix(p.fR, mix(0.8, -0.45, thru), k);
      p.hLx = mix(p.hLx, mix(0.35, 0.15, thru), k); p.kL = mix(p.kL, mix(-0.6, -0.25, thru), k);
      p.sLx = mix(p.sLx, mix(0.9, 0.3, thru), k); p.sLz = mix(p.sLz, -1.35, k); p.eL = mix(p.eL, 0.35, k);
      p.sRx = mix(p.sRx, mix(0.2, -0.9, thru), k); p.sRz = mix(p.sRz, 0.95, k); p.eR = mix(p.eR, 0.5, k);
      p.spY = mix(p.spY, mix(0.55, -0.45, thru), k);
      p.spX = mix(p.spX, mix(-0.2, 0.25, thru), k);
      p.lean = mix(p.lean, mix(0.12, -0.1, thru), k);
      p.y = mix(p.y, -0.08 + Math.sin(thru * Math.PI) * 0.22, k);
      break;
    }
    case 'slide': {
      // a slide tackle: down onto the hip, leaning back, the leading leg out straight
      rate = 30;
      const out = ramp(a, 0, 0.22);
      const up = ramp(a, 0.75, 1);
      const k = out * (1 - up);
      p.pitch = 0.95 * k;
      p.y = mix(p.y, -1.55, k);
      p.roll += 0.3 * k;
      p.hLx = mix(p.hLx, 1.45, k); p.kL = mix(p.kL, -0.05, k); p.fL = mix(p.fL, -0.3, k);
      p.hRx = mix(p.hRx, 1.0, k); p.kR = mix(p.kR, -1.3, k);
      p.sLx = mix(p.sLx, -0.6, k); p.sLz = mix(p.sLz, -1.1, k); p.eL = mix(p.eL, 0.2, k);
      p.sRx = mix(p.sRx, -0.9, k); p.sRz = mix(p.sRz, 0.8, k); p.eR = mix(p.eR, 0.4, k);
      p.hdX = 0.35 * k;
      break;
    }
    case 'dive': {
      // laid out along the sand, one arm reaching
      rate = 30;
      const out = ramp(a, 0, 0.3);
      const up = ramp(a, 0.72, 1);
      const k = out * (1 - up);
      p.pitch = -1.36 * k;
      p.y = mix(p.y, -1.42, k);
      p.yaw = (o.diveYaw ?? 0) * k;
      p.sLx = mix(p.sLx, 2.85, k); p.sRx = mix(p.sRx, 3.05, k); p.eL = mix(p.eL, 0.1, k); p.eR = mix(p.eR, 0.05, k);
      p.sLz = -0.35 * k; p.sRz = 0.1;
      p.hLx = mix(p.hLx, -0.15, k); p.hRx = mix(p.hRx, 0.1, k); p.kL = mix(p.kL, -0.2, k); p.kR = mix(p.kR, -0.75, k);
      p.fL = 0.9 * k; p.fR = 0.9 * k;
      p.spX = 0.3 * k;
      p.hdX = -0.75 * k;
      break;
    }
    case 'down': {
      // flattened by a super spike: on your back, then sit up and shake it off
      rate = 22;
      const fall = ramp(a, 0, 0.16);
      const up = ramp(a, 0.62, 1);
      const k = fall * (1 - up);
      p.pitch = 1.42 * k;
      p.y = mix(p.y, -1.48, k);
      p.sLx = mix(p.sLx, 0.3, k); p.sRx = mix(p.sRx, 0.3, k); p.sLz = mix(p.sLz, -1.35, k); p.sRz = mix(p.sRz, 1.35, k);
      p.eL = 0.3; p.eR = 0.3;
      p.hLx = mix(p.hLx, 0.5 + Math.sin(o.t * 9) * 0.12 * k, k); p.hRx = mix(p.hRx, 0.2, k);
      p.kL = mix(p.kL, -1.1, k); p.kR = mix(p.kR, -0.3, k); p.hLz = -0.3 * k; p.hRz = 0.3 * k;
      p.hdZ = Math.sin(o.t * 14) * 0.18 * up * (1 - ramp(a, 0.9, 1));
      break;
    }
  }

  // ——— personality: the victory move and the sulk ———
  if (o.cheer >= 0 && o.action === 'none' && o.air < 0.05) {
    const c = o.cheer;
    const inK = ramp(c, 0, 0.18);
    const beat = Math.sin(c * 11);
    rate = 22;
    switch (f.victory) {
      case 'pump':
        p.sRx = mix(p.sRx, 2.7 + beat * 0.35, inK); p.eR = mix(p.eR, 1.5 - beat * 0.9, inK); p.sRz = 0.35;
        p.sLx = mix(p.sLx, 0.5, inK); p.eL = 1.6; p.spX = -0.12 * inK; p.y += Math.abs(beat) * 0.3 * inK; p.hdX = -0.25 * inK;
        break;
      case 'flex':
        p.sLx = 1.5 * inK; p.sRx = 1.5 * inK; p.sLz = -1.35 * inK; p.sRz = 1.35 * inK;
        p.eL = mix(0.2, 2.2 + beat * 0.12, inK); p.eR = mix(0.2, 2.2 + beat * 0.12, inK);
        p.sLy = 1.2 * inK; p.sRy = -1.2 * inK; p.spX = 0.14 * inK; p.spY = Math.sin(c * 4) * 0.3 * inK; p.hdX = -0.2 * inK;
        break;
      case 'dance':
        p.roll = Math.sin(c * 8) * 0.16 * inK; p.spZ = -Math.sin(c * 8) * 0.22 * inK; p.y += Math.abs(Math.sin(c * 8)) * 0.22 * inK;
        p.sLx = (1.6 + Math.sin(c * 8) * 1.1) * inK; p.sRx = (1.6 - Math.sin(c * 8) * 1.1) * inK; p.eL = 1.1; p.eR = 1.1;
        p.hLz = -0.12 - Math.max(0, Math.sin(c * 8)) * 0.3; p.hRz = 0.12 + Math.max(0, -Math.sin(c * 8)) * 0.3; p.hdZ = Math.sin(c * 8) * 0.2 * inK;
        break;
      case 'spin':
        p.yaw = ease(Math.min(1, c / 0.9)) * Math.PI * 2;
        p.sLx = 0.2; p.sRx = 0.2; p.sLz = -1.5 * inK; p.sRz = 1.5 * inK; p.eL = 0.1; p.eR = 0.1;
        p.y += Math.sin(Math.min(1, c / 0.9) * Math.PI) * 0.5;
        if (c > 0.9) { p.sRx = 2.9; p.sRz = 0.3; p.sLz = -0.6; p.hdX = -0.3; }
        break;
      case 'robot':
        p.sLx = (Math.floor(c * 5) % 2 ? 1.57 : 0); p.eL = Math.floor(c * 5) % 2 ? 0 : 1.57; p.sLz = -0.2;
        p.sRx = (Math.floor(c * 5) % 2 ? 0 : 1.57); p.eR = Math.floor(c * 5) % 2 ? 1.57 : 0; p.sRz = 0.2;
        p.hdY = (Math.floor(c * 5) % 2 ? 0.5 : -0.5); p.spY = (Math.floor(c * 2.5) % 2 ? 0.25 : -0.25); rate = 40;
        break;
      case 'jump':
        p.y += Math.abs(Math.sin(c * 6.5)) * 0.95 * inK;
        p.sLx = 2.9 * inK; p.sRx = 2.9 * inK; p.sLz = -0.45; p.sRz = 0.45; p.eL = 0.15; p.eR = 0.15;
        p.kL = -0.5 - Math.abs(Math.cos(c * 6.5)) * 0.6; p.kR = p.kL; p.hLx = 0.3; p.hRx = 0.3; p.hdX = -0.3 * inK;
        break;
    }
  } else if (o.sulk >= 0 && o.action === 'none' && o.air < 0.05) {
    // head down, shoulders rolled, a little kick at the ground
    const k = ramp(o.sulk, 0.1, 0.5) * (1 - ramp(o.sulk, 1.3, 1.7));
    p.hdX = mix(p.hdX, 0.65, k); p.spX = mix(p.spX, -0.3, k);
    p.sLx = mix(p.sLx, 0.1, k); p.sRx = mix(p.sRx, 0.1, k); p.eL = mix(p.eL, 0.15, k); p.eR = mix(p.eR, 0.15, k);
    p.hdY = Math.sin(o.sulk * 5) * 0.28 * k;
    const kick = Math.max(0, Math.sin((o.sulk - 0.6) * 7)) * k * (o.sulk > 0.6 && o.sulk < 1.05 ? 1 : 0);
    p.hRx = mix(p.hRx, 0.7, kick); p.kR = mix(p.kR, -0.2, kick);
  } else if (o.look && o.action !== 'dive' && o.action !== 'down') {
    // eyes on the ball
    const yaw = Math.atan2(o.look.x, -o.look.z);
    const dist = Math.hypot(o.look.x, o.look.z);
    const pitchL = Math.atan2(o.look.y - 5.1 * f.scale, Math.max(1, dist));
    p.hdY += -Math.max(-0.9, Math.min(0.9, yaw)) * 0.75;
    p.hdX += -Math.max(-0.7, Math.min(0.6, pitchL)) * 0.7;
  }
  p.hdZ += Math.sin(o.t * 1.7) * 0.025;

  // ——— blend toward the pose ———
  const k = 1 - Math.exp(-o.dt * rate);
  const j = f.j;
  for (const key in p) j[key] = j[key] === undefined ? p[key] : j[key] + (p[key] - j[key]) * k;

  f.rig.position.y = PELVIS + j.y * YS + o.air / f.scale;
  f.rig.rotation.set(j.lean + j.pitch, j.yaw, j.roll);
  f.spine.rotation.set(j.spX, j.spY, j.spZ);
  f.head.rotation.set(j.hdX, j.hdY, j.hdZ);
  f.armL.shoulder.rotation.set(j.sLx, j.sLy, j.sLz);
  f.armR.shoulder.rotation.set(j.sRx, j.sRy, j.sRz);
  f.armL.elbow.rotation.x = j.eL;
  f.armR.elbow.rotation.x = j.eR;
  f.legL.hip.rotation.set(j.hLx, 0, j.hLz);
  f.legR.hip.rotation.set(j.hRx, 0, j.hRz);
  f.legL.knee.rotation.x = j.kL;
  f.legR.knee.rotation.x = j.kR;
  f.legL.foot.rotation.x = j.fL;
  f.legR.foot.rotation.x = j.fR;

  // hair that moves
  const sw = Math.sin(ph * 2 + 1) * 0.22 * stride + Math.min(0.5, o.air * 0.12);
  for (const s of f.swingers) {
    if (s.name === 'sway') s.rotation.x = -Math.min(0.35, stride * 0.14 + o.air * 0.05);
    else { s.rotation.z = sw; s.rotation.x = -stride * 0.35 - Math.min(0.6, o.air * 0.15); }
  }

  // the face: effort while hitting, joy and gloom after the point, and blinking
  let mood: Mood = 'play';
  if (o.action === 'down') mood = 'ouch';
  else if (o.cheer >= 0) mood = 'joy';
  else if (o.sulk >= 0) mood = 'sad';
  else if (o.action === 'spike' || o.action === 'dive' || o.action === 'block' || (o.action === 'swing' && a > 0.15 && a < 0.6)) mood = 'effort';
  else if (o.t > f.blinkAt) {
    mood = 'blink';
    if (o.t > f.blinkAt + 0.13) f.blinkAt = o.t + 1.8 + ((o.t * 37) % 3);
  }
  if (mood !== f.mood) {
    f.mood = mood;
    f.mouthMat.map = f.mouths[mood] ?? (f.mouths[mood] = mouthTexture(f.character, mood));
    f.mouthMat.needsUpdate = true;
  }
  // lids and brows carry the rest of the expression
  const wink = f.character.face === 'wink';
  const shut = mood === 'blink' || mood === 'joy' || mood === 'ouch';
  const squint = mood === 'effort' ? 0.45 : mood === 'sad' ? 0.3 : f.character.face === 'smirk' || f.character.face === 'focused' ? 0.18 : 0;
  f.lids.forEach((lid, i) => {
    const want = shut || (wink && i === 1 && mood === 'play') ? -0.62 : 0.8 - squint;
    lid.rotation.x += (want - lid.rotation.x) * Math.min(1, o.dt * 38);
  });
  const tilt = mood === 'effort' ? 0.42 : mood === 'sad' || mood === 'ouch' ? -0.38 : mood === 'joy' ? -0.12 : f.character.face === 'focused' ? 0.22 : f.character.face === 'smirk' ? 0.1 : 0;
  const lift = mood === 'joy' ? 0.05 : mood === 'effort' ? -0.03 : 0;
  for (const brow of f.brows) {
    const sx = brow.userData.side as number;
    const want = Math.PI / 2 + sx * tilt;
    brow.rotation.z += (want - brow.rotation.z) * Math.min(1, o.dt * 14);
    if (brow.userData.y === undefined) brow.userData.y = brow.position.y;
    brow.position.y += (brow.userData.y + lift + (f.character.face === 'smirk' && sx > 0 && mood === 'play' ? 0.04 : 0) - brow.position.y) * Math.min(1, o.dt * 14);
  }

  // heat: a warm glow from 50, a pulsing blaze on fire. Mostly on the paddle: the shirt
  // only warms a little, so people stay recognizable.
  const target = o.fire ? 0.8 + Math.sin(o.t * 12) * 0.3 : o.heat >= 50 ? 0.15 + ((o.heat - 50) / 50) * 0.3 : 0;
  f.glow.forEach((m, i) => {
    const want = target * (i === 0 ? (o.fire ? 0.14 : 0.05) : 1.1);
    m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, o.dt * 6);
  });
  f.chef.visible = o.chef;
}

/** where a figure's right hand is in the world, for sparks */
export function handPosition(f: Figure, out: THREE.Vector3): THREE.Vector3 {
  return f.armR.hand.getWorldPosition(out);
}

export function disposeFigure(f: Figure) {
  f.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      // shared bump maps stay; per-figure printed textures go
      if (map && map !== gripTex) map.dispose();
      mat.dispose();
    }
  });
  for (const t of Object.values(f.mouths)) t?.dispose();
}
