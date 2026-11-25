// Soccer, played like the other court games: each side keeps to its own box in front of
// its own goal, and the ball goes back and forth between them. 1v1 (singles) or 2v2
// (doubles), first to five.
//
// Pure TypeScript, no DOM, no Date, no Math.random. step(state, inputs) returns the next
// state without touching the one it was given; same seed and same inputs give the same
// game. Units are feet and seconds; the halfway line is z = 0.
//
// Team 0 defends the goal at z = +HALF_LENGTH and plays in the box in front of it; team 1
// the other way round. Players are numbered team by team. Inputs are local to each
// player: up means toward the other goal, right means your own right (the screen's
// right, with the camera behind your goal).
//
// The middle of the pitch is nobody's: the ball crosses it, it can't be played there.
// The pitch is boarded all round, so a ball goes off the side walls and comes back, and
// a shot banked off the wall into the goal is a real way to score. You protect your goal
// by standing in front of it and diving: a hard shot bounces off whoever it hits.
//
// Kicks, from the right thumb (or one button: a drive at the goal, aimed with the stick):
//   tap          drive    — low and hard along the ground
//   swipe up     shoot    — rising, aimed by the tilt; a long swipe is a rocket
//   short flick  lob      — high in the air, dropping in under the bar
//   sideways     bank     — off that side wall and back across into the goal
//   swipe down   dive     — throw yourself the way you're running (or at the ball) to block
// A kick made before the ball reaches you waits for it and strikes it first time; off the
// ground, that's a volley.

import { IDLE, other, sgn, type Format, type PlayerInput, type Shot, type Team, type Traits } from '../pickleball/sim';

export { IDLE, other, sgn };
export type { Format, PlayerInput, Shot, Team, Traits };

export const HZ = 120;
export const DT = 1 / HZ;

export const HALF_WIDTH = 20;
export const HALF_LENGTH = 32;
/** half the width of a goal mouth */
export const GOAL_HALF = 7.5;
export const GOAL_H = 6;
export const GOAL_DEPTH = 4;
/** each side's box: you play inside it */
export const ZONE_HALF = 15;
export const ZONE_DEPTH = 13;
export const CENTER_R = 6;

export const BALL_R = 0.75;
export const BALL_GRAVITY = 30;
const GROUND_BOUNCE = 0.52;
const WALL_BOUNCE = 0.8;
/** a rolling ball slows by this fraction a second, and this many ft/s² more */
const ROLL_DRAG = 0.22;
const ROLL_DECEL = 1.6;

export const PLAYER_SPEED = 15;
const ACCEL = 14;
const BODY_R = 1.3;
const BODY_H = 5.6;
/** a diving player covers this much more */
const DIVE_R = 2.6;
/** how close a slow ball must be to take it */
export const CONTROL_R = 2.3;
/** a ball this close can be struck first time */
export const KICK_R = 3.2;
const DRIBBLE_AHEAD = 1.6;

const DRIVE_SPEED = 58;
const SHOT_SPEED = 64;
const ROCKET = 1.18;
const LOB_SPEED = 34;
const LOB_VY = 26;
/** past this the ball is too hot to trap: it bounces off whoever it hits */
const TRAP_MAX = 34;

export const KICK_TICKS = 34;
export const DIVE_TICKS = 34;
const DIVE_SPEED = 24;
export const DOWN_DIVE = 50;
/** a queued kick waits this long for the ball */
const SHOT_WAIT = 84;
/** holding the ball longer than this lets it go: a drive, so nobody stalls */
const HOLD_MAX = 4 * HZ;
/** a ball dead in the middle this long rolls to the side that didn't play it last */
const DEAD_TICKS = 70;

export const GAME_TO = 5;
export const POINT_PAUSE = 230;
/** a serve nobody takes goes by itself */
const SERVE_AUTO = 7 * HZ;

// ————— hot streaks —————
export const HEAT_MAX = 100;
export const HEAT_WARM = 50;
const HEAT_GOAL = 34;
const HEAT_SAVE = 18;
const HEAT_VOLLEY = 8;
const HEAT_CONCEDE = 26;
export const FIRE_SECONDS = 18;
const FIRE_SHOT = 1.22;
const FIRE_MOVE = 1.08;

export type Phase = 'serve' | 'rally' | 'point' | 'over';
export type Act = 'none' | 'kick' | 'dive';
export type Kick = 'drive' | 'shoot' | 'rocket' | 'lob' | 'bank' | 'volley';
export type How = 'goal' | 'bank' | 'lob' | 'volley' | 'super' | 'own' | 'rocket';

export interface PlayerStats {
  goals: number;
  shots: number;
  saves: number;
  dives: number;
  volleys: number;
  banks: number;
  lobs: number;
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
  /** always 0; read by shared code */
  y: number;
  /** ticks into a kick or a dive, -1 when neither */
  swingT: number;
  act: Act;
  /** ticks left on the ground after a dive */
  down: number;
  /** ticks before they can take the ball again */
  touchCool: number;
  heat: number;
  fire: number;
  /** unused here; read by shared code */
  chefUntil: number;
  /** a right-thumb kick waiting for the ball */
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
  /** kicks in the rally */
  rally: number;
  how: How;
}

export type CallKind =
  | 'start' | 'goal' | 'bank' | 'lob' | 'volley' | 'rocket' | 'super' | 'own' | 'save' | 'bar' | 'hattrick'
  | 'warm' | 'fire' | 'doused' | 'tied' | 'game-point' | 'rally10' | 'win';

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
  /** the team putting the ball in play */
  servingTeam: Team;
  server: number;
  ball: Ball;
  /** who has the ball at their feet, -1 for nobody */
  owner: number;
  /** ticks the owner has had it */
  held: number;
  lastHitter: number;
  /** the last kick, and whether it was at goal */
  lastKick: Kick;
  shooter: number;
  /** wall bounces since the last kick */
  wallHits: number;
  /** kicks this rally */
  kicks: number;
  /** ticks the ball has sat dead in the middle */
  dead: number;
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

const ZERO_STATS: PlayerStats = { goals: 0, shots: 0, saves: 0, dives: 0, volleys: 0, banks: 0, lobs: 0, supers: 0, run: 0, fires: 0, hits: 0 };
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

/** a team's box, as z limits (near the goal line … the front edge) */
export function zoneOf(team: Team): { zMin: number; zMax: number } {
  const s = sgn(team);
  const a = s * (HALF_LENGTH - 1);
  const b = s * (HALF_LENGTH - ZONE_DEPTH);
  return { zMin: Math.min(a, b), zMax: Math.max(a, b) };
}

export function inZone(team: Team, x: number, z: number, pad = 0): boolean {
  const zn = zoneOf(team);
  return Math.abs(x) <= ZONE_HALF + pad && z >= zn.zMin - pad && z <= zn.zMax + pad;
}

export function scoreCall(state: GameState): string {
  return `${state.scores[0]}–${state.scores[1]}`;
}

function newPlayer(team: Team): Player {
  return {
    team, x: 0, z: sgn(team) * (HALF_LENGTH - 6), vx: 0, vz: 0, y: 0, swingT: -1, act: 'none', down: 0, touchCool: 0,
    heat: 0, fire: 0, chefUntil: 0, qShot: null, qT: 0, stats: { ...ZERO_STATS },
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
    owner: -1, held: 0, lastHitter: -1, lastKick: 'drive', shooter: -1, wallHits: 0, kicks: 0, dead: 0, hitTick: 0,
    lastBounce: null, lastPoint: null, pointSeq: 0, hitSeq: 0, bounceSeq: 0, superSeq: 0, winner: -1, calls: [], callSeq: 0,
  };
  serve(state, first);
  call(state, 'start', state.server);
  return state;
}

export function rematch(prev: GameState, seed: number): GameState {
  return createGame(seed, { format: prev.format, traits: prev.traits, firstTeam: other(prev.winner === -1 ? prev.servingTeam : prev.winner) });
}

/** everyone to their spots and the ball at `team`'s server's feet */
function serve(state: GameState, team: Team) {
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.servingTeam = team;
  const mine = teamPlayers(state, team);
  state.server = mine.length > 1 && state.server === mine[0] && state.pointSeq > 0 ? mine[1] : mine[0];
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const s = sgn(p.team);
    const mates = teamPlayers(state, p.team);
    const k = mates.indexOf(i);
    p.x = mates.length > 1 ? (k === 0 ? -6 : 6) : 0;
    // the server steps up to the front of the box; everyone else stands in front of goal
    p.z = s * (i === state.server ? HALF_LENGTH - ZONE_DEPTH + 3 : HALF_LENGTH - 5);
    if (i === state.server) p.x = 0;
    p.vx = 0;
    p.vz = 0;
    p.swingT = -1;
    p.act = 'none';
    p.down = 0;
    p.touchCool = 0;
    p.qShot = null;
  }
  const sv = state.players[state.server];
  state.ball = { x: sv.x, y: BALL_R, z: sv.z - sgn(sv.team) * DRIBBLE_AHEAD, vx: 0, vy: 0, vz: 0, hot: false, super: false };
  state.owner = state.server;
  state.held = 0;
  state.lastHitter = -1;
  state.shooter = -1;
  state.wallHits = 0;
  state.kicks = 0;
  state.dead = 0;
  state.lastBounce = null;
}

// ————— the ball —————

/**
 * The ball on its own for one tick: gravity, the ground, the boards and the goal frames.
 * Goals are scored by step(); here a ball in the mouth just carries on into the net.
 * Shared with the online guest's prediction.
 */
export function stepBall(b: Ball): { wall: boolean; bar: boolean; bounced: boolean } {
  let wall = false;
  let bar = false;
  let bounced = false;
  if (b.y > BALL_R + 0.02 || b.vy > 0) b.vy -= BALL_GRAVITY * DT;
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
      if (frame) bar = true;
      else wall = true;
    }
  }
  // no roof over the pitch, but a ball sent sky-high comes down inside it
  if (inGoal) {
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

/**
 * Where a rolling or flying ball crosses the line z = atZ, folding in side-wall bounces,
 * or null if it isn't heading there. For bots, and the dive's aim.
 */
export function crossing(b: Ball, atZ: number): { x: number; t: number } | null {
  if (Math.abs(b.vz) < 0.5) return null;
  const t = (atZ - b.z) / b.vz;
  if (t < 0 || t > 4) return null;
  let x = b.x + b.vx * t;
  const W = HALF_WIDTH - BALL_R;
  for (let k = 0; k < 4 && Math.abs(x) > W; k++) x = Math.sign(x) * (2 * W - Math.abs(x));
  return { x, t };
}

// ————— the players —————

/** Running for one tick, kept to your own box. Shared with the online guest. */
export function movePlayer(state: GameState, i: number, p: Player, input: PlayerInput) {
  const t = state.traits[i] ?? ADULT;
  const s = sgn(p.team);
  if (p.down > 0) {
    p.vx *= 0.9;
    p.vz *= 0.9;
  } else if (p.act === 'dive') {
    p.vx *= 0.985;
    p.vz *= 0.985;
  } else {
    let wx = clamp(input.mx, -1, 1) * s;
    let wz = -clamp(input.mz, -1, 1) * s;
    const push = Math.hypot(wx, wz);
    if (push > 1) { wx /= push; wz /= push; }
    else if (push < 0.12) { wx = 0; wz = 0; }
    const top = PLAYER_SPEED * t.speed * (p.fire > 0 ? FIRE_MOVE : 1) * (state.owner === i ? 0.88 : 1) * (p.swingT >= 0 ? 0.5 : 1);
    const k = Math.min(1, ACCEL * DT);
    p.vx += (wx * top - p.vx) * k;
    p.vz += (wz * top - p.vz) * k;
  }
  p.x += p.vx * DT;
  p.z += p.vz * DT;
  const zn = zoneOf(p.team);
  p.x = clamp(p.x, -ZONE_HALF, ZONE_HALF);
  p.z = clamp(p.z, zn.zMin, zn.zMax);
}

export function coastPlayer(p: Player) {
  const zn = zoneOf(p.team);
  p.x = clamp(p.x + p.vx * DT, -ZONE_HALF, ZONE_HALF);
  p.z = clamp(p.z + p.vz * DT, zn.zMin, zn.zMax);
}

function separate(state: GameState) {
  const ps = state.players;
  for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      if (ps[a].team !== ps[b].team) continue;
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

/** strike the ball toward (tx, tz) at speed v, rising at vy */
function strike(state: GameState, i: number, tx: number, tz: number, v: number, vy: number, kind: Kick) {
  const b = state.ball;
  const p = state.players[i];
  const dx = tx - b.x;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dz) || 1;
  const fire = p.fire > 0;
  const boost = fire ? FIRE_SHOT : 1;
  b.vx = (dx / d) * v * boost;
  b.vz = (dz / d) * v * boost;
  b.vy = vy;
  if (b.y < BALL_R + 0.05) b.y = BALL_R + 0.06;
  b.hot = fire;
  b.super = false;
  state.owner = -1;
  state.held = 0;
  state.lastKick = kind;
  state.shooter = i;
  state.wallHits = 0;
  state.dead = 0;
  state.kicks += 1;
  if (state.kicks === 10) call(state, 'rally10', i, 10);
  p.touchCool = 18;
  p.act = 'kick';
  p.swingT = 0;
  p.qShot = null;
  p.stats.shots += 1;
  state.lastHitter = i;
  state.hitSeq += 1;
  state.hitTick = state.tick;
  p.stats.hits += 1;
  if (fire) {
    b.super = true;
    state.superSeq += 1;
    p.stats.supers += 1;
    call(state, 'super', i);
  }
  if (state.phase === 'serve') {
    state.phase = 'rally';
    state.phaseTicks = 0;
  }
}

/** a kick of one kind; ax aims across the goal mouth (-1 left … 1 right, your view) */
function kick(state: GameState, i: number, kind: Kick, ax: number) {
  const p = state.players[i];
  const t = state.traits[i] ?? ADULT;
  const s = sgn(p.team);
  const b = state.ball;
  const gz = attackZ(p.team);
  const dist = Math.abs(gz - b.z);
  // a little spread that grows with distance; a forgiving character and fire tighten it
  const spread = (dist / 50) * 2.4 * (1 - t.forgive * 0.5) * (p.fire > 0 ? 0.5 : 1);
  const jitter = (rand(state) - 0.5) * 2 * spread;
  const aimX = clamp(ax, -1, 1) * s * (GOAL_HALF - 1.2) + jitter;
  const airborne = b.y > 2.4;
  if (airborne && kind !== 'lob') {
    // a volley: struck out of the air, hard and dipping
    p.stats.volleys += 1;
    addHeat(state, i, HEAT_VOLLEY);
    strike(state, i, aimX, gz, SHOT_SPEED * 1.05, 2, 'volley');
    return;
  }
  switch (kind) {
    case 'drive':
      strike(state, i, aimX, gz, DRIVE_SPEED, 1.2, 'drive');
      return;
    case 'shoot':
      strike(state, i, aimX, gz, SHOT_SPEED, 4 + rand(state) * 2 + dist / 30, 'shoot');
      return;
    case 'rocket':
      strike(state, i, aimX * 0.85, gz, SHOT_SPEED * ROCKET, 3 + dist / 40, 'rocket');
      return;
    case 'lob': {
      // high, dropping in just under the bar
      p.stats.lobs += 1;
      const tt = (LOB_VY + Math.sqrt(LOB_VY * LOB_VY - 2 * BALL_GRAVITY * 3)) / BALL_GRAVITY;
      const v = clamp(Math.hypot(aimX - b.x, gz - b.z) / tt, 18, LOB_SPEED * 1.6);
      strike(state, i, aimX, gz, v, LOB_VY, 'lob');
      return;
    }
    case 'bank': {
      // off the side wall: aim at the goal's mirror image beyond that wall
      const side = Math.sign(ax * s) || 1;
      const W = HALF_WIDTH - BALL_R;
      const mirrorX = side * 2 * W - (aimX * 0.3);
      strike(state, i, mirrorX, gz, SHOT_SPEED * 1.02, 2, 'bank');
      p.stats.banks += 1;
      return;
    }
    default:
      strike(state, i, aimX, gz, DRIVE_SPEED, 1.2, 'drive');
  }
}

/** a right-thumb shot as a kick */
function kindOf(shot: Shot): { kind: Kick; ax: number } {
  if (shot.act === 'jump') return { kind: shot.az > 0.5 ? 'lob' : shot.az < -0.5 ? 'rocket' : 'shoot', ax: shot.ax };
  if (shot.act === 'pass' && Math.abs(shot.ax) > 0.5) return { kind: 'bank', ax: shot.ax };
  return { kind: 'drive', ax: shot.ax };
}

/** can this player strike the ball right now? */
function canKick(state: GameState, i: number): boolean {
  const p = state.players[i];
  if (state.owner === i) return true;
  if (state.owner !== -1 || p.touchCool > 0 || p.down > 0 || p.act === 'dive') return false;
  const b = state.ball;
  return Math.hypot(b.x - p.x, b.z - p.z) < KICK_R && b.y < 5.5;
}

function press(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  if (p.down > 0 || p.act === 'dive') return;
  if (state.phase === 'serve' && i !== state.server) return;
  const shot = input.shot ?? null;
  if (shot?.act === 'dive') { dive(state, i, input); return; }
  if (!shot) {
    // the one button: a drive at their goal, aimed with the stick
    if (canKick(state, i)) kick(state, i, 'drive', clamp(input.mx, -1, 1));
    else { p.qShot = { act: 'pass', ax: clamp(input.mx, -1, 1), az: 0 }; p.qT = 0; }
    return;
  }
  if (canKick(state, i)) {
    const k = kindOf(shot);
    kick(state, i, k.kind, k.ax);
    return;
  }
  // not yet: the kick waits for the ball, and strikes it first time
  p.qShot = { ...shot };
  p.qT = 0;
}

function dive(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  const s = sgn(p.team);
  let dx = clamp(input.mx, -1, 1) * s;
  let dz = -clamp(input.mz, -1, 1) * s;
  if (Math.hypot(dx, dz) < 0.3) {
    // stick at rest: dive to where the ball will cross my line
    const c = crossing(state.ball, p.z);
    dx = (c ? c.x : state.ball.x) - p.x;
    dz = 0;
    if (Math.abs(dx) < 0.5) dx = state.ball.x >= p.x ? 1 : -1;
  }
  const d = Math.hypot(dx, dz) || 1;
  p.act = 'dive';
  p.swingT = 0;
  p.vx = (dx / d) * DIVE_SPEED;
  p.vz = (dz / d) * DIVE_SPEED;
  p.qShot = null;
  p.stats.dives += 1;
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
  else if (state.lastKick === 'bank' || state.wallHits > 0) how = 'bank';
  else if (state.lastKick === 'lob') how = 'lob';
  else if (state.lastKick === 'volley') how = 'volley';
  else if (state.lastKick === 'rocket') how = 'rocket';
  if (shotBy >= 0) {
    const p = state.players[shotBy];
    p.stats.goals += 1;
    addHeat(state, shotBy, HEAT_GOAL);
    if (p.stats.goals === 3) call(state, 'hattrick', shotBy);
  }
  for (const k of teamPlayers(state, conceded)) loseHeat(state, k, HEAT_CONCEDE);
  call(state, how === 'goal' ? 'goal' : how, shotBy >= 0 ? shotBy : by);
  state.lastPoint = { faultTeam: conceded, faultBy: -1, reason: 'goal', scorer: scorerTeam, sideOut: true, shotBy, rally: state.kicks, how };
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
    for (let i = 0; i < n; i++) movePlayer(state, i, state.players[i], IDLE);
    if (state.phaseTicks >= POINT_PAUSE) {
      if (state.winner !== -1) {
        state.phase = 'over';
        state.phaseTicks = 0;
        call(state, 'win', -1);
      } else {
        serve(state, state.lastPoint ? state.lastPoint.faultTeam : other(state.servingTeam));
      }
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
      if (p.act === 'dive' && p.swingT > DIVE_TICKS) { p.swingT = -1; p.down = DOWN_DIVE; }
    }
  }

  for (let i = 0; i < n; i++) {
    const input = inputs[i] ?? IDLE;
    if (input.swing) press(state, i, input);
  }

  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    const x0 = p.x;
    const z0 = p.z;
    // the server holds their spot until they kick
    if (state.phase === 'serve' && i === state.server) { p.vx = 0; p.vz = 0; continue; }
    movePlayer(state, i, p, inputs[i] ?? IDLE);
    p.stats.run += Math.hypot(p.x - x0, p.z - z0);
  }
  separate(state);

  const b = state.ball;

  if (state.owner >= 0) {
    // at someone's feet: it goes where they go, in front of them
    const o = state.players[state.owner];
    const s = sgn(o.team);
    b.x = o.x + o.vx * 0.05;
    b.z = o.z - s * DRIBBLE_AHEAD;
    b.y = BALL_R;
    b.vx = o.vx;
    b.vz = o.vz;
    b.vy = 0;
    state.held += 1;
    if (state.phase === 'rally' && state.held > HOLD_MAX) kick(state, state.owner, 'drive', 0);
    if (state.phase === 'serve' && state.phaseTicks > SERVE_AUTO) kick(state, state.owner, 'drive', 0);
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

    // bodies: a hot ball bounces off whoever it hits (a diver covers more)
    const sp = Math.hypot(b.vx, b.vz);
    for (let i = 0; i < n; i++) {
      const p = state.players[i];
      if (b.y > BODY_H + (p.act === 'dive' ? -2 : 0)) continue;
      const reach = p.act === 'dive' ? DIVE_R : BODY_R;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + BALL_R) continue;
      if (state.lastHitter === i && state.tick - state.hitTick < 16) continue;
      if (sp > TRAP_MAX || p.act === 'dive' || p.down > 0 || p.touchCool > 0) {
        const nx = d > 0.01 ? dx / d : -b.vx / (sp || 1);
        const nz = d > 0.01 ? dz / d : -b.vz / (sp || 1);
        const dot = b.vx * nx + b.vz * nz;
        if (dot < 0) {
          b.vx = (b.vx - 2 * dot * nx) * 0.42;
          b.vz = (b.vz - 2 * dot * nz) * 0.42;
          b.vy = Math.max(b.vy, 4);
          b.x = p.x + nx * (reach + BALL_R + 0.05);
          b.z = p.z + nz * (reach + BALL_R + 0.05);
          const shotAtMe = state.shooter >= 0 && state.players[state.shooter].team !== p.team;
          if (shotAtMe && sp > TRAP_MAX * 0.8) {
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
          state.wallHits = 0;
        }
      }
    }

    // a slower ball near your feet, in your box, is yours
    if (state.owner === -1 && b.y < 2 && Math.hypot(b.vx, b.vz) <= TRAP_MAX) {
      let best = -1;
      let bestD = CONTROL_R;
      for (let i = 0; i < n; i++) {
        const p = state.players[i];
        if (p.touchCool > 0 || p.down > 0 || p.act === 'dive' || p.qShot) continue;
        if (state.lastHitter === i && state.tick - state.hitTick < 20) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        state.owner = best;
        state.held = 0;
        b.hot = false;
        b.super = false;
        if (state.lastHitter !== best) {
          state.lastHitter = best;
          state.hitSeq += 1;
          state.hitTick = state.tick;
        }
      }
    }

    // a ball dead where nobody can reach it rolls to the side that didn't play it last
    const reachable = inZone(0, b.x, b.z, 1.5) || inZone(1, b.x, b.z, 1.5);
    if (!reachable && Math.hypot(b.vx, b.vz) < 4 && b.y < BALL_R + 0.1) {
      state.dead += 1;
      if (state.dead > DEAD_TICKS) {
        const to: Team = state.lastHitter >= 0 ? other(state.players[state.lastHitter].team) : (b.z > 0 ? 0 : 1);
        const tz = sgn(to) * (HALF_LENGTH - ZONE_DEPTH / 2);
        const d = Math.hypot(0 - b.x, tz - b.z) || 1;
        b.vx = ((0 - b.x) / d) * 22;
        b.vz = ((tz - b.z) / d) * 22;
        state.dead = 0;
        state.lastHitter = -1;
      }
    } else {
      state.dead = 0;
    }
  }

  // kicks waiting for the ball
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (!p.qShot) continue;
    p.qT += 1;
    if (p.qT > SHOT_WAIT || p.down > 0 || state.phase !== 'rally') { p.qShot = null; continue; }
    if (canKick(state, i)) {
      const k = kindOf(p.qShot);
      kick(state, i, k.kind, k.ax);
    }
  }
  return state;
}
