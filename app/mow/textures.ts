// Clean Cut — texture library: CC0 photo-scanned PBR sets (Poly Haven) plus a few
// procedurally painted ones (leaf atlases, siding, garage doors).

import * as THREE from 'three';

export type PbrName =
  | 'grey_roof_01' | 'red_brick_03' | 'beige_wall_001' | 'concrete_floor_02' | 'concrete_pavement_02'
  | 'asphalt_02' | 'bark_brown_02' | 'wood_chips' | 'weathered_brown_planks' | 'brown_mud_leaves_01';

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
}

export class TexLib {
  private loader = new THREE.TextureLoader();
  private sets = new Map<string, PbrSet>();
  private canv = new Map<string, THREE.Texture>();
  anisotropy = 8;
  pending: Promise<unknown>[] = [];

  private load(url: string, srgb: boolean): THREE.Texture {
    let resolve!: () => void;
    this.pending.push(new Promise<void>((r) => (resolve = r)));
    const t = this.loader.load(url, () => resolve(), undefined, () => resolve());
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy;
    return t;
  }

  pbr(name: PbrName): PbrSet {
    let s = this.sets.get(name);
    if (!s) {
      const base = `/mow/tex/${name}`;
      s = { map: this.load(`${base}_diff.jpg`, true), normalMap: this.load(`${base}_nor.jpg`, false), arm: this.load(`${base}_arm.jpg`, false) };
      this.sets.set(name, s);
    }
    return s;
  }

  /** Standard material from a PBR set. UVs are expected in metres; `scale` = metres per tile. */
  material(name: PbrName, opts: { scale?: number; tint?: THREE.ColorRepresentation; normal?: number; rough?: number } = {}): THREE.MeshStandardMaterial {
    const s = this.pbr(name);
    const scale = opts.scale ?? 2;
    const clone = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(1 / scale, 1 / scale);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({
      map: clone(s.map),
      normalMap: clone(s.normalMap),
      roughnessMap: clone(s.arm),
      aoMap: clone(s.arm),
      aoMapIntensity: 0.8,
      color: opts.tint ?? 0xffffff,
      roughness: opts.rough ?? 1,
      metalness: 0,
    });
    m.normalScale.setScalar(opts.normal ?? 1);
    return m;
  }

  async ready() {
    await Promise.all(this.pending);
    this.pending = [];
  }

  // ——————————————————————————— painted textures

  private canvasTex(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.Texture {
    const hit = this.canv.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.canv.set(key, t);
    return t;
  }

  /** A clump of leaves on transparent background, for crown cards. */
  leaves(kind: 'broad' | 'small' | 'needle' | 'shrub', hue: string[]): THREE.Texture {
    return this.canvasTex(`leaves-${kind}-${hue.join()}`, 512, 512, (ctx) => {
      let s = kind.length * 977 + hue.join().length * 31;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      ctx.clearRect(0, 0, 512, 512);
      const count = kind === 'needle' ? 900 : kind === 'small' ? 520 : kind === 'shrub' ? 700 : 260;
      // twigs first
      ctx.strokeStyle = 'rgba(70,52,34,0.9)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        ctx.lineWidth = kind === 'needle' ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(256, 470);
        ctx.quadraticCurveTo(256 + (rnd() - 0.5) * 200, 300, 256 + (rnd() - 0.5) * 420, 60 + rnd() * 200);
        ctx.stroke();
      }
      for (let i = 0; i < count; i++) {
        // keep leaves inside a soft disc so card edges never show
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 215;
        const x = 256 + Math.cos(a) * r;
        const y = 250 + Math.sin(a) * r * 0.95;
        const rot = rnd() * Math.PI * 2;
        const base = hue[Math.floor(rnd() * hue.length)];
        const shade = 0.55 + rnd() * 0.6 - (r / 215) * 0.1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = shadeHex(base, shade);
        if (kind === 'needle') {
          ctx.fillRect(-1.2, -16, 2.4, 32);
        } else {
          const L = kind === 'broad' ? 22 + rnd() * 12 : kind === 'shrub' ? 9 + rnd() * 5 : 12 + rnd() * 6;
          const Wd = L * (kind === 'broad' ? 0.62 : 0.5);
          ctx.beginPath();
          ctx.moveTo(0, -L);
          ctx.bezierCurveTo(Wd, -L * 0.5, Wd, L * 0.4, 0, L);
          ctx.bezierCurveTo(-Wd, L * 0.4, -Wd, -L * 0.5, 0, -L);
          ctx.fill();
          // midrib + a specular-ish highlight on one side
          ctx.strokeStyle = shadeHex(base, shade * 1.25);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -L * 0.9);
          ctx.lineTo(0, L * 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }
    });
  }

  /** Horizontal lap siding: colour is applied by material tint. */
  siding(): { map: THREE.Texture; normal: THREE.Texture } {
    const map = this.canvasTex('siding', 256, 256, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        const y = i * 32;
        const g = ctx.createLinearGradient(0, y, 0, y + 32);
        g.addColorStop(0, '#d9d9d9');
        g.addColorStop(0.12, '#f7f7f7');
        g.addColorStop(0.9, '#ffffff');
        g.addColorStop(1, '#bdbdbd');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, 256, 32);
      }
      // faint grain
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 18 + Math.random() * 40, 1);
      }
    });
    const normal = this.canvasTex('siding-n', 64, 256, (ctx) => {
      for (let y = 0; y < 256; y++) {
        const t = (y % 32) / 32;
        // board bottom edge faces down, face slopes out
        const ny = t < 0.1 ? 0.9 : t > 0.92 ? -0.6 : 0.18;
        const r = 128;
        const g = Math.round(128 + ny * 127);
        ctx.fillStyle = `rgb(${r},${g},${Math.round(Math.sqrt(Math.max(0, 1 - ny * ny)) * 127 + 128)})`;
        ctx.fillRect(0, y, 64, 1);
      }
    }, false);
    return { map, normal };
  }

  garageDoor(): THREE.Texture {
    return this.canvasTex('garage', 256, 256, (ctx) => {
      ctx.fillStyle = '#f2f2ef';
      ctx.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const x = 10 + c * 60;
          const y = 8 + r * 62;
          ctx.fillStyle = '#e2e2de';
          ctx.fillRect(x, y, 56, 54);
          ctx.strokeStyle = '#c9c9c4';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 4, y + 4, 48, 46);
        }
        ctx.fillStyle = '#b8b8b2';
        ctx.fillRect(0, 4 + r * 62 + 58, 256, 3);
      }
    });
  }

  /** Soft round blob for particles and contact shadows. */
  blob(): THREE.Texture {
    return this.canvasTex('blob', 128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
  }

  /** Sign face with lettering. */
  label(text: string, sub: string, bg = '#1f3b2c', fg = '#f4efe1'): THREE.Texture {
    return this.canvasTex(`label-${text}-${sub}`, 512, 256, (ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, 484, 228);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.font = 'bold 64px Georgia, serif';
      ctx.fillText(text, 256, 128);
      ctx.font = '32px Georgia, serif';
      ctx.fillText(sub, 256, 190);
    });
  }

  /** Decal for the mower hood. */
  decal(): THREE.Texture {
    return this.canvasTex('decal', 512, 128, (ctx) => {
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = '#111';
      ctx.font = 'italic 900 72px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLEAN CUT', 256, 86);
      ctx.fillStyle = '#f6c344';
      ctx.fillRect(40, 100, 432, 8);
    });
  }
}

export function shadeHex(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return `#${c.getHexString()}`;
}

/**
 * Box-project UVs in metres: each face takes the two world axes it's most aligned
 * with. Good enough for walls, slabs, decks and posts.
 */
export function metricUV(geo: THREE.BufferGeometry, offset = new THREE.Vector3()): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = z;
    } else if (nx >= nz) {
      uv[i * 2] = z;
      uv[i * 2 + 1] = y;
    } else {
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
