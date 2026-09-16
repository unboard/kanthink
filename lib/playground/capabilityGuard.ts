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
 * Only the user. The model's own say-so is not enough, and the first version of this
 * got that wrong: it accepted any declared removal, so a model that dropped the AI
 * calls and wrote "AI text generation" in removedCapabilities was waved straight
 * through — the exact regression the guard existed to catch, with a note attached.
 *
 * So a removal now has to carry the user's own words, and those words are checked
 * against what the user actually wrote. A model cannot invent authority it was not
 * given, because the quote has to be found in the transcript to count.
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
  { id: 'upload', pattern: /kanthinkUpload\s*\(/, label: 'image upload' },
  { id: 'save', pattern: /kanthinkSave\s*\(/, label: 'shareable save links' },
  { id: 'record', pattern: /kanthinkInitial\s*(\?\.)?\s*\.?\s*record/, label: 'opening a shared link' },
]

/** A removal the model says was requested, and the words it says requested it. */
export interface DeclaredRemoval {
  capability?: string
  /** The user's own words, quoted. Checked against the transcript — see isAuthorised. */
  userAsked?: string
}

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
 * Shortest quote worth trusting.
 *
 * Long enough that it cannot match by accident — "remove it" appears in half the
 * messages ever written — and short enough that a genuine instruction qualifies.
 */
export const MIN_QUOTE_LENGTH = 12

/**
 * Did the user actually ask for this?
 *
 * The quote has to appear in what the user wrote. That is the whole check, and it is
 * the reason a declaration cannot authorise anything on its own: the model can claim
 * whatever it likes, but it cannot put words in the transcript.
 */
export function isAuthorised(quote: string | undefined, userText: string): boolean {
  if (!quote || !userText) return false
  const needle = normalise(quote)
  if (needle.length < MIN_QUOTE_LENGTH) return false
  return normalise(userText).includes(needle)
}

export interface CapabilityLoss {
  ids: string[]
  labels: string[]
}

/**
 * What the new code stopped doing, minus whatever the user actually asked to drop.
 *
 * `userText` is everything the user has said — this turn's request and their earlier
 * messages. A declared removal counts only when its quote is found there.
 */
export function capabilitiesLost(
  before: string,
  after: string,
  declaredRemovals: DeclaredRemoval[] = [],
  userText = '',
): CapabilityLoss | null {
  const had = capabilitiesIn(before)
  if (had.size === 0) return null
  const has = capabilitiesIn(after)

  const authorised = declaredRemovals
    .filter((d) => isAuthorised(d.userAsked, userText))
    .map((d) => normalise(d.capability ?? ''))
    .filter(Boolean)

  const lost = RUNTIME_CAPABILITIES.filter((cap) => {
    if (!had.has(cap.id) || has.has(cap.id)) return false
    return !authorised.some((a) => a.includes(cap.id.toLowerCase()) || a.includes(normalise(cap.label)))
  })

  if (lost.length === 0) return null
  return { ids: lost.map((c) => c.id), labels: lost.map((c) => c.label) }
}

/** What to tell the model so its second attempt keeps them. */
export function preservationInstruction(loss: CapabilityLoss): string {
  return (
    `\n\n⚠️ YOUR LAST ATTEMPT DELETED WORKING FEATURES. The previous code called ` +
    `${loss.labels.join(', ')}, and your version does not. Nobody asked for that to be ` +
    `removed. Produce the file again with ${loss.labels.length === 1 ? 'that feature' : 'those features'} ` +
    `still wired up exactly as before, plus the change that was actually requested. ` +
    `Only if the user explicitly asked for one to go, put it in "removedCapabilities" ` +
    `with their exact words in "userAsked" — a quote that is not in the conversation ` +
    `will not be accepted.`
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
 * Keep the contract from shrinking by accident.
 *
 * The model rewrites this list every turn, which means every turn is a chance for a
 * line to fall off — and a requirement that silently disappears is indistinguishable
 * from one that was never asked for. A line may only leave when the user said so, on
 * the same terms as a capability: their words, found in the transcript.
 *
 * Anything else is put back. Restoring a line the user had genuinely abandoned costs
 * them one sentence to say so again; dropping one they still wanted costs them
 * several builds and their patience.
 */
export function reconcileRequirements(
  previous: string | null | undefined,
  proposed: string | null | undefined,
  removals: DeclaredRemoval[] = [],
  userText = '',
): RequirementReconciliation {
  const had = requirementLines(previous)
  const now = requirementLines(proposed)

  // Nothing proposed: a model that skipped the field has not repealed anything.
  if (now.length === 0) return { requirements: (previous ?? '').trim(), restored: [] }
  if (had.length === 0) return { requirements: now.join('\n'), restored: [] }

  const authorised = removals
    .filter((d) => isAuthorised(d.userAsked, userText))
    .map((d) => normalise(d.capability ?? ''))
    .filter(Boolean)

  const kept = new Set(now.map(normalise))
  const restored = had.filter((line) => {
    if (kept.has(normalise(line))) return false
    // Reworded rather than removed: if most of the line survives somewhere, let it be.
    const body = normalise(line).replace(/^[-*•]\s*/, '')
    if (body.length >= 20 && now.some((n) => normalise(n).includes(body.slice(0, 20)))) return false
    return !authorised.some((a) => body.includes(a) || a.includes(body.slice(0, 20)))
  })

  return {
    requirements: [...now, ...restored].join('\n'),
    restored,
  }
}
