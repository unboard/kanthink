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

When you have data to visualize, include a chart using this format:
\`\`\`chart
{"type":"area","title":"Chart Title","data":[{"label":"Mon","value":120},{"label":"Tue","value":150}],"color":"violet","label":"Users"}
\`\`\`
Available chart types: "area", "bar", "line", "pie", "donut", "radar", "radialBar", "scatter", "treemap", "funnel", "composed".
Colors: "violet", "blue", "green", "orange", "pink", "teal", "amber", "red", "indigo", "lime".
Options: "stacked":true for stacked bar/area. "composedTypes":["bar","line"] for mixed charts. Two series: add "value2", "color2", "label2".
Choose the chart type that best fits the data — pie/donut for proportions, funnel for conversion stages, area for time series, bar for comparisons, radar for multi-dimensional, treemap for hierarchies.`);
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
 * Get the MCP URL for a given region.
 */
function getMixpanelMcpUrl(metadata: Record<string, unknown> | null): string {
  const region = (metadata?.region as string) || 'us';
  return region === 'eu' ? 'https://mcp-eu.mixpanel.com/mcp'
    : region === 'in' ? 'https://mcp-in.mixpanel.com/mcp'
    : 'https://mcp.mixpanel.com/mcp';
}

/**
 * Call a Mixpanel MCP tool and return the text result.
 */
async function callMcpTool(
  mcpUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ result?: string; error?: string }> {
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[MCP] ${toolName} HTTP ${res.status}:`, errText);
      return { error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    if (data?.error) {
      console.error(`[MCP] ${toolName} RPC error:`, data.error);
      return { error: data.error.message || JSON.stringify(data.error) };
    }

    const content = data?.result?.content;
    if (content && Array.isArray(content)) {
      return { result: content.map((c: { text?: string }) => c.text || '').join('\n') };
    }

    return { result: JSON.stringify(data?.result || data).slice(0, 3000) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MCP] ${toolName} exception:`, msg);
    return { error: msg };
  }
}

/**
 * Query Mixpanel MCP for data relevant to the user's question.
 *
 * Strategy:
 * 1. Discover available tools via tools/list
 * 2. Fetch available events (Get-Events) for context
 * 3. Fetch projects (Get-Projects) for context
 * 4. Pass all of this as context to the AI — let it answer with real data
 */
export async function queryMixpanelForChat(
  channelId: string,
  userQuestion: string,
): Promise<string> {
  try {
    const [source] = await db
      .select()
      .from(channelDataSources)
      .where(and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, 'mixpanel')))
      .limit(1);

    if (!source?.accessToken || source.status !== 'active') {
      return '';
    }

    if (source.tokenExpiresAt && source.tokenExpiresAt < Math.floor(Date.now() / 1000)) {
      return '\n\n[Mixpanel token expired — user needs to reconnect in channel settings]';
    }

    const metadata = source.metadata as Record<string, unknown> | null;
    const mcpUrl = getMixpanelMcpUrl(metadata);
    const token = source.accessToken;

    // Step 1: Discover available tools
    let toolsContext = '';
    try {
      const toolsRes = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        const tools = toolsData?.result?.tools;
        if (Array.isArray(tools)) {
          toolsContext = tools.map((t: { name: string; description?: string }) =>
            `- ${t.name}: ${t.description || 'no description'}`
          ).join('\n');
        }
      }
    } catch (e) {
      console.error('[MCP] tools/list failed:', e);
    }

    // Step 2: Fetch events for context
    const events = await callMcpTool(mcpUrl, token, 'Get-Events');

    // Step 3: Fetch projects for context
    const projects = await callMcpTool(mcpUrl, token, 'Get-Projects');

    // Build the context for the AI
    const parts: string[] = ['\n\n--- MIXPANEL DATA (LIVE CONNECTION) ---'];
    parts.push('Mixpanel is connected to this channel. Below is real data from the account.');

    if (toolsContext) {
      parts.push(`\nAvailable Mixpanel tools:\n${toolsContext}`);
    }
    if (projects.result) {
      parts.push(`\nProjects:\n${projects.result.slice(0, 1000)}`);
    }
    if (events.result) {
      parts.push(`\nTracked events:\n${events.result.slice(0, 2000)}`);
    }

    // Log any errors for debugging
    if (events.error) parts.push(`\n[Events query error: ${events.error}]`);
    if (projects.error) parts.push(`\n[Projects query error: ${projects.error}]`);

    if (parts.length <= 2) {
      // Nothing came back — log it
      console.error('[MCP] No data returned from any Mixpanel query');
      return '\n\n[Mixpanel connected but no data returned — the MCP query may have failed. Check Vercel logs for details.]';
    }

    parts.push('\nUse this real Mixpanel data to answer the user\'s question with concrete numbers. If the data above doesn\'t directly answer the question, explain what data IS available and suggest how they could find what they need.');

    return parts.join('\n');
  } catch (err) {
    console.error('[Mixpanel Query] Error:', err);
    return '\n\n[Failed to query Mixpanel — connection may need to be refreshed]';
  }
}
