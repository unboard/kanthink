import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const r = await client.execute({
    sql: 'SELECT * FROM channel_data_sources WHERE provider = ?',
    args: ['mixpanel'],
  });

  if (r.rows.length === 0) {
    console.log('No Mixpanel connections found in database.');
    return;
  }

  for (const row of r.rows) {
    console.log('\n=== Mixpanel Connection ===');
    console.log('ID:', row.id);
    console.log('Channel ID:', row.channel_id);
    console.log('Status:', row.status);
    console.log('Has access_token:', !!(row.access_token));
    console.log('Has refresh_token:', !!(row.refresh_token));
    console.log('Token expires:', row.token_expires_at);
    console.log('Now (epoch):', Math.floor(Date.now() / 1000));
    const expired = row.token_expires_at && (row.token_expires_at as number) < Math.floor(Date.now() / 1000);
    console.log('Expired?', expired);
    try {
      const meta = JSON.parse(row.metadata as string || '{}');
      console.log('Region:', meta.region);
      console.log('Project ID:', meta.projectId);
      console.log('Project Name:', meta.projectName);
      console.log('Scope:', meta.scope);
    } catch { console.log('Metadata: parse error'); }
  }
}

main().catch(console.error).finally(() => process.exit(0));
