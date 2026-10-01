import { personStage, type StageFacts } from './stage'

/**
 * What the follow-up crew would write to one person next, if anything.
 *
 * Pure, so the rules can be read and tested in one place. Two rules, deliberately
 * few: tell people who reserved that the thing exists, and nudge once if they opened
 * that but never clicked. Anything chattier than that is the kind of email people
 * unsubscribe from, and an unsubscribe costs more than a sale is worth.
 */

export interface FollowUpEmail {
  kind: string
  status: 'draft' | 'sent' | 'dropped' | 'failed'
  sentAt?: Date | null
  openedAt?: Date | null
  clickedAt?: Date | null
}

export interface FollowUpInput {
  member: StageFacts & { name?: string | null }
  app: { title: string; live: boolean; url: string; priceLabel?: string | null }
  emails: FollowUpEmail[]
  publisherName?: string | null
  now: Date
}

export interface FollowUpDraft {
  kind: 'launch' | 'nudge'
  subject: string
  body: string
  reason: string
}

const DAY = 24 * 60 * 60 * 1000
export const NUDGE_AFTER_DAYS = 3

function firstName(name?: string | null) {
  const n = (name || '').trim().split(/\s+/)[0]
  return n && !n.includes('@') ? n : ''
}

export function nextFollowUp(input: FollowUpInput): FollowUpDraft | null {
  const { member, app, emails, now } = input
  if (member.unsubscribedAt) return null
  // One thing waiting at a time. A second draft before the first is decided is noise.
  if (emails.some((e) => e.status === 'draft')) return null
  if (!app.live) return null

  const hi = firstName(member.name) ? `Hi ${firstName(member.name)},` : 'Hi,'
  const sign = firstName(input.publisherName) ? `\n\n${firstName(input.publisherName)}` : ''
  const price = app.priceLabel ? ` It's ${app.priceLabel}.` : ''
  const stage = personStage(member)

  const launch = emails.find((e) => e.kind === 'launch')
  if (member.reservedAt && !launch) {
    return {
      kind: 'launch',
      subject: `${app.title} is ready`,
      body: `${hi}\n\nYou reserved ${app.title} before it existed, so you're hearing first: it's ready.${price}\n\n${app.url}${sign}`,
      reason: 'They reserved it on the test page, and it’s now live.',
    }
  }

  const nudged = emails.some((e) => e.kind === 'nudge')
  if (
    launch && launch.status === 'sent' && launch.sentAt && !launch.clickedAt && !nudged &&
    stage === 'prospect' && now.getTime() - launch.sentAt.getTime() >= NUDGE_AFTER_DAYS * DAY
  ) {
    return {
      kind: 'nudge',
      subject: `Still want ${app.title}?`,
      body: `${hi}\n\nNo pressure at all. ${app.title} is there whenever you want it:\n\n${app.url}\n\nIf it's not what you hoped, just reply and say why. I read every one.${sign}`,
      reason: launch.openedAt
        ? `They opened the launch email ${Math.floor((now.getTime() - launch.sentAt.getTime()) / DAY)} days ago but never clicked.`
        : `The launch email went ${Math.floor((now.getTime() - launch.sentAt.getTime()) / DAY)} days ago and wasn’t opened.`,
    }
  }

  return null
}
