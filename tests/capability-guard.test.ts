import { describe, it, expect } from 'vitest'
import {
  capabilitiesIn,
  capabilitiesLost,
  preservationInstruction,
} from '../lib/playground/capabilityGuard'

/**
 * The guard exists because of one real sequence.
 *
 * An app that generated its comments with AI was iterated on; one build came back
 * having quietly dropped the AI calls and kept everything around them. Nothing
 * noticed. The next three messages in that thread are the owner trying to work out
 * why their app had stopped doing the thing it was for.
 */

const WITH_AI = `
function App() {
  const react = async (post) => {
    const { text } = await window.kanthinkAI.generate({ prompt: 'react to ' + post });
    return text;
  };
  const pick = (f) => window.kanthinkUpload(f);
  return <div onClick={react} />;
}
`

const AI_REMOVED = `
function App() {
  const react = (post) => CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
  const pick = (f) => window.kanthinkUpload(f);
  return <div onClick={react} />;
}
`

describe('what the code can do', () => {
  it('sees the calls that matter', () => {
    const found = capabilitiesIn(WITH_AI)
    expect(found.has('ai.generate')).toBe(true)
    expect(found.has('upload')).toBe(true)
    expect(found.has('data.set')).toBe(false)
  })

  it('does not count a mention in prose as a call', () => {
    const found = capabilitiesIn(`// TODO: maybe use window.kanthinkAI one day\nfunction App() {}`)
    expect(found.has('ai.generate')).toBe(false)
  })

  it('reads the optional-chained form apps actually write', () => {
    const found = capabilitiesIn(`const s = window.kanthinkData?.initial?.stats;`)
    expect(found.has('data.initial')).toBe(true)
  })
})

describe('an undeclared removal is a regression', () => {
  it('catches AI generation going missing', () => {
    const loss = capabilitiesLost(WITH_AI, AI_REMOVED)
    expect(loss).not.toBeNull()
    expect(loss!.ids).toEqual(['ai.generate'])
    expect(loss!.labels[0]).toMatch(/AI text generation/i)
  })

  it('says nothing when everything survives', () => {
    const tidied = WITH_AI.replace('function App()', 'function App() /* tidied */')
    expect(capabilitiesLost(WITH_AI, tidied)).toBeNull()
  })

  it('says nothing when a capability is added', () => {
    const more = WITH_AI + `\nconst save = () => window.kanthinkData.set('x', 1);`
    expect(capabilitiesLost(WITH_AI, more)).toBeNull()
  })

  it('never fires on a first build, where there is nothing to lose', () => {
    expect(capabilitiesLost('', AI_REMOVED)).toBeNull()
  })
})

describe('a declared removal is allowed', () => {
  it('accepts a removal the model owns up to by label', () => {
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, ['AI text generation'])).toBeNull()
  })

  it('accepts one named by id', () => {
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, ['ai.generate'])).toBeNull()
  })

  it('is not fooled into allowing a different removal', () => {
    // Owning up to dropping uploads does not license dropping the AI calls.
    const bothGone = AI_REMOVED.replace('window.kanthinkUpload(f)', 'null')
    const loss = capabilitiesLost(WITH_AI, bothGone, ['image upload'])
    expect(loss).not.toBeNull()
    expect(loss!.ids).toEqual(['ai.generate'])
  })
})

describe('what the model is told to fix', () => {
  it('names the features rather than describing the problem abstractly', () => {
    const loss = capabilitiesLost(WITH_AI, AI_REMOVED)!
    const instruction = preservationInstruction(loss)
    expect(instruction).toMatch(/AI text generation/)
    expect(instruction).toMatch(/DELETED WORKING FEATURES/i)
    expect(instruction).toMatch(/removedCapabilities/)
  })
})
