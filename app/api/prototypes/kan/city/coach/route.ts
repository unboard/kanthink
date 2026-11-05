import { auth } from '@/lib/auth'
import { coachFor, parseCoach, SKILLS } from '@/lib/kan/players'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * A grown-up's notes about one of the girls ("she's working on borrowing in
 * subtraction, gets upset with big numbers, reading's hard so read things to her"),
 * read by Kan into the settings the zoo sizes its questions by.
 *   POST { name, age, notes, coach }  →  { coach }
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { name?: string; age?: number; notes?: string; coach?: unknown }
  const age = Math.round(Math.min(14, Math.max(4, Number(body.age) || 7)))
  const name = String(body.name ?? 'her').slice(0, 40)
  const notes = String(body.notes ?? '').trim().slice(0, 1500)
  const now = parseCoach(body.coach, coachFor(age))
  if (!notes) return Response.json({ coach: { ...now, said: undefined } })

  const { getLLMClientForUser } = await import('@/lib/ai/llm')
  const { client } = await getLLMClientForUser(session.user.id)
  if (!client) return Response.json({ error: 'Kan can’t think right now. Set it with the switches instead.' }, { status: 503 })
  let j: { coach?: unknown } = {}
  try {
    const res = await client.complete([{
      role: 'user',
      content: [
        `You are Kan, helping a parent tune the math in a zoo game for their daughter ${name}, who is ${age}.`,
        'The game asks money and animal math questions (tickets × price, food for each animal, change from a purchase, adding and taking away visitors or fish).',
        `Her settings now: ${JSON.stringify(now)}`,
        `What each setting means:
- skills: which kinds of math to ask, any of ${SKILLS.map((s) => `"${s.id}"`).join(', ')}
- max: the biggest answer a question may have (10 to 100000)
- tables: the times tables she's practicing (1 to 12); a times question keeps one side on these
- readAloud: true to read every question out loud to her
- showHow: true to offer a "how do I work it out?" hint before she answers`,
        `\nThe parent wrote: "${notes}"`,
        '\nChange only what the notes call for, and keep the rest. If the notes ask for something these settings can\'t do, get as close as they allow and say so.',
        'Answer with JSON only: {"coach": {all five settings}, "said": "one or two short, warm sentences to the parent saying what you changed and why, under 40 words"}',
      ].join('\n'),
    }], { maxTokens: 3000 })
    j = JSON.parse(res.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (err) {
    console.error('[zoo] coach', err)
    return Response.json({ error: 'Kan couldn’t work that out. Try saying it another way.' }, { status: 502 })
  }
  const said = typeof (j as { said?: unknown }).said === 'string' ? (j as { said: string }).said : undefined
  return Response.json({ coach: parseCoach({ ...(j.coach as object ?? {}), said }, now) })
}
