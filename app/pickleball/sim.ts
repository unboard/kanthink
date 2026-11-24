// Pickleball: deterministic simulation, singles or doubles, with hot streaks.
//
// Pure TypeScript, no DOM, no Date, no Math.random. Everything that changes lives in a
// plain serializable GameState, and step(state, inputs) returns the next state without
// touching the one it was given. Same seed + same inputs → same state, on every machine
// running the same JS engine. Units are feet and seconds; the net is the plane z = 0.
//
// Team 0 plays the z > 0 half, team 1 the z < 0 half. Players are numbered team by team:
// singles [team 0, team 1]; doubles [team 0, team 0, team 1, team 1]. Inputs are local to
// each player: up means toward the net and right means the player's own right as they
// face it, so everyone uses the same keys with the camera behind their own baseline.
//
// Doubles serving follows the real rules: a game starts "0-0-2" (the first serving team
// gets one server), each team then gets two servers per turn, the server serves from the
// court they're standing in and swaps courts with their partner after each point they
// win, and only the diagonal receiver may return the serve.

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
export const POINT_PAUSE = 170; // ticks the point result stays up

export const GAME_TO = 11;
export const WIN_BY = 2;

// ————— hot streaks (numbers from the Gemini 4 Neon design pass) —————
/** Heat runs 0–100; from 50 a player is warming up, at 100 they catch fire. */
export const HEAT_MAX = 100;
export const HEAT_WARM = 50;
/** A shot that lands in. */
export const HEAT_CLEAN = 6;
/** A sweet-spot contact. */
export const HEAT_SWEET = 12;
/** Won the rally with your shot. */
export const HEAT_WINNER = 22;
/** Both teammates hit in a rally their team won. */
export const HEAT_COMBO = 10;
/** Your own error: net, out, a kitchen or two-bounce fault. */
export const HEAT_ERROR = 30;
/** Your team lost the rally some other way. */
export const HEAT_LOSS = 18;
/** Doused a player on fire by winning the rally against them. */
export const HEAT_DOUSE = 30;
/** Returned the third straight on-fire shot in a rally. */
export const HEAT_ICE = 20;
/** Fire fuel: 100 when lit, drains over this many seconds of rally time. */
export const FIRE_SECONDS = 22;
/** and loses this much each rally its team wins */
export const FIRE_PER_RALLY = 50;
/** a winner while on fire tops it up once */
export const FIRE_REFILL = 25;
/** On fire: shots this much faster, aim dispersion this much tighter, feet this much quicker. */
export const FIRE_SPEED = 1.18;
export const FIRE_ACCURACY = 0.65;
export const FIRE_MOVE = 1.08;
/** Warming up: shots a touch faster. */
export const WARM_SPEED = 1.05;

export type Team = 0 | 1;
export type Format = 'singles' | 'doubles';
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
  /**
   * A shot chosen with the right thumb (a swipe on a phone, the right stick on a
   * gamepad), sent with the press. Without it the press is the classic one-button
   * press and the left stick aims. With it, the left stick only moves: this says what
   * to do and where, and the game times the contact as the ball arrives.
   */
  shot?: Shot;
}

/** what the right thumb asked for: a kind, and an aim in the player's own frame */
export interface Shot {
  /** pass: a tap (or sideways swipe) · jump: swipe up · dive: swipe down · hit: pickleball */
  act: 'pass' | 'jump' | 'dive' | 'hit';
  /** -1 left … 1 right */
  ax: number;
  /** -1 deep / lob … 1 short / tip / dink */
  az: number;
}

export const IDLE: PlayerInput = { mx: 0, mz: 0, swing: false };

/**
 * What a character brings to the court. Fixed for the game and part of the state, so
 * every machine plays the same physics. Kids get a bigger reach and a kinder swing
 * window; nobody gets a faster ball.
 */
export interface Traits {
  /** movement speed multiplier */
  speed: number;
  /** reach multiplier */
  reach: number;
  /** 0–1: how much a mistimed swing is forgiven */
  forgive: number;
  /** heat gain multiplier */
  heat: number;
  /** 0–1: how far a shot aimed past a line bends back inside it */
  shape: number;
  /** an early swing at a ball that must bounce waits for the bounce instead of faulting */
  guard: boolean;
}

/**
 * The three play styles. Named for how they feel, never "easy": Pro Control is pure
 * physics; Arcade Flow and Turbo Fun reach further, forgive timing, and pull wild shots
 * back toward the lines, so a 7-year-old and a 40-year-old can share a court.
 */
export type PlayStyle = 'pro' | 'arcade' | 'turbo';
export const STYLE_TRAITS: Record<PlayStyle, Traits> = {
  pro: { speed: 1, reach: 1, forgive: 0, heat: 1, shape: 0, guard: false },
  arcade: { speed: 1, reach: 1.22, forgive: 0.4, heat: 1, shape: 0.5, guard: false },
  turbo: { speed: 1, reach: 1.48, forgive: 0.7, heat: 1.1, shape: 0.8, guard: true },
};
export const ADULT: Traits = STYLE_TRAITS.pro;

export interface Player {
  team: Team;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** ticks since the swing began, -1 when not swinging */
  swingT: number;
  cooldown: number;
  swingHit: boolean;
  /** 0–100 */
  heat: number;
  /** fire fuel 0–100; 0 = not on fire */
  fire: number;
  /** a winner while on fire has refilled the fuel this time */
  refilled: boolean;
  /** rallies after a fire goes out at half heat gain */
  chill: number;
  /** rallies won in a row with their own shot */
  streak: number;
  /** a kitchen fault: the chef hat stays on until this tick */
  chefUntil: number;
  /** ticks since a right-thumb shot was asked for, -1 when none is waiting */
  qT: number;
  /** that shot's aim, used at contact instead of the stick while aimOn */
  aimX: number;
  aimZ: number;
  aimOn: boolean;
  stats: PlayerStats;
}

/** For the awards at the end. */
export interface PlayerStats {
  hits: number;
  dinks: number;
  lobs: number;
  winners: number;
  /** feet run */
  run: number;
  fires: number;
  bestStreak: number;
  kitchen: number;
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
}

export interface PointResult {
  faultTeam: Team;
  /** the player who made the error, or -1 when it was the team (a missed ball) */
  faultBy: number;
  reason: FaultReason;
  /** team that scored, or null when no point was scored (side out, second server) */
  scorer: Team | null;
  sideOut: boolean;
  /** player whose shot won the rally, or -1 */
  shotBy: number;
  /** shots in the rally */
  rally: number;
}

/** Moments worth a callout, in order. The controller turns them into words and sound. */
export type CallKind =
  | 'start'
  | 'side-out'
  | 'ace'
  | 'kitchen'
  | 'two-bounce'
  | 'dink'
  | 'lob'
  | 'smash'
  | 'rally10'
  | 'rally20'
  | 'warm'
  | 'fire'
  | 'cooled' // the fire ran out, or three straight returns of on-fire shots
  | 'doused' // lost a rally while on fire
  | 'combo' // both teammates hit, and won it
  | 'streak' // 3+ rallies in a row won with their own shot
  | 'tied' // back level after trailing by 3+
  | 'game-point'
  | 'overtime'
  | 'win';

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
  /** player index serving */
  server: number;
  /** doubles: 1 or 2 */
  serverNum: 1 | 2;
  /** doubles: the player index standing in each team's right-hand court */
  right: [number, number];
  ball: Ball;
  /** shots struck this rally; the serve is 1 */
  hits: number;
  /** bounces since the last shot */
  bounces: number;
  lastHitter: number;
  lastBounce: { x: number; z: number; tick: number; in: boolean } | null;
  lastPoint: PointResult | null;
  pointSeq: number;
  hitSeq: number;
  bounceSeq: number;
  /** the last perfectly timed hit's seq, for the flash */
  perfectSeq: number;
  /** players who hit in this rally, as a bitmask */
  touched: number;
  /** what the last shot was */
  lastShot: 'drive' | 'dink' | 'lob' | 'serve';
  /** consecutive returns of on-fire shots this rally */
  ice: number;
  /** the largest deficit each team has had, for "tied" */
  deficit: [number, number];
  winner: Team | -1;
  calls: Call[];
  callSeq: number;
}

// ————— helpers —————

/** +1 for team 0 (z > 0), -1 for team 1 */
export function sgn(team: Team): number {
  return team === 0 ? 1 : -1;
}

export function sideOfZ(z: number): Team {
  return z >= 0 ? 0 : 1;
}

export function other(team: Team): Team {
  return team === 0 ? 1 : 0;
}

export function teamOf(state: Pick<GameState, 'players'>, i: number): Team {
  return state.players[i].team;
}

/** the player indexes on a team */
export function teamPlayers(state: Pick<GameState, 'players'>, team: Team): number[] {
  const out: number[] = [];
  state.players.forEach((p, i) => { if (p.team === team) out.push(i); });
  return out;
}

export function partnerOf(state: Pick<GameState, 'players'>, i: number): number {
  const mates = teamPlayers(state, state.players[i].team);
  return mates.find((m) => m !== i) ?? i;
}

/** is this player serving or receiving from their own right-hand court */
export function onRight(state: Pick<GameState, 'format' | 'right' | 'scores' | 'players'>, i: number): boolean {
  const team = state.players[i].team;
  if (state.format === 'singles') return state.scores[team] % 2 === 0;
  return state.right[team] === i;
}

/** for compatibility with the HUD: does the server stand on their right */
export function serveFromRight(state: GameState): boolean {
  return onRight(state, state.server);
}

/** world x sign of the court player i serves or receives from */
export function courtSignOf(state: GameState, i: number): number {
  return (onRight(state, i) ? 1 : -1) * sgn(state.players[i].team);
}

/**
 * World x sign of the court a team's serve-time player stands in. In singles it follows
 * the serving team's score; in doubles each player has their own court.
 */
export function serveCourtSign(state: GameState, team: Team): number {
  if (state.format === 'singles') return (state.scores[state.servingTeam] % 2 === 0 ? 1 : -1) * sgn(team);
  if (team === state.servingTeam) return courtSignOf(state, state.server);
  return courtSignOf(state, receiverOf(state));
}

/** the player who must return the serve: diagonal from the server */
export function receiverOf(state: GameState): number {
  const rt = other(state.servingTeam);
  const mates = teamPlayers(state, rt);
  if (mates.length === 1) return mates[0];
  const serverRight = onRight(state, state.server);
  return serverRight ? state.right[rt] : mates.find((m) => m !== state.right[rt])!;
}

export function isGameOver(scores: [number, number]): Team | -1 {
  for (const s of [0, 1] as Team[]) {
    const a = scores[s];
    const b = scores[other(s)];
    if (a >= GAME_TO && a - b >= WIN_BY) return s;
  }
  return -1;
}

/** "4–2–1": serving team's score, receiving team's, and in doubles which server */
export function scoreCall(state: GameState): string {
  const a = state.scores[state.servingTeam];
  const b = state.scores[other(state.servingTeam)];
  return state.format === 'doubles' ? `${a}–${b}–${state.serverNum}` : `${a}–${b}`;
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

function newPlayer(team: Team): Player {
  return {
    team, x: 0, z: sgn(team) * 20, vx: 0, vz: 0, swingT: -1, cooldown: 0, swingHit: false,
    heat: 0, fire: 0, refilled: false, chill: 0, streak: 0, chefUntil: 0, qT: -1, aimX: 0, aimZ: 0, aimOn: false,
    stats: { hits: 0, dinks: 0, lobs: 0, winners: 0, run: 0, fires: 0, bestStreak: 0, kitchen: 0 },
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    scores: [s.scores[0], s.scores[1]],
    right: [s.right[0], s.right[1]],
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
  // Keep the last few only: the state travels over the network.
  state.calls = [...state.calls.slice(-5), { seq: state.callSeq, kind, player, ...(n !== undefined ? { n } : {}) }];
}

// ————— setup —————

export interface GameOptions {
  format?: Format;
  firstTeam?: Team;
  /** per player; missing ones are ADULT */
  traits?: Traits[];
}

export function createGame(seed: number, opts: GameOptions | Team = {}): GameState {
  const o: GameOptions = typeof opts === 'number' ? { firstTeam: opts } : opts;
  const format = o.format ?? 'singles';
  const teams: Team[] = format === 'doubles' ? [0, 0, 1, 1] : [0, 1];
  const firstTeam = o.firstTeam ?? 0;
  const state: GameState = {
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    format,
    phase: 'serve',
    phaseTicks: 0,
    players: teams.map(newPlayer),
    traits: teams.map((_, i) => o.traits?.[i] ?? ADULT),
    scores: [0, 0],
    servingTeam: firstTeam,
    server: 0,
    // the first serving team in doubles gets only one server: "0–0–2"
    serverNum: 2,
    right: format === 'doubles' ? [0, 2] : [0, 1],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hot: false },
    hits: 0,
    bounces: 0,
    lastHitter: -1,
    lastBounce: null,
    lastPoint: null,
    pointSeq: 0,
    hitSeq: 0,
    bounceSeq: 0,
    perfectSeq: 0,
    touched: 0,
    lastShot: 'serve',
    ice: 0,
    deficit: [0, 0],
    winner: -1,
    calls: [],
    callSeq: 0,
  };
  state.server = format === 'doubles' ? state.right[firstTeam] : teamPlayers(state, firstTeam)[0];
  setupServe(state);
  call(state, 'start', state.server);
  return state;
}

/** place everyone for the next serve and put the ball in the server's hand */
export function setupServe(state: GameState) {
  const srvTeam = state.servingTeam;
  const rcvTeam = other(srvTeam);
  const receiver = receiverOf(state);
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const s = sgn(p.team);
    const cx = courtSignOf(state, i);
    if (i === state.server) {
      p.x = (state.format === 'singles' ? serveCourtSign(state, srvTeam) : cx) * 4.5;
      p.z = s * (HALF_LENGTH + 1);
    } else if (i === receiver) {
      p.x = (state.format === 'singles' ? serveCourtSign(state, rcvTeam) : cx) * 4.5;
      p.z = s * (HALF_LENGTH + 1.5);
    } else if (p.team === srvTeam) {
      // the server's partner waits at the baseline on the other court
      p.x = cx * 5;
      p.z = s * (HALF_LENGTH + 0.5);
    } else {
      // the receiver's partner starts up at the kitchen line
      p.x = cx * 5;
      p.z = s * (KITCHEN + 1.2);
    }
    p.vx = 0;
    p.vz = 0;
    p.swingT = -1;
    p.cooldown = 0;
    p.swingHit = false;
    p.qT = -1;
    p.aimOn = false;
  }
  state.phase = 'serve';
  state.phaseTicks = 0;
  state.hits = 0;
  state.bounces = 0;
  state.lastHitter = -1;
  state.lastBounce = null;
  state.touched = 0;
  state.ice = 0;
  state.lastShot = 'serve';
  holdBall(state);
}

/** ball rests at the server's paddle, below the waist (underhand) */
function holdBall(state: GameState) {
  const p = state.players[state.server];
  const s = sgn(p.team);
  state.ball = { x: p.x + s * 1.1, y: 1.6, z: p.z - s * 0.9, vx: 0, vy: 0, vz: 0, hot: p.fire > 0 };
}

// ————— scoring —————

/** heat gain for a player right now: comeback spark, post-fire chill, play style */
function gainFor(state: GameState, i: number, base: number): number {
  const p = state.players[i];
  const down = state.scores[other(p.team)] - state.scores[p.team];
  const spark = down >= 5 ? 1.45 : down >= 3 ? 1.25 : 1;
  return base * state.traits[i].heat * spark * (p.chill > 0 ? 0.5 : 1);
}

/** add heat; at 100 the player catches fire */
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

/** apply a fault by a team: heat, streaks and the score move together */
export function awardRally(state: GameState, faultTeam: Team, reason: FaultReason, faultBy = -1) {
  const srvTeam = state.servingTeam;
  const winTeam = other(faultTeam);
  const shotBy = state.lastHitter >= 0 && state.players[state.lastHitter].team === winTeam ? state.lastHitter : -1;
  const rally = state.hits;
  let scorer: Team | null = null;
  let sideOut = false;

  if (faultTeam === srvTeam) {
    if (state.format === 'doubles' && state.serverNum === 1) {
      // second server: the partner serves from wherever they stand
      state.serverNum = 2;
      state.server = partnerOf(state, state.server);
    } else {
      sideOut = true;
      state.servingTeam = winTeam;
      state.serverNum = 1;
      state.server = state.format === 'doubles' ? state.right[winTeam] : teamPlayers(state, winTeam)[0];
    }
  } else {
    state.scores[srvTeam] += 1;
    scorer = srvTeam;
    if (state.format === 'doubles') state.right[srvTeam] = partnerOf(state, state.right[srvTeam]);
    state.winner = isGameOver(state.scores);
  }

  // ——— hot streaks ———
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
  const combo = winners.length === 2 && winners.every((i) => (state.touched & (1 << i)) !== 0);
  for (const i of winners) {
    const p = state.players[i];
    if (p.fire > 0) {
      p.fire -= FIRE_PER_RALLY;
      if (i === shotBy && !p.refilled) { p.fire += FIRE_REFILL; p.refilled = true; }
      if (p.fire <= 0) putOut(state, i, 0);
    }
    let gain = 0;
    if (i === shotBy) {
      gain += HEAT_WINNER;
      p.streak += 1;
      p.stats.winners += 1;
      p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
      if (doused) gain += HEAT_DOUSE;
    }
    if (combo) gain += HEAT_COMBO;
    addHeat(state, i, gain);
    if (p.chill > 0 && p.fire === 0) p.chill -= 1;
  }

  // ——— callouts, most specific first ———
  if (reason === 'kitchen-volley' && faultBy >= 0) {
    state.players[faultBy].chefUntil = state.tick + 3 * HZ;
    state.players[faultBy].stats.kitchen += 1;
    call(state, 'kitchen', faultBy);
  } else if (reason === 'two-bounce' && faultBy >= 0) {
    call(state, 'two-bounce', faultBy);
  } else if (rally === 1 && reason === 'double-bounce') {
    call(state, 'ace', state.lastHitter >= 0 ? state.lastHitter : state.server);
  } else if (shotBy >= 0 && reason === 'double-bounce') {
    if (state.lastShot === 'dink') call(state, 'dink', shotBy);
    else if (state.lastShot === 'lob') call(state, 'lob', shotBy);
    else if (state.ball.hot) call(state, 'smash', shotBy);
  }
  if (combo && shotBy >= 0) call(state, 'combo', shotBy);
  if (shotBy >= 0 && state.players[shotBy].streak >= 3 && state.players[shotBy].fire === 0) call(state, 'streak', shotBy, state.players[shotBy].streak);
  if (rally >= 20) call(state, 'rally20', shotBy, rally);
  else if (rally >= 10) call(state, 'rally10', shotBy, rally);

  for (const t of [0, 1] as Team[]) state.deficit[t] = Math.max(state.deficit[t], state.scores[other(t)] - state.scores[t]);
  if (scorer !== null) {
    const a = state.scores[0];
    const b = state.scores[1];
    if (state.winner !== -1) call(state, 'win', shotBy >= 0 ? shotBy : state.server);
    else if (a === b && state.deficit[scorer] >= 3) { call(state, 'tied', state.server); state.deficit = [0, 0]; }
    else if (a >= GAME_TO - 1 && b >= GAME_TO - 1 && a === b) call(state, 'overtime', state.server);
    else if (state.scores[scorer] >= GAME_TO - 1 && state.scores[scorer] > state.scores[other(scorer)]) call(state, 'game-point', state.server);
  } else if (sideOut) {
    call(state, 'side-out', state.server);
  }

  state.lastPoint = { faultTeam, faultBy, reason, scorer, sideOut, shotBy, rally };
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

/**
 * Move one player with their input; shared with the guest's own-player prediction.
 * `serving` pins the server behind the baseline in their court (courtSign).
 */
export function movePlayer(p: Player, input: PlayerInput, phase: Phase, serving: boolean, courtSign: number, speedMul = 1) {
  const s = sgn(p.team);
  let wx = clamp(Math.round(input.mx), -1, 1) * s;
  let wz = -clamp(Math.round(input.mz), -1, 1) * s;
  if (wx !== 0 && wz !== 0) {
    wx *= 0.7071;
    wz *= 0.7071;
  }
  const speed = PLAYER_SPEED * speedMul * (p.swingT >= 0 ? 0.55 : 1) * (p.fire > 0 ? FIRE_MOVE : 1);
  const k = Math.min(1, 14 * DT);
  p.vx += (wx * speed - p.vx) * k;
  p.vz += (wz * speed - p.vz) * k;

  if (phase === 'serve' && serving) {
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
      p.aimOn = false;
    }
  } else if (input.swing && !input.shot && p.cooldown <= 0) {
    p.swingT = 0;
    p.swingHit = false;
  }
}

/** how long a right-thumb shot waits for the ball before it's forgotten */
const SHOT_WAIT = 300;

/**
 * A shot asked for with the right thumb: remember it, then start the swing on our own
 * at the moment the paddle will meet the ball, keeping the rules (let the serve and
 * return bounce; no volleys from the kitchen). Where you stand is still yours.
 */
function queueShot(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  const shot = input.shot!;
  p.qT = 0;
  p.aimX = clamp(shot.ax, -1, 1);
  p.aimZ = clamp(shot.az, -1, 1);
}

function tickShot(state: GameState, i: number, input: PlayerInput): PlayerInput {
  const p = state.players[i];
  if (p.qT < 0) return input;
  p.qT += 1;
  if (p.qT > SHOT_WAIT) { p.qT = -1; return input; }
  if (p.swingT >= 0 || p.cooldown > 0) return input;
  if (state.lastHitter >= 0 && state.players[state.lastHitter].team === p.team) return input;
  // only the diagonal receiver may return the serve
  if (state.hits === 1 && state.format === 'doubles' && i !== receiverOf(state)) { p.qT = -1; return input; }
  const reach = REACH * state.traits[i].reach;
  const mustBounce = state.hits <= 2 || Math.abs(p.z) <= KITCHEN;
  // follow the ball forward: the first moment it's legal and low enough to hit
  const b: Ball = { ...state.ball };
  let bounced = state.bounces >= 1;
  let meet: { x: number; z: number; k: number } | null = null;
  for (let k = 1; k <= 150; k++) {
    const ev = stepBall(b);
    if (ev === 'bounce') { if (bounced) break; bounced = true; }
    if (ev === 'net') break;
    if (k < SWING_SWEET) continue;
    if (sideOfZ(b.z) !== p.team || b.y > 7.5 || (mustBounce && !bounced)) continue;
    // reachable from here by the time it arrives, with a step or two
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (k === SWING_SWEET && d <= reach * 0.95) {
      p.swingT = 0;
      p.swingHit = false;
      p.aimOn = true;
      p.qT = -1;
      return input;
    }
    if (!meet && d - reach * 0.6 <= PLAYER_SPEED * (k - SWING_SWEET) * DT * 1.05) meet = { x: b.x, z: b.z, k };
  }
  // a shot asked for with the stick at rest: take the steps to the ball for you
  if (meet && Math.abs(input.mx) < 0.2 && Math.abs(input.mz) < 0.2) {
    const s = sgn(p.team);
    // stand a little to the side so it comes onto the paddle, not the body
    const wantX = meet.x - s * 0.9;
    const dx = wantX - p.x;
    const dz = meet.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      // world → stick: mx is right (+x for team 0), mz is toward the net
      return { ...input, mx: (dx * s) / d, mz: (-dz * s) / d };
    }
  }
  return input;
}

// ————— the step —————

export function step(prev: GameState, inputs: PlayerInput[]): GameState {
  const state = cloneState(prev);
  state.tick += 1;
  state.phaseTicks += 1;

  if (state.phase === 'over') {
    stepBall(state.ball);
    return state;
  }

  // players
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const input = inputs[i] ?? IDLE;
    const serving = i === state.server;
    const wasIdle = p.swingT < 0;
    tickSwing(p, input);
    if (input.swing && input.shot) {
      if (state.phase === 'serve' && serving) {
        if (wasIdle && p.cooldown <= 0) { p.swingT = 0; p.swingHit = false; }
      } else if (state.phase === 'rally') {
        queueShot(state, i, input);
      }
    }
    let move = input;
    if (state.phase === 'rally') move = tickShot(state, i, input);
    const bx = p.x;
    const bz = p.z;
    movePlayer(p, move, state.phase, serving, serveCourtSign(state, p.team), state.traits[i].speed);
    p.stats.run += Math.hypot(p.x - bx, p.z - bz);
    if (state.phase === 'rally' && p.fire > 0) {
      p.fire -= 100 / (FIRE_SECONDS * HZ);
      if (p.fire <= 0) { putOut(state, i, 0); call(state, 'cooled', i); }
    }

    if (state.phase === 'serve' && serving && wasIdle && p.swingT === 0) {
      if (state.phaseTicks < SERVE_READY) {
        p.swingT = -1; // too soon after the last point; ignore the press
      } else {
        serve(state, input.shot ? { ...input, mx: input.shot.ax, mz: input.shot.az } : input);
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

  // rally: contact first (the paddle meets the ball where it is), then flight.
  // When two teammates could both reach it, the one closer to the ball takes it.
  const order = state.players.map((_, i) => i).sort((a, b) => {
    const pa = state.players[a];
    const pb = state.players[b];
    return Math.hypot(pa.x - state.ball.x, pa.z - state.ball.z) - Math.hypot(pb.x - state.ball.x, pb.z - state.ball.z) || a - b;
  });
  for (const i of order) {
    if (state.phase !== 'rally') break;
    tryContact(state, i, inputs[i] ?? IDLE);
  }
  if (state.phase !== 'rally') return state;

  const ev = stepBall(state.ball);
  if (ev === 'net') {
    const by = state.lastHitter === -1 ? state.server : state.lastHitter;
    awardRally(state, state.players[by].team, 'net', by);
  } else if (ev === 'bounce') {
    onBounce(state);
  }
  return state;
}

function serve(state: GameState, input: PlayerInput) {
  const srv = state.server;
  const team = state.players[srv].team;
  const rcvTeam = other(team);
  const s = sgn(team);
  holdBall(state);
  const courtX = serveCourtSign(state, rcvTeam);
  const fire = state.players[srv].fire > 0;
  const aimX = courtX * 5 + clamp(input.mx, -1, 1) * s * 4.2 + (rand(state) - 0.5) * (fire ? 0.9 : 1.8);
  const depth = 15.5 - clamp(input.mz, -1, 1) * 5 + (rand(state) - 0.5) * (fire ? 1.3 : 2.6);
  const v = solveShot(state.ball, aimX, -s * depth, fire ? 0.95 : 1.1);
  state.ball.vx = v.vx;
  state.ball.vy = v.vy;
  state.ball.vz = v.vz;
  state.ball.hot = fire;
  state.phase = 'rally';
  state.phaseTicks = 0;
  state.touched = 1 << srv;
  state.lastShot = 'serve';
  state.players[srv].stats.hits += 1;
  state.hits = 1;
  state.bounces = 0;
  state.lastHitter = srv;
  state.hitSeq += 1;
}

function tryContact(state: GameState, i: number, input: PlayerInput) {
  const p = state.players[i];
  const t = state.traits[i];
  const b = state.ball;
  if (p.swingT < 0 || p.swingHit || p.swingT > SWING_ACTIVE) return;
  if (state.lastHitter >= 0 && state.players[state.lastHitter].team === p.team) return;
  if (sideOfZ(b.z) !== p.team) return;
  // only the diagonal receiver may return the serve
  if (state.hits === 1 && state.format === 'doubles' && i !== receiverOf(state)) return;
  if (b.y > 7.5) return;
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const reach = REACH * t.reach;
  if (dx * dx + dz * dz > reach * reach) return;

  const volley = state.bounces === 0;
  // a right-thumb shot keeps the rules for you: it waits for the bounce rather than fault
  if (p.aimOn && volley && (state.hits <= 2 || Math.abs(p.z) <= KITCHEN)) return;
  if (volley && state.hits <= 2 && t.guard) {
    // Turbo Fun's ready-hop: hold the swing until it bounces instead of faulting
    p.swingT = Math.min(p.swingT, 6);
    return;
  }
  p.swingHit = true;
  if (volley && state.hits <= 2) {
    awardRally(state, p.team, 'two-bounce', i);
    return;
  }
  if (volley && Math.abs(p.z) <= KITCHEN) {
    awardRally(state, p.team, 'kitchen-volley', i);
    return;
  }

  const s = sgn(p.team);
  const fire = p.fire > 0;
  const warm = !fire && p.heat >= HEAT_WARM;
  // an on-fire shot comes back: three straight returns and the fire goes out
  if (b.hot && state.lastHitter >= 0) {
    state.ice += 1;
    const blazer = state.lastHitter;
    if (state.ice >= 3 && state.players[blazer].fire > 0) {
      putOut(state, blazer, 25);
      call(state, 'cooled', blazer);
      addHeat(state, i, HEAT_ICE);
      state.ice = 0;
    }
  } else {
    state.ice = 0;
  }
  // timing: + early (paddle was already through), - late
  const timing = (p.swingT - SWING_SWEET) / SWING_SWEET;
  const quality = clamp(1 - Math.abs(timing) * 0.9 * (1 - t.forgive * 0.6), 0, 1);
  const err = (1 - quality) * (fire ? FIRE_ACCURACY : 1);
  if (p.aimOn) input = { ...input, mx: p.aimX, mz: p.aimZ > 0.5 ? 1 : p.aimZ < -0.5 ? -1 : 0 };
  p.aimOn = false;
  const offsetLocal = dx * s; // + when the ball is on the player's right
  const aimLocal = clamp(input.mx, -1, 1) * 4.5 + offsetLocal * 0.9 - timing * 2.6 * (1 - t.forgive * 0.5);
  let tx = clamp(aimLocal, -11, 11) * s + (rand(state) - 0.5) * err * 5;

  const mz = clamp(Math.round(input.mz), -1, 1);
  let depth = mz > 0 ? 4.5 : mz < 0 ? 18.5 : 15.5;
  depth += (rand(state) - 0.5) * err * 7;
  // Arcade Flow and Turbo Fun: a shot aimed past a line bends back toward it
  if (t.shape > 0) {
    const limX = HALF_WIDTH - 0.6;
    if (Math.abs(tx) > limX) tx = Math.sign(tx) * (limX + (Math.abs(tx) - limX) * (1 - t.shape));
    const limZ = HALF_LENGTH - 0.6;
    if (depth > limZ) depth = limZ + (depth - limZ) * (1 - t.shape);
  }
  const tz = -s * depth;

  const dist = Math.hypot(tx - b.x, tz - b.z);
  let time: number;
  if (mz > 0) time = Math.max(0.85, dist / 20);
  else if (mz < 0) time = Math.max(1.5, dist / 17);
  else time = Math.max(0.5, dist / ((34 + 14 * quality) * (fire ? FIRE_SPEED : warm ? WARM_SPEED : 1)));

  const from: Ball = { ...b, y: Math.max(b.y, 0.5) };
  const v = solveShot(from, tx, tz, time);
  // a badly mistimed swing flattens out and can find the net; forgiving styles lift it
  if (err > 0.55) v.vy -= (err - 0.55) * 14 * (1 - t.shape * 0.6);

  b.y = from.y;
  b.vx = v.vx;
  b.vy = v.vy;
  b.vz = v.vz;
  b.hot = fire;
  if (quality > 0.93) {
    state.perfectSeq += 1;
    addHeat(state, i, HEAT_SWEET);
  }
  state.lastShot = mz > 0 ? 'dink' : mz < 0 ? 'lob' : 'drive';
  if (mz > 0) p.stats.dinks += 1;
  if (mz < 0) p.stats.lobs += 1;
  p.stats.hits += 1;
  state.touched |= 1 << i;
  state.hits += 1;
  state.bounces = 0;
  state.lastHitter = i;
  state.hitSeq += 1;
}

function onBounce(state: GameState) {
  const b = state.ball;
  const side = sideOfZ(b.z);
  const ax = Math.abs(b.x);
  const az = Math.abs(b.z);
  const hitter = state.lastHitter === -1 ? state.server : state.lastHitter;
  const hitTeam = state.players[hitter].team;
  state.bounceSeq += 1;

  if (state.bounces >= 1) {
    // second bounce: the team on this side failed to return it
    state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: true };
    awardRally(state, side, 'double-bounce');
    return;
  }
  state.bounces = 1;

  if (side === hitTeam) {
    state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: false };
    awardRally(state, hitTeam, 'no-cross', hitter);
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
    if (reason) awardRally(state, hitTeam, reason, hitter);
    return;
  }

  const inBounds = ax <= HALF_WIDTH && az <= HALF_LENGTH;
  state.lastBounce = { x: b.x, z: b.z, tick: state.tick, in: inBounds };
  if (!inBounds) awardRally(state, hitTeam, 'out', hitter);
  else addHeat(state, hitter, HEAT_CLEAN);
}

/** a fresh game for a rematch: new seed, the previous loser serves first, same people */
export function rematch(prev: GameState, seed: number): GameState {
  const first: Team = prev.winner === -1 ? 0 : other(prev.winner);
  return createGame(seed, { format: prev.format, firstTeam: first, traits: prev.traits });
}
