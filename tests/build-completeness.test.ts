/**
 * The standard a generated app is held to.
 *
 * These assert the words in the generator's prompt, which is unusual and
 * deliberate. The prompt used to say "prefer beautiful, realistic-feeling screens
 * over fully-working logic" — correct when apps were throwaway prototypes on a
 * card, and incoherent the moment they could be published and sold. You cannot sell
 * a thing with "Coming soon" on it.
 *
 * A prompt rule is invisible: nothing breaks when it is edited away, and the loss
 * shows up as apps that quietly stop working. So the rules that matter are pinned
 * here, where removing one fails a test instead of nothing.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const generator = fs.readFileSync(
  path.join(process.cwd(), 'lib/playground/generateApp.ts'),
  'utf8',
)
const preflight = fs.readFileSync(
  path.join(process.cwd(), 'lib/playground/preflight.ts'),
  'utf8',
)

describe('the generator is told to finish the job', () => {
  it('states the standard in terms of the app doing its job', () => {
    expect(generator).toContain('COMPLETENESS')
    expect(generator).toMatch(/reliably performs the core job/i)
  })

  it('applies to updates and rewrites, not only first builds', () => {
    // A rewrite after a failed patch is where a half-built app used to reappear.
    expect(generator).toMatch(/first build, an update, a\s*\n?\s*redesign, and a rewrite/i)
  })

  it('no longer tells the model to prefer looks over working logic', () => {
    expect(generator).not.toMatch(/Prefer beautiful, realistic-feeling screens over fully-working logic/i)
    expect(generator).not.toMatch(/clear "Coming soon" labels for unimplemented features/i)
  })

  it('requires controls to do what they are labelled with', () => {
    expect(generator).toMatch(/A button that says Save saves/i)
  })

  it('forbids success messages for things that did not happen', () => {
    expect(generator).toMatch(/never on a timer, never optimistically/i)
  })

  it('requires loading, empty and error states', () => {
    expect(generator).toMatch(/shows that it is\s*\n?\s*working/i)
    expect(generator).toMatch(/can be empty says so/i)
    expect(generator).toMatch(/can fail says what went wrong/i)
  })

  it('forbids simulating a promised capability', () => {
    expect(generator).toMatch(/NEVER SIMULATE A PROMISED CAPABILITY/i)
    expect(generator).toMatch(/No setTimeout standing in for a real/i)
  })

  it('requires sample data to be labelled as sample', () => {
    expect(generator).toMatch(/SAMPLE DATA IS LABELLED AS SAMPLE/i)
    expect(generator).toMatch(/If a number was made up, the screen says so/i)
  })

  it('tells the model to build the latest agreed version', () => {
    expect(generator).toMatch(/USE THE LATEST AGREED VERSION/i)
    expect(generator).toMatch(/do not reintroduce\s*\n?\s*an idea that was considered and dropped/i)
  })

  it('tells it to name a missing capability rather than fake it', () => {
    expect(generator).toMatch(/UNSUPPORTED: <the missing capability>/)
    expect(generator).toMatch(/A named gap is useful; a convincing fake is not/i)
  })

  it('stops localStorage being described to the user as syncing', () => {
    // The shim is per-session and per-device. An app that calls it "saved" is the
    // single most misleading thing this runtime can produce.
    expect(generator).toMatch(/never describe it to the user as saved, synced, or kept across devices/i)
  })
})

describe('preflight can say the runtime cannot do this', () => {
  it('offers an UNSUPPORTED verdict', () => {
    expect(preflight).toContain('UNSUPPORTED')
    expect(preflight).toMatch(/decision: 'ACT' \| 'ASK' \| 'UNSUPPORTED'/)
  })

  it('names cross-device storage and accounts as the things to catch', () => {
    expect(preflight).toMatch(/data that follows a person across devices/i)
    expect(preflight).toMatch(/user accounts, sign-in/i)
  })

  it('warns against tripping on adjacent vocabulary', () => {
    // "Save my score" is local and fine; the check has to judge the promise.
    expect(preflight).toMatch(/Judge the promise, not the\s*\n?\s*vocabulary/i)
  })

  it('requires a smaller scope to be offered alongside the refusal', () => {
    expect(preflight).toMatch(/smallerScope/)
    expect(preflight).toMatch(/not a consolation prize/i)
  })

  it('ignores an UNSUPPORTED verdict that names nothing', () => {
    // A refusal with no reason would stop the build and explain nothing, which is
    // worse than building the part that runs.
    expect(preflight).toMatch(/UNSUPPORTED only counts when it names what is missing/i)
  })
})

describe('first builds are checked too', () => {
  it('no longer skips preflight on the first generation', () => {
    // "Keep my progress across my devices" usually arrives on the first build, and
    // finding out afterwards means an app that looks like it saves and does not.
    expect(generator).not.toMatch(/First generations\s*\n?\s*\/\/\s*skip preflight/i)
    expect(generator).toMatch(/First builds run it too/i)
  })
})
