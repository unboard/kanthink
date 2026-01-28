import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

const email = process.argv[2]

if (!email) {
  console.error('Usage: npx tsx scripts/set-admin.ts <email>')
  process.exit(1)
}

async function setAdmin() {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (!user) {
    console.error(`User with email ${email} not found`)
    process.exit(1)
  }

  await db.update(users)
    .set({ isAdmin: true, updatedAt: new Date() })
    .where(eq(users.email, email))

  console.log(`✓ Set ${email} as admin`)
  console.log(`  User ID: ${user.id}`)
  console.log(`  Name: ${user.name}`)
}

setAdmin().catch(console.error)
