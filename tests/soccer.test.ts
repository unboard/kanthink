/**
 * Soccer: arcade, small-sided, with a goalkeeper you have to beat.
 *
 * Third version. The first was a running game with no keeper (too easy); the second kept
 * each side in a box in front of its own goal ("just boring: such a distance, you can't
 * really angle anything"). This one is built around the keeper, like the arcade soccer
 * people love: a shot at the keeper is saved, and scoring is placement and pace, in the
 * corners, curled round it, chipped over it when it comes out, first time before it's set.
 * These pin those, plus the walls, the goals, and that bot games play out and end.
 */
import { describe, it, expect } from 'vitest'
import {
  BALL_R, GAME_TO, GOAL_HALF, HALF_LENGTH, HALF_WIDTH, HZ, IDLE, createGame, keeperOf, step, stepBall,
  type GameState, type PlayerInput, type Shot,
} from '../app/soccer/sim'
import { botInput } from '../app/soccer/bot'
import { SOCCER } from '../app/soccer/football'

const ball = (o: Partial<GameState['ball']>): GameState['ball'] => ({ x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, curl: 0, hot: false, super: false, ...o })
const idle = (s: GameState): PlayerInput[] => s.players.map(() => ({ ...IDLE }))
function run(s: GameState, ticks: number, f?: (s: GameState) => PlayerInput[]) {
  for (let k = 0; k < ticks && s.phase === 'rally'; k++) s = step(s, f ? f(s) : idle(s))
  return s
}

/**
 * Player 0 (team 0, shooting at the goal at -z) on the ball `dist` feet out, the keeper
 * settled, then one shot. Returns whether it went in.
 */
function attempt(seed: number, dist: number, shot: Shot, x0 = 0): 'goal' | 'saved' | 'missed' {
  let s = createGame(seed, { format: 'singles', traits: [], firstTeam: 0 })
  s = { ...s, phase: 'rally' }
  const p = s.players[0]
  p.x = x0; p.z = -HALF_LENGTH + dist; p.fx = 0; p.fz = -1
  s.owner = 0
  s.ball = ball({ x: x0, z: p.z - 1.6 })
  s.players[1].x = 18; s.players[1].z = 30
  for (let k = 0; k < 90; k++) s = step(s, idle(s))
  const k = keeperOf(s, 1)
  const saves = s.players[k].stats.saves
  s = step(s, s.players.map((_, i) => (i === 0 ? { mx: 0, mz: 0, swing: true, shot } : { ...IDLE })))
  s = run(s, 240)
  if (s.scores[0] > 0) return 'goal'
  return s.players[k].stats.saves > saves ? 'saved' : 'missed'
}
const rate = (dist: number, shot: Shot) => {
  let goals = 0
  for (let seed = 1; seed <= 30; seed++) if (attempt(seed, dist, shot, ((seed % 5) - 2) * 4) === 'goal') goals += 1
  return goals / 30
}

describe('the keeper', () => {
  it('saves a shot hit straight at it', () => {
    expect(rate(22, { act: 'jump', ax: 0, az: 0 })).toBeLessThan(0.15)
  })

  it('is beaten in the corners often, but not always', () => {
    const r = rate(22, { act: 'jump', ax: 1, az: 0 })
    expect(r).toBeGreaterThan(0.3)
    expect(r).toBeLessThan(0.85)
  })

  it('closer is easier, further is harder', () => {
    expect(rate(14, { act: 'jump', ax: 1, az: 0 })).toBeGreaterThan(rate(30, { act: 'jump', ax: 1, az: 0 }))
  })

  it('a chip beats a keeper that has come out, but not one on its line', () => {
    expect(rate(14, { act: 'jump', ax: 0, az: 1 })).toBeGreaterThan(0.5)
    expect(rate(30, { act: 'jump', ax: 0, az: 1 })).toBeLessThan(0.2)
  })

  it('a curler bends round it from the edge of the box', () => {
    expect(rate(22, { act: 'pass', ax: 1, az: 0 })).toBeGreaterThan(0.4)
  })

  it('catches what it reaches, then throws it out long', () => {
    let s = createGame(5, { format: 'singles', traits: [], firstTeam: 0 })
    s = { ...s, phase: 'rally', owner: -1 }
    const k = keeperOf(s, 1)
    s.ball = ball({ x: s.players[k].x, y: 2, z: s.players[k].z + 10, vz: -25 })
    s.shooter = 0
    s.lastHitter = 0
    s.hitTick = s.tick - 60
    s = run(s, HZ, )
    expect([k, -1]).toContain(s.owner)
    s = run(s, HZ * 2)
    // it came out of the area
    expect(Math.abs(s.ball.z)).toBeLessThan(HALF_LENGTH - 6)
  })
})

describe('the walls and the goals', () => {
  it('a ball sent at the side boards comes back', () => {
    const b = ball({ x: HALF_WIDTH - 3, vx: 40 })
    let hit = false
    for (let k = 0; k < HZ; k++) hit = stepBall(b).wall || hit
    expect(hit).toBe(true)
    expect(b.vx).toBeLessThan(0)
  })

  it('the end boards beside the goal send it back, the mouth lets it in', () => {
    const wide = ball({ x: GOAL_HALF + 4, z: -HALF_LENGTH + 3, vz: -40 })
    for (let k = 0; k < HZ / 2; k++) stepBall(wide)
    expect(wide.vz).toBeGreaterThan(0)
    const on = ball({ z: -HALF_LENGTH + 3, vz: -40 })
    for (let k = 0; k < HZ / 2; k++) stepBall(on)
    expect(on.z).toBeLessThan(-HALF_LENGTH)
  })

  it('first to five wins', () => {
    let s = createGame(7, { format: 'singles', traits: [], firstTeam: 0 })
    const k = keeperOf(s, 1)
    for (let g = 0; g < GAME_TO; g++) {
      s = { ...s, phase: 'rally', owner: -1 }
      s.players[k].x = 6
      s.ball = ball({ x: -3, z: -HALF_LENGTH + 3, vz: -45 })
      s.lastHitter = 0
      for (let t = 0; t < HZ * 5 && s.phase !== 'serve' && s.phase !== 'over'; t++) s = step(s, idle(s))
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
  })
})

describe('the controls', () => {
  it('running into the ball takes it, and it stays at your feet', () => {
    let s = createGame(3, { format: 'singles', traits: [], firstTeam: 0 })
    s = { ...s, phase: 'rally' }
    s.ball = ball({ z: 6 })
    s.players[0].x = 0; s.players[0].z = 12
    const go = (x: GameState) => x.players.map((_, i) => (i === 0 ? { mx: 0, mz: 1, swing: false } : { ...IDLE }))
    for (let k = 0; k < HZ * 2 && s.owner !== 0; k++) s = step(s, go(s))
    expect(s.owner).toBe(0)
    s = run(s, HZ / 2, go)
    expect(Math.hypot(s.ball.x - s.players[0].x, s.ball.z - s.players[0].z)).toBeLessThan(2.5)
  })

  it('a swipe down slide-tackles the ball off them', () => {
    let s = createGame(3, { format: 'singles', traits: [], firstTeam: 0 })
    s = { ...s, phase: 'rally', owner: 1 }
    s.players[1].x = 0; s.players[1].z = 0; s.players[1].fz = 1
    s.players[0].x = 0; s.players[0].z = 6
    s.ball = ball({ z: 1.6 })
    s = step(s, s.players.map((_, i) => (i === 0 ? { mx: 0, mz: 0, swing: true, shot: { act: 'dive', ax: 0, az: -1 } } : { ...IDLE })))
    for (let k = 0; k < HZ / 2 && s.players[0].stats.tackles === 0; k++) s = step(s, idle(s))
    expect(s.players[0].stats.tackles).toBe(1)
    expect(s.owner).not.toBe(1)
    // and only once, however long it lies there
    s = run(s, HZ * 2)
    expect(s.players[0].stats.tackles).toBe(1)
  })

  it('the shot pad names the finish', () => {
    expect(SOCCER.gesture(0, 0).word).toBe('Low shot')
    expect(SOCCER.gesture(80, 100).word).toBe('Corner right')
    expect(SOCCER.gesture(-90, 160).word).toBe('Top left')
    expect(SOCCER.gesture(0, 30).word).toBe('Chip')
    expect(SOCCER.gesture(120, 0).word).toBe('Curl right')
    expect(SOCCER.gesture(0, -120).word).toBe('Tackle')
  })
})

describe('bots', () => {
  it('bot games play out and finish', () => {
    let finished = 0
    let goals = 0
    for (const format of ['singles', 'doubles'] as const) {
      for (let g = 0; g < 3; g++) {
        let s = createGame(100 + g, { format, traits: [] })
        for (let k = 0; k < HZ * 60 * 8 && s.phase !== 'over'; k++) s = step(s, s.players.map((_, i) => botInput(s, i, { tier: 'club', humans: [] })))
        goals += s.scores[0] + s.scores[1]
        if (s.phase === 'over') finished += 1
      }
    }
    expect(goals).toBeGreaterThan(20)
    expect(finished).toBeGreaterThanOrEqual(5)
  }, 180_000)

  it('the same inputs give the same game', () => {
    const play = () => {
      let s = createGame(42, { format: 'doubles', traits: [] })
      for (let k = 0; k < HZ * 20; k++) s = step(s, s.players.map((_, i) => botInput(s, i, { tier: 'champ', humans: [] })))
      return JSON.stringify([s.scores, s.ball, s.players.map((p) => [p.x, p.z])])
    }
    expect(play()).toBe(play())
  })
})
