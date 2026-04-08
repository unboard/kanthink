/**
 * Direct Mixpanel API integration using API Secret authentication.
 * Bypasses the broken MCP OAuth flow.
 */

const API_SECRET = process.env.MIXPANEL_API_SECRET;
const PROJECT_ID = process.env.MIXPANEL_PROJECT_ID;

// In-memory caches — survive across requests within the same serverless invocation
const emailCache: { map: Record<string, string>; expires: number } = { map: {}, expires: 0 };
const propertyValuesCache: Record<string, { values: string[]; expires: number }> = {};

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

/** Get top values for a specific property on an event (cached 5 min) */
export async function getPropertyValues(event: string, property: string, limit = 20): Promise<string[]> {
  const cacheKey = `${event}:${property}`;
  const cached = propertyValuesCache[cacheKey];
  if (cached && Date.now() < cached.expires) return cached.values;

  const urlParams = new URLSearchParams({
    event: event,
    name: `properties["${property}"]`,
    limit: String(limit),
    type: 'general',
  });
  const res = await fetch(`https://mixpanel.com/api/2.0/events/properties/values?${urlParams}`, {
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`Mixpanel API ${res.status}`);
  const values: string[] = await res.json();
  propertyValuesCache[cacheKey] = { values, expires: Date.now() + 5 * 60 * 1000 };
  return values;
}

/** Parse property filter from natural language (e.g., "where screen is checkout") */
function parsePropertyFilter(question: string): { property: string; value: string } | null {
  const lq = question.toLowerCase();
  const patterns = [
    /where\s+(\w+)\s+(?:is|=|==|equals?)\s+["']?([^"'\s,]+)["']?/i,
    /filter(?:ed)?\s+(?:by|on)\s+(\w+)\s*[=:]\s*["']?([^"'\s,]+)["']?/i,
    /(\w+)\s*==\s*["']?([^"'\s,]+)["']?/i,
    /(?:property|prop)\s+(\w+)\s+(?:is|=|equals?)\s+["']?([^"'\s,]+)["']?/i,
  ];
  for (const p of patterns) {
    const m = lq.match(p);
    if (m) {
      const prop = m[1].replace(/[^a-zA-Z0-9_]/g, '');
      const val = m[2].replace(/[^a-zA-Z0-9_\-. ]/g, '');
      if (prop && val) return { property: prop, value: val };
    }
  }
  return null;
}

/** Build Mixpanel JQL where clause from parsed filter */
function buildWhereClause(filter: { property: string; value: string }): string {
  return `properties["${filter.property}"] == "${filter.value}"`;
}

/** Segmentation query — event counts over time with optional property breakdown */
export async function querySegmentation(params: {
  event: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  unit?: 'day' | 'week' | 'month';
  property?: string; // property to break down by
  where?: string; // JQL filter expression
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
  if (params.where) {
    urlParams.set('where', params.where);
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
  where?: string; // JQL filter expression
  limit?: number;
}): Promise<Array<{ event: string; properties: Record<string, unknown> }>> {
  const urlParams = new URLSearchParams({
    from_date: params.fromDate,
    to_date: params.toDate,
    event: JSON.stringify([params.event]),
  });
  if (params.where) {
    urlParams.set('where', params.where);
  }

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
 *  Uses the distinct_id param which handles identity resolution internally.
 *  Runs in parallel batches of 5 (Mixpanel's concurrent limit).
 *  Caches results in-memory for 1 hour to avoid burning rate limits. */
async function lookupEmails(distinctIds: string[]): Promise<Record<string, string>> {
  const emailMap: Record<string, string> = {};
  if (distinctIds.length === 0) return emailMap;

  // Refresh cache if expired
  if (Date.now() > emailCache.expires) {
    emailCache.map = {};
    emailCache.expires = Date.now() + 60 * 60 * 1000; // 1 hour
  }

  // Check cache first — only look up IDs we haven't seen
  const uncachedIds: string[] = [];
  for (const id of distinctIds) {
    if (emailCache.map[id]) {
      emailMap[id] = emailCache.map[id];
    } else {
      uncachedIds.push(id);
    }
  }

  // Look up uncached IDs in parallel batches of 5
  const ids = uncachedIds.slice(0, 55);
  const batchSize = 5;
  let rateLimited = false;

  for (let i = 0; i < ids.length && !rateLimited; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (id) => {
        if (rateLimited) return;
        try {
          const body = new URLSearchParams();
          body.set('distinct_id', id);
          const res = await fetch('https://mixpanel.com/api/2.0/engage', {
            method: 'POST',
            headers: { Authorization: getAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
          if (res.status === 429) { rateLimited = true; return; }
          if (!res.ok) return;
          const data = await res.json();
          const profile = data.results?.[0];
          if (!profile) return;
          const props = profile['$properties'] || {};
          const email = props.email || props['$email'];
          if (email) {
            emailMap[id] = email;
            emailCache.map[id] = email; // Cache it
          }
        } catch { /* skip */ }
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

export interface QueryOptions {
  action?: 'query' | 'list_properties' | 'list_values';
  event?: string;
  property?: string;
  value?: string;
  fromDate?: string;
  toDate?: string;
}

/** High-level query function for AI chat — takes natural language intent and returns formatted data */
export async function queryForChat(question: string, options?: QueryOptions): Promise<string> {
  if (!isMixpanelConfigured()) return '';

  try {
    // Handle structured action modes
    if (options?.action === 'list_properties' && options.event) {
      const props = await getEventProperties(options.event);
      const filtered = props.filter(p => !p.startsWith('$') && p !== 'mp_lib');
      if (filtered.length === 0) return `No custom properties found for "${options.event}".`;
      return `MIXPANEL PROPERTIES for "${options.event}":\n${filtered.map(p => `  • ${p}`).join('\n')}\n\nAsk about any property to see its values, or filter by a specific property and value.`;
    }

    if (options?.action === 'list_values' && options.event && options.property) {
      const values = await getPropertyValues(options.event, options.property);
      if (values.length === 0) return `No values found for property "${options.property}" on "${options.event}".`;
      return `MIXPANEL VALUES for "${options.property}" on "${options.event}":\n${values.map(v => `  • ${v}`).join('\n')}\n\nWant me to filter ${options.event} events where ${options.property} is one of these values?`;
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toDate = options?.toDate || now.toISOString().split('T')[0];
    const fromDate = options?.fromDate || weekAgo.toISOString().split('T')[0];

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

      // Include order details — with emails if available, as a structured table
      if (wantsEmails) {
        if (!hasAnyEmail) {
          context += `\nNote: Customer emails are not available for these orders.\n`;
        }
        const tableRows = orderDetails.map(o => {
          const email = (o as Record<string, unknown>).email as string || '';
          const d = o.date ? new Date(o.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';
          const cats = o.categories.length > 2 ? o.categories.slice(0, 2).join(', ') + ` +${o.categories.length - 2}` : o.categories.join(', ');
          return hasAnyEmail
            ? { email: email || '—', order: `#${o.id}`, product: cats, total: `$${o.total.toFixed(2)}`, date: d }
            : { order: `#${o.id}`, product: cats, total: `$${o.total.toFixed(2)}`, date: d };
        });
        context += `\n\`\`\`table\n${JSON.stringify({
          title: `${catLabel} Order Details`,
          columns: hasAnyEmail ? ['email', 'order', 'product', 'total', 'date'] : ['order', 'product', 'total', 'date'],
          rows: tableRows,
        })}\n\`\`\`\n`;
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

    // Try to detect a specific event name in the question or options
    const eventName = options?.event || lowerQ.match(/(?:event\s+)?[`"']?(\w+_\w+)[`"']?/)?.[1];
    if (eventName) {
      // Check for property filter in question or options
      const filter = options?.value && options?.property
        ? { property: options.property, value: options.value }
        : parsePropertyFilter(question);
      const whereClause = filter ? buildWhereClause(filter) : undefined;

      const rawEvents = await exportEvents({ event: eventName, fromDate, toDate, where: whereClause, limit: 500 });

      // Also fetch available properties for discovery
      let availableProps: string[] = [];
      try {
        availableProps = (await getEventProperties(eventName)).filter(p => !p.startsWith('$') && p !== 'mp_lib');
      } catch { /* non-critical */ }

      if (rawEvents.length > 0) {
        // Build daily counts
        const dailyMap: Record<string, number> = {};
        for (const evt of rawEvents) {
          const ts = (evt.properties.time as number) || 0;
          const d = ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';
          dailyMap[d] = (dailyMap[d] || 0) + 1;
        }
        const dailyData = Object.entries(dailyMap).map(([label, value]) => ({ label, value }));

        const filterLabel = filter ? ` (filtered: ${filter.property} = "${filter.value}")` : '';
        let context = `MIXPANEL DATA for "${eventName}"${filterLabel} (${fromDate} to ${toDate}):\n`;
        context += `Total events: ${rawEvents.length}\n`;

        // Show available properties for drill-down
        if (availableProps.length > 0) {
          context += `\nAvailable properties to drill into: ${availableProps.join(', ')}\n`;
          context += `(Ask about any property to see its values, or filter by property = value)\n`;
        }

        context += `\n\`\`\`chart\n${JSON.stringify({
          type: 'bar',
          title: `${eventName}${filterLabel} by Day`,
          data: dailyData,
          color: 'violet',
          label: 'Events',
        })}\n\`\`\`\n`;

        return context;
      } else {
        const filterNote = filter ? ` with filter ${filter.property} = "${filter.value}"` : '';
        let context = `MIXPANEL DATA: No events found for "${eventName}"${filterNote} (${fromDate} to ${toDate}).`;
        if (filter) {
          context += ` Try without the filter, or ask what values exist for the "${filter.property}" property.`;
        } else {
          context += ` This event may not exist, may not be tracked, or may have zero occurrences in this period.`;
        }
        if (availableProps.length > 0) {
          context += `\nAvailable properties: ${availableProps.join(', ')}`;
        }
        return context;
      }
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
