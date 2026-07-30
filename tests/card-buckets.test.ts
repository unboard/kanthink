/**
 * Card position bucket tests
 *
 * Cards in a column live in one of three independently-numbered position buckets.
 * Getting this wrong silently corrupts card ordering rather than throwing, so the
 * classification and the NULL-safety of the predicates are worth pinning down.
 */
import { describe, it, expect } from 'vitest'
import { bucketOf, inBucket, inColumnBucket } from '@/lib/db/cardBuckets'

describe('bucketOf', () => {
  it('classifies a plain card as active', () => {
    expect(bucketOf({ isArchived: false, isPendingReview: false })).toBe('active')
  })

  it('treats missing flags as active', () => {
    expect(bucketOf({})).toBe('active')
  })

  it('treats null flags as active — Migration 0030 backfills 0, but raw inserts may not', () => {
    expect(bucketOf({ isArchived: null, isPendingReview: null })).toBe('active')
  })

  it('classifies pending-review cards', () => {
    expect(bucketOf({ isArchived: false, isPendingReview: true })).toBe('review')
  })

  it('classifies archived cards', () => {
    expect(bucketOf({ isArchived: true, isPendingReview: false })).toBe('archived')
  })

  it('lets archived win over pending, so an archived card never sits in the review queue', () => {
    expect(bucketOf({ isArchived: true, isPendingReview: true })).toBe('archived')
  })
})

/**
 * Drizzle SQL objects hold circular references back to their table, so they can't be
 * JSON-stringified. Walk the chunk tree and collect the literal SQL text instead.
 */
function sqlText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks
  if (Array.isArray(chunks)) return chunks.map(sqlText).join(' ')
  const value = (node as { value?: unknown[] }).value
  if (Array.isArray(value)) return value.map(sqlText).join(' ')
  return ''
}

describe('bucket predicates', () => {
  it('builds a distinct predicate per bucket', () => {
    const active = sqlText(inBucket('active'))
    const review = sqlText(inBucket('review'))
    const archived = sqlText(inBucket('archived'))

    expect(active).not.toBe(review)
    expect(review).not.toBe(archived)
    expect(active).not.toBe(archived)
  })

  it('uses COALESCE so NULL flags still match the active bucket', () => {
    // Guards the trap that makes a plain eq(..., false) miss legacy/raw-inserted rows
    expect(sqlText(inBucket('active'))).toContain('COALESCE')
  })

  it('keeps the bucket predicate when scoping to a column', () => {
    expect(sqlText(inColumnBucket('col-1', 'review'))).toContain('COALESCE')
  })
})
