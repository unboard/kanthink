import { db } from '@/lib/db'
import { personNotes } from '@/lib/db/schema'
import { getLLMClientForUser } from '@/lib/ai/llm'
import { recordUsage } from '@/lib/usage'
import { createDraft, personDetail, loadMember } from './people'
import { publisherName } from './pipeline'
import { STAGE_LABEL } from './stage'

/**
 * The private side conversation about one person.
 *
 * You say what you want ("thank her", "ask why she didn't buy"); Kan answers here,
 * and when it writes an email it comes back as a draft attached to Kan's reply —
 * never sent. Sending is a separate request that only a button makes.
 */

const SYSTEM = `You are Kan, helping the person who made a small web app talk to one of its users.

This conversation is PRIVATE. The user of the app never sees it. Only emails you write as a draft can reach them, and only after the maker presses Send.

When the maker asks for an email, write one. Otherwise answer briefly.

Email rules:
- Sound like the maker writing personally: short, warm, plain. No marketing voice, no exclamation marks, no emoji.
- Use the person's first name if you know it. Sign off with the maker's first name.
- 40 to 120 words. Put any link on its own line.
- Never invent facts, features, discounts or deadlines that aren't in the context.
- Never pressure. One clear ask at most.

Respond with JSON only:
{"reply": "what you say to the maker, one or two sentences", "email": {"subject": "...", "body": "..."} }
Leave out "email" when no email was asked for.`

export async function askKanAboutPerson(ownerId: string, appUserId: string, message: string) {
  const found = await loadMember(ownerId, appUserId)
  if (!found) throw new Error('Person not found')
  const detail = await personDetail(ownerId, appUserId)
  if (!detail) throw new Error('Person not found')
  const text = message.trim().slice(0, 2000)
  if (!text) throw new Error('Say what you want Kan to do.')

  await db.insert(personNotes).values({ id: crypto.randomUUID(), appUserId, ownerId, role: 'you', content: text, createdAt: new Date() })

  const me = await publisherName(ownerId)
  const p = detail.person
  const history = detail.thread.slice(-12).map((t) =>
    t.kind === 'event' ? `- ${t.at.slice(0, 10)} ${t.text}`
    : t.kind === 'email' ? `- ${t.at.slice(0, 10)} Maker emailed: "${t.email.subject}" — ${t.email.body.slice(0, 300)}${t.email.openedAt ? ' (opened)' : ''}${t.email.clickedAt ? ' (clicked)' : ''}`
    : t.kind === 'theirs' ? `- ${t.at.slice(0, 10)} They wrote in the app: ${t.text.slice(0, 400)}`
    : `- ${t.at.slice(0, 10)} Maker replied in the app: ${t.text.slice(0, 300)}`,
  ).join('\n')
  const side = detail.side.slice(-8).map((s) => `${s.role === 'you' ? 'Maker' : 'Kan'}: ${s.content.slice(0, 400)}`).join('\n')

  const context = `Maker: ${me.name || 'the maker'}
App: ${p.appTitle}${p.appUrl ? ` (${p.appUrl})` : ''}${p.live ? ', live' : ', not live yet (test page)'}${p.priceLabel ? `, ${p.priceLabel}` : ''}
Person: ${p.name || 'unknown name'} <${p.email}>, stage: ${STAGE_LABEL[p.stage]}${p.unsubscribed ? ', UNSUBSCRIBED — do not write them an email; tell the maker why' : ''}

Their history:
${history || '(nothing yet)'}

Earlier in this private conversation:
${side || '(nothing)'}`

  const llmResult = await getLLMClientForUser(ownerId, undefined, 'chat')
  if (!llmResult.client) throw new Error(llmResult.error || 'No AI access available.')
  const response = await llmResult.client.complete([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${context}\n\nThe maker says: ${text}` },
  ])
  if (llmResult.source === 'owner') await recordUsage(ownerId, 'people-kan').catch(() => {})

  const parsed = parseReply(response.content)
  let emailId: string | null = null
  if (parsed.email && !found.member.unsubscribedAt) {
    const draft = await createDraft({ ownerId, member: found.member, subject: parsed.email.subject, body: parsed.email.body, source: 'kan' })
    emailId = draft.id
  }
  await db.insert(personNotes).values({
    id: crypto.randomUUID(), appUserId, ownerId, role: 'kan',
    content: parsed.reply || (emailId ? 'Here’s a draft. Nothing goes to them until you press Send.' : 'Done.'),
    emailId, createdAt: new Date(),
  })
  return personDetail(ownerId, appUserId)
}

export function parseReply(raw: string): { reply: string; email?: { subject: string; body: string } } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as { reply?: string; email?: { subject?: string; body?: string } }
      const email = obj.email?.subject && obj.email?.body ? { subject: String(obj.email.subject), body: String(obj.email.body) } : undefined
      return { reply: String(obj.reply || ''), email }
    } catch { /* fall through */ }
  }
  return { reply: cleaned.slice(0, 600) }
}
