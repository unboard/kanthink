import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Get the Mixpanel connection
  const r = await client.execute({
    sql: 'SELECT access_token, metadata FROM channel_data_sources WHERE provider = ? AND status = ?',
    args: ['mixpanel', 'active'],
  });

  if (r.rows.length === 0) {
    console.log('No active Mixpanel connection.');
    return;
  }

  const token = r.rows[0].access_token as string;
  const metadata = JSON.parse(r.rows[0].metadata as string || '{}');
  const region = metadata.region || 'us';
  const mcpUrl = region === 'eu' ? 'https://mcp-eu.mixpanel.com/mcp'
    : region === 'in' ? 'https://mcp-in.mixpanel.com/mcp'
    : 'https://mcp.mixpanel.com/mcp';

  console.log('MCP URL:', mcpUrl);
  console.log('Token prefix:', token.slice(0, 20) + '...');

  // Test 1: List projects
  console.log('\n--- Testing Get-Projects ---');
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'Get-Projects', arguments: {} },
      }),
    });

    console.log('Status:', res.status);
    const text = await res.text();

    // Parse SSE or JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      const lines = text.split('\n').filter((l: string) => l.startsWith('data: '));
      const last = lines[lines.length - 1];
      if (last) data = JSON.parse(last.slice(6));
    }

    if (data?.result?.content) {
      const content = data.result.content.map((c: { text?: string }) => c.text || '').join('');
      const projects = JSON.parse(content);
      console.log('Projects found:', Object.keys(projects).length);
      for (const [id, proj] of Object.entries(projects) as [string, { name: string }][]) {
        console.log(`  - ${proj.name} (ID: ${id})`);
      }
    } else if (data?.error) {
      console.log('Error:', JSON.stringify(data.error));
    } else {
      console.log('Raw response:', text.slice(0, 500));
    }
  } catch (err) {
    console.error('Fetch failed:', (err as Error).message);
  }
}

main().catch(console.error).finally(() => process.exit(0));
