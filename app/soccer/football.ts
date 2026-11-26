// Soccer as a Sport: the rules in sim.ts and the bots in bot.ts, wrapped in what the shared
// game loop, renderer, menus and HUD ask of any court sport (app/pickleball/sport.ts).
// (Named football.ts so it can't clash with Soccer.tsx on a case-insensitive disk.)

import type { Award, FigurePose, Sport } from '../pickleball/sport';
import { botInput } from './bot';
import {
  BALL_R, BOX_DEPTH, BOX_HALF, CENTER_R, DOWN_SLIDE, DT, GOAL_DEPTH, GOAL_H, GOAL_HALF, HALF_LENGTH, HALF_WIDTH, KEEPER_DIVE_TICKS, KICK_R,
  KICK_TICKS, SLIDE_TICKS,
  cloneState, coastPlayer, createGame, landing, movePlayer, rematch, scoreCall, sgn, step, stepBall,
  type GameState, type How, type Player, type PlayerStats, type PointResult,
} from './sim';

const ZERO: PlayerStats = { goals: 0, shots: 0, onTarget: 0, saves: 0, steals: 0, tackles: 0, passes: 0, oneTimers: 0, curlers: 0, supers: 0, run: 0, fires: 0, hits: 0 };

function callText(kind: string, name: string, n?: number): { text: string; sub: string } {
  switch (kind) {
    case 'start': return { text: 'Kickoff!', sub: 'First to five wins' };
    case 'goal': return { text: 'GOOOAL!', sub: `${name} finds the net` };
    case 'corner': return { text: 'Top bins!', sub: `${name} picked the corner` };
    case 'curl': return { text: 'What a curler!', sub: `${name} bent it in` };
    case 'chip': return { text: 'Chipped him!', sub: `${name} over the keeper` };
    case 'onetimer': return { text: 'First time!', sub: `${name} didn’t even stop it` };
    case 'bank': return { text: 'Off the wall!', sub: `${name} banked it in` };
    case 'super': return { text: 'SUPER SHOT!', sub: `${name} is on fire` };
    case 'own': return { text: 'Own goal!', sub: 'Wrong net, unlucky' };
    case 'save': return { text: 'Great save!', sub: 'Find the corner' };
    case 'catch': return { text: 'Keeper’s ball', sub: 'Right at him' };
    case 'bar': return { text: 'Off the post!', sub: `${name}, so close` };
    case 'tackle': return { text: 'Big tackle!', sub: `${name} wins it back` };
    case 'hattrick': return { text: 'Hat trick!', sub: `Three for ${name}` };
    case 'warm': return { text: 'Heating up!', sub: `Get ${name} the ball` };
    case 'fire': return { text: `${name} is on fire!`, sub: 'Every shot is a super shot' };
    case 'doused': return { text: 'Doused!', sub: `${name}’s fire is out` };
    case 'tied': return { text: 'All square!', sub: `${n ?? ''} apiece` };
    case 'game-point': return { text: 'Match point!', sub: 'Next goal could win it' };
    case 'win': return { text: 'Champions!', sub: 'High fives all around' };
  }
  return { text: '', sub: '' };
}

export function awardsFor(players: Array<{ stats: object }>): Award[] {
  const kinds: Array<{ title: string; score: (s: PlayerStats) => number; line: (s: PlayerStats) => string }> = [
    { title: 'Golden Boot', score: (s) => s.goals * 2.5, line: (s) => `${s.goals} goal${s.goals === 1 ? '' : 's'}` },
    { title: 'Banana Kick', score: (s) => s.curlers * 1.6, line: (s) => `${s.curlers} curler${s.curlers === 1 ? '' : 's'}` },
    { title: 'First Touch', score: (s) => s.oneTimers * 1.8, line: (s) => `${s.oneTimers} first-time shot${s.oneTimers === 1 ? '' : 's'}` },
    { title: 'Fire Starter', score: (s) => s.fires * 3, line: (s) => `Caught fire ${s.fires} time${s.fires === 1 ? '' : 's'}` },
    { title: 'Ball Hawk', score: (s) => (s.steals + s.tackles) * 1.1, line: (s) => `Won it back ${s.steals + s.tackles} times` },
    { title: 'Playmaker', score: (s) => s.passes * 0.9, line: (s) => `${s.passes} passes` },
    { title: 'Sharpshooter', score: (s) => s.shots * 0.6, line: (s) => `${s.shots} shots` },
    { title: 'Cardio Champ', score: (s) => s.run / 400, line: (s) => `Ran ${Math.round(s.run)} feet` },
    { title: 'Workhorse', score: (s) => s.hits / 8, line: (s) => `${s.hits} touches` },
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
  if (p.keeper) {
    if (p.down > 0) return { action: 'dive', phase: 0.45 + (1 - Math.min(1, p.down / 50)) * 0.55, air: 0, chef: false };
    if (p.act === 'dive' && p.swingT >= 0) return { action: 'dive', phase: Math.min(0.42, (p.swingT / KEEPER_DIVE_TICKS) * 0.42), air: 0, chef: false };
    if (state.owner === i) return { action: 'set', phase: 0.3, air: 0, chef: false };
    if (p.act === 'kick' && p.swingT >= 0) return { action: 'kick', phase: Math.min(1, 0.3 + (p.swingT / KICK_TICKS) * 0.7), air: 0, chef: false };
    return { action: 'block', phase: 0.15, air: 0, chef: false };
  }
  if (p.down > 0) return { action: 'slide', phase: 0.45 + (1 - p.down / DOWN_SLIDE) * 0.55, air: 0, chef: false };
  if (p.act === 'slide' && p.swingT >= 0) return { action: 'slide', phase: Math.min(0.45, (p.swingT / SLIDE_TICKS) * 0.45), air: 0, chef: false };
  if (p.act === 'kick' && p.swingT >= 0) return { action: 'kick', phase: Math.min(1, 0.32 + (p.swingT / KICK_TICKS) * 0.68), air: 0, chef: false };
  return { action: 'none', phase: 0, air: 0, chef: false };
}

const HOW_TITLE: Record<How, string> = { goal: 'Goal', corner: 'Top corner', curl: 'Curler', chip: 'Chip', onetimer: 'First time', bank: 'Off the wall', super: 'Super shot', own: 'Own goal' };

export const SOCCER: Sport<GameState> = {
  id: 'soccer',
  name: 'Soccer',
  tagline: 'Beat the keeper · Corners, curlers, chips',
  loading: 'Lining the pitch…',
  path: '/soccer',
  court: {
    sport: 'soccer', halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH, netHeight: GOAL_H, postX: GOAL_HALF, kitchen: 0,
    goal: { half: GOAL_HALF, h: GOAL_H, depth: GOAL_DEPTH, boxHalf: BOX_HALF, boxDepth: BOX_DEPTH, centerR: CENTER_R },
  },
  prop: 'none',
  ball: 'soccer',
  ballRadius: BALL_R * 1.25,
  dt: DT,
  botNames: ['Rocket', 'Nutmeg', 'Wall', 'Pepper', 'Dash', 'Boots', 'Volley', 'Curler'],
  // Swipes describe the finish. Up and tilted places it; long goes top corner; a short
  // flick chips; sideways curls round the keeper; a tap is low and hard (or a pass, with
  // a teammate and no aim).
  gesture(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 16) return { shot: { act: 'pass', ax: 0, az: 0 }, word: 'Low shot' };
    if (dy > len * 0.55) {
      const ax = Math.max(-1, Math.min(1, (dx / len) * 1.8));
      const side = ax > 0.35 ? ' right' : ax < -0.35 ? ' left' : '';
      if (len < 55) return { shot: { act: 'jump', ax, az: 1 }, word: 'Chip' };
      if (len > 140) return { shot: { act: 'jump', ax, az: -1 }, word: side ? `Top${side}` : 'Top shelf' };
      return { shot: { act: 'jump', ax, az: 0 }, word: side ? `Corner${side}` : 'Shoot' };
    }
    if (dy < -len * 0.55) return { shot: { act: 'dive', ax: dx / len, az: dy / len }, word: 'Tackle' };
    return { shot: { act: 'pass', ax: Math.sign(dx), az: 0 }, word: dx > 0 ? 'Curl right' : 'Curl left' };
  },
  pad: { tap: 'Shoot', up: 'Corner', flick: 'Chip', down: 'Tackle', side: 'Curl', serve: 'Kick off' },
  action: 'Shoot',
  hint: 'Run into the ball to dribble. Press to shoot (left/right picks the corner); without the ball, press to slide tackle. Beat the keeper',
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
      v.ball.x = o.x + o.fx * 1.6;
      v.ball.z = o.z + o.fz * 1.6;
    } else if (age < 1.5) {
      stepBall(v.ball);
    }
  },
  swingTicks: KICK_TICKS,

  pose,
  facing(state, i) {
    const p = state.players[i];
    if (p.keeper) {
      // keepers face the ball
      const dx = state.ball.x - p.x;
      const dz = state.ball.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return dz * sgn(p.team) < 0 ? { x: dx / d, z: dz / d } : { x: 0, z: -sgn(p.team) };
    }
    return { x: p.fx, z: p.fz };
  },
  ready(state, seats) {
    if (state.phase === 'serve') return seats.includes(state.server);
    if (state.phase !== 'rally') return false;
    if (seats.includes(state.owner)) return true;
    const b = state.ball;
    return state.owner === -1 && seats.some((k) => Math.hypot(b.x - state.players[k].x, b.z - state.players[k].z) < KICK_R * 2.2);
  },
  landing(state) {
    const b = state.ball;
    if (state.owner >= 0 || b.y < 2) return null;
    return landing(b);
  },
  serveTarget: () => null,
  warnZone: () => null,

  callText,
  callRank: ['win', 'hattrick', 'super', 'curl', 'chip', 'corner', 'onetimer', 'bank', 'goal', 'own', 'fire', 'save', 'bar', 'tied', 'game-point', 'tackle', 'doused', 'catch', 'warm', 'start'],
  callCheer: { win: 1, hattrick: 1, super: 1, curl: 1, chip: 1, corner: 0.95, onetimer: 0.95, bank: 0.95, goal: 0.85, own: 0.6, fire: 0.9, save: 0.75, bar: 0.65, tied: 0.8, 'game-point': 0.7, tackle: 0.45, doused: 0.5 },
  slowmo: ['super'],
  faultText: () => '',
  pointTitle(point, teamName) {
    const how = (point as PointResult).how;
    return `${HOW_TITLE[how] ?? 'Goal'} · ${point.scorer !== null ? teamName(point.scorer) : ''}`;
  },
  serveHint: (_s, serverName, shared) => `${shared ? `${serverName}, kick off` : 'Your kickoff'}: run into the ball`,
  awards: awardsFor,
  zeroStats: ZERO,
};

