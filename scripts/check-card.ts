import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const r = await client.execute({
    sql: 'SELECT messages FROM cards WHERE id = ?',
    args: ['6ujSFd4_yTtSyaI_L9wZc'],
  });

  if (r.rows.length === 0) {
    console.log('Not found');
    return;
  }

  const msgs = JSON.parse(r.rows[0].messages as string);
  console.log('Message count:', msgs.length);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    console.log(`\n--- MSG ${i} ---`);
    console.log('type:', m.type);
    console.log('content length:', m.content?.length);
    console.log('has proposedActions:', !!m.proposedActions, m.proposedActions ? `(${m.proposedActions.length} actions)` : '');
    console.log('has imageUrls:', !!m.imageUrls);
    console.log('content preview:', String(m.content || '').slice(0, 300));
    if (m.proposedActions) {
      console.log('actions detail:', JSON.stringify(m.proposedActions).slice(0, 500));
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
