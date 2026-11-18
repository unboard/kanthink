import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { botApprovals, channels, playgroundApps } from '@/lib/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { resolveProviderKeys } from '@/lib/ai/keys'
import { appLink, estimatesFor } from '@/lib/kan/bots/approvals'

/**
 * GET — what your bots are waiting on you for, newest first, plus the last few
 * decided. Each pending one carries its cost on every model you could swap it to.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const userId = session.user.id
  const [rows, { keys }] = await Promise.all([
    db.query.botApprovals.findMany({ where: eq(botApprovals.ownerId, userId), orderBy: [desc(botApprovals.createdAt)], limit: 40 }),
    resolveProviderKeys(userId),
  ])
  const ids = [...new Set(rows.map((r) => r.channelId))]
  const names = ids.length ? await db.query.channels.findMany({ where: inArray(channels.id, ids), columns: { id: true, name: true } }) : []
  const nameOf = new Map(names.map((c) => [c.id, c.name]))
  // A build proposed after you asked this bot for a tool is the tool: no point asking again.
  const askedForTool = (r: (typeof rows)[number]) => rows.some((x) => x.channelId === r.channelId && x.status === 'rejected' && (x.reason ?? '').startsWith('Make it a reusable tool') && +(x.decidedAt ?? 0) <= +(r.createdAt ?? 0))
  const appIds = [...new Set(rows.map((r) => r.appId).filter((x): x is string => !!x))]
  const apps = appIds.length ? await db.query.playgroundApps.findMany({ where: inArray(playgroundApps.id, appIds), columns: { id: true, title: true, shareToken: true, isPublic: true } }) : []
  const appOf = new Map(apps.map((a) => [a.id, a]))
  const providers = (['google', 'openai', 'anthropic'] as const).filter((p) => keys[p])
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'approved')
  const decided = rows.filter((r) => r.status !== 'pending' && r.status !== 'approved').slice(0, 10)
  return Response.json({
    approvals: await Promise.all([...open, ...decided].map(async (r) => ({
      ...r,
      channelName: nameOf.get(r.channelId) ?? 'A bot',
      models: r.status === 'pending' && r.kind === 'build_app' ? await estimatesFor(r, providers) : [],
      isTool: r.kind === 'build_app' && askedForTool(r),
      app: r.appId && appOf.get(r.appId) ? { id: r.appId, title: appOf.get(r.appId)!.title, href: appLink(appOf.get(r.appId)!, r.input) } : null,
    }))),
  })
}
