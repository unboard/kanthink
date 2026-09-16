/**
 * Does preflight actually read removal intent correctly?
 *
 * The guard is deterministic and tested. What is not deterministic is the judgement
 * feeding it — so this runs the real preflight against the phrasings that matter and
 * checks what it authorises. A live call, because a mocked one would only prove the
 * mock agrees with me.
 */
import fs from 'fs'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const THREAD = [
  '[question] Build a product launch simulator with AI-generated comments on each post.',
  '[ai_response] Added AI-generated replies that react to the post text and image.',
].join('\n')

interface Case {
  name: string
  prompt: string
  thread?: string
  /** true when the AI comments must survive. */
  mustPreserve: boolean
}

const CASES: Case[] = [
  {
    name: 'a genuine instruction to KEEP the feature',
    prompt: 'Do not remove the AI-generated comments. Just make the header font a bit larger.',
    mustPreserve: true,
  },
  {
    name: 'a genuine instruction about a DIFFERENT feature',
    prompt: 'Get rid of the image upload button entirely, I do not need it.',
    mustPreserve: true,
  },
  {
    name: 'a removal request the user then reversed',
    prompt: 'Actually ignore what I said before — keep the AI comments exactly as they are.',
    thread: THREAD + '\n[question] Take out the AI-generated comments, they cost too much.',
    mustPreserve: true,
  },
  {
    name: 'an unambiguous removal (control — this one SHOULD authorise)',
    prompt: 'Remove the AI-generated comments completely and use a fixed list of replies instead.',
    mustPreserve: false,
  },
]

async function main() {
  const { runPreflight } = await import('../lib/playground/preflight')
  const { RUNTIME_CAPABILITIES, capabilitiesLost } = await import('../lib/playground/capabilityGuard')

  // The owner's stored Gemini key, the same one a real build would use.
  const { resolveProviderKeys } = await import('../lib/ai/keys')
  const { db } = await import('../lib/db')
  const { users } = await import('../lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const owner = await db.query.users.findFirst({ where: eq(users.email, 'dhodg22@gmail.com'), columns: { id: true } })
  if (!owner) { console.log("owner not found"); process.exit(1) }
  const { keys } = await resolveProviderKeys(owner.id)
  const apiKey = keys.google?.apiKey
  if (!apiKey) { console.log("no Google key on the account"); process.exit(1) }
  const WITH_AI = `const r = async () => (await window.kanthinkAI.generate({ prompt: 'x' })).text;`
  const WITHOUT_AI = `const r = () => CANNED[0];`

  let failures = 0
  for (const c of CASES) {
    const result = await runPreflight({
      apiKey,
      prompt: c.prompt,
      cardTitle: 'Product launch simulator',
      hasCurrentCode: true,
      recentThread: c.thread ?? THREAD,
    })
    const authorised = result.requestedRemovals ?? []
    // The question that actually matters: with this authorisation, would dropping
    // the AI calls be allowed through?
    const loss = capabilitiesLost(WITH_AI, WITHOUT_AI, authorised)
    const preserved = loss !== null
    const ok = preserved === c.mustPreserve
    if (!ok) failures++

    console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
    console.log(`      "${c.prompt.slice(0, 82)}"`)
    console.log(`      preflight authorised: ${authorised.length ? JSON.stringify(authorised) : '[]'}`)
    console.log(`      AI comments ${preserved ? 'PRESERVED' : 'REMOVABLE'} (wanted ${c.mustPreserve ? 'PRESERVED' : 'REMOVABLE'})`)
  }

  void RUNTIME_CAPABILITIES
  console.log(failures === 0 ? '\nAll intent checks passed.' : `\n${failures} failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
