/**
 * Setup a Kanthink channel to manage an external project via Claude Code.
 *
 * Usage:
 *   npx tsx scripts/setup-external-project.ts "My Project" [--project-path /c/code/myproject]
 *
 * What it does:
 *   1. Creates a channel in Kanthink with standard columns (Do these, Completed, Raw Ideas, etc.)
 *   2. Prints the channel ID and column IDs
 *   3. If --project-path is provided, generates .claude/commands/kan.md in that project
 */

import { createClient } from '@libsql/client'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

// ── Load env from .env.local ────────────────────────────────────────
function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

const env = loadEnv()
const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

const DEFAULT_COLUMNS = [
  { name: 'Do these', position: 0 },
  { name: 'In Progress', position: 1 },
  { name: 'Completed', position: 2 },
  { name: 'Raw Ideas', position: 3 },
]

async function getOwnerUserId(): Promise<string> {
  // Find the first non-agent user (the actual human owner)
  const res = await db.execute({
    sql: `SELECT id FROM users WHERE id NOT LIKE 'kan-%' ORDER BY created_at ASC LIMIT 1`,
    args: [],
  })
  if (res.rows.length === 0) {
    console.error('No users found in the database. Sign in to Kanthink first.')
    process.exit(1)
  }
  return res.rows[0].id as string
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: npx tsx scripts/setup-external-project.ts "Project Name" [--project-path /path/to/project]')
    console.log('')
    console.log('Creates a Kanthink channel for managing an external project with Claude Code.')
    console.log('')
    console.log('Options:')
    console.log('  --project-path <path>  Generate .claude/commands/kan.md in the target project')
    process.exit(0)
  }

  const projectName = args[0]
  const pathIdx = args.indexOf('--project-path')
  const projectPath = pathIdx !== -1 ? args[pathIdx + 1] : null

  // Get the absolute path to the Kanthink repo (parent of scripts/)
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const kanthinkRoot = resolve(scriptDir, '..')

  console.log(`Creating Kanthink channel for: ${projectName}`)
  console.log()

  const ownerId = await getOwnerUserId()

  // Create the channel
  const channelId = crypto.randomUUID()
  const nowEpoch = Math.floor(Date.now() / 1000)

  await db.execute({
    sql: `INSERT INTO channels (id, name, description, created_at, updated_at, owner_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [channelId, projectName, `Work channel for ${projectName} — managed by Claude Code`, nowEpoch, nowEpoch, ownerId],
  })

  // Create columns
  const columnIds: Record<string, string> = {}
  for (const col of DEFAULT_COLUMNS) {
    const colId = crypto.randomUUID()
    columnIds[col.name] = colId
    await db.execute({
      sql: `INSERT INTO columns (id, channel_id, name, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [colId, channelId, col.name, col.position, nowEpoch, nowEpoch],
    })
  }

  // Create user_channel_org entry
  await db.execute({
    sql: `INSERT INTO user_channel_org (id, user_id, channel_id, channel_order, folder_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    args: [crypto.randomUUID(), ownerId, channelId, 0, nowEpoch, nowEpoch],
  })

  console.log(`Channel created!`)
  console.log(`  Channel ID:    ${channelId}`)
  console.log(`  Do these:      ${columnIds['Do these']}`)
  console.log(`  In Progress:   ${columnIds['In Progress']}`)
  console.log(`  Completed:     ${columnIds['Completed']}`)
  console.log(`  Raw Ideas:     ${columnIds['Raw Ideas']}`)
  console.log()

  // Generate the kan.md command file for the target project
  const kanCommand = generateKanCommand(channelId, kanthinkRoot, projectName)

  if (projectPath) {
    const commandDir = resolve(projectPath, '.claude', 'commands')
    mkdirSync(commandDir, { recursive: true })
    const commandFile = resolve(commandDir, 'kan.md')
    writeFileSync(commandFile, kanCommand)
    console.log(`Generated: ${commandFile}`)
    console.log()
    console.log(`Setup complete! In your project, run: /kan`)
    console.log(`Or add to a loop: /loop 10m /kan`)
  } else {
    console.log(`── .claude/commands/kan.md (copy this to your project) ──`)
    console.log()
    console.log(kanCommand)
  }
}

function generateKanCommand(channelId: string, kanthinkRoot: string, projectName: string): string {
  // Normalize to forward slashes for the script
  const scriptPath = resolve(kanthinkRoot, 'scripts', 'kan.ts').replace(/\\/g, '/')

  return `Read and implement cards from the ${projectName} Kanthink channel.

## Workflow

1. Run the card reader script to fetch cards from the "Do these" column:
   \`\`\`
   npx tsx "${scriptPath}" --channel ${channelId}
   \`\`\`

2. If there are **no cards** in the column, say "No cards in queue" and stop. Do NOT commit, push, or deploy anything.

3. Review each card. Cards contain:
   - A title (the bug/feature name)
   - Thread messages with details (may include image URLs — read images with the Read tool)
   - The card ID (needed to move it and to add notes)

4. For each card, **tag it as "Processing"** before starting work, then implement the fix or feature. If a card is unclear, ask the user before proceeding.
   \`\`\`
   npx tsx "${scriptPath}" --channel ${channelId} --tag <cardId> Processing
   \`\`\`

5. After implementing a card's fix:
   a. **Add a note to the card thread** summarizing what was done (2-3 sentences max):
      \`\`\`
      npx tsx "${scriptPath}" --channel ${channelId} --note <cardId> <short summary>
      \`\`\`
   b. **Remove the "Processing" tag**:
      \`\`\`
      npx tsx "${scriptPath}" --channel ${channelId} --untag <cardId> Processing
      \`\`\`
   c. **Move it to "Completed"**:
      \`\`\`
      npx tsx "${scriptPath}" --channel ${channelId} --move <cardId>
      \`\`\`
   **Move cards one at a time, sequentially.**

6. Once all cards are done, commit the changes and push to deploy.

## Important: Timestamp format

The \`--move\` and \`--note\` commands use direct DB access. Timestamps must be epoch integers (e.g. \`Math.floor(Date.now() / 1000)\`). Never use ISO strings.

$ARGUMENTS
`
}

main().catch(err => { console.error(err); process.exit(1) })
