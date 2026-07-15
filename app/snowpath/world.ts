// Snowpath — town layout, snow depth simulation, pathfinding, ground & snow canvases
import * as THREE from 'three';
import {
  TILE, GRID, WORLD, YARD, ROAD, DRIVE, PAD, PARK, BLOCKED,
  SNOW_START, SNOW_CAP,
} from './types';

export interface HousePlot {
  id: number;
  family: string;
  roadTile: [number, number];
  driveTile: [number, number];
  padTile: [number, number];
  housePos: THREE.Vector3;   // world pos of house mesh
  faceYaw: number;           // rotation so door faces the road
  model: 'house_a' | 'house_b' | 'house_c';
  carColor: string;
}

export interface Destination {
  id: string;
  name: string;
  tile: [number, number];
  kind: 'building' | 'exit';
}

const FAMILIES = [
  'Maple', 'Birch', 'Holly', 'Frost', 'Winters', 'Pine', 'Hazel', 'Juniper',
  'Aspen', 'Cedar', 'Berry', 'Ivy', 'Willow', 'North', 'Alpine', 'Snow',
];
const CAR_COLORS = ['#4d8fd1', '#c95b4d', '#5aa46a', '#c9a44d', '#8a6fc9', '#d17ba8', '#4dc0c9', '#97a1ab'];
const HOUSE_MODELS: HousePlot['model'][] = ['house_a', 'house_b', 'house_c'];

export function tileToWorld(gx: number, gz: number): [number, number] {
  return [(gx - GRID / 2 + 0.5) * TILE, (gz - GRID / 2 + 0.5) * TILE];
}
export function worldToTile(x: number, z: number): [number, number] {
  return [
    Math.max(0, Math.min(GRID - 1, Math.floor(x / TILE + GRID / 2))),
    Math.max(0, Math.min(GRID - 1, Math.floor(z / TILE + GRID / 2))),
  ];
}

export class World {
  kind = new Uint8Array(GRID * GRID);       // tile kinds
  depth = new Float32Array(GRID * GRID);    // snow depth per tile
  houses: HousePlot[] = [];
  destinations: Destination[] = [];
  treeSpots: [number, number][] = [];       // world xz
  lampSpots: [number, number][] = [];
  parkCenter: THREE.Vector3;
  snowmanPos: THREE.Vector3;

  groundCanvas: HTMLCanvasElement;
  snowCanvas: HTMLCanvasElement;
  snowCtx: CanvasRenderingContext2D;
  snowTexture!: THREE.CanvasTexture;
  private snowDirty = false;

  constructor() {
    this.buildLayout();
    this.depth.fill(0);
    for (let i = 0; i < this.kind.length; i++) {
      const k = this.kind[i];
      if (k === ROAD || k === DRIVE || k === PAD) this.depth[i] = SNOW_START;
    }
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = this.groundCanvas.height = 2048;
    this.paintGround();
    this.snowCanvas = document.createElement('canvas');
    this.snowCanvas.width = this.snowCanvas.height = 1024;
    this.snowCtx = this.snowCanvas.getContext('2d')!;
    this.paintInitialSnow();
    const [px, pz] = tileToWorld(26, 26);
    this.parkCenter = new THREE.Vector3(px, 0, pz);
    const [sx, sz] = tileToWorld(28, 25);
    this.snowmanPos = new THREE.Vector3(sx, 0, sz);
  }

  at(gx: number, gz: number): number {
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return BLOCKED;
    return this.kind[gz * GRID + gx];
  }
  depthAt(gx: number, gz: number): number {
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return 0;
    return this.depth[gz * GRID + gx];
  }
  depthAtWorld(x: number, z: number): number {
    const [gx, gz] = worldToTile(x, z);
    return this.depthAt(gx, gz);
  }
  isDrivable(gx: number, gz: number): boolean {
    const k = this.at(gx, gz);
    return k === ROAD || k === DRIVE || k === PAD;
  }

  // ---------- layout ----------

  private setTile(gx: number, gz: number, k: number) {
    if (gx >= 0 && gz >= 0 && gx < GRID && gz < GRID) this.kind[gz * GRID + gx] = k;
  }

  private roadH(gz: number, x0: number, x1: number) {
    for (let x = x0; x <= x1; x++) this.setTile(x, gz, ROAD);
  }
  private roadV(gx: number, z0: number, z1: number) {
    for (let z = z0; z <= z1; z++) this.setTile(gx, z, ROAD);
  }

  private placeHouse(roadX: number, roadZ: number, dx: number, dz: number): boolean {
    if (this.at(roadX, roadZ) !== ROAD) return false;
    const drive: [number, number] = [roadX + dx, roadZ + dz];
    const pad: [number, number] = [roadX + dx * 2, roadZ + dz * 2];
    // house footprint: 2 tiles beyond pad, plus one on each side
    const foot: [number, number][] = [];
    for (let i = 3; i <= 4; i++) {
      for (let s = -1; s <= 1; s++) {
        foot.push([roadX + dx * i + (dz !== 0 ? s : 0), roadZ + dz * i + (dx !== 0 ? s : 0)]);
      }
    }
    const all: [number, number][] = [drive, pad, ...foot];
    for (const [x, z] of all) {
      if (this.at(x, z) !== YARD) return false;
    }
    this.setTile(drive[0], drive[1], DRIVE);
    this.setTile(pad[0], pad[1], PAD);
    for (const [x, z] of foot) this.setTile(x, z, BLOCKED);
    const id = this.houses.length;
    const [hx, hz] = tileToWorld(roadX + dx * 3.5, roadZ + dz * 3.5);
    const faceYaw = Math.atan2(dx, dz); // door (-Z side of model) faces back toward the road
    this.houses.push({
      id,
      family: FAMILIES[id % FAMILIES.length],
      roadTile: [roadX, roadZ],
      driveTile: drive,
      padTile: pad,
      housePos: new THREE.Vector3(hx, 0, hz),
      faceYaw,
      model: HOUSE_MODELS[id % 3],
      carColor: CAR_COLORS[id % CAR_COLORS.length],
    });
    return true;
  }

  private buildLayout() {
    // main grid roads (exits run to the map edge)
    this.roadH(6, 4, 36);
    this.roadH(20, 2, 37);
    this.roadH(33, 4, 36);
    this.roadV(6, 6, 33);
    this.roadV(20, 2, 37);
    this.roadV(33, 6, 33);
    this.roadV(13, 20, 33);
    this.roadV(27, 6, 20);

    // park (inside the SE-center block)
    for (let x = 22; x <= 31; x++) {
      for (let z = 22; z <= 31; z++) this.setTile(x, z, PARK);
    }

    // school (north road) and store (center road) footprints
    for (let x = 8; x <= 12; x++) for (let z = 2; z <= 5; z++) this.setTile(x, z, BLOCKED);
    for (let x = 22; x <= 26; x++) for (let z = 16; z <= 19; z++) this.setTile(x, z, BLOCKED);

    this.destinations = [
      { id: 'school', name: 'School', tile: [10, 6], kind: 'building' },
      { id: 'store', name: 'General Store', tile: [24, 20], kind: 'building' },
      { id: 'west', name: "Grandma's", tile: [2, 20], kind: 'exit' },
      { id: 'east', name: 'Ski Hill', tile: [37, 20], kind: 'exit' },
      { id: 'north', name: 'Sled Race', tile: [20, 2], kind: 'exit' },
      { id: 'south', name: 'Ice Pond', tile: [20, 37], kind: 'exit' },
    ];

    // houses (candidates; placeHouse validates space)
    const candidates: [number, number, number, number][] = [
      [9, 6, 0, 1], [13, 6, 0, 1], [17, 6, 0, 1], [24, 6, 0, -1], [30, 6, 0, -1],
      [9, 20, 0, -1], [16, 20, 0, 1], [30, 20, 0, -1],
      [9, 33, 0, -1], [16, 33, 0, 1], [24, 33, 0, 1], [29, 33, 0, -1],
      [6, 11, 1, 0], [6, 16, -1, 0], [6, 26, 1, 0], [6, 30, -1, 0],
      [33, 11, 1, 0], [33, 27, 1, 0],
      [13, 25, -1, 0], [13, 30, -1, 0],
      [27, 10, 1, 0], [27, 15, 1, 0],
    ];
    for (const [rx, rz, dx, dz] of candidates) {
      if (this.houses.length >= 16) break;
      this.placeHouse(rx, rz, dx, dz);
    }

    // trees: scatter in yards + park edge (deterministic pseudo-random)
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 240; i++) {
      const gx = Math.floor(rnd() * GRID);
      const gz = Math.floor(rnd() * GRID);
      const k = this.at(gx, gz);
      if (k === YARD || k === PARK) {
        // keep off the immediate road shoulders so plow sightlines stay open
        if (this.at(gx + 1, gz) === ROAD || this.at(gx - 1, gz) === ROAD ||
            this.at(gx, gz + 1) === ROAD || this.at(gx, gz - 1) === ROAD) {
          if (rnd() < 0.6) continue;
        }
        const [wx, wz] = tileToWorld(gx, gz);
        this.treeSpots.push([wx + (rnd() - 0.5) * 3, wz + (rnd() - 0.5) * 3]);
        if (this.treeSpots.length >= 90) break;
      }
    }

    // lampposts at intersections
    const lampsAt: [number, number][] = [
      [6, 6], [20, 6], [33, 6], [27, 6],
      [6, 20], [20, 20], [33, 20], [13, 20],
      [6, 33], [20, 33], [33, 33], [13, 33],
    ];
    for (const [gx, gz] of lampsAt) {
      const [wx, wz] = tileToWorld(gx, gz);
      this.lampSpots.push([wx + TILE * 0.7, wz + TILE * 0.7]);
    }
  }

  // ---------- pathfinding (BFS over drivable tiles) ----------

  findPath(from: [number, number], to: [number, number]): [number, number][] | null {
    const key = (x: number, z: number) => z * GRID + x;
    const prev = new Int32Array(GRID * GRID).fill(-1);
    const seen = new Uint8Array(GRID * GRID);
    const q: number[] = [key(from[0], from[1])];
    seen[q[0]] = 1;
    const target = key(to[0], to[1]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === target) break;
      const cx = cur % GRID, cz = Math.floor(cur / GRID);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
        const nk = key(nx, nz);
        if (seen[nk] || !this.isDrivable(nx, nz)) continue;
        seen[nk] = 1;
        prev[nk] = cur;
        q.push(nk);
      }
    }
    if (!seen[target]) return null;
    const path: [number, number][] = [];
    let cur = target;
    while (cur !== -1) {
      path.push([cur % GRID, Math.floor(cur / GRID)]);
      if (cur === key(from[0], from[1])) break;
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  // ---------- snow simulation ----------

  /** uniform snowfall on drivable tiles; rate in depth-units/sec */
  snowfall(rate: number, dt: number) {
    const add = rate * dt;
    if (add <= 0) return;
    for (let i = 0; i < this.kind.length; i++) {
      const k = this.kind[i];
      if (k === ROAD || k === DRIVE || k === PAD) {
        this.depth[i] = Math.min(SNOW_CAP, this.depth[i] + add);
      }
    }
  }

  /** clear a circular area (worldspace). Returns amount removed. */
  clearAt(x: number, z: number, radius: number, amount: number): number {
    const [gx, gz] = worldToTile(x, z);
    let removed = 0;
    const r = Math.max(1, Math.ceil(radius / TILE));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const tx = gx + dx, tz = gz + dz;
        if (!this.isDrivable(tx, tz)) continue;
        const [wx, wz] = tileToWorld(tx, tz);
        if ((wx - x) ** 2 + (wz - z) ** 2 > (radius + TILE * 0.4) ** 2) continue;
        const i = tz * GRID + tx;
        const take = Math.min(this.depth[i], amount);
        this.depth[i] -= take;
        removed += take;
      }
    }
    if (removed > 0.001) this.stampClear(x, z, radius);
    return removed;
  }

  /** dump snow onto a tile (plow banks). Returns true if it landed on a driveway/pad. */
  deposit(gx: number, gz: number, amount: number): boolean {
    const k = this.at(gx, gz);
    const i = gz * GRID + gx;
    if (k === DRIVE || k === PAD) {
      this.depth[i] = Math.min(SNOW_CAP, this.depth[i] + amount);
      const [wx, wz] = tileToWorld(gx, gz);
      this.stampSnow(wx, wz, TILE * 0.55, 0.5);
      return true;
    }
    if (k === YARD || k === PARK) {
      const [wx, wz] = tileToWorld(gx, gz);
      this.stampSnow(wx, wz, TILE * 0.4, 0.35); // visual bank only
    }
    return false;
  }

  // ---------- canvases ----------

  private w2c(x: number, canvas: number) { return ((x + WORLD / 2) / WORLD) * canvas; }

  private paintGround() {
    const ctx = this.groundCanvas.getContext('2d')!;
    const C = this.groundCanvas.width;
    const t = C / GRID;
    // snowy yard base with soft blue mottling
    ctx.fillStyle = '#e8eef6';
    ctx.fillRect(0, 0, C, C);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(205,220,238,0.35)' : 'rgba(255,255,255,0.5)';
      const r = 8 + rnd() * 42;
      ctx.beginPath();
      ctx.arc(rnd() * C, rnd() * C, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // tiles
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const k = this.kind[gz * GRID + gx];
        if (k === ROAD) {
          ctx.fillStyle = '#33383f';
          ctx.fillRect(gx * t - 1, gz * t - 1, t + 2, t + 2);
        } else if (k === DRIVE || k === PAD) {
          ctx.fillStyle = '#5a6069';
          ctx.fillRect(gx * t, gz * t, t, t);
        } else if (k === PARK) {
          ctx.fillStyle = '#dfe9f2';
          ctx.fillRect(gx * t, gz * t, t, t);
        }
      }
    }
    // faint road center dashes
    ctx.strokeStyle = 'rgba(200,205,60,0.5)';
    ctx.lineWidth = Math.max(2, t * 0.06);
    ctx.setLineDash([t * 0.5, t * 0.55]);
    const dash = (x0: number, z0: number, x1: number, z1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0 * t + t / 2, z0 * t + t / 2);
      ctx.lineTo(x1 * t + t / 2, z1 * t + t / 2);
      ctx.stroke();
    };
    dash(4, 6, 36, 6); dash(2, 20, 37, 20); dash(4, 33, 36, 33);
    dash(6, 6, 6, 33); dash(20, 2, 20, 37); dash(33, 6, 33, 33);
    dash(13, 20, 13, 33); dash(27, 6, 27, 20);
    ctx.setLineDash([]);
  }

  private paintInitialSnow() {
    const ctx = this.snowCtx;
    const C = this.snowCanvas.width;
    ctx.fillStyle = 'rgba(247,250,254,0.96)';
    ctx.fillRect(0, 0, C, C);
    let seed = 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(226,236,248,0.5)';
      ctx.beginPath();
      ctx.arc(rnd() * C, rnd() * C, 4 + rnd() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    this.snowDirty = true;
  }

  stampClear(x: number, z: number, radius: number) {
    const C = this.snowCanvas.width;
    const ctx = this.snowCtx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(this.w2c(x, C), this.w2c(z, C), (radius / WORLD) * C, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    this.snowDirty = true;
  }

  stampSnow(x: number, z: number, radius: number, alpha: number) {
    const C = this.snowCanvas.width;
    const ctx = this.snowCtx;
    ctx.fillStyle = `rgba(240,246,253,${alpha})`;
    ctx.beginPath();
    ctx.arc(this.w2c(x, C), this.w2c(z, C), (radius / WORLD) * C, 0, Math.PI * 2);
    ctx.fill();
    this.snowDirty = true;
  }

  /** gentle visual re-whitening to match ongoing snowfall */
  accumulateVisual(alpha: number) {
    if (alpha <= 0.002) return;
    const ctx = this.snowCtx;
    ctx.fillStyle = `rgba(247,250,254,${Math.min(0.2, alpha)})`;
    ctx.fillRect(0, 0, this.snowCanvas.width, this.snowCanvas.height);
    this.snowDirty = true;
  }

  flushSnowTexture() {
    if (this.snowDirty && this.snowTexture) {
      this.snowTexture.needsUpdate = true;
      this.snowDirty = false;
    }
  }

  // ---------- scene construction ----------

  buildGroundMeshes(scene: THREE.Scene) {
    const groundTex = new THREE.CanvasTexture(this.groundCanvas);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.snowTexture = new THREE.CanvasTexture(this.snowCanvas);
    this.snowTexture.colorSpace = THREE.SRGBColorSpace;
    const snow = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD, WORLD),
      new THREE.MeshStandardMaterial({
        map: this.snowTexture, transparent: true, roughness: 0.92,
        depthWrite: false,
      }),
    );
    snow.rotation.x = -Math.PI / 2;
    snow.position.y = 0.06;
    snow.receiveShadow = true;
    scene.add(snow);

    // soft white rim beyond the town so the world doesn't end abruptly
    const rim = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD * 4, WORLD * 4),
      new THREE.MeshStandardMaterial({ color: 0xeff4fa, roughness: 1 }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.08;
    scene.add(rim);
  }
}
