import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botRuns, channelBots, channels } from '@/lib/db/schema'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { limitsFor, monthStart, saveLimits } from '@/lib/kan/bots/spend'

const DAY_MS = 86400_000
const HISTORY_DAYS = 14

interface Tally {
  total: number
  thinking: number
  builds: number
  rehearsals: number
  runs: number
  handoffs: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
}

const empty = (): Tally => ({ total: 0, thinking: 0, builds: 0, rehearsals: 0, runs: 0, handoffs: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 })

/** The day a moment falls on, in the owner's own time zone. */
function dayKey(at: Date, timeZone?: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/**
 * GET — what every bot has spent: the last 24 hours, 7 days and this month, broken
 * out into thinking, builds and rehearsals, plus a day-by-day history and the owner's
 * ceilings. Amounts are millicents.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const now = new Date()
  const owner = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId), columns: { timezone: true } })

  const since = new Date(Math.min(monthStart(now).getTime(), now.getTime() - HISTORY_DAYS * DAY_MS))
  const [limits, runs, bots] = await Promise.all([
    limitsFor(userId),
    db.query.botRuns.findMany({
      where: and(eq(botRuns.ownerId, userId), gt(botRuns.startedAt, since)),
      columns: {
        channelId: true, trigger: true, costMillicents: true, buildMillicents: true, handoffs: true,
        inputTokens: true, cachedTokens: true, outputTokens: true, startedAt: true,
      },
    }),
    db.query.channelBots.findMany({ where: eq(channelBots.ownerId, userId) }),
  ])
  const ids = [...new Set([...bots.map((b) => b.channelId), ...runs.map((r) => r.channelId)])]
  const names = ids.length
    ? await db.query.channels.findMany({ where: inArray(channels.id, ids), columns: { id: true, name: true } })
    : []
  const nameOf = new Map(names.map((c) => [c.id, c.name]))

  const windows = { day: now.getTime() - DAY_MS, week: now.getTime() - 7 * DAY_MS, month: monthStart(now).getTime() }
  const perBot = new Map<string, Record<keyof typeof windows, Tally>>()
  const totals: Record<keyof typeof windows, Tally> = { day: empty(), week: empty(), month: empty() }
  const days = new Map<string, Record<string, number>>()

  for (const r of runs) {
    const at = +(r.startedAt ?? 0)
    const cost = r.costMillicents ?? 0
    const builds = r.buildMillicents ?? 0
    const entry = perBot.get(r.channelId) ?? { day: empty(), week: empty(), month: empty() }
    perBot.set(r.channelId, entry)
    for (const w of Object.keys(windows) as (keyof typeof windows)[]) {
      if (at <= windows[w]) continue
      for (const t of [entry[w], totals[w]]) {
        t.total += cost
        t.builds += builds
        t.thinking += cost - builds
        if (r.trigger === 'rehearsal') t.rehearsals += cost
        t.runs++
        t.handoffs += r.handoffs ?? 0
        t.inputTokens += r.inputTokens ?? 0
        t.cachedTokens += r.cachedTokens ?? 0
        t.outputTokens += r.outputTokens ?? 0
      }
    }
    if (at > now.getTime() - HISTORY_DAYS * DAY_MS) {
      const key = dayKey(new Date(at), owner?.timezone)
      const day = days.get(key) ?? {}
      day[r.channelId] = (day[r.channelId] ?? 0) + cost
      days.set(key, day)
    }
  }

  const history: { date: string; byBot: Record<string, number> }[] = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const key = dayKey(new Date(now.getTime() - i * DAY_MS), owner?.timezone)
    if (!history.some((h) => h.date === key)) history.push({ date: key, byBot: days.get(key) ?? {} })
  }

  const botOf = new Map(bots.map((b) => [b.channelId, b]))
  const list = ids
    .map((id) => ({
      channelId: id,
      name: nameOf.get(id) ?? 'Deleted channel',
      enabled: Boolean(botOf.get(id)?.enabled),
      dailyBudgetCents: botOf.get(id)?.dailyBudgetCents ?? 200,
      ...(perBot.get(id) ?? { day: empty(), week: empty(), month: empty() }),
    }))
    .filter((b) => b.enabled || b.month.runs > 0)
    .sort((a, b) => b.month.total - a.month.total || Number(b.enabled) - Number(a.enabled))

  return Response.json({
    limits: { dailyCapCents: limits.dailyCapCents, monthlyCapCents: limits.monthlyCapCents, perRunCapCents: limits.perRunCapCents },
    totals,
    bots: list,
    history,
  })
}

/** PATCH { dailyCapCents?, monthlyCapCents?, perRunCapCents? } — the owner's ceilings. */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const clamp = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined)
  const set = {
    dailyCapCents: clamp(body.dailyCapCents, 0, 100_000),
    monthlyCapCents: clamp(body.monthlyCapCents, 0, 1_000_000),
    perRunCapCents: clamp(body.perRunCapCents, 10, 1_000),
  }
  const clean = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined))
  if (!Object.keys(clean).length) return Response.json({ error: 'Nothing to change' }, { status: 400 })
  await saveLimits(session.user.id, clean)
  return Response.json({ ok: true })
}
