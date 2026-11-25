/**
 * Soccer: two goals, a walled pitch, and you protect your own goal.
 *
 * Asked for as "a soccer version: two goals, balls can bounce off walls, and you gotta
 * protect your goal and so does the other player for theirs". These pin those three
 * things, plus the controls (dribble by running into it, shoot, tackle) and that bot
 * games play out and end.
 */
import { describe, it, expect } from 'vitest'
import {
  BALL_R, GAME_TO, GOAL_HALF, HALF_LENGTH, HALF_WIDTH, HZ, IDLE, createGame, step, stepBall,
  type GameState, type PlayerInput,
} from '../app/soccer/sim'
import { botInput } from '../app/soccer/bot'
import { SOCCER } from '../app/soccer/football'

const idle = (s: GameState): PlayerInput[] => s.players.map(() => ({ ...IDLE }))

function run(s: GameState, ticks: number, f?: (s: GameState) => PlayerInput[]): GameState {
  for (let k = 0; k < ticks; k++) s = step(s, f ? f(s) : idle(s))
  return s
}

function runUntil(s: GameState, done: (s: GameState) => boolean, max: number, f?: (s: GameState) => PlayerInput[]): GameState {
  for (let k = 0; k < max && !done(s); k++) s = step(s, f ? f(s) : idle(s))
  return s
}

/** a live game with the ball loose at a spot, nobody near it */
function live(format: 'singles' | 'doubles' = 'singles'): GameState {
  let s = createGame(7, { format, traits: [] })
  s = { ...s, phase: 'rally', phaseTicks: 0 }
  s.players.forEach((p, i) => { p.x = -20 + i * 3; p.z = (p.team === 0 ? 1 : -1) * 30 })
  return s
}

describe('the walls', () => {
  it('a ball sent at the side boards comes back', () => {
    const b = { x: HALF_WIDTH - 3, y: BALL_R, z: 0, vx: 40, vy: 0, vz: 0, hot: false, super: false }
    let hit = false
    for (let k = 0; k < HZ; k++) hit = stepBall(b).wall || hit
    expect(hit).toBe(true)
    expect(b.vx).toBeLessThan(0)
    expect(Math.abs(b.x)).toBeLessThan(HALF_WIDTH)
  })

  it('the end boards beside the goal send it back, but the goal mouth lets it in', () => {
    const wide = { x: GOAL_HALF + 4, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -40, hot: false, super: false }
    for (let k = 0; k < HZ / 2; k++) stepBall(wide)
    expect(wide.vz).toBeGreaterThan(0)
    const onTarget = { x: 0, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -40, hot: false, super: false }
    for (let k = 0; k < HZ / 2; k++) stepBall(onTarget)
    expect(onTarget.z).toBeLessThan(-HALF_LENGTH)
  })
})

describe('two goals', () => {
  it('a ball into the far goal is a goal for the team attacking it, and kicks off again', () => {
    let s = live()
    s.ball = { x: 0, y: BALL_R, z: -HALF_LENGTH + 4, vx: 0, vy: 0, vz: -45, hot: false, super: false }
    s.lastHitter = 0
    s = runUntil(s, (x) => x.phase !== 'rally', HZ)
    expect(s.scores).toEqual([1, 0])
    expect(s.lastPoint?.shotBy).toBe(0)
    expect(s.calls.some((c) => c.kind === 'goal')).toBe(true)
    s = runUntil(s, (x) => x.phase === 'serve', HZ * 4)
    expect(s.phase).toBe('serve')
    // the team that conceded kicks off, from the middle
    expect(s.servingTeam).toBe(1)
    expect(s.ball.x).toBe(0)
    expect(s.ball.z).toBe(0)
  })

  it('a goal off the boards is called a bank shot', () => {
    let s = live()
    // struck at the side board, angled back toward the goal
    s.ball = { x: 10, y: BALL_R, z: -HALF_LENGTH + 14, vx: 40, vy: 0, vz: -26, hot: false, super: false }
    s.lastHitter = 0
    s.shooter = 0
    s = runUntil(s, (x) => x.phase !== 'rally', HZ * 3)
    if (s.phase === 'point') {
      expect(s.lastPoint?.how).toBe('bank')
    } else {
      // the angle missed the mouth: it still came back off the boards and stayed in play
      expect(s.wallHits).toBeGreaterThan(0)
    }
  })

  it('first to five wins', () => {
    let s = live()
    for (let g = 0; g < GAME_TO; g++) {
      s = { ...s, phase: 'rally', phaseTicks: 0 }
      s.ball = { x: 0, y: BALL_R, z: -HALF_LENGTH + 3, vx: 0, vy: 0, vz: -45, hot: false, super: false }
      s.lastHitter = 0
      s = runUntil(s, (x) => x.phase === 'serve' || x.phase === 'over', HZ * 5)
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
  })
})

describe('protecting your goal', () => {
  it('a hard shot that hits a player in front of their goal bounces off: a save', () => {
    let s = live()
    const keeper = s.players[1] // team 1 defends the goal at -z
    keeper.x = 0
    keeper.z = -HALF_LENGTH + 4
    s.ball = { x: 0, y: 1.5, z: -HALF_LENGTH + 16, vx: 0, vy: 0, vz: -60, hot: false, super: false }
    s.lastHitter = 0
    s.shooter = 0
    s.hitTick = s.tick - 60
    s = runUntil(s, (x) => x.ball.vz > 0 || x.phase !== 'rally', HZ)
    expect(s.phase).toBe('rally')
    expect(s.scores).toEqual([0, 0])
    expect(s.players[1].stats.saves).toBe(1)
    expect(s.calls.some((c) => c.kind === 'save')).toBe(true)
  })
})

describe('the controls', () => {
  it('running into a loose ball takes it, and it stays at your feet as you run', () => {
    let s = live()
    s.ball = { x: 0, y: BALL_R, z: 10, vx: 0, vy: 0, vz: 0, hot: false, super: false }
    s.players[0].x = 0
    s.players[0].z = 16
    // up: toward the goal team 0 attacks (-z)
    const go = (x: GameState) => x.players.map((_, i) => (i === 0 ? { mx: 0, mz: 1, swing: false } : { ...IDLE }))
    s = runUntil(s, (x) => x.owner === 0, HZ * 2, go)
    expect(s.owner).toBe(0)
    s = run(s, HZ, go)
    expect(s.owner).toBe(0)
    expect(Math.hypot(s.ball.x - s.players[0].x, s.ball.z - s.players[0].z)).toBeLessThan(2.5)
    expect(s.ball.z).toBeLessThan(0)
  })

  it('a press with the ball shoots at their goal', () => {
    let s = live()
    s.owner = 0
    s.players[0].x = 0
    s.players[0].z = -10
    s.players[0].fz = -1
    s = step(s, s.players.map((_, i) => (i === 0 ? { mx: 0, mz: 0, swing: true } : { ...IDLE })))
    expect(s.owner).toBe(-1)
    expect(s.ball.vz).toBeLessThan(-40)
    expect(s.players[0].stats.shots).toBe(1)
  })

  it('a swipe down slide-tackles and knocks the ball off their feet', () => {
    let s = live()
    s.owner = 1
    s.players[1].x = 0
    s.players[1].z = 0
    s.players[1].fz = 1
    s.players[0].x = 0
    s.players[0].z = 6
    s = step(s, s.players.map((_, i) => (i === 0 ? { mx: 0, mz: 0, swing: true, shot: { act: 'dive', ax: 0, az: -1 } } : { ...IDLE })))
    expect(s.players[0].act).toBe('slide')
    s = runUntil(s, (x) => x.owner !== 1, HZ)
    expect(s.owner).not.toBe(1)
    expect(s.players[0].stats.tackles).toBe(1)
  })

  it('the shot pad reads swipes as soccer moves', () => {
    expect(SOCCER.gesture(0, 0).word).toBe('Pass')
    expect(SOCCER.gesture(0, 120).shot.act).toBe('jump')
    expect(SOCCER.gesture(0, 30).word).toBe('Chip')
    expect(SOCCER.gesture(0, -120).word).toBe('Tackle')
  })
})

describe('bots', () => {
  it('bot games play like soccer and finish', () => {
    let finished = 0
    let goals = 0
    for (const format of ['singles', 'doubles'] as const) {
      for (let g = 0; g < 4; g++) {
        let s = createGame(100 + g, { format, traits: [] })
        for (let k = 0; k < HZ * 60 * 8 && s.phase !== 'over'; k++) {
          s = step(s, s.players.map((_, i) => botInput(s, i, { tier: 'club', humans: [] })))
        }
        goals += s.scores[0] + s.scores[1]
        if (s.phase === 'over') finished += 1
      }
    }
    expect(goals).toBeGreaterThan(20)
    expect(finished).toBeGreaterThanOrEqual(6)
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
