import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { rememberTopic, type TopicRole } from '@/lib/kan/attention/topics'

export const runtime = 'nodejs'

const ROLES: TopicRole[] = ['help', 'aware', 'hands_off']

/**
 * POST { name, role, note? } — tell Kan what a project or topic is and the part it
 * plays in it. Anything in the waiting plan that goes against it comes out.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const { name, role, note } = (await req.json().catch(() => ({}))) as { name?: string; role?: TopicRole; note?: string }
  if (!name?.trim() || !role || !ROLES.includes(role)) return Response.json({ error: 'Which topic, and what part should Kan play?' }, { status: 400 })
  const r = await rememberTopic(session.user.id, { name, role, note })
  return Response.json({ topic: { name: r.topic.name, role: r.topic.role, note: r.topic.note }, setAside: r.setAside })
}
