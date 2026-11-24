// Pickleball as a Sport: the rules in sim.ts and the bots in bot.ts, wrapped in what the
// shared game loop, renderer, menus and HUD ask of any court sport (see sport.ts).

import { botInput } from './bot';
import { BOT_NAMES } from './characters';
import {
  BALL_R, DT, FAULT_TEXT, HALF_LENGTH, HALF_WIDTH, KITCHEN, NET_HEIGHT, POST_X, SWING_TOTAL,
  cloneState, createGame, movePlayer, other, rematch, scoreCall, serveCourtSign, sgn, step, stepBall, timeToGround,
  type CallKind, type FaultReason, type GameState, type Player, type PlayerStats,
} from './sim';
import type { Award, Sport } from './sport';

const ZERO: PlayerStats = { hits: 0, dinks: 0, lobs: 0, winners: 0, run: 0, fires: 0, bestStreak: 0, kitchen: 0 };

/** The announcer: the Neon design pass's lines, with names. */
function callText(kind: string, name: string, n?: number): { text: string; sub: string } {
  switch (kind as CallKind) {
    case 'start': return { text: 'Paddles up!', sub: 'Let’s pickle' };
    case 'side-out': return { text: 'New server!', sub: `${name} has the ball` };
    case 'ace': return { text: 'Untouchable!', sub: `${name}, right past them` };
    case 'kitchen': return { text: 'Whoa! Toes in the kitchen!', sub: `${name} gets the chef hat` };
    case 'two-bounce': return { text: 'Hold your horses!', sub: 'Let it bounce' };
    case 'dink': return { text: 'Silky soft!', sub: `${name}, right in the pocket` };
    case 'lob': return { text: 'Sky high!', sub: `${name} says look up` };
    case 'smash': return { text: 'Boom!', sub: `${name}, straight to the floor` };
    case 'rally10': return { text: `${n ?? 10} shots!`, sub: 'Nobody is blinking' };
    case 'rally20': return { text: `${n ?? 20} shots!`, sub: 'Legendary rally' };
    case 'warm': return { text: 'Heating up!', sub: `Watch ${name}’s paddle` };
    case 'fire': return { text: `${name} is on fire!`, sub: 'Call the fire truck' };
    case 'cooled': return { text: 'Ice cold defense!', sub: `${name} is out of flames` };
    case 'doused': return { text: 'Doused!', sub: `${name}’s fire is out` };
    case 'combo': return { text: 'Team combo!', sub: 'Teamwork magic' };
    case 'streak': return { text: `${name} ×${n ?? 3}`, sub: 'Can’t miss right now' };
    case 'tied': return { text: 'All tied up!', sub: 'We got a game' };
    case 'game-point': return { text: 'Game point!', sub: 'One more for glory' };
    case 'overtime': return { text: 'Overtime!', sub: 'Gotta win by two' };
    case 'win': return { text: 'Champs of the court!', sub: 'High fives all around' };
  }
  return { text: '', sub: '' };
}

/** Everyone gets an award at the end, winners and runners-up alike. */
export function awardsFor(players: Array<{ stats: object }>): Award[] {
  const kinds: Array<{ title: string; score: (s: PlayerStats) => number; line: (s: PlayerStats) => string }> = [
    { title: 'Fire Starter', score: (s) => s.fires * 3, line: (s) => `Caught fire ${s.fires} time${s.fires === 1 ? '' : 's'}` },
    { title: 'Closer', score: (s) => s.winners * 1.2, line: (s) => `${s.winners} winners` },
    { title: 'Streak Machine', score: (s) => (s.bestStreak >= 3 ? s.bestStreak * 2 : 0), line: (s) => `${s.bestStreak} in a row` },
    { title: 'Dink Chef', score: (s) => s.dinks * 1.1, line: (s) => `${s.dinks} soft dinks` },
    { title: 'Sky Watcher', score: (s) => s.lobs * 1.3, line: (s) => `${s.lobs} lobs` },
    { title: 'Cardio Champ', score: (s) => s.run / 250, line: (s) => `Ran ${Math.round(s.run)} feet` },
    { title: 'Workhorse', score: (s) => s.hits / 6, line: (s) => `${s.hits} shots` },
    { title: 'Kitchen Regular', score: (s) => s.kitchen * 2.5, line: (s) => `${s.kitchen} chef hat${s.kitchen === 1 ? '' : 's'}` },
  ];
  const stat = (i: number) => players[i].stats as PlayerStats;
  const taken = new Set<string>();
  const order = players.map((_, i) => i).sort((a, b) => stat(b).hits - stat(a).hits);
  const out: Award[] = [];
  for (const i of order) {
    const s = stat(i);
    const best = kinds.filter((k) => !taken.has(k.title)).sort((a, b) => b.score(s) - a.score(s))[0] ?? kinds[6];
    taken.add(best.title);
    out.push({ player: i, title: best.title, line: best.line(s) });
  }
  return out.sort((a, b) => a.player - b.player);
}

export const PICKLEBALL: Sport<GameState> = {
  id: 'pickleball',
  name: 'Pickleball',
  tagline: 'Doubles · Singles · Hot streaks',
  loading: 'Setting up the court…',
  path: '/pickleball',
  court: { sport: 'pickleball', halfWidth: HALF_WIDTH, halfLength: HALF_LENGTH, netHeight: NET_HEIGHT - 0.07, postX: POST_X, kitchen: KITCHEN },
  prop: 'paddle',
  ball: 'pickle',
  ballRadius: BALL_R * 2.4, // drawn a little larger than life so it reads on screen
  dt: DT,
  botNames: BOT_NAMES,
  action: 'Swing',
  hint: 'While swinging: left/right aims, up dinks, down lobs',
  teamNames: ['Coral team', 'Teal team'],

  createGame: (seed, opts) => createGame(seed, opts),
  step,
  rematch,
  cloneState,
  scoreCall,
  botInput: (s, i, opts) => botInput(s, i, opts),
  moveOwn(v, seat, own, input) {
    const p = own as Player;
    movePlayer(p, input, v.phase, v.server === seat, serveCourtSign(v, p.team), v.traits[seat]?.speed ?? 1);
  },
  coast(v, age, own) {
    if (age < 0.3) {
      v.players.forEach((o, i) => {
        if (own(i)) return;
        o.x += o.vx * DT;
        o.z += o.vz * DT;
        if (o.swingT >= 0 && o.swingT < SWING_TOTAL) o.swingT += 1;
      });
    }
    if (v.phase === 'serve') {
      const sp = v.players[v.server];
      const s = sgn(sp.team);
      v.ball = { ...v.ball, x: sp.x + s * 1.1, y: 1.6, z: sp.z - s * 0.9, vx: 0, vy: 0, vz: 0 };
    } else if (age < 1.5) {
      stepBall(v.ball);
    }
  },
  swingTicks: SWING_TOTAL,

  pose(state, i) {
    const p = state.players[i];
    return { action: p.swingT >= 0 ? 'swing' : 'none', phase: p.swingT >= 0 ? p.swingT / SWING_TOTAL : 0, air: 0, chef: p.chefUntil > state.tick };
  },
  landing(state) {
    const b = state.ball;
    if (b.y <= BALL_R + 0.05 && b.vy <= 0) return null;
    const t = timeToGround(b);
    return { x: b.x + b.vx * t, z: b.z + b.vz * t, t };
  },
  serveTarget(state) {
    // the diagonal court past the kitchen line
    const rcv = other(state.servingTeam);
    return {
      x: serveCourtSign(state, rcv) * HALF_WIDTH / 2, z: sgn(rcv) * (KITCHEN + (HALF_LENGTH - KITCHEN) / 2),
      w: HALF_WIDTH, d: HALF_LENGTH - KITCHEN,
    };
  },
  warnZone(state, focus) {
    const i = focus.find((f) => state.players[f] && Math.abs(state.players[f].z) <= KITCHEN);
    return i === undefined ? null : state.players[i].team;
  },

  callText,
  callRank: ['win', 'fire', 'doused', 'cooled', 'tied', 'overtime', 'game-point', 'kitchen', 'ace', 'smash', 'combo', 'streak', 'rally20', 'rally10', 'dink', 'lob', 'two-bounce', 'warm', 'side-out', 'start'],
  callCheer: { win: 1, fire: 0.9, ace: 0.7, smash: 0.8, rally20: 1, rally10: 0.7, combo: 0.6, tied: 0.8, 'game-point': 0.7, overtime: 0.9, doused: 0.6, cooled: 0.6, kitchen: 0.4, streak: 0.6 },
  slowmo: [],
  faultText: (reason) => FAULT_TEXT[reason as FaultReason] ?? '',
  pointTitle: (point, teamName) => (point.scorer !== null ? `Point ${teamName(point.scorer)}` : point.sideOut ? 'Side out' : 'Second server'),
  serveHint: (_s, serverName, shared) => `${shared ? `${serverName}, serve` : 'Your serve'}: aim for the lit court, past the kitchen line`,
  awards: awardsFor,
  zeroStats: ZERO,
};
