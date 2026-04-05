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

/** Look up user profile emails by distinct_ids */
async function lookupEmails(distinctIds: string[]): Promise<Record<string, string>> {
  const emailMap: Record<string, string> = {};
  // Query in batches of 20 to avoid overloading
  for (let i = 0; i < Math.min(distinctIds.length, 60); i++) {
    try {
      const body = new URLSearchParams();
      body.set('distinct_id', distinctIds[i]);
      const res = await fetch('https://mixpanel.com/api/2.0/engage', {
        method: 'POST',
        headers: { Authorization: getAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (res.ok) {
        const data = await res.json();
        const props = data.results?.[0]?.['$properties'] || {};
        if (props.email) emailMap[distinctIds[i]] = props.email;
      }
    } catch { /* skip */ }
  }
  return emailMap;
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

    // Detect user/email queries
    const wantsEmails = /emails?|users?|customers?|who ordered|who bought|show me.*(people|customers|users)/.test(lowerQ);

    // Detect specific event queries
    const eventMatch = lowerQ.match(/print.?orders?|orders?|revenue|sales|emails?|users?|customers?/);
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
      const orderDetails: Array<{ distinctId: string; total: number; id: string; category: string; date: number }> = [];

      for (const evt of rawEvents) {
        const props = evt.properties;
        const dedupKey = (props.$insert_id as string) || (props.id as string) || '';
        if (dedupKey && seen.has(dedupKey)) continue;
        if (dedupKey) seen.add(dedupKey);

        const total = Number(props.total) || 0;
        if (total) totalRevenue += total;
        const jobs = props.jobs as Array<{ category?: string; quantity?: number }> | undefined;
        let cat = '';
        if (Array.isArray(jobs)) {
          for (const job of jobs) {
            if (job.category) { categories[job.category] = (categories[job.category] || 0) + 1; cat = job.category; }
            if (job.quantity) totalQuantity += job.quantity;
          }
        }
        orderDetails.push({
          distinctId: props.distinct_id as string,
          total,
          id: (props.id as string) || '',
          category: cat,
          date: (props.date as number) || (props.time as number) || 0,
        });
      }

      // Look up emails if requested
      let emailSection = '';
      if (wantsEmails && orderDetails.length > 0) {
        const uniqueIds = [...new Set(orderDetails.map(o => o.distinctId))];
        const emailMap = await lookupEmails(uniqueIds);
        const ordersWithEmails = orderDetails.map(o => ({
          ...o,
          email: emailMap[o.distinctId] || 'unknown',
        }));

        emailSection = `\nOrder details with customer emails:\n`;
        for (const o of ordersWithEmails) {
          const d = o.date ? new Date(o.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';
          emailSection += `  ${o.email} | Order #${o.id} | ${o.category} | $${o.total.toFixed(2)} | ${d}\n`;
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

      // Include email details if requested
      if (emailSection) context += emailSection;

      // --- CHARTS ---

      // 1. Daily orders bar chart
      context += `\n\`\`\`chart\n${JSON.stringify({
        type: 'bar',
        title: 'Print Orders by Day',
        data: dailyCounts,
        color: 'violet',
        label: 'Orders',
      })}\n\`\`\`\n`;

      // 2. Product category pie chart
      if (Object.keys(categories).length > 0) {
        const catData = Object.entries(categories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([label, value]) => ({ label, value }));
        context += `\n\`\`\`chart\n${JSON.stringify({
          type: 'pie',
          title: 'Orders by Product Category',
          data: catData,
          color: 'blue',
          label: 'Orders',
        })}\n\`\`\`\n`;
      }

      // 3. Revenue by category bar chart (horizontal feel)
      if (Object.keys(categories).length > 0) {
        // Calculate revenue per category from raw events
        const catRevenue: Record<string, number> = {};
        for (const evt of rawEvents) {
          const props = evt.properties;
          const dedupKey = (props.$insert_id as string) || (props.id as string) || '';
          const jobs = props.jobs as Array<{ category?: string; total?: number }> | undefined;
          if (Array.isArray(jobs)) {
            for (const job of jobs) {
              if (job.category && job.total) {
                catRevenue[job.category] = (catRevenue[job.category] || 0) + job.total;
              }
            }
          }
        }
        if (Object.keys(catRevenue).length > 0) {
          const revData = Object.entries(catRevenue)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: 'bar',
            title: 'Revenue by Product Category',
            data: revData,
            color: 'green',
            label: 'Revenue ($)',
          })}\n\`\`\`\n`;
        }
      }

      return context;
    }

    // Generic: return top events summary with charts
    const topEvents = await getTopEvents(8);
    let context = `MIXPANEL DATA — Top Events (last 30 days):\n`;
    for (const evt of topEvents) {
      context += `  ${evt.event}: ${evt.amount.toLocaleString()}\n`;
    }

    // Bar chart for top events
    const eventData = topEvents.map(e => ({ label: e.event, value: e.amount }));
    context += `\n\`\`\`chart\n${JSON.stringify({
      type: 'bar',
      title: 'Top Events (Last 30 Days)',
      data: eventData,
      color: 'violet',
      label: 'Events',
    })}\n\`\`\`\n`;

    // Pie chart for event distribution
    context += `\n\`\`\`chart\n${JSON.stringify({
      type: 'donut',
      title: 'Event Distribution',
      data: eventData.slice(0, 6),
      color: 'blue',
      label: 'Events',
    })}\n\`\`\`\n`;

    return context;

  } catch (err) {
    console.error('[Mixpanel Direct]', err);
    return '';
  }
}
