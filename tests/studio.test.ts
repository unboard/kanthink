import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { personStage, stageEvents } from '../lib/studio/stage'
import { verifyResendSignature, parseResendEvent, eventUpdates } from '../lib/studio/emailEvents'
import { nextFollowUp, NUDGE_AFTER_DAYS, type FollowUpInput } from '../lib/studio/followUps'
import { pickSpark, sparkMessage, SPARK_MAX_AGE_DAYS } from '../lib/studio/spark'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-14T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY)

describe('person stage', () => {
  it('reads prospect, using, customer and lapsed from the row', () => {
    expect(personStage({ status: 'free', reservedAt: daysAgo(3) })).toBe('prospect')
    expect(personStage({ status: 'free', verifiedAt: daysAgo(1) })).toBe('using')
    expect(personStage({ status: 'paid', verifiedAt: daysAgo(1) })).toBe('customer')
    expect(personStage({ status: 'refunded' })).toBe('lapsed')
  })

  it('narrates the changes in order, naming the stage each one moved to', () => {
    const events = stageEvents({
      status: 'paid', reservedAt: daysAgo(5), verifiedAt: daysAgo(2), paidAt: daysAgo(1), amountPaid: 900, currency: 'usd',
    }, 'Fair Rotations')
    expect(events.map((e) => e.text)).toEqual([
      'Reserved Fair Rotations on its test page. Prospect',
      'Proved their email in the app. Prospect → Using',
      'Paid $9. → Customer',
    ])
  })
})

describe('Resend webhook', () => {
  const secret = 'whsec_' + Buffer.from('signing-secret').toString('base64')
  const body = JSON.stringify({ type: 'email.opened', created_at: '2026-10-14T12:00:00.000Z', data: { email_id: 'abc' } })
  const sign = (id: string, ts: string, raw: string) =>
    'v1,' + createHmac('sha256', Buffer.from('signing-secret')).update(`${id}.${ts}.${raw}`).digest('base64')
  const base = { secret, id: 'msg_1', timestamp: '1760000000', rawBody: body, now: 1760000100 }

  it('accepts a correctly signed, recent request, among several signatures', () => {
    expect(verifyResendSignature({ ...base, signature: sign('msg_1', '1760000000', body) })).toBe(true)
    expect(verifyResendSignature({ ...base, signature: `v1,bm9wZQ== ${sign('msg_1', '1760000000', body)}` })).toBe(true)
  })

  it('rejects a wrong signature, a tampered body, another id and an old request', () => {
    const good = sign('msg_1', '1760000000', body)
    expect(verifyResendSignature({ ...base, signature: 'v1,deadbeef' })).toBe(false)
    expect(verifyResendSignature({ ...base, signature: good, rawBody: body + ' ' })).toBe(false)
    expect(verifyResendSignature({ ...base, signature: good, id: 'msg_2' })).toBe(false)
    expect(verifyResendSignature({ ...base, signature: good, now: 1760000000 + 3600 })).toBe(false)
    expect(verifyResendSignature({ ...base, signature: good, secret: '' })).toBe(false)
  })

  it('maps tracked events and ignores the rest', () => {
    expect(parseResendEvent(JSON.parse(body))).toMatchObject({ deliveryId: 'abc', column: 'openedAt', at: new Date('2026-10-14T12:00:00.000Z') })
    expect(parseResendEvent({ type: 'email.clicked', data: { email_id: 'x' } })?.column).toBe('clickedAt')
    expect(parseResendEvent({ type: 'email.bounced', data: { email_id: 'x' } })?.column).toBe('bouncedAt')
    expect(parseResendEvent({ type: 'email.sent', data: { email_id: 'x' } })).toBeNull()
    expect(parseResendEvent({ type: 'contact.created', data: { id: 'x' } })).toBeNull()
    expect(parseResendEvent({ type: 'email.opened', data: {} })).toBeNull()
  })

  it('records only the first of each event, and a click implies an open and a delivery', () => {
    const at = daysAgo(0)
    const click = { deliveryId: 'x', column: 'clickedAt' as const, at, type: 'email.clicked' }
    expect(eventUpdates({}, click)).toEqual({ clickedAt: at, openedAt: at, deliveredAt: at })
    expect(eventUpdates({ openedAt: daysAgo(1), deliveredAt: daysAgo(1) }, click)).toEqual({ clickedAt: at })
    expect(eventUpdates({ openedAt: daysAgo(1) }, { ...click, column: 'openedAt' })).toEqual({ deliveredAt: at })
  })
})

describe('follow-up crew', () => {
  const base: FollowUpInput = {
    member: { status: 'free', reservedAt: daysAgo(10), name: 'Maya Ruiz' },
    app: { title: 'Sub Plan Writer', live: true, url: 'https://kanthink.com/play/x', priceLabel: '$5 a plan' },
    emails: [],
    publisherName: 'Dustin Hodge',
    now,
  }

  it('tells someone who reserved that it exists, once it is live', () => {
    const draft = nextFollowUp(base)
    expect(draft?.kind).toBe('launch')
    expect(draft?.body).toContain('Hi Maya,')
    expect(draft?.body).toContain('https://kanthink.com/play/x')
    expect(draft?.body).toContain('Dustin')
  })

  it('stays quiet before launch, after an unsubscribe, and while a draft is waiting', () => {
    expect(nextFollowUp({ ...base, app: { ...base.app, live: false } })).toBeNull()
    expect(nextFollowUp({ ...base, member: { ...base.member, unsubscribedAt: daysAgo(1) } })).toBeNull()
    expect(nextFollowUp({ ...base, emails: [{ kind: 'manual', status: 'draft' }] })).toBeNull()
  })

  it('never drafts the launch twice, even after you dropped it', () => {
    expect(nextFollowUp({ ...base, emails: [{ kind: 'launch', status: 'dropped' }] })).toBeNull()
  })

  it('nudges once, only after the wait, only if they never clicked and are still a prospect', () => {
    const launched = (days: number, extra = {}) => ({ kind: 'launch', status: 'sent' as const, sentAt: daysAgo(days), openedAt: daysAgo(days), ...extra })
    expect(nextFollowUp({ ...base, emails: [launched(NUDGE_AFTER_DAYS - 1)] })).toBeNull()
    expect(nextFollowUp({ ...base, emails: [launched(NUDGE_AFTER_DAYS)] })?.kind).toBe('nudge')
    expect(nextFollowUp({ ...base, emails: [launched(5, { clickedAt: daysAgo(4) })] })).toBeNull()
    expect(nextFollowUp({ ...base, emails: [launched(5), { kind: 'nudge', status: 'sent', sentAt: daysAgo(1) }] })).toBeNull()
    expect(nextFollowUp({ ...base, member: { ...base.member, verifiedAt: daysAgo(4) }, emails: [launched(5)] })).toBeNull()
  })
})

describe('morning spark', () => {
  const card = (id: string, ageDays: number, extra = {}) => ({ id, title: id, createdAt: daysAgo(ageDays), messages: [{ type: 'ai_response', content: `${id} write-up` }], ...extra })

  it('picks the newest fresh spark that has not been raised yet', () => {
    const cards = [card('old', 1), card('new', 0.2), card('handled', 0.1)]
    expect(pickSpark(cards, ['handled'], now)?.id).toBe('new')
  })

  it('skips stale and archived cards, and counts ones waiting for review', () => {
    expect(pickSpark([card('stale', SPARK_MAX_AGE_DAYS + 1)], [], now)).toBeNull()
    expect(pickSpark([card('a', 0, { isArchived: true })], [], now)).toBeNull()
    expect(pickSpark([card('b', 0, { isPendingReview: true })], [], now)?.id).toBe('b')
  })

  it('opens with the spark and asks what to do with it', () => {
    const text = sparkMessage(card('Sub Plan Writer', 0))
    expect(text).toContain('**Sub Plan Writer**')
    expect(text).toContain('Sub Plan Writer write-up')
    expect(text).toMatch(/test page/)
  })
})

describe('spark links', () => {
  it('turns bare source URLs into short links and leaves markdown links alone', async () => {
    const { linkifySources } = await import('../lib/studio/spark')
    const long = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ' + 'x'.repeat(200)
    expect(linkifySources(`— *Forum* (${long})`)).toBe(`— *Forum* ([source](${long}))`)
    expect(linkifySources(`see [Link](${long})`)).toBe(`see [Link](${long})`)
  })

  it('strips markdown and links for the email', async () => {
    const { plainForEmail } = await import('../lib/studio/spark')
    const text = '### The Problem\nLandlords **waste** hours.\n\n* "Is there an app?" — *Forum* ([Link](https://x.y/z))\n* "Too pricey." (https://a.b/c)'
    expect(plainForEmail(text)).toBe('The Problem\nLandlords waste hours.\n\n• "Is there an app?" — Forum\n• "Too pricey."')
  })
})

describe('spark size', () => {
  it('reads the size line', async () => {
    const { sparkSize } = await import('../lib/studio/spark')
    expect(sparkSize('Landlords lose time.\nSize: Mid — monthly for small landlords')).toBe('Mid')
    expect(sparkSize('**Size:** Big — lots of payers')).toBe('Big')
    expect(sparkSize('* Size: small — one task')).toBe('Small')
    expect(sparkSize('no size')).toBeNull()
  })
})
