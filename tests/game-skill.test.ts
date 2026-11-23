/**
 * The small-game skill: quick one-input physical games are built on the game kit
 * ('kit/game'). These pin that the skill switches on for those games and stays off for
 * thinking games, 3D and multiplayer; that the import map serves the kit; and that the
 * kit exports what the prompt tells the builder to import.
 */
import { describe, expect, it } from 'vitest'
import { GAME_PROMPT, isSmallGame, usesGameKit } from '../lib/playground/skills/game'
import { buildImportMap, resolveDeps } from '../lib/playground/runtime'

describe('small game skill', () => {
  it('switches on for small physical games', () => {
    for (const brief of [
      'A game where a stick figure hops over rolling balls',
      'tap to stack boxes as high as you can, high score',
      'an arcade game where you chop a tree and dodge the branches',
      'make a one-button game about throwing paper planes',
      'Basketball hoops game: aim and release to shoot',
      'endless runner for the girls with a cat',
    ]) expect(isSmallGame(brief), brief).toBe(true)
  })

  it('stays off for apps, thinking games, 3D and multiplayer', () => {
    for (const brief of [
      'A tip calculator that splits the bill',
      'Times tables practice game for a third grader',
      'A trivia quiz game about dinosaurs',
      'chess against the computer',
      'a 3D driving game in three.js where you jump ramps',
      'multiplayer pickleball with room codes',
      'Habit tracker with a running streak',
      'a moodboard where I drop images',
    ]) expect(isSmallGame(brief), brief).toBe(false)
  })

  it('keeps applying once an app is built on the kit', () => {
    expect(usesGameKit("import { Actor, P } from 'kit/game'")).toBe(true)
    expect(usesGameKit("import { Button } from 'kit'")).toBe(false)
  })

  it('tells the builder to use the kit, keep test modes, and not copy a house style', () => {
    expect(GAME_PROMPT).toMatch(/from 'kit\/game'/)
    expect(GAME_PROMPT).toMatch(/\?bot plays itself/)
    expect(GAME_PROMPT).toMatch(/the look is whatever was asked for/)
    expect(GAME_PROMPT).not.toMatch(/goofyfish|Balsamiq|butter/i)
  })

  it('every name the prompt imports, the kit exports', async () => {
    const kit: Record<string, unknown> = await import('../public/kit/game-v1.js')
    const names = /import \{([^}]+)\} from 'kit\/game'/.exec(GAME_PROMPT)![1].split(',').map((s) => s.trim()).filter(Boolean)
    expect(names.length).toBeGreaterThan(20)
    for (const n of names) expect(kit[n], n).toBeDefined()
  })

  it('poses blend and an Actor plays its queue', async () => {
    const { Actor, P, mk } = await import('../public/kit/game-v1.js')
    const a = new Actor(P.ready)
    let fired = false
    a.push({ pose: P.crouch, d: 0.1 }, { fn: () => { fired = true } }, { pose: mk({ hF: [40, -100] }, P.ready), d: 0.1 })
    for (let i = 0; i < 30; i++) a.update(1 / 60)
    expect(fired).toBe(true)
    expect(a.idle).toBe(true)
    expect(a.pose.hF[0]).toBeCloseTo(40, 0)
  })

  it('the import map serves the game kit from this origin, and nothing can shadow it', () => {
    const map = JSON.parse(buildImportMap([], { kitOrigin: 'https://kanthink.app' }))
    expect(map.imports['kit/game']).toBe('https://kanthink.app/kit/game-v1.js')
    expect(resolveDeps(['kit/game']).deps).toHaveLength(0)
  })
})
