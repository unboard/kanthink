import { db } from '../lib/db';
import { eq } from 'drizzle-orm';

async function main() {
  // Find the user's BYOK config
  const { users } = await import('../lib/db/schema');
  const allUsers = await db.query.users.findMany({ columns: { id: true, email: true, name: true } });
  console.log('Users:', allUsers.map(u => `${u.name} (${u.email})`));

  // Check what the voice/live endpoint would resolve
  const { getUserByokConfigWithError } = await import('../lib/usage');
  for (const user of allUsers) {
    const result = await getUserByokConfigWithError(user.id);
    console.log(`\nBYOK for ${user.name}:`);
    console.log('  provider:', result.config?.provider || 'none');
    console.log('  has key:', !!result.config?.apiKey);
    console.log('  key prefix:', result.config?.apiKey?.slice(0, 10) || 'N/A');
    console.log('  error:', result.error || 'none');
  }
}

main().catch(console.error).finally(() => process.exit(0));
