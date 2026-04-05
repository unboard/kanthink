/**
 * Direct Mixpanel API integration using API Secret authentication.
 * Bypasses the broken MCP OAuth flow.
 */

const API_SECRET = process.env.MIXPANEL_API_SECRET;
const PROJECT_ID = process.env.MIXPANEL_PROJECT_ID;

function getAuth(): string {
  if (!API_SECRET) throw new Error('MIXPANEL_API_SECRET not configured');
  return 'Basic ' + Buffer.from(API_SECRET + ':').toString('base64');
}

export function isMixpanelConfigured(): boolean {
  return !!(API_SECRET && PROJECT_ID);
}

/** Get top events with counts */
export async function getTopEvents(limit = 10): Promise<{ event: string; amount: number }[]> {
  const res = await fetch(`https://mixpanel.com/api/2.0/events/top?type=general&limit=${limit}`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`Mixpanel API ${res.status}`);
  const data = await res.json();
  return data.events || [];
}

/** Get event properties */
export async function getEventProperties(event: string): Promise<string[]> {
  const res = await fetch(`https://mixpanel.com/api/2.0/events/properties/top?event=${encodeURIComponent(event)}&limit=30`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`Mixpanel API ${res.status}`);
  const data = await res.json();
  return Object.keys(data);
}

/** Segmentation query — event counts over time with optional property breakdown */
export async function querySegmentation(params: {
  event: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  unit?: 'day' | 'week' | 'month';
  property?: string; // property to break down by
  limit?: number;
}): Promise<{
  series: string[];
  values: Record<string, Record<string, number>>;
}> {
  const urlParams = new URLSearchParams({
    event: params.event,
    from_date: params.fromDate,
    to_date: params.toDate,
    type: 'general',
    unit: params.unit || 'day',
  });
  if (params.property) {
    urlParams.set('on', `properties["${params.property}"]`);
    urlParams.set('limit', String(params.limit || 10));
  }

  const res = await fetch(`https://mixpanel.com/api/2.0/segmentation?${urlParams}`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`Mixpanel API ${res.status}`);
  const data = await res.json();
  return {
    series: data.data?.series || [],
    values: data.data?.values || {},
  };
}

/** Export raw events for detailed analysis */
export async function exportEvents(params: {
  event: string;
  fromDate: string;
  toDate: string;
  limit?: number;
}): Promise<Array<{ event: string; properties: Record<string, unknown> }>> {
  const urlParams = new URLSearchParams({
    from_date: params.fromDate,
    to_date: params.toDate,
    event: JSON.stringify([params.event]),
  });

  const res = await fetch(`https://data.mixpanel.com/api/2.0/export?${urlParams}`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`Mixpanel API ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  const events = [];
  const limit = params.limit || 100;
  for (let i = 0; i < Math.min(lines.length, limit); i++) {
    try { events.push(JSON.parse(lines[i])); } catch { /* skip */ }
  }
  return events;
}

/** High-level query function for AI chat — takes natural language intent and returns formatted data */
export async function queryForChat(question: string): Promise<string> {
  if (!isMixpanelConfigured()) return '';

  try {
    // Get date range (default last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toDate = now.toISOString().split('T')[0];
    const fromDate = weekAgo.toISOString().split('T')[0];

    const lowerQ = question.toLowerCase();

    // Detect specific event queries
    const eventMatch = lowerQ.match(/print.?orders?|orders?|revenue|sales/);
    if (eventMatch) {
      // Query print_order with breakdown
      const segData = await querySegmentation({
        event: 'print_order',
        fromDate,
        toDate,
        unit: 'day',
      });

      // Build daily counts from segmentation (de-duplicated by Mixpanel)
      const dailyCounts = Object.entries(segData.values.print_order || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({
          label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }),
          value: count,
        }));

      // Total orders = sum of daily segmentation counts (accurate, de-duped)
      const totalOrders = dailyCounts.reduce((sum, d) => sum + d.value, 0);

      // Get raw events for revenue/category breakdown, de-duped by insert_id
      const rawEvents = await exportEvents({ event: 'print_order', fromDate, toDate, limit: 1000 });
      const seen = new Set<string>();
      let totalRevenue = 0;
      let totalQuantity = 0;
      const categories: Record<string, number> = {};

      for (const evt of rawEvents) {
        const props = evt.properties;
        const dedupKey = (props.$insert_id as string) || (props.id as string) || '';
        if (dedupKey && seen.has(dedupKey)) continue;
        if (dedupKey) seen.add(dedupKey);

        if (props.total) totalRevenue += Number(props.total) || 0;
        const jobs = props.jobs as Array<{ category?: string; quantity?: number }> | undefined;
        if (Array.isArray(jobs)) {
          for (const job of jobs) {
            if (job.category) categories[job.category] = (categories[job.category] || 0) + 1;
            if (job.quantity) totalQuantity += job.quantity;
          }
        }
      }

      let context = `MIXPANEL DATA (${fromDate} to ${toDate}):\n`;
      context += `Print Orders: ${totalOrders} total orders\n`;
      context += `Total Revenue: $${totalRevenue.toFixed(2)}\n`;
      context += `Total Quantity: ${totalQuantity.toLocaleString()}\n`;
      context += `\nDaily breakdown:\n`;
      for (const d of dailyCounts) {
        context += `  ${d.label}: ${d.value} orders\n`;
      }
      if (Object.keys(categories).length > 0) {
        context += `\nProduct categories:\n`;
        for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
          context += `  ${cat}: ${count} orders\n`;
        }
      }

      // Include chart directive
      context += `\n\`\`\`chart\n${JSON.stringify({
        type: 'bar',
        title: 'Print Orders (Last 7 Days)',
        data: dailyCounts,
        color: 'violet',
        label: 'Orders',
      })}\n\`\`\`\n`;

      return context;
    }

    // Generic: return top events summary
    const topEvents = await getTopEvents(8);
    let context = `MIXPANEL DATA — Top Events (last 30 days):\n`;
    for (const evt of topEvents) {
      context += `  ${evt.event}: ${evt.amount.toLocaleString()}\n`;
    }
    return context;

  } catch (err) {
    console.error('[Mixpanel Direct]', err);
    return '';
  }
}
