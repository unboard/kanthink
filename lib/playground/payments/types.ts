/**
 * The shapes the payment overseer works with. Kept dependency-free: the schema,
 * the client and the server all import them.
 */

/** How a buyer gets what they paid for, in an app that takes orders. */
export type Fulfilment = 'pickup' | 'shipping' | 'digital' | 'contact'

/** What the owner told us about selling. Every field is optional; the overseer asks for what's missing. */
export type PaymentSetup = {
  /** Orders: how buyers get it. Decides whether Stripe asks for an address. */
  fulfilment?: Fulfilment | null
  /** Orders: shown at checkout and in the confirmation — "Pick up at 12 Elm St, Fargo, Saturdays". */
  fulfilmentNote?: string | null
  /** Orders: ask the buyer for a phone number. */
  collectPhone?: boolean
  /** Orders: let the buyer leave a note (a name to paint, a size, a date). */
  collectNote?: boolean
  /** Orders: what the note field is for, as its label. */
  noteLabel?: string | null
  /** Orders: most of one item a buyer may take at once. */
  maxQuantity?: number | null
  /** Action paywalls: what costs money, in the owner's words. */
  paidAction?: string | null
}

export type CheckSeverity = 'high' | 'medium' | 'low'

/** One way the app's code and its payment settings disagree. */
export type PaymentFinding = {
  id: string
  severity: CheckSeverity
  title: string
  /** For the owner: why it matters, plainly. */
  detail: string
  /** For the builder: what to change. */
  fix: string
}

export type PaymentModeKey = 'free' | 'app' | 'action' | 'order'

/** Kan's read of an app against its payment settings. */
export type PaymentReview = {
  /** What the app sells, in a sentence, or that it sells nothing. */
  sells: string
  /** The mode Kan thinks fits. */
  suggestedMode: PaymentModeKey
  /** Why, in a sentence, for the owner. */
  why: string
  /** For orders. */
  suggestedFulfilment?: Fulfilment | null
  /** Questions worth asking the owner that the settings don't answer yet. */
  questions?: string[]
  /** Problems Kan found reading the code that the deterministic check can't see. */
  issues?: PaymentFinding[]
  /** Hash of the code that was read, so a review of an older build is recognisable. */
  codeHash: string
  /** The settings the review was made against, as a fingerprint. */
  settingsKey: string
  reviewedAt: string
}
