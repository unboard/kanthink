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

  const msgs = JSON.parse(r.rows[0].messages as string);
  // Print full content of message 5 (the grounding response)
  console.log('=== MESSAGE 5 FULL CONTENT ===');
  console.log(msgs[5].content);
  console.log('=== END ===');
  console.log('\nAll message types:', msgs.map((m: any) => m.type));
  console.log('Any null content?', msgs.some((m: any) => m.content === null || m.content === undefined));
}

main().catch(console.error).finally(() => process.exit(0));
