// Soccer bots. Deterministic: decisions come from the state and the tick, never
// Math.random, so a bot game replays the same and online guests never disagree.
//
// The plan is the one a kid would give: if you have it, take it to their goal and shoot;
// if your teammate has it, get open ahead of them; if it's loose, the nearer of you goes
// and gets it and the other one minds the goal; if they have it, close them down and
// tackle. Tiers change how quick, how accurate and how bold.

import type { BotTier } from '../pickleball/bot';
import { HALF_LENGTH, HALF_WIDTH, IDLE, KICK_R, attackZ, mateOf, sgn, teamPlayers, type GameState, type PlayerInput } from './sim';

const TIER = {
  // chill and club are for kids and grown-ups messing around: slower than you, shots
  // from closer and nearer the middle, and slow to slide in
  chill: { pace: 0.62, range: 22, tackle: 0.12, aim: 0.4, think: 34 },
  club: { pace: 0.8, range: 28, tackle: 0.3, aim: 0.65, think: 20 },
  champ: { pace: 1, range: 42, tackle: 0.85, aim: 1, think: 6 },
} satisfies Record<BotTier, { pace: number; range: number; tackle: number; aim: number; think: number }>;

/** a deterministic 0..1 from the tick and the seat, steady across a few ticks */
function noise(state: GameState, i: number, every: number): number {
  const k = Math.floor(state.tick / every) * 31 + i * 977 + state.seed;
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
  if (d < 0.8) return { ...IDLE };
  const k = Math.min(1, d / 3) * pace;
  return { mx: (dx / d) * s * k, mz: (-dz / d) * s * k, swing: false };
}

export function botInput(state: GameState, i: number, opts: { tier: BotTier; humans: number[] }): PlayerInput {
  const tier = TIER[opts.tier] ?? TIER.club;
  const p = state.players[i];
  const b = state.ball;
  const s = sgn(p.team);
  const gz = attackZ(p.team);
  const ownGoal = s * HALF_LENGTH;
  if (state.phase === 'point' || state.phase === 'over' || p.down > 0) return { ...IDLE };

  // the kickoff: walk into the ball, or wait in your spot
  if (state.phase === 'serve') {
    if (i !== state.server) return { ...IDLE };
    // a beat before kicking off, so the humans are ready
    if (state.phaseTicks < 90) return { ...IDLE };
    return toward(state, i, b.x, b.z + s * 0.4, 0.6);
  }

  const mate = mateOf(state, i);
  const thinking = state.tick % tier.think === i % tier.think;

  // with the ball
  if (state.owner === i) {
    const dGoal = Math.hypot(b.x, gz - b.z);
    const opps = teamPlayers(state, p.team === 0 ? 1 : 0).map((k) => state.players[k]);
    const blocked = opps.some((o) => (o.z - p.z) * -s > 0 && (o.z - p.z) * -s < 7 && Math.abs(o.x - p.x) < 3);
    if (thinking && dGoal < tier.range * (0.8 + noise(state, i, 40) * 0.4)) {
      const ax = (noise(state, i, 7) * 2 - 1) * tier.aim;
      return { mx: 0, mz: 1, swing: true, shot: { act: 'jump', ax, az: 0 } };
    }
    if (thinking && blocked && mate >= 0 && noise(state, i, 20) < 0.6) {
      return { mx: 0, mz: 1, swing: true, shot: { act: 'pass', ax: 0, az: 0 } };
    }
    // carry it at the goal, drifting round anyone in the way
    const dodge = blocked ? (p.x > 0 ? -8 : 8) : 0;
    return toward(state, i, Math.max(-HALF_WIDTH + 4, Math.min(HALF_WIDTH - 4, p.x * 0.6 + dodge)), gz + s * 8, tier.pace);
  }

  // a teammate has it: get open ahead of them
  if (state.owner >= 0 && state.owner === mate) {
    const m = state.players[mate];
    const side = m.x > 0 ? -1 : 1;
    return toward(state, i, side * 11, Math.max(-HALF_LENGTH + 8, Math.min(HALF_LENGTH - 8, m.z - s * 12)), tier.pace * 0.9);
  }

  // loose, or theirs: the nearer of us goes for it, the other minds the goal
  const dMe = Math.hypot(b.x - p.x, b.z - p.z);
  const dMate = mate >= 0 ? Math.hypot(b.x - state.players[mate].x, b.z - state.players[mate].z) : Infinity;
  const chaser = dMe <= dMate + 1.5;
  if (!chaser) {
    // between the ball and our goal, a third of the way out
    const gx = b.x * 0.35;
    const gzz = ownGoal + (b.z - ownGoal) * 0.3;
    return toward(state, i, gx, gzz, tier.pace);
  }
  // theirs and close: tackle
  // (not straight off a kickoff: let them get going)
  const settled = state.phaseTicks > 150 || state.touches > 2;
  if (settled && state.owner >= 0 && state.players[state.owner].team !== p.team && dMe < 4.2 && thinking && noise(state, i, 30) < tier.tackle) {
    return { mx: 0, mz: 0, swing: true, shot: { act: 'dive', ax: 0, az: -1 } };
  }
  // loose and at my feet: hit it first time if I'm facing their goal
  if (state.owner === -1 && dMe < KICK_R && b.y < 3 && thinking && (gz - p.z) * p.fz > 0) {
    return { mx: 0, mz: 1, swing: true, shot: { act: 'jump', ax: (noise(state, i, 9) * 2 - 1) * tier.aim, az: 0 } };
  }
  // get round the goal side of the ball, then onto it
  const lead = 0.25;
  const tx = b.x + b.vx * lead;
  const tz = b.z + b.vz * lead + s * 1.2;
  return toward(state, i, tx, tz, tier.pace);
}
