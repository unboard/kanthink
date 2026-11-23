// Volleyball: deterministic simulation, 2v2 (doubles) or 1v1 (singles), with hot streaks
// and super spikes.
//
// Pure TypeScript, no DOM, no Date, no Math.random. Everything that changes lives in a
// plain serializable GameState, and step(state, inputs) returns the next state without
// touching the one it was given. Same seed + same inputs → same state. Units are feet and
// seconds; the net is the plane z = 0.
//
// Team 0 plays the z > 0 half, team 1 the z < 0 half. Players are numbered team by team:
// singles [team 0, team 1]; doubles [team 0, team 0, team 1, team 1]. Inputs are local to
// each player: up means toward the net and right means the player's own right.
//
// One button. What a press does comes from the moment: bump the first ball, set the
// second, jump and spike the third, dive for one that's getting away, jump and block at
// the net when the other side is attacking. Direction aims it.

import { IDLE, other, sgn, sideOfZ, type Format, type PlayerInput, type Team, type Traits } from '../pickleball/sim';

export { IDLE, other, sgn, sideOfZ };
export type { Format, PlayerInput, Team, Traits };

export const HZ = 120;
export const DT = 1 / HZ;

export const HALF_WIDTH = 13;
export const HALF_LENGTH = 26;
export const NET_HEIGHT = 7.4;
export const POST_X = 14.5;
export const BALL_R = 0.36;
/** floaty on purpose, so arcs are readable */
export const BALL_GRAVITY = 24;
export const PLAYER_GRAVITY = 32.2;
export const JUMP_V = 14.5;
export const PLAYER_SPEED = 15;

export const GAME_TO = 15;
export const WIN_BY = 2;
export const POINT_PAUSE = 190;
export const SERVE_READY = 36;

export type Act = 'none' | 'bump' | 'set' | 'spike' | 'block' | 'dive' | 'serve';
/** how long each action lasts, in ticks (spike and block also last until the landing) */
export const ACT_TICKS: Record<Act, number> = { none: 0, bump: 36, set: 48, spike: 108, block: 108, dive: 40, serve: 44 };
/** the longest an action can run, for the animator */
export const SWING_TOTAL = 124;

export const REACH = 3.6; // ground reach, horizontal
export const SPIKE_REACH = 3.0; // around the raised hand
export const DIVE_RANGE = 8.5;
export const BUMP_ACTIVE = 30;
export const BUMP_SWEET = 12;
export const SET_ACTIVE = 44;
export const SET_SWEET = 14;
export const SPIKE_ACTIVE = 84;
export const SPIKE_SWEET = 40;
export const BUMP_HEIGHT = 5.0;
export const SET_HEIGHT = 8.4;
export const SPIKE_SPEED = 62;
export const DOWN_DIVE = 66;
export const DOWN_KNOCKED = 120;
/** ideal jump-serve contact height, on the way down */
export const SERVE_IDEAL = 10.2;

// ————— hot streaks —————
export const HEAT_MAX = 100;
export const HEAT_WARM = 50;
export const HEAT_DIG = 5;
export const HEAT_SET = 8;
export const HEAT_SWEET = 10;
export const HEAT_KILL = 22;
export const HEAT_ACE = 18;
export const HEAT_ROOF = 26;
export const HEAT_PANCAKE = 14;
export const HEAT_COMBO = 10;
export const HEAT_ERROR = 30;
export const HEAT_LOSS = 18;
export const HEAT_DOUSE = 30;
export const HEAT_ICE = 20;
export const FIRE_SECONDS = 20;
export const FIRE_PER_RALLY = 50;
export const FIRE_REFILL = 25;
export const FIRE_SPEED = 1.2;
export const FIRE_ACCURACY = 0.65;
export const FIRE_MOVE = 1.08;
export const FIRE_JUMP = 1.15;
export const WARM_SPEED = 1.06;
export const SUPER_SPEED = 1.35;

export type Phase = 'serve' | 'rally' | 'point' | 'over';

export type FaultReason = 'floor' | 'out' | 'serve-out' | 'serve-net' | 'net' | 'no-cross' | 'shank';

export const FAULT_TEXT: Record<FaultReason, string> = {
  floor: 'Ball down',
  out: 'Out of bounds',
  'serve-out': 'Serve was long or wide',
  'serve-net': 'Serve into the net',
  net: 'Into the net',
  'no-cross': 'Did not make it over',
  shank: 'Could not control it',
};

export type Touch = 'serve' | 'bump' | 'set' | 'spike' | 'tip' | 'block' | 'dive' | 'over';
export type How = 'kill' | 'ace' | 'roof' | 'tip' | 'tool' | 'error' | 'floor';

export interface PlayerStats {
  hits: number;
  digs: number;
  sets: number;
  kills: number;
  blocks: number;
  aces: number;
  supers: number;
  dives: number;
  /** feet run */
  run: number;
  fires: number;
  bestStreak: number;
}

export interface Player {
  team: Team;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** height off the ground (jumping) */
  y: number;
  vy: number;
  /** ticks since the action began, -1 when not acting */
  swingT: number;
  act: Act;
  swingHit: boolean;
  cooldown: number;
  /** ticks left on the ground after a dive or a knockdown */
  down: number;
  heat: number;
  fire: number;
  refilled: boolean;
  chill: number;
  streak: number;
  /** unused here; kept so code shared with pickleball can read it */
  chefUntil: number;
  stats: PlayerStats;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** struck by a player on fire */
  hot: boolean;
  /** a super spike */
  super: boolean;
}

export interface PointResult {
  faultTeam: Team;
  faultBy: number;
  reason: FaultReason;
  scorer: Team;
  sideOut: boolean;
  /** player credited with winning the rally, or -1 */
  shotBy: number;
  /** net crossings in the rally */
  rally: number;
  how: How;
}

export type CallKind =
  | 'start' | 'side-out' | 'ace' | 'kill' | 'super' | 'boom' | 'roof' | 'tool' | 'tip' | 'pancake' | 'dig' | 'knocked'
  | 'rally10' | 'rally20' | 'warm' | 'fire' | 'cooled' | 'doused' | 'combo' | 'streak' | 'tied' | 'game-point' | 'overtime' | 'win';

export interface Call {
  seq: number;
  kind: CallKind;
  player: number;
  n?: number;
}

export interface GameState {
  seed: number;
  rng: number;
  tick: number;
  format: Format;
  phase: Phase;
  phaseTicks: number;
  players: Player[];
  traits: Traits[];
  scores: [number, number];
  servingTeam: Team;
  server: number;
  /** which of each team's players serves on its current turn; -1 before its first */
  serveTurn: [number, number];
  ball: Ball;
  /** ticks since the serve toss went up, -1 before it */
  toss: number;
  /** touches used by the team on whose side the ball is */
  touches: number;
  touchTeam: Team | -1;
  lastHitter: number;
  lastTouch: Touch;
  /** contacts this rally; the serve is 1 */
  hits: number;
  /** times the ball has crossed the net this rally */
  crossings: number;
  passQuality: number;
  setQuality: number;
  /** who sent the ball over last, and how */
  attacker: number;
  attackKind: Touch;
  /** whose ball the last block touched */
  blockOf: number;
  /** the ball has hit the net since the last contact */
  netted: boolean;
  hitTick: number;
  lastBounce: { x: number; z: number; tick: number; in: boolean } | null;
  lastPoint: PointResult | null;
  pointSeq: number;
  hitSeq: number;
  bounceSeq: number;
  perfectSeq: number;
  superSeq: number;
  blockSeq: number;
  /** players who touched the ball this rally, as a bitmask */
  touched: number;
  /** hot spikes dug this rally */
  ice: number;
  deficit: [number, number];
  winner: Team | -1;
  calls: Call[];
  callSeq: number;
}

const ADULT: Traits = { speed: 1, reach: 1, forgive: 0, heat: 1, shape: 0, guard: false };

// ————— helpers —————

export function teamPlayers(state: Pick<GameState, 'players'>, team: Team): number[] {
  const out: number[] = [];
  state.players.forEach((p, i) => { if (p.team === team) out.push(i); });
  return out;
}

export function partnerOf(state: Pick<GameState, 'players'>, i: number): number {
  const mates = teamPlayers(state, state.players[i].team);
  return mates.find((m) => m !== i) ?? i;
}

export function isGameOver(scores: [number, number]): Team | -1 {
  for (const s of [0, 1] as Team[]) {
    if (scores[s] >= GAME_TO && scores[s] - scores[other(s)] >= WIN_BY) return s;
  }
  return -1;
}

/** "7–5": the serving team's score first */
export function scoreCall(state: GameState): string {
  return `${state.scores[state.servingTeam]}–${state.scores[other(state.servingTeam)]}`;
}

function rand(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function newPlayer(team: Team): Player {
  return {
    team, x: 0, z: sgn(team) * 17, vx: 0, vz: 0, y: 0, vy: 0, swingT: -1, act: 'none', swingHit: false, cooldown: 0, down: 0,
    heat: 0, fire: 0, refilled: false, chill: 0, streak: 0, chefUntil: 0,
    stats: { hits: 0, digs: 0, sets: 0, kills: 0, blocks: 0, aces: 0, supers: 0, dives: 0, run: 0, fires: 0, bestStreak: 0 },
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    scores: [s.scores[0], s.scores[1]],
    serveTurn: [s.serveTurn[0], s.serveTurn[1]],
    deficit: [s.deficit[0], s.deficit[1]],
    players: s.players.map((p) => ({ ...p, stats: { ...p.stats } })),
    traits: s.traits,
    ball: { ...s.ball },
    lastBounce: s.lastBounce ? { ...s.lastBounce } : null,
    lastPoint: s.lastPoint ? { ...s.lastPoint } : null,
    calls: s.calls,
  };
}

function call(state: GameState, kind: CallKind, player: number, n?: number) {
  state.callSeq += 1;
  state.calls = [...state.calls.slice(-5), { seq: state.callSeq, kind, player, ...(n !== undefined ? { n } : {}) }];
}

// ————— ball flight —————

/** time until the ball reaches the floor on its current arc */
export function timeToGround(ball: Ball): number {
  const h = ball.y - BALL_R;
  const disc = ball.vy * ball.vy + 2 * BALL_GRAVITY * Math.max(0, h);
  return (ball.vy + Math.sqrt(disc)) / BALL_GRAVITY;
}

/** where and when the ball comes down, ignoring the net */
export function landing(ball: Ball): { x: number; z: number; t: number } {
  const t = timeToGround(ball);
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, t };
}

/** when the ball next comes down through height h, or -1 if it never gets that high (or is already below) */
export function timeToHeight(ball: Ball, h: number): number {
  const disc = ball.vy * ball.vy + 2 * BALL_GRAVITY * (ball.y - h);
  if (disc < 0) return -1;
  const t = (ball.vy + Math.sqrt(disc)) / BALL_GRAVITY;
  return t >= 0 ? t : -1;
}

/** the ball's position t seconds from now, ignoring net and floor */
export function ballAt(ball: Ball, t: number): { x: number; y: number; z: number } {
  return { x: ball.x + ball.vx * t, y: ball.y + ball.vy * t - 0.5 * BALL_GRAVITY * t * t, z: ball.z + ball.vz * t };
}

export type BallEvent = 'floor' | 'net' | null;

/** one fixed step of flight: gravity, the net as a wall, the floor. Mutates ball. */
export function stepBall(ball: Ball): BallEvent {
  const pz = ball.z;
  ball.vy -= BALL_GRAVITY * DT;
  ball.x += ball.vx * DT;
  ball.y += ball.vy * DT;
  ball.z += ball.vz * DT;

  if ((pz > 0 && ball.z <= 0) || (pz < 0 && ball.z >= 0)) {
    const f = pz / (pz - ball.z);
    const yAt = ball.y - ball.vy * DT * (1 - f);
    const xAt = ball.x - ball.vx * DT * (1 - f);
    if (yAt < NET_HEIGHT + BALL_R * 0.5 && Math.abs(xAt) <= POST_X) {
      // into the net: it dies and drops on the side it came from
      ball.z = pz > 0 ? 0.3 : -0.3;
      ball.vz = -ball.vz * 0.06;
      ball.vx *= 0.25;
      if (ball.vy > 0) ball.vy *= 0.3;
      return 'net';
    }
  }

  if (ball.y <= BALL_R && ball.vy < 0) {
    ball.y = BALL_R;
    ball.vy = -ball.vy * 0.4;
    ball.vx *= 0.6;
    ball.vz *= 0.6;
    if (ball.vy < 1.5) ball.vy = 0;
    return 'floor';
  }
  return null;
}

/**
 * Velocity that carries the ball from `from` through (tx, ty, tz) after t seconds. With
 * `clear` set, a flight that would cross the net lower than NET_HEIGHT + clear is slowed
 * (a higher arc) until it does.
 */
function solve(from: { x: number; y: number; z: number }, tx: number, ty: number, tz: number, t: number, clear: number | null): { vx: number; vy: number; vz: number } {
  let tt = t;
  const at = () => ({ vx: (tx - from.x) / tt, vz: (tz - from.z) / tt, vy: (ty - from.y + 0.5 * BALL_GRAVITY * tt * tt) / tt });
  if (clear !== null && Math.sign(from.z) !== Math.sign(tz)) {
    for (let i = 0; i < 80; i++) {
      const v = at();
      const tc = -from.z / v.vz;
      const yc = from.y + v.vy * tc - 0.5 * BALL_GRAVITY * tc * tc;
      if (yc >= NET_HEIGHT + BALL_R + clear) return v;
      tt += 0.03;
    }
  }
  return at();
}

// ————— setup —————

export interface GameOptions {
  format?: Format;
  firstTeam?: Team;
  traits?: Traits[];
}

export function createGame(seed: number, opts: GameOptions = {}): GameState {
  const format = opts.format ?? 'doubles';
  const teams: Team[] = format === 'doubles' ? [0, 0, 1, 1] : [0, 1];
  const firstTeam = opts.firstTeam ?? 0;
  const state: GameState = {
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    format,
    phase: 'serve',
    phaseTicks: 0,
    players: teams.map(newPlayer),
    traits: teams.map((_, i) => opts.traits?.[i] ?? ADULT),
    scores: [0, 0],
    servingTeam: firstTeam,
    server: 0,
    serveTurn: [-1, -1],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hot: false, super: false },
    toss: -1,
    touches: 0,
    touchTeam: -1,
    lastHitter: -1,
    lastTouch: 'serve',
    hits: 0,
    crossings: 0,
    passQuality: 0,
    setQuality: 0,
    attacker: -1,
    attackKind: 'serve',
    blockOf: -1,
    netted: false,
    hitTick: 0,
    lastBounce: null,
    lastPoint: null,
    pointSeq: 0,
    hitSeq: 0,
    bounceSeq: 0,
    perfectSeq: 0,
    superSeq: 0,
    blockSeq: 0,
    touched: 0,
    ice: 0,
    deficit: [0, 0],
    winner: -1,
    calls: [],
    callSeq: 0,
  };
  state.serveTurn[firstTeam] = 0;
  state.server = teamPlayers(state, firstTeam)[0];
  setupServe(state);
  call(state, 'start', state.server);
  return state;
}

/** place everyone for the next serve and put the ball in the server's hand */
export function setupServe(state: GameState) {
  const srvTeam = state.servingTeam;
  let rcv = 0;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const s = sgn(p.team);
    if (i === state.server) {
      p.x = s * 4;
      p.z = s * (HALF_LENGTH + 1.6);
    } else if (p.team === srvTeam) {
      p.x = -s * 5;
      p.z = s * 5;
    } else if (state.format === 'doubles') {
      p.x = (rcv === 0 ? -1 : 1) * s * 6;
      p.z = s * 17;
      rcv += 1;
    } else {
      p.x = 0;
      p.z = s * 17;
    }
    p.vx = 0;
    p.vz = 0;
    p.y = 0;
    p.vy = 0;
    p.swingT = -1;
    p.act = 'none';
    p.swingHit = false;
    p.cooldown = 0;
    p.down = 0;
  }
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.toss = -1;
  state.touches = 0;
  state.touchTeam = -1;
  state.lastHitter = -1;
  state.lastTouch = 'serve';
  state.hits = 0;
  state.crossings = 0;
  state.passQuality = 0;
  state.setQuality = 0;
  state.attacker = -1;
  state.attackKind = 'serve';
  state.blockOf = -1;
  state.netted = false;
  state.lastBounce = null;
  state.touched = 0;
  state.ice = 0;
  holdBall(state);
}

/** while waiting to serve, the ball rests in the server's off hand */
export function holdBall(state: GameState) {
  if (state.phase !== 'serve' || state.toss >= 0) return;
  const p = state.players[state.server];
  const s = sgn(p.team);
  state.ball = { x: p.x - s * 0.7, y: 4.2, z: p.z - s * 0.9, vx: 0, vy: 0, vz: 0, hot: p.fire > 0, super: false };
}

// ————— heat —————

function gainFor(state: GameState, i: number, base: number): number {
  const p = state.players[i];
  const down = state.scores[other(p.team)] - state.scores[p.team];
  const spark = down >= 5 ? 1.45 : down >= 3 ? 1.25 : 1;
  return base * state.traits[i].heat * spark * (p.chill > 0 ? 0.5 : 1);
}

function addHeat(state: GameState, i: number, base: number) {
  const p = state.players[i];
  if (p.fire > 0 || base <= 0) return;
  const before = p.heat;
  p.heat = Math.min(HEAT_MAX, p.heat + gainFor(state, i, base));
  if (p.heat >= HEAT_MAX) {
    p.fire = 100;
    p.refilled = false;
    p.stats.fires += 1;
    call(state, 'fire', i);
  } else if (before < HEAT_WARM && p.heat >= HEAT_WARM) {
    call(state, 'warm', i);
  }
}

function putOut(state: GameState, i: number, heatAfter: number) {
  const p = state.players[i];
  p.fire = 0;
  p.heat = heatAfter;
  p.chill = 1;
}

// ————— scoring —————

/** end the rally: the score, the next server, heat, streaks and callouts move together */
export function awardRally(state: GameState, faultTeam: Team, reason: FaultReason, faultBy: number, how: How, shotBy: number) {
  const winTeam = other(faultTeam);
  const rally = state.crossings;
  const sideOut = winTeam !== state.servingTeam;
  state.scores[winTeam] += 1;
  if (sideOut) {
    const mates = teamPlayers(state, winTeam);
    state.serveTurn[winTeam] = (state.serveTurn[winTeam] + 1) % mates.length;
    state.servingTeam = winTeam;
    state.server = mates[state.serveTurn[winTeam]];
  }
  state.winner = isGameOver(state.scores);

  const winners = teamPlayers(state, winTeam);
  const losers = teamPlayers(state, faultTeam);
  const doused = losers.some((i) => state.players[i].fire > 0);
  for (const i of losers) {
    const p = state.players[i];
    p.streak = 0;
    if (p.fire > 0) {
      putOut(state, i, 0);
      call(state, 'doused', i);
    } else {
      p.heat = Math.max(0, p.heat - (i === faultBy ? HEAT_ERROR : HEAT_LOSS));
      if (p.chill > 0) p.chill -= 1;
    }
  }
  const earned = how === 'kill' || how === 'tip' || how === 'tool' || how === 'roof' || how === 'ace';
  const combo = winners.length === 2 && (how === 'kill' || how === 'tip' || how === 'tool') && winners.every((i) => (state.touched & (1 << i)) !== 0);
  for (const i of winners) {
    const p = state.players[i];
    if (p.fire > 0) {
      p.fire -= FIRE_PER_RALLY;
      if (i === shotBy && !p.refilled) { p.fire += FIRE_REFILL; p.refilled = true; }
      if (p.fire <= 0) putOut(state, i, 0);
    }
    let gain = 0;
    if (i === shotBy && earned) {
      gain += how === 'roof' ? HEAT_ROOF : how === 'ace' ? HEAT_ACE : HEAT_KILL;
      p.streak += 1;
      p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
      if (how === 'ace') p.stats.aces += 1;
      else if (how !== 'roof') p.stats.kills += 1;
      if (doused) gain += HEAT_DOUSE;
    }
    if (combo) gain += HEAT_COMBO;
    addHeat(state, i, gain);
    if (p.chill > 0 && p.fire === 0) p.chill -= 1;
  }

  if (shotBy >= 0) {
    if (how === 'ace') call(state, 'ace', shotBy);
    else if (how === 'roof') call(state, 'roof', shotBy);
    else if (how === 'tool') call(state, 'tool', shotBy);
    else if (how === 'tip') call(state, 'tip', shotBy);
    else if (how === 'kill') call(state, state.ball.super && reason === 'floor' ? 'boom' : 'kill', shotBy);
  }
  if (combo && shotBy >= 0) call(state, 'combo', shotBy);
  if (shotBy >= 0 && earned && state.players[shotBy].streak >= 3 && state.players[shotBy].fire === 0) call(state, 'streak', shotBy, state.players[shotBy].streak);
  if (rally >= 20) call(state, 'rally20', shotBy, rally);
  else if (rally >= 10) call(state, 'rally10', shotBy, rally);

  for (const t of [0, 1] as Team[]) state.deficit[t] = Math.max(state.deficit[t], state.scores[other(t)] - state.scores[t]);
  const a = state.scores[0];
  const b = state.scores[1];
  if (state.winner !== -1) call(state, 'win', shotBy >= 0 ? shotBy : state.server);
  else if (a === b && a >= GAME_TO - 1) call(state, 'overtime', state.server);
  else if (a === b && state.deficit[winTeam] >= 3) { call(state, 'tied', state.server); state.deficit = [0, 0]; }
  else if (state.scores[winTeam] >= GAME_TO - 1 && state.scores[winTeam] > state.scores[faultTeam]) call(state, 'game-point', state.server);
  else if (sideOut) call(state, 'side-out', state.server);

  state.lastPoint = { faultTeam, faultBy, reason, scorer: winTeam, sideOut, shotBy, rally, how };
  state.pointSeq += 1;
  state.phase = 'point';
  state.phaseTicks = 0;
}

function howOf(touch: Touch): How {
  return touch === 'serve' ? 'ace' : touch === 'spike' ? 'kill' : touch === 'tip' ? 'tip' : touch === 'block' ? 'roof' : 'floor';
}

function onFloor(state: GameState) {
  const b = state.ball;
  const side = sideOfZ(b.z);
  const inBounds = Math.abs(b.x) <= HALF_WIDTH + 0.15 && Math.abs(b.z) <= HALF_LENGTH + 0.15;
  state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: inBounds };
  state.bounceSeq += 1;
  const hitter = state.lastHitter;
  const hitTeam = state.players[hitter].team;
  // one desperate touch on someone else's attack still belongs to the attacker
  const forced = (team: Team) => state.attacker >= 0 && state.players[state.attacker].team !== team && state.touches <= 1 &&
    (state.lastTouch === 'bump' || state.lastTouch === 'dive' || state.lastTouch === 'block');

  if (inBounds) {
    if (hitTeam !== side) {
      awardRally(state, side, 'floor', -1, howOf(state.lastTouch), hitter);
    } else if (forced(side)) {
      awardRally(state, side, 'shank', -1, howOf(state.attackKind), state.attacker);
    } else {
      const reason: FaultReason = state.lastTouch === 'serve' ? 'serve-net' : state.netted ? 'net' : 'no-cross';
      awardRally(state, side, reason, hitter, 'error', -1);
    }
    return;
  }
  if (state.lastTouch === 'block') {
    const by = state.blockOf >= 0 && state.players[state.blockOf].team !== hitTeam ? state.blockOf : -1;
    awardRally(state, hitTeam, 'out', hitter, by >= 0 ? 'tool' : 'error', by);
  } else if (forced(hitTeam)) {
    awardRally(state, hitTeam, 'shank', -1, howOf(state.attackKind), state.attacker);
  } else {
    awardRally(state, hitTeam, state.lastTouch === 'serve' ? 'serve-out' : 'out', hitter, 'error', -1);
  }
}

/** the ball went over the net: a fresh three touches for the side it's now on */
function onCross(state: GameState) {
  state.crossings += 1;
  state.attacker = state.lastHitter;
  state.attackKind = state.lastTouch;
  state.touches = 0;
  state.passQuality = 0;
  state.setQuality = 0;
}

// ————— players —————

/**
 * Horizontal movement for player i, applied to p (the state's own player, or a guest's
 * predicted copy). Jumping is separate: see coastPlayer and the step.
 */
export function movePlayer(state: GameState, i: number, p: Player, input: PlayerInput) {
  const s = sgn(p.team);
  const zClamp = () => { p.x = clamp(p.x, -19, 19); p.z = s > 0 ? clamp(p.z, 1, 36) : clamp(p.z, -36, -1); };
  if (p.down > 0) {
    p.vx *= 0.9;
    p.vz *= 0.9;
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    zClamp();
    return;
  }
  if (p.act === 'dive' && p.swingT >= 0) {
    p.vx *= 0.985;
    p.vz *= 0.985;
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    zClamp();
    return;
  }
  let wx = clamp(Math.round(input.mx), -1, 1) * s;
  let wz = -clamp(Math.round(input.mz), -1, 1) * s;
  if (wx !== 0 && wz !== 0) {
    wx *= 0.7071;
    wz *= 0.7071;
  }
  const air = p.y > 0;
  if (air) {
    // in the air you keep the momentum you jumped with; the stick only aims
    p.vx *= 0.992;
    p.vz *= 0.992;
  } else {
    const busy = p.swingT >= 0;
    const speed = PLAYER_SPEED * (state.traits[i]?.speed ?? 1) * (busy ? 0.5 : 1) * (p.fire > 0 ? FIRE_MOVE : 1);
    const k = Math.min(1, 14 * DT);
    p.vx += (wx * speed - p.vx) * k;
    p.vz += (wz * speed - p.vz) * k;
  }

  if (state.phase === 'serve' && i === state.server) {
    p.vz = 0;
    if (state.toss >= 0) p.vx = 0;
    p.x = clamp(p.x + p.vx * DT, -HALF_WIDTH + 0.5, HALF_WIDTH - 0.5);
    p.z = s * (HALF_LENGTH + 1.6);
    return;
  }
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  zClamp();
}

/** one tick of a jump */
function fall(p: Player) {
  if (p.y > 0 || p.vy > 0) {
    p.vy -= PLAYER_GRAVITY * DT;
    p.y += p.vy * DT;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
  }
}

/** one tick of coasting for a player another machine controls: drift and jump gravity */
export function coastPlayer(p: Player) {
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  fall(p);
}

function jump(p: Player, scale: number) {
  p.vy = JUMP_V * scale * (p.fire > 0 ? FIRE_JUMP : 1);
  p.y = Math.max(p.y, 0.001);
}

/** a press during a rally: pick the action from the moment */
function startAct(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  const t = state.traits[i];
  const b = state.ball;
  const s = sgn(p.team);
  const singles = state.format === 'singles';
  p.swingT = 0;
  p.swingHit = false;

  const onMySide = b.z * s > 0;
  const land = landing(b);
  const coming = onMySide || (b.vz * s > 0 && land.z * s > 0);
  const legal = onMySide ? state.touches < 3 && (singles || state.lastHitter !== i || state.lastTouch === 'block') : true;
  const fromOpp = state.lastHitter >= 0 && state.players[state.lastHitter].team !== p.team;

  if (coming && legal) {
    const n = onMySide ? state.touches : 0;
    let high = false;
    for (const tt of [0.18, 0.26, 0.34, 0.42]) {
      const q = ballAt(b, tt);
      if (q.y >= 7.6 && q.y <= 15.5 && q.z * s > -0.5 && Math.hypot(q.x - p.x, q.z - p.z) <= 4.6 * t.reach) high = true;
    }
    const mz = clamp(Math.round(input.mz), -1, 1);
    const wantSpike = high && (n === 2 || (n === 1 && mz > 0) || (n === 0 && fromOpp && Math.abs(p.z) < 8 && state.lastTouch !== 'spike'));
    if (wantSpike) {
      p.act = 'spike';
      jump(p, 1);
      return;
    }
    const thr = n === 1 ? SET_HEIGHT : BUMP_HEIGHT;
    const tThr = timeToHeight(b, thr);
    const at = tThr >= 0 ? ballAt(b, tThr) : b;
    const reach = REACH * t.reach;
    const dGround = Math.hypot(at.x - p.x, at.z - p.z);
    const dLand = Math.hypot(land.x - p.x, land.z - p.z);
    if (dGround > reach + 1.5 && dLand > reach + 1 && dLand <= DIVE_RANGE * t.reach && land.t < 0.6) {
      p.act = 'dive';
      const sp = Math.min(30, Math.max(14, dLand / 0.26));
      p.vx = ((land.x - p.x) / dLand) * sp;
      p.vz = ((land.z - p.z) / dLand) * sp;
      return;
    }
    p.act = n === 1 ? 'set' : 'bump';
    return;
  }
  const oppUp = state.players.some((o) => o.team !== p.team && o.y > 0.3);
  if (!onMySide && Math.abs(p.z) <= 4.5 && state.phase === 'rally' && (state.touches >= 1 || oppUp)) {
    p.act = 'block';
    jump(p, 1);
    return;
  }
  // nothing to do with the ball: a little hop
  p.act = 'block';
  jump(p, 0.6);
}

function tickAct(p: Player) {
  if (p.cooldown > 0) p.cooldown -= 1;
  if (p.down > 0) {
    p.down -= 1;
    if (p.down === 0) p.act = 'none';
  }
  if (p.swingT < 0) return;
  p.swingT += 1;
  const air = p.act === 'spike' || p.act === 'block';
  const done = air ? p.swingT > 12 && p.y <= 0 : p.swingT > ACT_TICKS[p.act];
  if (!done) return;
  p.swingT = -1;
  if (p.act === 'dive') {
    p.down = DOWN_DIVE;
  } else {
    p.act = 'none';
    p.cooldown = 6;
  }
}

// ————— the serve —————

function serveHit(state: GameState, input: PlayerInput, jumped: boolean) {
  const srv = state.server;
  const p = state.players[srv];
  const t = state.traits[srv];
  const b = state.ball;
  const s = sgn(p.team);
  const fire = p.fire > 0;
  let q = 0.7;
  if (jumped) {
    q = clamp(1 - Math.abs(b.y - SERVE_IDEAL) / 3.2 - (b.vy > 0 ? 0.3 : 0), 0, 1);
    q += (1 - q) * t.forgive * 0.5;
  }
  const spread = (jumped ? (1 - q) * 10 + 1.5 : 3) * (fire ? FIRE_ACCURACY : 1);
  const mz = clamp(Math.round(input.mz), -1, 1);
  let tx = clamp(input.mx, -1, 1) * s * 7 + (rand(state) - 0.5) * spread;
  let depth = (mz > 0 ? 10 : mz < 0 ? 23 : 18) + (rand(state) - 0.5) * (spread + 1);
  const wild = jumped && q < 0.35;
  if (wild && rand(state) < 0.5) depth += 9;
  if (t.shape > 0) {
    const limX = HALF_WIDTH - 0.8;
    if (Math.abs(tx) > limX) tx = Math.sign(tx) * (limX + (Math.abs(tx) - limX) * (1 - t.shape));
    const limZ = HALF_LENGTH - 0.8;
    if (depth > limZ) depth = limZ + (depth - limZ) * (1 - t.shape);
  }
  const time = jumped ? (1.05 - 0.14 * q) * (fire ? 0.93 : 1) : 1.5;
  const v = solve(b, tx, BALL_R, -s * depth, time, wild && depth < HALF_LENGTH ? null : jumped ? 0.25 : 1.2);
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.hot = fire;
  b.super = false;
  p.act = 'serve';
  p.swingT = 0;
  p.swingHit = true;
  if (jumped) jump(p, 0.55);
  p.stats.hits += 1;
  if (jumped && q > 0.93) state.perfectSeq += 1;
  state.phase = 'rally';
  state.phaseTicks = 0;
  state.toss = -1;
  state.hits = 1;
  state.touches = 3; // the serving team may not touch its own serve
  state.touchTeam = p.team;
  state.lastHitter = srv;
  state.lastTouch = 'serve';
  state.touched = 1 << srv;
  state.netted = false;
  state.hitSeq += 1;
  state.hitTick = state.tick;
}

// ————— contact —————

function noteTouch(state: GameState, i: number, touch: Touch) {
  const p = state.players[i];
  p.swingHit = true;
  p.stats.hits += 1;
  state.touches += 1;
  state.touchTeam = p.team;
  state.touched |= 1 << i;
  state.hits += 1;
  state.lastHitter = i;
  state.lastTouch = touch;
  state.netted = false;
  state.hitSeq += 1;
  state.hitTick = state.tick;
}

function shank(state: GameState, s: number) {
  const b = state.ball;
  b.vx = (rand(state) - 0.5) * 30;
  b.vz = s * (2 + rand(state) * 14);
  b.vy = 9 + rand(state) * 6;
  b.hot = false;
  b.super = false;
}

function timingQuality(swingT: number, sweet: number, active: number, forgive: number): number {
  const dev = swingT < sweet ? (sweet - swingT) / sweet : (swingT - sweet) / (active - sweet);
  return clamp(1 - dev * 0.9 * (1 - forgive * 0.6), 0, 1);
}

/** a dug hot spike counts toward cooling the hitter off */
function iceCheck(state: GameState, digger: number) {
  const b = state.ball;
  const by = state.attacker;
  if (!(b.hot || b.super) || by < 0 || state.attackKind !== 'spike') return;
  state.ice += 1;
  if (state.ice >= 3 && state.players[by].fire > 0) {
    putOut(state, by, 25);
    call(state, 'cooled', by);
    addHeat(state, digger, HEAT_ICE);
    state.ice = 0;
  }
}

function tryContact(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.swingT < 0 || p.swingHit || p.down > 0 || p.act === 'none' || p.act === 'serve') return;
  if (p.act === 'block') { tryBlock(state, i); return; }
  const t = state.traits[i];
  const b = state.ball;
  const s = sgn(p.team);
  const zz = b.z * s;

  if (p.act === 'spike') {
    if (p.swingT < 6 || p.swingT > SPIKE_ACTIVE) return;
    if (zz < -0.4) return;
    const hy = p.y + 7.6;
    const dx = b.x - p.x;
    const dy = b.y - hy;
    const dz = b.z - (p.z - s * 0.8);
    const d = Math.hypot(dx, dy, dz);
    if (d > SPIKE_REACH * t.reach) return;
    if (dy > 1.0 && d > 1.4) return; // let it come down to the hand
    if (dy < -1.8) return;
    if (zz <= 0) {
      // reaching over for a ball that hasn't crossed: only the other side's ball
      if (state.lastHitter < 0 || state.players[state.lastHitter].team === p.team) return;
      onCross(state);
      b.z = s * 0.05;
    }
    if (state.touches >= 3) return;
    if (state.format === 'doubles' && state.lastHitter === i && state.lastTouch !== 'block') return;
    spike(state, i, input);
    return;
  }

  if (zz <= 0) return;
  if (state.touches >= 3) return;
  if (state.format === 'doubles' && state.lastHitter === i && state.lastTouch !== 'block') return;
  const n = state.touches;
  const fromOpp = state.lastHitter >= 0 && state.players[state.lastHitter].team !== p.team;
  const attack = n === 0 && fromOpp && (state.lastTouch === 'spike' || state.lastTouch === 'serve' || state.lastTouch === 'block' || state.lastTouch === 'tip');
  const dist = Math.hypot(b.x - p.x, b.z - p.z);
  const spotX = () => {
    const mate = state.players[partnerOf(state, i)];
    const base = state.format === 'doubles' ? mate.x * 0.6 : p.x * 0.7;
    return clamp(base + clamp(input.mx, -1, 1) * s * 4, -10, 10);
  };

  if (p.act === 'dive') {
    if (dist > 3.4 * t.reach || b.y > 3.4) return;
    let q = 0.45 + rand(state) * 0.35;
    if (b.super) q *= 0.7;
    const wasSuper = b.super;
    if (attack) { p.stats.digs += 1; iceCheck(state, i); }
    p.stats.dives += 1;
    noteTouch(state, i, 'dive');
    if (wasSuper && q < 0.3) {
      p.swingT = -1;
      p.act = 'none';
      p.down = DOWN_KNOCKED;
      call(state, 'knocked', i);
      shank(state, s);
      return;
    }
    const from = { x: b.x, y: Math.max(b.y, 0.7), z: b.z };
    const v = n >= 2
      ? solve(from, clamp(b.x * 0.5, -8, 8), BALL_R, -s * 12, 1.5, 1.4)
      : solve(from, p.x + (spotX() - p.x) * 0.5 + (rand(state) - 0.5) * 3, 7.6, p.z + (s * 3.5 - p.z) * 0.5, 1.35, null);
    b.y = from.y;
    b.vx = v.vx;
    b.vy = v.vy;
    b.vz = v.vz;
    b.hot = false;
    b.super = false;
    if (n === 0) state.passQuality = q * 0.8;
    call(state, 'pancake', i);
    if (attack) addHeat(state, i, HEAT_PANCAKE);
    return;
  }

  // bump or set
  const isSet = p.act === 'set';
  const active = isSet ? SET_ACTIVE : BUMP_ACTIVE;
  if (p.swingT > active) return;
  if (dist > REACH * t.reach) return;
  if (b.y > (isSet ? SET_HEIGHT : BUMP_HEIGHT)) return;
  if (b.vy > 3) return; // still on its way up from a teammate

  const tq = timingQuality(p.swingT, isSet ? SET_SWEET : BUMP_SWEET, active, t.forgive);
  let q = tq;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const wasSuper = b.super;
  if (attack) q *= state.lastTouch === 'serve' ? clamp(1.1 - speed / 150, 0.8, 1) : clamp(1.2 - speed / 100, 0.55, 1);
  if (wasSuper && n === 0 && tq <= 0.85) q *= 0.6;
  if (attack) { p.stats.digs += 1; iceCheck(state, i); }
  const mz = clamp(Math.round(input.mz), -1, 1);
  const mx = clamp(input.mx, -1, 1);
  const from = { x: b.x, y: Math.max(b.y, 1.2), z: b.z };
  const err = 1 - q;

  if (wasSuper && n === 0 && q < 0.3) {
    noteTouch(state, i, 'bump');
    p.swingT = -1;
    p.act = 'none';
    p.down = DOWN_KNOCKED;
    call(state, 'knocked', i);
    shank(state, s);
    return;
  }
  if (q < 0.12) {
    noteTouch(state, i, 'bump');
    shank(state, s);
    return;
  }
  if (q > 0.93) state.perfectSeq += 1;

  let v: { vx: number; vy: number; vz: number };
  let touch: Touch;
  if (n >= 2 || (n === 0 && mz > 0)) {
    // over the net, deep
    let tx = mx * s * 6 + (rand(state) - 0.5) * err * 8;
    let depth = (mz < 0 ? 23 : 19) + (rand(state) - 0.5) * err * 8;
    if (t.shape > 0) {
      tx = clamp(tx, -(HALF_WIDTH - 1), HALF_WIDTH - 1);
      depth = Math.min(depth, HALF_LENGTH - 1 + (1 - t.shape) * 3);
    }
    v = solve(from, tx, BALL_R, -s * depth, 1.45, 1.5);
    touch = 'over';
  } else if (n === 0) {
    // pass to the setter's spot
    const tx = spotX() + (rand(state) - 0.5) * err * 9;
    const tz = s * Math.max(1.6, 3.5 + (rand(state) - 0.5) * err * 9 + err * 3);
    v = solve(from, tx, 7.6, tz, 1.25, null);
    touch = 'bump';
    state.passQuality = q;
    if (attack && q > 0.6) {
      addHeat(state, i, HEAT_DIG);
      if (wasSuper) call(state, 'dig', i);
    }
  } else {
    // set to the hitter's spot
    const mate = state.players[partnerOf(state, i)];
    const home = state.format === 'doubles' ? clamp(mate.x, -9.5, 9.5) : clamp(p.x, -9.5, 9.5);
    const tx = (mx !== 0 ? mx * s * 8 : home) + (rand(state) - 0.5) * err * 6;
    const off = (mz < 0 ? 8 : 2.8) + (rand(state) - 0.5) * err * 5 + err * 2;
    const time = mz > 0 ? 0.8 : mz < 0 ? 1.5 : 1.15;
    v = solve(from, tx, mz > 0 ? 9.8 : 10, s * Math.max(1.4, off), time, null);
    touch = 'set';
    state.setQuality = q;
    p.stats.sets += 1;
    if (q > 0.8) addHeat(state, i, HEAT_SET);
  }
  noteTouch(state, i, touch);
  b.y = from.y;
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.hot = false;
  b.super = false;
}

function spike(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  const t = state.traits[i];
  const b = state.ball;
  const s = sgn(p.team);
  const fire = p.fire > 0;
  const warm = !fire && p.heat >= HEAT_WARM;
  const dev = (p.swingT < SPIKE_SWEET ? (SPIKE_SWEET - p.swingT) / 34 : (p.swingT - SPIKE_SWEET) / 44) * (t.guard ? 0.35 : 1) * (1 - t.forgive * 0.6);
  const q = clamp(1 - dev * 0.95, 0, 1);
  const err = (1 - q) * (fire ? FIRE_ACCURACY : 1);
  const mz = clamp(Math.round(input.mz), -1, 1);
  const mx = clamp(input.mx, -1, 1);
  const tip = mz > 0;
  let tx = mx * s * 8 + (mx === 0 ? clamp(b.x * 0.35, -4, 4) : 0) + (rand(state) - 0.5) * err * 9;
  let depth = (tip ? 6 : mz < 0 ? 23 : 17) + (rand(state) - 0.5) * err * (tip ? 4 : 10);
  if (t.shape > 0) {
    const limX = HALF_WIDTH - 0.8;
    if (Math.abs(tx) > limX) tx = Math.sign(tx) * (limX + (Math.abs(tx) - limX) * (1 - t.shape));
    const limZ = HALF_LENGTH - 0.8;
    if (depth > limZ) depth = limZ + (depth - limZ) * (1 - t.shape);
  }
  const isSuper = !tip && (fire || (q > 0.92 && state.setQuality > 0.85));
  const tz = -s * Math.max(2, depth);
  const from = { x: b.x, y: b.y, z: b.z };
  let v: { vx: number; vy: number; vz: number };
  if (tip) {
    v = solve(from, tx, BALL_R, tz, 0.8, 0.5);
  } else {
    const speed = SPIKE_SPEED * (0.75 + 0.25 * q) * (fire ? FIRE_SPEED : warm ? WARM_SPEED : 1) * (isSuper ? SUPER_SPEED : 1);
    const time = Math.max(0.16, Math.hypot(tx - from.x, tz - from.z) / speed);
    // a clean swing that can't clear the tape becomes a roll shot; a bad one finds the net
    v = solve(from, tx, BALL_R, tz, time, q < 0.35 ? null : 0.2);
    if (q < 0.35) v.vy -= (0.35 - q) * 40;
  }
  noteTouch(state, i, tip ? 'tip' : 'spike');
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.hot = fire;
  b.super = isSuper;
  if (isSuper) {
    state.superSeq += 1;
    p.stats.supers += 1;
    call(state, 'super', i);
  }
  if (q > 0.93) state.perfectSeq += 1;
  if (q > 0.9) addHeat(state, i, HEAT_SWEET);
}

function tryBlock(state: GameState, i: number) {
  const p = state.players[i];
  const b = state.ball;
  const s = sgn(p.team);
  if (p.y < 1.0 || p.swingT > 100) return;
  const prev = state.lastHitter;
  if (prev < 0 || state.players[prev].team === p.team) return;
  if (b.vz * s <= 0) return;
  const zz = b.z * s;
  if (zz < -0.7 || zz > 2.0) return;
  if (Math.abs(b.x - p.x) > 1.7) return;
  if (b.y < p.y + 5.5 || b.y > p.y + 9.3 || b.y < NET_HEIGHT - 0.2) return;

  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const tq = clamp((p.y - 0.8) / 2, 0, 1);
  const r = rand(state);
  if (zz <= 0) onCross(state);
  p.swingHit = true;
  p.stats.hits += 1;
  p.stats.blocks += 1;
  state.blockSeq += 1;
  state.blockOf = prev;
  state.hits += 1;
  state.touched |= 1 << i;
  state.touches = 0;
  state.touchTeam = p.team;
  state.lastHitter = i;
  state.lastTouch = 'block';
  state.netted = false;
  state.hitSeq += 1;
  state.hitTick = state.tick;
  b.hot = false;
  b.super = false;

  if (tq > 0.55 && speed > 38 && r < 0.3 + tq * 0.45) {
    // stuffed: straight back down on their side
    b.z = -s * 0.7;
    b.vz = -s * (13 + speed * 0.2);
    b.vy = -7 - rand(state) * 6;
    b.vx = b.vx * 0.25 + (rand(state) - 0.5) * 10;
    state.attacker = i;
    state.attackKind = 'block';
    state.crossings += 1;
  } else if (tq < 0.3 && r < 0.5) {
    // off the hands and away: a tool
    b.z = s * 1.0;
    b.vx = (rand(state) < 0.5 ? -1 : 1) * (16 + rand(state) * 8);
    b.vy = 9;
    b.vz = s * 6;
  } else {
    // a soft block: it pops up on the blockers' side, and the blocker may play it again
    b.z = s * 1.2;
    b.vz = s * (3 + rand(state) * 5);
    b.vy = 13 + rand(state) * 5;
    b.vx = b.vx * 0.2 + (rand(state) - 0.5) * 6;
  }
}

// ————— the step —————

export function step(prev: GameState, inputs: PlayerInput[]): GameState {
  const state = cloneState(prev);
  state.tick += 1;
  state.phaseTicks += 1;

  if (state.phase === 'over') {
    for (const p of state.players) fall(p);
    stepBall(state.ball);
    return state;
  }

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const input = inputs[i] ?? IDLE;
    tickAct(p);
    if (input.swing) {
      if (state.phase === 'serve' && i === state.server) {
        if (state.toss < 0) {
          if (state.phaseTicks >= SERVE_READY) {
            state.toss = 0;
            const s = sgn(p.team);
            state.ball = { x: p.x - s * 0.3, y: 6.5, z: p.z - s * 0.9, vx: 0, vy: 17, vz: -s * 1.2, hot: p.fire > 0, super: false };
          }
        } else if (state.toss >= 10) {
          serveHit(state, input, true);
        }
      } else if (p.swingT < 0 && p.cooldown <= 0 && p.down <= 0 && p.y <= 0) {
        startAct(state, i, input);
      }
    }
    const bx = p.x;
    const bz = p.z;
    movePlayer(state, i, p, input);
    fall(p);
    p.stats.run += Math.hypot(p.x - bx, p.z - bz);
    if (state.phase === 'rally' && p.fire > 0) {
      p.fire -= 100 / (FIRE_SECONDS * HZ);
      if (p.fire <= 0) { putOut(state, i, 0); call(state, 'cooled', i); }
    }
  }

  if (state.phase === 'serve') {
    if (state.toss < 0) {
      holdBall(state);
    } else {
      state.toss += 1;
      const b = state.ball;
      b.vy -= BALL_GRAVITY * DT;
      b.y += b.vy * DT;
      b.z += b.vz * DT;
      // no second press: a safe standing float serve as it comes back down
      if (b.vy < 0 && b.y <= 7.5) serveHit(state, inputs[state.server] ?? IDLE, false);
    }
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

  // rally: contact first, closest player first, then flight
  const order = state.players.map((_, i) => i).sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    return Math.hypot(pa.x - state.ball.x, pa.z - state.ball.z) - Math.hypot(pb.x - state.ball.x, pb.z - state.ball.z) || a - b;
  });
  const seq = state.hitSeq;
  for (const i of order) {
    if (state.hitSeq !== seq) break; // one contact a tick
    tryContact(state, i, inputs[i] ?? IDLE);
  }

  const pz = state.ball.z;
  const ev = stepBall(state.ball);
  if (ev === 'net') state.netted = true;
  else if ((pz > 0 && state.ball.z <= 0) || (pz < 0 && state.ball.z >= 0)) onCross(state);
  if (ev === 'floor') onFloor(state);
  return state;
}

/** a fresh game for a rematch: new seed, the previous loser serves first, same people */
export function rematch(prev: GameState, seed: number): GameState {
  const first: Team = prev.winner === -1 ? 0 : other(prev.winner);
  return createGame(seed, { format: prev.format, firstTeam: first, traits: prev.traits });
}
