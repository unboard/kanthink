import { kanwatchUser } from '@/lib/kanwatch/access'
import { actOnDayCard, dayBoardFor } from '@/lib/kanwatch/freeway'

export const runtime = 'nodejs'
// The first visit to a day writes its board: one LLM call.
export const maxDuration = 90

const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

/** GET ?date=YYYY-MM-DD[&refresh=1] — the day's board, written the first time you go in. */
export async function GET(req: Request) {
  const userId = await kanwatchUser()
  if (!userId) return Response.json({ error: 'Not available' }, { status: 403 })
  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  if (!isDate(date)) return Response.json({ error: 'Bad date' }, { status: 400 })
  const board = await dayBoardFor(userId, date, { refresh: url.searchParams.get('refresh') === '1' })
  if (!board) return Response.json({ error: 'There isn’t enough in that day to sort.' }, { status: 404 })
  return Response.json({ board })
}

/** POST {date, cardId, action: send|done|drop|reopen, channelId?} — handle one of the day's cards. */
export async function POST(req: Request) {
  const userId = await kanwatchUser()
  if (!userId) return Response.json({ error: 'Not available' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (!isDate(b.date) || typeof b.cardId !== 'string' || !['send', 'done', 'drop', 'reopen'].includes(b.action)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  const r = await actOnDayCard(userId, b.date, b.cardId, b.action, typeof b.channelId === 'string' ? b.channelId : undefined)
  if ('error' in r) return Response.json(r, { status: 400 })
  return Response.json(r)
}
