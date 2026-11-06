import type { AttentionDecisionJson } from '@/lib/db/schema'

type PlanArea = AttentionDecisionJson['areas'][number]
type PlanChange = PlanArea['change']
type BotState = { enabled: boolean | null; everyHours: number | null }

const hours = (h: number | undefined) => (!h || h === 24 ? 'once a day' : h === 168 ? 'once a week' : h < 24 ? `every ${h} hours` : `every ${Math.round(h / 24)} days`)
const lower = (s: string) => s.trim().toLowerCase()

/**
 * The plan as cards to answer one at a time, each in a line they can read without
 * knowing what “reshape” means. A keep that switches a bot on or off is a change
 * too, so it gets a card rather than slipping in; a keep that changes nothing they'd
 * see doesn't. What Kan would file into a new space rides on the card that starts it;
 * the rest is one card per place it would go, with every title on it.
 */
export function planCards(d: Pick<AttentionDecisionJson, 'areas' | 'filings'>, botOf: Map<string, BotState>, areaName: Map<string, string>) {
  const cards: (
    | { kind: 'area'; key: string; name: string; change: PlanChange; what: string; why: string; files: string[] }
    | { kind: 'filing'; key: string; to: string; titles: string[] }
  )[] = []
  const starts = new Set(d.areas.filter((a) => a.change === 'start').map((a) => lower(a.name)))
  for (const a of d.areas) {
    const bot = a.channelId ? botOf.get(a.channelId) : undefined
    const wasOn = Boolean(bot?.enabled)
    const willOn = a.attention === 'muted' ? false : a.bot ? a.bot.on : wasOn
    const duty = willOn && !wasOn ? `, and puts its bot to work ${hours(a.bot?.everyHours)}` : !willOn && wasOn ? ', and takes its bot off duty' : ''
    const what = a.change === 'start' ? `Makes a new space for this${willOn ? ` with a bot that works on it ${hours(a.bot?.everyHours)}` : ''}.`
      : a.change === 'reshape' ? `Rewrites what this space is for${a.columns?.length ? ' and adds any missing columns' : ''}${duty}. Nothing in it is deleted.`
      : a.change === 'wake' ? `Brings this space back to the front of the city${duty}.`
      : a.change === 'quiet' ? `Lets this space go quiet in the city${duty}. Nothing in it is deleted.`
      : a.change === 'mute' ? `Fades this space out of the city${duty}. Nothing in it is deleted.`
      : duty ? `Leaves the space as it is${duty}.` : ''
    if (!what) continue
    const files = a.change === 'start' ? d.filings.filter((f) => lower(f.area) === lower(a.name)).map((f) => f.title) : []
    cards.push({ kind: 'area', key: a.name, name: a.name, change: a.change, what, why: a.why, files })
  }
  const by = new Map<string, { key: string; to: string; titles: string[] }>()
  for (const f of d.filings) {
    if (starts.has(lower(f.area))) continue
    const g = by.get(lower(f.area)) ?? { key: f.area, to: areaName.get(f.area) ?? f.area, titles: [] }
    g.titles.push(f.title)
    by.set(lower(f.area), g)
  }
  for (const g of by.values()) cards.push({ kind: 'filing', ...g })
  return cards
}
