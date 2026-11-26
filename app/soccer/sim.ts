// Soccer: arcade, small-sided, in a walled arena. 1v1 or 2v2 out on the pitch, plus a
// goalkeeper on each side that the game plays. First to five.
//
// Pure TypeScript, no DOM, no Date, no Math.random. step(state, inputs) returns the next
// state without touching the one it was given; same seed and same inputs give the same
// game. Units are feet and seconds; the halfway line is z = 0.
//
// Team 0 defends the goal at z = +HALF_LENGTH and attacks the one at -HALF_LENGTH. The
// players a person or bot controls come first (singles [0, 1], doubles [0, 0, 1, 1]);
// the two keepers come last, team 0's then team 1's, and ignore their inputs: the
// simulation plays them, so they're the same for everyone and every replay.
//
// What makes it a game is the keeper. It stands on the line between the ball and its
// goal, steps across, dives and catches, all physically: a shot it can reach in time it
// stops. So a shot down the middle is a gift, and scoring is about placement and pace:
// the corners, a curler round it, a chip when it comes off its line, a one-timer before
// it's set, a bank off the boards. Shooting under pressure, or on the run, costs you
// accuracy.
//
// The right thumb (or the one button) on the ball:
//   tap          low shot (or a pass, with a teammate), placed by the stick
//   swipe up     placed shot: tilt picks the side; a long swipe goes top corner, hard
//   short flick  chip, over a keeper who's come out
//   sideways     curler: starts outside the post and bends in
//   swipe down   slide tackle (off the ball)
// Swipe before the ball reaches you and it waits, then strikes it first time.

import { IDLE, other, sgn, type Format, type PlayerInput, type Shot, type Team, type Traits } from '../pickleball/sim';

export { IDLE, other, sgn };
export type { Format, PlayerInput, Shot, Team, Traits };

export const HZ = 120;
export const DT = 1 / HZ;

export const HALF_WIDTH = 22;
export const HALF_LENGTH = 34;
export const GOAL_HALF = 7;
export const GOAL_H = 6.5;
export const GOAL_DEPTH = 4;
/** the keeper's area: field players stay out, the keeper stays in */
export const AREA_HALF = 11;
export const AREA_DEPTH = 6;
export const CENTER_R = 7;
/** drawn: the bigger box (for looks and the save call) */
export const BOX_HALF = 15;
export const BOX_DEPTH = 13;

export const BALL_R = 0.72;
export const BALL_GRAVITY = 32;
const GROUND_BOUNCE = 0.5;
const WALL_BOUNCE = 0.74;
const ROLL_DRAG = 0.5;
const ROLL_DECEL = 2.5;

export const PLAYER_SPEED = 17;
const ACCEL = 14;
const BODY_R = 1.25;
const BODY_H = 5.6;
export const CONTROL_R = 2.3;
export const KICK_R = 3.1;
const STEAL_R = 1.6;
const STEAL_TICKS = 38;
const DRIBBLE_AHEAD = 1.6;
const TOUCH_COOL = 50;

export const SHOT_SPEED = 66;
const LOW_SPEED = 58;
const TOP_SPEED = 66;
const CHIP_SPEED = 30;
const PASS_SPEED = 44;
/** a one-timer goes this much harder */
const ONE_TIMER = 1.1;
const TRAP_MAX = 36;

// ————— the keepers —————
const KEEPER_SPEED = 12;
/** how long a keeper takes to react to a shot, in ticks */
const KEEPER_REACT = 15;
const KEEPER_REACH = 1.6;
/** how high a standing keeper's hands go: under the bar, so a chip that drops in beats it */
const KEEPER_HANDS = 5.5;
const KEEPER_DIVE_SPEED = 21;
const KEEPER_DIVE_REACH = 2;
/** how far a keeper can misjudge where a shot is going, in feet, plus a foot per this much pace */
const KEEPER_GUESS = 1;
const KEEPER_GUESS_PACE = 24;
export const KEEPER_DIVE_TICKS = 30;
const KEEPER_DOWN = 50;
/** a keeper catches anything slower than this that it gets to */
const KEEPER_CATCH = 46;
const KEEPER_HOLD = 80;

export const KICK_TICKS = 32;
export const SLIDE_TICKS = 36;
const SLIDE_SPEED = 26;
export const DOWN_SLIDE = 44;
const SLIDE_REACH = 2.7;
const SHOT_WAIT = 72;

export const GAME_TO = 5;
export const POINT_PAUSE = 230;
const KICKOFF_AUTO = 6 * HZ;

// ————— hot streaks —————
export const HEAT_MAX = 100;
export const HEAT_WARM = 50;
const HEAT_GOAL = 34;
const HEAT_STEAL = 9;
const HEAT_ONE_TIMER = 7;
const HEAT_CONCEDE = 26;
export const FIRE_SECONDS = 18;
const FIRE_SHOT = 1.2;
const FIRE_MOVE = 1.08;

export type Phase = 'serve' | 'rally' | 'point' | 'over';
export type Act = 'none' | 'kick' | 'slide' | 'dive';
export type Kick = 'low' | 'shot' | 'top' | 'chip' | 'curl' | 'pass' | 'clear';
export type How = 'goal' | 'corner' | 'curl' | 'chip' | 'onetimer' | 'bank' | 'super' | 'own';

export interface PlayerStats {
  goals: number;
  shots: number;
  onTarget: number;
  saves: number;
  steals: number;
  tackles: number;
  passes: number;
  oneTimers: number;
  curlers: number;
  supers: number;
  run: number;
  fires: number;
  hits: number;
}

export interface Player {
  team: Team;
  keeper: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** always 0; read by shared code */
  y: number;
  /** which way they face, a unit vector */
  fx: number;
  fz: number;
  swingT: number;
  act: Act;
  down: number;
  touchCool: number;
  /** ticks on the ball while someone else dribbles it */
  press: number;
  heat: number;
  fire: number;
  chefUntil: number;
  qShot: Shot | null;
  qT: number;
  /** keeper: ticks since it saw the shot it's reacting to, -1 for none */
  react: number;
  /** keeper: how far off its read of this shot is, in feet */
  guess: number;
  stats: PlayerStats;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** sideways bend, ft/s², for a curler */
  curl: number;
  hot: boolean;
  super: boolean;
}

export interface PointResult {
  faultTeam: Team;
  faultBy: number;
  reason: string;
  scorer: Team;
  sideOut: boolean;
  shotBy: number;
  rally: number;
  how: How;
}

export type CallKind =
  | 'start' | 'goal' | 'corner' | 'curl' | 'chip' | 'onetimer' | 'bank' | 'super' | 'own' | 'save' | 'catch' | 'bar'
  | 'tackle' | 'hattrick' | 'warm' | 'fire' | 'doused' | 'tied' | 'game-point' | 'win';

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
  ball: Ball;
  owner: number;
  held: number;
  lastHitter: number;
  lastKick: Kick;
  /** who last struck at goal, and whether first time */
  shooter: number;
  oneTimer: boolean;
  /** where the last shot was aimed across the mouth, -1..1 (0 the middle) */
  shotAim: number;
  wallHits: number;
  touches: number;
  hitTick: number;
  lastBounce: { x: number; z: number; tick: number; in: boolean } | null;
  lastPoint: PointResult | null;
  pointSeq: number;
  hitSeq: number;
  bounceSeq: number;
  superSeq: number;
  winner: Team | -1;
  calls: Call[];
  callSeq: number;
}

const ZERO_STATS: PlayerStats = { goals: 0, shots: 0, onTarget: 0, saves: 0, steals: 0, tackles: 0, passes: 0, oneTimers: 0, curlers: 0, supers: 0, run: 0, fires: 0, hits: 0 };
const ADULT: Traits = { speed: 1, reach: 1, forgive: 0, heat: 1, shape: 0, guard: false };

// ————— helpers —————

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function rand(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** the field players of a team (not the keeper) */
export function teamPlayers(state: Pick<GameState, 'players'>, team: Team): number[] {
  const out: number[] = [];
  state.players.forEach((p, i) => { if (p.team === team && !p.keeper) out.push(i); });
  return out;
}

export function keeperOf(state: Pick<GameState, 'players'>, team: Team): number {
  return state.players.findIndex((p) => p.keeper && p.team === team);
}

export function mateOf(state: Pick<GameState, 'players'>, i: number): number {
  return teamPlayers(state, state.players[i].team).find((m) => m !== i) ?? -1;
}

export function attackZ(team: Team): number {
  return -sgn(team) * HALF_LENGTH;
}

/** inside a team's keeper area (the one in front of its own goal) */
export function inArea(team: Team, x: number, z: number, pad = 0): boolean {
  const s = sgn(team);
  return Math.abs(x) < AREA_HALF + pad && z * s > HALF_LENGTH - AREA_DEPTH - pad;
}

export function scoreCall(state: GameState): string {
  return `${state.scores[0]}–${state.scores[1]}`;
}

function newPlayer(team: Team, keeper: boolean): Player {
  const s = sgn(team);
  return {
    team, keeper, x: 0, z: s * (keeper ? HALF_LENGTH - 2 : 14), vx: 0, vz: 0, y: 0, fx: 0, fz: -s, swingT: -1, act: 'none', down: 0,
    touchCool: 0, press: 0, heat: 0, fire: 0, chefUntil: 0, qShot: null, qT: 0, react: -1, guess: 0, stats: { ...ZERO_STATS },
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    scores: [s.scores[0], s.scores[1]],
    players: s.players.map((p) => ({ ...p, qShot: p.qShot ? { ...p.qShot } : null, stats: { ...p.stats } })),
    traits: s.traits,
    ball: { ...s.ball },
    lastBounce: s.lastBounce ? { ...s.lastBounce } : null,
    lastPoint: s.lastPoint ? { ...s.lastPoint } : null,
    calls: s.calls.slice(),
  };
}

function call(state: GameState, kind: CallKind, player = -1, n?: number) {
  state.callSeq += 1;
  state.calls.push({ seq: state.callSeq, kind, player, n });
  if (state.calls.length > 12) state.calls.splice(0, state.calls.length - 12);
}

// ————— setting up —————

export function createGame(seed: number, opts: { format: Format; traits: Traits[]; firstTeam?: Team }): GameState {
  const n = opts.format === 'doubles' ? 4 : 2;
  const players: Player[] = [];
  for (let i = 0; i < n; i++) players.push(newPlayer(opts.format === 'doubles' ? (i < 2 ? 0 : 1) : (i as Team), false));
  players.push(newPlayer(0, true), newPlayer(1, true));
  const traits = Array.from({ length: players.length }, (_, i) => (i < n ? opts.traits[i] : undefined) ?? ADULT);
  const first: Team = opts.firstTeam ?? ((seed & 1) as Team);
  const state: GameState = {
    seed, rng: seed >>> 0, tick: 0, format: opts.format, phase: 'serve', phaseTicks: 0, players, traits, scores: [0, 0],
    servingTeam: first, server: teamPlayers({ players }, first)[0],
    ball: { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, curl: 0, hot: false, super: false },
    owner: -1, held: 0, lastHitter: -1, lastKick: 'shot', shooter: -1, oneTimer: false, shotAim: 0, wallHits: 0, touches: 0, hitTick: 0,
    lastBounce: null, lastPoint: null, pointSeq: 0, hitSeq: 0, bounceSeq: 0, superSeq: 0, winner: -1, calls: [], callSeq: 0,
  };
  kickoff(state, first);
  call(state, 'start', state.server);
  return state;
}

export function rematch(prev: GameState, seed: number): GameState {
  const seats = prev.players.filter((p) => !p.keeper).length;
  return createGame(seed, { format: prev.format, traits: prev.traits.slice(0, seats), firstTeam: other(prev.winner === -1 ? prev.servingTeam : prev.winner) });
}

function kickoff(state: GameState, team: Team) {
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.servingTeam = team;
  const mine = teamPlayers(state, team);
  state.server = mine.length > 1 && state.server === mine[0] && state.pointSeq > 0 ? mine[1] : mine[0];
  state.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, curl: 0, hot: false, super: false };
  state.owner = -1;
  state.held = 0;
  state.lastHitter = -1;
  state.shooter = -1;
  state.wallHits = 0;
  state.touches = 0;
  state.lastBounce = null;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const s = sgn(p.team);
    if (p.keeper) {
      p.x = 0;
      p.z = s * (HALF_LENGTH - 2);
    } else {
      const mates = teamPlayers(state, p.team);
      const k = mates.indexOf(i);
      if (i === state.server) { p.x = 0; p.z = s * 2.2; }
      else if (p.team === team) { p.x = mates.length > 1 ? (k === 0 ? -9 : 9) : 0; p.z = s * 10; }
      else { p.x = mates.length > 1 ? (k === 0 ? -7 : 7) : 0; p.z = s * (CENTER_R + 4); }
    }
    p.vx = 0;
    p.vz = 0;
    p.fx = 0;
    p.fz = -s;
    p.swingT = -1;
    p.act = 'none';
    p.down = 0;
    p.touchCool = 0;
    p.press = 0;
    p.qShot = null;
    p.react = -1;
  }
}

// ————— the ball —————

export function stepBall(b: Ball): { wall: boolean; bar: boolean; bounced: boolean } {
  let wall = false;
  let bar = false;
  let bounced = false;
  if (b.y > BALL_R + 0.02 || b.vy > 0) b.vy -= BALL_GRAVITY * DT;
  // a curler bends across its line, less as it slows
  if (b.curl !== 0) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 8) {
      const px = -b.vz / sp;
      const pz = b.vx / sp;
      b.vx += px * b.curl * DT;
      b.vz += pz * b.curl * DT;
    }
    b.curl *= 1 - 1.1 * DT;
    if (Math.abs(b.curl) < 1) b.curl = 0;
  }
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < -4) { b.vy = -b.vy * GROUND_BOUNCE; bounced = true; }
    else b.vy = 0;
  }
  if (b.y <= BALL_R + 0.02 && b.vy === 0) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const next = Math.max(0, sp * (1 - ROLL_DRAG * DT) - ROLL_DECEL * DT);
      b.vx *= next / sp;
      b.vz *= next / sp;
    }
  }
  if (Math.abs(b.x) > HALF_WIDTH - BALL_R) {
    b.x = Math.sign(b.x) * (HALF_WIDTH - BALL_R);
    b.vx = -b.vx * WALL_BOUNCE;
    b.curl = 0;
    wall = true;
  }
  const endZ = HALF_LENGTH - BALL_R;
  const inGoal = Math.abs(b.z) > HALF_LENGTH;
  if (!inGoal && Math.abs(b.z) > endZ) {
    const mouth = Math.abs(b.x) < GOAL_HALF - BALL_R * 0.4 && b.y < GOAL_H - BALL_R * 0.4;
    const frame = Math.abs(b.x) < GOAL_HALF + BALL_R && b.y < GOAL_H + BALL_R;
    if (!mouth) {
      b.z = Math.sign(b.z) * endZ;
      b.vz = -b.vz * WALL_BOUNCE;
      b.curl = 0;
      if (frame) bar = true;
      else wall = true;
    }
  }
  if (inGoal) {
    const back = HALF_LENGTH + GOAL_DEPTH - BALL_R;
    if (Math.abs(b.z) > back) { b.z = Math.sign(b.z) * back; b.vz = -b.vz * 0.15; }
    if (Math.abs(b.x) > GOAL_HALF - BALL_R) { b.x = Math.sign(b.x) * (GOAL_HALF - BALL_R); b.vx = -b.vx * 0.2; }
    if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy = -Math.abs(b.vy) * 0.2; }
    b.vx *= 1 - 3 * DT;
    b.vz *= 1 - 3 * DT;
    b.curl = 0;
  }
  return { wall, bar, bounced };
}

export function landing(b: Ball): { x: number; z: number; t: number } {
  const h = b.y - BALL_R;
  const t = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * BALL_GRAVITY * h))) / BALL_GRAVITY;
  return { x: clamp(b.x + b.vx * t, -HALF_WIDTH, HALF_WIDTH), z: clamp(b.z + b.vz * t, -HALF_LENGTH, HALF_LENGTH), t };
}

/** where the ball will cross the plane z = atZ, simulated (curl, gravity, walls), within `max` seconds */
export function crossing(b0: Ball, atZ: number, max = 2): { x: number; y: number; t: number } | null {
  const b = { ...b0 };
  const dir = Math.sign(atZ - b.z);
  if (dir === 0 || b.vz * dir <= 0.5) return null;
  for (let k = 0; k < max * HZ; k++) {
    stepBall(b);
    if ((b.z - atZ) * dir >= 0) return { x: b.x, y: b.y, t: (k + 1) * DT };
    if (b.vz * dir <= 0) return null;
  }
  return null;
}

// ————— the players —————

function wish(p: Player, input: PlayerInput): { x: number; z: number; k: number } {
  const s = sgn(p.team);
  const x = clamp(input.mx, -1, 1) * s;
  const z = -clamp(input.mz, -1, 1) * s;
  const d = Math.hypot(x, z);
  if (d < 0.12) return { x: 0, z: 0, k: 0 };
  return { x: x / d, z: z / d, k: Math.min(1, d) };
}

/** keep a player where they're allowed: keepers in their area, everyone else out of both */
function confine(p: Player) {
  const s = sgn(p.team);
  if (p.keeper) {
    p.x = clamp(p.x, -AREA_HALF + 1, AREA_HALF - 1);
    p.z = s * clamp(p.z * s, HALF_LENGTH - AREA_DEPTH + 0.5, HALF_LENGTH - 0.8);
    return;
  }
  p.x = clamp(p.x, -HALF_WIDTH + 1, HALF_WIDTH - 1);
  p.z = clamp(p.z, -HALF_LENGTH + 1, HALF_LENGTH - 1);
  for (const t of [0, 1] as Team[]) {
    if (inArea(t, p.x, p.z)) {
      // out the nearer way: the front or a side
      const ts = sgn(t);
      const front = HALF_LENGTH - AREA_DEPTH - (p.z * ts);
      const side = AREA_HALF - Math.abs(p.x);
      if (-front < side) p.z = ts * (HALF_LENGTH - AREA_DEPTH);
      else p.x = Math.sign(p.x || 1) * AREA_HALF;
    }
  }
}

export function movePlayer(state: GameState, i: number, p: Player, input: PlayerInput) {
  const t = state.traits[i] ?? ADULT;
  if (p.down > 0) {
    p.vx *= 0.9;
    p.vz *= 0.9;
  } else if (p.act === 'slide' || p.act === 'dive') {
    p.vx *= 0.985;
    p.vz *= 0.985;
  } else if (!p.keeper) {
    const w = wish(p, input);
    const top = PLAYER_SPEED * t.speed * (p.fire > 0 ? FIRE_MOVE : 1) * (state.owner === i ? 0.88 : 1) * (p.swingT >= 0 ? 0.6 : 1);
    const k = Math.min(1, ACCEL * DT);
    p.vx += (w.x * w.k * top - p.vx) * k;
    p.vz += (w.z * w.k * top - p.vz) * k;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 1.5) { p.fx = p.vx / sp; p.fz = p.vz / sp; }
  }
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  confine(p);
  if (state.phase === 'serve' && !p.keeper) {
    const s = sgn(p.team);
    if (p.z * s < 0.8) p.z = s * 0.8;
    if (p.team !== state.servingTeam) {
      const d = Math.hypot(p.x, p.z);
      if (d < CENTER_R) { const k = CENTER_R / Math.max(0.01, d); p.x *= k; p.z *= k; if (d < 0.01) p.z = s * CENTER_R; }
    }
  }
}

export function coastPlayer(p: Player) {
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  confine(p);
}

function separate(state: GameState) {
  const ps = state.players;
  for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      const dx = ps[b].x - ps[a].x;
      const dz = ps[b].z - ps[a].z;
      const d = Math.hypot(dx, dz);
      const min = BODY_R * 1.7;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        ps[a].x -= (dx / d) * push;
        ps[a].z -= (dz / d) * push;
        ps[b].x += (dx / d) * push;
        ps[b].z += (dz / d) * push;
      }
    }
  }
}

// ————— the keepers —————

function keeperStep(state: GameState, i: number) {
  const k = state.players[i];
  const s = sgn(k.team);
  const b = state.ball;
  const goalZ = s * HALF_LENGTH;
  if (k.down > 0 || k.act === 'dive') { k.x += k.vx * DT; k.z += k.vz * DT; k.vx *= 0.96; k.vz *= 0.96; confine(k); return; }

  // holding it: look up, then roll it out to a teammate
  if (state.owner === i) {
    k.vx = 0;
    k.vz = 0;
    if (state.held > KEEPER_HOLD) {
      const mates = teamPlayers(state, k.team);
      let tx = 0;
      let tz = -s * 8;
      if (mates.length) {
        // the one furthest from any opponent
        const opp = teamPlayers(state, other(k.team)).map((o) => state.players[o]);
        const best = mates.map((m) => state.players[m]).sort((a, c) => {
          const free = (p: Player) => Math.min(...opp.map((o) => Math.hypot(o.x - p.x, o.z - p.z)), 99);
          return free(c) - free(a);
        })[0];
        tx = best.x;
        tz = best.z;
        // never a little pass to someone at the edge of the area: play it out long
        if (Math.abs(tz - k.z) < 14) tz = k.z - s * 16;
      }
      strike(state, i, tx, tz, PASS_SPEED, 2.5, 'clear');
      k.touchCool = 60;
    }
    return;
  }

  // a shot coming: read where it crosses the goal line, react, and go
  const coming = b.vz * s > 10 && state.owner === -1;
  const cross = coming ? crossing(b, goalZ - s * 1.2, 1.6) : null;
  const onTarget = cross && Math.abs(cross.x) < GOAL_HALF + 1 && cross.y < GOAL_H + 1;
  if (onTarget) {
    if (k.react < 0) {
      // the read: a hard shot is harder to judge
      k.react = 0;
      // with more time it reads it better: a long shot is seen all the way
      const time = cross ? clamp(0.32 / Math.max(0.1, cross.t), 0.3, 1.3) : 1;
      k.guess = (rand(state) - 0.5) * 2 * (KEEPER_GUESS + Math.hypot(b.vx, b.vz) / KEEPER_GUESS_PACE) * time;
    }
    k.react += 1;
    // a one-timer catches it a beat late
    const late = KEEPER_REACT + (state.oneTimer ? 9 : 0);
    if (k.react > late) {
      const tx = clamp(cross.x + k.guess, -GOAL_HALF, GOAL_HALF);
      const dx = tx - k.x;
      const need = Math.abs(dx) - KEEPER_REACH;
      // can I get there on my feet? if not, and it's close, dive
      if (need > KEEPER_SPEED * cross.t && need < KEEPER_SPEED * cross.t + KEEPER_DIVE_REACH + 2.5 && cross.t < 0.55) {
        k.act = 'dive';
        k.swingT = 0;
        k.vx = Math.sign(dx) * KEEPER_DIVE_SPEED;
        k.vz = 0;
        return;
      }
      k.vx = clamp(dx * 9, -KEEPER_SPEED, KEEPER_SPEED);
      // it holds its depth: a keeper caught off its line can't scramble back, which is
      // the whole point of a chip
      k.vz = clamp((goalZ - s * 1.6 - k.z) * 6, -1.8, 1.8);
    } else {
      k.vx *= 0.8;
      k.vz *= 0.8;
    }
  } else if (state.owner === -1 && k.touchCool === 0 && b.y < 1.6 && inArea(k.team, b.x, b.z, 0.5) && Math.hypot(b.vx, b.vz) < 26) {
    // loose in my area, where nobody else may go: mine to collect
    k.react = -1;
    k.vx = clamp((b.x - k.x) * 6, -KEEPER_SPEED, KEEPER_SPEED);
    k.vz = clamp((b.z - k.z) * 6, -KEEPER_SPEED, KEEPER_SPEED);
  } else {
    k.react = -1;
    // set: on the line from the ball to the middle of the goal, a step or two out
    // (further out the closer the ball, to narrow the angle, which is what a chip punishes)
    const dist = Math.hypot(b.x, b.z - goalZ);
    const out = clamp(1.6 + (32 - dist) * 0.22, 1.6, AREA_DEPTH - 0.8);
    const ux = b.x / Math.max(1, dist);
    const tx = clamp(ux * out * 1.6, -GOAL_HALF + 1, GOAL_HALF - 1);
    const tz = goalZ - s * out;
    k.vx = clamp((tx - k.x) * 5, -KEEPER_SPEED * 0.7, KEEPER_SPEED * 0.7);
    k.vz = clamp((tz - k.z) * 5, -KEEPER_SPEED * 0.7, KEEPER_SPEED * 0.7);
  }
  k.fx = 0;
  k.fz = -s;
  k.x += k.vx * DT;
  k.z += k.vz * DT;
  confine(k);
}

// ————— kicking —————

function touch(state: GameState, i: number) {
  state.lastHitter = i;
  state.hitSeq += 1;
  state.hitTick = state.tick;
  state.touches += 1;
  state.wallHits = 0;
  state.players[i].stats.hits += 1;
  if (state.phase === 'serve') { state.phase = 'rally'; state.phaseTicks = 0; }
}

function strike(state: GameState, i: number, tx: number, tz: number, v: number, vy: number, kind: Kick, curl = 0) {
  const b = state.ball;
  const p = state.players[i];
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz) || 1;
  b.vx = (dx / d) * v;
  b.vz = (dz / d) * v;
  b.vy = vy;
  b.curl = curl;
  if (b.y < BALL_R + 0.05) b.y = BALL_R + 0.06;
  b.hot = p.fire > 0 && kind !== 'pass' && kind !== 'clear';
  b.super = false;
  state.owner = -1;
  state.held = 0;
  state.lastKick = kind;
  p.touchCool = 12;
  p.qShot = null;
  p.act = 'kick';
  p.swingT = 0;
  if (!p.keeper) { p.fx = dx / d; p.fz = dz / d; }
  touch(state, i);
}

/**
 * A shot at goal. aimX is where across the mouth, -1..1 in the shooter's own view
 * (their left to their right); kind sets height, pace and shape.
 */
function shoot(state: GameState, i: number, kind: Kick, aimX: number, first: boolean) {
  const p = state.players[i];
  const t = state.traits[i] ?? ADULT;
  const s = sgn(p.team);
  const b = state.ball;
  const gz = attackZ(p.team);
  const dist = Math.hypot(b.x, gz - b.z);
  // Accuracy: distance, pace on the run, and a defender on you all widen the miss.
  // Fire, a forgiving character and a settled first touch tighten it.
  const pressure = state.players.some((o) => o.team !== p.team && !o.keeper && Math.hypot(o.x - p.x, o.z - p.z) < 4.5) ? 1.6 : 1;
  const running = Math.hypot(p.vx, p.vz) / PLAYER_SPEED;
  const spread = (0.4 + dist / 40) * (1 + running * 0.35) * pressure * (1 - t.forgive * 0.4) * (p.fire > 0 ? 0.45 : 1);
  const want = clamp(aimX, -1, 1) * (GOAL_HALF - 1.4);
  const tx = s * want + (rand(state) - 0.5) * 2 * spread;
  const fire = p.fire > 0;
  const boost = (fire ? FIRE_SHOT : 1) * (first ? ONE_TIMER : 1);
  // rise so it arrives at the height asked for: low, mid, or under the bar
  const arrive = (v: number, h: number) => {
    const tt = dist / v;
    return (h - BALL_R + 0.5 * BALL_GRAVITY * tt * tt) / tt;
  };
  let v = SHOT_SPEED * boost;
  let vy = arrive(v, 2.6);
  let curl = 0;
  const aimZ = gz;
  let aimXWorld = tx;
  if (kind === 'low') { v = LOW_SPEED * boost; vy = arrive(v, 1.1); }
  // top corner: the best finish, and the riskiest: it can sail over
  else if (kind === 'top') { v = TOP_SPEED * boost; vy = arrive(v, GOAL_H - 1.3 + (rand(state) - 0.35) * spread * 0.9); }
  else if (kind === 'chip') {
    // up high and dropping steeply in under the bar: over a keeper off its line
    const apex = 8.2;
    vy = Math.sqrt(2 * BALL_GRAVITY * (apex - BALL_R));
    const land = GOAL_H - 1 - BALL_R;
    const tt = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * BALL_GRAVITY * land))) / BALL_GRAVITY;
    v = clamp(dist / tt, 7, CHIP_SPEED * 1.6);
  } else if (kind === 'curl') {
    // start outside the post on that side and bend it back in, just inside it. The bend
    // is what pushes it from the aim point to the target; it fades as the ball slows,
    // so it's set a little stronger than the plain 2d/t² would say.
    v = SHOT_SPEED * 0.86 * boost;
    const side = Math.sign(aimX) || 1;
    const target = s * side * (GOAL_HALF - 2.7);
    aimXWorld = s * side * (GOAL_HALF + 5) + (rand(state) - 0.5) * spread;
    // how far the target sits off the straight line to the aim point, square to it
    const ax0 = aimXWorld - b.x;
    const az0 = gz - b.z;
    const len = Math.hypot(ax0, az0) || 1;
    const off = (ax0 * (gz - b.z) - az0 * (target - b.x)) / len;
    const tt = len / v;
    // the bend pushes along (-vz, vx)/|v|; pick its sign so it closes the gap
    const px = -az0 / len;
    const pz = ax0 / len;
    const towardTarget = px * (target - aimXWorld) + pz * 0;
    curl = Math.sign(towardTarget || 1) * ((2 * Math.abs(off)) / (tt * tt)) * 1.25;
    vy = arrive(v, 2.2);
    p.stats.curlers += 1;
  }
  strike(state, i, aimXWorld, aimZ, v, vy, kind, curl);
  state.shooter = i;
  state.oneTimer = first;
  state.shotAim = Math.abs(want) / (GOAL_HALF - 1.4);
  p.stats.shots += 1;
  if (first) { p.stats.oneTimers += 1; addHeat(state, i, HEAT_ONE_TIMER); }
  if (fire) {
    state.ball.super = true;
    state.superSeq += 1;
    p.stats.supers += 1;
    call(state, 'super', i);
  }
}

function pass(state: GameState, i: number, aimX: number) {
  const p = state.players[i];
  const s = sgn(p.team);
  const b = state.ball;
  const mate = mateOf(state, i);
  if (mate >= 0) {
    const m = state.players[mate];
    const tx = m.x + m.vx * 0.35;
    const tz = m.z + m.vz * 0.35 - s * 3;
    const d = Math.hypot(tx - b.x, tz - b.z);
    strike(state, i, tx, tz, clamp(d * 1.3 + 18, 26, PASS_SPEED * 1.2), 1.2, 'pass');
    p.stats.passes += 1;
    return;
  }
  // alone: knock it on into space, the way the stick points (or straight on)
  strike(state, i, b.x + aimX * s * 8, b.z - s * 9, 30, 0.5, 'pass');
}

function kindOf(shot: Shot): Kick {
  if (shot.act === 'jump') return shot.az > 0.5 ? 'chip' : shot.az < -0.5 ? 'top' : 'shot';
  // a sideways swipe is exactly ±1; a tap aimed with the stick never is
  if (shot.act === 'pass' && Math.abs(shot.ax) === 1) return 'curl';
  return 'low';
}

function canKick(state: GameState, i: number): boolean {
  const p = state.players[i];
  if (state.owner === i) return true;
  if (state.owner !== -1 || p.touchCool > 0 || p.down > 0 || p.act === 'slide') return false;
  const b = state.ball;
  return Math.hypot(b.x - p.x, b.z - p.z) < KICK_R && b.y < 4.5;
}

/** make a kick: a shot, or (with a teammate, on a plain tap) a pass */
function fire(state: GameState, i: number, shot: Shot, first: boolean) {
  const kind = kindOf(shot);
  const mate = mateOf(state, i);
  if (kind === 'low' && shot.az === 0 && Math.abs(shot.ax) < 0.01 && mate >= 0 && !first) { pass(state, i, 0); return; }
  shoot(state, i, kind, shot.ax, first);
}

function press(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.keeper || p.down > 0 || p.act === 'slide') return;
  if (state.phase === 'serve' && i !== state.server) return;
  const shot = input.shot ?? null;
  if (shot?.act === 'dive') { slide(state, i, input); return; }
  const b = state.ball;
  const dBall = Math.hypot(b.x - p.x, b.z - p.z);
  if (!shot) {
    // the one button: shoot, placed by the stick; without the ball, tackle
    if (canKick(state, i)) { shoot(state, i, 'shot', clamp(input.mx, -1, 1), state.owner !== i); return; }
    if (state.owner >= 0 && state.players[state.owner].team !== p.team && dBall < 9) { slide(state, i, input); return; }
    p.qShot = { act: 'jump', ax: clamp(input.mx, -1, 1), az: 0 };
    p.qT = 0;
    return;
  }
  // a plain tap aims with the stick
  const s2 = shot.act === 'pass' && shot.ax === 0 ? { ...shot, ax: Math.abs(input.mx) > 0.3 ? clamp(input.mx, -1, 1) * 0.999 : 0 } : shot;
  if (canKick(state, i)) { fire(state, i, s2, state.owner !== i); return; }
  p.qShot = { ...s2 };
  p.qT = 0;
}

function slide(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.act === 'slide' || p.down > 0) return;
  const w = wish(p, input);
  let dx = w.x;
  let dz = w.z;
  if (w.k < 0.3) { dx = state.ball.x - p.x; dz = state.ball.z - p.z; }
  const d = Math.hypot(dx, dz) || 1;
  p.act = 'slide';
  p.swingT = 0;
  p.vx = (dx / d) * SLIDE_SPEED;
  p.vz = (dz / d) * SLIDE_SPEED;
  p.fx = dx / d;
  p.fz = dz / d;
  p.qShot = null;
  if (state.owner === i) state.owner = -1;
}

// ————— heat —————

function addHeat(state: GameState, i: number, amount: number) {
  const p = state.players[i];
  if (p.keeper || p.fire > 0) return;
  const t = state.traits[i] ?? ADULT;
  const before = p.heat;
  p.heat = Math.min(HEAT_MAX, p.heat + amount * t.heat);
  if (before < HEAT_WARM && p.heat >= HEAT_WARM && p.heat < HEAT_MAX) call(state, 'warm', i);
  if (p.heat >= HEAT_MAX) { p.fire = FIRE_SECONDS * HZ; p.stats.fires += 1; call(state, 'fire', i); }
}

function loseHeat(state: GameState, i: number, amount: number) {
  const p = state.players[i];
  if (p.fire > 0) { p.fire = 0; p.heat = 0; call(state, 'doused', i); return; }
  p.heat = Math.max(0, p.heat - amount);
}

// ————— goals —————

function goal(state: GameState, scorerTeam: Team) {
  const conceded = other(scorerTeam);
  state.scores[scorerTeam] += 1;
  const by = state.lastHitter;
  const own = by >= 0 && state.players[by].team === conceded;
  const shotBy = own ? -1 : by;
  const b = state.ball;
  let how: How = 'goal';
  if (own) how = 'own';
  else if (b.super) how = 'super';
  else if (state.wallHits > 0) how = 'bank';
  else if (state.lastKick === 'curl') how = 'curl';
  else if (state.lastKick === 'chip') how = 'chip';
  else if (state.oneTimer && state.shooter === by) how = 'onetimer';
  else if (Math.abs(b.x) > GOAL_HALF - 2.2) how = 'corner';
  if (shotBy >= 0) {
    const p = state.players[shotBy];
    p.stats.goals += 1;
    p.stats.onTarget += 1;
    addHeat(state, shotBy, HEAT_GOAL);
    if (p.stats.goals === 3) call(state, 'hattrick', shotBy);
  }
  for (const k of teamPlayers(state, conceded)) loseHeat(state, k, HEAT_CONCEDE);
  call(state, how, shotBy >= 0 ? shotBy : by);
  state.lastPoint = { faultTeam: conceded, faultBy: -1, reason: 'goal', scorer: scorerTeam, sideOut: true, shotBy, rally: state.touches, how };
  state.pointSeq += 1;
  state.owner = -1;
  state.phase = 'point';
  state.phaseTicks = 0;
  const [a, c] = state.scores;
  if (state.scores[scorerTeam] >= GAME_TO) state.winner = scorerTeam;
  else if (a === c) call(state, 'tied', -1, a);
  else if (state.scores[scorerTeam] === GAME_TO - 1) call(state, 'game-point');
}

// ————— the step —————

export function step(prev: GameState, inputs: PlayerInput[]): GameState {
  const state = cloneState(prev);
  state.tick += 1;
  state.phaseTicks += 1;
  const n = state.players.length;

  if (state.phase === 'over') return state;
  if (state.phase === 'point') {
    stepBall(state.ball);
    for (let i = 0; i < n; i++) if (!state.players[i].keeper) movePlayer(state, i, state.players[i], IDLE);
    if (state.phaseTicks >= POINT_PAUSE) {
      if (state.winner !== -1) { state.phase = 'over'; state.phaseTicks = 0; call(state, 'win', -1); }
      else kickoff(state, state.lastPoint ? state.lastPoint.faultTeam : other(state.servingTeam));
    }
    return state;
  }

  for (const p of state.players) {
    if (p.touchCool > 0) p.touchCool -= 1;
    if (p.fire > 0) { p.fire -= 1; if (p.fire === 0) p.heat = 0; }
    if (p.down > 0) { p.down -= 1; if (p.down === 0) p.act = 'none'; }
    if (p.swingT >= 0) {
      p.swingT += 1;
      if (p.act === 'kick' && p.swingT > KICK_TICKS) { p.swingT = -1; p.act = 'none'; }
      if (p.act === 'slide' && p.swingT > SLIDE_TICKS) { p.swingT = -1; p.down = DOWN_SLIDE; }
      if (p.act === 'dive' && p.swingT > KEEPER_DIVE_TICKS) { p.swingT = -1; p.down = KEEPER_DOWN; }
    }
  }

  for (let i = 0; i < n; i++) {
    const input = inputs[i] ?? IDLE;
    if (input.swing) press(state, i, input);
  }
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (p.keeper) { keeperStep(state, i); continue; }
    const x0 = p.x;
    const z0 = p.z;
    movePlayer(state, i, p, inputs[i] ?? IDLE);
    p.stats.run += Math.hypot(p.x - x0, p.z - z0);
  }
  separate(state);
  for (const p of state.players) confine(p);

  const b = state.ball;

  // slides that reach the ball knock it loose
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    // only while actually sliding (not getting up afterwards)
    if (p.act !== 'slide' || p.swingT < 0 || p.swingT > SLIDE_TICKS - 6) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) < SLIDE_REACH && b.y < 2.5 && state.owner !== i) {
      const from = state.owner;
      if (from >= 0 && state.players[from].keeper) continue;
      if (from >= 0) {
        state.players[from].touchCool = TOUCH_COOL;
        if (state.players[from].team !== p.team) { p.stats.tackles += 1; addHeat(state, i, HEAT_STEAL); call(state, 'tackle', i); }
      }
      state.owner = -1;
      b.vx = p.fx * 28;
      b.vz = p.fz * 28;
      b.vy = 3;
      b.curl = 0;
      b.hot = false;
      b.super = false;
      // one slide, one ball
      p.swingT = SLIDE_TICKS - 5;
      touch(state, i);
    }
  }

  if (state.owner >= 0) {
    const o = state.players[state.owner];
    // an opponent who stays on it wins it (not off a keeper's hands)
    if (!o.keeper) {
      for (let i = 0; i < n; i++) {
        const q = state.players[i];
        if (q.team === o.team || q.keeper || q.touchCool > 0 || q.down > 0 || q.act === 'slide') { q.press = 0; continue; }
        if (Math.hypot(b.x - q.x, b.z - q.z) < STEAL_R) q.press += 1;
        else q.press = Math.max(0, q.press - 2);
        if (q.press > STEAL_TICKS) {
          o.touchCool = TOUCH_COOL;
          state.owner = i;
          state.held = 0;
          q.press = 0;
          q.stats.steals += 1;
          addHeat(state, i, HEAT_STEAL * 0.6);
          touch(state, i);
          break;
        }
      }
    }
  }
  if (state.owner >= 0) {
    const o = state.players[state.owner];
    state.held += 1;
    if (o.keeper) {
      b.x = o.x;
      b.z = o.z - sgn(o.team) * 0.8;
      b.y = 3.2;
    } else {
      b.x = o.x + o.fx * DRIBBLE_AHEAD;
      b.z = o.z + o.fz * DRIBBLE_AHEAD;
      b.y = BALL_R;
    }
    b.vx = o.vx;
    b.vz = o.vz;
    b.vy = 0;
    b.curl = 0;
    b.x = clamp(b.x, -HALF_WIDTH + BALL_R, HALF_WIDTH - BALL_R);
    b.z = clamp(b.z, -HALF_LENGTH + BALL_R, HALF_LENGTH - BALL_R);
  } else {
    const wasAir = b.y > BALL_R + 0.3;
    const r = stepBall(b);
    if (r.wall) state.wallHits += 1;
    if (r.bounced) state.bounceSeq += 1;
    if (r.bounced && wasAir) state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: true };
    if (r.bar && state.shooter >= 0 && Math.hypot(b.vx, b.vz) > 20) call(state, 'bar', state.shooter);

    if (Math.abs(b.z) > HALF_LENGTH + BALL_R && Math.abs(b.x) < GOAL_HALF && state.phase === 'rally') {
      goal(state, b.z > 0 ? 1 : 0);
      return state;
    }

    const sp = Math.hypot(b.vx, b.vz);
    for (let i = 0; i < n; i++) {
      const p = state.players[i];
      if (state.lastHitter === i && state.tick - state.hitTick < 14) continue;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      if (p.keeper) {
        // hands: standing it reaches up to the bar; diving it covers a long way low
        const diving = p.act === 'dive';
        const reach = diving ? KEEPER_DIVE_REACH : KEEPER_REACH;
        // on its line it can stretch up and tip one over; off it, less
        const onLine = Math.abs(p.z - sgn(p.team) * HALF_LENGTH) < 2.4;
        const high = diving ? 5 : onLine ? KEEPER_HANDS + 0.8 : KEEPER_HANDS - 0.4;
        if (d > reach + BALL_R || b.y > high || (p.down > 0 && !diving) || p.touchCool > 0) continue;
        const shotAtMe = state.shooter >= 0 && state.players[state.shooter].team !== p.team;
        // a super shot knocks the keeper flat and carries on
        if (b.super && rand(state) < 0.55) {
          p.down = KEEPER_DOWN;
          p.act = 'dive';
          b.vx *= 0.8;
          b.vz *= 0.8;
          continue;
        }
        if (sp < KEEPER_CATCH && !diving) {
          state.owner = i;
          state.held = 0;
          b.hot = false;
          b.super = false;
          if (shotAtMe) { p.stats.saves += 1; call(state, 'catch', i); }
          state.shooter = -1;
          touch(state, i);
          continue;
        }
        // parried away from goal
        const s = sgn(p.team);
        b.vz = -s * Math.abs(b.vz) * 0.4 - s * 6;
        b.vx = (dx >= 0 ? 1 : -1) * (Math.abs(b.vx) * 0.5 + 10);
        b.vy = Math.max(b.vy, 6);
        b.curl = 0;
        b.hot = false;
        b.super = false;
        if (shotAtMe) { p.stats.saves += 1; call(state, 'save', i); }
        state.shooter = -1;
        state.lastHitter = i;
        state.hitSeq += 1;
        state.hitTick = state.tick;
        continue;
      }
      if (b.y > BODY_H || d > BODY_R + BALL_R) continue;
      if (sp > TRAP_MAX || p.down > 0 || p.touchCool > 0) {
        const nx = d > 0.01 ? dx / d : -b.vx / (sp || 1);
        const nz = d > 0.01 ? dz / d : -b.vz / (sp || 1);
        const dot = b.vx * nx + b.vz * nz;
        if (dot < 0) {
          b.vx = (b.vx - 2 * dot * nx) * 0.45;
          b.vz = (b.vz - 2 * dot * nz) * 0.45;
          b.vy = Math.max(b.vy, 3);
          b.curl = 0;
          b.x = p.x + nx * (BODY_R + BALL_R + 0.05);
          b.z = p.z + nz * (BODY_R + BALL_R + 0.05);
          b.hot = false;
          b.super = false;
          state.lastHitter = i;
          state.hitSeq += 1;
          state.hitTick = state.tick;
          state.shooter = -1;
        }
      }
    }

    // take it on the run
    if (state.owner === -1 && b.y < 2 && Math.hypot(b.vx, b.vz) <= TRAP_MAX) {
      let best = -1;
      let bestD = CONTROL_R;
      for (let i = 0; i < n; i++) {
        const p = state.players[i];
        if (p.keeper || p.touchCool > 0 || p.down > 0 || p.act === 'slide' || p.qShot) continue;
        if (state.phase === 'serve' && i !== state.server) continue;
        if (state.lastHitter === i && state.tick - state.hitTick < 18) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        state.owner = best;
        state.held = 0;
        b.hot = false;
        b.super = false;
        touch(state, best);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (!p.qShot) continue;
    p.qT += 1;
    if (p.qT > SHOT_WAIT || p.down > 0) { p.qShot = null; continue; }
    if (canKick(state, i)) {
      const first = state.owner !== i;
      fire(state, i, p.qShot, first);
    }
  }

  if (state.phase === 'serve' && state.phaseTicks > KICKOFF_AUTO && state.owner === -1) { state.phase = 'rally'; state.phaseTicks = 0; }
  return state;
}
