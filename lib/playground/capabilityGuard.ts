/**
 * Stop a rewrite from quietly deleting something that worked.
 *
 * A full rewrite regenerates a whole file from a prompt. Most of the time it comes
 * back with everything intact, and then one time it doesn't — the AI calls are gone,
 * or saving is, and nothing notices. The person using it finds out two builds later,
 * having meanwhile asked for three more changes on top of a broken app.
 *
 * That is the failure this catches. It is not a linter and it does not read the code
 * for quality: it asks one question, which is whether the new file still calls the
 * runtime features the old one called. Those are the parts with no local fallback —
 * if the call is gone, the feature is gone, and no amount of surrounding code brings
 * it back.
 *
 * Deliberate removal is fine and is how you take a feature out; the model declares
 * it. What is refused is the undeclared kind, because that is never what anybody
 * asked for.
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

export function capabilitiesIn(code: string): Set<string> {
  const found = new Set<string>()
  if (!code) return found
  for (const cap of RUNTIME_CAPABILITIES) {
    if (cap.pattern.test(code)) found.add(cap.id)
  }
  return found
}

export interface CapabilityLoss {
  ids: string[]
  labels: string[]
}

/**
 * What the new code stopped doing, minus whatever the model said it meant to remove.
 *
 * `declaredRemovals` is the model's own account of what it took out on purpose. It is
 * matched loosely — against the id or the label — because the model writes it, and
 * refusing a build over the exact spelling of an explanation would be its own kind of
 * broken.
 */
export function capabilitiesLost(
  before: string,
  after: string,
  declaredRemovals: string[] = [],
): CapabilityLoss | null {
  const had = capabilitiesIn(before)
  if (had.size === 0) return null
  const has = capabilitiesIn(after)

  const declared = declaredRemovals.join(' ').toLowerCase()
  const lost = RUNTIME_CAPABILITIES.filter((cap) => {
    if (!had.has(cap.id) || has.has(cap.id)) return false
    if (!declared) return true
    return !(declared.includes(cap.id.toLowerCase()) || declared.includes(cap.label.toLowerCase()))
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
    `If you genuinely believe one should go, list it in "removedCapabilities" and say why.`
  )
}
