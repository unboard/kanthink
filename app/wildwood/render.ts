// Wildwood — canvas renderer.
// Painterly isometric world: pre-rendered tile & tree sprites, animated water,
// fully procedural bird art, day/night lighting, fireflies and stars.

import {
  MAP,
  TILE_W,
  TILE_H,
  T,
  hash2,
  tileAt,
  type World,
  type Tree,
  type TileId,
} from './world';
import { BIRD_BY_ID, FISH_BY_ID, type BirdLook, type FishLook } from './species';
import type { BirdEntity, GameState } from './types';

const HW = TILE_W / 2; // 32
const HH = TILE_H / 2; // 16

export const isoX = (x: number, y: number) => (x - y) * HW;
export const isoY = (x: number, y: number) => (x + y) * HH;

// ---- lighting keyframes -------------------------------------------------------

interface LightKey {
  t: number;
  mult: [number, number, number, number];
  glow: [number, number, number, number];
}
const LIGHT: LightKey[] = [
  { t: 0.0, mult: [42, 58, 112, 0.56], glow: [0, 0, 0, 0] },
  { t: 0.17, mult: [42, 58, 112, 0.56], glow: [60, 60, 140, 0.04] },
  { t: 0.225, mult: [225, 150, 115, 0.26], glow: [255, 150, 80, 0.18] },
  { t: 0.3, mult: [255, 226, 190, 0.1], glow: [255, 190, 120, 0.07] },
  { t: 0.4, mult: [0, 0, 0, 0], glow: [0, 0, 0, 0] },
  { t: 0.7, mult: [0, 0, 0, 0], glow: [0, 0, 0, 0] },
  { t: 0.78, mult: [232, 162, 92, 0.18], glow: [255, 160, 70, 0.14] },
  { t: 0.86, mult: [152, 92, 112, 0.36], glow: [255, 110, 60, 0.1] },
  { t: 0.93, mult: [42, 58, 112, 0.56], glow: [0, 0, 0, 0] },
  { t: 1.0, mult: [42, 58, 112, 0.56], glow: [0, 0, 0, 0] },
];

function lerpLight(t: number) {
  let a = LIGHT[0];
  let b = LIGHT[LIGHT.length - 1];
  for (let i = 0; i < LIGHT.length - 1; i++) {
    if (t >= LIGHT[i].t && t <= LIGHT[i + 1].t) {
      a = LIGHT[i];
      b = LIGHT[i + 1];
      break;
    }
  }
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const mix = (i: number, k: 'mult' | 'glow') => a[k][i] + (b[k][i] - a[k][i]) * f;
  return {
    mult: [mix(0, 'mult'), mix(1, 'mult'), mix(2, 'mult'), mix(3, 'mult')] as const,
    glow: [mix(0, 'glow'), mix(1, 'glow'), mix(2, 'glow'), mix(3, 'glow')] as const,
  };
}

export function nightness(t: number) {
  if (t < 0.17 || t > 0.95) return 1;
  if (t < 0.3) return 1 - (t - 0.17) / 0.13;
  if (t > 0.82) return (t - 0.82) / 0.13;
  return 0;
}

// ---- tile palettes --------------------------------------------------------------

const TILE_BASE: Record<number, [string, string]> = {
  [T.DEEP]: ['#2a5d7d', '#245270'],
  [T.WATER]: ['#3d7c97', '#37718b'],
  [T.SAND]: ['#cfbb8b', '#c3af7f'],
  [T.MARSH]: ['#5e7a4e', '#52704a'],
  [T.GRASS]: ['#7ca857', '#73a050'],
  [T.MEADOW]: ['#93b65f', '#8aae58'],
  [T.FOREST]: ['#5b7f47', '#547743'],
  [T.PINE]: ['#4d6f47', '#466843'],
  [T.ROCK]: ['#8f8e83', '#85847a'],
  [T.PATH]: ['#b59c72', '#ac9268'],
};

const FLOWER_COLORS = ['#e8e3ee', '#e8c94e', '#d96a8a', '#7a8fd9', '#e88a4e'];

// =================================================================================

export class Renderer {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  world: World;
  W = 0;
  H = 0;
  dpr = 1;

  private tileSprites = new Map<string, HTMLCanvasElement>();
  private treeSprites = new Map<string, HTMLCanvasElement>();
  private cabinSprite: HTMLCanvasElement;
  private structSprites = new Map<string, HTMLCanvasElement>();
  private waterEdges: { x: number; y: number }[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private fireflies: { x: number; y: number; p: number; s: number }[] = [];

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.world = world;
    this.buildTileSprites();
    this.buildTreeSprites();
    this.cabinSprite = buildCabin();
    this.buildStructSprites();

    // shoreline foam positions: water tiles that touch land
    for (let y = 1; y < MAP - 1; y++) {
      for (let x = 1; x < MAP - 1; x++) {
        const t = world.tiles[y * MAP + x];
        if (t !== T.WATER) continue;
        const land = (dx: number, dy: number) => {
          const tt = world.tiles[(y + dy) * MAP + (x + dx)];
          return tt !== T.WATER && tt !== T.DEEP;
        };
        if (land(1, 0) || land(-1, 0) || land(0, 1) || land(0, -1)) this.waterEdges.push({ x, y });
      }
    }

    for (let i = 0; i < 130; i++) {
      this.stars.push({
        x: hash2(i, 7),
        y: hash2(i, 11) * 0.55,
        r: 0.6 + hash2(i, 13) * 1.2,
        p: hash2(i, 17) * Math.PI * 2,
      });
    }
    // fireflies live near marsh & meadow
    let placed = 0;
    let tries = 0;
    while (placed < 44 && tries++ < 4000) {
      const x = 4 + hash2(tries, 23) * (MAP - 8);
      const y = 4 + hash2(tries, 29) * (MAP - 8);
      const t = tileAt(world, x, y);
      if (t === T.MEADOW || t === T.MARSH || t === T.GRASS) {
        this.fireflies.push({ x, y, p: hash2(tries, 31) * 100, s: 0.5 + hash2(tries, 37) });
        placed++;
      }
    }
  }

  resize() {
    const rect = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = rect.width;
    this.H = rect.height;
    this.cv.width = Math.round(rect.width * this.dpr);
    this.cv.height = Math.round(rect.height * this.dpr);
  }

  // screen px (css) for a world point, given camera
  sx(s: GameState, wx: number, wy: number) {
    return (isoX(wx, wy) - isoX(s.cam.x, s.cam.y)) * s.cam.zoom + this.W / 2;
  }
  sy(s: GameState, wx: number, wy: number) {
    return (isoY(wx, wy) - isoY(s.cam.x, s.cam.y)) * s.cam.zoom + this.H / 2;
  }

  screenToWorld(s: GameState, px: number, py: number) {
    const wpx = (px - this.W / 2) / s.cam.zoom + isoX(s.cam.x, s.cam.y);
    const wpy = (py - this.H / 2) / s.cam.zoom + isoY(s.cam.x, s.cam.y);
    return { x: (wpx / HW + wpy / HH) / 2, y: (wpy / HH - wpx / HW) / 2 };
  }

  // ---- sprite building ----------------------------------------------------------

  private buildTileSprites() {
    const types = [T.DEEP, T.WATER, T.SAND, T.MARSH, T.GRASS, T.MEADOW, T.FOREST, T.PINE, T.ROCK, T.PATH];
    for (const tt of types) {
      for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas');
        c.width = TILE_W + 4;
        c.height = TILE_H + 4;
        const g = c.getContext('2d')!;
        g.translate(2, 2);
        drawTileSprite(g, tt, v);
        this.tileSprites.set(`${tt}:${v}`, c);
      }
    }
  }

  private buildTreeSprites() {
    for (const kind of ['oak', 'birch', 'pine'] as const) {
      for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas');
        c.width = 170;
        c.height = 210;
        const g = c.getContext('2d')!;
        drawTreeSprite(g, kind, v);
        this.treeSprites.set(`${kind}:${v}`, c);
      }
    }
  }

  private buildStructSprites() {
    const ids = ['feeder', 'thistle', 'suet', 'nectar', 'orange', 'bath', 'berry', 'wildflowers', 'nestbox'];
    for (const id of ids) {
      const c = document.createElement('canvas');
      c.width = 90;
      c.height = 120;
      const g = c.getContext('2d')!;
      drawStructureSprite(g, id);
      this.structSprites.set(id, c);
    }
  }

  // ---- main draw ------------------------------------------------------------------

  draw(s: GameState, now: number) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const z = s.cam.zoom;
    const light = lerpLight(s.time.t);
    const night = nightness(s.time.t);

    ctx.fillStyle = '#16301c';
    ctx.fillRect(0, 0, this.W, this.H);

    // visible tile bounds
    const corners = [
      this.screenToWorld(s, -TILE_W, -TILE_H * 3),
      this.screenToWorld(s, this.W + TILE_W, -TILE_H * 3),
      this.screenToWorld(s, -TILE_W, this.H + TILE_H * 6),
      this.screenToWorld(s, this.W + TILE_W, this.H + TILE_H * 6),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    const maxX = Math.min(MAP - 1, Math.ceil(Math.max(...corners.map((c) => c.x))));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    const maxY = Math.min(MAP - 1, Math.ceil(Math.max(...corners.map((c) => c.y))));

    // ground
    const tw = (TILE_W + 4) * z;
    const th = (TILE_H + 4) * z;
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tt = this.world.tiles[ty * MAP + tx];
        const v = Math.floor(hash2(tx, ty, 5) * 4);
        const px = this.sx(s, tx, ty) - (TILE_W / 2 + 2) * z;
        const py = this.sy(s, tx, ty) - 2 * z;
        if (px > this.W || py > this.H || px + tw < 0 || py + th < 0) continue;
        ctx.drawImage(this.tileSprites.get(`${tt}:${v}`)!, px, py, tw, th);

        // animated water shimmer
        if (tt === T.WATER || tt === T.DEEP) {
          const a = 0.04 + 0.05 * Math.sin(now * 1.6 + tx * 1.1 + ty * 1.7);
          if (a > 0.02) {
            ctx.fillStyle = `rgba(180,220,235,${a.toFixed(3)})`;
            diamond(ctx, px + tw / 2, py + th / 2, tw * 0.36, th * 0.36);
            ctx.fill();
          }
          const tw2 = Math.sin(now * 2.4 + tx * 7.3 + ty * 3.9);
          if (tw2 > 0.985) {
            ctx.fillStyle = 'rgba(235,250,255,0.85)';
            ctx.fillRect(px + tw * (0.3 + hash2(tx, ty, 8) * 0.4), py + th * 0.45, 2 * z, 1.4 * z);
          }
        }
      }
    }

    // shoreline foam
    ctx.strokeStyle = 'rgba(225,240,240,0.5)';
    for (const e of this.waterEdges) {
      if (e.x < minX || e.x > maxX || e.y < minY || e.y > maxY) continue;
      const a = 0.18 + 0.16 * Math.sin(now * 1.8 + e.x * 2.1 + e.y * 1.3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.lineWidth = 1.6 * z;
      const cx = this.sx(s, e.x + 0.5, e.y + 0.5);
      const cy = this.sy(s, e.x + 0.5, e.y + 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, cy, HW * 0.42 * z, HH * 0.42 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ground-level effects (ripples)
    for (const ef of s.effects) {
      if (ef.kind !== 'ripple' && ef.kind !== 'splash') continue;
      const f = (s.simT - ef.t0) / ef.dur;
      if (f < 0 || f > 1) continue;
      const cx = this.sx(s, ef.x, ef.y);
      const cy = this.sy(s, ef.x, ef.y);
      if (ef.kind === 'ripple') {
        ctx.strokeStyle = `rgba(220,240,245,${(0.55 * (1 - f)).toFixed(3)})`;
        ctx.lineWidth = 1.4 * z;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (4 + f * 26) * z, (2 + f * 13) * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(235,248,250,${(0.8 * (1 - f)).toFixed(3)})`;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const r = f * 12 * z;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.5 - f * 8 * z, 1.6 * z * (1 - f), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // wildflower patches lie flat on the ground
    for (const st of s.structures) {
      if (st.type !== 'wildflowers') continue;
      const spr = this.structSprites.get('wildflowers')!;
      const cx = this.sx(s, st.x, st.y);
      const cy = this.sy(s, st.x, st.y);
      ctx.drawImage(spr, cx - 45 * z, cy - 60 * z * 0.45, 90 * z, 120 * z * 0.45);
    }

    // ---- entity pass (depth sorted) ----
    type Drawable = { d: number; fn: () => void };
    const items: Drawable[] = [];
    const inView = (x: number, y: number, pad = 4) =>
      x > minX - pad && x < maxX + pad && y > minY - pad && y < maxY + pad;

    // trees
    for (let gy = Math.floor(minY / 8) - 1; gy <= Math.floor(maxY / 8) + 1; gy++) {
      for (let gx = Math.floor(minX / 8) - 1; gx <= Math.floor(maxX / 8) + 1; gx++) {
        const arr = this.world.treeGrid.get(gy * 16 + gx);
        if (!arr) continue;
        for (const tr of arr) {
          if (!inView(tr.x, tr.y)) continue;
          items.push({
            d: tr.x + tr.y,
            fn: () => {
              const spr = this.treeSprites.get(`${tr.kind}:${tr.variant}`)!;
              const w = 170 * tr.scale * z;
              const h = 210 * tr.scale * z;
              ctx.drawImage(spr, this.sx(s, tr.x, tr.y) - w / 2, this.sy(s, tr.x, tr.y) - h + 8 * z, w, h);
            },
          });
        }
      }
    }

    // cabin (+ chimney smoke)
    {
      const cb = this.world.cabin;
      items.push({
        d: cb.x + cb.y + 1.5,
        fn: () => {
          const w = 280 * z;
          const h = 240 * z;
          const cx = this.sx(s, cb.x, cb.y);
          const cy = this.sy(s, cb.x, cb.y);
          ctx.drawImage(this.cabinSprite, cx - w / 2, cy - h + 22 * z, w, h);
          // warm window at night
          if (night > 0.25) {
            ctx.fillStyle = `rgba(255,214,120,${(night * 0.85).toFixed(2)})`;
            ctx.fillRect(cx - 62 * z, cy - 92 * z, 26 * z, 20 * z);
          }
          // smoke
          for (let i = 0; i < 3; i++) {
            const f = ((now * 0.25 + i * 0.33) % 1 + 1) % 1;
            ctx.fillStyle = `rgba(225,222,212,${(0.3 * (1 - f)).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(
              cx + 48 * z + Math.sin(now * 0.8 + i * 2.4) * 7 * z * f,
              cy - 175 * z - f * 46 * z,
              (4 + f * 9) * z,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        },
      });
    }

    // structures (except flat wildflowers)
    for (const st of s.structures) {
      if (st.type === 'wildflowers' || !inView(st.x, st.y)) continue;
      items.push({
        d: st.x + st.y,
        fn: () => {
          const spr = this.structSprites.get(st.type)!;
          const w = 90 * z;
          const h = 120 * z;
          ctx.drawImage(spr, this.sx(s, st.x, st.y) - w / 2, this.sy(s, st.x, st.y) - h + 6 * z, w, h);
        },
      });
    }

    // nests (only when discovered, or a subtle hint in bino mode)
    for (const n of s.nests) {
      if (!inView(n.x, n.y) || n.done) continue;
      items.push({
        d: n.x + n.y + 0.01,
        fn: () => this.drawNest(s, n.x, n.y, n.discovered, n.stage, now, z),
      });
    }

    // birds
    const soaring: BirdEntity[] = [];
    for (const b of s.birds) {
      if (!inView(b.x, b.y, 8)) continue;
      if (b.z > 60) {
        soaring.push(b);
        // ground shadow
        items.push({
          d: b.x + b.y,
          fn: () => {
            ctx.fillStyle = 'rgba(20,35,20,0.15)';
            ctx.beginPath();
            ctx.ellipse(this.sx(s, b.x, b.y), this.sy(s, b.x, b.y), 9 * z, 4 * z, 0, 0, Math.PI * 2);
            ctx.fill();
          },
        });
        continue;
      }
      items.push({
        d: b.x + b.y,
        fn: () => {
          const cx = this.sx(s, b.x, b.y);
          const cy = this.sy(s, b.x, b.y) - b.z * z;
          const look = BIRD_BY_ID[b.species].look;
          if (b.z > 2 && !b.onWater && (b.state === 'fly' || b.state === 'flee')) {
            ctx.fillStyle = 'rgba(20,35,20,0.12)';
            ctx.beginPath();
            ctx.ellipse(this.sx(s, b.x, b.y), this.sy(s, b.x, b.y), 6 * z, 2.6 * z, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(z * b.facing, z);
          drawBird(ctx, look, b, now);
          ctx.restore();
        },
      });
    }

    // player
    items.push({
      d: s.player.x + s.player.y,
      fn: () => {
        const cx = this.sx(s, s.player.x, s.player.y);
        const cy = this.sy(s, s.player.x, s.player.y);
        ctx.fillStyle = 'rgba(20,35,20,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 8 * z, 3.4 * z, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(z * s.player.facing, z);
        drawPlayer(ctx, s, now);
        ctx.restore();
        if (s.mode === 'fishing' && s.fishing) this.drawFishingGear(s, now);
      },
    });

    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.fn();

    // soaring birds above everything
    for (const b of soaring) {
      ctx.save();
      ctx.translate(this.sx(s, b.x, b.y), this.sy(s, b.x, b.y) - b.z * z);
      ctx.scale(z * b.facing, z);
      drawBird(ctx, BIRD_BY_ID[b.species].look, b, now);
      ctx.restore();
    }

    // floating effects
    for (const ef of s.effects) {
      const f = (s.simT - ef.t0) / ef.dur;
      if (f < 0 || f > 1) continue;
      const cx = this.sx(s, ef.x, ef.y);
      const cy = this.sy(s, ef.x, ef.y) - (ef.z ?? 0) * z;
      if (ef.kind === 'note') {
        ctx.font = `${Math.round(13 * z)}px serif`;
        ctx.fillStyle = `rgba(255,245,220,${(0.9 * (1 - f)).toFixed(2)})`;
        ctx.fillText('♪', cx + Math.sin(f * 6) * 4 * z, cy - f * 26 * z);
      } else if (ef.kind === 'sparkle') {
        const a = (1 - f) * 0.9;
        ctx.strokeStyle = `rgba(255,228,140,${a.toFixed(2)})`;
        ctx.lineWidth = 1.4 * z;
        const r = (3 + f * 8) * z;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx + r, cy);
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx, cy + r);
        ctx.stroke();
      } else if (ef.kind === 'poof') {
        ctx.fillStyle = `rgba(210,210,200,${(0.4 * (1 - f)).toFixed(2)})`;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(i * 1.7) * f * 14 * z, cy - 8 * z - f * 10 * z, (3 + f * 5) * z, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ef.kind === 'text' && ef.text) {
        ctx.font = `600 ${Math.round(13 * z)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(20,28,18,${(0.6 * (1 - f)).toFixed(2)})`;
        ctx.fillText(ef.text, cx + 1, cy - f * 30 * z + 1);
        ctx.fillStyle = (ef.color ?? '#ffe9a8') + Math.round((1 - f) * 255).toString(16).padStart(2, '0');
        ctx.fillText(ef.text, cx, cy - f * 30 * z);
        ctx.textAlign = 'left';
      }
    }

    // song markers (audible birds) — rings + ? for unidentified
    for (const m of s.songMarkers) {
      const cx = this.sx(s, m.x, m.y);
      const cy = this.sy(s, m.x, m.y) - 26 * z;
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      if (!m.identified) {
        ctx.fillStyle = 'rgba(30,38,28,0.78)';
        ctx.beginPath();
        ctx.arc(cx, cy, 11 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,212,110,${(0.5 + pulse * 0.5).toFixed(2)})`;
        ctx.lineWidth = 2 * z;
        ctx.beginPath();
        ctx.arc(cx, cy, (12 + pulse * 3) * z, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd46e';
        ctx.font = `700 ${Math.round(13 * z)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('?', cx, cy + 4.5 * z);
        ctx.textAlign = 'left';
      } else {
        ctx.font = `${Math.round(12 * z)}px serif`;
        ctx.fillStyle = `rgba(255,248,225,${(0.45 + pulse * 0.4).toFixed(2)})`;
        ctx.fillText('♪', cx + 6 * z, cy - 2 * z);
      }
    }

    // build placement preview
    if (s.mode === 'build' && s.buildSelection && s.buildPreview) {
      const bp = s.buildPreview;
      const cx = this.sx(s, bp.x, bp.y);
      const cy = this.sy(s, bp.x, bp.y);
      ctx.strokeStyle = bp.ok ? 'rgba(150,230,140,0.9)' : 'rgba(230,120,100,0.9)';
      ctx.lineWidth = 2 * z;
      ctx.setLineDash([5 * z, 4 * z]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, HW * 0.7 * z, HH * 0.7 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const spr = this.structSprites.get(s.buildSelection);
      if (spr) {
        ctx.globalAlpha = 0.6;
        if (s.buildSelection === 'wildflowers') {
          ctx.drawImage(spr, cx - 45 * z, cy - 60 * z * 0.45, 90 * z, 120 * z * 0.45);
        } else {
          ctx.drawImage(spr, cx - 45 * z, cy - 120 * z + 6 * z, 90 * z, 120 * z);
        }
        ctx.globalAlpha = 1;
      }
    }

    // drifting sun patches (subtle life on the ground)
    if (night < 0.5) {
      ctx.globalCompositeOperation = 'overlay';
      for (let i = 0; i < 2; i++) {
        const px = ((now * 9 + i * 700) % (this.W + 800)) - 400;
        const py = this.H * (0.25 + i * 0.4) + Math.sin(now * 0.1 + i) * 60;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 280);
        grad.addColorStop(0, `rgba(255,250,220,${(0.1 * (1 - night)).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px - 280, py - 280, 560, 560);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- lighting ----
    if (light.mult[3] > 0.005) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(${light.mult[0] | 0},${light.mult[1] | 0},${light.mult[2] | 0},${light.mult[3].toFixed(3)})`;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (light.glow[3] > 0.005) {
      ctx.globalCompositeOperation = 'screen';
      const grad = ctx.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0, `rgba(${light.glow[0] | 0},${light.glow[1] | 0},${light.glow[2] | 0},${light.glow[3].toFixed(3)})`);
      grad.addColorStop(1, `rgba(${light.glow[0] | 0},${light.glow[1] | 0},${light.glow[2] | 0},${(light.glow[3] * 0.25).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // stars
    if (night > 0.05) {
      for (const st of this.stars) {
        const tw3 = 0.55 + 0.45 * Math.sin(now * 1.3 + st.p);
        ctx.fillStyle = `rgba(235,240,255,${(night * 0.8 * tw3).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(st.x * this.W, st.y * this.H, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // moon
      const mx = this.W * 0.82;
      const my = this.H * 0.12;
      ctx.fillStyle = `rgba(240,240,225,${(night * 0.85).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(mx, my, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(190,195,190,${(night * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(mx - 6, my - 4, 5, 0, Math.PI * 2);
      ctx.arc(mx + 7, my + 6, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // fireflies
    if (night > 0.2) {
      for (const ff of this.fireflies) {
        const fx = ff.x + Math.sin(now * 0.4 * ff.s + ff.p) * 1.6;
        const fy = ff.y + Math.cos(now * 0.31 * ff.s + ff.p * 2) * 1.6;
        if (fx < minX || fx > maxX || fy < minY || fy > maxY) continue;
        const blink = Math.max(0, Math.sin(now * 1.7 * ff.s + ff.p * 3));
        if (blink < 0.3) continue;
        const cx = this.sx(s, fx, fy);
        const cy = this.sy(s, fx, fy) - (10 + Math.sin(now + ff.p) * 6) * z;
        const a = night * blink * 0.9;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7 * z);
        grad.addColorStop(0, `rgba(220,255,130,${a.toFixed(2)})`);
        grad.addColorStop(1, 'rgba(220,255,130,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - 7 * z, cy - 7 * z, 14 * z, 14 * z);
        ctx.fillStyle = `rgba(245,255,200,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.3 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // binocular overlay
    if (s.mode === 'bino') this.drawBinoculars(s, now);

    // fishing reel meters
    if (s.fishing?.phase === 'reel') {
      const f = s.fishing;
      const bw = Math.min(360, this.W * 0.7);
      const bx0 = this.W / 2 - bw / 2;
      const by0 = this.H - 96;
      ctx.fillStyle = 'rgba(18,26,18,0.82)';
      roundRect(ctx, bx0 - 16, by0 - 14, bw + 32, 78, 12);
      ctx.fill();
      // tension bar (green zone, danger at the top)
      ctx.font = '600 11px ui-sans-serif, system-ui';
      ctx.fillStyle = '#cfd8c4';
      ctx.fillText('LINE TENSION', bx0, by0 - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, bx0, by0 + 4, bw, 12, 6);
      ctx.fill();
      const tcol = f.tension > 0.78 ? '#e05a3a' : f.tension > 0.55 ? '#e0b23a' : '#7fb35a';
      ctx.fillStyle = tcol;
      roundRect(ctx, bx0, by0 + 4, Math.max(8, bw * f.tension), 12, 6);
      ctx.fill();
      // progress bar
      ctx.fillStyle = '#cfd8c4';
      ctx.fillText('REELING IN', bx0, by0 + 33);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, bx0, by0 + 38, bw, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#6aa7c4';
      roundRect(ctx, bx0, by0 + 38, Math.max(8, bw * f.progress), 12, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(235,240,225,0.75)';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(
        f.reeling ? 'easy… don’t let the line snap' : 'hold SPACE / press & hold to reel',
        this.W / 2,
        by0 + 62
      );
      ctx.textAlign = 'left';
    }

    // soft vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.42, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    vg.addColorStop(0, 'rgba(15,25,15,0)');
    vg.addColorStop(1, 'rgba(15,25,15,0.32)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private drawNest(s: GameState, x: number, y: number, discovered: boolean, stage: string, now: number, z: number) {
    const { ctx } = this;
    const cx = this.sx(s, x, y);
    const cy = this.sy(s, x, y) - 52 * z; // up in the branches
    if (!discovered) {
      // faint glint, easier to spot through binoculars
      const vis = s.mode === 'bino' ? 0.85 : 0.3;
      const pulse = 0.5 + 0.5 * Math.sin(now * 3 + x);
      ctx.fillStyle = `rgba(255,235,160,${(vis * pulse * 0.8).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.4 * z, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // woven cup
    ctx.fillStyle = '#7a5c38';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8 * z, 4.5 * z, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#93714a';
    ctx.lineWidth = 1 * z;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8 * z, 3 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (stage === 'eggs') {
      ctx.fillStyle = '#cfe3e8';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + i * 3.4 * z, cy - 1.2 * z, 1.8 * z, 2.3 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (stage === 'chicks') {
      for (let i = -1; i <= 1; i++) {
        const open = Math.sin(now * 5 + i * 2) > 0.4;
        ctx.fillStyle = '#b89a6a';
        ctx.beginPath();
        ctx.arc(cx + i * 3.6 * z, cy - 3 * z - (open ? 1.2 * z : 0), 2.2 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8a23a';
        ctx.beginPath();
        ctx.moveTo(cx + i * 3.6 * z - 1.2 * z, cy - 4 * z);
        ctx.lineTo(cx + i * 3.6 * z + 1.2 * z, cy - 4 * z);
        ctx.lineTo(cx + i * 3.6 * z, cy - (open ? 6.5 : 5.2) * z);
        ctx.fill();
      }
    }
  }

  private drawFishingGear(s: GameState, now: number) {
    const f = s.fishing!;
    const { ctx } = this;
    const z = s.cam.zoom;
    const px = this.sx(s, s.player.x, s.player.y);
    const py = this.sy(s, s.player.x, s.player.y);
    const tipX = px + s.player.facing * 24 * z;
    const tipY = py - 34 * z;
    // rod
    ctx.strokeStyle = '#6b4e30';
    ctx.lineWidth = 2 * z;
    ctx.beginPath();
    ctx.moveTo(px + s.player.facing * 4 * z, py - 14 * z);
    ctx.quadraticCurveTo(px + s.player.facing * 16 * z, py - 30 * z, tipX, tipY);
    ctx.stroke();

    const bx = this.sx(s, f.bobX, f.bobY);
    let dip = 0;
    if (f.phase === 'nibble') dip = Math.abs(Math.sin(now * 10)) * 3;
    if (f.phase === 'strike') dip = 6;
    if (f.phase === 'reel') dip = 3 + Math.sin(now * 14) * 2;
    const by = this.sy(s, f.bobX, f.bobY) + (Math.sin(now * 2.2) * 1.2 + dip) * z;

    if (f.phase !== 'cast') {
      // line
      ctx.strokeStyle = 'rgba(240,240,235,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      const sag = f.phase === 'reel' ? 2 : 14;
      ctx.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + sag * z, bx, by - 3 * z);
      ctx.stroke();
      // bobber
      ctx.fillStyle = '#e8e5da';
      ctx.beginPath();
      ctx.arc(bx, by - 2.4 * z, 2.6 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8392b';
      ctx.beginPath();
      ctx.arc(bx, by - 4 * z, 2.6 * z, Math.PI, 0);
      ctx.fill();
      if (f.phase === 'strike') {
        ctx.fillStyle = '#ffd46e';
        ctx.font = `800 ${Math.round(17 * z)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('!', bx, by - 14 * z - Math.abs(Math.sin(now * 8)) * 4 * z);
        ctx.textAlign = 'left';
      }
    }
  }

  private drawBinoculars(s: GameState, now: number) {
    const { ctx } = this;
    const bx = s.bino.x;
    const by = s.bino.y;
    const R = Math.min(this.W, this.H) * 0.3;
    // darken everything outside the lens
    ctx.fillStyle = 'rgba(12,18,12,0.84)';
    ctx.beginPath();
    ctx.rect(0, 0, this.W, this.H);
    ctx.arc(bx, by, R, 0, Math.PI * 2, true);
    ctx.fill();
    // soft inner shading
    const grad = ctx.createRadialGradient(bx, by, R * 0.72, bx, by, R);
    grad.addColorStop(0, 'rgba(12,18,12,0)');
    grad.addColorStop(1, 'rgba(12,18,12,0.55)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, Math.PI * 2);
    ctx.fill();
    // rim
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, Math.PI * 2);
    ctx.stroke();
    // crosshair
    ctx.strokeStyle = 'rgba(240,240,225,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 14, by);
    ctx.lineTo(bx + 14, by);
    ctx.moveTo(bx, by - 14);
    ctx.lineTo(bx, by + 14);
    ctx.stroke();
    // focus progress
    if (s.bino.targetUid !== null && s.bino.progress > 0) {
      ctx.strokeStyle = '#ffd46e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(bx, by, R - 12, -Math.PI / 2, -Math.PI / 2 + s.bino.progress * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,212,110,0.9)';
      ctx.font = '600 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('focusing…', bx, by + R - 28);
      ctx.textAlign = 'left';
    }
  }
}

// =================================================================================
// sprite painters
// =================================================================================

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

function shade(c: string, amt: number): string {
  let r: number, g: number, b: number;
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    r = n >> 16;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return c;
    r = +m[1];
    g = +m[2];
    b = +m[3];
  }
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function drawTileSprite(g: CanvasRenderingContext2D, tt: TileId, v: number) {
  const [c1] = TILE_BASE[tt];
  const jitter = Math.round((hash2(tt, v, 3) - 0.5) * 18);
  const base = shade(c1, jitter);
  const cx = TILE_W / 2;
  const cy = TILE_H / 2;
  // slightly inflated diamond to avoid seams
  diamond(g, cx, cy, HW + 1.5, HH + 1);
  if (tt === T.WATER || tt === T.DEEP) {
    const grad = g.createLinearGradient(0, 0, 0, TILE_H);
    grad.addColorStop(0, shade(base, 10));
    grad.addColorStop(1, shade(base, -8));
    g.fillStyle = grad;
  } else {
    g.fillStyle = base;
  }
  g.fill();
  g.save();
  diamond(g, cx, cy, HW + 1.5, HH + 1);
  g.clip();

  const r = (i: number) => hash2(tt * 31 + v, i, 9);
  if (tt === T.GRASS || tt === T.FOREST || tt === T.PINE) {
    // grass strokes
    g.strokeStyle = shade(base, 16);
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = 6 + r(i) * (TILE_W - 12);
      const y = 5 + r(i + 50) * (TILE_H - 10);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r(i + 99) - 0.5) * 2, y - 3 - r(i + 120) * 2);
      g.stroke();
    }
    g.fillStyle = shade(base, -8);
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.ellipse(8 + r(i + 200) * (TILE_W - 16), 6 + r(i + 230) * (TILE_H - 12), 3.4, 1.7, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (tt === T.MEADOW) {
    g.strokeStyle = shade(base, 20);
    g.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = 5 + r(i) * (TILE_W - 10);
      const y = 5 + r(i + 50) * (TILE_H - 10);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r(i + 99) - 0.5) * 3, y - 4 - r(i + 120) * 3);
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      if (r(i + 300) < 0.55) continue;
      g.fillStyle = FLOWER_COLORS[Math.floor(r(i + 333) * FLOWER_COLORS.length)];
      g.beginPath();
      g.arc(8 + r(i + 350) * (TILE_W - 16), 6 + r(i + 380) * (TILE_H - 12), 1.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (tt === T.SAND) {
    g.fillStyle = shade(base, -18);
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.arc(6 + r(i) * (TILE_W - 12), 5 + r(i + 40) * (TILE_H - 10), 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = shade(base, 14);
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(6 + r(i + 80) * (TILE_W - 12), 5 + r(i + 110) * (TILE_H - 10), 0.7, 0, Math.PI * 2);
      g.fill();
    }
  } else if (tt === T.MARSH) {
    // wet patches + sedge tufts + cattails
    g.fillStyle = 'rgba(58,110,125,0.38)';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(8 + r(i) * (TILE_W - 16), 7 + r(i + 30) * (TILE_H - 14), 6, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = shade(base, 26);
    g.lineWidth = 1.1;
    for (let i = 0; i < 7; i++) {
      const x = 8 + r(i + 60) * (TILE_W - 16);
      const y = 8 + r(i + 90) * (TILE_H - 14);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 1.5, y - 5, x + (r(i) - 0.5) * 4, y - 8 - r(i + 7) * 3);
      g.stroke();
    }
    if (hash2(tt, v, 91) > 0.4) {
      // a cattail
      const x = 14 + r(500) * (TILE_W - 28);
      const y = 12 + r(530) * (TILE_H - 16);
      g.strokeStyle = '#6e8a4a';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 1, y - 13);
      g.stroke();
      g.fillStyle = '#7a5230';
      g.fillRect(x - 0.6, y - 13, 2.6, 5);
    }
  } else if (tt === T.ROCK) {
    g.fillStyle = shade(base, 18);
    g.beginPath();
    g.moveTo(cx - 10, cy + 3);
    g.lineTo(cx - 2, cy - 6);
    g.lineTo(cx + 9, cy - 2);
    g.lineTo(cx + 5, cy + 5);
    g.closePath();
    g.fill();
    g.fillStyle = shade(base, -16);
    g.beginPath();
    g.moveTo(cx + 5, cy + 5);
    g.lineTo(cx + 9, cy - 2);
    g.lineTo(cx + 13, cy + 2);
    g.closePath();
    g.fill();
  } else if (tt === T.PATH) {
    g.fillStyle = shade(base, -16);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(8 + r(i) * (TILE_W - 16), 6 + r(i + 44) * (TILE_H - 12), 2 + r(i + 70) * 1.5, 1 + r(i + 90), 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (tt === T.WATER || tt === T.DEEP) {
    g.strokeStyle = 'rgba(200,230,235,0.13)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = 8 + r(i) * (TILE_H - 14);
      g.beginPath();
      g.moveTo(10 + r(i + 9) * 10, y);
      g.quadraticCurveTo(TILE_W / 2, y - 2, TILE_W - 12 - r(i + 21) * 10, y);
      g.stroke();
    }
  }
  g.restore();
}

function drawTreeSprite(g: CanvasRenderingContext2D, kind: 'oak' | 'birch' | 'pine', v: number) {
  const r = (i: number) => hash2(v * 7 + 1, i, kind === 'oak' ? 41 : kind === 'pine' ? 43 : 47);
  const baseX = 85;
  const baseY = 196;
  // shadow
  g.fillStyle = 'rgba(25,45,25,0.3)';
  g.beginPath();
  g.ellipse(baseX, baseY, kind === 'pine' ? 30 : 40, 11, 0, 0, Math.PI * 2);
  g.fill();

  if (kind === 'pine') {
    g.fillStyle = '#5d4630';
    g.fillRect(baseX - 4, baseY - 36, 8, 36);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const yTop = 26 + i * 34 + r(i) * 8;
      const yBot = yTop + 50;
      const w = 22 + i * 16 + r(i + 9) * 6;
      const dark = i % 2 ? '#3c6648' : '#41704e';
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(baseX, yTop);
      g.quadraticCurveTo(baseX - w * 0.55, yBot - 14, baseX - w, yBot);
      g.quadraticCurveTo(baseX, yBot - 8, baseX + w, yBot);
      g.quadraticCurveTo(baseX + w * 0.55, yBot - 14, baseX, yTop);
      g.fill();
      // lit left edge
      g.fillStyle = '#5e8a5f';
      g.beginPath();
      g.moveTo(baseX, yTop);
      g.quadraticCurveTo(baseX - w * 0.55, yBot - 14, baseX - w, yBot);
      g.quadraticCurveTo(baseX - w * 0.5, yBot - 18, baseX - 2, yTop + 6);
      g.fill();
    }
  } else {
    // trunk
    if (kind === 'birch') {
      g.fillStyle = '#e6e1d4';
      g.fillRect(baseX - 3.5, baseY - 78, 7, 78);
      g.fillStyle = '#43403a';
      for (let i = 0; i < 6; i++) g.fillRect(baseX - 3.5 + (i % 2) * 3, baseY - 70 + i * 11, 4, 2);
    } else {
      g.fillStyle = '#6b4a32';
      g.beginPath();
      g.moveTo(baseX - 7, baseY);
      g.quadraticCurveTo(baseX - 4, baseY - 50, baseX - 5, baseY - 80);
      g.lineTo(baseX + 5, baseY - 80);
      g.quadraticCurveTo(baseX + 4, baseY - 50, baseX + 7, baseY);
      g.fill();
      // a branch
      g.strokeStyle = '#6b4a32';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(baseX, baseY - 60);
      g.quadraticCurveTo(baseX + 18, baseY - 76, baseX + 28, baseY - 92);
      g.stroke();
    }
    // canopy blobs
    const pal =
      kind === 'birch'
        ? { dark: '#7d9c47', mid: '#94b258', light: '#b3cb74' }
        : v % 2
          ? { dark: '#4c733c', mid: '#5f8a48', light: '#84ad5e' }
          : { dark: '#527a3e', mid: '#67934c', light: '#8cb564' };
    const blobs = kind === 'birch' ? 4 : 5;
    const cy0 = kind === 'birch' ? 86 : 84;
    // dark under-layer
    for (let i = 0; i < blobs; i++) {
      const bx = baseX + (r(i + 20) - 0.5) * 64;
      const by = cy0 + (r(i + 40) - 0.5) * 44 + 8;
      const br = 24 + r(i + 60) * 16;
      g.fillStyle = pal.dark;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
    }
    // mid + highlight
    for (let i = 0; i < blobs; i++) {
      const bx = baseX + (r(i + 20) - 0.5) * 64;
      const by = cy0 + (r(i + 40) - 0.5) * 44;
      const br = 22 + r(i + 60) * 15;
      const grad = g.createRadialGradient(bx - br * 0.4, by - br * 0.5, br * 0.1, bx, by, br);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(0.6, pal.mid);
      grad.addColorStop(1, pal.dark);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, br, 0, Math.PI * 2);
      g.fill();
    }
    // leaf-cluster flecks
    g.fillStyle = pal.light;
    for (let i = 0; i < 14; i++) {
      const bx = baseX + (r(i + 200) - 0.5) * 78;
      const by = cy0 + (r(i + 240) - 0.55) * 56;
      g.beginPath();
      g.arc(bx, by, 2 + r(i + 280) * 2, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function buildCabin(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 280;
  c.height = 240;
  const g = c.getContext('2d')!;
  const cx = 140;
  const baseY = 218;
  // shadow
  g.fillStyle = 'rgba(25,45,25,0.3)';
  g.beginPath();
  g.ellipse(cx, baseY, 95, 26, 0, 0, Math.PI * 2);
  g.fill();

  const wallH = 64;
  // left face (logs)
  g.fillStyle = '#7d5c3e';
  g.beginPath();
  g.moveTo(cx - 92, baseY - 46);
  g.lineTo(cx, baseY);
  g.lineTo(cx, baseY - wallH);
  g.lineTo(cx - 92, baseY - 46 - wallH);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6a4c32';
  g.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const yy = baseY - (wallH * i) / 6;
    g.beginPath();
    g.moveTo(cx - 92, yy - 46);
    g.lineTo(cx, yy);
    g.stroke();
  }
  // right face (lighter)
  g.fillStyle = '#96714c';
  g.beginPath();
  g.moveTo(cx + 80, baseY - 40);
  g.lineTo(cx, baseY);
  g.lineTo(cx, baseY - wallH);
  g.lineTo(cx + 80, baseY - 40 - wallH);
  g.closePath();
  g.fill();
  g.strokeStyle = '#84613e';
  for (let i = 1; i < 6; i++) {
    const yy = baseY - (wallH * i) / 6;
    g.beginPath();
    g.moveTo(cx, yy);
    g.lineTo(cx + 80, yy - 40);
    g.stroke();
  }
  // window (left face)
  g.fillStyle = '#2d3a42';
  g.fillRect(cx - 64, baseY - 96, 28, 22);
  g.fillStyle = '#a8c0c8';
  g.fillRect(cx - 62, baseY - 94, 11, 8);
  g.fillRect(cx - 49, baseY - 92, 11, 8);
  g.strokeStyle = '#5a4630';
  g.lineWidth = 3;
  g.strokeRect(cx - 64, baseY - 96, 28, 22);
  // door (right face)
  g.fillStyle = '#5a4028';
  g.beginPath();
  g.moveTo(cx + 26, baseY - 14);
  g.lineTo(cx + 54, baseY - 28);
  g.lineTo(cx + 54, baseY - 70);
  g.lineTo(cx + 26, baseY - 56);
  g.closePath();
  g.fill();
  g.fillStyle = '#d8b25a';
  g.beginPath();
  g.arc(cx + 48, baseY - 46, 2.4, 0, Math.PI * 2);
  g.fill();
  // roof
  g.fillStyle = '#54402e';
  g.beginPath();
  g.moveTo(cx - 104, baseY - 44 - wallH + 6);
  g.lineTo(cx + 4, baseY - wallH + 10);
  g.lineTo(cx + 4, baseY - wallH - 38);
  g.lineTo(cx - 50, baseY - wallH - 64);
  g.closePath();
  g.fill();
  g.fillStyle = '#6a523a';
  g.beginPath();
  g.moveTo(cx + 4, baseY - wallH + 10);
  g.lineTo(cx + 92, baseY - 36 - wallH + 6);
  g.lineTo(cx + 38, baseY - wallH - 56);
  g.lineTo(cx + 4, baseY - wallH - 38);
  g.closePath();
  g.fill();
  // shingle lines
  g.strokeStyle = 'rgba(40,30,20,0.35)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(cx - 104 + i * 14, baseY - 44 - wallH + 6 - i * 16);
    g.lineTo(cx + 4, baseY - wallH + 10 - i * 12);
    g.stroke();
  }
  // chimney
  g.fillStyle = '#8a8a82';
  g.fillRect(cx + 40, baseY - wallH - 92, 18, 44);
  g.fillStyle = '#76766e';
  g.fillRect(cx + 38, baseY - wallH - 96, 22, 7);
  return c;
}

function drawStructureSprite(g: CanvasRenderingContext2D, id: string) {
  const cx = 45;
  const baseY = 112;
  const shadow = () => {
    g.fillStyle = 'rgba(25,45,25,0.25)';
    g.beginPath();
    g.ellipse(cx, baseY, 18, 6, 0, 0, Math.PI * 2);
    g.fill();
  };
  const post = (h: number) => {
    g.fillStyle = '#6b4e32';
    g.fillRect(cx - 2.5, baseY - h, 5, h);
  };
  if (id === 'wildflowers') {
    // flat patch (drawn squashed onto the ground)
    for (let i = 0; i < 26; i++) {
      const x = 10 + hash2(i, 3, 55) * 70;
      const y = 20 + hash2(i, 7, 55) * 80;
      g.strokeStyle = '#5f8a48';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y + 8);
      g.lineTo(x, y);
      g.stroke();
      g.fillStyle = FLOWER_COLORS[i % FLOWER_COLORS.length];
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2e2a0';
      g.beginPath();
      g.arc(x, y, 1.2, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  shadow();
  switch (id) {
    case 'feeder': {
      post(58);
      g.fillStyle = '#8a6844';
      g.fillRect(cx - 20, baseY - 64, 40, 7);
      g.fillStyle = '#75552f';
      g.beginPath();
      g.moveTo(cx - 24, baseY - 70);
      g.lineTo(cx, baseY - 82);
      g.lineTo(cx + 24, baseY - 70);
      g.lineTo(cx + 20, baseY - 66);
      g.lineTo(cx, baseY - 77);
      g.lineTo(cx - 20, baseY - 66);
      g.closePath();
      g.fill();
      g.fillStyle = '#3a3326';
      for (let i = 0; i < 9; i++)
        g.fillRect(cx - 16 + hash2(i, 1, 60) * 32, baseY - 62 + hash2(i, 5, 60) * 3, 2, 2);
      break;
    }
    case 'thistle': {
      post(64);
      g.strokeStyle = '#6b4e32';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, baseY - 64);
      g.quadraticCurveTo(cx + 14, baseY - 66, cx + 16, baseY - 56);
      g.stroke();
      g.fillStyle = '#e8d44e';
      g.beginPath();
      g.ellipse(cx + 16, baseY - 38, 7, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(120,100,30,0.6)';
      g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + 10, baseY - 38 + i * 5);
        g.lineTo(cx + 22, baseY - 38 + i * 5);
        g.stroke();
      }
      break;
    }
    case 'suet': {
      post(60);
      g.fillStyle = '#e6e0c8';
      g.fillRect(cx - 10, baseY - 58, 20, 18);
      g.strokeStyle = '#4a7a52';
      g.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(cx - 10 + i * 5, baseY - 58);
        g.lineTo(cx - 10 + i * 5, baseY - 40);
        g.stroke();
        g.beginPath();
        g.moveTo(cx - 10, baseY - 58 + i * 4.5);
        g.lineTo(cx + 10, baseY - 58 + i * 4.5);
        g.stroke();
      }
      break;
    }
    case 'nectar': {
      post(64);
      g.strokeStyle = '#6b4e32';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, baseY - 64);
      g.quadraticCurveTo(cx + 14, baseY - 66, cx + 16, baseY - 58);
      g.stroke();
      g.fillStyle = '#c43232';
      g.beginPath();
      g.arc(cx + 16, baseY - 44, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8e0d0';
      g.fillRect(cx + 13, baseY - 56, 6, 6);
      g.fillStyle = '#e8d44e';
      g.beginPath();
      g.arc(cx + 16, baseY - 34, 2.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'orange': {
      post(50);
      g.fillStyle = '#e8872e';
      g.beginPath();
      g.arc(cx - 8, baseY - 52, 7, 0, Math.PI * 2);
      g.arc(cx + 9, baseY - 56, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f4b864';
      g.beginPath();
      g.arc(cx - 8, baseY - 52, 4.5, 0, Math.PI * 2);
      g.arc(cx + 9, baseY - 56, 4.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'bath': {
      g.fillStyle = '#a8a298';
      g.fillRect(cx - 4, baseY - 34, 8, 32);
      g.beginPath();
      g.ellipse(cx, baseY - 36, 24, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8fb8c4';
      g.beginPath();
      g.ellipse(cx, baseY - 37, 19, 6.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(235,250,255,0.7)';
      g.beginPath();
      g.ellipse(cx, baseY - 37, 10, 3, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'berry': {
      const pal = { dark: '#4c733c', mid: '#5f8a48', light: '#84ad5e' };
      for (let i = 0; i < 4; i++) {
        const bx = cx + (hash2(i, 3, 70) - 0.5) * 30;
        const by = baseY - 18 - hash2(i, 7, 70) * 20;
        const br = 12 + hash2(i, 9, 70) * 7;
        const grad = g.createRadialGradient(bx - 4, by - 5, 2, bx, by, br);
        grad.addColorStop(0, pal.light);
        grad.addColorStop(1, pal.dark);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(bx, by, br, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#5a3a78';
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.arc(cx + (hash2(i, 13, 71) - 0.5) * 38, baseY - 16 - hash2(i, 17, 71) * 26, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'nestbox': {
      post(62);
      g.fillStyle = '#9a7850';
      g.fillRect(cx - 11, baseY - 86, 22, 26);
      g.fillStyle = '#75552f';
      g.beginPath();
      g.moveTo(cx - 14, baseY - 86);
      g.lineTo(cx, baseY - 94);
      g.lineTo(cx + 14, baseY - 86);
      g.closePath();
      g.fill();
      g.fillStyle = '#2a2018';
      g.beginPath();
      g.arc(cx, baseY - 76, 3.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}

// =================================================================================
// birds — procedural field-guide art
// =================================================================================

/** Draw a bird at origin (0,0) = feet/waterline, facing +x. Units: world px. */
export function drawBird(
  ctx: CanvasRenderingContext2D,
  look: BirdLook,
  e: Pick<BirdEntity, 'state' | 'wingPhase' | 'onWater' | 'pecking'> & { z?: number },
  now: number
) {
  const L = look.size * 12;
  const flying = e.state === 'fly' || e.state === 'flee';
  ctx.lineJoin = 'round';

  if (look.shape === 'raptor' && (flying || e.state === 'soar')) {
    drawRaptorSoar(ctx, look, L, now);
    return;
  }
  if (flying && look.shape !== 'hummingbird') {
    drawGenericFly(ctx, look, L, e.wingPhase);
    return;
  }
  switch (look.shape) {
    case 'duck':
    case 'loon':
      drawSwimmer(ctx, look, L, now);
      return;
    case 'heron':
      drawHeron(ctx, look, L, now, e.pecking ?? 0);
      return;
    case 'owl':
      drawOwl(ctx, look, L);
      return;
    case 'woodpecker':
      drawWoodpecker(ctx, look, L, now, e.pecking ?? 0);
      return;
    case 'hummingbird':
      drawHummingbird(ctx, look, L, now);
      return;
    default:
      drawSongbird(ctx, look, L, e.state, now);
  }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0, fill?: string) {
  if (fill) ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function drawSongbird(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, state: string, now: number) {
  const singing = state === 'sing';
  const feeding = state === 'feed';
  const headDip = feeding ? Math.max(0, Math.sin(now * 6)) * L * 0.25 : 0;
  // legs
  ctx.strokeStyle = '#5a5248';
  ctx.lineWidth = Math.max(0.8, L * 0.05);
  ctx.beginPath();
  ctx.moveTo(-L * 0.06, -L * 0.3);
  ctx.lineTo(-L * 0.1, 0);
  ctx.moveTo(L * 0.12, -L * 0.3);
  ctx.lineTo(L * 0.12, 0);
  ctx.stroke();
  // tail
  const tl = L * 0.62 * lk.tailLen;
  ctx.fillStyle = lk.tail ?? lk.wing;
  ctx.beginPath();
  ctx.moveTo(-L * 0.34, -L * 0.62);
  ctx.lineTo(-L * 0.34 - tl, -L * 0.5 - tl * 0.18);
  ctx.lineTo(-L * 0.34 - tl * 0.92, -L * 0.38);
  ctx.lineTo(-L * 0.26, -L * 0.46);
  ctx.closePath();
  ctx.fill();
  // body
  ellipse(ctx, 0, -L * 0.5, L * 0.5, L * 0.33, -0.22, lk.body);
  // breast (front-lower)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.5, L * 0.5, L * 0.33, -0.22, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, L * 0.22, -L * 0.34, L * 0.34, L * 0.3, 0, lk.breast);
  ctx.restore();
  // wing
  ellipse(ctx, -L * 0.08, -L * 0.52, L * 0.34, L * 0.2, -0.45, lk.wing);
  if (lk.wingbar) {
    ctx.strokeStyle = lk.wingbar;
    ctx.lineWidth = L * 0.05;
    ctx.beginPath();
    ctx.moveTo(-L * 0.3, -L * 0.55);
    ctx.quadraticCurveTo(-L * 0.05, -L * 0.62, L * 0.12, -L * 0.55);
    ctx.stroke();
  }
  if (lk.epaulet) {
    ellipse(ctx, L * 0.08, -L * 0.66, L * 0.11, L * 0.07, -0.4, lk.epaulet);
  }
  // head
  const hx = L * 0.38;
  const hy = -L * 0.8 + headDip + (singing ? -L * 0.04 : 0);
  ellipse(ctx, hx, hy, L * 0.25, L * 0.24, 0, lk.head);
  if (lk.cap) {
    ctx.fillStyle = lk.cap;
    ctx.beginPath();
    ctx.arc(hx, hy, L * 0.25, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(hx + L * 0.25, hy - L * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  if (lk.crest) {
    ctx.fillStyle = lk.cap ?? lk.head;
    ctx.beginPath();
    ctx.moveTo(hx - L * 0.08, hy - L * 0.2);
    ctx.quadraticCurveTo(hx - L * 0.02, hy - L * 0.5, hx + L * 0.16, hy - L * 0.26);
    ctx.closePath();
    ctx.fill();
  }
  if (lk.cheek) ellipse(ctx, hx + L * 0.07, hy + L * 0.04, L * 0.13, L * 0.11, 0, lk.cheek);
  if (lk.mask) {
    ctx.fillStyle = lk.mask;
    ctx.beginPath();
    ctx.moveTo(hx + L * 0.24, hy - L * 0.08);
    ctx.quadraticCurveTo(hx + L * 0.05, hy - L * 0.14, hx - L * 0.05, hy);
    ctx.quadraticCurveTo(hx + L * 0.08, hy + L * 0.1, hx + L * 0.24, hy + L * 0.04);
    ctx.closePath();
    ctx.fill();
  }
  if (lk.throat) ellipse(ctx, hx + L * 0.12, hy + L * 0.17, L * 0.11, L * 0.08, 0.2, lk.throat);
  if (lk.eyeLine) {
    ctx.strokeStyle = lk.eyeLine;
    ctx.lineWidth = L * 0.045;
    ctx.beginPath();
    ctx.moveTo(hx - L * 0.18, hy - L * 0.05);
    ctx.lineTo(hx + L * 0.18, hy - L * 0.05);
    ctx.stroke();
  }
  // beak
  const bl = L * 0.24 * lk.beakLen;
  ctx.fillStyle = lk.beak;
  if (singing) {
    ctx.beginPath();
    ctx.moveTo(hx + L * 0.2, hy - L * 0.03);
    ctx.lineTo(hx + L * 0.2 + bl, hy - L * 0.14);
    ctx.lineTo(hx + L * 0.22, hy + L * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + L * 0.2, hy + L * 0.05);
    ctx.lineTo(hx + L * 0.2 + bl * 0.85, hy + L * 0.16);
    ctx.lineTo(hx + L * 0.22, hy + L * 0.02);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(hx + L * 0.2, hy - L * 0.07);
    ctx.lineTo(hx + L * 0.2 + bl, hy + L * 0.01);
    ctx.lineTo(hx + L * 0.2, hy + L * 0.07);
    ctx.closePath();
    ctx.fill();
  }
  // eye
  ctx.fillStyle = '#16130f';
  ctx.beginPath();
  ctx.arc(hx + L * 0.08, hy - L * 0.05, L * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(hx + L * 0.095, hy - L * 0.065, L * 0.015, 0, Math.PI * 2);
  ctx.fill();
}

function drawGenericFly(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, wingPhase: number) {
  const flap = Math.sin(wingPhase);
  // tail fan
  ctx.fillStyle = lk.tail ?? lk.wing;
  ctx.beginPath();
  ctx.moveTo(-L * 0.4, -L * 0.42);
  ctx.lineTo(-L * 0.4 - L * 0.5 * lk.tailLen, -L * 0.52);
  ctx.lineTo(-L * 0.4 - L * 0.5 * lk.tailLen, -L * 0.3);
  ctx.closePath();
  ctx.fill();
  // body
  ellipse(ctx, 0, -L * 0.42, L * 0.52, L * 0.24, 0, lk.body);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.42, L * 0.52, L * 0.24, 0, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, L * 0.1, -L * 0.3, L * 0.4, L * 0.18, 0, lk.breast);
  ctx.restore();
  // far wing
  ctx.fillStyle = shadeColor(lk.wing, -25);
  wingShape(ctx, L * 0.05, -L * 0.5, L * 0.75, -flap * 0.9 - 0.25, L);
  // head
  const hx = L * 0.46;
  const hy = -L * 0.52;
  ellipse(ctx, hx, hy, L * 0.2, L * 0.19, 0, lk.head);
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(hx + L * 0.16, hy - L * 0.05);
  ctx.lineTo(hx + L * 0.16 + L * 0.2 * lk.beakLen, hy + L * 0.01);
  ctx.lineTo(hx + L * 0.16, hy + L * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#16130f';
  ctx.beginPath();
  ctx.arc(hx + L * 0.06, hy - L * 0.04, L * 0.04, 0, Math.PI * 2);
  ctx.fill();
  // near wing
  ctx.fillStyle = lk.wing;
  wingShape(ctx, 0, -L * 0.46, L * 0.85, flap * 0.95, L);
}

function wingShape(ctx: CanvasRenderingContext2D, x: number, y: number, span: number, angle: number, L: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(span * 0.4, -L * 0.16, span, -L * 0.1);
  ctx.quadraticCurveTo(span * 0.55, L * 0.12, 0, L * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSwimmer(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, now: number) {
  const bob = Math.sin(now * 1.6) * L * 0.03;
  ctx.save();
  ctx.translate(0, bob);
  // wake
  ctx.strokeStyle = 'rgba(220,240,245,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-L * 0.6, 1);
  ctx.quadraticCurveTo(-L * 0.95, 2.5, -L * 1.25, 1.5);
  ctx.stroke();
  // body (boat hull, bottom flattens at waterline)
  ctx.fillStyle = lk.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.58, -L * 0.1);
  ctx.quadraticCurveTo(-L * 0.4, -L * 0.46, 0, -L * 0.44);
  ctx.quadraticCurveTo(L * 0.4, -L * 0.42, L * 0.5, -L * 0.12);
  ctx.quadraticCurveTo(L * 0.1, L * 0.02, -L * 0.58, -L * 0.1);
  ctx.closePath();
  ctx.fill();
  // breast / side
  ctx.fillStyle = lk.breast;
  ctx.beginPath();
  ctx.ellipse(L * 0.18, -L * 0.18, L * 0.26, L * 0.13, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // loon speckles
  if (lk.shape === 'loon' && lk.wingbar) {
    ctx.fillStyle = lk.wingbar;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(-L * 0.45 + hash2(i, 3, 99) * L * 0.5, -L * 0.32 + hash2(i, 7, 99) * L * 0.16, L * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // tail nub
  ctx.fillStyle = lk.wing;
  ctx.beginPath();
  ctx.moveTo(-L * 0.55, -L * 0.16);
  ctx.lineTo(-L * 0.75, -L * 0.26);
  ctx.lineTo(-L * 0.5, -L * 0.3);
  ctx.closePath();
  ctx.fill();
  // neck + head
  const ny = lk.shape === 'loon' ? -L * 0.62 : -L * 0.72;
  ctx.fillStyle = lk.head;
  ctx.beginPath();
  ctx.moveTo(L * 0.26, -L * 0.34);
  ctx.quadraticCurveTo(L * 0.3, ny + L * 0.1, L * 0.36, ny);
  ctx.lineTo(L * 0.5, ny);
  ctx.quadraticCurveTo(L * 0.48, -L * 0.3, L * 0.42, -L * 0.26);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, L * 0.43, ny, L * 0.16, L * 0.15, 0, lk.head);
  // loon necklace
  if (lk.throat) {
    ctx.strokeStyle = lk.shape === 'loon' ? '#e9e5d8' : lk.throat;
    ctx.lineWidth = L * 0.04;
    ctx.beginPath();
    ctx.moveTo(L * 0.3, ny + L * 0.22);
    ctx.quadraticCurveTo(L * 0.4, ny + L * 0.3, L * 0.5, ny + L * 0.22);
    ctx.stroke();
  }
  if (lk.eyeLine) {
    ctx.strokeStyle = lk.eyeLine;
    ctx.lineWidth = L * 0.045;
    ctx.beginPath();
    ctx.moveTo(L * 0.32, ny - L * 0.06);
    ctx.lineTo(L * 0.52, ny - L * 0.06);
    ctx.stroke();
  }
  if (lk.crest) {
    ctx.fillStyle = lk.head;
    ctx.beginPath();
    ctx.moveTo(L * 0.34, ny - L * 0.1);
    ctx.quadraticCurveTo(L * 0.18, ny - L * 0.02, L * 0.2, ny + L * 0.14);
    ctx.quadraticCurveTo(L * 0.32, ny + L * 0.06, L * 0.38, ny + L * 0.02);
    ctx.closePath();
    ctx.fill();
  }
  // bill
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(L * 0.56, ny - L * 0.05);
  ctx.lineTo(L * 0.56 + L * 0.2 * lk.beakLen, ny + L * 0.0);
  ctx.lineTo(L * 0.56, ny + L * 0.06);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = lk.shape === 'loon' ? '#a82222' : '#16130f';
  ctx.beginPath();
  ctx.arc(L * 0.46, ny - L * 0.03, L * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeron(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, now: number, pecking: number) {
  const hunt = pecking > 0 ? Math.max(0, Math.sin(now * 2.2)) : 0;
  // legs
  ctx.strokeStyle = '#4a4438';
  ctx.lineWidth = L * 0.045;
  ctx.beginPath();
  ctx.moveTo(-L * 0.05, -L * 0.52);
  ctx.lineTo(-L * 0.08, 0);
  ctx.moveTo(L * 0.1, -L * 0.52);
  ctx.lineTo(L * 0.16, -L * 0.26);
  ctx.lineTo(L * 0.13, 0);
  ctx.stroke();
  // body
  ellipse(ctx, 0, -L * 0.62, L * 0.38, L * 0.2, -0.12, lk.body);
  ellipse(ctx, -L * 0.05, -L * 0.58, L * 0.24, L * 0.13, -0.2, lk.wing);
  // tail
  ctx.fillStyle = lk.wing;
  ctx.beginPath();
  ctx.moveTo(-L * 0.32, -L * 0.62);
  ctx.lineTo(-L * 0.5, -L * 0.5);
  ctx.lineTo(-L * 0.3, -L * 0.52);
  ctx.closePath();
  ctx.fill();
  // S neck
  const hx = L * 0.34 + hunt * L * 0.16;
  const hy = -L * 1.06 + hunt * L * 0.3;
  ctx.strokeStyle = lk.breast;
  ctx.lineWidth = L * 0.11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L * 0.18, -L * 0.66);
  ctx.bezierCurveTo(L * 0.42, -L * 0.72, L * 0.1, -L * 0.95, hx, hy);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // head
  ellipse(ctx, hx, hy, L * 0.13, L * 0.11, 0, lk.head);
  // black plume
  ctx.strokeStyle = lk.eyeLine ?? '#23272b';
  ctx.lineWidth = L * 0.045;
  ctx.beginPath();
  ctx.moveTo(hx - L * 0.02, hy - L * 0.08);
  ctx.quadraticCurveTo(hx - L * 0.2, hy - L * 0.1, hx - L * 0.26, hy - L * 0.02);
  ctx.stroke();
  // dagger bill
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(hx + L * 0.1, hy - L * 0.045);
  ctx.lineTo(hx + L * 0.1 + L * 0.2 * lk.beakLen, hy + L * 0.04 + hunt * L * 0.1);
  ctx.lineTo(hx + L * 0.1, hy + L * 0.045);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8c43a';
  ctx.beginPath();
  ctx.arc(hx + L * 0.045, hy - L * 0.02, L * 0.028, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16130f';
  ctx.beginPath();
  ctx.arc(hx + L * 0.05, hy - L * 0.02, L * 0.015, 0, Math.PI * 2);
  ctx.fill();
}

function drawOwl(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number) {
  // feet
  ctx.strokeStyle = '#6a6152';
  ctx.lineWidth = L * 0.05;
  ctx.beginPath();
  ctx.moveTo(-L * 0.08, -L * 0.04);
  ctx.lineTo(-L * 0.08, 0);
  ctx.moveTo(L * 0.08, -L * 0.04);
  ctx.lineTo(L * 0.08, 0);
  ctx.stroke();
  // body (upright egg)
  ellipse(ctx, 0, -L * 0.42, L * 0.32, L * 0.42, 0, lk.body);
  ellipse(ctx, 0, -L * 0.32, L * 0.24, L * 0.3, 0, lk.breast);
  // breast barring
  ctx.strokeStyle = shadeColor(lk.body, -30);
  ctx.lineWidth = L * 0.025;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.16, -L * 0.46 + i * L * 0.09);
    ctx.quadraticCurveTo(0, -L * 0.42 + i * L * 0.09, L * 0.16, -L * 0.46 + i * L * 0.09);
    ctx.stroke();
  }
  // wing edge
  ellipse(ctx, -L * 0.18, -L * 0.42, L * 0.13, L * 0.3, 0.1, lk.wing);
  // head
  ellipse(ctx, 0, -L * 0.86, L * 0.28, L * 0.24, 0, lk.head);
  // facial disks
  ellipse(ctx, -L * 0.09, -L * 0.86, L * 0.11, L * 0.12, 0, lk.breast);
  ellipse(ctx, L * 0.11, -L * 0.86, L * 0.11, L * 0.12, 0, lk.breast);
  // dark soulful eyes
  ctx.fillStyle = '#1c150f';
  ctx.beginPath();
  ctx.arc(-L * 0.08, -L * 0.86, L * 0.05, 0, Math.PI * 2);
  ctx.arc(L * 0.12, -L * 0.86, L * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(-L * 0.065, -L * 0.875, L * 0.015, 0, Math.PI * 2);
  ctx.arc(L * 0.135, -L * 0.875, L * 0.015, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(0, -L * 0.84);
  ctx.lineTo(L * 0.045, -L * 0.78);
  ctx.lineTo(-L * 0.01, -L * 0.76);
  ctx.closePath();
  ctx.fill();
}

function drawWoodpecker(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, now: number, pecking: number) {
  // clinging upright to a trunk: body angled steeply up
  const peck = pecking > 0 ? Math.max(0, Math.sin(now * 18)) * L * 0.07 : 0;
  ctx.save();
  ctx.rotate(-0.55);
  // tail brace
  ctx.fillStyle = lk.wing;
  ctx.beginPath();
  ctx.moveTo(-L * 0.32, -L * 0.4);
  ctx.lineTo(-L * 0.75 * lk.tailLen - L * 0.3, -L * 0.18);
  ctx.lineTo(-L * 0.3, -L * 0.28);
  ctx.closePath();
  ctx.fill();
  // body
  ellipse(ctx, 0, -L * 0.46, L * 0.46, L * 0.27, -0.1, lk.body);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.46, L * 0.46, L * 0.27, -0.1, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, L * 0.12, -L * 0.32, L * 0.34, L * 0.2, 0, lk.breast);
  ctx.restore();
  // wing with bars
  ellipse(ctx, -L * 0.1, -L * 0.5, L * 0.3, L * 0.17, -0.3, lk.wing);
  if (lk.wingbar) {
    ctx.strokeStyle = lk.wingbar;
    ctx.lineWidth = L * 0.035;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-L * 0.3 + i * L * 0.1, -L * 0.6);
      ctx.lineTo(-L * 0.24 + i * L * 0.1, -L * 0.38);
      ctx.stroke();
    }
  }
  // head
  const hx = L * 0.4 + peck;
  const hy = -L * 0.72;
  ellipse(ctx, hx, hy, L * 0.22, L * 0.2, 0, lk.head);
  if (lk.cheek) ellipse(ctx, hx + L * 0.04, hy + L * 0.05, L * 0.12, L * 0.09, 0, lk.cheek);
  if (lk.cap) {
    ctx.fillStyle = lk.cap;
    ctx.beginPath();
    ctx.arc(hx, hy - L * 0.02, L * 0.21, Math.PI * 1.1, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
  }
  if (lk.crest) {
    ctx.fillStyle = lk.cap ?? lk.head;
    ctx.beginPath();
    ctx.moveTo(hx - L * 0.06, hy - L * 0.16);
    ctx.quadraticCurveTo(hx + L * 0.04, hy - L * 0.44, hx + L * 0.2, hy - L * 0.18);
    ctx.closePath();
    ctx.fill();
  }
  // chisel beak
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(hx + L * 0.17, hy - L * 0.05);
  ctx.lineTo(hx + L * 0.17 + L * 0.22 * lk.beakLen, hy + L * 0.0);
  ctx.lineTo(hx + L * 0.17, hy + L * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#16130f';
  ctx.beginPath();
  ctx.arc(hx + L * 0.06, hy - L * 0.05, L * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHummingbird(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, now: number) {
  const W = L * 2.2; // hummers are tiny; scale up a touch for visibility
  // blurred wings (three ghosts)
  for (let i = 0; i < 3; i++) {
    const a = Math.sin(now * 60 + i * 2.1) * 0.9;
    ctx.fillStyle = `rgba(120,130,135,0.25)`;
    ctx.save();
    ctx.translate(0, -W * 0.5);
    ctx.rotate(-0.5 - a * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, -W * 0.18, W * 0.1, W * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // body angled up
  ctx.save();
  ctx.rotate(-0.5);
  ellipse(ctx, 0, -W * 0.42, W * 0.3, W * 0.16, 0, lk.body);
  ellipse(ctx, W * 0.08, -W * 0.36, W * 0.2, W * 0.11, 0, lk.breast);
  // tail
  ctx.fillStyle = lk.wing;
  ctx.beginPath();
  ctx.moveTo(-W * 0.24, -W * 0.4);
  ctx.lineTo(-W * 0.52, -W * 0.32);
  ctx.lineTo(-W * 0.26, -W * 0.3);
  ctx.closePath();
  ctx.fill();
  // head
  const hx = W * 0.28;
  const hy = -W * 0.56;
  ellipse(ctx, hx, hy, W * 0.13, W * 0.12, 0, lk.head);
  if (lk.throat) ellipse(ctx, hx + W * 0.05, hy + W * 0.09, W * 0.08, W * 0.05, 0.2, lk.throat);
  // needle bill
  ctx.strokeStyle = lk.beak;
  ctx.lineWidth = W * 0.03;
  ctx.beginPath();
  ctx.moveTo(hx + W * 0.11, hy - W * 0.01);
  ctx.lineTo(hx + W * 0.11 + W * 0.14 * lk.beakLen, hy - W * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#16130f';
  ctx.beginPath();
  ctx.arc(hx + W * 0.04, hy - W * 0.03, W * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRaptorSoar(ctx: CanvasRenderingContext2D, lk: BirdLook, L: number, now: number) {
  const rock = Math.sin(now * 0.9) * 0.06;
  ctx.save();
  ctx.rotate(rock);
  const span = L * 1.25;
  // wings (broad planks with splayed primaries)
  for (const side of [-1, 1]) {
    ctx.fillStyle = side === -1 ? shadeColor(lk.wing, -14) : lk.wing;
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.1 * side);
    ctx.quadraticCurveTo(span * 0.5 * side, -L * 0.34, span * side, -L * 0.18);
    // primary notches
    for (let i = 0; i < 3; i++) {
      ctx.lineTo(span * side - i * L * 0.09 * side, -L * 0.04 + i * L * 0.045);
    }
    ctx.quadraticCurveTo(span * 0.4 * side, L * 0.12, 0, L * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  // tail fan
  ctx.fillStyle = lk.tail ?? lk.body;
  ctx.beginPath();
  ctx.moveTo(-L * 0.1, 0);
  ctx.lineTo(-L * 0.52, -L * 0.16);
  ctx.quadraticCurveTo(-L * 0.6, 0.02, -L * 0.52, L * 0.18);
  ctx.closePath();
  ctx.fill();
  // body + head
  ellipse(ctx, 0, 0, L * 0.34, L * 0.15, 0, lk.body);
  ellipse(ctx, L * 0.32, 0, L * 0.12, L * 0.1, 0, lk.head);
  ctx.fillStyle = lk.beak;
  ctx.beginPath();
  ctx.moveTo(L * 0.43, -L * 0.03);
  ctx.lineTo(L * 0.52, L * 0.01);
  ctx.lineTo(L * 0.43, L * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function shadeColor(hex: string, amt: number): string {
  if (!hex.startsWith('#')) return hex;
  return shade(hex, amt);
}

// ---- player -------------------------------------------------------------------

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, now: number) {
  const p = s.player;
  const walk = p.moving ? Math.sin(p.walkPhase) : 0;
  const bob = p.moving ? Math.abs(Math.sin(p.walkPhase)) * 1.2 : Math.sin(now * 1.8) * 0.5;
  ctx.save();
  ctx.translate(0, -bob);
  // legs
  ctx.strokeStyle = '#4f5a48';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-1, -10);
  ctx.lineTo(-1 + walk * 3.4, -1);
  ctx.moveTo(2, -10);
  ctx.lineTo(2 - walk * 3.4, -1);
  ctx.stroke();
  // boots
  ctx.fillStyle = '#3a342c';
  ctx.beginPath();
  ctx.ellipse(-1 + walk * 3.4 + 1, -0.6, 2.4, 1.3, 0, 0, Math.PI * 2);
  ctx.ellipse(2 - walk * 3.4 + 1, -0.6, 2.4, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // torso (warm field jacket)
  ctx.fillStyle = '#bf6336';
  ctx.beginPath();
  ctx.moveTo(-4.5, -10);
  ctx.quadraticCurveTo(-5.2, -19, -2.5, -20);
  ctx.lineTo(3.5, -20);
  ctx.quadraticCurveTo(5.6, -19, 5, -10);
  ctx.closePath();
  ctx.fill();
  // arm
  ctx.strokeStyle = '#a85428';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(3, -18);
  ctx.quadraticCurveTo(5.5, -14 + walk * 1.5, 4.5, -11);
  ctx.stroke();
  // binocular strap + binos
  ctx.strokeStyle = '#3a3026';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2.5, -19.5);
  ctx.lineTo(2, -14);
  ctx.stroke();
  ctx.fillStyle = '#2c2620';
  ctx.fillRect(0.6, -14.6, 3.4, 2.4);
  // head
  ctx.fillStyle = '#e2bc92';
  ctx.beginPath();
  ctx.arc(0.5, -23.5, 3.4, 0, Math.PI * 2);
  ctx.fill();
  // hat
  ctx.fillStyle = '#6e6c42';
  ctx.beginPath();
  ctx.arc(0.5, -25.2, 3.6, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.5, -25.2, 5.6, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// =================================================================================
// card art for the journal UI (drawn into small canvases by React)
// =================================================================================

export function paintBirdCard(cv: HTMLCanvasElement, speciesId: string, silhouette = false) {
  const sp = BIRD_BY_ID[speciesId];
  if (!sp) return;
  const g = cv.getContext('2d')!;
  const w = cv.width;
  const h = cv.height;
  g.clearRect(0, 0, w, h);
  const L = sp.look.size * 12;
  const need = Math.max(L * 2.6, L * 1.6 + 14);
  const scale = Math.min(w / need, h / need) * (sp.look.shape === 'hummingbird' ? 0.55 : 1);
  g.save();
  g.translate(w / 2 - L * scale * 0.15, h * 0.86);
  g.scale(scale, scale);
  if (silhouette) g.filter = 'brightness(0%)';
  // a twig to stand on
  if (!silhouette && sp.look.shape !== 'duck' && sp.look.shape !== 'loon' && sp.look.shape !== 'heron') {
    g.strokeStyle = '#7a5c3a';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-L * 1.1, 1.5);
    g.quadraticCurveTo(0, 0.5, L * 1.1, 2.5);
    g.stroke();
  }
  if (!silhouette && (sp.look.shape === 'duck' || sp.look.shape === 'loon')) {
    g.strokeStyle = 'rgba(110,160,175,0.8)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-L * 1.2, 1);
    g.quadraticCurveTo(0, 3, L * 1.2, 1);
    g.stroke();
  }
  drawBird(g, sp.look, { state: 'idle', wingPhase: 0, onWater: false, pecking: 0 }, 0.3);
  g.restore();
  if (silhouette) {
    // flatten to ink silhouette
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#3a3a33';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}

export function paintFishCard(cv: HTMLCanvasElement, fishId: string, silhouette = false) {
  const f = FISH_BY_ID[fishId];
  if (!f) return;
  const g = cv.getContext('2d')!;
  const w = cv.width;
  const h = cv.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  const scale = (w * 0.8) / 100;
  g.scale(scale, scale);
  drawFish(g, f.look, 100);
  g.restore();
  if (silhouette) {
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#3a3a33';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}

export function drawFish(g: CanvasRenderingContext2D, lk: FishLook, len: number) {
  // len: drawing length in px, fish centered at origin, facing +x
  const Lh = len / 2;
  const deep = lk.form === 'panfish' ? 0.42 : lk.form === 'bass' ? 0.3 : lk.form === 'pike' ? 0.18 : 0.26;
  const D = len * deep;
  // tail
  g.fillStyle = lk.fins;
  g.beginPath();
  g.moveTo(-Lh * 0.82, 0);
  g.lineTo(-Lh * 1.05, -D * 0.7);
  g.quadraticCurveTo(-Lh * 0.92, 0, -Lh * 1.05, D * 0.7);
  g.closePath();
  g.fill();
  // dorsal fin
  g.beginPath();
  if (lk.form === 'panfish' || lk.form === 'bass') {
    g.moveTo(-Lh * 0.55, -D * 0.78);
    for (let i = 0; i < 6; i++) g.lineTo(-Lh * 0.55 + i * Lh * 0.16, -D * 1.08 + Math.abs(i - 2) * 2);
    g.lineTo(Lh * 0.32, -D * 0.6);
  } else {
    g.moveTo(-Lh * 0.45, -D * 0.8);
    g.quadraticCurveTo(-Lh * 0.2, -D * 1.35, Lh * 0.05, -D * 0.75);
  }
  g.closePath();
  g.fill();
  // body
  const grad = g.createLinearGradient(0, -D, 0, D);
  grad.addColorStop(0, lk.body);
  grad.addColorStop(0.62, lk.body);
  grad.addColorStop(0.78, lk.belly);
  grad.addColorStop(1, lk.belly);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(Lh, 0);
  g.quadraticCurveTo(Lh * 0.6, -D, -Lh * 0.2, -D * 0.92);
  g.quadraticCurveTo(-Lh * 0.75, -D * 0.55, -Lh * 0.85, 0);
  g.quadraticCurveTo(-Lh * 0.75, D * 0.55, -Lh * 0.2, D * 0.92);
  g.quadraticCurveTo(Lh * 0.6, D, Lh, 0);
  g.closePath();
  g.fill();
  // patterns
  g.save();
  g.clip();
  if (lk.pattern === 'bars') {
    g.fillStyle = lk.patternColor;
    g.globalAlpha = 0.65;
    for (let i = 0; i < 6; i++) {
      const x = -Lh * 0.6 + i * Lh * 0.26;
      g.beginPath();
      g.moveTo(x, -D);
      g.quadraticCurveTo(x + 6, 0, x, D * 0.6);
      g.lineTo(x + Lh * 0.09, D * 0.6);
      g.quadraticCurveTo(x + Lh * 0.09 + 6, 0, x + Lh * 0.09, -D);
      g.closePath();
      g.fill();
    }
  } else if (lk.pattern === 'stripes') {
    g.fillStyle = lk.patternColor;
    g.globalAlpha = 0.8;
    g.beginPath();
    g.moveTo(-Lh * 0.85, 0);
    for (let i = 0; i <= 8; i++) {
      const x = -Lh * 0.85 + (i / 8) * Lh * 1.8;
      g.lineTo(x, (i % 2 ? -1 : 1) * D * 0.08 - D * 0.02);
    }
    for (let i = 8; i >= 0; i--) {
      const x = -Lh * 0.85 + (i / 8) * Lh * 1.8;
      g.lineTo(x, (i % 2 ? -1 : 1) * D * 0.08 + D * 0.14);
    }
    g.closePath();
    g.fill();
  } else if (lk.pattern === 'spots') {
    g.fillStyle = lk.patternColor;
    g.globalAlpha = 0.75;
    for (let i = 0; i < 22; i++) {
      g.beginPath();
      g.arc((hash2(i, 3, 80) - 0.5) * Lh * 1.6, (hash2(i, 7, 80) - 0.6) * D * 1.4, len * 0.012 + hash2(i, 9, 80) * len * 0.008, 0, Math.PI * 2);
      g.fill();
    }
  } else if (lk.pattern === 'speckles') {
    g.fillStyle = lk.patternColor;
    g.globalAlpha = 0.85;
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      g.arc((hash2(i, 13, 81) - 0.5) * Lh * 1.6, (hash2(i, 17, 81) - 0.65) * D * 1.3, len * 0.008 + hash2(i, 19, 81) * len * 0.006, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  g.globalAlpha = 1;
  // pectoral fin
  g.fillStyle = lk.fins;
  g.beginPath();
  g.moveTo(Lh * 0.3, D * 0.15);
  g.quadraticCurveTo(Lh * 0.1, D * 0.55, Lh * 0.34, D * 0.5);
  g.closePath();
  g.fill();
  // whiskers for catfish
  if (lk.form === 'cat') {
    g.strokeStyle = lk.body;
    g.lineWidth = len * 0.012;
    g.beginPath();
    g.moveTo(Lh * 0.88, D * 0.1);
    g.quadraticCurveTo(Lh * 1.15, D * 0.3, Lh * 1.2, D * 0.55);
    g.moveTo(Lh * 0.92, -D * 0.05);
    g.quadraticCurveTo(Lh * 1.2, -D * 0.1, Lh * 1.3, D * 0.05);
    g.stroke();
  }
  // eye & mouth
  g.fillStyle = '#f2efe2';
  g.beginPath();
  g.arc(Lh * 0.68, -D * 0.25, len * 0.032, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#16130f';
  g.beginPath();
  g.arc(Lh * 0.7, -D * 0.25, len * 0.018, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(20,15,10,0.55)';
  g.lineWidth = len * 0.012;
  g.beginPath();
  g.moveTo(Lh * 0.98, D * 0.02);
  g.quadraticCurveTo(Lh * 0.84, D * (lk.form === 'bass' ? 0.3 : 0.14), Lh * 0.7, D * (lk.form === 'bass' ? 0.32 : 0.16));
  g.stroke();
}
