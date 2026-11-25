// Soccer: deterministic simulation of a small walled pitch, 1v1 (singles) or 2v2
// (doubles), with two goals, a ball that bounces off the boards, hot streaks and super
// shots.
//
// Pure TypeScript, no DOM, no Date, no Math.random. step(state, inputs) returns the next
// state without touching the one it was given; same seed and same inputs give the same
// game. Units are feet and seconds; the halfway line is z = 0.
//
// Team 0 defends the goal at z = +HALF_LENGTH and attacks the one at -HALF_LENGTH; team 1
// the other way round. Players are numbered team by team, like the other court games.
// Inputs are local to each player: up means toward the goal you attack, right means your
// own right (which is the screen's right, with the camera behind your goal).
//
// The pitch is boarded all the way round, so the ball never goes out: it comes back off
// the walls, and a bank shot off the boards is a real way to score. Only the two goal
// mouths are open. You protect your goal with your body: a hard shot that hits a player
// bounces off them, and one stopped near your own goal is a save.

import { IDLE, other, sgn, type Format, type PlayerInput, type Shot, type Team, type Traits } from '../pickleball/sim';

export { IDLE, other, sgn };
export type { Format, PlayerInput, Shot, Team, Traits };

export const HZ = 120;
export const DT = 1 / HZ;

export const HALF_WIDTH = 24;
export const HALF_LENGTH = 40;
/** half the width of a goal mouth */
export const GOAL_HALF = 7;
export const GOAL_H = 6.5;
export const GOAL_DEPTH = 4;
export const CENTER_R = 8;
/** the shaded box in front of each goal (drawn, and where a stop counts as a save) */
export const BOX_HALF = 14;
export const BOX_DEPTH = 12;

export const BALL_R = 0.7;
export const BALL_GRAVITY = 32;
const GROUND_BOUNCE = 0.5;
const WALL_BOUNCE = 0.72;
/** a rolling ball slows by this fraction a second, and this many ft/s² more */
const ROLL_DRAG = 0.55;
const ROLL_DECEL = 3;

export const PLAYER_SPEED = 17;
const ACCEL = 13;
const BODY_R = 1.3;
const BODY_H = 5.6;
/** how close the ball must be to take it on the run */
export const CONTROL_R = 2.4;
/** a loose ball this close can be struck first time */
export const KICK_R = 3.1;
/** an opponent this close to the ball you're dribbling starts to win it... */
const STEAL_R = 1.6;
/** ...and has it after staying on it this long. Long enough to turn away from them;
 *  a slide tackle is the instant way, and it costs you if it misses. */
const STEAL_TICKS = 40;
const DRIBBLE_AHEAD = 1.7;

export const SHOT_SPEED = 66;
const PASS_SPEED = 44;
const PUSH_SPEED = 30;
const CHIP_SPEED = 36;
const CHIP_VY = 21;
/** past this the ball is too hot to trap: it bounces off whoever it hits */
const TRAP_MAX = 38;

export const KICK_TICKS = 30;
export const SLIDE_TICKS = 38;
const SLIDE_SPEED = 27;
export const DOWN_SLIDE = 42;
const SLIDE_REACH = 2.7;
/** a queued shot waits this long for the ball */
const SHOT_WAIT = 72;
const TOUCH_COOL = 48;

export const GAME_TO = 5;
export const POINT_PAUSE = 230;
/** a kickoff nobody takes starts by itself */
const KICKOFF_AUTO = 6 * HZ;

// ————— hot streaks —————
export const HEAT_MAX = 100;
export const HEAT_WARM = 50;
const HEAT_GOAL = 34;
const HEAT_ON_TARGET = 7;
const HEAT_STEAL = 9;
const HEAT_SAVE = 16;
const HEAT_CONCEDE = 26;
export const FIRE_SECONDS = 18;
const FIRE_SHOT = 1.22;
const FIRE_MOVE = 1.08;

export type Phase = 'serve' | 'rally' | 'point' | 'over';
export type Act = 'none' | 'kick' | 'slide';
export type How = 'goal' | 'bank' | 'banger' | 'super' | 'own' | 'header';

export interface PlayerStats {
  goals: number;
  shots: number;
  onTarget: number;
  saves: number;
  steals: number;
  tackles: number;
  passes: number;
  banks: number;
  supers: number;
  /** feet run */
  run: number;
  fires: number;
  hits: number;
}

export interface Player {
  team: Team;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** always 0: nobody jumps here, but the shared renderer reads it */
  y: number;
  /** which way they face, a unit vector */
  fx: number;
  fz: number;
  /** ticks into a kick or a slide, -1 when neither */
  swingT: number;
  act: Act;
  /** ticks left on the ground after a slide */
  down: number;
  /** ticks before they can touch the ball again (after losing it) */
  touchCool: number;
  /** ticks spent on the ball while someone else dribbles it */
  press: number;
  heat: number;
  fire: number;
  /** goals in a row by this player */
  streak: number;
  /** unused here; read by shared code */
  chefUntil: number;
  /** a right-thumb shot waiting for the ball */
  qShot: Shot | null;
  qT: number;
  stats: PlayerStats;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hot: boolean;
  super: boolean;
}

export interface PointResult {
  /** the team that conceded */
  faultTeam: Team;
  faultBy: number;
  reason: string;
  scorer: Team;
  sideOut: boolean;
  /** the scorer, or -1 for an own goal */
  shotBy: number;
  /** touches in the move */
  rally: number;
  how: How;
}

export type CallKind =
  | 'start' | 'goal' | 'bank' | 'banger' | 'super' | 'own' | 'save' | 'bar' | 'tackle' | 'hattrick'
  | 'warm' | 'fire' | 'doused' | 'tied' | 'game-point' | 'win';

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
  /** the team kicking off */
  servingTeam: Team;
  /** who takes the kickoff */
  server: number;
  ball: Ball;
  /** who has the ball at their feet, -1 for nobody */
  owner: number;
  lastHitter: number;
  /** who last struck it at goal, and from where */
  shooter: number;
  shotFrom: number;
  /** wall bounces since the last kick */
  wallHits: number;
  /** touches since the kickoff */
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

const ZERO_STATS: PlayerStats = { goals: 0, shots: 0, onTarget: 0, saves: 0, steals: 0, tackles: 0, passes: 0, banks: 0, supers: 0, run: 0, fires: 0, hits: 0 };
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

export function teamPlayers(state: Pick<GameState, 'players'>, team: Team): number[] {
  const out: number[] = [];
  state.players.forEach((p, i) => { if (p.team === team) out.push(i); });
  return out;
}

export function mateOf(state: Pick<GameState, 'players'>, i: number): number {
  return teamPlayers(state, state.players[i].team).find((m) => m !== i) ?? -1;
}

/** the z of the goal a team attacks */
export function attackZ(team: Team): number {
  return -sgn(team) * HALF_LENGTH;
}

/** "3–2": the kicking-off team first, like the other games call the serving side */
export function scoreCall(state: GameState): string {
  return `${state.scores[0]}–${state.scores[1]}`;
}

function newPlayer(team: Team): Player {
  const s = sgn(team);
  return {
    team, x: 0, z: s * 14, vx: 0, vz: 0, y: 0, fx: 0, fz: -s, swingT: -1, act: 'none', down: 0, touchCool: 0, press: 0,
    heat: 0, fire: 0, streak: 0, chefUntil: 0, qShot: null, qT: 0, stats: { ...ZERO_STATS },
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
  for (let i = 0; i < n; i++) players.push(newPlayer(opts.format === 'doubles' ? (i < 2 ? 0 : 1) : (i as Team)));
  const traits = Array.from({ length: n }, (_, i) => opts.traits[i] ?? ADULT);
  const first: Team = opts.firstTeam ?? ((seed & 1) as Team);
  const state: GameState = {
    seed, rng: seed >>> 0, tick: 0, format: opts.format, phase: 'serve', phaseTicks: 0, players, traits, scores: [0, 0],
    servingTeam: first, server: teamPlayers({ players }, first)[0],
    ball: { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, hot: false, super: false },
    owner: -1, lastHitter: -1, shooter: -1, shotFrom: 0, wallHits: 0, touches: 0, hitTick: 0,
    lastBounce: null, lastPoint: null, pointSeq: 0, hitSeq: 0, bounceSeq: 0, superSeq: 0, winner: -1, calls: [], callSeq: 0,
  };
  kickoff(state, first);
  call(state, 'start', state.server);
  return state;
}

export function rematch(prev: GameState, seed: number): GameState {
  return createGame(seed, { format: prev.format, traits: prev.traits, firstTeam: other(prev.winner === -1 ? prev.servingTeam : prev.winner) });
}

/** everyone to their spots, the ball on the center mark, and `team` to kick off */
function kickoff(state: GameState, team: Team) {
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.servingTeam = team;
  const mine = teamPlayers(state, team);
  // a team's kickoffs take turns between its players
  const prevServer = state.server;
  state.server = mine.length > 1 && prevServer === mine[0] && state.pointSeq > 0 ? mine[1] : mine[0];
  state.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, hot: false, super: false };
  state.owner = -1;
  state.lastHitter = -1;
  state.shooter = -1;
  state.wallHits = 0;
  state.touches = 0;
  state.lastBounce = null;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const s = sgn(p.team);
    const mates = teamPlayers(state, p.team);
    const k = mates.indexOf(i);
    if (i === state.server) {
      p.x = 0;
      p.z = s * 2.2;
    } else if (p.team === team) {
      p.x = mates.length > 1 ? 10 * (k === 0 ? -1 : 1) : 0;
      p.z = s * 12;
    } else {
      p.x = mates.length > 1 ? 8 * (k === 0 ? -1 : 1) : 0;
      p.z = s * (mates.length > 1 && k === 1 ? 26 : 14);
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
  }
}

// ————— the ball —————

/**
 * The ball on its own for one tick: gravity, the ground, the boards and the goal frames.
 * Goals themselves are scored by step(); here a ball in the mouth just carries on into
 * the net. Shared with the online guest's prediction.
 */
export function stepBall(b: Ball): { wall: boolean; bar: boolean; bounced: boolean } {
  let wall = false;
  let bar = false;
  let bounced = false;
  const airborne = b.y > BALL_R + 0.02 || b.vy > 0;
  if (airborne) b.vy -= BALL_GRAVITY * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < -4) {
      b.vy = -b.vy * GROUND_BOUNCE;
      bounced = true;
    } else {
      b.vy = 0;
    }
  }
  if (b.y <= BALL_R + 0.02 && b.vy === 0) {
    // rolling: drag and a little friction
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const next = Math.max(0, sp * (1 - ROLL_DRAG * DT) - ROLL_DECEL * DT);
      b.vx *= next / sp;
      b.vz *= next / sp;
    }
  }
  // side boards
  if (Math.abs(b.x) > HALF_WIDTH - BALL_R) {
    b.x = Math.sign(b.x) * (HALF_WIDTH - BALL_R);
    b.vx = -b.vx * WALL_BOUNCE;
    wall = true;
  }
  // end boards, except the open goal mouths
  const endZ = HALF_LENGTH - BALL_R;
  const inGoal = Math.abs(b.z) > HALF_LENGTH;
  if (!inGoal && Math.abs(b.z) > endZ) {
    const mouth = Math.abs(b.x) < GOAL_HALF - BALL_R * 0.4 && b.y < GOAL_H - BALL_R * 0.4;
    const frame = Math.abs(b.x) < GOAL_HALF + BALL_R && b.y < GOAL_H + BALL_R;
    if (!mouth) {
      b.z = Math.sign(b.z) * endZ;
      b.vz = -b.vz * WALL_BOUNCE;
      if (frame) bar = true;
      else wall = true;
    }
  }
  if (inGoal) {
    // in the net: the sides, roof and back of the goal stop it
    const back = HALF_LENGTH + GOAL_DEPTH - BALL_R;
    if (Math.abs(b.z) > back) { b.z = Math.sign(b.z) * back; b.vz = -b.vz * 0.15; }
    if (Math.abs(b.x) > GOAL_HALF - BALL_R) { b.x = Math.sign(b.x) * (GOAL_HALF - BALL_R); b.vx = -b.vx * 0.2; }
    if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy = -Math.abs(b.vy) * 0.2; }
    b.vx *= 1 - 3 * DT;
    b.vz *= 1 - 3 * DT;
  }
  return { wall, bar, bounced };
}

/** where an airborne ball comes down, and in how many seconds (walls ignored) */
export function landing(b: Ball): { x: number; z: number; t: number } {
  const h = b.y - BALL_R;
  const t = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * BALL_GRAVITY * h))) / BALL_GRAVITY;
  return { x: clamp(b.x + b.vx * t, -HALF_WIDTH, HALF_WIDTH), z: clamp(b.z + b.vz * t, -HALF_LENGTH, HALF_LENGTH), t };
}

// ————— the players —————

/** the left stick, in world terms: a direction and how far it's pushed (0..1) */
function wish(p: Player, input: PlayerInput): { x: number; z: number; k: number } {
  const s = sgn(p.team);
  const x = clamp(input.mx, -1, 1) * s;
  const z = -clamp(input.mz, -1, 1) * s;
  const d = Math.hypot(x, z);
  if (d < 0.05) return { x: 0, z: 0, k: 0 };
  return { x: x / d, z: z / d, k: Math.min(1, d) };
}

/** Running for one tick. Shared with the online guest's prediction of its own player. */
export function movePlayer(state: GameState, i: number, p: Player, input: PlayerInput) {
  const t = state.traits[i] ?? ADULT;
  if (p.down > 0) {
    p.vx *= 0.9;
    p.vz *= 0.9;
  } else if (p.act === 'slide') {
    p.vx *= 0.99;
    p.vz *= 0.99;
  } else {
    const w = wish(p, input);
    const top = PLAYER_SPEED * t.speed * (p.fire > 0 ? FIRE_MOVE : 1) * (state.owner === i ? 0.9 : 1);
    const k = Math.min(1, ACCEL * DT);
    p.vx += (w.x * w.k * top - p.vx) * k;
    p.vz += (w.z * w.k * top - p.vz) * k;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 1.5) { p.fx = p.vx / sp; p.fz = p.vz / sp; }
  }
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  p.x = clamp(p.x, -HALF_WIDTH + 1, HALF_WIDTH - 1);
  p.z = clamp(p.z, -HALF_LENGTH + 1, HALF_LENGTH - 1);
  // a kickoff keeps each side in its own half, and the other side out of the circle
  if (state.phase === 'serve') {
    const s = sgn(p.team);
    if (p.z * s < 0.8) p.z = s * 0.8;
    if (p.team !== state.servingTeam) {
      const d = Math.hypot(p.x, p.z);
      if (d < CENTER_R) { p.x *= CENTER_R / Math.max(0.01, d); p.z *= CENTER_R / Math.max(0.01, d); if (d < 0.01) p.z = s * CENTER_R; }
    }
  }
}

/** an online guest coasting someone else's player between snapshots */
export function coastPlayer(p: Player) {
  p.x = clamp(p.x + p.vx * DT, -HALF_WIDTH + 1, HALF_WIDTH - 1);
  p.z = clamp(p.z + p.vz * DT, -HALF_LENGTH + 1, HALF_LENGTH - 1);
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

// ————— kicking —————

function touch(state: GameState, i: number) {
  state.lastHitter = i;
  state.hitSeq += 1;
  state.hitTick = state.tick;
  state.touches += 1;
  state.wallHits = 0;
  state.players[i].stats.hits += 1;
  if (state.phase === 'serve') {
    state.phase = 'rally';
    state.phaseTicks = 0;
  }
}

function startKick(p: Player) {
  p.act = 'kick';
  p.swingT = 0;
}

/** strike the ball from where it is toward (tx, tz) at speed v, rising at vy */
function strike(state: GameState, i: number, tx: number, tz: number, v: number, vy: number) {
  const b = state.ball;
  const p = state.players[i];
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz) || 1;
  b.vx = (dx / d) * v;
  b.vz = (dz / d) * v;
  b.vy = vy;
  if (b.y < BALL_R + 0.05) b.y = BALL_R + 0.06;
  b.hot = p.fire > 0;
  b.super = false;
  state.owner = -1;
  p.touchCool = 10;
  p.fx = dx / d;
  p.fz = dz / d;
  startKick(p);
  touch(state, i);
}

/** a shot at goal; ax aims across the mouth (-1 left … 1 right), az: -1 a blast, 1 a chip */
function shoot(state: GameState, i: number, ax: number, az: number) {
  const p = state.players[i];
  const t = state.traits[i] ?? ADULT;
  const s = sgn(p.team);
  const b = state.ball;
  const gz = attackZ(p.team);
  const dist = Math.abs(gz - b.z) + Math.abs(b.x) * 0.3;
  // a little spread that grows with distance; a forgiving character and fire tighten it
  const spread = (dist / 60) * 3.2 * (1 - t.forgive * 0.5) * (p.fire > 0 ? 0.5 : 1);
  const tx = clamp(ax, -1, 1) * s * (GOAL_HALF - 1.3) + (rand(state) - 0.5) * 2 * spread;
  const fire = p.fire > 0;
  let v = SHOT_SPEED * (fire ? FIRE_SHOT : 1);
  let vy = 3 + rand(state) * 3 + Math.min(4, dist / 18);
  if (az > 0.5) { v = CHIP_SPEED; vy = CHIP_VY * Math.min(1.1, dist / 40 + 0.5); }
  else if (az < -0.5) { v *= 1.1; vy *= 0.75; }
  strike(state, i, tx, gz, v, vy);
  state.shooter = i;
  state.shotFrom = dist;
  p.stats.shots += 1;
  if (fire) {
    state.ball.super = true;
    state.superSeq += 1;
    p.stats.supers += 1;
    call(state, 'super', i);
  }
}

/** a pass: to the teammate if there is one and no side was asked for, else that way and forward */
function pass(state: GameState, i: number, ax: number) {
  const p = state.players[i];
  const s = sgn(p.team);
  const b = state.ball;
  const mate = mateOf(state, i);
  if (mate >= 0 && Math.abs(ax) < 0.5) {
    const m = state.players[mate];
    // lead them toward the goal they attack
    const tx = m.x + m.vx * 0.35;
    const tz = m.z + m.vz * 0.35 - s * 4;
    const d = Math.hypot(tx - b.x, tz - b.z);
    strike(state, i, tx, tz, clamp(d * 1.3 + 18, 28, PASS_SPEED * 1.2), 1.5);
    p.stats.passes += 1;
    return;
  }
  if (Math.abs(ax) < 0.5) {
    // alone: a push forward to run onto
    strike(state, i, b.x, b.z - s * 10, PUSH_SPEED, 0.5);
    return;
  }
  strike(state, i, b.x + Math.sign(ax) * s * 12, b.z - s * 8, PASS_SPEED * 0.85, 1.5);
  p.stats.passes += 1;
}

/** what a press does, given what the right thumb asked for (or nothing: the one button) */
function press(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.down > 0 || p.act === 'slide') return;
  if (state.phase === 'serve' && i !== state.server) return;
  const shot = input.shot ?? null;
  if (shot?.act === 'dive') { slide(state, i, input); return; }
  const b = state.ball;
  const dBall = Math.hypot(b.x - p.x, b.z - p.z);
  const reachable = state.owner === i || (state.owner === -1 && dBall < KICK_R && b.y < 3.2 && p.touchCool === 0);
  if (!shot) {
    // the one button: shoot when it's yours, tackle when they have it, nothing in between
    if (reachable) { shoot(state, i, clamp(input.mx, -1, 1), 0); return; }
    if (state.owner >= 0 && state.players[state.owner].team !== p.team && dBall < 9) slide(state, i, input);
    return;
  }
  if (reachable) { fire(state, i, shot); return; }
  // not yet: wait for the ball, briefly
  p.qShot = { ...shot };
  p.qT = 0;
}

function fire(state: GameState, i: number, shot: Shot) {
  state.players[i].qShot = null;
  if (shot.act === 'jump') shoot(state, i, shot.ax, shot.az);
  else pass(state, i, shot.ax);
}

function slide(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.act === 'slide' || p.down > 0) return;
  const w = wish(p, input);
  let dx = w.x;
  let dz = w.z;
  if (w.k < 0.3) {
    // stick at rest: slide at the ball
    dx = state.ball.x - p.x;
    dz = state.ball.z - p.z;
  }
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
  const t = state.traits[i] ?? ADULT;
  if (p.fire > 0) return;
  const before = p.heat;
  p.heat = Math.min(HEAT_MAX, p.heat + amount * t.heat);
  if (before < HEAT_WARM && p.heat >= HEAT_WARM && p.heat < HEAT_MAX) call(state, 'warm', i);
  if (p.heat >= HEAT_MAX) {
    p.fire = FIRE_SECONDS * HZ;
    p.stats.fires += 1;
    call(state, 'fire', i);
  }
}

function loseHeat(state: GameState, i: number, amount: number) {
  const p = state.players[i];
  if (p.fire > 0) {
    p.fire = 0;
    p.heat = 0;
    call(state, 'doused', i);
    return;
  }
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
  else if (state.shooter === by && state.shotFrom > 46) how = 'banger';
  if (shotBy >= 0) {
    const p = state.players[shotBy];
    p.stats.goals += 1;
    p.stats.onTarget += 1;
    if (how === 'bank') p.stats.banks += 1;
    p.streak += 1;
    addHeat(state, shotBy, HEAT_GOAL);
    if (p.stats.goals === 3) call(state, 'hattrick', shotBy);
  }
  for (const k of teamPlayers(state, conceded)) { state.players[k].streak = 0; loseHeat(state, k, HEAT_CONCEDE); }
  call(state, how === 'super' ? 'super' : how === 'own' ? 'own' : how === 'bank' ? 'bank' : how === 'banger' ? 'banger' : 'goal', shotBy >= 0 ? shotBy : by);
  state.lastPoint = { faultTeam: conceded, faultBy: -1, reason: 'goal', scorer: scorerTeam, sideOut: true, shotBy, rally: state.touches, how };
  state.pointSeq += 1;
  state.owner = -1;
  state.phase = 'point';
  state.phaseTicks = 0;
  const [a, c] = state.scores;
  if (state.scores[scorerTeam] >= GAME_TO) {
    state.winner = scorerTeam;
  } else if (a === c && a > 0) {
    call(state, 'tied');
  } else if (Math.max(a, c) === GAME_TO - 1 && state.scores[scorerTeam] === GAME_TO - 1) {
    call(state, 'game-point');
  }
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
    for (let i = 0; i < n; i++) movePlayer(state, i, state.players[i], IDLE);
    if (state.phaseTicks >= POINT_PAUSE) {
      if (state.winner !== -1) {
        state.phase = 'over';
        state.phaseTicks = 0;
        call(state, 'win', -1);
      } else {
        kickoff(state, state.lastPoint ? state.lastPoint.faultTeam : other(state.servingTeam));
      }
    }
    return state;
  }

  // the clocks
  for (const p of state.players) {
    if (p.touchCool > 0) p.touchCool -= 1;
    if (p.fire > 0) { p.fire -= 1; if (p.fire === 0) p.heat = 0; }
    if (p.down > 0) { p.down -= 1; if (p.down === 0) p.act = 'none'; }
    if (p.swingT >= 0) {
      p.swingT += 1;
      if (p.act === 'kick' && p.swingT > KICK_TICKS) { p.swingT = -1; p.act = 'none'; }
      if (p.act === 'slide' && p.swingT > SLIDE_TICKS) { p.swingT = -1; p.down = DOWN_SLIDE; }
    }
  }

  // presses
  for (let i = 0; i < n; i++) {
    const input = inputs[i] ?? IDLE;
    if (input.swing) press(state, i, input);
  }

  // running
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    const x0 = p.x;
    const z0 = p.z;
    movePlayer(state, i, p, inputs[i] ?? IDLE);
    p.stats.run += Math.hypot(p.x - x0, p.z - z0);
  }
  separate(state);

  const b = state.ball;

  // slides that reach the ball knock it loose
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (p.act !== 'slide' || p.swingT > SLIDE_TICKS - 6) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) < SLIDE_REACH && b.y < 2.5) {
      const from = state.owner;
      if (from === i) continue;
      if (from >= 0) {
        state.players[from].touchCool = TOUCH_COOL;
        if (state.players[from].team !== p.team) {
          p.stats.tackles += 1;
          addHeat(state, i, HEAT_STEAL);
          call(state, 'tackle', i);
        }
      }
      state.owner = -1;
      b.vx = p.fx * 30;
      b.vz = p.fz * 30;
      b.vy = 4;
      b.hot = false;
      b.super = false;
      touch(state, i);
    }
  }

  // the ball at someone's feet goes where they go
  if (state.owner >= 0) {
    const o = state.players[state.owner];
    // an opponent who stays on it wins it
    for (let i = 0; i < n; i++) {
      const q = state.players[i];
      if (q.team === o.team || q.touchCool > 0 || q.down > 0 || q.act === 'slide') { q.press = 0; continue; }
      if (Math.hypot(b.x - q.x, b.z - q.z) < STEAL_R) q.press += 1;
      else q.press = Math.max(0, q.press - 2);
      if (q.press > STEAL_TICKS) {
        o.touchCool = TOUCH_COOL;
        state.owner = i;
        q.press = 0;
        q.stats.steals += 1;
        addHeat(state, i, HEAT_STEAL * 0.6);
        touch(state, i);
        break;
      }
    }
  }
  if (state.owner >= 0) {
    const o = state.players[state.owner];
    b.x = o.x + o.fx * DRIBBLE_AHEAD;
    b.z = o.z + o.fz * DRIBBLE_AHEAD;
    b.y = BALL_R;
    b.vx = o.vx;
    b.vz = o.vz;
    b.vy = 0;
    b.x = clamp(b.x, -HALF_WIDTH + BALL_R, HALF_WIDTH - BALL_R);
    b.z = clamp(b.z, -HALF_LENGTH + BALL_R, HALF_LENGTH - BALL_R);
  } else {
    const wasAir = b.y > BALL_R + 0.3;
    const r = stepBall(b);
    if (r.wall) state.wallHits += 1;
    if (r.bounced) state.bounceSeq += 1;
    if (r.bounced && wasAir) state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: true };
    if (r.bar && state.shooter >= 0 && Math.hypot(b.vx, b.vz) > 25) call(state, 'bar', state.shooter);

    // goal?
    if (Math.abs(b.z) > HALF_LENGTH + BALL_R && Math.abs(b.x) < GOAL_HALF && state.phase === 'rally') {
      goal(state, b.z > 0 ? 1 : 0);
      return state;
    }

    // bodies: a hot ball bounces off whoever it hits; a slower one is taken
    const sp = Math.hypot(b.vx, b.vz);
    for (let i = 0; i < n; i++) {
      const p = state.players[i];
      if (b.y > BODY_H) continue;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > BODY_R + BALL_R) continue;
      if (state.lastHitter === i && state.tick - state.hitTick < 14) continue;
      if (sp > TRAP_MAX || p.down > 0 || p.touchCool > 0) {
        // off the body
        const nx = d > 0.01 ? dx / d : -b.vx / (sp || 1);
        const nz = d > 0.01 ? dz / d : -b.vz / (sp || 1);
        const dot = b.vx * nx + b.vz * nz;
        if (dot < 0) {
          b.vx = (b.vx - 2 * dot * nx) * 0.45;
          b.vz = (b.vz - 2 * dot * nz) * 0.45;
          b.vy = Math.max(b.vy, 3);
          b.x = p.x + nx * (BODY_R + BALL_R + 0.05);
          b.z = p.z + nz * (BODY_R + BALL_R + 0.05);
          // a shot stopped in front of your own goal is a save
          const s = sgn(p.team);
          const shotAtMe = state.shooter >= 0 && state.players[state.shooter].team !== p.team;
          if (shotAtMe && sp > TRAP_MAX && p.z * s > HALF_LENGTH - BOX_DEPTH - 8 && Math.abs(p.x) < BOX_HALF + 4) {
            p.stats.saves += 1;
            addHeat(state, i, HEAT_SAVE);
            call(state, 'save', i);
            state.shooter = -1;
          }
          b.hot = false;
          b.super = false;
          state.lastHitter = i;
          state.hitSeq += 1;
          state.hitTick = state.tick;
        }
      }
    }

    // take it on the run
    if (state.owner === -1 && b.y < 2 && Math.hypot(b.vx, b.vz) <= TRAP_MAX) {
      let best = -1;
      let bestD = CONTROL_R;
      for (let i = 0; i < n; i++) {
        const p = state.players[i];
        if (p.touchCool > 0 || p.down > 0 || p.act === 'slide') continue;
        if (state.phase === 'serve' && i !== state.server) continue;
        if (state.lastHitter === i && state.tick - state.hitTick < 18) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        state.owner = best;
        b.hot = false;
        b.super = false;
        if (state.lastHitter !== best) touch(state, best);
        else if (state.phase === 'serve') touch(state, best);
      }
    }
  }

  // shots waiting for the ball
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (!p.qShot) continue;
    p.qT += 1;
    if (p.qT > SHOT_WAIT || p.down > 0) { p.qShot = null; continue; }
    const dBall = Math.hypot(b.x - p.x, b.z - p.z);
    if (state.owner === i || (state.owner === -1 && dBall < KICK_R && b.y < 3.2 && p.touchCool === 0)) fire(state, i, p.qShot);
  }

  // a kickoff nobody takes
  if (state.phase === 'serve' && state.phaseTicks > KICKOFF_AUTO && state.owner === -1) {
    state.phase = 'rally';
    state.phaseTicks = 0;
  }
  return state;
}
