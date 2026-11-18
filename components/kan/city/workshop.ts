import * as THREE from 'three';

/**
 * A bot at work, in the open where you can watch: it stands at an easel and sketches.
 *
 * Little stick-figure doodles draw themselves line by line on the board, a pencil
 * follows the line, and each finished step of the real run throws a puff of sparkles.
 * Everything here is one small group with its own materials, so it comes and goes
 * without touching the merged city.
 */

type Stroke = [number, number][];
/** Doodles on a 0..1 board, y down. Each is a few strokes, drawn in order. */
const DOODLES: Stroke[][] = [
  // A stick figure waving.
  [
    circle(0.5, 0.26, 0.09),
    [[0.5, 0.35], [0.5, 0.62]],
    [[0.5, 0.42], [0.36, 0.52]],
    [[0.5, 0.42], [0.63, 0.3], [0.68, 0.22]],
    [[0.5, 0.62], [0.4, 0.82]],
    [[0.5, 0.62], [0.6, 0.82]],
  ],
  // A light bulb: the idea.
  [
    circle(0.5, 0.38, 0.17),
    [[0.43, 0.54], [0.43, 0.66], [0.57, 0.66], [0.57, 0.54]],
    [[0.44, 0.71], [0.56, 0.71]],
    [[0.24, 0.3], [0.17, 0.26]],
    [[0.76, 0.3], [0.83, 0.26]],
    [[0.5, 0.13], [0.5, 0.05]],
  ],
  // Two figures and a speech bubble: explaining.
  [
    circle(0.3, 0.42, 0.07),
    [[0.3, 0.49], [0.3, 0.7], [0.23, 0.85]],
    [[0.3, 0.7], [0.37, 0.85]],
    circle(0.72, 0.5, 0.06),
    [[0.72, 0.56], [0.72, 0.72], [0.66, 0.85]],
    [[0.72, 0.72], [0.78, 0.85]],
    [[0.36, 0.3], [0.36, 0.12], [0.7, 0.12], [0.7, 0.3], [0.46, 0.3], [0.38, 0.38], [0.4, 0.3], [0.36, 0.3]],
  ],
  // A star and an arrow: making it.
  [
    star(0.36, 0.42, 0.2),
    [[0.6, 0.66], [0.86, 0.66]],
    [[0.79, 0.59], [0.86, 0.66], [0.79, 0.73]],
  ],
];

function circle(cx: number, cy: number, r: number): Stroke {
  return Array.from({ length: 21 }, (_, i) => [cx + Math.cos((i / 20) * Math.PI * 2) * r, cy + Math.sin((i / 20) * Math.PI * 2) * r] as [number, number]);
}
function star(cx: number, cy: number, r: number): Stroke {
  return Array.from({ length: 11 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const k = i % 2 ? 0.45 : 1;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as [number, number];
  });
}
const lengthOf = (s: Stroke) => s.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - s[i][0], p[1] - s[i][1]), 0);

const PX = 256;
const INK = ['#1f2937', '#7c3aed', '#0f766e', '#c2410c'];

export class Workshop {
  readonly group = new THREE.Group();
  /** Where the bot should stand and which way it faces while it works. */
  readonly stand: { x: number; z: number };
  readonly facing: number;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private pencil: THREE.Mesh;
  private board: THREE.Mesh;
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private doodle = Math.floor(Math.random() * DOODLES.length);
  /** How far along the current doodle, in board units of line drawn. */
  private drawn = 0;
  private hold = 0;
  private disposables: { dispose(): void }[] = [];

  /**
   * @param at   where the bot is
   * @param view where the camera looks from, so bot and board both face it a little
   */
  constructor(at: { x: number; z: number }, view: { x: number; z: number }, groundY: number) {
    this.canvas.width = this.canvas.height = PX;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.wipe();

    // Toward the camera, turned a quarter so you see the bot side-on and the board face-on.
    const toCam = Math.atan2(view.x - at.x, view.z - at.z);
    // Off to the bot's side, a little toward you, like a painter on a stage.
    const side = toCam + Math.PI * 0.38;
    const ex = at.x + Math.sin(side) * 2.7;
    const ez = at.z + Math.cos(side) * 2.7;
    this.stand = { ...at };
    this.facing = Math.atan2(ex - at.x, ez - at.z);

    const wood = this.own(new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.8 }));
    // Lit from within, so the sketch reads at night as well as by day.
    const paper = this.own(new THREE.MeshBasicMaterial({ map: this.tex }));
    const legGeo = this.own(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6));
    const easel = new THREE.Group();
    for (const [x, tilt] of [[-0.42, 0.12], [0.42, -0.12]] as const) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(x, 0.92, 0.05);
      leg.rotation.set(-0.12, 0, tilt);
      easel.add(leg);
    }
    const back = new THREE.Mesh(legGeo, wood);
    back.position.set(0, 0.85, -0.32);
    back.rotation.x = 0.35;
    easel.add(back);
    const ledge = new THREE.Mesh(this.own(new THREE.BoxGeometry(1.0, 0.05, 0.12)), wood);
    ledge.position.set(0, 0.62, 0.12);
    easel.add(ledge);
    this.board = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.95, 0.95, 0.04)), [wood, wood, wood, wood, paper, wood]);
    this.board.position.set(0, 1.12, 0.1);
    // Leaned back, toward a camera that looks down on the city.
    this.board.rotation.x = -0.3;
    easel.add(this.board);
    this.pencil = new THREE.Mesh(this.own(new THREE.ConeGeometry(0.035, 0.28, 6)), this.own(new THREE.MeshStandardMaterial({ color: '#facc15' })));
    easel.add(this.pencil);
    easel.position.set(ex, groundY, ez);
    // The board turns halfway between the bot and you, so it can draw and you can see.
    const toBot = Math.atan2(at.x - ex, at.z - ez);
    let half = toCam - toBot;
    half = Math.atan2(Math.sin(half), Math.cos(half));
    easel.rotation.y = toBot + half * 0.6;
    easel.scale.setScalar(1.45);
    for (const m of easel.children) { m.castShadow = true; }
    this.group.add(easel);
    this.group.userData.dynamic = true;
  }

  private own<T extends { dispose(): void }>(x: T): T { this.disposables.push(x); return x; }

  private wipe() {
    const c = this.ctx;
    c.fillStyle = '#fbf7ec';
    c.fillRect(0, 0, PX, PX);
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 1;
    for (let y = 24; y < PX; y += 24) { c.beginPath(); c.moveTo(8, y); c.lineTo(PX - 8, y); c.stroke(); }
    this.tex.needsUpdate = true;
  }

  /** Draw the current doodle up to `drawn`; returns the pencil's point on the board. */
  private paint(): [number, number] {
    const strokes = DOODLES[this.doodle];
    const c = this.ctx;
    this.wipe();
    c.strokeStyle = INK[this.doodle % INK.length];
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    let left = this.drawn;
    let tip: [number, number] = strokes[0][0];
    for (const s of strokes) {
      if (left <= 0) break;
      c.beginPath();
      c.moveTo(s[0][0] * PX, s[0][1] * PX);
      tip = s[0];
      for (let i = 1; i < s.length && left > 0; i++) {
        const seg = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
        const k = Math.min(1, left / seg);
        tip = [s[i - 1][0] + (s[i][0] - s[i - 1][0]) * k, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * k];
        c.lineTo(tip[0] * PX, tip[1] * PX);
        left -= seg;
      }
      c.stroke();
    }
    this.tex.needsUpdate = true;
    return tip;
  }

  /** A step of the real work finished: a puff of sparkles off the board. */
  beat() {
    const geo = this.own(new THREE.OctahedronGeometry(0.06));
    const easel = this.group.children[0];
    const at = new THREE.Vector3(0, 1.6, 0.1).applyMatrix4(easel.matrixWorld);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, this.own(new THREE.MeshBasicMaterial({ color: ['#fde047', '#c4b5fd', '#f9a8d4', '#86efac'][i % 4], transparent: true })));
      m.position.copy(at);
      this.group.add(m);
      const a = Math.random() * Math.PI * 2;
      this.sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * 1.2, 2 + Math.random() * 1.5, Math.sin(a) * 1.2), life: 1 });
    }
  }

  step(t: number, dt: number) {
    const total = DOODLES[this.doodle].reduce((n, s) => n + lengthOf(s), 0);
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) { this.doodle = (this.doodle + 1) % DOODLES.length; this.drawn = 0; }
    } else {
      this.drawn += dt * 0.55;
      if (this.drawn >= total) { this.drawn = total; this.hold = 1.1; }
    }
    const tip = this.paint();
    // The pencil rides the line, just off the paper, tilted like it's being held.
    const lift = this.hold > 0 ? 0.12 + Math.sin(t * 3) * 0.03 : 0.04;
    this.pencil.position.set((tip[0] - 0.5) * 0.9, 1.12 + (0.5 - tip[1]) * 0.9 + 0.1, 0.1 + 0.06 + lift);
    this.pencil.rotation.set(-0.9, 0, 0.5);

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt * 0.9;
      s.v.y -= dt * 4;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.y += dt * 6;
      (s.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life);
      if (s.life <= 0) { s.m.removeFromParent(); this.sparks.splice(i, 1); }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.tex.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
