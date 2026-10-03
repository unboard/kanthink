import { afterEach, describe, expect, it } from 'vitest'
import {
  inboundConfigured,
  parseReplyToken,
  replyAddress,
  replyToken,
  stripQuotedReply,
  tokenFromAddress,
} from '@/lib/email/replyRouting'

const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a90'
const POSTMARK = '482d8814b3864b2c8ba7f7679fc116bf@inbound.postmarkapp.com'

afterEach(() => { delete process.env.INBOUND_EMAIL_ADDRESS })

describe('reply tokens', () => {
  it('round-trips the conversation and the side', () => {
    expect(parseReplyToken(replyToken({ appUserId: ID, as: 'user' }))).toEqual({ appUserId: ID, as: 'user' })
    expect(parseReplyToken(replyToken({ appUserId: ID, as: 'publisher' }))).toEqual({ appUserId: ID, as: 'publisher' })
  })

  it('refuses an edited token', () => {
    const t = replyToken({ appUserId: ID, as: 'user' })!
    // Flip the side: replying as the maker from the buyer's address must not work.
    const forged = t.slice(0, 22) + 'p' + t.slice(23)
    expect(parseReplyToken(forged)).toBeNull()
    expect(parseReplyToken('x'.repeat(29))).toBeNull()
    expect(parseReplyToken(null)).toBeNull()
  })

  it('fits inside an email address local part with a Postmark mailbox', () => {
    process.env.INBOUND_EMAIL_ADDRESS = POSTMARK
    const addr = replyAddress({ appUserId: ID, as: 'user' })!
    expect(addr.split('@')[0].length).toBeLessThanOrEqual(64)
    expect(addr.endsWith('@inbound.postmarkapp.com')).toBe(true)
    expect(parseReplyToken(tokenFromAddress(addr))).toEqual({ appUserId: ID, as: 'user' })
    expect(tokenFromAddress(`Kanthink <${addr}>`)).toBe(tokenFromAddress(addr))
  })

  it('falls back to the other person when inbound is not set up', () => {
    expect(inboundConfigured()).toBe(false)
    expect(replyAddress({ appUserId: ID, as: 'user' }, 'maker@example.com')).toBe('maker@example.com')
  })
})

describe('stripping quoted replies', () => {
  it('keeps only the new words', () => {
    const gmail = 'Today works, 4pm?\n\nOn Fri, Oct 3, 2026 at 9:38 AM Kanthink <kan@kanthink.com> wrote:\n> Thank you! Does today work?'
    expect(stripQuotedReply(gmail)).toBe('Today works, 4pm?')
    expect(stripQuotedReply('Yes!\n\nSent from my iPhone')).toBe('Yes!')
    expect(stripQuotedReply('Sounds good\r\n> quoted')).toBe('Sounds good')
  })
})
