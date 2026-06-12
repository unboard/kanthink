// Paws & Found — renderer.
// Top-down 3/4 storybook style: soft pastel ground with scalloped edges,
// fluffy trees, a cozy rescue cottage, chibi rescuers, and procedurally
// patterned animals. Close locked camera with a sight-radius reveal.

import { TILE, G, getMap, h2, type RegionMap, type Prop, type GroundId } from './world';
import { SPECIES_BY_ID } from './data';
import type {
  AnimalCharacter,
  Effect,
  EvidenceNode,
  Place,
  Player,
  Resident,
  WildAnimalEntity,
} from './types';

// ---- ground palette ----------------------------------------------------------------

const GROUND_BASE: Record<number, string> = {
  [G.GRASS]: '#8fc46e',
  [G.MEADOW]: '#a3d07d',
  [G.PATH]: '#e3c894',
  [G.WATER]: '#6db4d8',
  [G.DEEP]: '#4d96c0',
  [G.SAND]: '#ecd9a8',
  [G.MUD]: '#a98a64',
  [G.ROCK]: '#b6b2a8',
  [G.CLIFF]: '#8d887c',
  [G.BOARD]: '#c89f68',
  [G.DIRT]: '#b58a5e',
  [G.TALLGRASS]: '#7ab35c',
};

// higher overlaps lower with scalloped edges
const PRIORITY: Record<number, number> = {
  [G.CLIFF]: 7,
  [G.GRASS]: 5,
  [G.MEADOW]: 5,
  [G.TALLGRASS]: 5,
  [G.DIRT]: 4,
  [G.MUD]: 3.5,
  [G.SAND]: 3,
  [G.PATH]: 2.5,
  [G.ROCK]: 2.2,
  [G.BOARD]: 2,
  [G.WATER]: 1.5,
  [G.DEEP]: 1,
};

const FLOWER_PETALS = ['#f2a7c3', '#f6e27a', '#b9a7e8', '#f2f0e4'];

function tint(c: string, amt: number): string {
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

// ---- the view contract (game.ts fills this each frame) -------------------------------

export interface NpcView {
  x: number;
  y: number;
  kind: 'owner' | 'ranger';
  hasBubble: boolean;
}

export interface CritterView {
  char: AnimalCharacter;
  x: number;
  y: number;
  dir: 1 | -1;
  pose: 'idle' | 'walk' | 'alert' | 'sleep' | 'sit';
  revealed: boolean; // inside sight radius
}

export interface ViewState {
  place: Place;
  player: Player;
  who: 'scarlett' | 'lennon';
  carrying: AnimalCharacter | null;
  carryingBabies: number;
  critters: CritterView[]; // mission animal, residents, babies
  npc: NpcView | null;
  evidence: EvidenceNode[];
  effects: Effect[];
  simT: number;
  sightR: number; // tiles
  fogged: boolean; // marsh mist
  upgrades: string[];
  glowTable: boolean; // pulse the map table when a mission is ready to plan
}

// =====================================================================================

export class Painter {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  zoom = 1.6;
  camX = 0;
  camY = 0;
  private groundCache = new Map<Place, HTMLCanvasElement>();
  private sprites = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize() {
    const rect = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = rect.width;
    this.H = rect.height;
    this.cv.width = Math.round(rect.width * this.dpr);
    this.cv.height = Math.round(rect.height * this.dpr);
    // locked close camera: ~10–13 tiles across regardless of screen size
    this.zoom = Math.max(1.25, Math.min(2.4, this.W / (11.5 * TILE)));
  }

  /** world (tile coords) -> screen px */
  sx(wx: number) {
    return (wx * TILE - this.camX) * this.zoom + this.W / 2;
  }
  sy(wy: number) {
    return (wy * TILE - this.camY) * this.zoom + this.H / 2;
  }
  screenToWorld(px: number, py: number) {
    return {
      x: ((px - this.W / 2) / this.zoom + this.camX) / TILE,
      y: ((py - this.H / 2) / this.zoom + this.camY) / TILE,
    };
  }

  // ---- pre-rendered ground per region -------------------------------------------------

  private ground(place: Place): HTMLCanvasElement {
    let c = this.groundCache.get(place);
    if (c) return c;
    const m = getMap(place);
    c = document.createElement('canvas');
    c.width = m.w * TILE;
    c.height = m.h * TILE;
    const g = c.getContext('2d')!;
    // base tiles with per-tile wobble
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const t = m.ground[y * m.w + x];
        const j = Math.round((h2(x, y, 5) - 0.5) * 6);
        g.fillStyle = tint(GROUND_BASE[t], j);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    // scalloped organic borders
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const t = m.ground[y * m.w + x];
        const pr = PRIORITY[t];
        const j = Math.round((h2(x, y, 5) - 0.5) * 6);
        const col = tint(GROUND_BASE[t], j);
        const scallop = (nx: number, ny: number, horiz: boolean, edgeX: number, edgeY: number) => {
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return;
          const nt = m.ground[ny * m.w + nx];
          if (nt === t || PRIORITY[nt] >= pr) return;
          g.fillStyle = col;
          for (let i = 0; i < 5; i++) {
            const f = (i + 0.5) / 5;
            const r = TILE * (0.14 + h2(x * 7 + i, y * 13 + i, 9) * 0.14);
            const bx = horiz ? edgeX + f * TILE : edgeX;
            const by = horiz ? edgeY : edgeY + f * TILE;
            g.beginPath();
            g.arc(bx, by, r, 0, Math.PI * 2);
            g.fill();
          }
        };
        scallop(x + 1, y, false, (x + 1) * TILE, y * TILE);
        scallop(x - 1, y, false, x * TILE, y * TILE);
        scallop(x, y + 1, true, x * TILE, (y + 1) * TILE);
        scallop(x, y - 1, true, x * TILE, y * TILE);
      }
    }
    // per-tile detail
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const t = m.ground[y * m.w + x] as GroundId;
        const px = x * TILE;
        const py = y * TILE;
        const r = (i: number) => h2(x * 17 + i, y * 31 + i, 13);
        if (t === G.GRASS || t === G.MEADOW) {
          if (r(1) < 0.68) {
            g.strokeStyle = tint(GROUND_BASE[t], -22);
            g.lineWidth = 2;
            const gx = px + 8 + r(2) * (TILE - 16);
            const gy = py + 10 + r(3) * (TILE - 18);
            g.beginPath();
            g.moveTo(gx - 3, gy + 4);
            g.lineTo(gx - 1, gy - 2);
            g.moveTo(gx + 1, gy + 4);
            g.lineTo(gx + 2, gy - 3);
            g.moveTo(gx + 5, gy + 4);
            g.lineTo(gx + 6, gy - 1);
            g.stroke();
          }
          if (t === G.MEADOW && r(4) > 0.7) {
            g.fillStyle = FLOWER_PETALS[Math.floor(r(5) * 4)];
            g.beginPath();
            g.arc(px + 8 + r(6) * (TILE - 16), py + 8 + r(7) * (TILE - 16), 2.6, 0, Math.PI * 2);
            g.fill();
          }
        } else if (t === G.TALLGRASS) {
          g.strokeStyle = tint(GROUND_BASE[t], -26);
          g.lineWidth = 2.4;
          for (let i = 0; i < 4; i++) {
            const gx = px + 6 + r(i + 8) * (TILE - 12);
            const gy = py + 12 + r(i + 12) * (TILE - 16);
            g.beginPath();
            g.moveTo(gx, gy + 8);
            g.quadraticCurveTo(gx + (r(i) - 0.5) * 6, gy - 2, gx + (r(i) - 0.5) * 10, gy - 8);
            g.stroke();
          }
        } else if (t === G.PATH || t === G.SAND) {
          if (r(1) < 0.45) {
            g.fillStyle = tint(GROUND_BASE[t], -24);
            g.beginPath();
            g.ellipse(px + 10 + r(2) * (TILE - 20), py + 10 + r(3) * (TILE - 20), 3 + r(4) * 2.5, 2 + r(5) * 2, 0, 0, Math.PI * 2);
            g.fill();
          }
        } else if (t === G.MUD) {
          g.fillStyle = tint(GROUND_BASE[t], -18);
          g.beginPath();
          g.ellipse(px + 10 + r(2) * (TILE - 20), py + 10 + r(3) * (TILE - 20), 5 + r(4) * 4, 3 + r(5) * 2, 0, 0, Math.PI * 2);
          g.fill();
        } else if (t === G.WATER || t === G.DEEP) {
          g.strokeStyle = 'rgba(240,250,255,0.35)';
          g.lineWidth = 2;
          if (r(1) < 0.5) {
            const wy = py + 10 + r(2) * (TILE - 20);
            const wx = px + 6 + r(3) * 10;
            g.beginPath();
            g.moveTo(wx, wy);
            g.quadraticCurveTo(wx + 9, wy - 3, wx + 18, wy);
            g.stroke();
          }
        } else if (t === G.ROCK) {
          if (r(1) < 0.4) {
            g.strokeStyle = tint(GROUND_BASE[t], -28);
            g.lineWidth = 1.6;
            const cx2 = px + 10 + r(2) * (TILE - 20);
            const cy2 = py + 10 + r(3) * (TILE - 20);
            g.beginPath();
            g.moveTo(cx2, cy2);
            g.lineTo(cx2 + 8 + r(4) * 6, cy2 + 4 + r(5) * 5);
            g.stroke();
          }
        } else if (t === G.BOARD) {
          g.strokeStyle = tint(GROUND_BASE[t], -32);
          g.lineWidth = 2;
          for (let i = 1; i < 3; i++) {
            g.beginPath();
            g.moveTo(px, py + (i * TILE) / 3);
            g.lineTo(px + TILE, py + (i * TILE) / 3);
            g.stroke();
          }
          g.strokeStyle = tint(GROUND_BASE[t], 18);
          g.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        } else if (t === G.DIRT) {
          g.strokeStyle = tint(GROUND_BASE[t], -22);
          g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(px, py + TILE / 2);
          g.lineTo(px + TILE, py + TILE / 2);
          g.stroke();
        } else if (t === G.CLIFF) {
          // rocky face if open ground below (gives the ledge a 3/4 face)
          const below = y + 1 < m.h ? m.ground[(y + 1) * m.w + x] : G.CLIFF;
          if (below !== G.CLIFF) {
            const grad = g.createLinearGradient(px, py, px, py + TILE);
            grad.addColorStop(0, tint(GROUND_BASE[G.CLIFF], 20));
            grad.addColorStop(0.55, tint(GROUND_BASE[G.CLIFF], -10));
            grad.addColorStop(1, tint(GROUND_BASE[G.CLIFF], -38));
            g.fillStyle = grad;
            g.fillRect(px, py, TILE, TILE);
            g.strokeStyle = 'rgba(40,35,28,0.3)';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(px + 8 + r(1) * 10, py + 8);
            g.lineTo(px + 12 + r(2) * 10, py + TILE - 6);
            g.stroke();
          } else if (r(3) < 0.3) {
            g.fillStyle = tint(GROUND_BASE[G.CLIFF], 14);
            g.beginPath();
            g.ellipse(px + 12 + r(4) * 24, py + 12 + r(5) * 24, 5, 3.5, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    this.groundCache.set(place, c);
    return c;
  }

  // ---- prop sprites --------------------------------------------------------------------

  private sprite(kind: string, v: number): HTMLCanvasElement {
    const key = `${kind}:${v}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const big = kind === 'barn' || kind === 'cottage' || kind === 'tower';
    c = document.createElement('canvas');
    c.width = big ? 300 : 128;
    c.height = big ? 260 : 128;
    const g = c.getContext('2d')!;
    drawPropSprite(g, kind, v, c.width, c.height);
    this.sprites.set(key, c);
    return c;
  }

  // ---- main frame ------------------------------------------------------------------------

  draw(view: ViewState, now: number) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = getMap(view.place);
    const z = this.zoom;

    // camera follows player, clamped to map
    const targX = view.player.x * TILE;
    const targY = view.player.y * TILE;
    this.camX += (targX - this.camX) * 0.12;
    this.camY += (targY - this.camY) * 0.12;
    const halfW = this.W / 2 / z;
    const halfH = this.H / 2 / z;
    this.camX = Math.max(halfW, Math.min(m.w * TILE - halfW, this.camX));
    this.camY = Math.max(halfH, Math.min(m.h * TILE - halfH, this.camY));

    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(0, 0, this.W, this.H);

    // ground (pre-rendered, blit the visible window)
    const gc = this.ground(view.place);
    const sx0 = this.camX - halfW;
    const sy0 = this.camY - halfH;
    ctx.drawImage(gc, sx0, sy0, halfW * 2, halfH * 2, 0, 0, this.W, this.H);

    // animated water sparkle + shore wiggle
    const tx0 = Math.max(0, Math.floor(sx0 / TILE));
    const ty0 = Math.max(0, Math.floor(sy0 / TILE));
    const tx1 = Math.min(m.w - 1, Math.ceil((sx0 + halfW * 2) / TILE));
    const ty1 = Math.min(m.h - 1, Math.ceil((sy0 + halfH * 2) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = m.ground[ty * m.w + tx];
        if (t !== G.WATER && t !== G.DEEP) continue;
        const a = 0.10 + 0.10 * Math.sin(now * 1.8 + tx * 1.3 + ty * 2.1);
        if (a > 0.06) {
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          const px = this.sx(tx + 0.25 + 0.2 * Math.sin(now + tx));
          const py = this.sy(ty + 0.5 + 0.15 * Math.cos(now * 1.3 + ty));
          ctx.beginPath();
          ctx.ellipse(px, py, 7 * z, 2.4 * z, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---- y-sorted drawables ----
    type D = { y: number; fn: () => void };
    const items: D[] = [];
    const within = (x: number, y: number, pad = 3) =>
      x > tx0 - pad && x < tx1 + pad && y > ty0 - pad && y < ty1 + pad;

    for (const p of m.props) {
      if (!within(p.x, p.y)) continue;
      if (p.upgradeId && !view.upgrades.includes(p.upgradeId)) continue;
      if (p.kind === 'waterfall') {
        items.push({ y: p.y - 0.4, fn: () => this.drawWaterfall(p, now) });
        continue;
      }
      if (p.kind === 'lilypad' || p.kind === 'flower') {
        // flat — draw under everything sorted at very low y
        items.push({ y: -1000 + p.y * 0.001, fn: () => this.blitProp(p) });
        continue;
      }
      items.push({ y: p.y, fn: () => this.blitProp(p, p.kind === 'maptable' && view.glowTable ? now : undefined) });
    }

    // evidence markers
    for (const ev of view.evidence) {
      if (ev.found || !within(ev.x, ev.y)) continue;
      const dist = Math.hypot(ev.x - view.player.x, ev.y - view.player.y);
      if (dist > view.sightR + 0.5) continue;
      items.push({ y: ev.y - 0.45, fn: () => this.drawEvidence(ev, now) });
    }

    // critters
    for (const cr of view.critters) {
      if (!cr.revealed || !within(cr.x, cr.y)) continue;
      items.push({
        y: cr.y,
        fn: () => {
          const px = this.sx(cr.x);
          const py = this.sy(cr.y);
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(z * cr.dir, z);
          drawCritter(ctx, cr.char, cr.pose, now);
          ctx.restore();
          if (cr.pose === 'alert') {
            ctx.fillStyle = '#e85d4a';
            ctx.font = `800 ${Math.round(15 * z)}px ui-sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('!', px, py - 38 * z - Math.abs(Math.sin(now * 6)) * 3 * z);
            ctx.textAlign = 'left';
          }
          if (cr.pose === 'sleep') {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = `700 ${Math.round(10 * z)}px ui-sans-serif`;
            ctx.fillText('z', px + 12 * z, py - 28 * z - (Math.sin(now * 2) + 1) * 3 * z);
            ctx.font = `700 ${Math.round(7 * z)}px ui-sans-serif`;
            ctx.fillText('z', px + 18 * z, py - 34 * z - (Math.sin(now * 2 + 1) + 1) * 3 * z);
          }
        },
      });
    }

    // npc (owner / ranger at the gate)
    if (view.npc && within(view.npc.x, view.npc.y)) {
      const npc = view.npc;
      items.push({
        y: npc.y,
        fn: () => {
          const px = this.sx(npc.x);
          const py = this.sy(npc.y);
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(z, z);
          drawNpc(ctx, npc.kind, now);
          ctx.restore();
          if (npc.hasBubble) {
            const bob = Math.sin(now * 3) * 3 * z;
            ctx.fillStyle = '#fffdf4';
            ctx.strokeStyle = '#caa244';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py - 52 * z + bob, 12 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#d8763a';
            ctx.font = `800 ${Math.round(14 * z)}px ui-sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('!', px, py - 47 * z + bob);
            ctx.textAlign = 'left';
          }
        },
      });
    }

    // player
    items.push({
      y: view.player.y,
      fn: () => {
        const px = this.sx(view.player.x);
        const py = this.sy(view.player.y);
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(z, z);
        drawKid(ctx, view.who, view.player, view.carrying, view.carryingBabies, now);
        ctx.restore();
      },
    });

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.fn();

    // floating effects
    for (const ef of view.effects) {
      const f = (view.simT - ef.t0) / ef.dur;
      if (f < 0 || f > 1) continue;
      const px = this.sx(ef.x);
      const py = this.sy(ef.y) - f * 26 * z;
      const a = 1 - f;
      if (ef.kind === 'heart') {
        drawHeart(ctx, px + Math.sin(f * 5 + ef.t0 * 7) * 5 * z, py, 5.5 * z, `rgba(238,90,111,${a.toFixed(2)})`);
      } else if (ef.kind === 'sparkle') {
        ctx.strokeStyle = `rgba(255,224,130,${a.toFixed(2)})`;
        ctx.lineWidth = 2 * z;
        const r = (3 + f * 7) * z;
        ctx.beginPath();
        ctx.moveTo(px - r, py);
        ctx.lineTo(px + r, py);
        ctx.moveTo(px, py - r);
        ctx.lineTo(px, py + r);
        ctx.stroke();
      } else if (ef.kind === 'poof') {
        ctx.fillStyle = `rgba(235,235,228,${(a * 0.6).toFixed(2)})`;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(px + Math.cos(i * 1.6) * f * 16 * z, py + Math.sin(i * 2.1) * f * 9 * z, (3 + f * 5) * z, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ef.kind === 'note') {
        ctx.fillStyle = `rgba(255,250,235,${a.toFixed(2)})`;
        ctx.font = `${Math.round(13 * z)}px serif`;
        ctx.fillText('♪', px, py);
      } else if (ef.kind === 'text' && ef.text) {
        ctx.font = `800 ${Math.round(13 * z)}px ui-sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3 * z;
        ctx.strokeStyle = `rgba(60,40,20,${(a * 0.8).toFixed(2)})`;
        ctx.strokeText(ef.text, px, py);
        ctx.fillStyle = `rgba(255,235,170,${a.toFixed(2)})`;
        ctx.fillText(ef.text, px, py);
        ctx.textAlign = 'left';
      }
    }

    // marsh mist
    if (view.fogged) {
      for (let i = 0; i < 5; i++) {
        const fx = ((now * 12 + i * 350) % (this.W + 500)) - 250;
        const fy = this.H * (0.12 + i * 0.2) + Math.sin(now * 0.3 + i * 2) * 30;
        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 190);
        grad.addColorStop(0, 'rgba(235,240,238,0.16)');
        grad.addColorStop(1, 'rgba(235,240,238,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(fx - 190, fy - 190, 380, 380);
      }
    }

    // sight-radius reveal: the world dims beyond your circle of attention
    {
      const px = this.sx(view.player.x);
      const py = this.sy(view.player.y) - 14 * z;
      const R = view.sightR * TILE * z;
      const grad = ctx.createRadialGradient(px, py, R * 0.62, px, py, R * 1.3);
      grad.addColorStop(0, 'rgba(24,34,28,0)');
      grad.addColorStop(1, 'rgba(24,34,28,0.42)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    // warm cozy vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.78);
    vg.addColorStop(0, 'rgba(40,30,15,0)');
    vg.addColorStop(1, 'rgba(40,30,15,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private blitProp(p: Prop, glowNow?: number) {
    const spr = this.sprite(p.kind, p.v);
    const z = this.zoom;
    const w = spr.width * 0.62 * p.s * z;
    const h = spr.height * 0.62 * p.s * z;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    if (glowNow !== undefined) {
      const pulse = 0.5 + 0.5 * Math.sin(glowNow * 3.2);
      this.ctx.shadowColor = `rgba(255,214,110,${(0.5 + pulse * 0.5).toFixed(2)})`;
      this.ctx.shadowBlur = 16 + pulse * 10;
    }
    this.ctx.drawImage(spr, px - w / 2, py - h + h * 0.1, w, h);
    this.ctx.shadowBlur = 0;
  }

  private drawWaterfall(p: Prop, now: number) {
    const { ctx } = this;
    const z = this.zoom;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    const w = 4.6 * TILE * 0.55 * z;
    const h = 2.4 * TILE * z;
    // falling water
    const grad = ctx.createLinearGradient(0, py - h, 0, py);
    grad.addColorStop(0, '#9fd0e8');
    grad.addColorStop(1, '#6db4d8');
    ctx.fillStyle = grad;
    ctx.fillRect(px - w / 2, py - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const fy = ((now * 130 + i * 47) % h);
      ctx.fillRect(px - w / 2 + 4 * z + i * (w / 6), py - h + fy, 3 * z, 14 * z);
    }
    // foam at the base
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 7; i++) {
      const bx = px - w / 2 + (i + 0.5) * (w / 7);
      ctx.beginPath();
      ctx.arc(bx, py - 2 * z + Math.sin(now * 5 + i) * 2 * z, (4 + (i % 3)) * z * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawEvidence(ev: EvidenceNode, now: number) {
    const { ctx } = this;
    const z = this.zoom;
    const px = this.sx(ev.x);
    const py = this.sy(ev.y);
    // soft pulsing ring so little eyes can find it
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.6);
    ctx.strokeStyle = `rgba(255,228,140,${(0.35 + pulse * 0.45).toFixed(2)})`;
    ctx.lineWidth = 2.5 * z;
    ctx.beginPath();
    ctx.ellipse(px, py, (13 + pulse * 3) * z, (8 + pulse * 2) * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(z, z);
    drawEvidenceIcon(ctx, ev.kind);
    ctx.restore();
  }
}

// =====================================================================================
// sprite painters
// =====================================================================================

function drawPropSprite(g: CanvasRenderingContext2D, kind: string, v: number, W: number, H: number) {
  const cx = W / 2;
  const baseY = H - 10;
  const shadow = (rx: number) => {
    g.fillStyle = 'rgba(40,60,35,0.25)';
    g.beginPath();
    g.ellipse(cx, baseY, rx, rx * 0.32, 0, 0, Math.PI * 2);
    g.fill();
  };
  const r = (i: number) => h2(v * 13 + 7, i, 77);

  const fluffCanopy = (cy: number, R: number, light: string, mid: string, dark: string, blobs = 6) => {
    g.fillStyle = dark;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.45 + 4, R * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = mid;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + 0.4;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.4, R * 0.48, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy - 2, R * 0.62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.arc(cx - R * 0.22, cy - R * 0.3, R * 0.42, 0, Math.PI * 2);
    g.fill();
    // leaf dots
    g.fillStyle = 'rgba(255,255,240,0.2)';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(cx + (r(i + 20) - 0.5) * R * 1.3, cy + (r(i + 30) - 0.6) * R, 3 + r(i + 40) * 2, 0, Math.PI * 2);
      g.fill();
    }
  };

  switch (kind) {
    case 'tree': {
      shadow(34);
      g.fillStyle = '#8a5f3c';
      g.fillRect(cx - 6, baseY - 26, 12, 26);
      const pals = [
        ['#b8dc8a', '#8fc46e', '#6da350'],
        ['#c2e094', '#9bcc74', '#76aa58'],
        ['#aed480', '#86bc64', '#659a4a'],
      ][v % 3];
      fluffCanopy(baseY - 62, 36, pals[0], pals[1], pals[2]);
      break;
    }
    case 'willow': {
      shadow(36);
      g.fillStyle = '#8a6a48';
      g.fillRect(cx - 5, baseY - 30, 10, 30);
      fluffCanopy(baseY - 66, 34, '#cfe4a0', '#a8cc7c', '#84ac60');
      g.strokeStyle = '#a8cc7c';
      g.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const sx2 = cx - 30 + i * 12;
        g.beginPath();
        g.moveTo(sx2, baseY - 56);
        g.quadraticCurveTo(sx2 - 3, baseY - 36, sx2 + (r(i) - 0.5) * 6, baseY - 18);
        g.stroke();
      }
      break;
    }
    case 'pinetree': {
      shadow(28);
      g.fillStyle = '#7a5638';
      g.fillRect(cx - 5, baseY - 18, 10, 18);
      for (let i = 0; i < 3; i++) {
        const w = 40 - i * 9;
        const yTop = baseY - 36 - i * 24;
        g.fillStyle = i % 2 ? '#4d7a52' : '#5b8a5e';
        g.beginPath();
        g.moveTo(cx, yTop - 22);
        g.quadraticCurveTo(cx + w * 0.7, yTop + 4, cx + w * 0.45, yTop + 10);
        g.quadraticCurveTo(cx, yTop + 16, cx - w * 0.45, yTop + 10);
        g.quadraticCurveTo(cx - w * 0.7, yTop + 4, cx, yTop - 22);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,240,0.25)';
      g.beginPath();
      g.arc(cx - 8, baseY - 74, 7, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'bush': {
      shadow(26);
      fluffCanopy(baseY - 20, 22, '#b8dc8a', '#8fc46e', '#6da350', 5);
      break;
    }
    case 'berrybush': {
      shadow(26);
      fluffCanopy(baseY - 20, 22, '#b0d484', '#88bc66', '#68a04e', 5);
      g.fillStyle = v % 2 ? '#5a6fc4' : '#d4566a';
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.arc(cx + (r(i + 50) - 0.5) * 36, baseY - 14 - r(i + 60) * 22, 3.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'appletree': {
      shadow(34);
      g.fillStyle = '#8a5f3c';
      g.fillRect(cx - 6, baseY - 24, 12, 24);
      fluffCanopy(baseY - 58, 34, '#b8dc8a', '#8fc46e', '#6da350');
      g.fillStyle = '#d44a42';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(cx + (r(i + 70) - 0.5) * 50, baseY - 46 - r(i + 80) * 26, 4.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'rock': {
      shadow(24);
      g.fillStyle = '#a8a49a';
      g.beginPath();
      g.moveTo(cx - 22, baseY - 4);
      g.quadraticCurveTo(cx - 20, baseY - 26, cx - 4, baseY - 30);
      g.quadraticCurveTo(cx + 16, baseY - 30, cx + 21, baseY - 12);
      g.quadraticCurveTo(cx + 22, baseY - 2, cx + 10, baseY);
      g.closePath();
      g.fill();
      g.fillStyle = '#c4c0b6';
      g.beginPath();
      g.ellipse(cx - 6, baseY - 20, 10, 7, -0.4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'stump': {
      shadow(18);
      g.fillStyle = '#8a6444';
      g.fillRect(cx - 13, baseY - 16, 26, 14);
      g.fillStyle = '#c9a474';
      g.beginPath();
      g.ellipse(cx, baseY - 16, 13, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#a8845a';
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(cx, baseY - 16, 8, 4.2, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(cx, baseY - 16, 4, 2, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'flower': {
      const col = FLOWER_PETALS[v % 4];
      g.strokeStyle = '#5d9a4a';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(cx, baseY);
      g.quadraticCurveTo(cx + 2, baseY - 8, cx, baseY - 15);
      g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.fillStyle = col;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 5, baseY - 17 + Math.sin(a) * 5, 3.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f2cf5a';
      g.beginPath();
      g.arc(cx, baseY - 17, 2.8, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'cattail': {
      g.strokeStyle = '#7a9a52';
      g.lineWidth = 2.6;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(cx + i * 7, baseY);
        g.quadraticCurveTo(cx + i * 9, baseY - 18, cx + i * 7 + i * 2, baseY - 34 - Math.abs(i) * -6);
        g.stroke();
        if (i !== 0 || v === 0) {
          g.fillStyle = '#8a5a36';
          g.fillRect(cx + i * 7 + i * 2 - 2.4, baseY - 36 - (i === 0 ? 2 : 0), 5, 12);
        }
      }
      break;
    }
    case 'haybale': {
      shadow(24);
      g.fillStyle = '#e0bc6a';
      g.beginPath();
      g.roundRect(cx - 22, baseY - 26, 44, 24, 8);
      g.fill();
      g.strokeStyle = '#c49a48';
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx - 22, baseY - 20 + i * 6);
        g.lineTo(cx + 22, baseY - 20 + i * 6);
        g.stroke();
      }
      g.fillStyle = '#eccd84';
      g.beginPath();
      g.ellipse(cx - 10, baseY - 21, 8, 4, -0.3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'fence': {
      g.fillStyle = '#b08a5c';
      if (v === 0) {
        // horizontal
        g.fillRect(cx - 30, baseY - 18, 60, 4.6);
        g.fillRect(cx - 30, baseY - 9, 60, 4.6);
        for (const fx of [-24, 0, 24]) {
          g.fillStyle = '#9a7448';
          g.fillRect(cx + fx - 3, baseY - 26, 6, 26);
          g.beginPath();
          g.arc(cx + fx, baseY - 26, 3, Math.PI, 0);
          g.fill();
          g.fillStyle = '#b08a5c';
        }
      } else {
        // vertical
        for (const fy of [-22, -2]) {
          g.fillStyle = '#9a7448';
          g.fillRect(cx - 3, baseY - 28 + fy + 14, 6, 22);
        }
        g.fillStyle = '#b08a5c';
        g.fillRect(cx - 2.2, baseY - 34, 4.4, 34);
      }
      break;
    }
    case 'log': {
      shadow(24);
      g.fillStyle = '#8a6444';
      g.beginPath();
      g.roundRect(cx - 24, baseY - 14, 48, 12, 6);
      g.fill();
      g.fillStyle = '#c9a474';
      g.beginPath();
      g.ellipse(cx + 24, baseY - 8, 4, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6e4e34';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(cx - 18, baseY - 10);
      g.lineTo(cx + 6, baseY - 10);
      g.stroke();
      break;
    }
    case 'lilypad': {
      g.fillStyle = '#6daa58';
      g.beginPath();
      g.ellipse(cx, baseY - 8, 14, 8, 0, 0.35, Math.PI * 2 - 0.2);
      g.lineTo(cx, baseY - 8);
      g.fill();
      g.fillStyle = '#f2a7c3';
      g.beginPath();
      g.arc(cx + 7, baseY - 13, 3.4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'sign': {
      shadow(14);
      g.fillStyle = '#9a7448';
      g.fillRect(cx - 3, baseY - 30, 6, 30);
      g.fillStyle = '#c9a474';
      g.beginPath();
      g.roundRect(cx - 20, baseY - 44, 40, 18, 4);
      g.fill();
      g.strokeStyle = '#8a6444';
      g.lineWidth = 2;
      g.strokeRect(cx - 20, baseY - 44, 40, 18);
      g.fillStyle = '#6e4e34';
      g.font = '700 11px ui-sans-serif';
      g.textAlign = 'center';
      g.fillText(['🌳', '🌾', '💧', '⛰️', '🌫️'][v % 5], cx, baseY - 31);
      g.textAlign = 'left';
      break;
    }
    case 'bridge': {
      g.fillStyle = '#b08a5c';
      g.beginPath();
      g.roundRect(cx - 40, baseY - 16, 80, 6, 3);
      g.fill();
      for (const fx of [-34, -17, 0, 17, 34]) {
        g.fillStyle = '#9a7448';
        g.fillRect(cx + fx - 2.4, baseY - 28, 4.8, 14);
      }
      g.fillStyle = '#b08a5c';
      g.beginPath();
      g.roundRect(cx - 40, baseY - 31, 80, 5, 3);
      g.fill();
      break;
    }
    case 'barn': {
      shadow(80);
      // front face
      g.fillStyle = '#c4524a';
      g.fillRect(cx - 70, baseY - 92, 140, 92);
      g.fillStyle = '#d4625a';
      g.beginPath();
      g.moveTo(cx - 78, baseY - 92);
      g.lineTo(cx, baseY - 138);
      g.lineTo(cx + 78, baseY - 92);
      g.closePath();
      g.fill();
      g.fillStyle = '#8a4038';
      g.beginPath();
      g.roundRect(cx - 26, baseY - 56, 52, 56, 6);
      g.fill();
      g.strokeStyle = '#e8d8b8';
      g.lineWidth = 4;
      g.strokeRect(cx - 26, baseY - 56, 52, 56);
      g.beginPath();
      g.moveTo(cx - 26, baseY - 56);
      g.lineTo(cx + 26, baseY);
      g.moveTo(cx + 26, baseY - 56);
      g.lineTo(cx - 26, baseY);
      g.stroke();
      // hayloft window
      g.fillStyle = '#e8d8b8';
      g.beginPath();
      g.arc(cx, baseY - 104, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8a4038';
      g.beginPath();
      g.arc(cx, baseY - 104, 9, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'cottage': {
      shadow(90);
      // walls
      g.fillStyle = '#f2e8d4';
      g.fillRect(cx - 80, baseY - 86, 160, 86);
      // roof
      g.fillStyle = '#4d9a94';
      g.beginPath();
      g.moveTo(cx - 92, baseY - 82);
      g.lineTo(cx, baseY - 140);
      g.lineTo(cx + 92, baseY - 82);
      g.lineTo(cx + 80, baseY - 70);
      g.lineTo(cx, baseY - 122);
      g.lineTo(cx - 80, baseY - 70);
      g.closePath();
      g.fill();
      g.fillStyle = '#5dada6';
      g.beginPath();
      g.moveTo(cx - 80, baseY - 70);
      g.lineTo(cx, baseY - 122);
      g.lineTo(cx + 80, baseY - 70);
      g.lineTo(cx + 80, baseY - 82);
      g.lineTo(cx, baseY - 130);
      g.lineTo(cx - 80, baseY - 82);
      g.closePath();
      g.fill();
      // door
      g.fillStyle = '#bf7a48';
      g.beginPath();
      g.roundRect(cx - 16, baseY - 46, 32, 46, 6);
      g.fill();
      g.fillStyle = '#f2cf5a';
      g.beginPath();
      g.arc(cx + 9, baseY - 22, 2.6, 0, Math.PI * 2);
      g.fill();
      // windows with boxes
      for (const wx of [-52, 52]) {
        g.fillStyle = '#bde2ee';
        g.beginPath();
        g.roundRect(cx + wx - 14, baseY - 58, 28, 24, 4);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2.6;
        g.strokeRect(cx + wx - 14, baseY - 58, 28, 24);
        g.beginPath();
        g.moveTo(cx + wx, baseY - 58);
        g.lineTo(cx + wx, baseY - 34);
        g.stroke();
        g.fillStyle = '#8a6444';
        g.fillRect(cx + wx - 16, baseY - 34, 32, 6);
        for (let i = 0; i < 3; i++) {
          g.fillStyle = FLOWER_PETALS[i % 4];
          g.beginPath();
          g.arc(cx + wx - 8 + i * 8, baseY - 36, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
      // hanging sign with paw
      g.fillStyle = '#9a7448';
      g.fillRect(cx - 36, baseY - 86, 72, 6);
      g.fillStyle = '#fdf6e0';
      g.beginPath();
      g.roundRect(cx - 32, baseY - 82, 64, 22, 6);
      g.fill();
      g.strokeStyle = '#caa244';
      g.lineWidth = 2;
      g.strokeRect(cx - 32, baseY - 82, 64, 22);
      // paw print
      g.fillStyle = '#bf7a48';
      g.beginPath();
      g.ellipse(cx, baseY - 67, 5.5, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(cx - 5 + i * 5, baseY - 75, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      // chimney
      g.fillStyle = '#b8907a';
      g.fillRect(cx + 44, baseY - 132, 16, 26);
      break;
    }
    case 'maptable': {
      shadow(26);
      g.fillStyle = '#9a7448';
      g.fillRect(cx - 20, baseY - 22, 5, 22);
      g.fillRect(cx + 15, baseY - 22, 5, 22);
      g.fillStyle = '#c9a474';
      g.beginPath();
      g.roundRect(cx - 26, baseY - 30, 52, 10, 3);
      g.fill();
      // the map on top
      g.fillStyle = '#fdf2cf';
      g.beginPath();
      g.roundRect(cx - 20, baseY - 36, 40, 14, 2);
      g.fill();
      g.fillStyle = '#8fc46e';
      g.beginPath();
      g.arc(cx - 8, baseY - 29, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6db4d8';
      g.beginPath();
      g.arc(cx + 7, baseY - 30, 3.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d4566a';
      g.beginPath();
      g.moveTo(cx + 1, baseY - 33);
      g.lineTo(cx + 4, baseY - 27);
      g.lineTo(cx - 2, baseY - 27);
      g.closePath();
      g.fill();
      break;
    }
    case 'mailbox': {
      shadow(12);
      g.fillStyle = '#9a7448';
      g.fillRect(cx - 2.5, baseY - 26, 5, 26);
      g.fillStyle = '#5dada6';
      g.beginPath();
      g.roundRect(cx - 12, baseY - 40, 24, 15, 7);
      g.fill();
      g.fillStyle = '#f2cf5a';
      g.fillRect(cx + 6, baseY - 46, 3, 8);
      break;
    }
    case 'gardenbed': {
      shadow(30);
      g.fillStyle = '#9a7448';
      g.beginPath();
      g.roundRect(cx - 30, baseY - 18, 60, 16, 4);
      g.fill();
      g.fillStyle = '#7a5a3a';
      g.beginPath();
      g.roundRect(cx - 26, baseY - 15, 52, 10, 3);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const fx = cx - 20 + i * 10;
        g.strokeStyle = '#5d9a4a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(fx, baseY - 12);
        g.lineTo(fx, baseY - 22);
        g.stroke();
        g.fillStyle = FLOWER_PETALS[i % 4];
        g.beginPath();
        g.arc(fx, baseY - 25, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f2cf5a';
        g.beginPath();
        g.arc(fx, baseY - 25, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'medbay': {
      shadow(46);
      g.fillStyle = '#fdfaf2';
      g.fillRect(cx - 40, baseY - 50, 80, 50);
      g.fillStyle = '#d88a8a';
      g.beginPath();
      g.moveTo(cx - 46, baseY - 48);
      g.lineTo(cx, baseY - 72);
      g.lineTo(cx + 46, baseY - 48);
      g.closePath();
      g.fill();
      g.fillStyle = '#d4566a';
      g.fillRect(cx - 4, baseY - 42, 8, 20);
      g.fillRect(cx - 10, baseY - 36, 20, 8);
      g.fillStyle = '#bde2ee';
      g.beginPath();
      g.roundRect(cx + 14, baseY - 40, 18, 16, 3);
      g.fill();
      break;
    }
    case 'cozyroom': {
      shadow(46);
      g.fillStyle = '#f2e0c4';
      g.fillRect(cx - 38, baseY - 48, 76, 48);
      g.fillStyle = '#c4869a';
      g.beginPath();
      g.moveTo(cx - 44, baseY - 46);
      g.lineTo(cx, baseY - 68);
      g.lineTo(cx + 44, baseY - 46);
      g.closePath();
      g.fill();
      // round window with a cat silhouette
      g.fillStyle = '#ffe9b0';
      g.beginPath();
      g.arc(cx, baseY - 28, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#54442e';
      g.beginPath();
      g.ellipse(cx + 1, baseY - 24, 7, 4, 0, Math.PI, 0);
      g.fill();
      g.beginPath();
      g.arc(cx - 5, baseY - 28, 3.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx - 7.5, baseY - 30);
      g.lineTo(cx - 6.5, baseY - 34);
      g.lineTo(cx - 4.5, baseY - 31);
      g.closePath();
      g.fill();
      break;
    }
    case 'tower': {
      shadow(40);
      g.fillStyle = '#9a7448';
      g.fillRect(cx - 22, baseY - 70, 7, 70);
      g.fillRect(cx + 15, baseY - 70, 7, 70);
      g.fillStyle = '#b08a5c';
      g.beginPath();
      g.moveTo(cx - 24, baseY - 4);
      g.lineTo(cx + 24, baseY - 64);
      g.moveTo(cx + 24, baseY - 4);
      g.lineTo(cx - 24, baseY - 64);
      g.lineWidth = 5;
      g.strokeStyle = '#b08a5c';
      g.stroke();
      g.fillStyle = '#c9a474';
      g.fillRect(cx - 28, baseY - 86, 56, 20);
      g.fillStyle = '#4d9a94';
      g.beginPath();
      g.moveTo(cx - 32, baseY - 86);
      g.lineTo(cx, baseY - 104);
      g.lineTo(cx + 32, baseY - 86);
      g.closePath();
      g.fill();
      break;
    }
    case 'playyard': {
      shadow(40);
      // seesaw
      g.fillStyle = '#d4566a';
      g.beginPath();
      g.moveTo(cx - 30, baseY - 40);
      g.lineTo(cx - 22, baseY - 10);
      g.lineTo(cx - 38, baseY - 10);
      g.closePath();
      g.fill();
      g.fillStyle = '#f2cf5a';
      g.save();
      g.translate(cx - 30, baseY - 36);
      g.rotate(-0.2);
      g.fillRect(-26, -3, 52, 6);
      g.restore();
      // ball
      g.fillStyle = '#5a8fd0';
      g.beginPath();
      g.arc(cx + 18, baseY - 10, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2f0e4';
      g.beginPath();
      g.arc(cx + 18, baseY - 10, 10, -0.7, 0.7);
      g.lineTo(cx + 18, baseY - 10);
      g.fill();
      break;
    }
  }
}

// ---- evidence icons --------------------------------------------------------------------

function drawEvidenceIcon(g: CanvasRenderingContext2D, kind: string) {
  switch (kind) {
    case 'prints':
    case 'mud': {
      g.fillStyle = kind === 'mud' ? '#6e4e34' : 'rgba(70,55,40,0.8)';
      for (let i = 0; i < 3; i++) {
        const px = -8 + i * 8;
        const py = (i % 2 ? -3 : 2);
        g.beginPath();
        g.ellipse(px, py, 3, 3.8, 0, 0, Math.PI * 2);
        g.fill();
        for (let t = 0; t < 3; t++) {
          g.beginPath();
          g.arc(px - 2.4 + t * 2.4, py - 4.6, 1.1, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 'fur': {
      g.strokeStyle = '#c4946a';
      g.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-5 + i * 3.4, 4);
        g.quadraticCurveTo(-3 + i * 3.4, -3, -1 + i * 3.4 + (i % 2), -7);
        g.stroke();
      }
      break;
    }
    case 'chewed': {
      g.fillStyle = '#e8d8b8';
      g.beginPath();
      g.ellipse(0, 0, 8, 4.6, 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b89a6a';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(-5 + i * 5, -3.4, 1.8, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'feather': {
      g.fillStyle = '#e8e2d0';
      g.save();
      g.rotate(0.5);
      g.beginPath();
      g.ellipse(0, 0, 3.4, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b8b0a0';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(0, 9);
      g.stroke();
      g.restore();
      break;
    }
    case 'scratch': {
      g.strokeStyle = '#8a6444';
      g.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-6 + i * 5, 6);
        g.lineTo(-2 + i * 5, -7);
        g.stroke();
      }
      break;
    }
    case 'nibbled': {
      g.fillStyle = '#d4566a';
      g.beginPath();
      g.arc(0, 0, 6, 0.6, Math.PI * 2 - 0.6);
      g.lineTo(0, 0);
      g.fill();
      g.fillStyle = '#5d9a4a';
      g.fillRect(-1, -10, 2, 4);
      break;
    }
    case 'redirect': {
      g.fillStyle = '#f2cf5a';
      g.beginPath();
      g.moveTo(-8, 2);
      g.lineTo(4, 2);
      g.lineTo(4, 6);
      g.lineTo(12, 0);
      g.lineTo(4, -6);
      g.lineTo(4, -2);
      g.lineTo(-8, -2);
      g.closePath();
      g.fill();
      break;
    }
  }
}

// =====================================================================================
// characters
// =====================================================================================

export function drawKid(
  g: CanvasRenderingContext2D,
  who: 'scarlett' | 'lennon',
  p: Pick<Player, 'dir' | 'moving' | 'walkT'>,
  carrying: AnimalCharacter | null,
  carryingBabies: number,
  now: number
) {
  const hair = who === 'scarlett' ? '#f2d478' : '#7a5236';
  const hairDark = who === 'scarlett' ? '#dcba58' : '#624128';
  const eyes = who === 'scarlett' ? '#5a8fd0' : '#8a7a3e';
  const skin = '#f2cfae';
  const vest = '#4d9a94';
  const shirt = who === 'scarlett' ? '#f2a7c3' : '#f6e27a';
  const step = p.moving ? Math.sin(p.walkT) : 0;
  const bob = p.moving ? Math.abs(Math.sin(p.walkT)) * 1.6 : Math.sin(now * 2) * 0.6;
  const side = p.dir === 'left' ? -1 : 1;
  const facingSide = p.dir === 'left' || p.dir === 'right';
  const facingUp = p.dir === 'up';

  // shadow
  g.fillStyle = 'rgba(40,60,35,0.25)';
  g.beginPath();
  g.ellipse(0, 0, 9, 3.4, 0, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.translate(0, -bob);
  if (facingSide) g.scale(side, 1);

  // legs
  g.fillStyle = '#7a6a52';
  g.beginPath();
  g.roundRect(-5 + (facingSide ? step * 3 : step * 2.4), -9, 4.4, 9, 2);
  g.roundRect(1 - (facingSide ? step * 3 : step * 2.4), -9, 4.4, 9, 2);
  g.fill();
  // sneakers
  g.fillStyle = '#f2f0e4';
  g.beginPath();
  g.ellipse(-2.8 + (facingSide ? step * 3 : step * 2.4), -0.6, 3, 1.8, 0, 0, Math.PI * 2);
  g.ellipse(3.2 - (facingSide ? step * 3 : step * 2.4), -0.6, 3, 1.8, 0, 0, Math.PI * 2);
  g.fill();

  // body: shirt + vest
  g.fillStyle = shirt;
  g.beginPath();
  g.roundRect(-7.5, -22, 15, 14, 5);
  g.fill();
  g.fillStyle = vest;
  g.beginPath();
  g.roundRect(-7.5, -22, 5.4, 13, 3);
  g.roundRect(2.1, -22, 5.4, 13, 3);
  g.fill();
  // paw badge
  if (!facingUp) {
    g.fillStyle = '#fdf6e0';
    g.beginPath();
    g.arc(-4.6, -18, 1.9, 0, Math.PI * 2);
    g.fill();
  }

  // arms
  g.fillStyle = skin;
  if (carrying || carryingBabies > 0) {
    // arms forward holding
    g.beginPath();
    g.roundRect(-7.5, -19, 4, 9, 2);
    g.roundRect(3.5, -19, 4, 9, 2);
    g.fill();
  } else {
    g.beginPath();
    g.roundRect(-9.5, -21, 3.6, 10 + step * 2, 2);
    g.roundRect(5.9, -21, 3.6, 10 - step * 2, 2);
    g.fill();
  }

  // head
  g.fillStyle = skin;
  g.beginPath();
  g.arc(0, -29, 8.6, 0, Math.PI * 2);
  g.fill();

  // hair
  if (facingUp) {
    g.fillStyle = hair;
    g.beginPath();
    g.arc(0, -29.5, 8.8, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = hair;
    g.beginPath();
    g.arc(0, -31, 8.8, Math.PI * 0.95, Math.PI * 2.05);
    g.quadraticCurveTo(7, -27, 8.4, -25);
    g.lineTo(-8.4, -25);
    g.quadraticCurveTo(-7, -27, -8.6, -28);
    g.closePath();
    g.fill();
  }
  if (who === 'scarlett') {
    // pigtails
    g.fillStyle = hairDark;
    g.beginPath();
    g.ellipse(-9.6, -26, 3.2, 4.6, 0.3, 0, Math.PI * 2);
    g.ellipse(9.6, -26, 3.2, 4.6, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d4566a';
    g.beginPath();
    g.arc(-8.8, -29.4, 1.5, 0, Math.PI * 2);
    g.arc(8.8, -29.4, 1.5, 0, Math.PI * 2);
    g.fill();
  } else {
    // shoulder bob
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(-8, -25.5, 3, 5.5, 0.15, 0, Math.PI * 2);
    g.ellipse(8, -25.5, 3, 5.5, -0.15, 0, Math.PI * 2);
    g.fill();
  }

  // face
  if (!facingUp) {
    const ex = facingSide ? 3 : 0;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(-3 + ex, -29, 2.1, 0, Math.PI * 2);
    if (!facingSide) g.arc(3, -29, 2.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = eyes;
    g.beginPath();
    g.arc(-3 + ex, -29, 1.5, 0, Math.PI * 2);
    if (!facingSide) g.arc(3, -29, 1.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c1a18';
    g.beginPath();
    g.arc(-3 + ex + 0.4, -29, 0.7, 0, Math.PI * 2);
    if (!facingSide) g.arc(3.4, -29, 0.7, 0, Math.PI * 2);
    g.fill();
    // smile + cheeks
    g.strokeStyle = '#c4886a';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(facingSide ? 3.4 : 0, -26.4, 2, 0.25, Math.PI - 0.25);
    g.stroke();
    g.fillStyle = 'rgba(240,150,140,0.4)';
    g.beginPath();
    g.ellipse(-5.4 + ex, -26.5, 1.8, 1.1, 0, 0, Math.PI * 2);
    if (!facingSide) g.ellipse(5.4, -26.5, 1.8, 1.1, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.restore();

  // carried animal rides in front
  if (carrying) {
    g.save();
    g.translate(facingSide ? side * 6 : 0, -17 - bob);
    g.scale(0.62, 0.62);
    drawCritter(g, carrying, 'held', now);
    g.restore();
  } else if (carryingBabies > 0) {
    // a basket of babies!
    g.save();
    g.translate(0, -15 - bob);
    g.fillStyle = '#c9a474';
    g.beginPath();
    g.ellipse(0, 0, 9, 4.4, 0, 0, Math.PI);
    g.fill();
    g.strokeStyle = '#a8845a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < carryingBabies && i < 3; i++) {
      g.fillStyle = ['#e8c89a', '#9a8a78', '#e0a85c'][i];
      g.beginPath();
      g.arc(-5 + i * 5, -2.4 + Math.sin(now * 4 + i) * 0.8, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

function drawNpc(g: CanvasRenderingContext2D, kind: 'owner' | 'ranger', now: number) {
  const bob = Math.sin(now * 2) * 0.6;
  g.fillStyle = 'rgba(40,60,35,0.25)';
  g.beginPath();
  g.ellipse(0, 0, 9, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(0, -bob);
  // simple grown-up: long coat
  g.fillStyle = kind === 'ranger' ? '#6e8a5d' : '#b97a9a';
  g.beginPath();
  g.roundRect(-8, -26, 16, 26, 5);
  g.fill();
  g.fillStyle = '#f2cfae';
  g.beginPath();
  g.arc(0, -33, 8, 0, Math.PI * 2);
  g.fill();
  if (kind === 'ranger') {
    g.fillStyle = '#8a6444';
    g.beginPath();
    g.ellipse(0, -38, 10.5, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, -39, 6, Math.PI, 0);
    g.fill();
  } else {
    g.fillStyle = '#a8a4ac';
    g.beginPath();
    g.arc(0, -35.5, 8.2, Math.PI * 0.9, Math.PI * 2.1);
    g.fill();
    g.beginPath();
    g.ellipse(0, -40, 5.5, 3.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#3a342c';
  g.beginPath();
  g.arc(-2.8, -33, 1.1, 0, Math.PI * 2);
  g.arc(2.8, -33, 1.1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// =====================================================================================
// animals — every one unique
// =====================================================================================

export function drawCritter(
  g: CanvasRenderingContext2D,
  ch: AnimalCharacter,
  pose: 'idle' | 'walk' | 'alert' | 'sleep' | 'sit' | 'held',
  now: number
) {
  const sp = SPECIES_BY_ID[ch.species];
  const a = ch.appearance;
  const scale = (ch.baby ? 0.55 : 1) * a.size * sp.size;
  g.save();
  g.scale(scale, scale);

  if (sp.id === 'parrot' || sp.id === 'duck' || sp.id === 'owl') drawBirdie(g, ch, pose, now);
  else if (sp.id === 'turtle') drawTurtle(g, ch, pose, now);
  else if (sp.id === 'hedgehog') drawHedgehog(g, ch, pose, now);
  else drawQuadruped(g, ch, pose, now);

  g.restore();
}

function patternOverlay(g: CanvasRenderingContext2D, ch: AnimalCharacter, bodyW: number, bodyH: number, cy: number) {
  const a = ch.appearance;
  const seed = ch.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rr = (i: number) => h2(seed, i, 17);
  switch (a.pattern) {
    case 'tabby': {
      g.strokeStyle = a.marks;
      g.lineWidth = 2.6;
      for (let i = 0; i < 4; i++) {
        const x = -bodyW * 0.34 + (i * bodyW * 0.22);
        g.beginPath();
        g.moveTo(x, cy - bodyH * 0.48);
        g.quadraticCurveTo(x + 2, cy - bodyH * 0.1, x - 1.4, cy + bodyH * 0.22);
        g.stroke();
      }
      break;
    }
    case 'spots': {
      g.fillStyle = a.pattern === 'spots' && ch.species === 'fawn' ? '#f2e8d4' : a.marks;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.arc((rr(i) - 0.5) * bodyW * 0.8, cy - bodyH * 0.3 + rr(i + 9) * bodyH * 0.55, 1.7 + rr(i + 20) * 1.3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'patches':
    case 'calico':
    case 'tortie':
    case 'van': {
      const colors = a.pattern === 'calico' ? ['#e08b3c', '#2e2b2e'] : [a.marks];
      const count = a.pattern === 'tortie' ? 8 : a.pattern === 'van' ? 1 : 4;
      for (let i = 0; i < count; i++) {
        g.fillStyle = colors[i % colors.length];
        g.beginPath();
        g.ellipse(
          (rr(i + 2) - 0.5) * bodyW * 0.75,
          cy - bodyH * 0.25 + rr(i + 11) * bodyH * 0.45,
          2.6 + rr(i + 31) * (a.pattern === 'tortie' ? 2.4 : 4),
          2 + rr(i + 41) * 2.6,
          rr(i + 51) * 3,
          0,
          Math.PI * 2
        );
        g.fill();
      }
      break;
    }
    default:
      break;
  }
}

function drawQuadruped(g: CanvasRenderingContext2D, ch: AnimalCharacter, pose: string, now: number) {
  const sp = SPECIES_BY_ID[ch.species];
  const a = ch.appearance;
  const L = 24; // body length
  const Hh = ch.species === 'pony' ? 13 : 10; // body height
  const legH = ch.species === 'pony' || ch.species === 'fawn' ? 9 : 5.5;
  const cy = -legH - Hh * 0.7;
  const step = pose === 'walk' ? Math.sin(now * 9) : 0;
  const sleeping = pose === 'sleep';
  const sitting = pose === 'sit';

  if (pose !== 'held') {
    g.fillStyle = 'rgba(40,60,35,0.22)';
    g.beginPath();
    g.ellipse(0, 0, L * 0.55, 3.6, 0, 0, Math.PI * 2);
    g.fill();
  }

  if (sleeping) {
    // curled up — a fluffy circle with tail wrapped
    g.fillStyle = a.base;
    g.beginPath();
    g.arc(0, -7, 11, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = a.marks;
    g.lineWidth = 3.4;
    g.beginPath();
    g.arc(0, -7, 8.6, Math.PI * 0.3, Math.PI * 1.2);
    g.stroke();
    // head tucked
    g.fillStyle = a.base;
    g.beginPath();
    g.arc(5, -5, 6, 0, Math.PI * 2);
    g.fill();
    earsFor(g, ch, 5, -9, 0.8);
    g.strokeStyle = '#3a3026';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(6.5, -5.5, 1.6, 0.2, Math.PI - 0.2);
    g.stroke();
    return;
  }

  // tail
  drawTail(g, ch, -L * 0.48, cy - Hh * 0.2, now, pose);

  // far legs
  g.fillStyle = tint(a.pattern === 'socks' || a.pattern === 'tuxedo' ? a.base : a.base, -22);
  legPair(g, ch, -L * 0.3, -step, legH, true, sitting);
  legPair(g, ch, L * 0.26, step, legH, true, sitting);

  // body capsule
  g.fillStyle = a.base;
  g.beginPath();
  g.ellipse(0, cy, L * 0.5, Hh * 0.62, sitting ? -0.25 : 0, 0, Math.PI * 2);
  g.fill();
  if (a.fluffy) {
    g.fillStyle = a.base;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(-L * 0.4 + i * L * 0.2, cy - Hh * 0.45, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // belly
  g.fillStyle = a.pattern === 'tuxedo' ? '#f6f3ea' : a.belly;
  g.beginPath();
  g.ellipse(L * 0.04, cy + Hh * 0.26, L * 0.34, Hh * 0.3, 0, 0, Math.PI * 2);
  g.fill();

  // coat pattern
  g.save();
  g.beginPath();
  g.ellipse(0, cy, L * 0.5, Hh * 0.62, 0, 0, Math.PI * 2);
  g.clip();
  patternOverlay(g, ch, L, Hh * 1.4, cy);
  // points: darker rump
  if (a.pattern === 'points') {
    g.fillStyle = a.marks;
    g.beginPath();
    g.ellipse(-L * 0.42, cy, L * 0.2, Hh * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // pony/fawn mane
  if (ch.species === 'pony') {
    g.fillStyle = a.marks;
    g.beginPath();
    g.ellipse(L * 0.26, cy - Hh * 0.55, L * 0.16, Hh * 0.34, -0.5, 0, Math.PI * 2);
    g.fill();
  }

  // near legs
  g.fillStyle = a.pattern === 'socks' || a.pattern === 'tuxedo' ? '#f6f3ea' : a.base;
  legPair(g, ch, -L * 0.3, step, legH, false, sitting);
  legPair(g, ch, L * 0.26, -step, legH, false, sitting);

  // head
  const hx = L * 0.45;
  const hy = cy - Hh * (pose === 'alert' ? 0.85 : 0.62);
  const hr = ch.species === 'pony' ? 7.5 : 8;
  // neck for pony/fawn/goat
  if (ch.species === 'pony' || ch.species === 'fawn' || ch.species === 'goat') {
    g.fillStyle = a.base;
    g.beginPath();
    g.moveTo(L * 0.3, cy);
    g.lineTo(hx + 2, hy + 2);
    g.lineTo(hx + 6, hy + 6);
    g.lineTo(L * 0.42, cy + Hh * 0.3);
    g.closePath();
    g.fill();
  }
  g.fillStyle = a.pattern === 'points' ? a.base : a.base;
  g.beginPath();
  g.arc(hx, hy, hr, 0, Math.PI * 2);
  g.fill();
  if (a.fluffy) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(hx - hr * 0.6 + i * hr * 0.6, hy - hr * 0.75, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // face mask for points / tuxedo blaze
  if (a.pattern === 'points') {
    g.fillStyle = a.marks;
    g.beginPath();
    g.ellipse(hx + hr * 0.45, hy + hr * 0.15, hr * 0.5, hr * 0.42, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (a.pattern === 'tuxedo' || a.pattern === 'van') {
    g.fillStyle = a.pattern === 'van' ? a.marks : '#f6f3ea';
    g.beginPath();
    if (a.pattern === 'van') g.arc(hx, hy - hr * 0.35, hr * 0.62, Math.PI, 0);
    else g.ellipse(hx + hr * 0.4, hy + hr * 0.3, hr * 0.5, hr * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  }
  // tabby forehead M
  if (a.pattern === 'tabby') {
    g.strokeStyle = a.marks;
    g.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(hx + i * 2.4, hy - hr * 0.95);
      g.lineTo(hx + i * 2.4 + i, hy - hr * 0.45);
      g.stroke();
    }
  }

  earsFor(g, ch, hx, hy - hr * 0.7, 1);

  // muzzle / snout
  if (ch.species === 'dog' || ch.species === 'fox' || ch.species === 'fawn' || ch.species === 'goat' || ch.species === 'pony') {
    g.fillStyle = ch.species === 'fox' ? a.belly : tint(a.belly, 6);
    g.beginPath();
    g.ellipse(hx + hr * 0.75, hy + hr * 0.25, hr * 0.45, hr * 0.32, 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a3026';
    g.beginPath();
    g.ellipse(hx + hr * 1.1, hy + hr * 0.14, 1.7, 1.3, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    // little cat/rabbit nose
    g.fillStyle = '#e89a9a';
    g.beginPath();
    g.moveTo(hx + hr * 0.55, hy + hr * 0.18);
    g.lineTo(hx + hr * 0.85, hy + hr * 0.18);
    g.lineTo(hx + hr * 0.7, hy + hr * 0.38);
    g.closePath();
    g.fill();
    // whiskers
    g.strokeStyle = 'rgba(60,50,40,0.45)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(hx + hr * 0.8, hy + hr * (0.2 + i * 0.14));
      g.lineTo(hx + hr * 1.5, hy + hr * (0.08 + i * 0.22));
      g.stroke();
    }
  }

  // eye(s)
  const eyeY = hy - hr * 0.12;
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(hx + hr * 0.22, eyeY, 2.6, 2.9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = a.eye;
  g.beginPath();
  g.arc(hx + hr * 0.3, eyeY, 1.9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1c1a18';
  g.beginPath();
  g.arc(hx + hr * 0.34, eyeY, 1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(hx + hr * 0.4, eyeY - 0.8, 0.55, 0, Math.PI * 2);
  g.fill();

  // pregnant tummy hint (round + a tiny extra shine)
  if (ch.pregnant) {
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(0, cy + Hh * 0.3, L * 0.28, Hh * 0.22, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function legPair(g: CanvasRenderingContext2D, ch: AnimalCharacter, x: number, step: number, legH: number, far: boolean, sitting: boolean) {
  if (sitting && x < 0) {
    // haunch
    const a = ch.appearance;
    g.fillStyle = far ? tint(a.base, -22) : a.base;
    g.beginPath();
    g.ellipse(x, -legH - 2, 6, 7, 0, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const off = far ? 1.6 : 0;
  g.beginPath();
  g.roundRect(x - 2 + off + step * 2, -legH, 4, legH + 0.5, 2);
  g.fill();
}

function earsFor(g: CanvasRenderingContext2D, ch: AnimalCharacter, x: number, y: number, s: number) {
  const a = ch.appearance;
  const earColor = a.pattern === 'points' ? a.marks : a.base;
  const inner = '#e8a8a8';
  g.fillStyle = earColor;
  switch (ch.species) {
    case 'cat':
    case 'fox': {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + sx * 5.5 * s - 2.5 * s, y + 2 * s);
        g.lineTo(x + sx * 6.5 * s, y - 6.5 * s);
        g.lineTo(x + sx * 5.5 * s + 2.8 * s, y + 2.4 * s);
        g.closePath();
        g.fill();
      }
      g.fillStyle = inner;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + sx * 5.5 * s - 1 * s, y + 1.4 * s);
        g.lineTo(x + sx * 6.2 * s, y - 4 * s);
        g.lineTo(x + sx * 5.5 * s + 1.3 * s, y + 1.7 * s);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'dog': {
      if (a.earFlop) {
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.ellipse(x + sx * 6 * s, y + 2 * s, 3 * s, 5.5 * s, sx * 0.4, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.moveTo(x + sx * 5 * s - 2.6 * s, y + 2 * s);
          g.lineTo(x + sx * 6 * s, y - 5.5 * s);
          g.lineTo(x + sx * 5 * s + 2.8 * s, y + 2.4 * s);
          g.closePath();
          g.fill();
        }
      }
      break;
    }
    case 'rabbit': {
      for (const sx of [-1, 1]) {
        g.save();
        g.translate(x + sx * 3.4 * s, y);
        g.rotate(a.earFlop ? sx * 1.15 : sx * 0.15);
        g.fillStyle = earColor;
        g.beginPath();
        g.ellipse(0, -7 * s, 2.6 * s, 8 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = inner;
        g.beginPath();
        g.ellipse(0, -7 * s, 1.2 * s, 5.5 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      break;
    }
    case 'goat': {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(x + sx * 6.5 * s, y + 2 * s, 4 * s, 2 * s, sx * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      // little horns
      g.fillStyle = '#c9b48a';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + sx * 2.5 * s, y - 1 * s);
        g.quadraticCurveTo(x + sx * 4 * s, y - 7 * s, x + sx * 1.6 * s, y - 6 * s);
        g.lineTo(x + sx * 0.8 * s, y - 1 * s);
        g.fill();
      }
      break;
    }
    case 'pony':
    case 'fawn': {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(x + sx * 5 * s, y, 2 * s, 4 * s, sx * 0.35, 0, Math.PI * 2);
        g.fill();
      }
      if (ch.species === 'pony') {
        g.fillStyle = ch.appearance.marks;
        g.beginPath();
        g.ellipse(x - 1 * s, y - 2.5 * s, 3.4 * s, 2.2 * s, -0.4, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'hamster': {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(x + sx * 5 * s, y, 2.8 * s, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
  }
}

function drawTail(g: CanvasRenderingContext2D, ch: AnimalCharacter, x: number, y: number, now: number, pose: string) {
  const a = ch.appearance;
  const sway = Math.sin(now * (pose === 'alert' ? 8 : 2.4)) * 0.3;
  const tailColor = a.pattern === 'points' || a.pattern === 'van' ? a.marks : a.base;
  g.strokeStyle = tailColor;
  switch (ch.species) {
    case 'cat': {
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 8, y - 4, x - 9 + sway * 4, y - 13 - sway * 3);
      g.stroke();
      if (a.pattern === 'tabby') {
        g.strokeStyle = a.marks;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x - 6.5, y - 6);
        g.lineTo(x - 4.5, y - 7.6);
        g.moveTo(x - 8, y - 9.5);
        g.lineTo(x - 6, y - 11);
        g.stroke();
      }
      g.lineCap = 'butt';
      break;
    }
    case 'dog': {
      g.lineWidth = 3.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x - 6, y - 6, x - 4 + sway * 6, y - 11);
      g.stroke();
      g.lineCap = 'butt';
      break;
    }
    case 'rabbit':
    case 'fawn': {
      g.fillStyle = ch.species === 'rabbit' ? '#f6f3ea' : a.belly;
      g.beginPath();
      g.arc(x - 1, y - 1, 3.2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'fox': {
      // glorious bushy tail
      g.fillStyle = a.base;
      g.beginPath();
      g.ellipse(x - 7, y - 3 + sway * 2, 8.5, 4.6, -0.5 + sway * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f3e6d4';
      g.beginPath();
      g.ellipse(x - 12.5, y - 7 + sway * 2.6, 3.4, 2.6, -0.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'pony': {
      g.fillStyle = a.marks;
      g.beginPath();
      g.moveTo(x, y - 3);
      g.quadraticCurveTo(x - 7 + sway * 4, y + 2, x - 5 + sway * 5, y + 9);
      g.quadraticCurveTo(x - 2, y + 4, x + 1, y + 1);
      g.closePath();
      g.fill();
      break;
    }
    case 'goat':
    case 'hamster': {
      g.fillStyle = a.base;
      g.beginPath();
      g.arc(x - 1, y - 2, 2.2, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}

function drawBirdie(g: CanvasRenderingContext2D, ch: AnimalCharacter, pose: string, now: number) {
  const a = ch.appearance;
  const isOwl = ch.species === 'owl';
  const isDuck = ch.species === 'duck';
  const bob = pose === 'walk' ? Math.abs(Math.sin(now * 9)) * 1.4 : 0;
  g.fillStyle = 'rgba(40,60,35,0.22)';
  g.beginPath();
  g.ellipse(0, 0, 8, 2.8, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(0, -bob);
  // legs
  if (!isOwl) {
    g.strokeStyle = '#e0a23a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-2, -4);
    g.lineTo(-2, 0);
    g.moveTo(2, -4);
    g.lineTo(2, 0);
    g.stroke();
  }
  // body
  g.fillStyle = a.base;
  g.beginPath();
  g.ellipse(0, isOwl ? -8 : -7.5, isOwl ? 7.5 : 6.5, isOwl ? 9 : 7, 0, 0, Math.PI * 2);
  g.fill();
  // belly
  g.fillStyle = a.belly;
  g.beginPath();
  g.ellipse(1, isOwl ? -6.5 : -6, 4, isOwl ? 6 : 4.6, 0, 0, Math.PI * 2);
  g.fill();
  if (a.pattern === 'spots') {
    g.fillStyle = a.marks;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(-2 + (i % 3) * 2.6, -10 + Math.floor(i / 3) * 3, 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  // wing
  g.fillStyle = a.marks;
  g.beginPath();
  g.ellipse(-2.5, -8, 3.4, 5, 0.3, 0, Math.PI * 2);
  g.fill();
  // tail
  if (ch.species === 'parrot') {
    g.fillStyle = a.marks;
    g.beginPath();
    g.moveTo(-5, -6);
    g.lineTo(-12, -2);
    g.lineTo(-5, -3.4);
    g.closePath();
    g.fill();
  }
  // head
  const hy = isOwl ? -16 : -13.5;
  g.fillStyle = a.base;
  g.beginPath();
  g.arc(2, hy, isOwl ? 6.5 : 5, 0, Math.PI * 2);
  g.fill();
  if (isOwl) {
    // facial disk + tufts
    g.fillStyle = a.belly;
    g.beginPath();
    g.ellipse(3, hy + 0.5, 4.6, 3.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.base;
    g.beginPath();
    g.moveTo(-2.5, hy - 4);
    g.lineTo(-1, hy - 8.5);
    g.lineTo(0.8, hy - 4.6);
    g.moveTo(6, hy - 4.4);
    g.lineTo(7.6, hy - 8.5);
    g.lineTo(9, hy - 3.6);
    g.fill();
    g.fillStyle = a.eye;
    g.beginPath();
    g.arc(0.8, hy, 2, 0, Math.PI * 2);
    g.arc(5.6, hy, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c1a18';
    g.beginPath();
    g.arc(1, hy, 1, 0, Math.PI * 2);
    g.arc(5.8, hy, 1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0a23a';
    g.beginPath();
    g.moveTo(2.4, hy + 1.4);
    g.lineTo(4.2, hy + 1.4);
    g.lineTo(3.3, hy + 3.6);
    g.closePath();
    g.fill();
  } else {
    // eye
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(3.4, hy - 0.6, 1.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c1a18';
    g.beginPath();
    g.arc(3.8, hy - 0.6, 1.1, 0, Math.PI * 2);
    g.fill();
    // beak
    g.fillStyle = isDuck ? '#e8923a' : '#e0a23a';
    if (isDuck) {
      g.beginPath();
      g.ellipse(7.5, hy + 0.8, 3, 1.6, 0.1, 0, Math.PI * 2);
      g.fill();
    } else {
      // parrot hook
      g.beginPath();
      g.moveTo(6.4, hy - 1.6);
      g.quadraticCurveTo(10, hy - 0.5, 7.2, hy + 2.4);
      g.quadraticCurveTo(6.6, hy + 0.5, 6.4, hy - 1.6);
      g.fill();
    }
  }
  g.restore();
}

function drawTurtle(g: CanvasRenderingContext2D, ch: AnimalCharacter, pose: string, now: number) {
  const a = ch.appearance;
  const step = pose === 'walk' ? Math.sin(now * 6) : 0;
  g.fillStyle = 'rgba(40,60,35,0.22)';
  g.beginPath();
  g.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
  g.fill();
  // legs
  g.fillStyle = '#9aa860';
  for (const [lx, lp] of [[-7, step], [6, -step]] as const) {
    g.beginPath();
    g.ellipse(lx + lp * 1.4, -1.4, 2.6, 1.8, 0, 0, Math.PI * 2);
    g.fill();
  }
  // shell
  g.fillStyle = a.base;
  g.beginPath();
  g.ellipse(0, -6, 9.5, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = tint(a.base, -26);
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(0, -6, 6.5, 4.6, 0, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(-6 + i * 6, -10.5);
    g.lineTo(-4.5 + i * 4.5, -2);
    g.stroke();
  }
  if (a.pattern === 'spots') {
    g.fillStyle = a.belly;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-4 + (i % 2) * 7, -8 + Math.floor(i / 2) * 4, 1.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // head
  g.fillStyle = '#9aa860';
  g.beginPath();
  g.arc(10.5, -7, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1c1a18';
  g.beginPath();
  g.arc(11.6, -7.8, 0.9, 0, Math.PI * 2);
  g.fill();
}

function drawHedgehog(g: CanvasRenderingContext2D, ch: AnimalCharacter, pose: string, now: number) {
  const a = ch.appearance;
  const bob = pose === 'walk' ? Math.abs(Math.sin(now * 10)) : 0;
  g.fillStyle = 'rgba(40,60,35,0.22)';
  g.beginPath();
  g.ellipse(0, 0, 8, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(0, -bob);
  // spiky back
  g.fillStyle = a.marks;
  g.beginPath();
  g.arc(-1, -7, 8, Math.PI * 0.85, Math.PI * 2.05);
  g.closePath();
  g.fill();
  for (let i = 0; i < 7; i++) {
    const ang = Math.PI * 0.95 + (i / 7) * Math.PI * 1.05;
    g.beginPath();
    g.moveTo(-1 + Math.cos(ang) * 6.5, -7 + Math.sin(ang) * 6.5);
    g.lineTo(-1 + Math.cos(ang) * 10.5, -7 + Math.sin(ang) * 10.5);
    g.lineTo(-1 + Math.cos(ang + 0.22) * 6.5, -7 + Math.sin(ang + 0.22) * 6.5);
    g.closePath();
    g.fill();
  }
  // face
  g.fillStyle = a.belly;
  g.beginPath();
  g.ellipse(5, -4.5, 5.5, 4.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a3026';
  g.beginPath();
  g.arc(10, -4, 1.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1c1a18';
  g.beginPath();
  g.arc(6, -6, 1.1, 0, Math.PI * 2);
  g.fill();
  // tiny feet
  g.fillStyle = a.belly;
  g.beginPath();
  g.ellipse(-3, -0.6, 2, 1.3, 0, 0, Math.PI * 2);
  g.ellipse(4, -0.6, 2, 1.3, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawHeart(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.65);
  g.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.5, y - s, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.3, x, y + s * 0.65);
  g.fill();
}

// =====================================================================================
// portrait painters for the UI
// =====================================================================================

export function paintAnimalPortrait(cv: HTMLCanvasElement, ch: AnimalCharacter, pose: 'idle' | 'sit' | 'sleep' = 'sit') {
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, cv.width, cv.height);
  const sp = SPECIES_BY_ID[ch.species];
  const scale = (cv.width / 64) * (1 / Math.max(0.9, sp.size * ch.appearance.size * (ch.baby ? 0.7 : 1)));
  g.save();
  g.translate(cv.width / 2 - 4 * scale, cv.height * 0.86);
  g.scale(scale, scale);
  drawCritter(g, ch, pose, 0.6);
  g.restore();
}

export function paintKidPortrait(cv: HTMLCanvasElement, who: 'scarlett' | 'lennon') {
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, cv.width, cv.height);
  const scale = cv.width / 46;
  g.save();
  g.translate(cv.width / 2, cv.height * 0.92);
  g.scale(scale, scale);
  drawKid(g, who, { dir: 'down', moving: false, walkT: 0 }, null, 0, 0.4);
  g.restore();
}

const FLOWER_PETALS_EXPORT = FLOWER_PETALS;
export { FLOWER_PETALS_EXPORT as FLOWER_COLORS };
