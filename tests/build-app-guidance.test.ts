/**
 * Build-vs-task guidance
 *
 * Kan decides, on every card-chat turn, whether a described thing should be BUILT
 * or filed as a task. Getting that backwards is the failure this guidance exists to
 * prevent — buildable ideas were coming back as tasks, which buries the thing the
 * user was asking for.
 *
 * These tests pin the load-bearing parts. They cannot prove the model obeys the
 * prompt; they prove nobody deleted the instruction that tells it to.
 */
import { describe, it, expect } from 'vitest'
import { BUILD_ACTION_SHAPE, buildAppGuidance } from '../lib/ai/buildAppGuidance'

describe('build_app vs create_task guidance', () => {
  it('states the preference for build_app when a request could be either', () => {
    const guidance = buildAppGuidance(false)
    expect(guidance).toMatch(/could plausibly be either, choose build_app/i)
  })

  it('names filing a buildable idea as a task as the wrong outcome', () => {
    const guidance = buildAppGuidance(false)
    expect(guidance).toMatch(/worst outcome/i)
    expect(guidance).toMatch(/consolation prize/i)
  })

  it('gives concrete examples on both sides of the split', () => {
    const guidance = buildAppGuidance(false)
    // Buildable — things software can be.
    for (const example of ['calculators', 'trackers', 'games', 'dashboards']) {
      expect(guidance).toContain(example)
    }
    // Human work — things needing a person.
    for (const example of ['remind me to', 'follow up with', 'a meeting']) {
      expect(guidance).toContain(example)
    }
  })

  it('lets Kan propose a build unprompted when the card is plainly buildable', () => {
    expect(buildAppGuidance(false)).toMatch(/without being asked/i)
  })

  it('keeps the gatekeeper rules: one at a time, no repeat, never claim it built', () => {
    const guidance = buildAppGuidance(false)
    expect(guidance).toMatch(/at most one at a time/i)
    expect(guidance).toMatch(/do not re-propose/i)
    expect(guidance).toMatch(/NEVER claim you have built/i)
  })

  it('tells Kan when the card already has an app, so a build reads as the next version', () => {
    expect(buildAppGuidance(true)).toMatch(/already has one/i)
    expect(buildAppGuidance(false)).toMatch(/none yet/i)
  })

  it('exposes build_app in the response schema as a valid JSON fragment', () => {
    // The shape is spliced into a JSON array in the prompt, so it must start with
    // a comma and parse once wrapped — a malformed entry breaks every action.
    expect(BUILD_ACTION_SHAPE.trimStart().startsWith(',')).toBe(true)
    const parsed = JSON.parse(`[${BUILD_ACTION_SHAPE.replace(/^\s*,/, '')}]`)
    expect(parsed[0].type).toBe('build_app')
    expect(parsed[0].data).toHaveProperty('summary')
    expect(parsed[0].data).toHaveProperty('instruction')
  })
})
