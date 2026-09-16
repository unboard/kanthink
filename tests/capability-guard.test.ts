import { describe, it, expect } from 'vitest'
import {
  capabilitiesIn,
  capabilitiesLost,
  isAuthorised,
  preservationInstruction,
  reconcileRequirements,
  MIN_QUOTE_LENGTH,
} from '../lib/playground/capabilityGuard'

/**
 * The guard exists because of one real sequence.
 *
 * An app that generated its comments with AI was iterated on; one build came back
 * having quietly dropped the AI calls and kept everything around them. Nothing
 * noticed. The next three messages in that thread are the owner trying to work out
 * why their app had stopped doing the thing it was for.
 *
 * The rule these tests hold to the line on: only the user removes things. A model
 * saying it meant to is not authorisation, because the first version of this guard
 * accepted exactly that and would have waved the original regression through with a
 * note attached.
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

const USER_WANTS_AI_GONE =
  'this is costing too much, please take the AI comments out entirely and just use a fixed list'

describe('what the code can do', () => {
  it('sees the calls that matter', () => {
    const found = capabilitiesIn(WITH_AI)
    expect(found.has('ai.generate')).toBe(true)
    expect(found.has('upload')).toBe(true)
    expect(found.has('data.set')).toBe(false)
  })

  it('does not count a mention in prose as a call', () => {
    expect(capabilitiesIn(`// TODO: maybe use window.kanthinkAI one day`).has('ai.generate')).toBe(false)
  })

  it('reads the optional-chained form apps actually write', () => {
    expect(capabilitiesIn(`const s = window.kanthinkData?.initial?.stats;`).has('data.initial')).toBe(true)
  })
})

describe('an undeclared removal is a regression', () => {
  it('catches AI generation going missing', () => {
    const loss = capabilitiesLost(WITH_AI, AI_REMOVED)
    expect(loss).not.toBeNull()
    expect(loss!.ids).toEqual(['ai.generate'])
  })

  it('says nothing when everything survives', () => {
    expect(capabilitiesLost(WITH_AI, WITH_AI + '\n// tidied')).toBeNull()
  })

  it('never fires on a first build, where there is nothing to lose', () => {
    expect(capabilitiesLost('', AI_REMOVED)).toBeNull()
  })
})

describe('only the user can authorise a removal', () => {
  it('REFUSES a removal the model declared on its own', () => {
    // The model says it meant to. Nobody asked. This is the case the first version
    // of the guard let through.
    const loss = capabilitiesLost(
      WITH_AI,
      AI_REMOVED,
      [{ capability: 'AI text generation', userAsked: 'the user wanted it simpler' }],
      'make the replies appear one at a time',
    )
    expect(loss).not.toBeNull()
    expect(loss!.ids).toEqual(['ai.generate'])
  })

  it('refuses a declaration carrying no quote at all', () => {
    const loss = capabilitiesLost(WITH_AI, AI_REMOVED, [{ capability: 'AI text generation' }], USER_WANTS_AI_GONE)
    expect(loss).not.toBeNull()
  })

  it('accepts a removal whose quote is really in the conversation', () => {
    const loss = capabilitiesLost(
      WITH_AI,
      AI_REMOVED,
      [{ capability: 'AI text generation', userAsked: 'take the AI comments out entirely' }],
      USER_WANTS_AI_GONE,
    )
    expect(loss).toBeNull()
  })

  it('accepts a quote that differs only in spacing and case', () => {
    const loss = capabilitiesLost(
      WITH_AI,
      AI_REMOVED,
      [{ capability: 'AI text generation', userAsked: 'Take The AI   Comments Out Entirely' }],
      USER_WANTS_AI_GONE,
    )
    expect(loss).toBeNull()
  })

  it('does not let one authorised removal license another', () => {
    const bothGone = AI_REMOVED.replace('window.kanthinkUpload(f)', 'null')
    const loss = capabilitiesLost(
      WITH_AI,
      bothGone,
      [{ capability: 'image upload', userAsked: 'take the AI comments out entirely' }],
      USER_WANTS_AI_GONE,
    )
    expect(loss).not.toBeNull()
    expect(loss!.ids).toEqual(['ai.generate'])
  })
})

describe('a quote has to be worth something', () => {
  it('rejects a quote too short to mean anything', () => {
    expect(isAuthorised('remove it', 'remove it please')).toBe(false)
    expect('remove it'.length).toBeLessThan(MIN_QUOTE_LENGTH)
  })

  it('rejects a quote the user never wrote', () => {
    expect(isAuthorised('please delete the AI features', 'add a dark mode toggle')).toBe(false)
  })

  it('accepts a long enough quote that is genuinely there', () => {
    expect(isAuthorised('delete the AI features', 'can you delete the AI features now')).toBe(true)
  })
})

describe('the contract does not shrink by accident', () => {
  const CONTRACT = [
    '- Comments are generated per post by AI, never from a fixed pool',
    '- A flop gets silence or criticism, never praise',
    '- Metrics tick up on reveal',
  ].join('\n')

  it('puts back a line the model dropped without being asked', () => {
    const proposed = [
      '- Comments are generated per post by AI, never from a fixed pool',
      '- Metrics tick up on reveal',
    ].join('\n')
    const result = reconcileRequirements(CONTRACT, proposed, [], 'make the ticking faster')
    expect(result.restored).toHaveLength(1)
    expect(result.restored[0]).toMatch(/flop gets silence/)
    expect(result.requirements).toMatch(/flop gets silence/)
  })

  it('lets a line go when the user asked', () => {
    const proposed = [
      '- Comments are generated per post by AI, never from a fixed pool',
      '- Metrics tick up on reveal',
    ].join('\n')
    const result = reconcileRequirements(
      CONTRACT,
      proposed,
      [{ capability: 'a flop gets silence or criticism, never praise', userAsked: 'drop the silence rule, always show some replies' }],
      'drop the silence rule, always show some replies',
    )
    expect(result.restored).toHaveLength(0)
    expect(result.requirements).not.toMatch(/flop gets silence/)
  })

  it('treats a missing field as no change, not as repeal', () => {
    const result = reconcileRequirements(CONTRACT, '', [], '')
    expect(result.requirements).toBe(CONTRACT)
    expect(result.restored).toHaveLength(0)
  })

  it('accepts a rewording without duplicating the line', () => {
    const reworded = [
      '- Comments are generated per post by AI, never from a fixed pool, and must vary',
      '- A flop gets silence or criticism, never praise',
      '- Metrics tick up on reveal',
    ].join('\n')
    const result = reconcileRequirements(CONTRACT, reworded, [], 'make them vary more')
    expect(result.restored).toHaveLength(0)
    expect(result.requirements.match(/generated per post/g)).toHaveLength(1)
  })

  it('keeps new lines alongside the old ones', () => {
    const grown = CONTRACT + '\n- The X logo is the real one'
    const result = reconcileRequirements(CONTRACT, grown, [], 'use the real X logo')
    expect(result.requirements).toMatch(/X logo/)
    expect(result.requirements).toMatch(/flop gets silence/)
  })

  it('starts a contract from nothing on a first build', () => {
    const result = reconcileRequirements(null, '- Does the thing', [], '')
    expect(result.requirements).toBe('- Does the thing')
  })
})

describe('what the model is told to fix', () => {
  it('names the features and refuses invented authority', () => {
    const instruction = preservationInstruction(capabilitiesLost(WITH_AI, AI_REMOVED)!)
    expect(instruction).toMatch(/AI text generation/)
    expect(instruction).toMatch(/not in the conversation will not be accepted/i)
  })
})
