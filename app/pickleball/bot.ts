// Pickleball: bots. A pure function of the game state that returns the same PlayerInput
// a keyboard would, so bots play through the exact same rules. Deterministic: their
// "personality" comes from hashing the seed and rally counters, never Math.random.
//
// Doubles positioning follows the Neon design pass: stay back until your team's third
// shot (the two-bounce rule), then move up to just behind the kitchen line; the ball-side
// partner covers the line and the other shades to the middle, like two people tied by a
// rope. Whoever gets there first takes the ball, except that a bot always leaves a ball
// to a human teammate who's close to it: the fun shots belong to people.

import {
  BALL_R, GRAVITY, HALF_LENGTH, HALF_WIDTH, KITCHEN, REACH, SWING_SWEET,
  partnerOf, receiverOf, sgn, sideOfZ, timeToGround, type GameState, type PlayerInput,
} from './sim';

export type BotTier = 'chill' | 'club' | 'champ';

export interface BotOptions {
  tier?: BotTier;
  /** player indexes controlled by people, so a bot teammate yields to them */
  humans?: number[];
}

const TIER = {
  // how often it misjudges and never swings, how often its timing is loose, and how
  // much of the time it stands still (slower feet)
  chill: { whiff: 0.14, sloppy: 0.38, idle: 0.28, jitter: 52 },
  club: { whiff: 0.07, sloppy: 0.22, idle: 0.1, jitter: 44 },
  champ: { whiff: 0.025, sloppy: 0.08, idle: 0, jitter: 30 },
} as const;

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** where the incoming ball will be hittable: a beat after its bounce, or now for a volley */
function interceptPoint(state: GameState): { x: number; z: number; land: { x: number; z: number } } {
  const b = state.ball;
  let lx = b.x;
  let lz = b.z;
  if (state.bounces === 0) {
    const t = timeToGround(b);
    lx = b.x + b.vx * t;
    lz = b.z + b.vz * t;
  }
  const after = state.bounces === 0 ? 0.42 : 0.12;
  return { x: lx + b.vx * 0.86 * after, z: lz + b.vz * 0.86 * after, land: { x: lx, z: lz } };
}

export function botInput(state: GameState, i: number, opts: BotOptions = {}): PlayerInput {
  const tier = TIER[opts.tier ?? 'club'];
  const p = state.players[i];
  const team = p.team;
  const s = sgn(team);
  const b = state.ball;
  const doubles = state.format === 'doubles';
  const mate = doubles ? partnerOf(state, i) : -1;
  const shotKey = hash(state.seed, state.pointSeq, state.hits, i);

  // choose this shot's flavor once per shot (stable across ticks)
  const mzPick = shotKey < 0.14 ? 1 : shotKey > 0.86 ? -1 : 0;
  const mxPick = shotKey * 7 % 1 < 0.33 ? -1 : shotKey * 7 % 1 > 0.66 ? 1 : 0;

  if (state.phase === 'serve') {
    if (state.server !== i) return { mx: 0, mz: 0, swing: false };
    const wait = 70 + Math.floor(hash(state.seed, state.pointSeq, 99) * 50);
    return { mx: mxPick, mz: 0, swing: state.phaseTicks === wait };
  }
  if (state.phase !== 'rally') return { mx: 0, mz: 0, swing: false };

  const incoming = state.lastHitter >= 0 && state.players[state.lastHitter].team !== team;
  // our team's shots so far this rally decide whether we may come forward yet
  const ourShotsNeeded = state.servingTeam === team ? 3 : 2;
  const mayAdvance = state.hits >= ourShotsNeeded;
  let tx: number;
  let tz: number;
  let swing = false;

  // who takes this ball?
  let mine = true;
  if (incoming && doubles) {
    const ip = interceptPoint(state);
    if (state.hits === 1) {
      mine = receiverOf(state) === i;
    } else {
      const m = state.players[mate];
      const dMe = Math.hypot(ip.x - p.x, ip.z - p.z);
      const dMate = Math.hypot(ip.x - m.x, ip.z - m.z);
      const humanMate = opts.humans?.includes(mate) ?? false;
      // a human teammate near the ball gets it; otherwise the closer one does
      mine = humanMate ? dMate > 7.5 && dMe + 2 < dMate : dMe < dMate || (dMe === dMate && i < mate);
    }
  }

  if (incoming && mine) {
    const ip = interceptPoint(state);
    const lx = ip.land.x;
    const lz = ip.land.z;
    const willBeOut = state.bounces === 0 && state.hits > 1 &&
      (Math.abs(lx) > HALF_WIDTH + 0.6 || Math.abs(lz) > HALF_LENGTH + 0.6);
    if (willBeOut && sideOfZ(lz) === team) {
      // smart leave: step aside and let it go out
      return { mx: toward((p.x - lx) * s, 0.2) || 1, mz: 0, swing: false };
    }
    tx = ip.x;
    const zAbs = Math.max(KITCHEN + 1.2, Math.min(27, Math.abs(ip.z)));
    tz = s * zAbs;

    // now and then it misjudges and never swings
    const whiff = hash(state.seed, state.pointSeq, state.hits, i, 11) < tier.whiff;
    // a volley is fine once the serve and return have bounced, from outside the kitchen
    const ready = state.bounces >= 1 || (state.hits >= 3 && Math.abs(p.z) > KITCHEN + 0.3);
    if (!whiff && ready && sideOfZ(b.z) === team && p.swingT < 0) {
      const sloppy = hash(state.seed, state.pointSeq, state.hits, i, 7) < tier.sloppy;
      const jitter = Math.floor((hash(state.seed, state.pointSeq, state.hits, i, 3) - 0.5) * (sloppy ? tier.jitter : 16));
      const ahead = Math.max(2, SWING_SWEET + jitter) / 120;
      const ax = b.x + b.vx * ahead;
      const az = b.z + b.vz * ahead;
      const ay = b.y + b.vy * ahead - 0.5 * GRAVITY * ahead * ahead;
      const dx = ax - p.x;
      const dz = az - p.z;
      const reach = REACH * state.traits[i].reach;
      if (dx * dx + dz * dz < reach * reach * 0.8 && ay > BALL_R - 0.5 && ay < 6.5) swing = true;
    }
  } else if (doubles) {
    // positioning: the ball-side partner covers the line, the other shades to the middle
    const ballX = incoming ? interceptPoint(state).x : b.x;
    const m = state.players[mate];
    const iAmBallSide = Math.abs(ballX - p.x) < Math.abs(ballX - m.x) || (Math.abs(ballX - p.x) === Math.abs(ballX - m.x) && i < mate);
    const leftOfMate = p.x * s < m.x * s || (p.x === m.x && i < mate);
    const laneSign = (leftOfMate ? -1 : 1) * s; // world x sign of my lane
    if (iAmBallSide) tx = clamp(ballX * 0.82, -8.4, 8.4);
    else tx = laneSign * 1.5 + clamp(ballX * 0.25, -3.8, 3.8);
    // never both in the same lane
    if (Math.sign(tx) !== Math.sign(laneSign) && Math.abs(tx) > 1.2) tx = laneSign * 1.2;
    tz = s * (mayAdvance ? KITCHEN + 1.0 : HALF_LENGTH - 1);
    // a lob over our heads: the deeper one goes back for it
    if (incoming && b.vy > 8 && Math.abs(interceptPoint(state).z) > 14 && !iAmBallSide) tz = s * Math.min(27, Math.abs(interceptPoint(state).z) + 1.8);
  } else {
    // singles recovery: shade toward the ball, stay deep enough to let the return bounce
    tx = b.x * 0.35;
    tz = s * (state.hits <= 2 ? 21 : 16);
  }

  const dx = tx - p.x;
  const dz = tz - p.z;
  // local axes: right = s * x, up (toward net) = -s * z
  let mx = toward(dx * s, 0.35);
  let mz = toward(-dz * s, 0.5);
  // slower feet on the gentler tiers
  if (tier.idle > 0 && hash(state.seed, Math.floor(state.tick / 9), i, 5) < tier.idle) { mx = 0; mz = 0; }
  if (swing || (p.swingT >= 0 && !p.swingHit)) {
    mx = mxPick;
    mz = mzPick;
  }
  return { mx, mz, swing };
}
