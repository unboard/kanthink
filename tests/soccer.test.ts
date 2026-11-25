/**
 * Soccer, played like the other court games.
 *
 * First asked for as "two goals, balls can bounce off walls, and you gotta protect your
 * goal". The first build was a running game over the whole pitch; the correction was
 * "the player is restricted to their side, just that square in front of the goal, and
 * kicks it to the other goal: straight, up in the air, off the wall". These pin that:
 * the boxes, the walls, the goals, the kinds of kick, protecting the goal, and that bot
 * games play out and end.
 */
import { describe, it, expect } from 'vitest'
import {
  BALL_R, GAME_TO, GOAL_HALF, HALF_LENGTH, HALF_WIDTH, HZ, IDLE, ZONE_DEPTH, ZONE_HALF, createGame, inZone, step, stepBall,
  type GameState, type PlayerInput, type Shot,
} from '../app/soccer/sim'
import { botInput } from '../app/soccer/bot'
import { SOCCER } from '../app/soccer/football'

const idle = (s: GameState): PlayerInput[] => s.players.map(() => ({ ...IDLE }))

function runUntil(s: GameState, done: (s: GameState) => boolean, max: number, f?: (s: GameState) => PlayerInput[]): GameState {
  for (let k = 0; k < max && !done(s); k++) s = step(s, f ? f(s) : idle(s))
  return s
}

const only = (i: number, input: PlayerInput) => (s: GameState) => s.players.map((_, k) => (k === i ? input : { ...IDLE }))
const kickWith = (shot?: Shot): PlayerInput => ({ mx: 0, mz: 0, swing: true, ...(shot ? { shot } : {}) })

/** player 0 (team 0, attacking -z) with the ball at their feet, the rally on */
function withBall(format: 'singles' | 'doubles' = 'singles'): GameState {
  let s = createGame(7, { format, traits: [], firstTeam: 0 })
  expect(s.owner).toBe(0)
  return s
}

describe('each side keeps to its box', () => {
  it('running toward the other goal stops at the front of your box', () => {
    let s = createGame(3, { format: 'singles', traits: [], firstTeam: 1 })
    s = runUntil(s, () => false, HZ * 4, only(0, { mx: 0, mz: 1, swing: false }))
    const p = s.players[0]
    expect(inZone(0, p.x, p.z)).toBe(true)
    expect(p.z).toBeCloseTo(HALF_LENGTH - ZONE_DEPTH, 1)
  })

  it('and sideways stops at its edge, well short of the wall', () => {
    let s = createGame(3, { format: 'singles', traits: [], firstTeam: 1 })
    s = runUntil(s, () => false, HZ * 4, only(0, { mx: 1, mz: 0, swing: false }))
    expect(s.players[0].x).toBeCloseTo(ZONE_HALF, 1)
    expect(ZONE_HALF).toBeLessThan(HALF_WIDTH)
  })

  it('a ball left dead in the middle rolls to a side that can play it', () => {
    let s = createGame(3, { format: 'singles', traits: [], firstTeam: 1 })
    s = { ...s, phase: 'rally', owner: -1, lastHitter: 1 }
    s.ball = { x: 2, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, hot: false, super: false }
    s = runUntil(s, (x) => inZone(0, x.ball.x, x.ball.z) || inZone(1, x.ball.x, x.ball.z), HZ * 6)
    // team 1 played it last, so it goes to team 0
    expect(inZone(0, s.ball.x, s.ball.z)).toBe(true)
  })
})

describe('the walls and the goals', () => {
  it('a ball sent at the side boards comes back', () => {
    const b = { x: HALF_WIDTH - 3, y: BALL_R, z: 0, vx: 40, vy: 0, vz: 0, hot: false, super: false }
    let hit = false
    for (let k = 0; k < HZ; k++) hit = stepBall(b).wall || hit
    expect(hit).toBe(true)
    expect(b.vx).toBeLessThan(0)
  })

  it('the end boards beside the goal send it back, the goal mouth lets it in', () => {
    const wide = { x: GOAL_HALF + 4, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -40, hot: false, super: false }
    for (let k = 0; k < HZ / 2; k++) stepBall(wide)
    expect(wide.vz).toBeGreaterThan(0)
    const onTarget = { x: 0, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -40, hot: false, super: false }
    for (let k = 0; k < HZ / 2; k++) stepBall(onTarget)
    expect(onTarget.z).toBeLessThan(-HALF_LENGTH)
  })

  it('an undefended drive from your box scores at the other end, and they kick off next', () => {
    let s = withBall()
    s.players[1].x = 14 // their keeper out of the way
    s = step(s, only(0, kickWith())(s))
    s = runUntil(s, (x) => x.phase !== 'rally', HZ * 4)
    expect(s.scores).toEqual([1, 0])
    s = runUntil(s, (x) => x.phase === 'serve', HZ * 4)
    expect(s.servingTeam).toBe(1)
    expect(s.owner).toBe(s.server)
  })

  it('first to five wins', () => {
    let s = withBall()
    for (let g = 0; g < GAME_TO; g++) {
      s = { ...s, phase: 'rally', owner: -1 }
      s.ball = { x: 0, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -45, hot: false, super: false }
      s.lastHitter = 0
      s = runUntil(s, (x) => x.phase === 'serve' || x.phase === 'over', HZ * 5)
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
  })
})

describe('the kicks', () => {
  const first = (shot?: Shot) => step(withBall(), only(0, kickWith(shot))(withBall()))

  it('a tap drives it low along the ground', () => {
    const s = first({ act: 'pass', ax: 0, az: 0 })
    expect(s.lastKick).toBe('drive')
    expect(s.ball.vz).toBeLessThan(-40)
    expect(s.ball.vy).toBeLessThan(2)
  })

  it('a short flick lobs it high', () => {
    const s = first({ act: 'jump', ax: 0, az: 1 })
    expect(s.lastKick).toBe('lob')
    expect(s.ball.vy).toBeGreaterThan(20)
  })

  it('a sideways swipe banks it off that wall', () => {
    let s = first({ act: 'pass', ax: 1, az: 0 })
    expect(s.lastKick).toBe('bank')
    // team 0's right is +x: it heads for the right wall first
    expect(s.ball.vx).toBeGreaterThan(10)
    s = runUntil(s, (x) => x.wallHits > 0 || x.phase !== 'rally', HZ * 3)
    expect(s.wallHits).toBeGreaterThan(0)
  })

  it('a kick swiped before the ball arrives strikes it first time', () => {
    let s = withBall()
    s = { ...s, phase: 'rally', owner: -1 }
    const p = s.players[0]
    s.ball = { x: p.x, y: BALL_R, z: p.z - 12, vx: 0, vy: 0, vz: 20, hot: false, super: false }
    s.lastHitter = 1
    s = step(s, only(0, kickWith({ act: 'jump', ax: 0, az: 0 }))(s))
    expect(s.players[0].qShot).not.toBeNull()
    s = runUntil(s, (x) => x.lastHitter === 0, HZ)
    expect(s.lastHitter).toBe(0)
    expect(s.ball.vz).toBeLessThan(-30)
  })

  it('the shot pad reads swipes as soccer kicks', () => {
    expect(SOCCER.gesture(0, 0).word).toBe('Drive')
    expect(SOCCER.gesture(0, 120).word).toBe('Shoot')
    expect(SOCCER.gesture(0, 30).word).toBe('Lob')
    expect(SOCCER.gesture(120, 0).word).toBe('Bank right')
    expect(SOCCER.gesture(0, -120).word).toBe('Dive')
  })
})

describe('protecting your goal', () => {
  it('a hard shot that hits you bounces off: a save', () => {
    let s = withBall()
    s = { ...s, phase: 'rally', owner: -1 }
    const keeper = s.players[1]
    keeper.x = 0
    keeper.z = -HALF_LENGTH + 4
    s.ball = { x: 0, y: 1.5, z: -HALF_LENGTH + 18, vx: 0, vy: 0, vz: -60, hot: false, super: false }
    s.lastHitter = 0
    s.shooter = 0
    s.hitTick = s.tick - 60
    s = runUntil(s, (x) => x.ball.vz > 0 || x.phase !== 'rally', HZ)
    expect(s.scores).toEqual([0, 0])
    expect(s.players[1].stats.saves).toBe(1)
  })

  it('a dive reaches a shot you could not have run to', () => {
    let s = withBall()
    s = { ...s, phase: 'rally', owner: -1 }
    const keeper = s.players[1]
    keeper.x = 0
    keeper.z = -HALF_LENGTH + 4
    // headed for the far post, past where the keeper stands
    s.ball = { x: 4.5, y: 1.2, z: -HALF_LENGTH + 18, vx: 0, vy: 0, vz: -50, hot: false, super: false }
    s.lastHitter = 0
    s.shooter = 0
    s.hitTick = s.tick - 60
    s = step(s, only(1, kickWith({ act: 'dive', ax: 0, az: -1 }))(s))
    expect(s.players[1].act).toBe('dive')
    s = runUntil(s, (x) => x.ball.vz > 0 || x.phase !== 'rally', HZ)
    expect(s.scores).toEqual([0, 0])
  })
})

describe('bots', () => {
  it('bot games play like soccer and finish', () => {
    let finished = 0
    let goals = 0
    for (const format of ['singles', 'doubles'] as const) {
      for (let g = 0; g < 3; g++) {
        let s = createGame(100 + g, { format, traits: [] })
        for (let k = 0; k < HZ * 60 * 8 && s.phase !== 'over'; k++) {
          s = step(s, s.players.map((_, i) => botInput(s, i, { tier: 'club', humans: [] })))
        }
        goals += s.scores[0] + s.scores[1]
        if (s.phase === 'over') finished += 1
      }
    }
    expect(goals).toBeGreaterThan(20)
    expect(finished).toBeGreaterThanOrEqual(5)
  }, 120_000)

  it('the same inputs give the same game', () => {
    const play = () => {
      let s = createGame(42, { format: 'doubles', traits: [] })
      for (let k = 0; k < HZ * 20; k++) s = step(s, s.players.map((_, i) => botInput(s, i, { tier: 'champ', humans: [] })))
      return JSON.stringify([s.scores, s.ball, s.players.map((p) => [p.x, p.z])])
    }
    expect(play()).toBe(play())
  })
})
