// Pickleball — deterministic singles simulation.
//
// Pure TypeScript, no DOM, no Date, no Math.random. Everything that changes lives in a
// plain serializable GameState, and step(state, inputs) returns the next state without
// touching the one it was given. Same seed + same inputs → same state, on every machine
// running the same JS engine. Units are feet and seconds; the net is the plane z = 0.
//
// Side 0 plays the z > 0 half (the "near" half on the host's screen), side 1 the z < 0
// half. Inputs are local to each player: up means toward the net and right means the
// player's own right as they face it, so both players use the same keys on their own
// computers with the camera behind their own baseline.

export const HZ = 120;
export const DT = 1 / HZ;

export const HALF_WIDTH = 10; // singles and doubles share the 20 ft court width
export const HALF_LENGTH = 22; // 44 ft long
export const KITCHEN = 7; // non-volley zone depth from the net
export const NET_HEIGHT = 2.9; // 34" at center, 36" at the posts
export const POST_X = 11;
export const BALL_R = 0.12;
export const GRAVITY = 32.2;

export const PLAYER_SPEED = 15;
export const REACH = 3.4;
export const SWING_ACTIVE = 36; // ticks the paddle can make contact (0.3 s)
export const SWING_SWEET = 14; // ideal contact tick
export const SWING_TOTAL = 44;
export const SWING_COOLDOWN = 10;
export const SERVE_READY = 36; // ticks before a serve may be struck
export const POINT_PAUSE = 150; // ticks the point result stays up

export const GAME_TO = 11;
export const WIN_BY = 2;

export type Side = 0 | 1;
export type Phase = 'serve' | 'rally' | 'point' | 'over';

export type FaultReason =
  | 'net'
  | 'out'
  | 'no-cross'
  | 'serve-kitchen'
  | 'serve-wrong-court'
  | 'serve-out'
  | 'double-bounce'
  | 'two-bounce'
  | 'kitchen-volley';

export const FAULT_TEXT: Record<FaultReason, string> = {
  net: 'Into the net',
  out: 'Out of bounds',
  'no-cross': 'Did not cross the net',
  'serve-kitchen': 'Serve landed in the kitchen',
  'serve-wrong-court': 'Serve landed in the wrong court',
  'serve-out': 'Serve was long or wide',
  'double-bounce': 'Bounced twice',
  'two-bounce': 'Two-bounce rule: let it bounce first',
  'kitchen-volley': 'Volleyed from the kitchen',
};

export interface PlayerInput {
  /** -1 left, 0, 1 right (player's own right) */
  mx: number;
  /** -1 back, 0, 1 toward the net */
  mz: number;
  /** pressed this step (edge, not held) */
  swing: boolean;
}

export const IDLE: PlayerInput = { mx: 0, mz: 0, swing: false };

export interface Player {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** ticks since the swing began, -1 when not swinging */
  swingT: number;
  cooldown: number;
  swingHit: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface PointResult {
  faultBy: Side;
  reason: FaultReason;
  /** side that scored, or null on a side out */
  scorer: Side | null;
  sideOut: boolean;
}

export interface GameState {
  seed: number;
  rng: number;
  tick: number;
  phase: Phase;
  phaseTicks: number;
  server: Side;
  scores: [number, number];
  players: [Player, Player];
  ball: Ball;
  /** shots struck this rally; the serve is 1 */
  hits: number;
  /** bounces since the last shot */
  bounces: number;
  lastHitter: Side | -1;
  lastBounce: { x: number; z: number; tick: number; in: boolean } | null;
  lastPoint: PointResult | null;
  pointSeq: number;
  hitSeq: number;
  bounceSeq: number;
  winner: Side | -1;
}

// ————— helpers —————

/** +1 for side 0 (z > 0), -1 for side 1 */
export function sgn(side: Side): number {
  return side === 0 ? 1 : -1;
}

export function sideOfZ(z: number): Side {
  return z >= 0 ? 0 : 1;
}

export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** server stands on their right when their score is even, left when odd */
export function serveFromRight(state: Pick<GameState, 'scores' | 'server'>): boolean {
  return state.scores[state.server] % 2 === 0;
}

/** world x sign of the court the serve starts from (and, diagonally, must land in) */
export function serveCourtSign(state: Pick<GameState, 'scores' | 'server'>, side: Side): number {
  return (serveFromRight(state) ? 1 : -1) * sgn(side);
}

export function isGameOver(scores: [number, number]): Side | -1 {
  for (const s of [0, 1] as Side[]) {
    const a = scores[s];
    const b = scores[other(s)];
    if (a >= GAME_TO && a - b >= WIN_BY) return s;
  }
  return -1;
}

/** mulberry32 over a uint32 held in state */
function rand(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function newPlayer(x: number, z: number): Player {
  return { x, z, vx: 0, vz: 0, swingT: -1, cooldown: 0, swingHit: false };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    scores: [s.scores[0], s.scores[1]],
    players: [{ ...s.players[0] }, { ...s.players[1] }],
    ball: { ...s.ball },
    lastBounce: s.lastBounce ? { ...s.lastBounce } : null,
    lastPoint: s.lastPoint ? { ...s.lastPoint } : null,
  };
}

// ————— setup —————

export function createGame(seed: number, firstServer: Side = 0): GameState {
  const state: GameState = {
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    phase: 'serve',
    phaseTicks: 0,
    server: firstServer,
    scores: [0, 0],
    players: [newPlayer(0, 20), newPlayer(0, -20)],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    hits: 0,
    bounces: 0,
    lastHitter: -1,
    lastBounce: null,
    lastPoint: null,
    pointSeq: 0,
    hitSeq: 0,
    bounceSeq: 0,
    winner: -1,
  };
  setupServe(state);
  return state;
}

/** place both players for the next serve and put the ball in the server's hand */
export function setupServe(state: GameState) {
  const srv = state.server;
  const rcv = other(srv);
  const ps = state.players[srv];
  const pr = state.players[rcv];
  ps.x = serveCourtSign(state, srv) * 4.5;
  ps.z = sgn(srv) * (HALF_LENGTH + 1);
  pr.x = serveCourtSign(state, rcv) * 4.5;
  pr.z = sgn(rcv) * (HALF_LENGTH + 1.5);
  for (const p of state.players) {
    p.vx = 0;
    p.vz = 0;
    p.swingT = -1;
    p.cooldown = 0;
    p.swingHit = false;
  }
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.hits = 0;
  state.bounces = 0;
  state.lastHitter = -1;
  state.lastBounce = null;
  holdBall(state);
}

/** ball rests at the server's paddle, below the waist (underhand) */
function holdBall(state: GameState) {
  const p = state.players[state.server];
  const s = sgn(state.server);
  state.ball = { x: p.x + s * 1.1, y: 1.6, z: p.z - s * 0.9, vx: 0, vy: 0, vz: 0 };
}

// ————— scoring —————

/** apply a fault: side out if the server faulted, otherwise the server scores */
export function awardRally(state: GameState, faultBy: Side, reason: FaultReason) {
  const server = state.server;
  let scorer: Side | null = null;
  let sideOut = false;
  if (faultBy === server) {
    // singles: one serve per side, so every server fault is a side out
    state.server = other(server);
    sideOut = true;
  } else {
    state.scores[server] += 1;
    scorer = server;
    state.winner = isGameOver(state.scores);
  }
  state.lastPoint = { faultBy, reason, scorer, sideOut };
  state.pointSeq += 1;
  state.phase = 'point';
  state.phaseTicks = 0;
}

// ————— ball physics (shared with the guest's extrapolation) —————

export type BallEvent = 'bounce' | 'net' | null;

/** one fixed step of flight: gravity, net, ground. Mutates ball. */
export function stepBall(ball: Ball): BallEvent {
  const pz = ball.z;
  ball.vy -= GRAVITY * DT;
  ball.x += ball.vx * DT;
  ball.y += ball.vy * DT;
  ball.z += ball.vz * DT;

  if ((pz > 0 && ball.z <= 0) || (pz < 0 && ball.z >= 0)) {
    // crossed the net plane this step; interpolate the crossing height
    const f = pz / (pz - ball.z);
    const yAt = ball.y - ball.vy * DT * (1 - f);
    const xAt = ball.x - ball.vx * DT * (1 - f);
    if (yAt < NET_HEIGHT && yAt > -0.5 && Math.abs(xAt) <= POST_X) {
      ball.z = pz > 0 ? 0.15 : -0.15;
      ball.vz = -ball.vz * 0.08;
      ball.vx *= 0.2;
      return 'net';
    }
  }

  if (ball.y <= BALL_R && ball.vy < 0) {
    ball.y = BALL_R;
    ball.vy = -ball.vy * 0.68;
    ball.vx *= 0.86;
    ball.vz *= 0.86;
    if (ball.vy < 1) ball.vy = 0;
    return 'bounce';
  }
  return null;
}

/** time until the ball reaches the ground on its current arc */
export function timeToGround(ball: Ball): number {
  const h = ball.y - BALL_R;
  const disc = ball.vy * ball.vy + 2 * GRAVITY * Math.max(0, h);
  return (ball.vy + Math.sqrt(disc)) / GRAVITY;
}

/** velocity that carries the ball from `from` to ground point (tx, tz) in t seconds */
function solveShot(from: Ball, tx: number, tz: number, t: number): { vx: number; vy: number; vz: number } {
  let tt = t;
  for (let i = 0; i < 40; i++) {
    const vx = (tx - from.x) / tt;
    const vz = (tz - from.z) / tt;
    const vy = (BALL_R - from.y + 0.5 * GRAVITY * tt * tt) / tt;
    // net clearance check where the arc crosses z = 0
    if (vz !== 0 && Math.sign(from.z) !== Math.sign(tz)) {
      const tc = -from.z / vz;
      const yc = from.y + vy * tc - 0.5 * GRAVITY * tc * tc;
      if (yc < NET_HEIGHT + 0.45) {
        tt += 0.04;
        continue;
      }
    }
    return { vx, vy, vz };
  }
  const vx = (tx - from.x) / tt;
  const vz = (tz - from.z) / tt;
  const vy = (BALL_R - from.y + 0.5 * GRAVITY * tt * tt) / tt;
  return { vx, vy, vz };
}

// ————— players —————

/** move one player with their input; shared with the guest's own-paddle prediction */
export function movePlayer(p: Player, side: Side, input: PlayerInput, phase: Phase, isServer: boolean, courtSign: number) {
  const s = sgn(side);
  let wx = clamp(Math.round(input.mx), -1, 1) * s;
  let wz = -clamp(Math.round(input.mz), -1, 1) * s;
  if (wx !== 0 && wz !== 0) {
    wx *= 0.7071;
    wz *= 0.7071;
  }
  const speed = PLAYER_SPEED * (p.swingT >= 0 ? 0.55 : 1);
  const k = Math.min(1, 14 * DT);
  p.vx += (wx * speed - p.vx) * k;
  p.vz += (wz * speed - p.vz) * k;

  if (phase === 'serve' && isServer) {
    // server stays behind the baseline, inside their half (centerline to sideline)
    p.vz = 0;
    p.x += p.vx * DT;
    const lo = courtSign > 0 ? 0.6 : -HALF_WIDTH + 0.4;
    const hi = courtSign > 0 ? HALF_WIDTH - 0.4 : -0.6;
    p.x = clamp(p.x, lo, hi);
    return;
  }
  p.x = clamp(p.x + p.vx * DT, -15, 15);
  const z = p.z + p.vz * DT;
  p.z = s > 0 ? clamp(z, 0.8, 30) : clamp(z, -30, -0.8);
}

function tickSwing(p: Player, input: PlayerInput) {
  if (p.cooldown > 0) p.cooldown -= 1;
  if (p.swingT >= 0) {
    p.swingT += 1;
    if (p.swingT > SWING_TOTAL) {
      p.swingT = -1;
      p.cooldown = SWING_COOLDOWN;
    }
  } else if (input.swing && p.cooldown <= 0) {
    p.swingT = 0;
    p.swingHit = false;
  }
}

// ————— the step —————

export function step(prev: GameState, inputs: [PlayerInput, PlayerInput]): GameState {
  const state = cloneState(prev);
  state.tick += 1;
  state.phaseTicks += 1;

  if (state.phase === 'over') {
    stepBall(state.ball);
    return state;
  }

  // players
  for (const side of [0, 1] as Side[]) {
    const p = state.players[side];
    const isServer = side === state.server;
    const wasIdle = p.swingT < 0;
    tickSwing(p, inputs[side]);
    movePlayer(p, side, inputs[side], state.phase, isServer, serveCourtSign(state, side));

    if (state.phase === 'serve' && isServer && wasIdle && p.swingT === 0) {
      if (state.phaseTicks < SERVE_READY) {
        p.swingT = -1; // too soon after the last point; ignore the press
      } else {
        serve(state, inputs[side]);
        p.swingHit = true;
      }
    }
  }

  if (state.phase === 'serve') {
    holdBall(state);
    return state;
  }

  if (state.phase === 'point') {
    stepBall(state.ball);
    if (state.phaseTicks >= POINT_PAUSE) {
      if (state.winner !== -1) {
        state.phase = 'over';
        state.phaseTicks = 0;
      } else {
        setupServe(state);
      }
    }
    return state;
  }

  // rally: contact first (the paddle meets the ball where it is), then flight
  for (const side of [0, 1] as Side[]) {
    if (state.phase !== 'rally') break;
    tryContact(state, side, inputs[side]);
  }
  if (state.phase !== 'rally') return state;

  const ev = stepBall(state.ball);
  if (ev === 'net') {
    awardRally(state, state.lastHitter === -1 ? state.server : state.lastHitter, 'net');
  } else if (ev === 'bounce') {
    onBounce(state);
  }
  return state;
}

function serve(state: GameState, input: PlayerInput) {
  const srv = state.server;
  const rcv = other(srv);
  const s = sgn(srv);
  holdBall(state);
  const courtX = serveCourtSign(state, rcv);
  const aimX = courtX * 5 + clamp(input.mx, -1, 1) * s * 4.2 + (rand(state) - 0.5) * 1.8;
  const depth = 15.5 - clamp(input.mz, -1, 1) * 5 + (rand(state) - 0.5) * 2.6;
  const v = solveShot(state.ball, aimX, -s * depth, 1.1);
  state.ball.vx = v.vx;
  state.ball.vy = v.vy;
  state.ball.vz = v.vz;
  state.phase = 'rally';
  state.phaseTicks = 0;
  state.hits = 1;
  state.bounces = 0;
  state.lastHitter = srv;
  state.hitSeq += 1;
}

function tryContact(state: GameState, side: Side, input: PlayerInput) {
  const p = state.players[side];
  const b = state.ball;
  if (p.swingT < 0 || p.swingHit || p.swingT > SWING_ACTIVE) return;
  if (state.lastHitter === side) return;
  if (sideOfZ(b.z) !== side) return;
  if (b.y > 7.5) return;
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  if (dx * dx + dz * dz > REACH * REACH) return;

  p.swingHit = true;
  const volley = state.bounces === 0;
  if (volley && state.hits <= 2) {
    awardRally(state, side, 'two-bounce');
    return;
  }
  if (volley && Math.abs(p.z) <= KITCHEN) {
    awardRally(state, side, 'kitchen-volley');
    return;
  }

  const s = sgn(side);
  // timing: + early (paddle was already through), - late
  const timing = (p.swingT - SWING_SWEET) / SWING_SWEET;
  const quality = clamp(1 - Math.abs(timing) * 0.9, 0, 1);
  const err = 1 - quality;
  const offsetLocal = dx * s; // + when the ball is on the player's right
  const aimLocal = clamp(input.mx, -1, 1) * 4.5 + offsetLocal * 0.9 - timing * 2.6;
  const tx = clamp(aimLocal, -11, 11) * s + (rand(state) - 0.5) * err * 5;

  const mz = clamp(Math.round(input.mz), -1, 1);
  let depth = mz > 0 ? 4.5 : mz < 0 ? 18.5 : 15.5;
  depth += (rand(state) - 0.5) * err * 7;
  const tz = -s * depth;

  const dist = Math.hypot(tx - b.x, tz - b.z);
  let t: number;
  if (mz > 0) t = Math.max(0.85, dist / 20);
  else if (mz < 0) t = Math.max(1.5, dist / 17);
  else t = Math.max(0.5, dist / (34 + 14 * quality));

  const from: Ball = { ...b, y: Math.max(b.y, 0.5) };
  const v = solveShot(from, tx, tz, t);
  // a badly mistimed swing flattens out and can find the net
  if (err > 0.55) v.vy -= (err - 0.55) * 14;

  b.y = from.y;
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  state.hits += 1;
  state.bounces = 0;
  state.lastHitter = side;
  state.hitSeq += 1;
}

function onBounce(state: GameState) {
  const b = state.ball;
  const side = sideOfZ(b.z);
  const ax = Math.abs(b.x);
  const az = Math.abs(b.z);
  const hitter = state.lastHitter === -1 ? state.server : state.lastHitter;
  state.bounceSeq += 1;

  if (state.bounces >= 1) {
    // second bounce: the player on this side failed to return it
    state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: true };
    awardRally(state, side, 'double-bounce');
    return;
  }
  state.bounces = 1;

  if (side === hitter) {
    state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: false };
    awardRally(state, hitter, 'no-cross');
    return;
  }

  if (state.hits === 1) {
    // the serve: diagonal court, past the kitchen line (the line is part of the kitchen)
    const courtSign = serveCourtSign(state, side);
    let reason: FaultReason | null = null;
    if (ax > HALF_WIDTH || az > HALF_LENGTH) reason = 'serve-out';
    else if (az <= KITCHEN) reason = 'serve-kitchen';
    else if (b.x * courtSign < 0) reason = 'serve-wrong-court';
    state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: reason === null };
    if (reason) awardRally(state, hitter, reason);
    return;
  }

  const inBounds = ax <= HALF_WIDTH && az <= HALF_LENGTH;
  state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: inBounds };
  if (!inBounds) awardRally(state, hitter, 'out');
}

/** a fresh game for a rematch: new seed, the previous loser serves first */
export function rematch(prev: GameState, seed: number): GameState {
  const first: Side = prev.winner === -1 ? 0 : other(prev.winner);
  return createGame(seed, first);
}
