import { and, eq, sql, type SQL } from 'drizzle-orm'
import { cards } from './schema'

/**
 * Cards in a column live in one of three position buckets, each with its own
 * independent 0..n numbering:
 *
 *   active   — on the board (is_archived = 0, is_pending_review = 0)
 *   review   — AI output awaiting approval (is_pending_review = 1)
 *   archived — the column's backside (is_archived = 1)
 *
 * Every max-position / shift query must scope itself to a single bucket, or cards
 * from one bucket collide with another's numbering.
 *
 * `is_pending_review` was added by Migration 0030 with DEFAULT 0, which backfills
 * existing rows — but a raw insert passing an explicit NULL would slip past a plain
 * `eq(..., false)`. COALESCE makes the predicate NULL-safe, so use these helpers
 * rather than comparing the columns directly.
 */
export type CardBucket = 'active' | 'review' | 'archived'

const notArchived = sql`COALESCE(${cards.isArchived}, 0) = 0`
const isArchived = sql`COALESCE(${cards.isArchived}, 0) = 1`
const notPending = sql`COALESCE(${cards.isPendingReview}, 0) = 0`
const isPending = sql`COALESCE(${cards.isPendingReview}, 0) = 1`

/** Predicate matching only cards in the given bucket. */
export function inBucket(bucket: CardBucket): SQL {
  switch (bucket) {
    case 'review':
      return and(notArchived, isPending)!
    case 'archived':
      return isArchived
    case 'active':
    default:
      return and(notArchived, notPending)!
  }
}

/** Which bucket a card row belongs to. */
export function bucketOf(card: { isArchived?: boolean | null; isPendingReview?: boolean | null }): CardBucket {
  if (card.isArchived) return 'archived'
  if (card.isPendingReview) return 'review'
  return 'active'
}

/** Predicate for a specific column's slice of a bucket — the common case. */
export function inColumnBucket(columnId: string, bucket: CardBucket): SQL {
  return and(eq(cards.columnId, columnId), inBucket(bucket))!
}
