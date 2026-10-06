/**
 * Print orders: the shared page between a printer and their customer.
 *
 * An order is what someone bought; a job is one printed item in it. Each job has its
 * own artwork, its own design (so every studio tool works on it), its own link, and a
 * timeline both sides can read. Before the deadline the customer can approve the proof
 * or ask for a change; after it, the proof as it stands is what prints.
 */

export type JobStatus =
  | 'received' //          artwork is in; the printer hasn't sent a proof yet
  | 'awaiting_approval' // a proof is waiting on the customer
  | 'changes_requested' // the customer asked for something
  | 'approved' //          the customer said yes
  | 'locked' //            the deadline passed (or the printer locked it): this is what prints
  | 'in_production'
  | 'complete'
  | 'cancelled'

export const JOB_STATUSES: JobStatus[] = ['received', 'awaiting_approval', 'changes_requested', 'approved', 'locked', 'in_production', 'complete', 'cancelled']

/** Statuses a deadline can still close. After these, the job has moved on. */
export const OPEN_STATUSES: JobStatus[] = ['received', 'awaiting_approval', 'changes_requested', 'approved']

export const STATUS_LABEL: Record<JobStatus, string> = {
  received: 'Being reviewed',
  awaiting_approval: 'Waiting for your approval',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  locked: 'Final — going to print',
  in_production: 'Printing',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

/** The same, from the printer's side of the page. */
export const PRINTER_STATUS_LABEL: Record<JobStatus, string> = {
  received: 'Needs review',
  awaiting_approval: 'Proof sent',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  locked: 'Locked',
  in_production: 'In production',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

export interface Customer {
  name?: string
  email?: string
  phone?: string
  company?: string
}

/**
 * Where a piece of artwork came from. None of it is required; all of it changes how a
 * printer reviews: a first order from someone's own upload is checked differently from a
 * reorder of a file that already printed, and AI-made art fails in its own ways.
 */
export interface ArtworkOrigin {
  /** Who made it, relative to the person ordering. */
  madeBy?: 'customer' | 'designer' | 'printer' | 'unknown'
  /** The program it came out of, as the sender knows it: "Canva", "Illustrator", "our editor". */
  madeWith?: string
  /** How it reached the order. */
  via?: 'upload' | 'editor' | 'reorder' | 'email' | 'api'
  aiGenerated?: boolean
  /** The order or job this repeats. */
  reorderOf?: string
}

export interface ArtworkFile {
  id: string
  /** Our stored copy. */
  url: string
  /** Where the sender had it. */
  sourceUrl?: string
  filename?: string
  /** Which page (side) of the product it is for, from 0. */
  page: number
  width: number
  height: number
  format?: string
  origin?: ArtworkOrigin
  at: number
}

/** How each of the printer's one-click fixes is described to the customer. */
export const REVISE_CHANGES: Record<'fit' | 'fix' | 'sharpen' | 'marks', ProofChange> = {
  marks: { kind: 'content', text: 'Made the changes you marked' },
  fit: { kind: 'fit', text: 'Fit your design to this product’s size, keeping every word and detail' },
  fix: { kind: 'safe', text: 'Moved anything too close to the edge inside the safe area, and ran colour to the edges' },
  sharpen: { kind: 'resolution', text: 'Sharpened the artwork so it prints crisp' },
}

export interface ProofChange {
  kind: 'fit' | 'resolution' | 'spelling' | 'safe' | 'bleed' | 'content' | 'other'
  text: string
}

/** What the customer is shown: one version per page, and what the printer said about it. */
export interface JobProof {
  versions: (string | null)[]
  message?: string
  changes: ProofChange[]
  sentAt: number
}

/** A printer's look on the pages their customers see. */
export interface PartnerBrand {
  name?: string
  logoUrl?: string
  color?: string
  email?: string
  phone?: string
  website?: string
}

export interface Offer {
  title: string
  body?: string
  url?: string
  cta?: string
}

export type EventActor = 'printer' | 'customer' | 'api' | 'system'

export interface JobEvent {
  id: string
  actor: EventActor
  type: string
  message?: string
  data?: Record<string, unknown>
  at: number
}

/**
 * Event types, which are also the webhook event names (prefixed "job.").
 * Kept as a list so docs, webhooks and the timeline agree.
 */
export const EVENT_TYPES = [
  'created',
  'artwork_added',
  'checked',
  'revised',
  'proof_sent',
  'approved',
  'changes_requested',
  'comment',
  'locked',
  'status_changed',
  'deadline_changed',
] as const

export type EventType = (typeof EVENT_TYPES)[number]
