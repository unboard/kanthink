import { describe, it, expect } from 'vitest';
import {
  inferColumnSentiment,
  analyzeColumnTopology,
  analyzeInstructionEffectiveness,
  buildBoardContext,
  buildRejectionContext,
} from '@/lib/ai/feedbackAnalyzer';
import type { Card, CardRejection, Channel, Column } from '@/lib/types';

function column(name: string, cardIds: string[] = []): Column {
  return { id: `col-${name.toLowerCase().replace(/\s+/g, '-')}`, name, cardIds };
}

function channel(columns: Column[]): Channel {
  return {
    id: 'ch1',
    name: 'Test channel',
    description: '',
    status: 'active',
    aiInstructions: '',
    columns,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Channel;
}

function aiCard(id: string, title = 'A card'): Card {
  return {
    id,
    channelId: 'ch1',
    title,
    messages: [],
    source: 'ai',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Card;
}

function rejection(overrides: Partial<CardRejection>): CardRejection {
  return {
    channelId: 'ch1',
    instructionCardId: 'shroom-a',
    rejectedCardTitle: 'Some card',
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Column names were matched with `includes()`, which is a substring test. Every case
 * below was a real misreading, and each one taught shrooms something false.
 */
describe('column sentiment reads whole words', () => {
  it('does not find "low" inside "Follow Up"', () => {
    expect(inferColumnSentiment('Follow Up')).not.toBe('negative');
  });

  it('does not find "no" inside "Notes"', () => {
    expect(inferColumnSentiment('Notes')).not.toBe('negative');
  });

  it('does not find "done" inside "Abandoned"', () => {
    expect(inferColumnSentiment('Abandoned')).not.toBe('done');
  });

  it('does not find "new" inside "Renewals"', () => {
    expect(inferColumnSentiment('Renewals')).not.toBe('inbox');
  });

  it('still reads the names it is meant to', () => {
    expect(inferColumnSentiment('Dislike')).toBe('negative');
    expect(inferColumnSentiment('Like')).toBe('positive');
    expect(inferColumnSentiment('Inbox')).toBe('inbox');
    expect(inferColumnSentiment('Done')).toBe('done');
    expect(inferColumnSentiment('In Progress')).toBe('progress');
    expect(inferColumnSentiment('This Week')).toBe('progress');
  });
});

/**
 * Archiving something can mean it was useful and is finished. Reading it as rejection
 * taught shrooms to stop generating the very things that worked.
 */
describe('archive is not a rejection', () => {
  it('leaves "Archive" unjudged', () => {
    expect(inferColumnSentiment('Archive')).not.toBe('negative');
    expect(inferColumnSentiment('Archived')).not.toBe('negative');
  });

  it('leaves priority names unjudged', () => {
    expect(inferColumnSentiment('Low priority')).not.toBe('negative');
    expect(inferColumnSentiment('High priority')).not.toBe('positive');
  });
});

/**
 * "You have not looked at this yet" is not "you did not want this".
 */
describe('acceptance rate counts only what was actually sorted', () => {
  const cards: Record<string, Card> = {
    a: aiCard('a'),
    b: aiCard('b'),
    c: aiCard('c'),
    d: aiCard('d'),
    e: aiCard('e'),
  };

  it('ignores untriaged cards sitting in the inbox', () => {
    const ch = channel([
      column('Inbox', ['a', 'b', 'c', 'd']),
      column('Like', ['e']),
      column('Dislike'),
    ]);
    const topology = analyzeColumnTopology(ch, cards);
    const stats = analyzeInstructionEffectiveness(ch, cards, topology).get('all-ai')!;

    expect(stats.neutralCount).toBe(4);
    expect(stats.reviewedCount).toBe(1);
    expect(stats.acceptanceRate).toBe(1);
  });

  it('still reports a genuinely bad run as bad', () => {
    const ch = channel([
      column('Inbox'),
      column('Like', ['a']),
      column('Dislike', ['b', 'c', 'd', 'e']),
    ]);
    const topology = analyzeColumnTopology(ch, cards);
    const stats = analyzeInstructionEffectiveness(ch, cards, topology).get('all-ai')!;

    expect(stats.reviewedCount).toBe(5);
    expect(stats.acceptanceRate).toBeCloseTo(0.2);
  });
});

/**
 * The board context describes the board. It must never claim to know what the user
 * likes — that came from a hardcoded list of cuisines and is gone.
 */
describe('board context does not invent preferences', () => {
  const cards: Record<string, Card> = {
    a: aiCard('a', 'Thai green curry with tofu'),
    b: aiCard('b', 'Spicy Korean kimchi stew'),
    c: aiCard('c', 'Quick vegan breakfast oats'),
  };
  const ch = channel([column('Inbox'), column('Like', ['a']), column('Dislike', ['b', 'c'])]);

  it('says nothing about content themes', () => {
    const context = buildBoardContext(ch, cards) ?? '';
    expect(context).not.toMatch(/cuisine/i);
    expect(context).not.toMatch(/AVOID generating/i);
    expect(context).not.toMatch(/PREFER generating/i);
    expect(context).not.toMatch(/vegan|thai|korean|breakfast/i);
  });

  it('marks untriaged cards as carrying no signal', () => {
    const withInbox = channel([
      column('Inbox', ['a', 'b']),
      column('Like'),
      column('Dislike', ['c']),
    ]);
    const context = buildBoardContext(withInbox, cards) ?? '';
    expect(context).toMatch(/not yet triaged/i);
    expect(context).toMatch(/do not treat these as rejected/i);
  });
});

/**
 * A rejection is stored against the shroom that made the card, and that shroom's
 * "What we've learned" panel reads it that way. The prompt must agree, or the panel
 * is describing a loop that isn't running.
 */
describe('rejection context is scoped to the shroom being run', () => {
  const entries: CardRejection[] = [
    rejection({
      instructionCardId: 'shroom-b',
      rejectedCardTitle: 'Not mine 1',
      timestamp: '2026-03-09T00:00:00.000Z',
    }),
    rejection({
      instructionCardId: 'shroom-b',
      rejectedCardTitle: 'Not mine 2',
      timestamp: '2026-03-08T00:00:00.000Z',
    }),
    rejection({
      instructionCardId: 'shroom-a',
      rejectedCardTitle: 'Mine',
      reason: 'too_vague',
      feedback: 'Give me specifics, not themes',
      timestamp: '2026-01-02T00:00:00.000Z',
    }),
  ];

  it('leads with the running shroom own rejections, however old', () => {
    const context = buildRejectionContext(entries, 'ch1', 'shroom-a') ?? '';
    expect(context).toContain('THIS shroom');
    expect(context).toContain('Mine');
    expect(context).toContain('Give me specifics, not themes');
    // Its own lesson comes before the neighbours', despite being the oldest row.
    expect(context.indexOf('Mine')).toBeLessThan(context.indexOf('Not mine 1'));
  });

  it('marks other shrooms rejections as the weaker signal', () => {
    const context = buildRejectionContext(entries, 'ch1', 'shroom-a') ?? '';
    expect(context).toMatch(/weaker signal/i);
  });

  it('keeps the old channel-wide behaviour when no shroom is named', () => {
    const context = buildRejectionContext(entries, 'ch1') ?? '';
    expect(context).toContain('Recent rejections from this channel');
    expect(context).not.toMatch(/weaker signal/i);
  });

  it('ignores other channels entirely', () => {
    const other = [rejection({ channelId: 'ch2', rejectedCardTitle: 'Elsewhere' })];
    expect(buildRejectionContext(other, 'ch1', 'shroom-a')).toBeNull();
  });
});
