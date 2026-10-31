import { auth } from '@/lib/auth'
import { ensureSchema } from '@/lib/db/ensure-schema'
import { openChat, say } from '@/lib/kan/city/talk'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST — talk with a bot who lives in the city.
 *   { channelId, action: 'open' }        the conversation you're in, or a new one it opens with a question
 *   { channelId, action: 'new' }         a fresh conversation
 *   { channelId, action: 'say', text }   say something; it answers, and acts if you asked it to
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureSchema()
  const body = await req.json().catch(() => ({})) as { channelId?: string; action?: string; text?: string }
  if (!body.channelId) return Response.json({ error: 'Which bot?' }, { status: 400 })
  const userId = session.user.id
  const out = body.action === 'say'
    ? (body.text?.trim() ? await say(userId, body.channelId, body.text.trim()) : { error: 'Say something.' })
    : await openChat(userId, body.channelId, { fresh: body.action === 'new' })
  if ('error' in out) return Response.json(out, { status: 400 })
  return Response.json(out)
}
