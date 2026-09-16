import { describe, it, expect } from 'vitest'
import {
  capabilitiesIn,
  capabilitiesLost,
  coversCapability,
  preservationInstruction,
  reconcileRequirements,
  RUNTIME_CAPABILITIES,
} from '../lib/playground/capabilityGuard'

/**
 * The guard exists because of one real sequence: a build came back having quietly
 * dropped the AI calls an app was built around, nothing noticed, and its owner spent
 * three messages working out why it had stopped doing the thing it was for.
 *
 * The rule these hold the line on is that a removal is authorised in exactly one
 * place — preflight, before any code is written — and cannot be manufactured
 * downstream. Two earlier versions each let it be manufactured a different way, so
 * the cases below are mostly about what must NOT count as permission.
 */

const WITH_AI = `
function App() {
  const react = async (post) => {
    const { text } = await window.kanthinkAI.generate({ prompt: 'react to ' + post });
    return text;
  };
  const pick = (f) => window.kanthinkUpload(f);
  const share = () => window.kanthinkSave({ post });
  return <div onClick={react} />;
}
`

const AI_REMOVED = WITH_AI.replace(
  /const react = async[\s\S]*?\};/,
  'const react = (post) => CANNED[Math.floor(Math.random() * CANNED.length)];'
)

const cap = (id: string) => RUNTIME_CAPABILITIES.find((c) => c.id === id)!

describe('what the code can do', () => {
  it('sees the calls that matter', () => {
    const found = capabilitiesIn(WITH_AI)
    expect(found.has('ai.generate')).toBe(true)
    expect(found.has('upload')).toBe(true)
    expect(found.has('save')).toBe(true)
    expect(found.has('data.set')).toBe(false)
  })

  it('does not count a mention in prose as a call', () => {
    expect(capabilitiesIn('// TODO: maybe use window.kanthinkAI one day').has('ai.generate')).toBe(false)
  })

  it('reads the optional-chained form apps actually write', () => {
    expect(capabilitiesIn('const s = window.kanthinkData?.initial?.stats;').has('data.initial')).toBe(true)
  })
})

describe('an unauthorised removal is a regression', () => {
  it('catches AI generation going missing', () => {
    const loss = capabilitiesLost(WITH_AI, AI_REMOVED)
    expect(loss?.ids).toEqual(['ai.generate'])
  })

  it('says nothing when everything survives', () => {
    expect(capabilitiesLost(WITH_AI, WITH_AI + '\n// tidied')).toBeNull()
  })

  it('never fires on a first build, where there is nothing to lose', () => {
    expect(capabilitiesLost('', AI_REMOVED)).toBeNull()
  })
})

/**
 * The three cases named in review. Each is a real thing a user might write, and none
 * of them is permission to delete the AI calls.
 */
describe('what must never authorise a removal', () => {
  it('an instruction to KEEP the feature', () => {
    // The case that broke the quote-matching version: this sentence contains the
    // substring "remove the AI-generated comments".
    const keep = 'Do not remove the AI-generated comments'
    expect(coversCapability(keep, cap('ai.generate'))).toBe(false)
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, [keep])?.ids).toEqual(['ai.generate'])
  })

  it('an instruction about a DIFFERENT feature', () => {
    const other = 'image upload'
    expect(coversCapability(other, cap('ai.generate'))).toBe(false)
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, [other])?.ids).toEqual(['ai.generate'])
  })

  it('a removal request the user later reversed', () => {
    // A reversal is preflight's judgement to make, and it makes it by returning an
    // empty list. Nothing downstream can reinstate the earlier request, because
    // nothing downstream reads the transcript.
    const preflightSaidNothingToRemove: string[] = []
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, preflightSaidNothingToRemove)?.ids).toEqual(['ai.generate'])
  })

  it('the generator having an opinion', () => {
    // There is no longer any channel for one: capabilitiesLost takes preflight's
    // list and has no other parameter.
    expect(capabilitiesLost.length).toBeLessThanOrEqual(3)
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, [])?.ids).toEqual(['ai.generate'])
  })

  it('an empty or whitespace authorisation', () => {
    expect(coversCapability('', cap('ai.generate'))).toBe(false)
    expect(coversCapability('   ', cap('ai.generate'))).toBe(false)
  })
})

describe('an authorised removal is allowed, and only that one', () => {
  it('lets the named capability go', () => {
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, ['AI text generation'])).toBeNull()
  })

  it('matches on the id as well as the label', () => {
    expect(capabilitiesLost(WITH_AI, AI_REMOVED, ['ai.generate'])).toBeNull()
  })

  it('does not let one authorised removal license another', () => {
    const bothGone = AI_REMOVED.replace('window.kanthinkUpload(f)', 'null')
    const loss = capabilitiesLost(WITH_AI, bothGone, ['image upload'])
    expect(loss?.ids).toEqual(['ai.generate'])
  })
})

describe('the contract does not shrink by accident', () => {
  const CONTRACT = [
    '- Comments are generated per post by AI, never from a fixed pool',
    '- A flop gets silence or criticism, never praise',
    '- Metrics tick up on reveal',
  ].join('\n')

  const WITHOUT_FLOP_RULE = [
    '- Comments are generated per post by AI, never from a fixed pool',
    '- Metrics tick up on reveal',
  ].join('\n')

  it('puts back a line dropped without authorisation', () => {
    const result = reconcileRequirements(CONTRACT, WITHOUT_FLOP_RULE, [])
    expect(result.restored).toHaveLength(1)
    expect(result.requirements).toMatch(/flop gets silence/)
  })

  it('does not accept a KEEP instruction as authorisation', () => {
    const result = reconcileRequirements(CONTRACT, WITHOUT_FLOP_RULE, [
      'do not remove the rule that a flop gets silence or criticism',
    ])
    // Preflight would never put a keep-instruction in this list; even if something
    // did, the line comes back, because the overlap check is not intent detection.
    expect(result.requirements).toMatch(/flop gets silence/)
  })

  it('lets a line go when preflight authorised that line', () => {
    const result = reconcileRequirements(CONTRACT, WITHOUT_FLOP_RULE, [
      'a flop gets silence or criticism, never praise',
    ])
    expect(result.restored).toHaveLength(0)
    expect(result.requirements).not.toMatch(/flop gets silence/)
  })

  it('treats a missing field as no change, not as repeal', () => {
    expect(reconcileRequirements(CONTRACT, '', []).requirements).toBe(CONTRACT)
  })

  it('accepts a rewording without duplicating the line', () => {
    const reworded = CONTRACT.replace('never from a fixed pool', 'never from a fixed pool, and must vary')
    const result = reconcileRequirements(CONTRACT, reworded, [])
    expect(result.restored).toHaveLength(0)
    expect(result.requirements.match(/generated per post/g)).toHaveLength(1)
  })

  it('keeps new lines alongside the old ones', () => {
    const grown = CONTRACT + '\n- The X logo is the real one'
    const result = reconcileRequirements(CONTRACT, grown, [])
    expect(result.requirements).toMatch(/X logo/)
    expect(result.requirements).toMatch(/flop gets silence/)
  })

  it('starts a contract from nothing on a first build', () => {
    expect(reconcileRequirements(null, '- Does the thing', []).requirements).toBe('- Does the thing')
  })
})

describe('what the model is told to fix', () => {
  it('names the features and denies it any say in the matter', () => {
    const instruction = preservationInstruction(capabilitiesLost(WITH_AI, AI_REMOVED)!)
    expect(instruction).toMatch(/AI text generation/)
    expect(instruction).toMatch(/cannot authorise a removal yourself/i)
  })
})
