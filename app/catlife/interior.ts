// Whisker Wilds — building interiors.
// Walking through a big building's door swaps the entire island out for one of
// these rooms. Nothing outside exists while you're in here: its own floor, its
// own walls, its own lights. The star of every room is a shelf the kids fill
// and rearrange however they like.

import * as THREE from 'three';
import { SHELF_ITEMS, type RoomDef } from './data';

export interface ShelfSlotSpot { x: number; y: number; z: number }

export class Interior {
  readonly def: RoomDef;
  readonly group = new THREE.Group();
  /** where the cat lands when it walks in, and where the exit doormat is */
  readonly entry: { x: number; z: number };
  /** stand here to open the shelf organizer */
  readonly shelfSpot: { x: number; z: number };
  readonly slotCount: number;
  /** stand here for a nap */
  readonly bedSpot: { x: number; z: number };

  private slotSpots: ShelfSlotSpot[] = [];
  private placed: THREE.Object3D[] = [];
  private itemRoot = new THREE.Group();
  private glowRing: THREE.Mesh;
  private flame: THREE.Mesh | null = null;
  private fireLight: THREE.PointLight | null = null;
  /** how far out from the back wall the shelf sticks */
  private shelfDepth = 1.2;

  constructor(def: RoomDef) {
    this.def = def;
    this.slotCount = def.shelfRows * def.shelfCols;
    this.entry = { x: 0, z: def.hd - 1.6 };
    this.bedSpot = { x: def.hw - 3.0, z: -def.hd + 2.6 };
    this.group.visible = false;
    this.group.add(this.itemRoot);

    this.buildShell();
    this.buildLights();
    this.buildShelf();
    this.buildFurniture();

    // a soft ring marking the way out, so nobody gets stuck inside
    this.glowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    this.glowRing.rotation.x = -Math.PI / 2;
    this.glowRing.position.set(this.entry.x, 0.03, this.entry.z);
    this.group.add(this.glowRing);

    this.shelfSpot = { x: 0, z: -def.hd + 2.3 };
  }

  // ——— the room shell ———
  private buildShell() {
    const d = this.def;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(d.hw * 2, 0.3, d.hd * 2),
      new THREE.MeshStandardMaterial({ color: d.floorColor, roughness: 0.85 })
    );
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    this.group.add(floor);

    // floorboard seams
    const seam = new THREE.MeshStandardMaterial({ color: '#00000022', transparent: true, opacity: 0.18, roughness: 1 });
    for (let i = -Math.floor(d.hw); i <= d.hw; i += 1.5) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, d.hd * 2), seam);
      line.position.set(i, 0.011, 0);
      this.group.add(line);
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: d.innerWallColor, roughness: 0.95, side: THREE.DoubleSide,
    });
    const H = d.wallH;
    // back + two sides are solid; the front wall has the doorway cut out of it
    const back = new THREE.Mesh(new THREE.PlaneGeometry(d.hw * 2, H), wallMat);
    back.position.set(0, H / 2, -d.hd);
    back.receiveShadow = true;
    this.group.add(back);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(d.hd * 2, H), wallMat);
      w.rotation.y = Math.PI / 2;
      w.position.set(side * d.hw, H / 2, 0);
      w.receiveShadow = true;
      this.group.add(w);
    }
    // front wall in three pieces around a 3-wide, 4-tall doorway
    const doorW = 3.0, doorH = 4.0;
    for (const side of [-1, 1]) {
      const w = (d.hw * 2 - doorW) / 2;
      const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      piece.position.set(side * (doorW / 2 + w / 2), H / 2, d.hd);
      this.group.add(piece);
    }
    const above = new THREE.Mesh(new THREE.PlaneGeometry(doorW, H - doorH), wallMat);
    above.position.set(0, doorH + (H - doorH) / 2, d.hd);
    this.group.add(above);

    // ceiling with exposed beams
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(d.hw * 2, d.hd * 2),
      new THREE.MeshStandardMaterial({ color: '#8a6f4c', roughness: 1, side: THREE.DoubleSide })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.group.add(ceil);
    const beamMat = new THREE.MeshStandardMaterial({ color: '#5a4028', roughness: 1 });
    for (let i = -d.hd + 2; i < d.hd - 1; i += 3) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(d.hw * 2, 0.34, 0.34), beamMat);
      beam.position.set(0, H - 0.2, i);
      this.group.add(beam);
    }

    // the daylight outside the doorway — a bright wall so it reads as "out there"
    const outside = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW, doorH),
      new THREE.MeshBasicMaterial({ color: '#bfe3f5' })
    );
    outside.position.set(0, doorH / 2, d.hd - 0.02);
    this.group.add(outside);

    // windows on the side walls, glowing with daylight
    const glassMat = new THREE.MeshBasicMaterial({ color: '#dff0fb' });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#6e5136', roughness: 1 });
    for (const side of [-1, 1]) {
      for (const off of [-d.hd * 0.45, d.hd * 0.45]) {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), glassMat);
        glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        glass.position.set(side * (d.hw - 0.03), H * 0.55, off);
        this.group.add(glass);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 2.7), frameMat);
        frame.position.set(side * (d.hw - 0.06), H * 0.55, off);
        this.group.add(frame);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 2.4), frameMat);
        cross.position.set(side * (d.hw - 0.09), H * 0.55, off);
        this.group.add(cross);
      }
    }
  }

  private buildLights() {
    const d = this.def;
    // a room needs its own sky: the island's sun is switched off in here
    this.group.add(new THREE.HemisphereLight('#ffe9c9', '#6b5a44', 1.2));
    // a floor of ambient so no surface ever reads as a black hole
    this.group.add(new THREE.AmbientLight('#fff0d8', 0.55));
    const lampMat = new THREE.MeshStandardMaterial({
      color: '#ffe9b0', emissive: '#ffc860', emissiveIntensity: 1.4, roughness: 0.4,
    });
    for (const zPos of [-d.hd * 0.4, d.hd * 0.4]) {
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5),
        new THREE.MeshStandardMaterial({ color: '#3a2a18' })
      );
      cord.position.set(0, d.wallH - 0.6, zPos);
      this.group.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 12, 1, true), lampMat);
      shade.position.set(0, d.wallH - 1.3, zPos);
      this.group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMat);
      bulb.position.set(0, d.wallH - 1.5, zPos);
      this.group.add(bulb);
      const light = new THREE.PointLight('#ffcf85', 1.5, 24, 1.6);
      light.position.set(0, d.wallH - 1.5, zPos);
      this.group.add(light);
    }
    // daylight leaning in through the doorway
    const doorLight = new THREE.PointLight('#cfe6ff', 1.1, 18, 1.8);
    doorLight.position.set(0, 2.6, d.hd - 1.2);
    this.group.add(doorLight);
  }

  // ——— the shelf: the thing the kids are actually here for ———
  private buildShelf() {
    const d = this.def;
    const shelfW = Math.min(d.hw * 1.6, d.shelfCols * 1.5);
    const cellW = shelfW / d.shelfCols;
    const cellH = 1.25;
    const shelfH = d.shelfRows * cellH;
    const depth = 0.85;
    const zPos = -d.hd + depth / 2 + 0.05;

    const woodMat = new THREE.MeshStandardMaterial({ color: '#7d5836', roughness: 0.9 });
    const backMat = new THREE.MeshStandardMaterial({ color: '#5c4028', roughness: 1 });

    const back = new THREE.Mesh(new THREE.BoxGeometry(shelfW + 0.3, shelfH + 0.4, 0.1), backMat);
    back.position.set(0, shelfH / 2 + 0.2, zPos - depth / 2);
    this.group.add(back);

    // horizontal boards
    for (let r = 0; r <= d.shelfRows; r++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(shelfW + 0.3, 0.14, depth), woodMat);
      board.position.set(0, r * cellH + 0.1, zPos);
      board.castShadow = true;
      board.receiveShadow = true;
      this.group.add(board);
    }
    // vertical dividers
    for (let ccol = 0; ccol <= d.shelfCols; ccol++) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, shelfH + 0.2, depth), woodMat);
      side.position.set(-shelfW / 2 + ccol * cellW, shelfH / 2 + 0.1, zPos);
      this.group.add(side);
    }
    // a crown along the top
    const crown = new THREE.Mesh(new THREE.BoxGeometry(shelfW + 0.7, 0.3, depth + 0.25), woodMat);
    crown.position.set(0, shelfH + 0.3, zPos);
    crown.castShadow = true;
    this.group.add(crown);

    for (let r = 0; r < d.shelfRows; r++) {
      for (let ccol = 0; ccol < d.shelfCols; ccol++) {
        this.slotSpots.push({
          // slot 0 is the TOP-LEFT one, matching how the organizer UI reads
          x: -shelfW / 2 + cellW * (ccol + 0.5),
          y: (d.shelfRows - 1 - r) * cellH + 0.24,
          z: zPos + 0.05,
        });
      }
    }
  }

  private buildFurniture() {
    const d = this.def;
    const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.95 });

    // a big soft rug in the middle of the room
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(d.hw, d.hd) * 0.55, 28),
      new THREE.MeshStandardMaterial({ color: '#b5546f', roughness: 1 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.02;
    rug.receiveShadow = true;
    this.group.add(rug);
    const rugRing = new THREE.Mesh(
      new THREE.RingGeometry(Math.min(d.hw, d.hd) * 0.36, Math.min(d.hw, d.hd) * 0.44, 28),
      new THREE.MeshStandardMaterial({ color: '#e0a2b4', roughness: 1, side: THREE.DoubleSide })
    );
    rugRing.rotation.x = -Math.PI / 2;
    rugRing.position.y = 0.03;
    this.group.add(rugRing);

    // a cat bed in the corner, for naps
    const bed = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.33, 8, 20),
      new THREE.MeshStandardMaterial({ color: '#7ab5d8', roughness: 1 })
    );
    bed.rotation.x = Math.PI / 2;
    bed.position.set(this.bedSpot.x, 0.3, this.bedSpot.z);
    bed.castShadow = true;
    this.group.add(bed);
    const pillow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 18),
      new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 1 })
    );
    pillow.rotation.x = -Math.PI / 2;
    pillow.position.set(this.bedSpot.x, 0.16, this.bedSpot.z);
    this.group.add(pillow);

    // a low table with cushions around it
    const tableX = -d.hw + 3.2, tableZ = -d.hd + 3.2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.16, 16), woodMat);
    top.position.set(tableX, 0.85, tableZ);
    top.castShadow = true;
    this.group.add(top);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.85, 10), woodMat);
    stem.position.set(tableX, 0.42, tableZ);
    this.group.add(stem);
    ['#9ec97f', '#f5d76e', '#c8a2d8'].forEach((col, i) => {
      const a = i * 2.1 + 0.6;
      const cush = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8),
        new THREE.MeshStandardMaterial({ color: col, roughness: 1 })
      );
      cush.scale.set(1, 0.34, 1);
      cush.position.set(tableX + Math.cos(a) * 2.0, 0.18, tableZ + Math.sin(a) * 2.0);
      cush.castShadow = true;
      this.group.add(cush);
    });

    // a fireplace on the left wall
    const stone = new THREE.MeshStandardMaterial({ color: '#8d8880', roughness: 1 });
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 3.2), stone);
    hearth.position.set(-d.hw + 0.35, 1.7, d.hd * 0.25);
    this.group.add(hearth);
    const fireBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1.5, 1.9),
      new THREE.MeshStandardMaterial({ color: '#2a1c12', roughness: 1 })
    );
    fireBox.position.set(-d.hw + 0.75, 0.8, d.hd * 0.25);
    this.group.add(fireBox);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.0, 8),
      new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a18', emissiveIntensity: 1.5, roughness: 0.5 })
    );
    flame.position.set(-d.hw + 0.85, 0.6, d.hd * 0.25);
    this.group.add(flame);
    this.flame = flame;
    const fireLight = new THREE.PointLight('#ff9a3c', 1.6, 14, 2);
    fireLight.position.set(-d.hw + 1.2, 1.0, d.hd * 0.25);
    this.group.add(fireLight);
    this.fireLight = fireLight;

    // potted plants flanking the shelf
    for (const side of [-1, 1]) {
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.32, 0.6, 10),
        new THREE.MeshStandardMaterial({ color: '#b5654a', roughness: 1 })
      );
      pot.position.set(side * (d.hw - 1.4), 0.3, -d.hd + 1.2);
      this.group.add(pot);
      for (let k = 0; k < 5; k++) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 8, 6),
          new THREE.MeshStandardMaterial({ color: k % 2 ? '#4d7c3a' : '#5e9146', roughness: 1 })
        );
        leaf.position.set(
          side * (d.hw - 1.4) + Math.cos(k * 1.3) * 0.3,
          0.75 + k * 0.22,
          -d.hd + 1.2 + Math.sin(k * 1.3) * 0.3
        );
        this.group.add(leaf);
      }
    }
  }

  /** rebuild the little objects sitting on the shelf */
  setShelf(items: (string | null)[]) {
    for (const o of this.placed) {
      this.itemRoot.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.placed = [];

    items.slice(0, this.slotCount).forEach((id, i) => {
      if (!id) return;
      const def = SHELF_ITEMS.find((s) => s.id === id);
      const spot = this.slotSpots[i];
      if (!def || !spot) return;
      const obj = this.makeItem(def.shape, def.color);
      obj.position.set(spot.x, spot.y, spot.z);
      this.itemRoot.add(obj);
      this.placed.push(obj);
    });
  }

  private makeItem(shape: string, color: string): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const dark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.65), roughness: 0.8,
    });
    switch (shape) {
      case 'book': {
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.72, 0.42), k === 1 ? dark : mat);
          b.position.set((k - 1) * 0.16, 0.36, 0);
          b.rotation.z = k === 2 ? 0.18 : 0;
          b.castShadow = true;
          g.add(b);
        }
        break;
      }
      case 'stack': {
        for (let k = 0; k < 4; k++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.44), k % 2 ? dark : mat);
          b.position.set(0, 0.07 + k * 0.15, 0);
          b.rotation.y = (k % 2 ? 1 : -1) * 0.12;
          b.castShadow = true;
          g.add(b);
        }
        break;
      }
      case 'jar': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.55, 12), mat);
        body.position.y = 0.28;
        body.castShadow = true;
        g.add(body);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), dark);
        lid.position.y = 0.6;
        g.add(lid);
        break;
      }
      case 'cup': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.34, 12), mat);
        body.position.y = 0.17;
        body.castShadow = true;
        g.add(body);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12), mat);
        handle.position.set(0.26, 0.19, 0);
        g.add(handle);
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 14), dark);
        saucer.position.y = 0.025;
        g.add(saucer);
        break;
      }
      case 'plant': {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.18, 0.3, 10),
          new THREE.MeshStandardMaterial({ color: '#b5654a', roughness: 1 })
        );
        pot.position.y = 0.15;
        pot.castShadow = true;
        g.add(pot);
        for (let k = 0; k < 4; k++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), k % 2 ? dark : mat);
          leaf.position.set(Math.cos(k * 1.6) * 0.16, 0.42 + k * 0.11, Math.sin(k * 1.6) * 0.16);
          g.add(leaf);
        }
        break;
      }
      case 'ball': {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat);
        b.position.y = 0.28;
        b.castShadow = true;
        g.add(b);
        for (let k = 0; k < 3; k++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 5, 16), dark);
          band.position.y = 0.28;
          band.rotation.set(k * 0.9, k * 1.2, 0);
          g.add(band);
        }
        break;
      }
      case 'frame': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.52, 0.07), mat);
        frame.position.y = 0.3;
        frame.rotation.x = -0.14;
        frame.castShadow = true;
        g.add(frame);
        const pic = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5, 0.36),
          new THREE.MeshStandardMaterial({ color: '#cfe6f5', roughness: 0.6 })
        );
        pic.position.set(0, 0.31, 0.05);
        pic.rotation.x = -0.14;
        g.add(pic);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.3), dark);
        stand.position.set(0, 0.03, -0.08);
        g.add(stand);
        break;
      }
      default: { // 'star' — trophies, shells, crystals
        const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
        b.position.y = 0.4;
        b.castShadow = true;
        g.add(b);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 10), dark);
        plinth.position.y = 0.08;
        g.add(plinth);
        break;
      }
    }
    return g;
  }

  update(dt: number, time: number) {
    void dt;
    // fire flicker + a gentle pulse on the exit ring so kids spot the way out
    if (this.flame) {
      const f = 0.85 + Math.sin(time * 9) * 0.1 + Math.sin(time * 21) * 0.06;
      this.flame.scale.set(f, 0.9 + f * 0.25, f);
    }
    if (this.fireLight) this.fireLight.intensity = 1.4 + Math.sin(time * 11) * 0.3;
    const m = this.glowRing.material as THREE.MeshBasicMaterial;
    m.opacity = 0.35 + Math.sin(time * 2.4) * 0.15;
  }

  /** keep a cat inside the four walls */
  clamp(x: number, z: number, radius: number): { x: number; z: number } {
    const d = this.def;
    const lim = 0.35 + radius;
    return {
      x: Math.max(-d.hw + lim, Math.min(d.hw - lim, x)),
      // the shelf is solid furniture, so the back wall sits further in
      z: Math.max(-d.hd + this.shelfDepth + radius, Math.min(d.hd - lim, z)),
    };
  }

  dispose() {
    this.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
