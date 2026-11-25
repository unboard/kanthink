// Volleyball as a Sport: the rules in sim.ts and the bots in bot.ts, wrapped in what the
// shared game loop, renderer, menus and HUD ask of any court sport (see
// app/pickleball/sport.ts). Everything else — characters, venues, the online lobby, touch
// controls — is the same code pickleball runs on.

import type { Award, FigurePose, Sport } from '../pickleball/sport';
import { botInput } from './bot';
import {
  ACT_TICKS, BALL_R, DOWN_DIVE, DOWN_KNOCKED, DT, FAULT_TEXT, HALF_LENGTH, HALF_WIDTH, NET_HEIGHT, PLAYER_GRAVITY, POST_X, SPIKE_SWEET, SWING_TOTAL,
  cloneState, coastPlayer, createGame, holdBall, landing, movePlayer, other, rematch, scoreCall, sgn, step, stepBall,
  type CallKind, type FaultReason, type GameState, type Player, type PlayerStats, type PointResult,
} from './sim';

const ZERO: PlayerStats = { hits: 0, digs: 0, sets: 0, kills: 0, blocks: 0, aces: 0, supers: 0, dives: 0, run: 0, fires: 0, bestStreak: 0 };

/** The announcer. */
function callText(kind: string, name: string, n?: number): { text: string; sub: string } {
  switch (kind as CallKind) {
    case 'start': return { text: 'Side out!', sub: 'Let’s play some volleyball' };
    case 'side-out': return { text: 'Side out!', sub: `${name} to serve` };
    case 'ace': return { text: 'Ace!', sub: `${name}, nobody home` };
    case 'kill': return { text: 'Kill!', sub: `${name} puts it away` };
    case 'super': return { text: 'SUPER SPIKE!', sub: `${name} from the clouds` };
    case 'boom': return { text: 'Boom goes the dynamite!', sub: `${name} left a crater` };
    case 'roof': return { text: 'ROOF!', sub: `${name} says not in my house` };
    case 'tool': return { text: 'Off the block!', sub: `${name} used their hands` };
    case 'tip': return { text: 'Just a little tip', sub: `${name}, soft as a feather` };
    case 'pancake': return { text: 'Pancake!', sub: `${name} laid out for it` };
    case 'dig': return { text: 'What a dig!', sub: `${name} dug a super spike` };
    case 'knocked': return { text: 'Flattened!', sub: `${name} is seeing stars` };
    case 'rally10': return { text: `${n ?? 10} times over the net!`, sub: 'Nobody will let it drop' };
    case 'rally20': return { text: `${n ?? 20} times over!`, sub: 'Rally of the year' };
    case 'warm': return { text: 'Heating up!', sub: `Keep setting ${name}` };
    case 'fire': return { text: `${name} is on fire!`, sub: 'Every spike is a super spike' };
    case 'cooled': return { text: 'Ice cold defense!', sub: `${name} is out of flames` };
    case 'doused': return { text: 'Doused!', sub: `${name}’s fire is out` };
    case 'combo': return { text: 'Bump, set, spike!', sub: 'Textbook teamwork' };
    case 'streak': return { text: `${name} ×${n ?? 3}`, sub: 'Can’t be stopped right now' };
    case 'tied': return { text: 'All tied up!', sub: 'We got a game' };
    case 'game-point': return { text: 'Game point!', sub: 'One more for glory' };
    case 'overtime': return { text: 'Overtime!', sub: 'Gotta win by two' };
    case 'win': return { text: 'Champs of the sand!', sub: 'High fives all around' };
  }
  return { text: '', sub: '' };
}

/** Everyone gets an award at the end, winners and runners-up alike. */
export function awardsFor(players: Array<{ stats: object }>): Award[] {
  const kinds: Array<{ title: string; score: (s: PlayerStats) => number; line: (s: PlayerStats) => string }> = [
    { title: 'Superhuman', score: (s) => s.supers * 2.4, line: (s) => `${s.supers} super spike${s.supers === 1 ? '' : 's'}` },
    { title: 'Fire Starter', score: (s) => s.fires * 3, line: (s) => `Caught fire ${s.fires} time${s.fires === 1 ? '' : 's'}` },
    { title: 'The Hammer', score: (s) => s.kills * 1.1, line: (s) => `${s.kills} kills` },
    { title: 'The Wall', score: (s) => s.blocks * 1.6, line: (s) => `${s.blocks} blocks` },
    { title: 'Ace Machine', score: (s) => s.aces * 2.2, line: (s) => `${s.aces} ace${s.aces === 1 ? '' : 's'}` },
    { title: 'Sand Shark', score: (s) => s.digs * 1.0, line: (s) => `${s.digs} digs` },
    { title: 'Quarterback', score: (s) => s.sets * 1.1, line: (s) => `${s.sets} sets` },
    { title: 'Human Pancake', score: (s) => s.dives * 1.8, line: (s) => `${s.dives} dive${s.dives === 1 ? '' : 's'}` },
    { title: 'Cardio Champ', score: (s) => s.run / 300, line: (s) => `Ran ${Math.round(s.run)} feet` },
    { title: 'Workhorse', score: (s) => s.hits / 7, line: (s) => `${s.hits} touches` },
  ];
  const stat = (i: number) => players[i].stats as PlayerStats;
  const taken = new Set<string>();
  const order = players.map((_, i) => i).sort((a, b) => stat(b).hits - stat(a).hits);
  const out: Award[] = [];
  for (const i of order) {
    const s = stat(i);
    const best = kinds.filter((k) => !taken.has(k.title)).sort((a, b) => b.score(s) - a.score(s))[0] ?? kinds[9];
    taken.add(best.title);
    out.push({ player: i, title: best.title, line: best.line(s) });
  }
  return out.sort((a, b) => a.player - b.player);
}

/** what the figure should be doing: the sim's action and timing, as an animation and how far through it */
function pose(state: GameState, i: number): FigurePose {
  const p = state.players[i];
  const air = p.y;
  if (p.down > 0) {
    if (p.act === 'dive') return { action: 'dive', phase: 0.4 + (1 - p.down / DOWN_DIVE) * 0.6, air: 0, chef: false };
    return { action: 'down', phase: 1 - p.down / DOWN_KNOCKED, air: 0, chef: false };
  }
  if (state.phase === 'serve' && i === state.server && state.toss >= 0 && p.act !== 'serve') {
    return { action: 'toss', phase: Math.min(1, state.toss / 55), air, chef: false };
  }
  if (p.swingT < 0 || p.act === 'none') return { action: 'none', phase: 0, air, chef: false };
  const struck = p.swingHit && state.lastHitter === i;
  const since = state.tick - state.hitTick;
  switch (p.act) {
    case 'bump': return { action: 'bump', phase: Math.min(1, p.swingT / ACT_TICKS.bump), air, chef: false };
    case 'set': return { action: 'set', phase: Math.min(1, p.swingT / ACT_TICKS.set), air, chef: false };
    case 'dive': return { action: 'dive', phase: Math.min(0.4, (p.swingT / ACT_TICKS.dive) * 0.4), air: 0, chef: false };
    case 'block': return { action: 'block', phase: Math.min(0.78, p.swingT / 60), air, chef: false };
    case 'serve': return { action: 'spike', phase: Math.min(1, 0.42 + (p.swingT / ACT_TICKS.serve) * 0.58), air, chef: false };
    case 'spike': {
      // wind up to the top, hold there until the hand meets the ball, then snap through
      if (struck) return { action: 'spike', phase: Math.min(0.95, 0.42 + (since / 46) * 0.5), air, chef: false };
      const windup = Math.min(0.42, (p.swingT / SPIKE_SWEET) * 0.42);
      const late = p.swingT > SPIKE_SWEET + 26 ? ((p.swingT - SPIKE_SWEET - 26) / 40) * 0.5 : 0;
      return { action: 'spike', phase: Math.min(0.95, windup + late), air, chef: false };
    }
  }
  return { action: 'none', phase: 0, air, chef: false };
}

export const VOLLEYBALL: Sport<GameState> = {
  id: 'volleyball',
  name: 'Volleyball',
  tagline: 'Bump · Set · Super spike',
  loading: 'Raking the sand…',
  path: '/volleyball',
  court: { sport: 'volleyball', halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH, netHeight: NET_HEIGHT, postX: POST_X, kitchen: 0 },
  prop: 'none',
  ball: 'volley',
  ballRadius: BALL_R * 1.75,
  dt: DT,
  botNames: ['Sandy', 'Spike', 'Coco', 'Digger', 'Sunny', 'Roofer', 'Bumper', 'Ace'],
  gesture(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 16) return { shot: { act: 'pass', ax: 0, az: 0 }, word: 'Pass' };
    if (dy > len * 0.55) {
      const ax = Math.max(-1, Math.min(1, (dx / len) * 1.7));
      if (len < 55) return { shot: { act: 'jump', ax, az: 1 }, word: 'Tip' };
      const deep = len > 170;
      return { shot: { act: 'jump', ax, az: deep ? -1 : 0 }, word: deep ? 'Spike deep' : ax > 0.4 ? 'Spike right' : ax < -0.4 ? 'Spike left' : 'Spike' };
    }
    if (dy < -len * 0.55) return { shot: { act: 'dive', ax: dx / len, az: dy / len }, word: dx > len * 0.45 ? 'Dive right' : dx < -len * 0.45 ? 'Dive left' : 'Dive' };
    return { shot: { act: 'pass', ax: Math.sign(dx), az: 0 }, word: dx > 0 ? 'Set right' : 'Set left' };
  },
  pad: { tap: 'Pass', up: 'Spike', flick: 'Tip', down: 'Dive', side: 'Set', serve: 'Serve' },
  action: 'Hit',
  hint: 'One button bumps, sets, spikes and blocks. Left/right aims, up tips it short, down goes deep',
  teamNames: ['Coral team', 'Teal team'],

  createGame: (seed, opts) => createGame(seed, opts),
  step,
  rematch,
  cloneState,
  scoreCall,
  botInput: (s, i, opts) => botInput(s, i, opts),
  moveOwn(v, seat, own, input) {
    movePlayer(v, seat, own as Player, input);
  },
  coast(v, age, own) {
    v.players.forEach((p, i) => {
      if (own(i)) {
        // where you run is yours to predict; the jump is the host's, coasted here
        if (p.y > 0 || p.vy > 0) {
          p.vy -= PLAYER_GRAVITY * DT;
          p.y = Math.max(0, p.y + p.vy * DT);
        }
      } else if (age < 0.3) {
        coastPlayer(p);
      }
      if (p.swingT >= 0 && p.swingT < SWING_TOTAL) p.swingT += 1;
      if (p.down > 0) p.down -= 1;
    });
    if (v.phase === 'serve' && v.toss < 0) {
      holdBall(v);
    } else if (age < 1.5) {
      if (v.toss >= 0) v.toss += 1;
      stepBall(v.ball);
    }
  },
  swingTicks: SWING_TOTAL,

  pose,
  landing(state) {
    const b = state.ball;
    if (b.y <= BALL_R + 0.05 && b.vy <= 0) return null;
    return landing(b);
  },
  serveTarget(state) {
    if (state.toss >= 0) return null;
    const rcv = other(state.servingTeam);
    return { x: 0, z: sgn(rcv) * (HALF_LENGTH / 2), w: HALF_WIDTH * 2, d: HALF_LENGTH };
  },
  warnZone: () => null,

  callText,
  callRank: ['win', 'boom', 'super', 'fire', 'roof', 'knocked', 'doused', 'cooled', 'tied', 'overtime', 'game-point', 'ace', 'pancake', 'dig', 'combo', 'kill', 'tool', 'tip', 'streak', 'rally20', 'rally10', 'warm', 'side-out', 'start'],
  callCheer: { win: 1, boom: 1, super: 0.8, fire: 0.9, roof: 0.95, knocked: 0.6, ace: 0.7, pancake: 0.8, dig: 0.8, combo: 0.6, kill: 0.6, rally20: 1, rally10: 0.75, tied: 0.8, 'game-point': 0.7, overtime: 0.9, doused: 0.6, cooled: 0.6, tool: 0.4, tip: 0.4, streak: 0.6 },
  slowmo: ['super'],
  faultText: (reason) => FAULT_TEXT[reason as FaultReason] ?? '',
  pointTitle(point, teamName) {
    const how = (point as PointResult).how;
    const team = point.scorer !== null ? teamName(point.scorer) : '';
    if (how === 'ace') return `Ace · ${team}`;
    if (how === 'roof') return `Stuffed · ${team}`;
    if (how === 'kill') return `Kill · ${team}`;
    if (how === 'tip') return `Tipped in · ${team}`;
    if (how === 'tool') return `Off the block · ${team}`;
    return `Point ${team}`;
  },
  serveHint: (_s, serverName, shared) => `${shared ? `${serverName}, serve` : 'Your serve'}: tap to toss, then swipe up near the top for a jump serve (or let it float)`,
  awards: awardsFor,
  zeroStats: ZERO,
};
