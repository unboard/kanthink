import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botRuns, channels } from '@/lib/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { afterResponse } from '@/lib/afterResponse'
import { runBot } from '@/lib/kan/bots/run'

export const runtime = 'nodejs'
export const maxDuration = 800

/**
 * POST { rehearsal?: boolean } — run the bot now. Answers at once with the run's id;
 * the run carries on after the response and the log page follows it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { channelId } = await params
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId), columns: { ownerId: true } })
  if (!channel || channel.ownerId !== session.user.id) {
    return Response.json({ error: 'Only the channel’s owner can run its bot.' }, { status: 403 })
  }

  const running = await db.query.botRuns.findFirst({
    // An approved build running on its own doesn't stop the bot from running.
    where: and(eq(botRuns.channelId, channelId), eq(botRuns.status, 'running'), ne(botRuns.trigger, 'build')),
    columns: { id: true, startedAt: true },
  })
  // A run older than the function ceiling was cut off; it mustn't block new runs forever.
  if (running && Date.now() - +(running.startedAt ?? 0) < 15 * 60_000) return Response.json({ runId: running.id, already: true })

  const { rehearsal, tellChat } = (await req.json().catch(() => ({}))) as { rehearsal?: boolean; tellChat?: boolean }
  const runId = crypto.randomUUID()
  afterResponse(async () => {
    await runBot(channelId, { trigger: rehearsal ? 'rehearsal' : 'manual', runId, tellChat: Boolean(tellChat) && !rehearsal })
  })
  return Response.json({ runId })
}

/** GET ?runId= — how a run is going, step by step, so you can watch it work. */
export async function GET(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { channelId } = await params
  const runId = new URL(req.url).searchParams.get('runId') ?? ''
  const run = await db.query.botRuns.findFirst({ where: and(eq(botRuns.id, runId), eq(botRuns.channelId, channelId)), columns: { ownerId: true, status: true, steps: true } })
  if (!run || run.ownerId !== session.user.id) return Response.json({ status: 'starting', steps: [] })
  return Response.json({ status: run.status, steps: (run.steps ?? []).map((s) => ({ label: s.label, status: s.status })) })
}
