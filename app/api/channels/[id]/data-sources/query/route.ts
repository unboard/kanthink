import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

/**
 * POST /api/channels/[id]/data-sources/query
 * Proxy a query to a connected data source's MCP server.
 *
 * Body: { provider: 'mixpanel', tool: 'Run-Query', params: { ... } }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id: channelId } = await params;
  const body = await request.json();
  const { provider, tool, params: toolParams } = body;

  if (!provider || !tool) {
    return NextResponse.json({ error: 'Missing provider or tool' }, { status: 400 });
  }

  // Get the data source connection
  const [source] = await db
    .select()
    .from(channelDataSources)
    .where(and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, provider)))
    .limit(1);

  if (!source || !source.accessToken) {
    return NextResponse.json({ error: `${provider} not connected to this channel` }, { status: 404 });
  }

  if (source.status !== 'active') {
    return NextResponse.json({ error: `${provider} connection is ${source.status}` }, { status: 400 });
  }

  // Check token expiry
  if (source.tokenExpiresAt && source.tokenExpiresAt < Math.floor(Date.now() / 1000)) {
    // TODO: implement token refresh flow
    await db.update(channelDataSources)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(channelDataSources.id, source.id));
    return NextResponse.json({ error: `${provider} token expired — please reconnect` }, { status: 401 });
  }

  // Route to the correct MCP endpoint
  const mcpEndpoints: Record<string, string> = {
    mixpanel: getMixpanelMcpUrl(source.metadata as Record<string, unknown> | null),
  };

  const mcpUrl = mcpEndpoints[provider];
  if (!mcpUrl) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  try {
    // MCP uses JSON-RPC 2.0 format
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: tool,
        arguments: toolParams || {},
      },
    };

    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${source.accessToken}`,
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[MCP/${provider}] Query failed:`, errText);
      return NextResponse.json({ error: `${provider} query failed: ${res.status}` }, { status: res.status });
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[MCP/${provider}] Error:`, err);
    return NextResponse.json({ error: err.message || 'Query failed' }, { status: 500 });
  }
}

function getMixpanelMcpUrl(metadata: Record<string, unknown> | null): string {
  const region = (metadata?.region as string) || 'us';
  switch (region) {
    case 'eu': return 'https://mcp-eu.mixpanel.com/mcp';
    case 'in': return 'https://mcp-in.mixpanel.com/mcp';
    default: return 'https://mcp.mixpanel.com/mcp';
  }
}
