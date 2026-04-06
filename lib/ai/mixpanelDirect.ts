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

/** Look up user profile emails by distinct_ids using the Engage API.
 *  Uses the distinct_id param which handles identity resolution internally
 *  (works for both regular UUIDs and $device: prefixed IDs). */
async function lookupEmails(distinctIds: string[]): Promise<Record<string, string>> {
  const emailMap: Record<string, string> = {};
  if (distinctIds.length === 0) return emailMap;

  // Look up in parallel batches of 5 (Mixpanel allows 5 concurrent queries)
  const ids = distinctIds.slice(0, 50);
  const batchSize = 5;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const body = new URLSearchParams();
        body.set('distinct_id', id);
        const res = await fetch('https://mixpanel.com/api/2.0/engage', {
          method: 'POST',
          headers: { Authorization: getAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const profile = data.results?.[0];
        if (!profile) return;
        const props = profile['$properties'] || {};
        const email = props.email || props['$email'];
        if (email) emailMap[id] = email;
      })
    );
  }

  return emailMap;
}

/** Detect a specific product category from the question */
function detectCategory(question: string): string | null {
  const lq = question.toLowerCase();
  const categories = [
    'pocket folder', 'business card', 'postcard_eddm', 'postcard', 'yard sign',
    'door hanger', 'brochure', 'flyer', 'poster', 'foam board', 'banner',
    'retractable banner', 'ticket', 'card', 'kpop cup sleeve', 'kpop ticket',
    'kpop hand banner', 'kpop fabric slogan',
  ];
  for (const cat of categories) {
    if (lq.includes(cat)) return cat;
  }
  // Fuzzy: "pocket folders" → "Pocket Folder"
  const fuzzy = lq.match(/(\w+\s?\w*)\s*orders?/);
  if (fuzzy) {
    const term = fuzzy[1].trim();
    const match = categories.find(c => c.includes(term) || term.includes(c.split(' ')[0]));
    if (match) return match;
  }
  return null;
}

/** High-level query function for AI chat — takes natural language intent and returns formatted data */
export async function queryForChat(question: string): Promise<string> {
  if (!isMixpanelConfigured()) return '';

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toDate = now.toISOString().split('T')[0];
    const fromDate = weekAgo.toISOString().split('T')[0];

    const lowerQ = question.toLowerCase();
    const wantsEmails = /emails?|users?|customers?|who ordered|who bought|who placed|show me.*(people|customers|users)/.test(lowerQ);
    const categoryFilter = detectCategory(lowerQ);

    const eventMatch = lowerQ.match(/print.?orders?|orders?|revenue|sales|emails?|users?|customers?|pocket|business card|postcard|yard sign|door hanger|brochure|flyer/);
    if (eventMatch) {
      // Get raw events, de-dupe, and filter by category if specified
      const rawEvents = await exportEvents({ event: 'print_order', fromDate, toDate, limit: 1000 });
      const seen = new Set<string>();
      let totalRevenue = 0;
      let totalQuantity = 0;
      const orderDetails: Array<{ distinctId: string; resolvedId: string; total: number; id: string; categories: string[]; date: number }> = [];

      for (const evt of rawEvents) {
        const props = evt.properties;
        const dedupKey = (props.$insert_id as string) || (props.id as string) || '';
        if (dedupKey && seen.has(dedupKey)) continue;
        if (dedupKey) seen.add(dedupKey);

        const total = Number(props.total) || 0;
        const jobs = props.jobs as Array<{ category?: string; quantity?: number; total?: number }> | undefined;
        const cats: string[] = [];
        let qty = 0;
        if (Array.isArray(jobs)) {
          for (const job of jobs) {
            if (job.category) cats.push(job.category);
            if (job.quantity) qty += job.quantity;
          }
        }

        // Filter by category if user asked for a specific one
        if (categoryFilter) {
          const matchesCat = cats.some(c => c.toLowerCase().includes(categoryFilter));
          if (!matchesCat) continue;
        }

        // Resolve device IDs: $device:xxx -> use $distinct_id_before_identity as the canonical user ID
        const did = props.distinct_id as string;
        const resolvedId = did.startsWith('$device:')
          ? (props.$distinct_id_before_identity as string || did)
          : did;

        totalRevenue += total;
        totalQuantity += qty;
        orderDetails.push({
          distinctId: did, resolvedId,
          total, id: (props.id as string) || '',
          categories: cats,
          date: (props.date as number) || (props.time as number) || 0,
        });
      }

      const totalOrders = orderDetails.length;
      const catLabel = categoryFilter ? categoryFilter.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Print';

      // Look up emails — use original distinct_id (Engage API handles identity resolution internally)
      let hasAnyEmail = false;
      if (wantsEmails && orderDetails.length > 0) {
        const uniqueIds = Array.from(new Set(orderDetails.map(o => o.distinctId)));
        const emailMap = await lookupEmails(uniqueIds);
        for (const o of orderDetails) {
          const email = emailMap[o.distinctId] || '';
          if (email) hasAnyEmail = true;
          (o as Record<string, unknown>).email = email;
        }
      }

      // Build context — focused on what was asked
      let context = `MIXPANEL DATA (${fromDate} to ${toDate}):\n`;
      context += `${catLabel} Orders: ${totalOrders}\n`;
      context += `Revenue: $${totalRevenue.toFixed(2)}\n`;
      if (totalQuantity) context += `Quantity: ${totalQuantity.toLocaleString()}\n`;

      // Include order details — with emails if available
      if (wantsEmails) {
        if (!hasAnyEmail) {
          context += `\nNote: Customer emails are not available — Mixpanel user profiles for these orders don't have email set. The tracking pipeline needs to link user identity to order events.\n`;
        }
        context += `\nOrder details:\n`;
        for (const o of orderDetails) {
          const email = (o as Record<string, unknown>).email as string;
          const d = o.date ? new Date(o.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';
          if (email) {
            context += `  ${email} | Order #${o.id} | ${o.categories.join(', ')} | $${o.total.toFixed(2)} | ${d}\n`;
          } else {
            context += `  Order #${o.id} | ${o.categories.join(', ')} | $${o.total.toFixed(2)} | ${d}\n`;
          }
        }
      }

      // ONE chart — the most relevant one for the question
      if (!wantsEmails && totalOrders > 0) {
        // For category-specific queries: bar chart of daily counts
        const dailyMap: Record<string, number> = {};
        for (const o of orderDetails) {
          const d = o.date ? new Date(o.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';
          dailyMap[d] = (dailyMap[d] || 0) + 1;
        }
        const dailyData = Object.entries(dailyMap).map(([label, value]) => ({ label, value }));

        context += `\n\`\`\`chart\n${JSON.stringify({
          type: 'bar',
          title: `${catLabel} Orders by Day`,
          data: dailyData,
          color: 'violet',
          label: 'Orders',
        })}\n\`\`\`\n`;
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
