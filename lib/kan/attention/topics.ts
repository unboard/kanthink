import { db } from '@/lib/db'
import { attentionPasses, kanTopics, type AttentionDecisionJson } from '@/lib/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'

/**
 * What the owner has told Kan about the things on their mind, and the part Kan
 * plays in each. Kan's passes are allowed to notice anything; this is what keeps
 * noticing from turning into building something they're already building elsewhere.
 *
 * - help: give it an area, run a bot, build for it.
 * - aware: know about it, be curious, connect it to other things, talk about it.
 *   Never start an area, run a bot or build for it.
 * - hands_off: leave it out of the plan and don't bring it up.
 */

export type TopicRole = 'help' | 'aware' | 'hands_off'
export type Topic = typeof kanTopics.$inferSelect

export const ROLE_LABEL: Record<TopicRole, string> = {
  help: 'Kan helps build it',
  aware: 'Kan knows about it, doesn’t build it',
  hands_off: 'Kan leaves it alone',
}

const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Whether a name in a plan is about this topic: either one contains the other. */
export function isAbout(name: string, topic: string): boolean {
  const a = squash(name)
  const b = squash(topic)
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a))
}

export async function listTopics(ownerId: string): Promise<Topic[]> {
  return db.query.kanTopics.findMany({ where: eq(kanTopics.ownerId, ownerId), orderBy: [asc(kanTopics.name)] })
}

/** For prompts: one line per topic, in the owner's words. */
export function describeTopics(topics: Topic[]): string {
  return topics.map((t) => `- ${t.name}: ${ROLE_LABEL[t.role]}.${t.note ? ` They said: "${t.note}"` : ''}`).join('\n')
}

/**
 * Remember what they said about a topic, and take it out of any plan still waiting
 * that would do what they just said not to. Returns what changed in the plan.
 */
export async function rememberTopic(ownerId: string, input: { name: string; role: TopicRole; note?: string | null }): Promise<{ topic: Topic; setAside: string[] }> {
  const name = input.name.trim().slice(0, 80)
  const key = keyOf(name)
  const note = input.note?.trim().slice(0, 600) || null
  const now = new Date()
  const existing = await db.query.kanTopics.findFirst({ where: and(eq(kanTopics.ownerId, ownerId), eq(kanTopics.key, key)) })
  let topic: Topic
  if (existing) {
    ;[topic] = await db.update(kanTopics).set({ name, role: input.role, note: note ?? existing.note, updatedAt: now }).where(eq(kanTopics.id, existing.id)).returning()
  } else {
    ;[topic] = await db.insert(kanTopics).values({ ownerId, name, key, role: input.role, note, createdAt: now, updatedAt: now }).returning()
  }
  return { topic, setAside: await fitPlanToTopic(ownerId, topic) }
}

export async function forgetTopic(ownerId: string, name: string): Promise<boolean> {
  const r = await db.delete(kanTopics).where(and(eq(kanTopics.ownerId, ownerId), eq(kanTopics.key, keyOf(name)))).returning({ id: kanTopics.id })
  return r.length > 0
}

/** Drop from the waiting plan whatever goes against what they said about this topic. */
async function fitPlanToTopic(ownerId: string, topic: Topic): Promise<string[]> {
  const pass = (await db.query.attentionPasses.findMany({
    where: and(eq(attentionPasses.ownerId, ownerId), eq(attentionPasses.status, 'done')),
    orderBy: [desc(attentionPasses.startedAt)],
    limit: 3,
  })).find((p) => !p.appliedAt && !p.decisions?.dismissed)
  const d = pass?.decisions as AttentionDecisionJson | null | undefined
  if (!pass || !d) return []
  const fitted = fitDecisions(d, [topic])
  if (fitted.removed.length || (d.questions?.length ?? 0) !== (fitted.decisions.questions?.length ?? 0)) {
    await db.update(attentionPasses).set({ decisions: fitted.decisions }).where(eq(attentionPasses.id, pass.id))
  }
  return fitted.removed
}

/**
 * A plan with everything that goes against what they told Kan taken out. Pure, so
 * the pass can apply it to fresh decisions and the apply step can apply it again.
 */
export function fitDecisions(d: AttentionDecisionJson, topics: Topic[]): { decisions: AttentionDecisionJson; removed: string[] } {
  const removed: string[] = []
  const setAside = [...(d.setAside ?? [])]
  const why = (t: Topic) => t.note || ROLE_LABEL[t.role]
  const limiting = topics.filter((t) => t.role !== 'help')
  const dropped = new Set<string>()

  const areas = d.areas.flatMap((a) => {
    const t = limiting.find((x) => isAbout(a.name, x.name))
    if (!t) return [a]
    if (a.change === 'start' || a.change === 'reshape') {
      dropped.add(a.name.trim().toLowerCase())
      removed.push(a.name)
      setAside.push({ name: a.name, why: why(t) })
      return []
    }
    // An area that already exists keeps its place; it just gets no bot.
    return a.bot?.on ? [{ ...a, bot: { on: false } }] : [a]
  })
  const filings = d.filings.filter((f) => {
    if (dropped.has(f.area.trim().toLowerCase())) return false
    return !limiting.some((t) => t.role === 'hands_off' && isAbout(f.area, t.name))
  })
  const questions = (d.questions ?? []).filter((q) => !topics.some((t) => isAbout(q.topic, t.name)))
  return { decisions: { ...d, areas, filings, questions, setAside }, removed }
}
