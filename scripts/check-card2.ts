import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const r = await client.execute({
    sql: 'SELECT * FROM cards WHERE id = ?',
    args: ['6ujSFd4_yTtSyaI_L9wZc'],
  });

  if (r.rows.length === 0) { console.log('Not found'); return; }
  const card = r.rows[0];
  for (const [key, val] of Object.entries(card)) {
    if (key === 'messages') continue; // already checked
    console.log(`${key}:`, val === null ? 'NULL' : typeof val === 'string' && val.length > 100 ? val.slice(0, 100) + '...' : val);
  }
}

main().catch(console.error).finally(() => process.exit(0));
