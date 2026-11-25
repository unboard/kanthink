// Soccer as a Sport: the rules in sim.ts and the bots in bot.ts, wrapped in what the shared
// game loop, renderer, menus and HUD ask of any court sport (app/pickleball/sport.ts).
// Characters, venues, online rooms, the camera and the touch controls are the same code
// the other two games run on. (Named football.ts so it can't clash with Soccer.tsx on a
// case-insensitive disk.)

import type { Award, FigurePose, Sport } from '../pickleball/sport';
import { botInput } from './bot';
import {
  BALL_R, CENTER_R, DIVE_TICKS, DOWN_DIVE, DT, GOAL_DEPTH, GOAL_H, GOAL_HALF, HALF_LENGTH, HALF_WIDTH, KICK_R, KICK_TICKS, ZONE_DEPTH, ZONE_HALF,
  cloneState, coastPlayer, createGame, landing, movePlayer, rematch, scoreCall, sgn, step, stepBall,
  type GameState, type How, type Player, type PlayerStats, type PointResult,
} from './sim';

const ZERO: PlayerStats = { goals: 0, shots: 0, saves: 0, dives: 0, volleys: 0, banks: 0, lobs: 0, supers: 0, run: 0, fires: 0, hits: 0 };

function callText(kind: string, name: string, n?: number): { text: string; sub: string } {
  switch (kind) {
    case 'start': return { text: 'Kickoff!', sub: 'First to five wins' };
    case 'goal': return { text: 'GOOOAL!', sub: `${name} puts it away` };
    case 'bank': return { text: 'Off the wall!', sub: `${name} banked it in` };
    case 'lob': return { text: 'Over the top!', sub: `${name} lobbed the keeper` };
    case 'volley': return { text: 'Volley!', sub: `${name} hit it out of the air` };
    case 'rocket': return { text: 'ROCKET!', sub: `${name} nearly broke the net` };
    case 'super': return { text: 'SUPER SHOT!', sub: `${name} is on fire` };
    case 'own': return { text: 'Own goal!', sub: 'Wrong net, unlucky' };
    case 'save': return { text: 'What a save!', sub: `${name} said not today` };
    case 'bar': return { text: 'Off the post!', sub: `${name}, so close` };
    case 'hattrick': return { text: 'Hat trick!', sub: `Three for ${name}` };
    case 'warm': return { text: 'Heating up!', sub: `${name} is feeling it` };
    case 'fire': return { text: `${name} is on fire!`, sub: 'Every shot is a super shot' };
    case 'doused': return { text: 'Doused!', sub: `${name}’s fire is out` };
    case 'tied': return { text: 'All square!', sub: `${n ?? ''} apiece` };
    case 'game-point': return { text: 'Match point!', sub: 'Next goal could win it' };
    case 'rally10': return { text: '10 shots and counting!', sub: 'Nobody will let one in' };
    case 'win': return { text: 'Champions!', sub: 'High fives all around' };
  }
  return { text: '', sub: '' };
}

/** Everyone gets an award at the end, winners and runners-up alike. */
export function awardsFor(players: Array<{ stats: object }>): Award[] {
  const kinds: Array<{ title: string; score: (s: PlayerStats) => number; line: (s: PlayerStats) => string }> = [
    { title: 'Golden Boot', score: (s) => s.goals * 2.5, line: (s) => `${s.goals} goal${s.goals === 1 ? '' : 's'}` },
    { title: 'Brick Wall', score: (s) => s.saves * 2.2, line: (s) => `${s.saves} save${s.saves === 1 ? '' : 's'}` },
    { title: 'Bank Shot', score: (s) => s.banks * 1.8, line: (s) => `${s.banks} off the wall` },
    { title: 'Sky High', score: (s) => s.lobs * 1.6, line: (s) => `${s.lobs} lob${s.lobs === 1 ? '' : 's'}` },
    { title: 'Volley King', score: (s) => s.volleys * 1.9, line: (s) => `${s.volleys} volley${s.volleys === 1 ? '' : 's'}` },
    { title: 'Fire Starter', score: (s) => s.fires * 3, line: (s) => `Caught fire ${s.fires} time${s.fires === 1 ? '' : 's'}` },
    { title: 'Flying Keeper', score: (s) => s.dives * 1.2, line: (s) => `${s.dives} dive${s.dives === 1 ? '' : 's'}` },
    { title: 'Sharpshooter', score: (s) => s.shots * 0.6, line: (s) => `${s.shots} shots` },
    { title: 'Cardio Champ', score: (s) => s.run / 300, line: (s) => `Ran ${Math.round(s.run)} feet` },
  ];
  const stat = (i: number) => players[i].stats as PlayerStats;
  const taken = new Set<string>();
  const order = players.map((_, i) => i).sort((a, b) => stat(b).goals - stat(a).goals || stat(b).hits - stat(a).hits);
  const out: Award[] = [];
  for (const i of order) {
    const s = stat(i);
    const best = kinds.filter((k) => !taken.has(k.title)).sort((a, b) => b.score(s) - a.score(s))[0] ?? kinds[kinds.length - 1];
    taken.add(best.title);
    out.push({ player: i, title: best.title, line: best.line(s) });
  }
  return out.sort((a, b) => a.player - b.player);
}

function pose(state: GameState, i: number): FigurePose {
  const p = state.players[i];
  if (p.down > 0) return { action: 'dive', phase: 0.4 + (1 - p.down / DOWN_DIVE) * 0.6, air: 0, chef: false };
  if (p.act === 'dive' && p.swingT >= 0) return { action: 'dive', phase: Math.min(0.4, (p.swingT / DIVE_TICKS) * 0.4), air: 0, chef: false };
  if (p.act === 'kick' && p.swingT >= 0) return { action: 'kick', phase: Math.min(1, 0.32 + (p.swingT / KICK_TICKS) * 0.68), air: 0, chef: false };
  // holding the ball: the kicking leg drawn back, ready
  if (state.owner === i) return { action: 'kick', phase: 0.1, air: 0, chef: false };
  return { action: 'none', phase: 0, air: 0, chef: false };
}

const HOW_TITLE: Record<How, string> = { goal: 'Goal', bank: 'Off the wall', lob: 'Lob', volley: 'Volley', super: 'Super shot', own: 'Own goal', rocket: 'Rocket' };

export const SOCCER: Sport<GameState> = {
  id: 'soccer',
  name: 'Soccer',
  tagline: 'Your box · Their goal · Off the walls',
  loading: 'Lining the pitch…',
  path: '/soccer',
  court: {
    sport: 'soccer', halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH, netHeight: GOAL_H, postX: GOAL_HALF, kitchen: 0,
    goal: { half: GOAL_HALF, h: GOAL_H, depth: GOAL_DEPTH, boxHalf: ZONE_HALF, boxDepth: ZONE_DEPTH, centerR: CENTER_R },
  },
  prop: 'none',
  ball: 'soccer',
  ballRadius: BALL_R * 1.3,
  dt: DT,
  botNames: ['Rocket', 'Nutmeg', 'Wall', 'Pepper', 'Dash', 'Keeper', 'Boots', 'Volley'],
  gesture(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 16) return { shot: { act: 'pass', ax: 0, az: 0 }, word: 'Drive' };
    if (dy > len * 0.55) {
      const ax = Math.max(-1, Math.min(1, (dx / len) * 1.7));
      if (len < 55) return { shot: { act: 'jump', ax, az: 1 }, word: 'Lob' };
      const hard = len > 150;
      return { shot: { act: 'jump', ax, az: hard ? -1 : 0 }, word: hard ? 'Rocket' : ax > 0.4 ? 'Shoot right' : ax < -0.4 ? 'Shoot left' : 'Shoot' };
    }
    if (dy < -len * 0.55) return { shot: { act: 'dive', ax: dx / len, az: dy / len }, word: dx > len * 0.45 ? 'Dive right' : dx < -len * 0.45 ? 'Dive left' : 'Dive' };
    return { shot: { act: 'pass', ax: Math.sign(dx), az: 0 }, word: dx > 0 ? 'Bank right' : 'Bank left' };
  },
  pad: { tap: 'Kick', up: 'Shoot', flick: 'Lob', down: 'Dive', side: 'Bank', serve: 'Kick off' },
  action: 'Kick',
  hint: 'Stay in your box. Press to kick at their goal (left/right aims). Kick early and you strike it first time',
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
      if (!own(i) && age < 0.3) coastPlayer(p);
      if (p.swingT >= 0) p.swingT += 1;
      if (p.down > 0) p.down -= 1;
    });
    if (v.owner >= 0) {
      const o = v.players[v.owner];
      v.ball.x = o.x;
      v.ball.z = o.z - sgn(o.team) * 1.6;
    } else if (age < 1.5) {
      stepBall(v.ball);
    }
  },
  swingTicks: KICK_TICKS,

  pose,
  ready(state, seats) {
    if (state.phase === 'serve') return seats.includes(state.server);
    if (state.phase !== 'rally') return false;
    if (seats.includes(state.owner)) return true;
    // coming my way, or loose within a stride
    const team = state.players[seats[0]]?.team ?? 0;
    const b = state.ball;
    if (state.owner === -1 && b.vz * sgn(team) > 3) return true;
    return state.owner === -1 && seats.some((k) => Math.hypot(b.x - state.players[k].x, b.z - state.players[k].z) < KICK_R * 2);
  },
  landing(state) {
    const b = state.ball;
    if (state.owner >= 0 || b.y < 2) return null;
    return landing(b);
  },
  serveTarget: () => null,
  warnZone: () => null,

  callText,
  callRank: ['win', 'hattrick', 'super', 'rocket', 'bank', 'lob', 'volley', 'goal', 'own', 'fire', 'save', 'bar', 'tied', 'game-point', 'rally10', 'doused', 'warm', 'start'],
  callCheer: { win: 1, hattrick: 1, super: 1, rocket: 0.95, bank: 0.95, lob: 0.9, volley: 0.95, goal: 0.85, own: 0.6, fire: 0.9, save: 0.85, bar: 0.6, tied: 0.8, 'game-point': 0.7, rally10: 0.75, doused: 0.5 },
  slowmo: ['super'],
  faultText: () => '',
  pointTitle(point, teamName) {
    const how = (point as PointResult).how;
    return `${HOW_TITLE[how] ?? 'Goal'} · ${point.scorer !== null ? teamName(point.scorer) : ''}`;
  },
  serveHint: (_s, serverName, shared) => `${shared ? `${serverName}, kick off` : 'Your kickoff'}: tap to kick, or drag to aim a shot, lob or bank`,
  awards: awardsFor,
  zeroStats: ZERO,
};

