// Soccer bots. Deterministic: decisions come from the state and the tick, never
// Math.random, so a bot game replays the same and online guests never disagree.
//
// Each side keeps to its box, so a bot is a keeper and a striker in one: when the ball
// is coming, get in its path in front of the goal (and dive at a hard one); when it's
// loose in the box, go and get it; with it at your feet, line up and pick a kick.
// Tiers change how quick, how sharp and how varied.

import type { BotTier } from '../pickleball/bot';
import {
  HALF_LENGTH, IDLE, KICK_R, ZONE_DEPTH, ZONE_HALF, crossing, inZone, mateOf, sgn,
  type GameState, type PlayerInput, type Shot,
} from './sim';

const TIER = {
  chill: { pace: 0.6, think: 40, dive: 0.15, read: 0.45, aim: 0.45, tricks: 0.15, hold: 70 },
  club: { pace: 0.8, think: 22, dive: 0.4, read: 0.75, aim: 0.7, tricks: 0.35, hold: 45 },
  champ: { pace: 1, think: 8, dive: 0.75, read: 1, aim: 0.95, tricks: 0.6, hold: 25 },
} satisfies Record<BotTier, { pace: number; think: number; dive: number; read: number; aim: number; tricks: number; hold: number }>;

/** a deterministic 0..1 from the tick and the seat, steady across a few ticks */
function noise(state: GameState, i: number, every: number, salt = 0): number {
  const k = Math.floor(state.tick / every) * 31 + i * 977 + state.seed + salt * 131;
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** run toward (x, z), as a local stick input */
function toward(state: GameState, i: number, x: number, z: number, pace: number): PlayerInput {
  const p = state.players[i];
  const s = sgn(p.team);
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) return { ...IDLE };
  const k = Math.min(1, d / 2.5) * pace;
  return { mx: (dx / d) * s * k, mz: (-dz / d) * s * k, swing: false };
}

function pickKick(state: GameState, i: number, tier: (typeof TIER)[BotTier]): Shot {
  const ax = (noise(state, i, 11, 1) * 2 - 1) * tier.aim;
  const r = noise(state, i, 13, 2);
  if (r < tier.tricks * 0.35) return { act: 'pass', ax: ax >= 0 ? 1 : -1, az: 0 }; // bank
  if (r < tier.tricks * 0.65) return { act: 'jump', ax, az: 1 }; // lob
  if (r < tier.tricks) return { act: 'jump', ax, az: -1 }; // rocket
  return r < 0.7 ? { act: 'jump', ax, az: 0 } : { act: 'pass', ax: 0, az: 0 }; // shot or drive
}

export function botInput(state: GameState, i: number, opts: { tier: BotTier; humans: number[] }): PlayerInput {
  const tier = TIER[opts.tier] ?? TIER.club;
  const p = state.players[i];
  const b = state.ball;
  const s = sgn(p.team);
  const goalLine = s * (HALF_LENGTH - 3);
  if (state.phase === 'point' || state.phase === 'over' || p.down > 0) return { ...IDLE };
  const thinking = state.tick % tier.think === i % tier.think;

  // serving, or the ball at my feet: settle, line up, kick
  if (state.owner === i) {
    const wait = state.phase === 'serve' ? 100 : tier.hold;
    if (state.held > wait && thinking) return { mx: 0, mz: 0, swing: true, shot: pickKick(state, i, tier) };
    // drift toward the middle of the box front, for a straighter look at goal
    return toward(state, i, p.x * 0.6, s * (HALF_LENGTH - ZONE_DEPTH + 2), tier.pace * 0.6);
  }
  if (state.phase === 'serve') return toward(state, i, p.x, goalLine, tier.pace * 0.5);

  const mate = mateOf(state, i);
  const coming = b.vz * s > 3;
  // the ball is in my box (or about to be) and slow enough to fetch
  const loose = state.owner === -1 && inZone(p.team, b.x, b.z, 1) && Math.hypot(b.vx, b.vz) < 26;
  if (loose) {
    const dMe = Math.hypot(b.x - p.x, b.z - p.z);
    const dMate = mate >= 0 ? Math.hypot(b.x - state.players[mate].x, b.z - state.players[mate].z) : Infinity;
    if (dMe <= dMate + 1) {
      // in reach and moving: strike it first time sometimes
      if (dMe < KICK_R && Math.hypot(b.vx, b.vz) > 8 && thinking && noise(state, i, 17, 3) < tier.tricks) {
        return { mx: 0, mz: 0, swing: true, shot: pickKick(state, i, tier) };
      }
      return toward(state, i, b.x + b.vx * 0.2, b.z + b.vz * 0.2 + s * 0.8, tier.pace);
    }
  }

  // keep goal: stand where the ball will cross my line, between it and the goal
  if (coming) {
    const c = crossing(b, p.z);
    const guess = c ? c.x : b.x;
    // a slower read leaves you leaning toward the middle
    const x = guess * tier.read;
    // a hard shot I can't reach in time: dive at it
    if (c && c.t < 0.45 && Math.abs(c.x - p.x) > 1.8 && Math.abs(c.x - p.x) < 9 && Math.hypot(b.vx, b.vz) > 30 && thinking && noise(state, i, 19, 4) < tier.dive) {
      return { mx: 0, mz: 0, swing: true, shot: { act: 'dive', ax: 0, az: -1 } };
    }
    // in doubles, one guards the line and one steps up
    const deep = mate < 0 || i < mate;
    const z = deep ? goalLine : s * (HALF_LENGTH - ZONE_DEPTH + 3);
    return toward(state, i, Math.max(-ZONE_HALF, Math.min(ZONE_HALF, deep ? x : x * 0.6)), z, tier.pace);
  }

  // the ball's at their end: get set in front of goal, shading toward it
  const deep = mate < 0 || i < mate;
  return toward(state, i, b.x * 0.25 + (deep ? 0 : (i % 2 ? 5 : -5)), deep ? s * (HALF_LENGTH - 5) : s * (HALF_LENGTH - ZONE_DEPTH + 4), tier.pace * 0.7);
}
