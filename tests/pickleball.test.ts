import { describe, expect, it } from 'vitest';
import {
  BALL_R, IDLE, KITCHEN, SERVE_READY, SWING_SWEET, awardRally, createGame, isGameOver,
  serveCourtSign, serveFromRight, setupServe, step, type GameState, type PlayerInput, type Side,
} from '@/app/pickleball/sim';
import { botInput } from '@/app/pickleball/bot';
import { isRoomCode, makeRoomCode, normalizeRoomCode, channelForRoom, ROOM_ALPHABET } from '@/app/pickleball/room';

function runBots(seed: number, steps: number): GameState {
  let s = createGame(seed);
  for (let i = 0; i < steps; i++) {
    s = step(s, [botInput(s, 0), botInput(s, 1)]);
  }
  return s;
}

describe('pickleball determinism', () => {
  it('same seed and inputs produce identical state after many steps', () => {
    const a = runBots(1234, 6000);
    const b = runBots(1234, 6000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.hitSeq).toBeGreaterThan(5);
  });

  it('a different seed diverges', () => {
    const a = runBots(1234, 6000);
    const b = runBots(98765, 6000);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('step does not mutate the state it was given', () => {
    const s = createGame(7);
    const before = JSON.stringify(s);
    step(s, [{ mx: 1, mz: 1, swing: true }, IDLE]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('scripted keyboard inputs replay exactly', () => {
    const script = (i: number): [PlayerInput, PlayerInput] => [
      { mx: (i >> 5) % 3 - 1, mz: (i >> 7) % 3 - 1, swing: i % 50 === 0 },
      { mx: (i >> 6) % 3 - 1, mz: (i >> 4) % 3 - 1, swing: i % 37 === 0 },
    ];
    let a = createGame(42);
    let b = createGame(42);
    for (let i = 0; i < 3000; i++) {
      a = step(a, script(i));
      b = step(b, script(i));
    }
    expect(a).toEqual(b);
  });

  it('bot vs bot plays a complete, valid game', () => {
    let s = createGame(2024);
    let n = 0;
    while (s.phase !== 'over' && n < 400_000) {
      s = step(s, [botInput(s, 0), botInput(s, 1)]);
      n++;
    }
    expect(s.phase).toBe('over');
    const w = s.winner as Side;
    expect(s.scores[w]).toBeGreaterThanOrEqual(11);
    expect(s.scores[w] - s.scores[w === 0 ? 1 : 0]).toBeGreaterThanOrEqual(2);
  });
});

describe('pickleball scoring and serving', () => {
  it('only the serving side scores; a server fault is a side out', () => {
    const s = createGame(1, 0);
    awardRally(s, 1, 'out'); // receiver faults → server scores
    expect(s.scores).toEqual([1, 0]);
    expect(s.server).toBe(0);
    awardRally(s, 0, 'net'); // server faults → side out, no point
    expect(s.scores).toEqual([1, 0]);
    expect(s.server).toBe(1);
    expect(s.lastPoint?.sideOut).toBe(true);
    expect(s.lastPoint?.scorer).toBeNull();
  });

  it('server serves from the right on even scores and the left on odd', () => {
    const s = createGame(1, 0);
    expect(serveFromRight(s)).toBe(true);
    // side 0 faces -z, so its right is +x; it serves diagonally to side 1's right (-x)
    expect(s.players[0].x).toBeGreaterThan(0);
    expect(s.players[1].x).toBeLessThan(0);
    s.scores = [3, 0];
    setupServe(s);
    expect(serveFromRight(s)).toBe(false);
    expect(s.players[0].x).toBeLessThan(0);
    expect(s.players[1].x).toBeGreaterThan(0);
    // side 1 serving on even: its right is -x
    s.server = 1;
    s.scores = [3, 4];
    setupServe(s);
    expect(s.players[1].x).toBeLessThan(0);
    expect(serveCourtSign(s, 0)).toBeGreaterThan(0);
  });

  it('games go to 11 and must be won by 2', () => {
    expect(isGameOver([11, 9])).toBe(0);
    expect(isGameOver([11, 10])).toBe(-1);
    expect(isGameOver([12, 10])).toBe(0);
    expect(isGameOver([10, 12])).toBe(1);
    const s = createGame(1, 0);
    s.scores = [10, 10];
    awardRally(s, 1, 'out');
    expect(s.winner).toBe(-1);
    awardRally(s, 1, 'out');
    expect(s.scores).toEqual([12, 10]);
    expect(s.winner).toBe(0);
  });

  it('the game ends after the point pause when someone wins', () => {
    let s = createGame(1, 0);
    s.scores = [10, 3];
    awardRally(s, 1, 'out');
    for (let i = 0; i < 400; i++) s = step(s, [IDLE, IDLE]);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
  });
});

/** put the ball in flight toward `side` with a player poised to volley it */
function volleySetup(opts: { hits: number; playerZ: number }): GameState {
  const s = createGame(5, 0);
  s.phase = 'rally';
  s.hits = opts.hits;
  s.bounces = 0;
  s.lastHitter = 0;
  s.players[1].x = 0;
  s.players[1].z = opts.playerZ;
  // ball arriving at the player's position in the air, waist high
  s.ball = { x: 0.5, y: 3, z: opts.playerZ + 2.5, vx: 0, vy: 0, vz: -20 };
  return s;
}

function swingAt(state: GameState, side: Side): GameState {
  const inputs: [PlayerInput, PlayerInput] = [IDLE, IDLE];
  inputs[side] = { mx: 0, mz: 0, swing: true };
  let s = step(state, inputs);
  for (let i = 0; i < SWING_SWEET && s.phase === 'rally'; i++) s = step(s, [IDLE, IDLE]);
  return s;
}

describe('pickleball faults', () => {
  it('volleying from inside the kitchen is a fault', () => {
    const s = swingAt(volleySetup({ hits: 3, playerZ: -(KITCHEN - 2) }), 1);
    expect(s.lastPoint?.reason).toBe('kitchen-volley');
    expect(s.lastPoint?.faultBy).toBe(1);
    expect(s.scores).toEqual([1, 0]); // side 0 was serving, so it scores
  });

  it('the same volley from behind the kitchen line is legal', () => {
    const s = swingAt(volleySetup({ hits: 3, playerZ: -(KITCHEN + 3) }), 1);
    expect(s.lastPoint).toBeNull();
    expect(s.lastHitter).toBe(1);
    expect(s.hits).toBe(4);
  });

  it('two-bounce rule: volleying the serve return window is a fault', () => {
    const s = swingAt(volleySetup({ hits: 1, playerZ: -15 }), 1);
    expect(s.lastPoint?.reason).toBe('two-bounce');
    expect(s.lastPoint?.faultBy).toBe(1);
  });

  it('a serve landing in the kitchen is a side out', () => {
    const s = createGame(9, 0);
    s.phase = 'rally';
    s.hits = 1;
    s.lastHitter = 0;
    s.ball = { x: -4, y: BALL_R + 0.01, z: -4, vx: 0, vy: -5, vz: -1 };
    const n = step(s, [IDLE, IDLE]);
    expect(n.lastPoint?.reason).toBe('serve-kitchen');
    expect(n.server).toBe(1);
    expect(n.scores).toEqual([0, 0]);
  });

  it('a serve into the wrong court is a fault, the right court is in', () => {
    const base = createGame(9, 0);
    base.phase = 'rally';
    base.hits = 1;
    base.lastHitter = 0;
    const wrong = { ...base, ball: { x: 4, y: BALL_R + 0.01, z: -15, vx: 0, vy: -5, vz: -1 } };
    expect(step(wrong, [IDLE, IDLE]).lastPoint?.reason).toBe('serve-wrong-court');
    const right = { ...base, ball: { x: -4, y: BALL_R + 0.01, z: -15, vx: 0, vy: -5, vz: -1 } };
    const r = step(right, [IDLE, IDLE]);
    expect(r.lastPoint).toBeNull();
    expect(r.bounces).toBe(1);
  });

  it('out of bounds, double bounce and the net are faults', () => {
    const base = createGame(3, 0);
    base.phase = 'rally';
    base.hits = 4;
    base.lastHitter = 1; // receiver hit it
    const out = { ...base, ball: { x: 12, y: BALL_R + 0.01, z: 10, vx: 0, vy: -5, vz: 1 } };
    const o = step(out, [IDLE, IDLE]);
    expect(o.lastPoint?.reason).toBe('out');
    expect(o.scores).toEqual([1, 0]);

    const dbl = { ...base, bounces: 1, ball: { x: 2, y: BALL_R + 0.01, z: 10, vx: 0, vy: -5, vz: 1 } };
    const d = step(dbl, [IDLE, IDLE]);
    expect(d.lastPoint?.reason).toBe('double-bounce');
    expect(d.lastPoint?.faultBy).toBe(0);
    expect(d.server).toBe(1); // server failed to return → side out

    const net = { ...base, ball: { x: 0, y: 1, z: -0.05, vx: 0, vy: 0, vz: 20 } };
    const nn = step(net, [IDLE, IDLE]);
    expect(nn.lastPoint?.reason).toBe('net');
    expect(nn.lastPoint?.faultBy).toBe(1);
  });

  it('serving early in the point pause is ignored, then the serve goes in play', () => {
    let s = createGame(11, 0);
    s = step(s, [{ mx: 0, mz: 0, swing: true }, IDLE]);
    expect(s.phase).toBe('serve');
    for (let i = 0; i < SERVE_READY; i++) s = step(s, [IDLE, IDLE]);
    s = step(s, [{ mx: 0, mz: 0, swing: true }, IDLE]);
    expect(s.phase).toBe('rally');
    expect(s.hits).toBe(1);
    // let it land: a neutral serve lands in the diagonal court past the kitchen
    for (let i = 0; i < 240 && s.bounces === 0 && s.phase === 'rally'; i++) s = step(s, [IDLE, IDLE]);
    expect(s.lastBounce?.in).toBe(true);
    expect(s.lastBounce!.x).toBeLessThan(0);
    expect(s.lastBounce!.z).toBeLessThan(-KITCHEN);
  });
});

describe('pickleball room codes', () => {
  it('makes short unambiguous codes and validates them', () => {
    let r = 0;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 50; i++) {
      const c = makeRoomCode(rnd);
      expect(isRoomCode(c)).toBe(true);
      for (const ch of c) expect(ROOM_ALPHABET).toContain(ch);
    }
    expect(normalizeRoomCode(' hk-tp ')).toBe('HKTP');
    expect(normalizeRoomCode('HOLA')).toBeNull(); // O and L are ambiguous
    expect(normalizeRoomCode('AB')).toBeNull();
    expect(channelForRoom('HKTP')).toBe('presence-pickleball-HKTP');
  });
});
