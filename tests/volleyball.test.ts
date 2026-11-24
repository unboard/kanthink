import { describe, expect, it } from 'vitest';
import {
  BALL_R, GAME_TO, HALF_WIDTH, HZ, IDLE, NET_HEIGHT, SERVE_READY,
  awardRally, ballAt, cloneState, createGame, holdBall, isGameOver, landing, rematch, scoreCall, step, stepBall, teamPlayers, timeToHeight,
  type Ball, type GameState, type PlayerInput, type Touch,
} from '@/app/volleyball/sim';
import { botInput } from '@/app/volleyball/bot';
import { STYLE_TRAITS } from '@/app/pickleball/sim';

const PRESS: PlayerInput = { mx: 0, mz: 0, swing: true };

function idle(state: GameState): PlayerInput[] {
  return state.players.map(() => IDLE);
}

function run(state: GameState, ticks: number, inputs?: (s: GameState) => PlayerInput[]): GameState {
  let s = state;
  for (let k = 0; k < ticks; k++) s = step(s, inputs ? inputs(s) : idle(s));
  return s;
}

function runUntil(state: GameState, done: (s: GameState) => boolean, cap = HZ * 30): GameState {
  let s = state;
  for (let k = 0; k < cap && !done(s); k++) s = step(s, idle(s));
  return s;
}

function bots(s: GameState): PlayerInput[] {
  return s.players.map((_, i) => botInput(s, i, { tier: 'club' }));
}

/** a rally in progress with the ball where the test wants it */
function rally(format: 'singles' | 'doubles', ball: Partial<Ball>, o: { touches?: number; lastHitter?: number; lastTouch?: Touch; seed?: number } = {}): GameState {
  const s = createGame(o.seed ?? 7, { format });
  s.phase = 'rally';
  s.phaseTicks = 100;
  s.toss = -1;
  s.hits = 3;
  s.touches = o.touches ?? 0;
  s.lastHitter = o.lastHitter ?? (format === 'doubles' ? 2 : 1);
  s.lastTouch = o.lastTouch ?? 'over';
  s.attacker = s.lastHitter;
  s.attackKind = s.lastTouch;
  s.ball = { x: 0, y: 6, z: 10, vx: 0, vy: 0, vz: 0, hot: false, super: false, ...ball };
  return s;
}

function pressOnce(state: GameState, who: number, input: Partial<PlayerInput> = {}): GameState {
  return step(state, state.players.map((_, i) => (i === who ? { ...PRESS, ...input } : IDLE)));
}

describe('volleyball sim', () => {
  it('is deterministic and never mutates the state it is given', () => {
    const play = () => run(createGame(4242, { format: 'doubles' }), 4000, bots);
    expect(play()).toEqual(play());
    const s = run(createGame(9, { format: 'doubles' }), 700, bots);
    const before = JSON.stringify(s);
    step(s, bots(s));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('starts with the ball in the server’s hand and ignores a press that comes too soon', () => {
    let s = createGame(1, { format: 'doubles' });
    expect(s.phase).toBe('serve');
    expect(s.server).toBe(0);
    expect(scoreCall(s)).toBe('0–0');
    s = pressOnce(s, 0);
    expect(s.toss).toBe(-1);
    s = run(s, 10);
    expect(Math.abs(s.ball.x - s.players[0].x)).toBeLessThan(1.5);
    expect(s.ball.y).toBeCloseTo(4.2);
  });

  it('a toss with no second press becomes a float serve that lands in', () => {
    let s = run(createGame(1, { format: 'doubles' }), SERVE_READY);
    s = pressOnce(s, 0);
    expect(s.toss).toBeGreaterThanOrEqual(0);
    s = runUntil(s, (x) => x.phase === 'rally');
    expect(s.lastTouch).toBe('serve');
    expect(s.players[0].act).toBe('serve');
    expect(s.hits).toBe(1);
    s = runUntil(s, (x) => x.phase === 'point');
    // nobody moved: it drops in for an ace
    expect(s.lastPoint).toMatchObject({ scorer: 0, how: 'ace', reason: 'floor', sideOut: false });
    expect(s.lastBounce?.in).toBe(true);
    expect(s.scores).toEqual([1, 0]);
    expect(s.players[0].stats.aces).toBe(1);
  });

  it('a second press near the top of the toss is a faster jump serve', () => {
    const tossed = pressOnce(run(createGame(1, { format: 'doubles' }), SERVE_READY), 0);
    const float = runUntil(tossed, (x) => x.phase === 'rally');
    let s = runUntil(tossed, (x) => x.ball.vy < 0 && x.ball.y <= 10.3);
    s = pressOnce(s, 0);
    expect(s.phase).toBe('rally');
    expect(s.players[0].vy).toBeGreaterThan(0);
    expect(Math.abs(s.ball.vz)).toBeGreaterThan(Math.abs(float.ball.vz) * 1.2);
    s = runUntil(s, (x) => x.phase === 'point');
    expect(s.lastBounce?.in).toBe(true);
    expect(s.scores).toEqual([1, 0]);
  });

  it('bump, set, spike: three touches and over', () => {
    // a ball dropping onto player 0, who passes it
    let s = rally('doubles', { x: -6, y: 5.6, z: 17, vy: -6 });
    s.players[0].x = -6;
    s.players[0].z = 17;
    s = pressOnce(s, 0);
    expect(s.players[0].act).toBe('bump');
    s = runUntil(s, (x) => x.hitSeq > 0, 60);
    expect(s.lastTouch).toBe('bump');
    expect(s.touches).toBe(1);
    expect(s.passQuality).toBeGreaterThan(0.5);
    expect(s.ball.vy).toBeGreaterThan(10);
    // it comes down to setting height near the net, on their own side
    const spot = ballAt(s.ball, timeToHeight(s.ball, 7.6));
    expect(spot.z).toBeGreaterThan(1);
    expect(spot.z).toBeLessThan(7);
  });

  it('allows no fourth touch', () => {
    let s = rally('doubles', { x: 0, y: 5.6, z: 10, vy: -6 }, { touches: 3, lastHitter: 1, lastTouch: 'bump' });
    s.players[0].x = 0;
    s.players[0].z = 10;
    s = pressOnce(s, 0);
    const hits = s.hitSeq;
    s = runUntil(s, (x) => x.phase === 'point');
    expect(s.hitSeq).toBe(hits);
    expect(s.lastPoint).toMatchObject({ faultTeam: 0, scorer: 1 });
  });

  it('doubles: the same player cannot touch twice in a row; singles: they can', () => {
    for (const format of ['doubles', 'singles'] as const) {
      let s = rally(format, { x: 0, y: 9, z: 10, vy: -6 }, { touches: 1, lastHitter: 0, lastTouch: 'bump' });
      s.players[0].x = 0;
      s.players[0].z = 10;
      s = pressOnce(s, 0);
      const before = s.hitSeq;
      const act = s.players[0].act;
      s = run(s, 40);
      if (format === 'doubles') {
        // not their ball: the press is only a hop
        expect(act).toBe('block');
        expect(s.hitSeq).toBe(before);
      } else {
        expect(act).toBe('set');
        expect(s.hitSeq).toBe(before + 1);
        expect(s.lastTouch).toBe('set');
        expect(s.touches).toBe(2);
        expect(s.setQuality).toBeGreaterThan(0.5);
      }
    }
  });

  it('a ball on the line is in; past it, the last team to touch it loses the rally', () => {
    const drop = (x: number) => runUntil(rally('doubles', { x, y: 1, z: 12, vy: -5 }, { lastHitter: 2, lastTouch: 'spike' }), (s) => s.phase === 'point');
    const on = drop(HALF_WIDTH + 0.1);
    expect(on.lastBounce?.in).toBe(true);
    expect(on.lastPoint).toMatchObject({ faultTeam: 0, scorer: 1, how: 'kill', shotBy: 2, reason: 'floor' });
    expect(on.players[2].stats.kills).toBe(1);
    const wide = drop(HALF_WIDTH + 1);
    expect(wide.lastBounce?.in).toBe(false);
    expect(wide.lastPoint).toMatchObject({ faultTeam: 1, scorer: 0, how: 'error', faultBy: 2, reason: 'out' });
  });

  it('the net is a wall below the tape and open above it', () => {
    const low: Ball = { x: 0, y: 5, z: 0.2, vx: 0, vy: 0, vz: -30, hot: false, super: false };
    expect(stepBall(low)).toBe('net');
    expect(low.z).toBeGreaterThan(0);
    expect(Math.abs(low.vz)).toBeLessThan(3);
    const high: Ball = { x: 0, y: NET_HEIGHT + 1.5, z: 0.2, vx: 0, vy: 0, vz: -30, hot: false, super: false };
    expect(stepBall(high)).toBe(null);
    expect(high.z).toBeLessThan(0);
    // a spike into the net is the hitter's error
    const s = runUntil(rally('doubles', { x: 0, y: 6, z: 2, vz: -30 }, { touches: 3, lastHitter: 0, lastTouch: 'spike' }), (x) => x.phase === 'point');
    expect(s.lastPoint).toMatchObject({ faultTeam: 0, faultBy: 0, how: 'error', reason: 'net' });
  });

  it('rally scoring: every rally scores, the winner serves, and servers alternate', () => {
    const s = createGame(3, { format: 'doubles' });
    awardRally(s, 1, 'floor', -1, 'kill', 0);
    expect(s.scores).toEqual([1, 0]);
    expect(s.server).toBe(0);
    expect(s.lastPoint?.sideOut).toBe(false);
    awardRally(s, 0, 'floor', -1, 'kill', 2);
    expect(s.scores).toEqual([1, 1]);
    expect(s.servingTeam).toBe(1);
    expect(s.server).toBe(2);
    expect(s.lastPoint?.sideOut).toBe(true);
    awardRally(s, 1, 'floor', -1, 'kill', 0);
    expect(s.server).toBe(1); // team 0's other player this time
    awardRally(s, 0, 'floor', -1, 'kill', 2);
    expect(s.server).toBe(3);
    expect(teamPlayers(s, 1)).toEqual([2, 3]);
  });

  it('games go to 15 and must be won by two', () => {
    expect(isGameOver([GAME_TO, GAME_TO - 1])).toBe(-1);
    expect(isGameOver([GAME_TO + 1, GAME_TO - 1])).toBe(0);
    expect(isGameOver([GAME_TO - 2, GAME_TO])).toBe(1);
    const s = createGame(3, { format: 'doubles' });
    s.scores = [14, 14];
    awardRally(s, 1, 'floor', -1, 'kill', 0);
    expect(s.winner).toBe(-1);
    awardRally(s, 1, 'floor', -1, 'kill', 0);
    expect(s.winner).toBe(0);
    expect(s.calls.some((c) => c.kind === 'win')).toBe(true);
    const over = run(s, 200);
    expect(over.phase).toBe('over');
  });

  it('a block either stuffs the ball back or pops it up for the blockers', () => {
    let stuffs = 0;
    let soft = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // player 0 has just spiked; player 2 is up at the net with hands over it
      let s = rally('doubles', { x: 0, y: 9.6, z: 0.3, vx: 0, vy: -8, vz: -55 }, { touches: 3, lastHitter: 0, lastTouch: 'spike', seed });
      const blocker = s.players[2];
      Object.assign(blocker, { x: 0, z: -1.5, y: 2.6, vy: 1, act: 'block', swingT: 30, swingHit: false });
      s = step(s, idle(s));
      expect(s.blockSeq).toBe(1);
      expect(s.lastTouch).toBe('block');
      expect(s.players[2].stats.blocks).toBe(1);
      if (s.ball.vz > 0 && s.ball.vy < 0) {
        stuffs += 1;
        s = runUntil(s, (x) => x.phase === 'point');
        expect(s.lastPoint).toMatchObject({ scorer: 1, how: 'roof', shotBy: 2 });
        expect(s.calls.some((c) => c.kind === 'roof')).toBe(true);
      } else if (s.ball.vy > 0 && s.ball.z < 0 && Math.abs(s.ball.vx) < 10) {
        soft += 1;
        expect(s.touches).toBe(0);
      }
    }
    expect(stuffs).toBeGreaterThan(5);
    expect(soft).toBeGreaterThan(2);
  });

  /** player 0 in the air with the set arriving at their hand */
  function atTheTop(o: { fire?: number; setQuality?: number; mz?: number }): GameState {
    const s = rally('doubles', { x: 0, y: 11, z: 2.8, vy: -3 }, { touches: 2, lastHitter: 1, lastTouch: 'set' });
    Object.assign(s.players[0], { x: 0, z: 3.6, y: 3, vy: 0.5, act: 'spike', swingT: 39, swingHit: false, fire: o.fire ?? 0 });
    s.setQuality = o.setQuality ?? 0.5;
    return step(s, s.players.map((_, i) => (i === 0 ? { mx: 0, mz: o.mz ?? 0, swing: false } : IDLE)));
  }

  it('a spike goes down hard over the net; holding toward the net tips it', () => {
    const s = atTheTop({});
    expect(s.lastTouch).toBe('spike');
    expect(s.ball.super).toBe(false);
    expect(s.ball.vz).toBeLessThan(-40);
    const down = landing(s.ball);
    expect(down.z).toBeLessThan(-8);
    const tip = atTheTop({ mz: 1 });
    expect(tip.lastTouch).toBe('tip');
    expect(Math.abs(tip.ball.vz)).toBeLessThan(20);
    expect(landing(tip.ball).z).toBeGreaterThan(-10);
    expect(landing(tip.ball).z).toBeLessThan(-2);
  });

  it('super spike: on fire, or a perfect swing on a great set', () => {
    const fire = atTheTop({ fire: 100 });
    expect(fire.ball.super).toBe(true);
    expect(fire.ball.hot).toBe(true);
    expect(fire.superSeq).toBe(1);
    expect(fire.calls.some((c) => c.kind === 'super')).toBe(true);
    expect(fire.players[0].stats.supers).toBe(1);
    const chain = atTheTop({ setQuality: 0.95 });
    expect(chain.ball.super).toBe(true);
    expect(Math.abs(chain.ball.vz)).toBeGreaterThan(Math.abs(atTheTop({}).ball.vz) * 1.2);
    // and it shakes the floor when nobody gets there
    const landed = runUntil(chain, (x) => x.phase === 'point');
    expect(landed.calls.some((c) => c.kind === 'boom')).toBe(true);
    expect(landed.lastPoint).toMatchObject({ how: 'kill', shotBy: 0, scorer: 0 });
  });

  it('a ball getting away is a dive, and a dive that reaches it is a pancake', () => {
    let s = rally('doubles', { x: 5.5, y: 2.2, z: 15, vy: -6 }, { lastHitter: 2, lastTouch: 'spike' });
    Object.assign(s.players[0], { x: 0, z: 15 });
    s = pressOnce(s, 0);
    expect(s.players[0].act).toBe('dive');
    s = runUntil(s, (x) => x.hitSeq > 0 || x.phase === 'point', 80);
    expect(s.lastTouch).toBe('dive');
    expect(s.calls.some((c) => c.kind === 'pancake')).toBe(true);
    expect(s.players[0].stats.dives).toBe(1);
    expect(s.ball.vy).toBeGreaterThan(5);
    // and they stay down for a moment afterwards
    s = run(s, 45);
    expect(s.players[0].down).toBeGreaterThan(0);
  });

  it('heat builds to fire, and losing a rally on fire douses it', () => {
    const s = createGame(5, { format: 'doubles' });
    s.players[0].heat = 95;
    awardRally(s, 1, 'floor', -1, 'kill', 0);
    expect(s.players[0].fire).toBe(100);
    expect(s.players[0].stats.fires).toBe(1);
    expect(s.calls.some((c) => c.kind === 'fire')).toBe(true);
    // the loser's own error costs more than just losing
    s.players[2].heat = 60;
    s.players[3].heat = 60;
    awardRally(s, 1, 'out', 2, 'error', -1);
    expect(s.players[2].heat).toBe(30);
    expect(s.players[3].heat).toBe(42);
    awardRally(s, 0, 'floor', -1, 'kill', 2);
    expect(s.players[0].fire).toBe(0);
    expect(s.players[0].heat).toBe(0);
    expect(s.calls.some((c) => c.kind === 'doused')).toBe(true);
  });

  it('a rematch keeps the people and gives the loser the first serve', () => {
    const traits = [STYLE_TRAITS.pro, STYLE_TRAITS.turbo, STYLE_TRAITS.arcade, STYLE_TRAITS.pro];
    const s = createGame(5, { format: 'doubles', traits });
    s.scores = [15, 9];
    s.winner = 0;
    const next = rematch(s, 77);
    expect(next.scores).toEqual([0, 0]);
    expect(next.servingTeam).toBe(1);
    expect(next.server).toBe(2);
    expect(next.traits).toEqual(traits);
    expect(next.seed).toBe(77);
    expect(cloneState(next)).toEqual(next);
  });

  it('holdBall only moves the ball before the toss', () => {
    const s = createGame(5, { format: 'singles' });
    s.players[0].x = -3;
    holdBall(s);
    expect(s.ball.x).toBeCloseTo(-3.7);
    s.toss = 5;
    s.players[0].x = 3;
    holdBall(s);
    expect(s.ball.x).toBeCloseTo(-3.7);
    expect(s.ball.y).toBeGreaterThan(BALL_R);
  });
});

describe('volleyball bots', () => {
  it('twenty bot games of doubles play like volleyball and finish', () => {
    const games = 20;
    const wins = [0, 0];
    let ticks = 0;
    let points = 0;
    let crossings = 0;
    let withSpike = 0;
    const sum = { kills: 0, blocks: 0, aces: 0, supers: 0, dives: 0 };
    for (let g = 0; g < games; g++) {
      let s = createGame(1000 + g * 7919, { format: 'doubles' });
      let seen = 0;
      let spiked = false;
      for (let k = 0; k < HZ * 60 * 12 && s.phase !== 'over'; k++) {
        s = step(s, bots(s));
        if (s.phase === 'rally' && (s.lastTouch === 'spike' || s.lastTouch === 'tip')) spiked = true;
        if (s.pointSeq !== seen) {
          seen = s.pointSeq;
          points += 1;
          crossings += s.lastPoint!.rally;
          if (spiked) withSpike += 1;
          spiked = false;
        }
      }
      expect(s.phase).toBe('over');
      wins[s.winner as number] += 1;
      ticks += s.tick;
      for (const p of s.players) {
        sum.kills += p.stats.kills;
        sum.blocks += p.stats.blocks;
        sum.aces += p.stats.aces;
        sum.supers += p.stats.supers;
        sum.dives += p.stats.dives;
      }
    }
    const per = (n: number) => Math.round((n / games) * 10) / 10;
    console.log('[volleyball soak]', {
      secondsPerGame: Math.round(ticks / HZ / games), pointsPerGame: per(points), crossingsPerRally: Math.round((crossings / points) * 100) / 100,
      ralliesWithAnAttack: Math.round((withSpike / points) * 100) / 100, kills: per(sum.kills), blocks: per(sum.blocks), aces: per(sum.aces),
      acePct: Math.round((sum.aces / points) * 1000) / 1000, supers: per(sum.supers), dives: per(sum.dives), wins,
    });
    expect(wins[0]).toBeGreaterThan(0);
    expect(wins[1]).toBeGreaterThan(0);
    expect(withSpike / points).toBeGreaterThan(0.6);
    expect(sum.aces / points).toBeLessThan(0.14);
    expect(ticks / HZ / games).toBeGreaterThan(150);
    expect(ticks / HZ / games).toBeLessThan(420);
    expect(sum.blocks / games).toBeGreaterThan(2);
  }, 120_000);

  it('a bot leaves a ball to a human teammate standing under it', () => {
    let s = rally('doubles', { x: 4, y: 12, z: 14, vy: -2 }, { lastHitter: 2, lastTouch: 'over' });
    Object.assign(s.players[0], { x: 4, z: 14 });
    Object.assign(s.players[1], { x: 0, z: 13 });
    // player 0 is a person who does nothing; the bot next to them must not take it
    for (let k = 0; k < 200 && s.phase === 'rally'; k++) {
      s = step(s, s.players.map((_, i) => (i === 0 ? IDLE : botInput(s, i, { tier: 'champ', humans: [0] }))));
    }
    expect(s.phase).toBe('point');
    expect(s.lastPoint).toMatchObject({ faultTeam: 0 });
    expect(s.players[1].stats.hits).toBe(0);
  });

  it('singles bots finish a game too', () => {
    let s = createGame(31337, { format: 'singles' });
    for (let k = 0; k < HZ * 60 * 12 && s.phase !== 'over'; k++) s = step(s, s.players.map((_, i) => botInput(s, i, { tier: i ? 'champ' : 'chill' })));
    expect(s.phase).toBe('over');
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(GAME_TO);
  }, 60_000);
});

describe('right-thumb shots', () => {
  const shot = (act: 'pass' | 'jump' | 'dive', ax = 0, az = 0): Partial<PlayerInput> => ({ shot: { act, ax, az } });

  it('a tap early is a pass that waits for the ball and plays it', () => {
    let s = rally('doubles', { x: -6, y: 14, z: 17, vy: 0 });
    s.players[0].x = -6;
    s.players[0].z = 17;
    s = pressOnce(s, 0, shot('pass'));
    expect(s.players[0].qAct).toBe('pass');
    s = runUntil(s, (x) => x.hitSeq > 0, HZ * 2);
    expect(s.lastTouch).toBe('bump');
    expect(s.passQuality).toBeGreaterThan(0.7);
  });

  it('a swipe up on a set ball: the approach is taken for you and the spike goes over hard', () => {
    // a set coming down near the net; the hitter is a few steps off and only swipes
    let s = rally('doubles', { x: 3, y: 9, z: 6, vx: 0, vy: 14, vz: -1.2 }, { touches: 2, lastHitter: 1, lastTouch: 'set' });
    s.players[0].x = 0;
    s.players[0].z = 7.5;
    s.setQuality = 0.95;
    s = pressOnce(s, 0, shot('jump', 0.8, 0));
    expect(s.players[0].qAct).toBe('jump');
    s = runUntil(s, (x) => x.lastTouch === 'spike' || x.phase !== 'rally', HZ * 3);
    expect(s.lastTouch).toBe('spike');
    expect(s.lastHitter).toBe(0);
    expect(s.ball.vz).toBeLessThan(-20);
    // aimed right: toward the player's right (team 0 faces -z, so +x)
    expect(landing(s.ball).x).toBeGreaterThan(2);
  });

  it('committing early is a better read than committing late', () => {
    const go = (wait: number) => {
      let s = rally('doubles', { x: 0, y: 9, z: 6, vy: 14, vz: -1.2 }, { touches: 2, lastHitter: 1, lastTouch: 'set' });
      s.players[0].x = 0;
      s.players[0].z = 7;
      s.setQuality = 0.95;
      s = run(s, wait);
      s = pressOnce(s, 0, shot('jump'));
      s = runUntil(s, (x) => x.lastTouch === 'spike' || x.phase !== 'rally', HZ * 3);
      return { touch: s.lastTouch, speed: Math.hypot(s.ball.vx, s.ball.vz) };
    };
    const early = go(0);
    const late = go(70);
    expect(early.touch).toBe('spike');
    expect(late.touch).toBe('spike');
    expect(early.speed).toBeGreaterThan(late.speed);
  });

  it('a swipe down dives the way you swiped', () => {
    let s = rally('doubles', { x: 0, y: 6, z: 14, vy: -2 });
    s.players[0].x = 0;
    s.players[0].z = 17;
    s = pressOnce(s, 0, shot('dive', 1, 0));
    expect(s.players[0].act).toBe('dive');
    expect(s.players[0].vx).toBeGreaterThan(10);
  });

  it('a short flick up is a tip over the block', () => {
    let s = rally('doubles', { x: 0, y: 9, z: 6, vy: 14, vz: -1.2 }, { touches: 2, lastHitter: 1, lastTouch: 'set' });
    s.players[0].x = 0;
    s.players[0].z = 7;
    s = pressOnce(s, 0, shot('jump', 0, 1));
    s = runUntil(s, (x) => x.lastTouch === 'tip' || x.phase !== 'rally', HZ * 3);
    expect(s.lastTouch).toBe('tip');
    expect(Math.abs(landing(s.ball).z)).toBeLessThan(10);
  });
});
