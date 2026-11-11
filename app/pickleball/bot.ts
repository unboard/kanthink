// Pickleball — practice bot. A pure function of the game state that returns the same
// PlayerInput a keyboard would, so the bot plays through the exact same sim rules.
// Deterministic: its "personality" comes from hashing the seed and rally counters.

import {
  BALL_R, GRAVITY, HALF_LENGTH, HALF_WIDTH, KITCHEN, REACH, SWING_SWEET,
  sgn, sideOfZ, timeToGround, type GameState, type PlayerInput, type Side,
} from './sim';

function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    // murmur3 finalizer so neighboring inputs land far apart
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

function toward(d: number, dead: number): number {
  return d > dead ? 1 : d < -dead ? -1 : 0;
}

export function botInput(state: GameState, side: Side): PlayerInput {
  const p = state.players[side];
  const s = sgn(side);
  const b = state.ball;
  const shotKey = hash(state.seed, state.pointSeq, state.hits, side);

  // choose this shot's flavor once per shot (stable across ticks)
  const mzPick = shotKey < 0.14 ? 1 : shotKey > 0.86 ? -1 : 0;
  const mxPick = shotKey * 7 % 1 < 0.33 ? -1 : shotKey * 7 % 1 > 0.66 ? 1 : 0;

  if (state.phase === 'serve') {
    if (state.server !== side) return { mx: 0, mz: 0, swing: false };
    const wait = 70 + Math.floor(hash(state.seed, state.pointSeq, 99) * 50);
    return { mx: mxPick, mz: 0, swing: state.phaseTicks === wait };
  }
  if (state.phase !== 'rally') return { mx: 0, mz: 0, swing: false };

  const incoming = state.lastHitter !== side && state.lastHitter !== -1;
  let tx: number;
  let tz: number;
  let swing = false;

  if (incoming) {
    // where will it land, and where will it be a beat after the bounce?
    let lx = b.x;
    let lz = b.z;
    if (state.bounces === 0) {
      const t = timeToGround(b);
      lx = b.x + b.vx * t;
      lz = b.z + b.vz * t;
    }
    const willBeOut = state.bounces === 0 && state.hits > 1 &&
      (Math.abs(lx) > HALF_WIDTH + 0.6 || Math.abs(lz) > HALF_LENGTH + 0.6);
    if (willBeOut && sideOfZ(lz) === side) {
      // smart leave: step aside and let it go out
      return { mx: toward((p.x - lx) * s, 0.2) || 1, mz: 0, swing: false };
    }
    const after = state.bounces === 0 ? 0.42 : 0.12;
    tx = lx + b.vx * 0.86 * after;
    tz = lz + b.vz * 0.86 * after;
    const zAbs = Math.max(KITCHEN + 1.2, Math.min(27, Math.abs(tz)));
    tz = s * zAbs;

    // swing when the ball will be in reach a sweet-spot beat from now
    // now and then the bot just misjudges it and never swings
    const whiff = hash(state.seed, state.pointSeq, state.hits, 11) < 0.07;
    if (!whiff && state.bounces >= 1 && sideOfZ(b.z) === side && p.swingT < 0) {
      const sloppy = hash(state.seed, state.pointSeq, state.hits, 7) < 0.22;
      const jitter = Math.floor((hash(state.seed, state.pointSeq, state.hits, 3) - 0.5) * (sloppy ? 44 : 16));
      const ahead = Math.max(2, SWING_SWEET + jitter) / 120;
      const ax = b.x + b.vx * ahead;
      const az = b.z + b.vz * ahead;
      const ay = b.y + b.vy * ahead - 0.5 * GRAVITY * ahead * ahead;
      const dx = ax - p.x;
      const dz = az - p.z;
      if (dx * dx + dz * dz < REACH * REACH * 0.8 && ay > BALL_R - 0.5) swing = true;
    }
  } else {
    // recover: shade toward the ball, stay deep enough to let the return bounce
    tx = b.x * 0.35;
    tz = s * (state.hits <= 2 ? 21 : 16);
  }

  const dx = tx - p.x;
  const dz = tz - p.z;
  // local axes: right = s * x, up (toward net) = -s * z
  let mx = toward(dx * s, 0.35);
  let mz = toward(-dz * s, 0.5);
  if (swing || (p.swingT >= 0 && !p.swingHit)) {
    mx = mxPick;
    mz = mzPick;
  }
  return { mx, mz, swing };
}
