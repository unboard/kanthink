import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { personStage, stageEvents } from '../lib/studio/stage'
import { verifyCioSignature, parseCioEvent, eventUpdates } from '../lib/studio/cio'
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

describe('Customer.IO reporting webhook', () => {
  const key = 'signing-key'
  const body = JSON.stringify({ object_type: 'email', metric: 'opened', timestamp: 1760000000, data: { delivery_id: 'abc' } })
  const sign = (ts: string, raw: string) => createHmac('sha256', key).update(`v0:${ts}:${raw}`).digest('hex')

  it('accepts a correctly signed, recent request', () => {
    expect(verifyCioSignature({ signingKey: key, timestamp: '1760000000', signature: sign('1760000000', body), rawBody: body, now: 1760000100 })).toBe(true)
  })

  it('rejects a wrong signature, a tampered body and an old request', () => {
    expect(verifyCioSignature({ signingKey: key, timestamp: '1760000000', signature: 'deadbeef', rawBody: body, now: 1760000100 })).toBe(false)
    expect(verifyCioSignature({ signingKey: key, timestamp: '1760000000', signature: sign('1760000000', body), rawBody: body + ' ', now: 1760000100 })).toBe(false)
    expect(verifyCioSignature({ signingKey: key, timestamp: '1760000000', signature: sign('1760000000', body), rawBody: body, now: 1760000000 + 2 * 3600 })).toBe(false)
    expect(verifyCioSignature({ signingKey: '', timestamp: '1', signature: 'x', rawBody: body })).toBe(false)
  })

  it('maps tracked metrics and ignores the rest', () => {
    expect(parseCioEvent(JSON.parse(body))).toMatchObject({ deliveryId: 'abc', column: 'openedAt' })
    expect(parseCioEvent({ object_type: 'email', metric: 'clicked', data: { delivery_id: 'x' } })?.column).toBe('clickedAt')
    expect(parseCioEvent({ object_type: 'email', metric: 'bounced', data: { delivery_id: 'x' } })?.column).toBe('bouncedAt')
    expect(parseCioEvent({ object_type: 'email', metric: 'sent', data: { delivery_id: 'x' } })).toBeNull()
    expect(parseCioEvent({ object_type: 'sms', metric: 'delivered', data: { delivery_id: 'x' } })).toBeNull()
    expect(parseCioEvent({ object_type: 'email', metric: 'opened', data: {} })).toBeNull()
  })

  it('records only the first of each event, and a click implies an open and a delivery', () => {
    const at = daysAgo(0)
    const click = { deliveryId: 'x', column: 'clickedAt' as const, at, metric: 'clicked' }
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

  it('skips stale, archived and still-in-review cards', () => {
    expect(pickSpark([card('stale', SPARK_MAX_AGE_DAYS + 1)], [], now)).toBeNull()
    expect(pickSpark([card('a', 0, { isArchived: true }), card('b', 0, { isPendingReview: true })], [], now)).toBeNull()
  })

  it('opens with the spark and asks what to do with it', () => {
    const text = sparkMessage(card('Sub Plan Writer', 0))
    expect(text).toContain('**Sub Plan Writer**')
    expect(text).toContain('Sub Plan Writer write-up')
    expect(text).toMatch(/test page/)
  })
})

describe('scout focus', () => {
  it('reads the groups from the brief’s Look in line, or falls back to the defaults', async () => {
    const { lookInList, DEFAULT_LOOK_IN } = await import('../lib/studio/scoutFocus')
    expect(lookInList('Studio brief\nLook in: teachers, food trucks; quilters.\nNever: x')).toEqual(['teachers', 'food trucks', 'quilters'])
    expect(lookInList('no line here')).toEqual(DEFAULT_LOOK_IN)
    expect(lookInList(null)).toEqual(DEFAULT_LOOK_IN)
  })

  it('steps through the groups one a day and names the group in the search', async () => {
    const { groupForDay, focusFor } = await import('../lib/studio/scoutFocus')
    const list = ['a', 'b', 'c']
    const d0 = new Date('2026-10-14T00:00:00Z')
    const d1 = new Date('2026-10-15T00:00:00Z')
    expect(groupForDay(list, d0)).not.toBe(groupForDay(list, d1))
    expect(focusFor('teachers')).toMatch(/^teachers /)
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
