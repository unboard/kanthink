import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectsDataFollowUp,
  detectsMixpanelIntent,
  extractRawResultBlock,
  trimRetainedData,
} from '@/lib/ai/dataSourceContext';
import { buildRawResultBlock, stripModelOnlyBlocks, parseDateWindow, resolveDateWindow } from '@/lib/ai/mixpanelDirect';

describe('raw result round-trip', () => {
  const payload = {
    event: 'print_order',
    fromDate: '2026-07-23',
    toDate: '2026-07-30',
    filters: {},
    breakdown: null,
    totals: { orders: 3, revenue: 912.5 },
    rows: [
      { orderId: '1001', email: 'a@example.com', userId: 'u1', total: 600, categories: ['Poster'], date: '2026-07-25' },
      { orderId: '1002', email: null, userId: 'u2', total: 212.5, categories: ['Flyer'], date: '2026-07-26' },
      { orderId: '1003', email: 'c@example.com', userId: 'u3', total: 100, categories: [], date: '2026-07-27' },
    ],
  };

  it('emits a block the extractor can parse back into the same data', () => {
    const block = buildRawResultBlock(payload);
    const extracted = extractRawResultBlock(block);
    expect(extracted).not.toBeNull();

    const parsed = JSON.parse(extracted!);
    expect(parsed.totals.revenue).toBe(912.5);
    expect(parsed.event).toBe('print_order');
    expect(parsed.fromDate).toBe('2026-07-23');
    expect(parsed.rows).toHaveLength(3);
  });

  it('carries the detail needed to answer "who placed the $600 order"', () => {
    const parsed = JSON.parse(extractRawResultBlock(buildRawResultBlock(payload))!);
    const match = parsed.rows.find((r: { total: number }) => r.total === 600);
    expect(match.email).toBe('a@example.com');
    expect(match.orderId).toBe('1001');
  });

  it('extracts the block even when surrounded by other context', () => {
    const context = `MIXPANEL DATA (2026-07-23 to 2026-07-30):\nOrders: 3\n`
      + '```chart\n{"type":"value","data":[{"label":"Orders","value":3}]}\n```\n'
      + buildRawResultBlock(payload)
      + '\nASSUMPTIONS MADE FOR THIS QUERY:\n  • No time window was given.\n';
    const parsed = JSON.parse(extractRawResultBlock(context)!);
    expect(parsed.rows).toHaveLength(3);
  });

  it('truncates oversized row sets but stays valid JSON', () => {
    const many = { ...payload, rows: Array.from({ length: 500 }, (_, i) => ({ orderId: String(i), total: i })) };
    const parsed = JSON.parse(extractRawResultBlock(buildRawResultBlock(many))!);
    expect(parsed.rows).toHaveLength(200);
    expect(parsed.rowsTruncated).toEqual({ shown: 200, total: 500 });
  });

  it('caps the retained copy stored on a thread', () => {
    expect(trimRetainedData('x'.repeat(20000)).length).toBe(8000);
    expect(trimRetainedData('short')).toBe('short');
  });
});

describe('model-only blocks never reach the user', () => {
  const payload = {
    event: 'print_order',
    fromDate: '2026-07-31',
    toDate: '2026-07-31',
    filters: {},
    totals: { orders: 4 },
    rows: [{ orderId: '508494', email: null, total: 332.32 }],
  };

  it('strips the raw JSON block from a display payload', () => {
    const context = 'MIXPANEL DATA (2026-07-31):\nPrint Orders: 4\n'
      + '```chart\n{"type":"value","data":[{"label":"Orders","value":4}]}\n```\n'
      + buildRawResultBlock(payload);

    const display = stripModelOnlyBlocks(context);
    expect(display).toContain('Print Orders: 4');
    expect(display).not.toContain('RAW RESULT');
    expect(display).not.toContain('508494');
    expect(display).not.toContain('orderId');
    // Chart directives survive so the UI can still render the visual.
    expect(display).toContain('```chart');
  });

  it('strips assumption/instruction blocks meant for the model', () => {
    const context = 'MIXPANEL DATA (2026-07-24 to 2026-07-31):\nPrint Orders: 47\n'
      + '<<<KAN_MODEL_ONLY>>>\nASSUMPTIONS MADE FOR THIS QUERY:\n  • No time window was given.\n'
      + 'End your answer with exactly ONE short follow-up question.\n<<<END_KAN_MODEL_ONLY>>>\n';

    const display = stripModelOnlyBlocks(context);
    expect(display).toContain('Print Orders: 47');
    expect(display).not.toContain('ASSUMPTIONS');
    expect(display).not.toContain('follow-up question');
  });

  it('still strips a raw block whose markers were lost', () => {
    const unmarked = buildRawResultBlock(payload)
      .replace('<<<KAN_MODEL_ONLY>>>\n', '')
      .replace('<<<END_KAN_MODEL_ONLY>>>', '');
    expect(stripModelOnlyBlocks(`Orders: 4\n${unmarked}`)).not.toContain('508494');
  });

  it('leaves the raw block intact for the model', () => {
    const context = `Orders: 4\n${buildRawResultBlock(payload)}`;
    expect(extractRawResultBlock(context)).not.toBeNull();
  });
});

describe('date windows from natural language', () => {
  // 2026-07-31 was a Friday.
  const now = new Date('2026-07-31T15:00:00-05:00');

  it('honours "today" instead of falling back to the 7-day default', () => {
    expect(parseDateWindow('How many print order events did we have today', now))
      .toEqual({ fromDate: '2026-07-31', toDate: '2026-07-31' });
  });

  it('reads an explicit slash date like 7/31/26', () => {
    expect(parseDateWindow('print orders today 7/31/26', now))
      .toEqual({ fromDate: '2026-07-31', toDate: '2026-07-31' });
  });

  it('reads ISO and month-name dates', () => {
    expect(parseDateWindow('orders on 2026-07-04', now))
      .toEqual({ fromDate: '2026-07-04', toDate: '2026-07-04' });
    expect(parseDateWindow('orders on July 4, 2026', now))
      .toEqual({ fromDate: '2026-07-04', toDate: '2026-07-04' });
  });

  it('handles yesterday and relative ranges', () => {
    expect(parseDateWindow('orders yesterday', now))
      .toEqual({ fromDate: '2026-07-30', toDate: '2026-07-30' });
    expect(parseDateWindow('orders in the last 3 days', now))
      .toEqual({ fromDate: '2026-07-28', toDate: '2026-07-31' });
    expect(parseDateWindow('orders this month', now))
      .toEqual({ fromDate: '2026-07-01', toDate: '2026-07-31' });
  });

  it('returns null when no window is named, so the caller keeps its default', () => {
    expect(parseDateWindow('how many print orders do we have', now)).toBeNull();
  });
});

describe('a stalled Mixpanel never hangs the caller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
  });

  /** Stand-in for a Mixpanel request that never answers, but honours abort. */
  function hangingFetch() {
    return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
  }

  /** Credentials are captured at module load, so reload with them stubbed in. */
  async function loadWithCredentials() {
    vi.stubEnv('MIXPANEL_API_SECRET', 'test-secret');
    vi.stubEnv('MIXPANEL_PROJECT_ID', '12345');
    vi.resetModules();
    return import('@/lib/ai/mixpanelDirect');
  }

  it('aborts an export that stalls, instead of waiting forever', async () => {
    const mod = await loadWithCredentials();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const pending = mod.exportEvents({ event: 'print_order', fromDate: '2026-07-31', toDate: '2026-07-31' });
    const assertion = expect(pending).rejects.toBeInstanceOf(mod.MixpanelTimeoutError);
    await vi.advanceTimersByTimeAsync(21000);
    await assertion;
  });

  it('names a failing HTTP status instead of reporting no data', async () => {
    const mod = await loadWithCredentials();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unable to authenticate request', { status: 400 })));

    const out = await mod.queryForChat('how many print orders today');

    // "" would surface as "no data found" — an empty account, not a broken call.
    expect(out).not.toBe('');
    expect(out).toContain('MIXPANEL QUERY FAILED');
    expect(out).toContain('400');
    expect(out).toContain('Unable to authenticate request');
  });

  it('reports the timeout to the model rather than an empty result', async () => {
    const mod = await loadWithCredentials();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const pending = mod.queryForChat('how many print orders today');
    await vi.advanceTimersByTimeAsync(21000);
    const out = await pending;

    // An empty string would surface as "no data found" — an empty account, not a slow API.
    expect(out).not.toBe('');
    expect(out).toMatch(/timed out/i);
    expect(out).toMatch(/do not report zero|do not.*invent/i);
  });
});

describe('date window carries across follow-ups', () => {
  const now = new Date('2026-07-31T15:00:00-05:00');
  const today = { fromDate: '2026-07-31', toDate: '2026-07-31' };

  it('keeps the agreed day when the follow-up names no date', () => {
    // "orders today" → then "yes, break that down by product"
    const first = resolveDateWindow('how many orders today', {}, now);
    expect(first).toMatchObject({ ...today, source: 'question' });

    const second = resolveDateWindow('yes, break that down by product', { previous: first }, now);
    expect(second).toMatchObject({ ...today, source: 'previous' });
  });

  it('lets a new date in the follow-up override the carried window', () => {
    const second = resolveDateWindow('what about last 30 days', { previous: today }, now);
    expect(second.source).toBe('question');
    expect(second.fromDate).toBe('2026-07-01');
    expect(second.toDate).toBe('2026-07-31');
  });

  it('prefers an explicit caller override over everything', () => {
    const w = resolveDateWindow('orders today', {
      fromDate: '2026-01-01', toDate: '2026-01-31', previous: today,
    }, now);
    expect(w).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-01-31', source: 'explicit' });
  });

  it('falls back to the 7-day default with nothing to go on', () => {
    const w = resolveDateWindow('how are orders doing', {}, now);
    expect(w).toMatchObject({ fromDate: '2026-07-24', toDate: '2026-07-31', source: 'default' });
  });
});

describe('data follow-up detection', () => {
  // These never mention "mixpanel", so intent detection alone drops them.
  const followUps = [
    "what's the email for the $600 order?",
    'who placed that order?',
    'which customer spent the most?',
    'can you break that down by category instead?',
    'what was the highest order?',
    'show me the emails',
    'what is in the table for July?',
  ];

  it.each(followUps)('treats %j as a data follow-up', (q) => {
    expect(detectsMixpanelIntent(q)).toBe(false);
    expect(detectsDataFollowUp(q)).toBe(true);
  });

  // Ordinary channel chat must not be mistaken for an analytics question, even
  // in a thread that previously returned data.
  const ordinary = [
    'who should own this card?',
    'what should I work on next?',
    'move this to Done please',
    'can you write a summary of this channel?',
    'create a card for the onboarding redesign',
  ];

  it.each(ordinary)('leaves %j alone', (q) => {
    expect(detectsDataFollowUp(q)).toBe(false);
  });
});
