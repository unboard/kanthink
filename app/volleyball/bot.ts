// Volleyball: bots. A pure function of the game state that returns the same PlayerInput
// a keyboard would, so bots play through the exact same rules. Deterministic: their
// "personality" comes from hashing the seed and rally counters, never Math.random.
//
// On offense the mate nearest the ball passes, the other sets, and the passer comes in to
// hit. On defense one blocks at the net across from the hitter and the other reads deep.
// A bot always leaves a ball to a human teammate who's close to it, and sets its partner
// by default, so the fun spikes belong to people.

import type { BotOptions, BotTier } from '../pickleball/bot';
import {
  BUMP_HEIGHT, BUMP_SWEET, DIVE_RANGE, HALF_LENGTH, HALF_WIDTH, REACH, SERVE_IDEAL, SET_HEIGHT, SET_SWEET, SPIKE_SWEET,
  ballAt, landing, partnerOf, sgn, timeToHeight, type GameState, type PlayerInput,
} from './sim';

export type { BotOptions, BotTier };

const TIER = {
  // whiff: never swings at this ball; jitter: timing slop in ticks; idle: share of the
  // time its feet don't move; react: ticks before it reads an attack; block: share of
  // rallies it blocks; jump: share of serves that are jump serves; leave: share of out
  // balls it lets drop
  chill: { whiff: 0.1, jitter: 11, idle: 0.24, react: 30, block: 0.12, jump: 0, leave: 0.5 },
  club: { whiff: 0.05, jitter: 9, idle: 0.08, react: 18, block: 0.5, jump: 0.35, leave: 0.85 },
  champ: { whiff: 0.015, jitter: 4, idle: 0, react: 9, block: 0.8, jump: 0.7, leave: 1 },
} as const;

function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

function toward(d: number, dead: number): number {
  return d > dead ? 1 : d < -dead ? -1 : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const NONE: PlayerInput = { mx: 0, mz: 0, swing: false };

export function botInput(state: GameState, i: number, opts: BotOptions = {}): PlayerInput {
  const tier = TIER[opts.tier ?? 'club'];
  const p = state.players[i];
  const team = p.team;
  const s = sgn(team);
  const b = state.ball;
  const doubles = state.format === 'doubles';
  const mate = doubles ? partnerOf(state, i) : -1;
  const key = hash(state.seed, state.pointSeq, state.hits, i);
  const mxPick = (key * 7) % 1 < 0.36 ? -1 : (key * 7) % 1 > 0.64 ? 1 : 0;
  const jit = Math.round((hash(state.seed, state.pointSeq, state.hits, i, 3) - 0.5) * 2 * tier.jitter);

  if (state.phase === 'serve') {
    if (state.server !== i) return NONE;
    const mzServe = key < 0.2 ? -1 : key > 0.9 ? 1 : 0;
    if (state.toss < 0) {
      const wait = 64 + Math.floor(hash(state.seed, state.pointSeq, 99) * 50);
      return { mx: 0, mz: 0, swing: state.phaseTicks === wait };
    }
    const jumper = hash(state.seed, state.pointSeq, 77) < tier.jump;
    const swing = jumper && b.vy < 0 && b.y <= SERVE_IDEAL + jit * 0.08 && b.y > 8.4;
    return { mx: mxPick, mz: mzServe, swing };
  }
  if (state.phase !== 'rally' || p.down > 0) return NONE;

  // mid-action: hold the aim for the contact
  if (p.swingT >= 0 && !p.swingHit && p.act !== 'block') {
    if (p.act === 'spike') {
      let mx = mxPick;
      if (opts.tier === 'champ') {
        // hit away from the block
        const blocker = state.players.find((o) => o.team !== team && Math.abs(o.z) < 4.5 && Math.abs(o.x - b.x) < 5);
        if (blocker) mx = (blocker.x - p.x) * s > 0 ? -1 : 1;
      }
      const mz = key < 0.1 ? 1 : key > 0.72 ? -1 : 0;
      return { mx, mz, swing: false };
    }
    if (state.touches >= 2) return { mx: mxPick, mz: 0, swing: false };
    return NONE;
  }
  if (p.swingT >= 0) return NONE;

  const reach = REACH * state.traits[i].reach;
  const onMine = b.z * s > 0;
  const land = landing(b);
  const fromOpp = state.lastHitter >= 0 && state.players[state.lastHitter].team !== team;
  const coming = onMine || (b.vz * s > 0 && land.z * s > 0);
  let tx = p.x;
  let tz = p.z;
  let swing = false;
  let dead = 0.35;

  const go = () => {
    let mx = toward((tx - p.x) * s, dead);
    let mz = toward(-(tz - p.z) * s, dead);
    if (tier.idle > 0 && hash(state.seed, Math.floor(state.tick / 9), i, 5) < tier.idle) { mx = 0; mz = 0; }
    return { mx, mz, swing };
  };

  if (coming && !(onMine && state.touches >= 3)) {
    const n = onMine ? state.touches : 0;
    const legal = (j: number) => !(onMine && doubles && state.lastHitter === j && state.lastTouch !== 'block');
    // reading an attack takes a moment
    if (n === 0 && fromOpp && state.tick - state.hitTick < tier.react && (state.lastTouch === 'spike' || state.lastTouch === 'tip')) return NONE;

    const tDig = timeToHeight(b, 3.6);
    const digAt = tDig >= 0 ? ballAt(b, tDig) : land;
    let mine = true;
    if (doubles) {
      if (!legal(i)) mine = false;
      else if (!legal(mate)) mine = true;
      else {
        const m = state.players[mate];
        const dMe = Math.hypot(digAt.x - p.x, digAt.z - p.z);
        const dMate = Math.hypot(digAt.x - m.x, digAt.z - m.z);
        const humanMate = opts.humans?.includes(mate) ?? false;
        mine = humanMate ? dMate > 7.5 && dMe + 2 < dMate : dMe < dMate || (dMe === dMate && i < mate);
      }
    }

    if (mine) {
      // now and then it misreads an attack and never swings
      const whiff = n === 0 && fromOpp && hash(state.seed, state.pointSeq, state.hits, i, 11) < tier.whiff;
      if (n === 0 && fromOpp && land.z * s > 0) {
        const out = Math.abs(land.x) > HALF_WIDTH + 0.9 || Math.abs(land.z) > HALF_LENGTH + 0.9;
        if (out && hash(state.seed, state.pointSeq, state.hits, i, 13) < tier.leave) return NONE; // let it go out
      }
      if (n === 2) {
        // the attack: get under the set and jump so the hand meets it near the top
        const tHit = timeToHeight(b, 11.5);
        if (tHit >= 0) {
          const hit = ballAt(b, tHit);
          tx = hit.x;
          tz = s * Math.max(1.3, hit.z * s + 0.8);
          dead = 0.25;
          const near = Math.hypot(tx - p.x, tz - p.z) <= 2.6;
          if (!whiff && near && hit.z * s > -0.3 && tHit * 120 <= SPIKE_SWEET + Math.round(jit * 2.5)) swing = true;
          return go();
        }
      }
      // a ground touch: pass, set, or send it over
      const thr = n === 1 ? SET_HEIGHT : BUMP_HEIGHT;
      const tThr = timeToHeight(b, thr);
      const at = tThr >= 0 ? ballAt(b, tThr) : land;
      const stand = n === 1 ? at : digAt;
      tx = stand.x;
      tz = s * Math.max(1.2, stand.z * s);
      dead = 0.25;
      if (!whiff) {
        const d = Math.hypot(at.x - p.x, at.z - p.z);
        const sweet = n === 1 ? SET_SWEET : BUMP_SWEET;
        if (tThr >= 0 && d <= reach * 0.95 && tThr * 120 <= Math.max(2, sweet + jit) && b.vy <= 3) swing = true;
        // getting away: dive for it
        const dLand = Math.hypot(land.x - p.x, land.z - p.z);
        if (!swing && d > reach + 1.5 && dLand > reach + 1 && dLand <= DIVE_RANGE * state.traits[i].reach && land.t < 0.36 && land.z * s > 0) swing = true;
      }
      return go();
    }

    // not my ball
    if (n === 0) {
      // I'll set: wait where the pass is going
      tx = clamp(p.x * 0.6, -9, 9);
      tz = s * 3.8;
    } else if (n === 1) {
      // I'll hit: come in behind the net
      tx = clamp(p.x, -9, 9);
      tz = s * 5;
    } else {
      tx = p.x;
      tz = s * 11;
    }
    dead = 0.5;
    return go();
  }

  // defense
  let attackX = b.x;
  if (!onMine && state.lastTouch === 'set') {
    const t = timeToHeight(b, 11);
    if (t >= 0) attackX = ballAt(b, t).x;
  }
  const blocks = hash(state.seed, state.pointSeq, team, 31) < tier.block;
  let blocker = false;
  if (doubles) {
    const m = state.players[mate];
    const humanMate = opts.humans?.includes(mate) ?? false;
    blocker = humanMate ? Math.abs(m.z) > Math.abs(p.z) + 2 : Math.abs(p.z) < Math.abs(m.z) || (Math.abs(p.z) === Math.abs(m.z) && i < mate);
  } else {
    blocker = opts.tier === 'champ' && state.touches >= 2 && hash(state.seed, state.pointSeq, state.crossings, 41) < 0.4;
  }
  if (blocker && blocks && !onMine && state.hits >= 1 && state.lastTouch !== 'serve') {
    tx = clamp(attackX, -11.5, 11.5);
    tz = s * 1.7;
    dead = 0.3;
    const hitter = state.players.find((o) => o.team !== team && o.act === 'spike' && o.swingT >= 0);
    if (hitter && hitter.swingT >= 12 + Math.max(0, jit) && hitter.swingT < 44 && Math.abs(p.z) <= 4.5 && Math.abs(hitter.x - p.x) < 3.2) swing = true;
  } else if (doubles) {
    tx = clamp(attackX * 0.45, -8, 8);
    tz = s * 15;
    dead = 0.6;
  } else {
    tx = clamp(b.x * 0.4, -8, 8);
    tz = s * 13;
    dead = 0.6;
  }
  return go();
}
