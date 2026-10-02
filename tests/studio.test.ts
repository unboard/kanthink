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
    expect(focusFor('roofers')).toMatch(/^roofers:/)
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

describe('spark audit', () => {
  const now = new Date('2026-10-02T12:00:00Z')

  it('reads the month a quote says it is from', async () => {
    const { statedDate } = await import('../lib/studio/audit')
    expect(statedDate('"quote" — r/petsitting, March 2026 (https://x.y)')?.toISOString().slice(0, 7)).toBe('2026-03')
    expect(statedDate('posted Sept. 2025')?.toISOString().slice(0, 7)).toBe('2025-09')
    expect(statedDate('on 2025-11 someone said')?.toISOString().slice(0, 7)).toBe('2025-11')
    expect(statedDate('no date here')).toBeNull()
  })

  it('knows a six-character Reddit id is from before 2023', async () => {
    const { isPre2023Reddit } = await import('../lib/studio/audit')
    expect(isPre2023Reddit('https://www.reddit.com/r/RoverPetSitting/comments/xldgjm/full_timers/')).toBe(true)
    expect(isPre2023Reddit('https://www.reddit.com/r/petsitting/comments/1ooahyy/just_another/')).toBe(false)
    expect(isPre2023Reddit('https://example.com/comments/abc')).toBe(false)
  })

  it('keeps a spark with two recent, dated posts and rejects the rest, saying why', async () => {
    const { readSources, sparkVerdict } = await import('../lib/studio/audit')
    const good = [
      '* "a" — r/petsitting, May 2026 (https://www.reddit.com/r/petsitting/comments/1abcdef/x/)',
      '* "b" — a forum, January 2026 (https://forum.example.com/t/1)',
    ].join('\n')
    expect(sparkVerdict(readSources(good, now)).keep).toBe(true)

    const stale = [
      '* "a" — r/RoverPetSitting, June 2026 (https://www.reddit.com/r/RoverPetSitting/comments/xldgjm/x/)',
      '* "b" — a forum, March 2023 (https://forum.example.com/t/2)',
      '* "c" — undated (https://forum.example.com/t/3)',
    ].join('\n')
    const v = sparkVerdict(readSources(stale, now))
    expect(v.keep).toBe(false)
    expect(v.reason).toMatch(/before 2023/)
    expect(v.reason).toMatch(/March 2023/)
    expect(v.reason).toMatch(/no date/)
  })

  it('does not count a post another spark already stands on', async () => {
    const { readSources, sparkVerdict, normaliseUrl } = await import('../lib/studio/audit')
    const text = [
      '* "a" — May 2026 (https://forum.example.com/t/1?utm=x)',
      '* "b" — June 2026 (https://forum.example.com/t/9)',
    ].join('\n')
    const elsewhere = new Set([normaliseUrl('https://www.forum.example.com/t/1/')])
    expect(sparkVerdict(readSources(text, now, elsewhere)).keep).toBe(false)
  })

  it('reads the size line', async () => {
    const { sparkSize } = await import('../lib/studio/spark')
    expect(sparkSize('Landlords lose time.\nSize: Mid — monthly for small landlords')).toBe('Mid')
    expect(sparkSize('**Size:** Big — lots of payers')).toBe('Big')
    expect(sparkSize('* Size: small — one task')).toBe('Small')
    expect(sparkSize('no size')).toBeNull()
  })

  it('looks at three different groups a day, and different ones tomorrow', async () => {
    const { groupsForDay, scoutFocus } = await import('../lib/studio/scoutFocus')
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const today = groupsForDay(list, now)
    const tomorrow = groupsForDay(list, new Date(now.getTime() + 86400000))
    expect(new Set(today).size).toBe(3)
    expect(today).not.toEqual(tomorrow)
    expect(scoutFocus(list, now).split(' || ')).toHaveLength(3)
    expect(scoutFocus(list, now)).toMatch(/2025 or 2026/)
  })
})

describe('the money test', () => {
  it('needs a Paid today line with an amount', async () => {
    const { paidToday, sparkVerdict, readSources } = await import('../lib/studio/audit')
    const now = new Date('2026-10-02T12:00:00Z')
    const quotes = [
      '* "a" — G2 review of ServiceTitan, May 2026 (https://www.g2.com/products/x/reviews/1)',
      '* "b" — r/HVAC, June 2026 (https://www.reddit.com/r/HVAC/comments/1abcdef/x/)',
    ].join('\n')
    const build = 'A quote builder.\nBuild: a form, AI writing and a PDF download.'
    const paid = `Paid today: $245 a month per tech for ServiceTitan (https://example.com/pricing)\n${quotes}\n${build}`
    expect(paidToday(paid)).toMatch(/\$245/)
    expect(paidToday('**Paid today:** they pay a VA £12/hour')).toMatch(/£12/)
    expect(paidToday('Paid today: lots of money')).toBeNull()
    expect(sparkVerdict(readSources(paid, now), paid).keep).toBe(true)
    const unpaid = `${quotes}\n${build}`
    const v = sparkVerdict(readSources(unpaid, now), unpaid)
    expect(v.keep).toBe(false)
    expect(v.reason).toMatch(/pays for this today/)
  })

  it("aims the scout at MyCreativeShop's kinds of customer, and at where their money goes", async () => {
    const { DEFAULT_LOOK_IN, focusFor } = await import('../lib/studio/scoutFocus')
    expect(DEFAULT_LOOK_IN.some((g) => /homeschool|quilters/.test(g))).toBe(false)
    expect(DEFAULT_LOOK_IN.some((g) => /church/.test(g))).toBe(true)
    expect(focusFor('churches')).toMatch(/Upwork|G2|Capterra/)
  })
})

describe('audit leniency where it is earned', () => {
  it('accepts the ways a Paid today line gets written', async () => {
    const { paidToday } = await import('../lib/studio/audit')
    expect(paidToday('Paid today — about $50 a month for Buildium')).toBeTruthy()
    expect(paidToday('* **Paid Today:** 300 dollars per location')).toBeTruthy()
    expect(paidToday('Paid today: VAs at 8/hr on Upwork')).toBeTruthy()
    expect(paidToday('Paid today: a lot')).toBeNull()
  })

  it('does not count the price link as a buyer, and dates undated sources from the page', async () => {
    const { readSources, sparkVerdict, pageDate, normaliseUrl } = await import('../lib/studio/audit')
    const now = new Date('2026-10-02T12:00:00Z')
    const content = [
      'Paid today: $300 a month (https://vendor.example.com/pricing)',
      '* "a" — G2 review, May 2026 (https://www.g2.com/x/1)',
      '* "b" — a contractor forum (https://forum.example.com/t/9)',
      "Build: a checklist that saves each customer's work.",
    ].join('\n')
    expect(readSources(content, now).map((s) => s.url)).not.toContain('https://vendor.example.com/pricing')
    expect(sparkVerdict(readSources(content, now), content).keep).toBe(false)
    const dates = new Map([[normaliseUrl('https://forum.example.com/t/9'), new Date('2026-04-01')]])
    expect(sparkVerdict(readSources(content, now, new Set(), dates), content).keep).toBe(true)
    expect(pageDate('<script>{"datePublished":"2026-03-04T10:00:00Z","dateModified":"2026-09-01"}</script>')?.toISOString().slice(0, 10)).toBe('2026-03-04')
    expect(pageDate('<time datetime="2025-12-01">Dec 1</time><time datetime="2026-02-01">')?.toISOString().slice(0, 10)).toBe('2025-12-01')
    expect(pageDate('<p>no dates</p>')).toBeNull()
  })
})

describe('the build test', () => {
  it('needs a Build line, and rejects tools that need integrations', async () => {
    const { buildProblem } = await import('../lib/studio/audit')
    expect(buildProblem('A bulletin writer.\nBuild: a form, AI writing and a print-ready PDF; saves past issues.')).toBeNull()
    expect(buildProblem('A bulletin writer.')).toMatch(/no "Build:" line/)
    expect(buildProblem('An inbox that auto-replies to tracking questions.\nBuild: connects to Shopify and Gmail to send emails.')).toMatch(/can't do/)
    expect(buildProblem('A reminder tool that sends texts to parents.\nBuild: a form and a schedule.')).toMatch(/can't do/)
    // Quotes can name any software without failing the spark.
    expect(buildProblem('* "We pay for Planning Center and it never syncs" — r/church, May 2026\nA volunteer schedule maker.\nBuild: a planner that saves each church\'s roster and prints a schedule.')).toBeNull()
  })
})
