import { describe, it, expect } from 'vitest';
import {
  detectsDataFollowUp,
  detectsMixpanelIntent,
  extractRawResultBlock,
  trimRetainedData,
} from '@/lib/ai/dataSourceContext';
import { buildRawResultBlock } from '@/lib/ai/mixpanelDirect';

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
