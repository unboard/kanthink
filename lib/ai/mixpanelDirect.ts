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
  /** Optional preferred chart type. When omitted, auto-selects. */
  chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'value';
}

type AutoChartHint = 'pie' | 'bar' | 'line' | 'value' | undefined;
type ChartType = 'line' | 'bar' | 'pie' | 'donut' | 'value';

function detectChartHint(question: string): AutoChartHint {
  const q = question.toLowerCase();
  if (/\b(pie|donut|share|proportion|split|percent|%)\b/.test(q)) return 'pie';
  if (/\b(trend|over time|per day|by day|daily|weekly|monthly|timeline|history)\b/.test(q)) return 'line';
  if (/\b(top|rank|compare|comparison|versus|vs\.?|which)\b/.test(q)) return 'bar';
  return undefined;
}

/**
 * Pick a chart type. Priority: explicit request > phrasing hint > structural default.
 * A result with one data point always becomes a metric card — a single bar or a
 * one-slice pie is noise, not a visualization.
 */
function resolveChartType(
  options: QueryOptions | undefined,
  question: string,
  fallback: ChartType,
  pointCount = 2,
): ChartType {
  const chosen = options?.chartType || detectChartHint(question) || fallback;
  return pointCount <= 1 ? 'value' : chosen;
}

// ── Breakdown parsing ─────────────────────────────────────────────
// "print orders by user", "revenue per category", "orders broken down by day".
// A recognized dimension always produces a data table, so breakdowns stop being
// hit or miss.
type BreakdownDimension = 'user' | 'category' | 'day' | 'week' | 'month';

const DIMENSION_SYNONYMS: Array<{ dimension: BreakdownDimension; terms: string[] }> = [
  { dimension: 'user', terms: ['user', 'users', 'customer', 'customers', 'email', 'emails', 'person', 'people', 'buyer', 'buyers', 'account', 'accounts'] },
  { dimension: 'category', terms: ['category', 'categories', 'product', 'products', 'type', 'types', 'item', 'items', 'sku', 'skus'] },
  { dimension: 'day', terms: ['day', 'days', 'date', 'dates', 'daily'] },
  { dimension: 'week', terms: ['week', 'weeks', 'weekly'] },
  { dimension: 'month', terms: ['month', 'months', 'monthly'] },
];

interface BreakdownRequest {
  /** null when the user clearly asked for a breakdown but the dimension isn't supported */
  dimension: BreakdownDimension | null;
  /** the raw phrase the user used, for clarification messages */
  rawTerm: string;
}

/** Phrasings that can only mean "break this down", so an unknown term is worth asking about. */
const EXPLICIT_BREAKDOWN = /^(broken\s+down\s+by|breakdown\s+by|grouped?\s+by|group\s+by|split\s+by|for\s+each)$/;

function parseBreakdown(question: string): BreakdownRequest | null {
  const q = question.toLowerCase();
  const match = q.match(/\b(broken\s+down\s+by|breakdown\s+by|grouped?\s+by|group\s+by|split\s+by|by|per|across|for\s+each)\s+(?:each\s+)?([a-z_]+)/);
  if (!match) {
    // "daily"/"weekly"/"monthly" imply a time breakdown without a "by" phrase
    if (/\bdaily\b/.test(q)) return { dimension: 'day', rawTerm: 'daily' };
    if (/\bweekly\b/.test(q)) return { dimension: 'week', rawTerm: 'weekly' };
    if (/\bmonthly\b/.test(q)) return { dimension: 'month', rawTerm: 'monthly' };
    return null;
  }

  const [, connector, term] = match;
  for (const { dimension, terms } of DIMENSION_SYNONYMS) {
    if (terms.includes(term)) return { dimension, rawTerm: term };
  }
  // A bare "by"/"per"/"across" followed by something unrecognized is usually just
  // prose ("driven by growth"), not a breakdown request — don't ask about it.
  return EXPLICIT_BREAKDOWN.test(connector) ? { dimension: null, rawTerm: term } : null;
}

/** Default chart for a given breakdown: time trends line, comparisons bar, no breakdown a metric card. */
function defaultChartForBreakdown(dimension: BreakdownDimension | null | undefined): ChartType {
  if (dimension === 'day' || dimension === 'week' || dimension === 'month') return 'line';
  if (dimension === 'user' || dimension === 'category') return 'bar';
  return 'value';
}

// ── Date windows ──────────────────────────────────────────────────
// Mixpanel's export API takes YYYY-MM-DD. Without this, "today" silently fell
// through to the 7-day default and reported a week of orders as today's.
const REPORT_TZ = 'America/Chicago';

/** YYYY-MM-DD for a Date in the reporting timezone (en-CA formats as ISO). */
function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: REPORT_TZ });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Resolve a time window from natural language. Returns null when the question
 * doesn't name one, so the caller keeps its default.
 */
export function parseDateWindow(question: string, now = new Date()): { fromDate: string; toDate: string } | null {
  const q = question.toLowerCase();
  const today = ymd(now);
  const day = (d: Date) => ({ fromDate: ymd(d), toDate: ymd(d) });

  // Explicit calendar dates win — "7/31/26", "2026-07-31", "July 31, 2026"
  const iso = q.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { fromDate: iso[0], toDate: iso[0] };

  const slash = q.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const [, m, d, rawY] = slash;
    const year = rawY.length === 2 ? 2000 + Number(rawY) : Number(rawY);
    const stamp = `${year}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    return { fromDate: stamp, toDate: stamp };
  }

  const named = q.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:\\w{0,2})?(?:,?\\s*(\\d{4}))?`));
  if (named) {
    const month = MONTHS.indexOf(named[1]) + 1;
    const year = named[3] ? Number(named[3]) : Number(today.slice(0, 4));
    const stamp = `${year}-${String(month).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`;
    return { fromDate: stamp, toDate: stamp };
  }

  if (/\btoday\b|\bso far today\b|\bthis hour\b/.test(q)) return { fromDate: today, toDate: today };
  if (/\byesterday\b/.test(q)) return day(daysAgo(1));

  const lastNDays = q.match(/\blast\s+(\d+)\s*days?\b/);
  if (lastNDays) return { fromDate: ymd(daysAgo(Number(lastNDays[1]))), toDate: today };

  const lastNWeeks = q.match(/\blast\s+(\d+)\s*weeks?\b/);
  if (lastNWeeks) return { fromDate: ymd(daysAgo(Number(lastNWeeks[1]) * 7)), toDate: today };

  const lastNMonths = q.match(/\blast\s+(\d+)\s*months?\b/);
  if (lastNMonths) return { fromDate: ymd(daysAgo(Number(lastNMonths[1]) * 30)), toDate: today };

  if (/\bthis week\b/.test(q)) return { fromDate: ymd(daysAgo(now.getDay())), toDate: today };
  if (/\blast week\b/.test(q)) return { fromDate: ymd(daysAgo(now.getDay() + 7)), toDate: ymd(daysAgo(now.getDay() + 1)) };
  if (/\bthis month\b/.test(q)) return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
  if (/\blast month\b/.test(q)) {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { fromDate: ymd(first), toDate: ymd(last) };
  }
  if (/\bthis year\b/.test(q)) return { fromDate: `${today.slice(0, 4)}-01-01`, toDate: today };

  return null;
}

/** Does the question pin down a time window, or are we silently assuming one? */
function specifiesDateRange(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(today|yesterday|this week|last week|this month|last month|this year|last year|since|between|ytd)\b/.test(q)
    || /\blast\s+\d+\s*(day|week|month)/.test(q)
    || /\d{4}-\d{2}-\d{2}/.test(q)
    || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(q);
}

/**
 * Append clarification guidance so the AI can resolve ambiguity with the user
 * instead of quietly guessing at a metric definition.
 */
function buildClarificationBlock(notes: string[], questions: string[]): string {
  if (notes.length === 0 && questions.length === 0) return '';
  let block = `\n${MODEL_ONLY_START}\nASSUMPTIONS MADE FOR THIS QUERY:\n`;
  for (const n of notes) block += `  • ${n}\n`;
  if (questions.length > 0) {
    block += '\nAMBIGUITY — resolve with the user:\n';
    for (const q of questions) block += `  • ${q}\n`;
    block += 'End your answer with exactly ONE short follow-up question covering the most important item above. Answer with the data you have first — never withhold the numbers while waiting for an answer.\n';
  } else {
    block += 'Briefly state the time window you used so the user can correct it. Do not ask a follow-up question otherwise.\n';
  }
  return `${block}${MODEL_ONLY_END}\n`;
}

/** Cap on rows serialized into the raw block — keeps the prompt (and the retained
 *  copy stored on the thread) bounded on large exports. */
const MAX_RAW_ROWS = 200;

export interface RawResultPayload {
  event: string;
  fromDate: string;
  toDate: string;
  filters: Record<string, unknown>;
  breakdown?: string | null;
  totals: Record<string, number>;
  rows: Record<string, unknown>[];
}

/**
 * Emit the underlying rows and totals as JSON so the AI can reason over
 * individual data points — the rendered chart and table are for the human, and
 * the AI cannot read pixels.
 */
export function buildRawResultBlock(payload: RawResultPayload): string {
  const truncated = payload.rows.length > MAX_RAW_ROWS;
  const body = {
    ...payload,
    rows: truncated ? payload.rows.slice(0, MAX_RAW_ROWS) : payload.rows,
    ...(truncated ? { rowsTruncated: { shown: MAX_RAW_ROWS, total: payload.rows.length } } : {}),
  };
  return `\n${MODEL_ONLY_START}\nRAW RESULT (JSON — the exact data behind the visual above. Use it to answer questions about specific rows, totals, or values. Quote figures from here verbatim; do not print this block back to the user):\n\`\`\`json\n${JSON.stringify(body)}\n\`\`\`\n${MODEL_ONLY_END}\n`;
}

/**
 * Everything between these markers is written for the model, not the user: raw
 * JSON and instructions about how to answer. Any surface that renders a query
 * result to a human MUST strip it — the client's chart/table parser does not,
 * so leaving it in dumps the whole payload on screen.
 */
export const MODEL_ONLY_START = '<<<KAN_MODEL_ONLY>>>';
export const MODEL_ONLY_END = '<<<END_KAN_MODEL_ONLY>>>';

const MODEL_ONLY_RE = new RegExp(`${MODEL_ONLY_START}[\\s\\S]*?${MODEL_ONLY_END}`, 'g');

/** Remove model-only sections so the remainder is safe to show or speak. */
export function stripModelOnlyBlocks(context: string): string {
  return context
    .replace(MODEL_ONLY_RE, '')
    // Defensive: strip a raw block even if the markers were lost in transit.
    .replace(/RAW RESULT \(JSON[\s\S]*?```json\n[\s\S]*?\n```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Format a UTC-ish epoch seconds value into a period bucket label. */
function bucketLabel(epochSeconds: number, dimension: 'day' | 'week' | 'month'): string {
  if (!epochSeconds) return '?';
  const d = new Date(epochSeconds * 1000);
  if (dimension === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Chicago' });
  }
  if (dimension === 'week') {
    const weekStart = new Date(d.getTime() - d.getDay() * 24 * 60 * 60 * 1000);
    return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
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

    // Explicit options win, then a window named in the question, then the default.
    const now = new Date();
    const asked = parseDateWindow(question, now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const toDate = options?.toDate || asked?.toDate || ymd(now);
    const fromDate = options?.fromDate || asked?.fromDate || ymd(weekAgo);

    const lowerQ = question.toLowerCase();
    const breakdown = parseBreakdown(question);
    const wantsEmails = /emails?|users?|customers?|who ordered|who bought|who placed|show me.*(people|customers|users)/.test(lowerQ)
      || breakdown?.dimension === 'user';
    const categoryFilter = detectCategory(lowerQ);

    // Track what we had to assume so the AI can surface it instead of guessing silently.
    const clarifyNotes: string[] = [];
    const clarifyQuestions: string[] = [];
    if (!options?.fromDate && !asked && !specifiesDateRange(question)) {
      clarifyNotes.push(`No time window was given — used ${fromDate} to ${toDate} (last 7 days).`);
    }
    if (breakdown && !breakdown.dimension) {
      clarifyQuestions.push(`The user asked to break down by "${breakdown.rawTerm}", which is not an available dimension. Supported breakdowns are: user, category, day, week, month. Ask which one they meant.`);
    }

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

      // "How many people ordered?" is a distinct-person count, not an order count —
      // report both so the answer matches whichever was asked.
      const uniquePeople = new Set(orderDetails.map(o => o.resolvedId)).size;

      // Build context — focused on what was asked
      const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
      let context = `MIXPANEL DATA (${rangeLabel}):\n`;
      context += `${catLabel} Orders: ${totalOrders}\n`;
      context += `People who ordered (distinct users): ${uniquePeople}\n`;
      context += `Revenue: $${totalRevenue.toFixed(2)}\n`;
      if (totalQuantity) context += `Quantity: ${totalQuantity.toLocaleString()}\n`;

      const emailOf = (o: typeof orderDetails[number]) => ((o as Record<string, unknown>).email as string) || '';

      // Raw rows in machine-readable form. The rendered table/chart is for the
      // user; this is what lets the AI answer "which order was $600 and whose
      // was it?" without re-querying.
      context += buildRawResultBlock({
        event: 'print_order',
        fromDate,
        toDate,
        filters: categoryFilter ? { category: categoryFilter } : {},
        breakdown: breakdown?.dimension || null,
        totals: {
          orders: totalOrders,
          uniquePeople,
          revenue: Number(totalRevenue.toFixed(2)),
          ...(totalQuantity ? { quantity: totalQuantity } : {}),
        },
        rows: orderDetails.map(o => ({
          orderId: o.id,
          email: emailOf(o) || null,
          userId: o.resolvedId,
          total: o.total,
          categories: o.categories,
          date: o.date ? new Date(o.date * 1000).toISOString().split('T')[0] : null,
        })),
      });

      // A recognized breakdown ALWAYS emits a data table plus one chart matched to
      // the dimension. This is what makes "print orders by user" deterministic
      // instead of hit or miss.
      if (breakdown?.dimension && totalOrders > 0) {
        const dim = breakdown.dimension;
        const groups = new Map<string, { orders: number; revenue: number; last: number }>();
        const addTo = (key: string, revenue: number, date: number) => {
          const g = groups.get(key) || { orders: 0, revenue: 0, last: 0 };
          g.orders += 1;
          g.revenue += revenue;
          if (date > g.last) g.last = date;
          groups.set(key, g);
        };

        for (const o of orderDetails) {
          if (dim === 'user') {
            addTo(emailOf(o) || o.resolvedId || 'Unknown', o.total, o.date);
          } else if (dim === 'category') {
            // One order can span categories — split its revenue evenly so the
            // column still sums to the reported total.
            const cats = o.categories.length ? Array.from(new Set(o.categories)) : ['Uncategorized'];
            for (const c of cats) addTo(c, o.total / cats.length, o.date);
          } else {
            addTo(bucketLabel(o.date, dim), o.total, o.date);
          }
        }

        const isTimeDim = dim === 'day' || dim === 'week' || dim === 'month';
        const entries = Array.from(groups.entries()).sort((a, b) =>
          isTimeDim ? a[1].last - b[1].last : b[1].orders - a[1].orders || b[1].revenue - a[1].revenue
        );

        if (dim === 'user' && !hasAnyEmail) {
          context += `\nNote: Customer emails are not available for these orders — users are identified by Mixpanel distinct ID.\n`;
        }

        const dimColumn = dim === 'user' ? 'user' : dim === 'category' ? 'category' : dim;
        const columns = dim === 'user'
          ? [dimColumn, 'orders', 'revenue', 'last order']
          : [dimColumn, 'orders', 'revenue'];
        const rows = entries.map(([key, g]) => {
          const row: Record<string, string> = {
            [dimColumn]: key,
            orders: String(g.orders),
            revenue: `$${g.revenue.toFixed(2)}`,
          };
          if (dim === 'user') row['last order'] = g.last ? bucketLabel(g.last, 'day') : '—';
          return row;
        });

        const titleDim = dimColumn.charAt(0).toUpperCase() + dimColumn.slice(1);
        context += `\n\`\`\`table\n${JSON.stringify({
          title: `${catLabel} Orders by ${titleDim}`,
          columns,
          rows,
        })}\n\`\`\`\n`;

        const chartData = (isTimeDim ? entries : entries.slice(0, 10))
          .map(([label, g]) => ({ label, value: g.orders }));
        const chartType = resolveChartType(options, question, defaultChartForBreakdown(dim), chartData.length);
        context += `\n\`\`\`chart\n${JSON.stringify({
          type: chartType,
          title: `${catLabel} Orders by ${titleDim}`,
          data: chartType === 'value' ? [{ label: 'Orders', value: totalOrders }] : chartData,
          color: 'violet',
          label: 'Orders',
        })}\n\`\`\`\n`;
      } else if (wantsEmails) {
        // Individual order rows — with emails when we could resolve them
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
      } else if (totalOrders > 0) {
        // No breakdown asked for — a headline metric card, unless the phrasing
        // asks for a trend or a comparison.
        const categoryMap: Record<string, number> = {};
        for (const o of orderDetails) {
          const cat = o.categories[0] || 'Other';
          categoryMap[cat] = (categoryMap[cat] || 0) + 1;
        }
        const categoryData = Object.entries(categoryMap)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);

        const dailyMap: Record<string, number> = {};
        for (const o of orderDetails) {
          dailyMap[bucketLabel(o.date, 'day')] = (dailyMap[bucketLabel(o.date, 'day')] || 0) + 1;
        }
        const dailyData = Object.entries(dailyMap).map(([label, value]) => ({ label, value }));

        const chartType = resolveChartType(options, question, 'value', dailyData.length);

        if (chartType === 'value') {
          const metrics: Array<{ label: string; value: number; prefix?: string }> = [
            { label: `${catLabel} Orders`, value: totalOrders },
            { label: 'Revenue', value: Number(totalRevenue.toFixed(2)), prefix: '$' },
          ];
          if (totalQuantity) metrics.push({ label: 'Quantity', value: totalQuantity });
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: 'value',
            title: `${catLabel} Orders — ${fromDate} to ${toDate}`,
            data: metrics,
            color: 'violet',
          })}\n\`\`\`\n`;
        } else if (chartType === 'pie' || chartType === 'donut') {
          const pieData = categoryData.length > 1 ? categoryData : dailyData;
          const pieTitle = categoryData.length > 1 ? `${catLabel} Orders by Category` : `${catLabel} Orders by Day`;
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: chartType,
            title: pieTitle,
            data: pieData,
            color: 'violet',
            label: 'Orders',
          })}\n\`\`\`\n`;
        } else {
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: chartType,
            title: `${catLabel} Orders by Day`,
            data: dailyData,
            color: 'violet',
            label: 'Orders',
          })}\n\`\`\`\n`;
        }
      }

      context += buildClarificationBlock(clarifyNotes, clarifyQuestions);

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
        // Bucket by the requested time grain (day unless the user asked otherwise)
        const timeDim: 'day' | 'week' | 'month' =
          breakdown?.dimension === 'week' || breakdown?.dimension === 'month' ? breakdown.dimension : 'day';
        const bucketMap: Record<string, number> = {};
        for (const evt of rawEvents) {
          const label = bucketLabel((evt.properties.time as number) || 0, timeDim);
          bucketMap[label] = (bucketMap[label] || 0) + 1;
        }
        const bucketData = Object.entries(bucketMap).map(([label, value]) => ({ label, value }));

        const filterLabel = filter ? ` (filtered: ${filter.property} = "${filter.value}")` : '';
        let context = `MIXPANEL DATA for "${eventName}"${filterLabel} (${fromDate} to ${toDate}):\n`;
        context += `Total events: ${rawEvents.length}\n`;

        // Show available properties for drill-down
        if (availableProps.length > 0) {
          context += `\nAvailable properties to drill into: ${availableProps.join(', ')}\n`;
          context += `(Ask about any property to see its values, or filter by property = value)\n`;
        }

        // A property breakdown on an arbitrary event needs a property name we
        // don't have — surface the options rather than guessing at one.
        if (breakdown && !['day', 'week', 'month'].includes(breakdown.dimension || '') && availableProps.length > 0) {
          const propMatch = availableProps.find(p => p.toLowerCase() === breakdown.rawTerm || p.toLowerCase().includes(breakdown.rawTerm));
          if (propMatch) {
            const values = await getPropertyValues(eventName, propMatch).catch(() => [] as string[]);
            if (values.length > 0) {
              const counts = new Map<string, number>();
              for (const evt of rawEvents) {
                const v = evt.properties[propMatch];
                const key = v === undefined || v === null || v === '' ? '(not set)' : String(v);
                counts.set(key, (counts.get(key) || 0) + 1);
              }
              const rows = Array.from(counts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => ({ [propMatch]: k, events: String(n) }));
              context += `\n\`\`\`table\n${JSON.stringify({
                title: `${eventName} by ${propMatch}`,
                columns: [propMatch, 'events'],
                rows,
              })}\n\`\`\`\n`;
              const chartData = rows.slice(0, 10).map(r => ({ label: r[propMatch], value: Number(r.events) }));
              context += `\n\`\`\`chart\n${JSON.stringify({
                type: resolveChartType(options, question, 'bar', chartData.length),
                title: `${eventName} by ${propMatch}`,
                data: chartData,
                color: 'violet',
                label: 'Events',
              })}\n\`\`\`\n`;
              context += buildRawResultBlock({
                event: eventName,
                fromDate,
                toDate,
                filters: filter ? { [filter.property]: filter.value } : {},
                breakdown: propMatch,
                totals: { events: rawEvents.length, groups: rows.length },
                rows: Array.from(counts.entries()).map(([k, n]) => ({ [propMatch]: k, events: n })),
              });
              context += buildClarificationBlock(clarifyNotes, clarifyQuestions);
              return context;
            }
          } else {
            clarifyQuestions.push(`The user asked to break down "${eventName}" by "${breakdown.rawTerm}", which is not a tracked property. Available properties: ${availableProps.join(', ')}. Ask which one they meant.`);
          }
        }

        const chartType = resolveChartType(options, question, defaultChartForBreakdown(breakdown?.dimension), bucketData.length);
        if (chartType === 'value') {
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: 'value',
            title: `${eventName}${filterLabel}`,
            data: [{ label: 'Events', value: rawEvents.length }],
            color: 'violet',
          })}\n\`\`\`\n`;
        } else {
          context += `\n\`\`\`chart\n${JSON.stringify({
            type: chartType,
            title: `${eventName}${filterLabel} by ${timeDim.charAt(0).toUpperCase() + timeDim.slice(1)}`,
            data: bucketData,
            color: 'violet',
            label: 'Events',
          })}\n\`\`\`\n`;
        }

        context += buildRawResultBlock({
          event: eventName,
          fromDate,
          toDate,
          filters: filter ? { [filter.property]: filter.value } : {},
          breakdown: timeDim,
          totals: { events: rawEvents.length },
          rows: bucketData.map(b => ({ [timeDim]: b.label, events: b.value })),
        });
        context += buildClarificationBlock(clarifyNotes, clarifyQuestions);
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

    // ONE chart. Ranking many events is a real comparison, so bar is the default —
    // but a share-of-total question gets the donut instead, and a single event
    // collapses to a metric card.
    const eventData = topEvents.map(e => ({ label: e.event, value: e.amount }));
    const topChartType = resolveChartType(options, question, 'bar', eventData.length);
    context += `\n\`\`\`chart\n${JSON.stringify({
      type: topChartType,
      title: topChartType === 'pie' || topChartType === 'donut' ? 'Event Distribution' : 'Top Events (Last 30 Days)',
      data: topChartType === 'pie' || topChartType === 'donut' ? eventData.slice(0, 6) : eventData,
      color: 'violet',
      label: 'Events',
    })}\n\`\`\`\n`;

    context += buildRawResultBlock({
      event: '(all events)',
      fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      toDate: new Date().toISOString().split('T')[0],
      filters: {},
      breakdown: 'event',
      totals: { events: topEvents.reduce((sum, e) => sum + e.amount, 0) },
      rows: topEvents.map(e => ({ event: e.event, count: e.amount })),
    });
    context += buildClarificationBlock([], clarifyQuestions);

    return context;

  } catch (err) {
    console.error('[Mixpanel Direct]', err);
    return '';
  }
}
