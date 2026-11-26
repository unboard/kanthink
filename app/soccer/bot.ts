// Soccer bots for the field players (the keepers are played by the simulation itself).
// Deterministic: decisions come from the state and the tick, never Math.random.
//
// With the ball: carry it at goal, and from shooting range pick a finish. A better bot
// picks a better one: it goes for the corners, curls it, chips a keeper who's come out.
// A teammate has it: get open ahead. Loose: the nearer of us goes, the other drops back.
// Theirs: close them down and, when it's on, slide in.

import type { BotTier } from '../pickleball/bot';
import {
  GOAL_HALF, HALF_LENGTH, HALF_WIDTH, IDLE, KICK_R, attackZ, keeperOf, mateOf, sgn, teamPlayers,
  type GameState, type PlayerInput, type Shot,
} from './sim';

const TIER = {
  chill: { pace: 0.62, range: 24, tackle: 0.12, corner: 0.35, tricks: 0.1, think: 32 },
  club: { pace: 0.82, range: 27, tackle: 0.3, corner: 0.7, tricks: 0.3, think: 18 },
  champ: { pace: 1, range: 30, tackle: 0.6, corner: 0.95, tricks: 0.6, think: 7 },
} satisfies Record<BotTier, { pace: number; range: number; tackle: number; corner: number; tricks: number; think: number }>;

function noise(state: GameState, i: number, every: number, salt = 0): number {
  const k = Math.floor(state.tick / every) * 31 + i * 977 + state.seed + salt * 131;
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function toward(state: GameState, i: number, x: number, z: number, pace: number): PlayerInput {
  const p = state.players[i];
  const s = sgn(p.team);
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) return { ...IDLE };
  const k = Math.min(1, d / 2.5) * pace;
  return { mx: (dx / d) * s * k, mz: (-dz / d) * s * k, swing: false };
}

/** the finish: which side, and how */
function finish(state: GameState, i: number, tier: (typeof TIER)[BotTier]): Shot {
  const p = state.players[i];
  const s = sgn(p.team);
  const k = state.players[keeperOf(state, p.team === 0 ? 1 : 0)];
  // the side the keeper isn't, from the shooter's own view
  const keeperSide = k ? Math.sign(k.x * s) : 0;
  const side = keeperSide !== 0 ? -keeperSide : noise(state, i, 9, 1) < 0.5 ? -1 : 1;
  const ax = side * (0.25 + tier.corner * 0.75 * (0.7 + noise(state, i, 7, 2) * 0.3));
  const r = noise(state, i, 13, 3);
  const keeperOut = k ? Math.abs(attackZ(p.team) - k.z) > 4 : false;
  if (keeperOut && r < tier.tricks) return { act: 'jump', ax: 0, az: 1 }; // chip
  if (r < tier.tricks * 0.6) return { act: 'pass', ax: side, az: 0 }; // curler
  if (r < tier.tricks) return { act: 'jump', ax, az: -1 }; // top corner
  return { act: 'jump', ax, az: 0 };
}

export function botInput(state: GameState, i: number, opts: { tier: BotTier; humans: number[] }): PlayerInput {
  const p = state.players[i];
  if (p.keeper) return { ...IDLE };
  const tier = TIER[opts.tier] ?? TIER.club;
  const b = state.ball;
  const s = sgn(p.team);
  const gz = attackZ(p.team);
  const ownGoal = s * HALF_LENGTH;
  if (state.phase === 'point' || state.phase === 'over' || p.down > 0) return { ...IDLE };

  if (state.phase === 'serve') {
    if (i !== state.server || state.phaseTicks < 90) return { ...IDLE };
    return toward(state, i, b.x, b.z + s * 0.4, 0.6);
  }

  const mate = mateOf(state, i);
  const thinking = state.tick % tier.think === i % tier.think;

  if (state.owner === i) {
    const dGoal = Math.hypot(b.x, gz - b.z);
    const opps = teamPlayers(state, p.team === 0 ? 1 : 0).map((k) => state.players[k]);
    const blocked = opps.some((o) => (o.z - p.z) * -s > 0 && (o.z - p.z) * -s < 7 && Math.abs(o.x - p.x) < 3.5);
    if (thinking && dGoal < tier.range * (0.8 + noise(state, i, 40) * 0.25) && Math.abs(b.x) < HALF_WIDTH - 4) {
      return { mx: 0, mz: 0, swing: true, shot: finish(state, i, tier) };
    }
    if (thinking && blocked && mate >= 0 && noise(state, i, 20) < 0.55) return { mx: 0, mz: 0, swing: true, shot: { act: 'pass', ax: 0, az: 0 } };
    // carry it at goal, to a shooting spot off the middle, round anyone in the way
    const lane = (p.x >= 0 ? 1 : -1) * (GOAL_HALF + 2) + (blocked ? (p.x > 0 ? -7 : 7) : 0);
    return toward(state, i, Math.max(-HALF_WIDTH + 4, Math.min(HALF_WIDTH - 4, lane)), gz + s * 10, tier.pace);
  }

  // a keeper has it: ours, spread wide to take the throw; theirs, drop back
  if (state.owner >= 0 && state.players[state.owner].keeper) {
    const ours = state.players[state.owner].team === p.team;
    const side = (i % 2 ? 1 : -1) * (p.x >= 0 ? 1 : -1);
    return ours
      ? toward(state, i, side * 12, ownGoal - s * 18, tier.pace)
      : toward(state, i, p.x * 0.5, -ownGoal * 0.1, tier.pace);
  }

  if (state.owner >= 0 && state.owner === mate) {
    const m = state.players[mate];
    const side = m.x > 0 ? -1 : 1;
    // ahead and across, ready for a one-timer
    return toward(state, i, side * 9, Math.max(-HALF_LENGTH + 10, Math.min(HALF_LENGTH - 10, m.z - s * 10)), tier.pace * 0.9);
  }

  const dMe = Math.hypot(b.x - p.x, b.z - p.z);
  const dMate = mate >= 0 ? Math.hypot(b.x - state.players[mate].x, b.z - state.players[mate].z) : Infinity;
  const chaser = dMe <= dMate + 1.5;
  if (!chaser) return toward(state, i, b.x * 0.4, ownGoal + (b.z - ownGoal) * 0.45, tier.pace);

  const theirs = state.owner >= 0 && state.players[state.owner].team !== p.team && !state.players[state.owner].keeper;
  const settled = state.phaseTicks > 150 || state.touches > 2;
  if (settled && theirs && dMe < 4.2 && thinking && noise(state, i, 30) < tier.tackle) {
    return { mx: 0, mz: 0, swing: true, shot: { act: 'dive', ax: 0, az: -1 } };
  }
  // loose and at my feet facing their goal: hit it first time
  if (state.owner === -1 && dMe < KICK_R && b.y < 3 && thinking && (gz - p.z) * s < 0 && Math.hypot(b.x, gz - b.z) < tier.range && noise(state, i, 15, 5) < tier.tricks + 0.2) {
    return { mx: 0, mz: 0, swing: true, shot: finish(state, i, tier) };
  }
  // the goal side of the ball, then onto it
  return toward(state, i, b.x + b.vx * 0.25, b.z + b.vz * 0.25 + s * 1.2, tier.pace);
}
