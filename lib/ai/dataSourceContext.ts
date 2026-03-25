import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/** Minimal message shape for conversation context */
export interface MixpanelChatMessage {
  type: 'note' | 'question' | 'ai_response';
  content: string;
}

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
 * Extract event names mentioned in previous conversation messages.
 * Looks for quoted event names and common patterns from AI responses.
 */
function extractEventsFromHistory(messages: MixpanelChatMessage[]): string[] {
  const events: string[] = [];
  for (const msg of messages) {
    // Match quoted event names like 'Trial Account' or "Trial Account"
    const quoted = msg.content.match(/['"]([A-Z][A-Za-z0-9_ ]+)['"]/g);
    if (quoted) {
      for (const q of quoted) {
        const name = q.slice(1, -1);
        // Filter out common false positives
        if (name.length > 2 && name.length < 60 && !name.startsWith('http')) {
          events.push(name);
        }
      }
    }
    // Match "the 'X' event" or "triggered X event" patterns
    const eventPattern = msg.content.match(/(?:triggered|the|event)\s+['"]?([A-Z][A-Za-z0-9_ ]+?)['"]?\s+event/gi);
    if (eventPattern) {
      for (const match of eventPattern) {
        const name = match.replace(/^(?:triggered|the|event)\s+['"]?/i, '').replace(/['"]?\s+event$/i, '');
        if (name.length > 2) events.push(name);
      }
    }
  }
  // Deduplicate
  return [...new Set(events)];
}

/**
 * Detect if the question is a comparison/follow-up that references prior context.
 */
function isComparisonQuery(question: string): boolean {
  const q = question.toLowerCase();
  return q.includes('compare') || q.includes('versus') || q.includes('vs') ||
    q.includes('percent change') || q.includes('% change') || q.includes('growth') ||
    (q.includes('yesterday') && (q.includes('that') || q.includes('same') || q.includes('compare')));
}

/**
 * Detect if the question is asking about user profiles/PII (emails, user lists, etc.)
 */
function isProfileQuery(question: string): boolean {
  const q = question.toLowerCase();
  return q.includes('email') || q.includes('user list') || q.includes('user names') ||
    q.includes('who are') || q.includes('list of users') || q.includes('give me') && q.includes('user') ||
    q.includes('profile') || q.includes('contact');
}

/**
 * Query Mixpanel MCP for data relevant to the user's question.
 *
 * Strategy:
 * 1. Discover available tools via tools/list
 * 2. Fetch available events (Get-Events) for context
 * 3. Fetch projects (Get-Projects) for context
 * 4. Use conversation history to resolve follow-up references
 * 5. Pass all of this as context to the AI — let it answer with real data
 */
export async function queryMixpanelForChat(
  channelId: string,
  userQuestion: string,
  previousMessages?: MixpanelChatMessage[],
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
          console.log('[MCP] Available tools:', tools.map((t: { name: string }) => t.name).join(', '));
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

    // Check if user has selected a specific project
    const selectedProjectId = (metadata as Record<string, unknown>)?.projectId as number | undefined;
    if (selectedProjectId) {
      projectId = selectedProjectId;
      projectName = ((metadata as Record<string, unknown>)?.projectName as string) || 'Selected project';
      events = await callMcpTool(mcpUrl, token, 'Get-Events', { project_id: selectedProjectId });
    } else if (projects.result) {
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
    let comparisonResult: { result?: string; error?: string } = {};
    let profileResult: { result?: string; error?: string } = {};
    if (projectId && events.result) {
      // Extract event names from the events list
      const eventNames: string[] = [];
      try {
        const eventsData = JSON.parse(events.result);
        if (eventsData?.events && Array.isArray(eventsData.events)) {
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

      // First try matching from the current question
      let matchedEvent = eventNames.find(e =>
        questionLower.includes(e.toLowerCase().replace(/\$/g, '').replace(/_/g, ' ')) ||
        questionLower.includes(e.toLowerCase()) ||
        e.toLowerCase().includes('page_view') && questionLower.includes('page') ||
        e.toLowerCase().includes('session') && questionLower.includes('session') ||
        e.toLowerCase().includes('sign_up') && questionLower.includes('sign')
      );

      // If no match from the question, check conversation history for previously referenced events
      if (!matchedEvent && previousMessages && previousMessages.length > 0) {
        const historyEvents = extractEventsFromHistory(previousMessages);
        console.log('[MCP] Events from conversation history:', historyEvents);
        if (historyEvents.length > 0) {
          // Find the most recently mentioned event that exists in the event list
          for (const histEvent of historyEvents.reverse()) {
            const found = eventNames.find(e =>
              e.toLowerCase() === histEvent.toLowerCase() ||
              e.toLowerCase().replace(/_/g, ' ') === histEvent.toLowerCase()
            );
            if (found) {
              matchedEvent = found;
              console.log('[MCP] Resolved event from conversation history:', matchedEvent);
              break;
            }
          }
        }
      }

      // Final fallback: page_view or first event
      if (!matchedEvent) {
        matchedEvent = eventNames.find(e => e.includes('page_view')) || eventNames[0];
      }

      if (matchedEvent) {
        // Parse date range from the user's question
        const { dateRange, unit } = parseDateRange(questionLower);

        // Determine measurement type (unique vs total)
        const isUnique = questionLower.includes('unique') || questionLower.includes('distinct') || questionLower.includes('users') || questionLower.includes('visitors');
        console.log('[MCP] Running query:', { matchedEvent, dateRange, unit, isUnique, isProfile: isProfileQuery(questionLower), isComparison: isComparisonQuery(questionLower) });

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

        // If this is a comparison query, also fetch the comparison period
        if (isComparisonQuery(questionLower)) {
          // Run a second query with a wider date range to get both periods
          const widerRange = { type: 'relative' as const, range: { unit: 'day' as const, value: 7 } };
          comparisonResult = await callMcpTool(mcpUrl, token, 'Run-Query', {
            project_id: projectId,
            report_type: 'insights',
            report: {
              name: 'Comparison Query',
              metrics: [{ eventName: matchedEvent, measurement: { type: 'basic', math: isUnique ? 'unique' : 'total' } }],
              chartType: 'line',
              unit: 'day',
              dateRange: widerRange,
            },
          });
        }
      }

      // If this is a profile/PII query, try to get user-level data
      if (isProfileQuery(questionLower) && matchedEvent) {
        console.log('[MCP] Profile query detected');
        const { dateRange, unit } = parseDateRange(questionLower);

        // The breakdown schema requires a `metric` field referencing the metric index.
        // Validation error from MCP: "breakdowns.0.metric" was missing.
        // Format: { property, resourceType, metric } where metric = 0 references the first metric.
        const breakdownFormats = [
          // metric:0 + resourceType (based on validation error feedback)
          { breakdowns: [{ property: '$email', resourceType: 'user', metric: 0 }], label: 'metric:0 resourceType:user' },
          // metric:0 + typeName
          { breakdowns: [{ property: '$email', typeName: 'user', metric: 0 }], label: 'metric:0 typeName:user' },
          // metric:0 + type
          { breakdowns: [{ property: '$email', type: 'user', metric: 0 }], label: 'metric:0 type:user' },
          // metric:0 only
          { breakdowns: [{ property: '$email', metric: 0 }], label: 'metric:0 (no type)' },
        ];

        for (const fmt of breakdownFormats) {
          const result = await callMcpTool(mcpUrl, token, 'Run-Query', {
            project_id: projectId,
            report_type: 'insights',
            report: {
              name: 'User Email Breakdown',
              metrics: [{ eventName: matchedEvent, measurement: { type: 'basic', math: 'total' } }],
              chartType: 'table',
              unit,
              dateRange,
              breakdowns: fmt.breakdowns,
            },
          });
          // Only count as success if result contains actual @ email addresses
          // (not just the word "email" in error messages)
          const hasEmails = result.result && result.result.includes('@') && !result.result.startsWith('Validation error');
          console.log(`[MCP] Breakdown (${fmt.label}): ${result.result ? 'data' : 'fail'}${hasEmails ? ' HAS_EMAILS' : ''}, preview: ${(result.result || result.error || '').slice(0, 400)}`);

          if (hasEmails) {
            profileResult = result;
            break;
          }
        }

        // Fallback: Get-Property-Values for $email
        if (!profileResult.result) {
          const propValues = await callMcpTool(mcpUrl, token, 'Get-Property-Values', {
            project_id: projectId,
            property: '$email',
            resource_type: 'User',
          });
          console.log('[MCP] Get-Property-Values $email:', (propValues.result || propValues.error || '').slice(0, 500));
          if (propValues.result && propValues.result.includes('@')) {
            profileResult = propValues;
          }
        }

        if (!profileResult.result) {
          profileResult = {
            error: `Could not retrieve user emails. Tried breakdown formats with metric:0 and Get-Property-Values. Check Vercel logs for details on each attempt.`
          };
        }
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

    // Query results go LAST and are clearly marked — this is the data the AI must use
    // Putting it last (closest to the user message) reduces hallucination
    if (queryResult.result) {
      parts.push(`\n>>> QUERY RESULTS (USE THESE EXACT NUMBERS) <<<\n${queryResult.result.slice(0, 3000)}`);
    }
    if (comparisonResult.result) {
      parts.push(`\n>>> COMPARISON DATA (last 7 days, daily breakdown) <<<\n${comparisonResult.result.slice(0, 3000)}`);
    }
    if (profileResult.result) {
      parts.push(`\n>>> USER-LEVEL EMAIL DATA (individual users broken down by email) <<<\nThe data below contains individual user emails. Present them to the user in a table or list.\n${profileResult.result.slice(0, 5000)}`);
    }

    // Log any errors for debugging
    if (events.error) parts.push(`\n[Events query error: ${events.error}]`);
    if (projects.error) parts.push(`\n[Projects query error: ${projects.error}]`);
    if (queryResult.error) parts.push(`\n[Query error: ${queryResult.error}]`);
    if (comparisonResult.error) parts.push(`\n[Comparison query error: ${comparisonResult.error}]`);
    if (profileResult.error) parts.push(`\n[Profile query info: ${profileResult.error}]`);

    if (parts.length <= 2) {
      console.error('[MCP] No data returned from any Mixpanel query');
      return '\n\n[Mixpanel connected but no data returned — the MCP query may have failed. Check Vercel logs for details.]';
    }

    parts.push('\n⚠️ CRITICAL — READ BEFORE ANSWERING:\n1. ONLY cite numbers that appear VERBATIM in the "QUERY RESULTS" section above. Copy-paste them exactly as they appear.\n2. NEVER invent, estimate, round, or fabricate numbers. The number 56 is not 5. The number 8559 is not 8500. Copy the exact digits.\n3. Before writing any number in your response, find it in the QUERY RESULTS section and verify it matches character-for-character.\n4. If the user asks about an event not in the tracked events list, say "that event is not tracked in your Mixpanel project" and list similar events.\n5. If no QUERY RESULTS section appears above, say "I could not retrieve data for this query" — do NOT make up numbers.\n6. When including a chart, use the EXACT data points from the query results.\n7. For comparison queries, calculate the exact percent change from the data provided. Show both numbers and the formula.\n8. If a "USER-LEVEL EMAIL DATA" section appears above, it contains individual user emails from a Mixpanel breakdown query. Present ALL emails from that section to the user — do NOT say you cannot access them.');

    return parts.join('\n');
  } catch (err) {
    console.error('[Mixpanel Query] Error:', err);
    return '\n\n[Failed to query Mixpanel — connection may need to be refreshed]';
  }
}
