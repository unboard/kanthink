import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface DataSourceInfo {
  provider: string;
  status: string;
  hasToken: boolean;
}

/**
 * Get connected data sources for a channel.
 * Returns a list of provider info (without tokens).
 */
export async function getChannelDataSources(channelId: string): Promise<DataSourceInfo[]> {
  try {
    const sources = await db
      .select({
        provider: channelDataSources.provider,
        status: channelDataSources.status,
        accessToken: channelDataSources.accessToken,
      })
      .from(channelDataSources)
      .where(eq(channelDataSources.channelId, channelId));

    return sources.map(s => ({
      provider: s.provider,
      status: s.status || 'active',
      hasToken: !!s.accessToken,
    }));
  } catch {
    return [];
  }
}

/**
 * Build AI context string describing available data sources.
 * This gets appended to AI system prompts when data sources are connected.
 */
export function buildDataSourcePromptContext(sources: DataSourceInfo[]): string {
  const active = sources.filter(s => s.status === 'active' && s.hasToken);
  if (active.length === 0) return '';

  const parts: string[] = [
    '\n\n--- DATA SOURCES ---',
    'This channel has the following data sources connected:',
  ];

  for (const source of active) {
    if (source.provider === 'mixpanel') {
      parts.push(`- **Mixpanel**: Connected and live. When the user asks about analytics, metrics, events, funnels, retention, or uses @mixpanel, real Mixpanel data will be injected into this conversation automatically. Use that data to give concrete answers with real numbers. Don't tell the user to go check Mixpanel — you have the data.

When you have time-series or numerical data to display, include a chart using this format:
\`\`\`chart
{"type":"area","title":"Chart Title","data":[{"label":"Mon","value":120},{"label":"Tue","value":150}],"color":"violet","label":"Users"}
\`\`\`
Chart types: "area", "bar", "line". Colors: "violet", "blue", "green", "orange", "pink". For two series, add "value2", "color2", "label2". Place the chart block after your text explanation.`);
    }
  }

  parts.push('When the user references connected data sources or uses @mentions (e.g. @mixpanel), acknowledge the connection and help them use it effectively.');

  return parts.join('\n');
}

/**
 * Detect if a message is asking for Mixpanel data.
 */
export function detectsMixpanelIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('@mixpanel') ||
    (lower.includes('mixpanel') && (
      lower.includes('how many') || lower.includes('show me') || lower.includes('what') ||
      lower.includes('query') || lower.includes('data') || lower.includes('analytics')
    ));
}

/**
 * Build a Mixpanel MCP query based on the user's natural language question.
 * Uses the LLM to translate the question into MCP tool params, then calls the MCP proxy.
 */
export async function queryMixpanelForChat(
  channelId: string,
  userQuestion: string,
): Promise<string> {
  try {
    // Get the stored token
    const [source] = await db
      .select()
      .from(channelDataSources)
      .where(and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, 'mixpanel')))
      .limit(1);

    if (!source?.accessToken || source.status !== 'active') {
      return '';
    }

    // Check token expiry
    if (source.tokenExpiresAt && source.tokenExpiresAt < Math.floor(Date.now() / 1000)) {
      return '[Mixpanel token expired — user needs to reconnect in channel settings]';
    }

    // Query Mixpanel MCP for available events first
    const metadata = source.metadata as Record<string, unknown> | null;
    const region = (metadata?.region as string) || 'us';
    const mcpUrl = region === 'eu' ? 'https://mcp-eu.mixpanel.com/mcp'
      : region === 'in' ? 'https://mcp-in.mixpanel.com/mcp'
      : 'https://mcp.mixpanel.com/mcp';

    // Try to get events list for context
    const eventsRes = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${source.accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'Get-Events', arguments: {} },
      }),
    });

    let eventsContext = '';
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json();
      const content = eventsData?.result?.content;
      if (content && Array.isArray(content)) {
        const text = content.map((c: { text?: string }) => c.text || '').join('\n');
        eventsContext = text.slice(0, 2000);
      }
    }

    // Now try to run a query based on the user's question
    const queryRes = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${source.accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now() + 1,
        method: 'tools/call',
        params: {
          name: 'Run-Query',
          arguments: {
            query_description: userQuestion.replace(/@mixpanel/gi, '').trim(),
          },
        },
      }),
    });

    let queryResult = '';
    if (queryRes.ok) {
      const queryData = await queryRes.json();
      const content = queryData?.result?.content;
      if (content && Array.isArray(content)) {
        queryResult = content.map((c: { text?: string }) => c.text || '').join('\n').slice(0, 3000);
      } else if (queryData?.error) {
        queryResult = `Mixpanel query error: ${queryData.error.message || JSON.stringify(queryData.error)}`;
      }
    }

    if (!eventsContext && !queryResult) return '';

    const parts = ['\n\n--- MIXPANEL DATA ---'];
    if (eventsContext) parts.push(`Available events:\n${eventsContext}`);
    if (queryResult) parts.push(`Query results:\n${queryResult}`);
    parts.push('\nUse this real data to answer the user\'s question. Present numbers clearly and concisely.');
    return parts.join('\n');
  } catch (err) {
    console.error('[Mixpanel Query] Error:', err);
    return '[Failed to query Mixpanel — connection may need to be refreshed]';
  }
}
