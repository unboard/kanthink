// One-off: remove Whisker Wilds accounts created during automated verification.
import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const r = await client.execute(
    "DELETE FROM catlife_players WHERE username LIKE 'testkid_%' OR username LIKE 'verifykid_%'"
  );
  console.log('deleted test rows:', r.rowsAffected);
  const left = await client.execute('SELECT username FROM catlife_players');
  console.log('remaining players:', JSON.stringify(left.rows.map((x) => x.username)));
}

main().catch((e) => { console.error(e); process.exit(1); });
