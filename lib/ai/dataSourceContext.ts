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
        'Accept': 'application/json, text/event-stream',
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

    // Mixpanel MCP returns SSE format (event: message\ndata: {...})
    // Parse the SSE to extract JSON
    const rawText = await res.text();
    let data: Record<string, unknown>;
    try {
      // Try plain JSON first
      data = JSON.parse(rawText);
    } catch {
      // Parse SSE: find the last "data: " line with JSON
      const dataLines = rawText.split('\n').filter(l => l.startsWith('data: '));
      const lastDataLine = dataLines[dataLines.length - 1];
      if (lastDataLine) {
        data = JSON.parse(lastDataLine.slice(6));
      } else {
        return { error: `Unexpected response format: ${rawText.slice(0, 200)}` };
      }
    }

    if (data?.error) {
      console.error(`[MCP] ${toolName} RPC error:`, data.error);
      const err = data.error as Record<string, unknown>;
      return { error: (err.message as string) || JSON.stringify(err) };
    }

    const result = data?.result as Record<string, unknown> | undefined;
    const content = result?.content;
    if (content && Array.isArray(content)) {
      return { result: content.map((c: { text?: string }) => c.text || '').join('\n') };
    }

    return { result: JSON.stringify(result || data).slice(0, 3000) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MCP] ${toolName} exception:`, msg);
    return { error: msg };
  }
}

/**
 * Parse a date range from a natural language question.
 */
function parseDateRange(question: string): { dateRange: Record<string, unknown>; unit: string } {
  const q = question.toLowerCase();

  // "today" or "this hour"
  if (q.includes('today') || q.includes('this hour')) {
    return { dateRange: { type: 'relative', range: { unit: 'day', value: 1 } }, unit: 'hour' };
  }
  // "yesterday"
  if (q.includes('yesterday')) {
    return { dateRange: { type: 'relative', range: { unit: 'day', value: 2 } }, unit: 'hour' };
  }
  // "this week"
  if (q.includes('this week')) {
    return { dateRange: { type: 'relative', range: { unit: 'week', value: 1 } }, unit: 'day' };
  }
  // "last week"
  if (q.includes('last week')) {
    return { dateRange: { type: 'relative', range: { unit: 'week', value: 2 } }, unit: 'day' };
  }
  // "this month"
  if (q.includes('this month')) {
    return { dateRange: { type: 'relative', range: { unit: 'month', value: 1 } }, unit: 'day' };
  }
  // "last month"
  if (q.includes('last month')) {
    return { dateRange: { type: 'relative', range: { unit: 'month', value: 2 } }, unit: 'day' };
  }
  // "last N days"
  const lastNDays = q.match(/last\s+(\d+)\s*days?/);
  if (lastNDays) {
    const n = parseInt(lastNDays[1], 10);
    return { dateRange: { type: 'relative', range: { unit: 'day', value: n } }, unit: n <= 7 ? 'day' : 'week' };
  }
  // "last N weeks"
  const lastNWeeks = q.match(/last\s+(\d+)\s*weeks?/);
  if (lastNWeeks) {
    return { dateRange: { type: 'relative', range: { unit: 'week', value: parseInt(lastNWeeks[1], 10) } }, unit: 'day' };
  }
  // "last N months"
  const lastNMonths = q.match(/last\s+(\d+)\s*months?/);
  if (lastNMonths) {
    return { dateRange: { type: 'relative', range: { unit: 'month', value: parseInt(lastNMonths[1], 10) } }, unit: 'week' };
  }
  // "this year" or "last year"
  if (q.includes('this year') || q.includes('last year')) {
    return { dateRange: { type: 'relative', range: { unit: 'month', value: 12 } }, unit: 'month' };
  }
  // Specific date like "March 23" or "March 23, 2026" — query last 30 days by day
  const monthMatch = q.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/);
  if (monthMatch) {
    return { dateRange: { type: 'relative', range: { unit: 'month', value: 1 } }, unit: 'day' };
  }
  // "hourly" granularity requested
  if (q.includes('hourly') || q.includes('by hour')) {
    return { dateRange: { type: 'relative', range: { unit: 'day', value: 1 } }, unit: 'hour' };
  }

  // Default: last 30 days
  return { dateRange: { type: 'relative', range: { unit: 'day', value: 30 } }, unit: 'day' };
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
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      if (toolsRes.ok) {
        const toolsRaw = await toolsRes.text();
        let toolsData: Record<string, unknown>;
        try {
          toolsData = JSON.parse(toolsRaw);
        } catch {
          const dataLines = toolsRaw.split('\n').filter((l: string) => l.startsWith('data: '));
          toolsData = dataLines.length > 0 ? JSON.parse(dataLines[dataLines.length - 1].slice(6)) : {};
        }
        const toolsResult = toolsData?.result as Record<string, unknown> | undefined;
        const tools = toolsResult?.tools;
        if (Array.isArray(tools)) {
          toolsContext = tools.map((t: { name: string; description?: string }) =>
            `- ${t.name}: ${t.description || 'no description'}`
          ).join('\n');
        }
      }
    } catch (e) {
      console.error('[MCP] tools/list failed:', e);
    }

    // Step 2: Fetch projects to get project IDs
    const projects = await callMcpTool(mcpUrl, token, 'Get-Projects');

    // Step 3: Extract first project ID and fetch events
    // Step 3: Find a project with MCP enabled by trying Get-Events on each
    let projectId: number | null = null;
    let projectName: string | null = null;
    let events: { result?: string; error?: string } = { error: 'No projects found' };

    if (projects.result) {
      try {
        const projectData = JSON.parse(projects.result) as Record<string, { id: number; name: string }>;
        const entries = Object.entries(projectData);
        // Skip deprecated, try each until one returns events
        const sorted = [
          ...entries.filter(([, p]) => !p.name.toLowerCase().includes('deprecated')),
          ...entries.filter(([, p]) => p.name.toLowerCase().includes('deprecated')),
        ];

        for (const [id, proj] of sorted) {
          const tryEvents = await callMcpTool(mcpUrl, token, 'Get-Events', { project_id: parseInt(id, 10) });
          if (tryEvents.result && !tryEvents.result.includes('not enabled')) {
            projectId = parseInt(id, 10);
            projectName = proj.name;
            events = tryEvents;
            break;
          }
        }
      } catch { /* project result might not be JSON */ }
    }

    // Step 4: Try to run a basic query based on the user's question
    let queryResult: { result?: string; error?: string } = {};
    if (projectId && events.result) {
      // Extract event names from the events list
      const eventNames: string[] = [];
      try {
        const eventsData = JSON.parse(events.result);
        if (eventsData?.events && Array.isArray(eventsData.events)) {
          // Format: { events: ["name1", "name2"], count: N }
          eventsData.events.forEach((name: string) => eventNames.push(name));
        } else if (Array.isArray(eventsData)) {
          eventsData.forEach((e: string | { name?: string }) => {
            if (typeof e === 'string') eventNames.push(e);
            else if (e.name) eventNames.push(e.name);
          });
        } else if (typeof eventsData === 'object') {
          Object.keys(eventsData).forEach(k => eventNames.push(k));
        }
      } catch { /* events might be plain text */ }
      console.log('[MCP] Found', eventNames.length, 'events, first 5:', eventNames.slice(0, 5));

      // Try to match the user's question to an event name
      const questionLower = userQuestion.toLowerCase().replace(/@mixpanel/gi, '').trim();
      const matchedEvent = eventNames.find(e =>
        questionLower.includes(e.toLowerCase().replace(/\$/g, '').replace(/_/g, ' ')) ||
        questionLower.includes(e.toLowerCase()) ||
        e.toLowerCase().includes('page_view') && questionLower.includes('page') ||
        e.toLowerCase().includes('session') && questionLower.includes('session') ||
        e.toLowerCase().includes('sign_up') && questionLower.includes('sign')
      ) || eventNames.find(e => e.includes('page_view')) || eventNames[0];

      if (matchedEvent) {
        // Parse date range from the user's question
        const { dateRange, unit } = parseDateRange(questionLower);

        // Determine measurement type (unique vs total)
        const isUnique = questionLower.includes('unique') || questionLower.includes('distinct') || questionLower.includes('users') || questionLower.includes('visitors');

        queryResult = await callMcpTool(mcpUrl, token, 'Run-Query', {
          project_id: projectId,
          report_type: 'insights',
          report: {
            name: 'Query',
            metrics: [{ eventName: matchedEvent, measurement: { type: 'basic', math: isUnique ? 'unique' : 'total' } }],
            chartType: 'line',
            unit,
            dateRange,
          },
        });
      }
    }

    // Build the context for the AI
    const parts: string[] = ['\n\n--- MIXPANEL DATA (LIVE CONNECTION) ---'];
    parts.push(`Today's date is ${new Date().toISOString().split('T')[0]}. Mixpanel is connected to this channel.${projectName ? ` Active project: "${projectName}".` : ''} Below is real data from the account.`);

    if (toolsContext) {
      parts.push(`\nAvailable Mixpanel tools:\n${toolsContext}`);
    }
    if (projects.result) {
      parts.push(`\nProjects:\n${projects.result.slice(0, 1000)}`);
    }
    if (events.result) {
      parts.push(`\nTracked events:\n${events.result.slice(0, 2000)}`);
    }

    if (queryResult.result) {
      parts.push(`\nQuery results (last 7 days):\n${queryResult.result.slice(0, 3000)}`);
    }

    // Log any errors for debugging
    if (events.error) parts.push(`\n[Events query error: ${events.error}]`);
    if (projects.error) parts.push(`\n[Projects query error: ${projects.error}]`);
    if (queryResult.error) parts.push(`\n[Query error: ${queryResult.error}]`);

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
