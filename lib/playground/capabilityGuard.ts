/**
 * Stop a build deleting something that worked, or quietly forgetting something that
 * was asked for.
 *
 * A full rewrite regenerates a whole file from a prompt. Most of the time it comes
 * back with everything intact, and then one time it doesn't — the AI calls are gone,
 * or saving is, and nothing notices. The person using it finds out two builds later,
 * having meanwhile asked for three more changes on top of a broken app.
 *
 * ## Who is allowed to remove things
 *
 * Only the user, and the decision is made in preflight before any code is written.
 *
 * Two earlier versions got this wrong in the same direction. The first accepted any
 * removal the generator declared, so a model that deleted the AI calls and wrote
 * "AI text generation" in its own notes was waved straight through. The second asked
 * it to quote the user, and checked the quote appeared in the transcript — which
 * proves a string is present, not that removal was wanted. "Do not remove the AI
 * comments" contains "remove the AI comments", so an instruction to KEEP a feature
 * read as permission to delete it.
 *
 * Whether the user asked for something to go is a judgement about intent, and it is
 * made once, up front, by the component whose whole job is reading the request. By
 * the time the guard runs it is settled: a list of names, scoped to this turn. The
 * generator cannot add to it, and nothing here re-derives it from text.
 */

export interface RuntimeCapability {
  id: string
  /** What to look for. Matching the call, not the object, so a stray mention in a comment does not count. */
  pattern: RegExp
  /** How to describe it to whoever is reading the failure. */
  label: string
}

export const RUNTIME_CAPABILITIES: RuntimeCapability[] = [
  { id: 'ai.generate', pattern: /kanthinkAI\s*\.\s*generate\s*\(/, label: 'AI text generation' },
  { id: 'ai.generateImage', pattern: /kanthinkAI\s*\.\s*generateImage\s*\(/, label: 'AI image generation' },
  { id: 'data.set', pattern: /kanthinkData\s*\.\s*set\s*\(/, label: 'saving customer work' },
  { id: 'data.initial', pattern: /kanthinkData\s*(\?\.)?\s*\.?\s*initial/, label: 'loading saved customer work' },
  { id: 'pay.unlock', pattern: /kanthinkPay\s*(\?\.)?\s*\.?\s*unlock\s*\(/, label: 'charging for an action' },
  { id: 'upload', pattern: /kanthinkUpload\s*\(/, label: 'image upload' },
  { id: 'save', pattern: /kanthinkSave\s*\(/, label: 'shareable save links' },
  { id: 'record', pattern: /kanthinkInitial\s*(\?\.)?\s*\.?\s*record/, label: 'opening a shared link' },
]

/**
 * A removal preflight decided the user asked for, before any code was written.
 *
 * A plain string, named as preflight named it — "AI text generation", "image
 * upload", or a requirement line quoted back.
 */
export type AuthorisedRemoval = string

/**
 * The exact names preflight must use when it authorises removing a runtime feature.
 *
 * A fixed vocabulary rather than free text, because the alternative is matching one
 * phrase against another and guessing whether they mean the same thing. They often
 * do not: preflight once authorised "AI-generated comments" for a capability called
 * "AI text generation", the names did not overlap, and a removal the user had asked
 * for in plain words was refused every time they tried it.
 *
 * Given the list, preflight returns a member of it, and the check here is equality.
 */
export const REMOVABLE_CAPABILITY_NAMES: string[] = RUNTIME_CAPABILITIES.map((c) => c.label)

export function capabilitiesIn(code: string): Set<string> {
  const found = new Set<string>()
  if (!code) return found
  for (const cap of RUNTIME_CAPABILITIES) {
    if (cap.pattern.test(code)) found.add(cap.id)
  }
  return found
}

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Does this authorisation cover this capability?
 *
 * Deliberately a name match against a decision already made, and nothing cleverer.
 * The earlier version searched the transcript for a quote, which answered the wrong
 * question: "do not remove the AI comments" contains "remove the AI comments", so a
 * instruction to KEEP a feature read as permission to delete it. Whether removal was
 * wanted is a judgement, it is made once in preflight, and by the time it gets here
 * it is settled.
 */
export function coversCapability(authorised: AuthorisedRemoval, cap: RuntimeCapability): boolean {
  const a = normalise(authorised)
  if (a.length === 0) return false
  return a === normalise(cap.label) || a === cap.id.toLowerCase()
}
export interface CapabilityLoss {
  ids: string[]
  labels: string[]
}

/**
 * What the new code stopped doing, minus what preflight said the user asked to drop.
 *
 * `authorisedRemovals` comes from preflight and from nowhere else. The generator's
 * own account of what it meant to remove is not an input here — a model that has
 * just deleted something is the least reliable witness to whether deleting it was
 * wanted, and treating its say-so as permission is how the first version of this
 * guard would have waved through the very regression it exists to catch.
 */
export function capabilitiesLost(
  before: string,
  after: string,
  authorisedRemovals: AuthorisedRemoval[] = [],
): CapabilityLoss | null {
  const had = capabilitiesIn(before)
  if (had.size === 0) return null
  const has = capabilitiesIn(after)

  const lost = RUNTIME_CAPABILITIES.filter((cap) => {
    if (!had.has(cap.id) || has.has(cap.id)) return false
    return !authorisedRemovals.some((a) => coversCapability(a, cap))
  })

  if (lost.length === 0) return null
  return { ids: lost.map((c) => c.id), labels: lost.map((c) => c.label) }
}

/** What to tell the model so its second attempt keeps them. */
export function preservationInstruction(loss: CapabilityLoss): string {
  return (
    `\n\n⚠️ YOUR LAST ATTEMPT DELETED WORKING FEATURES. The previous code called ` +
    `${loss.labels.join(', ')}, and your version does not. The user did not ask for ` +
    `${loss.labels.length === 1 ? 'it' : 'them'} to be removed. Produce the file again with ` +
    `${loss.labels.length === 1 ? 'that feature' : 'those features'} still wired up exactly as ` +
    `before, plus the change that was actually requested. You cannot authorise a removal ` +
    `yourself — if the user wants one, they will say so and it will be allowed before you ` +
    `are asked to build.`
  )
}

// ── The running contract ──────────────────────────────────────────────────

const requirementLines = (text: string | null | undefined): string[] =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

export interface RequirementReconciliation {
  /** What to persist. */
  requirements: string
  /** Lines the model dropped without the user asking, which have been put back. */
  restored: string[]
}

/**
 * Does an authorised removal name this requirement line?
 *
 * Whole-line identity, not overlap. Overlap was the bug: "do not remove the rule
 * that a flop gets silence" CONTAINS "a flop gets silence", so a sentence insisting
 * a line stay read as authorisation to drop it — the same substring-for-intent
 * mistake the capability side had, surviving one layer down.
 *
 * Preflight is asked to quote the line it is dropping, so identity is what it should
 * produce. Anything less exact preserves the line, which is the direction to be
 * wrong in.
 */
function coversRequirement(authorised: AuthorisedRemoval, line: string): boolean {
  const strip = (t: string) => normalise(t).replace(/^[-*•]\s*/, '').replace(/[.]+$/, '')
  const a = strip(authorised)
  const body = strip(line)
  return a.length >= 8 && a === body
}
/**
 * Keep the contract from shrinking by accident.
 *
 * The model rewrites this list every turn, which means every turn is a chance for a
 * line to fall off — and a requirement that silently disappears is indistinguishable
 * from one that was never asked for. A line may only leave when preflight said the
 * user asked for it to, on exactly the same terms as a capability.
 *
 * Anything else is put back. Restoring a line the user had genuinely abandoned costs
 * them one sentence to say so again; dropping one they still wanted costs them
 * several builds and their patience.
 */
export function reconcileRequirements(
  previous: string | null | undefined,
  proposed: string | null | undefined,
  authorisedRemovals: AuthorisedRemoval[] = [],
): RequirementReconciliation {
  const had = requirementLines(previous)
  const now = requirementLines(proposed)

  // Nothing proposed: a model that skipped the field has not repealed anything.
  if (now.length === 0) return { requirements: (previous ?? '').trim(), restored: [] }
  if (had.length === 0) return { requirements: now.join('\n'), restored: [] }

  const kept = new Set(now.map(normalise))
  const restored = had.filter((line) => {
    if (kept.has(normalise(line))) return false
    // Reworded rather than removed: if most of the line survives somewhere, let it be.
    const body = normalise(line).replace(/^[-*•]\s*/, '')
    if (body.length >= 20 && now.some((n) => normalise(n).includes(body.slice(0, 20)))) return false
    return !authorisedRemovals.some((a) => coversRequirement(a, line))
  })

  return {
    requirements: [...now, ...restored].join('\n'),
    restored,
  }
}
