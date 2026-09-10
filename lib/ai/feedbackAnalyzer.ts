/**
 * Feedback Analyzer
 *
 * Reads the shape of a board: what each column is for, and how AI-generated cards
 * have actually been reviewed.
 *
 * What this deliberately does NOT do is guess what the user likes from card content.
 * There is one honest preference signal in the product — the reason someone gives when
 * they reject a generated card — and it lives in `buildRejectionContext` below. Column
 * names tell you a column's ROLE. They do not tell you why any particular card is
 * sitting in it.
 *
 * Design principle: Where cards ARE is the signal, not where they've been.
 * No movement history or deletion tracking - just current state analysis.
 */

import type { Channel, Card, ID, CardRejection } from '../types';

// Column sentiment keywords.
//
// Matched on whole words, never substrings — `includes()` classified "Follow Up" as
// negative (it contains "low"), "Notes" as negative ("no"), "Abandoned" as done
// ("done") and "Renewal" as an inbox ("new"). A column's own name is the only thing
// the user gave us here, so reading it wrong is worse than reading nothing.
//
// Two words are deliberately absent. "Archive" is ambiguous: filing something you
// finished with looks identical to throwing it away, and treating it as rejection
// taught shrooms to avoid the very things that worked. "High"/"low" describe priority,
// not preference — a low-priority column is not a bin.
const POSITIVE_KEYWORDS = ['like', 'liked', 'love', 'loved', 'favorite', 'favorites', 'favourite', 'favourites', 'keep', 'good', 'yes', 'approved', 'accept', 'accepted', 'interesting', 'useful', 'important', 'best', 'starred', 'saved'];
const NEGATIVE_KEYWORDS = ['dislike', 'disliked', 'hate', 'hated', 'trash', 'bin', 'delete', 'deleted', 'bad', 'no', 'nope', 'reject', 'rejected', 'skip', 'skipped', 'irrelevant', 'worst', 'spam', 'ignore', 'ignored', 'discard', 'discarded'];
const INBOX_KEYWORDS = ['inbox', 'new', 'incoming', 'triage', 'unsorted', 'raw', 'ideas', 'backlog', 'capture'];
const DONE_KEYWORDS = ['done', 'complete', 'completed', 'finished', 'shipped', 'published', 'resolved', 'closed'];
const PROGRESS_KEYWORDS = ['progress', 'doing', 'working', 'active', 'current', 'today', 'now', 'next'];

// Multi-word keywords are matched as phrases, on the same word-boundary rule.
const NEGATIVE_PHRASES = ['not relevant', 'not for me', 'no thanks'];
const PROGRESS_PHRASES = ['in progress', 'this week', 'next up'];

/**
 * Whole-word / whole-phrase containment. "follow up" does not contain "low".
 */
function containsWord(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(name);
}

export type ColumnSentiment = 'positive' | 'negative' | 'neutral' | 'inbox' | 'done' | 'progress';
export type BoardType = 'workflow' | 'triage' | 'hybrid' | 'unknown';

export interface ColumnAnalysis {
  columnId: ID;
  columnName: string;
  sentiment: ColumnSentiment;
  isTerminal: boolean;      // Cards tend to stay here (inferred from sentiment)
  isSource: boolean;        // Cards tend to originate here (inferred from position)
  cardCount: number;
}

export interface BoardTopology {
  type: BoardType;
  columns: ColumnAnalysis[];
}

export interface InstructionEffectiveness {
  instructionCardId: ID;
  generatedCount: number;
  acceptedCount: number;      // In positive/done columns
  rejectedCount: number;      // In negative columns
  neutralCount: number;       // Still in inbox or neutral — NOT yet judged
  reviewedCount: number;      // accepted + rejected
  acceptanceRate: number;     // 0-1, over reviewed cards only
  patterns: string[];         // Human-readable insights
}

/**
 * Infer sentiment from column name using keyword matching
 */
export function inferColumnSentiment(columnName: string): ColumnSentiment {
  const name = columnName.toLowerCase().trim();

  // Check each category (order matters - more specific/negative first)
  // IMPORTANT: Check negative BEFORE positive because "dislike" contains "like"
  if (NEGATIVE_PHRASES.some(kw => containsWord(name, kw))) return 'negative';
  if (PROGRESS_PHRASES.some(kw => containsWord(name, kw))) return 'progress';
  if (INBOX_KEYWORDS.some(kw => containsWord(name, kw))) return 'inbox';
  if (DONE_KEYWORDS.some(kw => containsWord(name, kw))) return 'done';
  if (PROGRESS_KEYWORDS.some(kw => containsWord(name, kw))) return 'progress';
  if (NEGATIVE_KEYWORDS.some(kw => containsWord(name, kw))) return 'negative';
  if (POSITIVE_KEYWORDS.some(kw => containsWord(name, kw))) return 'positive';

  return 'neutral';
}

/**
 * Analyze board topology - understand the structure of the board
 * based on column names and positions (no movement history needed)
 */
export function analyzeColumnTopology(
  channel: Channel,
  _cards: Record<string, Card>
): BoardTopology {
  // Build column analysis from current state
  const columnAnalyses: ColumnAnalysis[] = channel.columns.map((col, index) => {
    const sentiment = inferColumnSentiment(col.name);

    // Infer terminal/source from position and sentiment
    // First column is typically source (inbox)
    // Positive/negative/done columns are typically terminal
    const isSource = index === 0 || sentiment === 'inbox';
    const isTerminal = sentiment === 'positive' || sentiment === 'negative' || sentiment === 'done';

    return {
      columnId: col.id,
      columnName: col.name,
      sentiment,
      isTerminal,
      isSource,
      cardCount: col.cardIds.length,
    };
  });

  // Determine board type from column sentiments
  const hasInbox = columnAnalyses.some(c => c.sentiment === 'inbox' || c.isSource);
  const hasProgressColumns = columnAnalyses.some(c => c.sentiment === 'progress');
  const hasPosNeg = columnAnalyses.some(c => c.sentiment === 'positive') &&
                    columnAnalyses.some(c => c.sentiment === 'negative');
  const hasDone = columnAnalyses.some(c => c.sentiment === 'done');

  let boardType: BoardType = 'unknown';
  if (hasProgressColumns || (hasInbox && hasDone)) {
    boardType = 'workflow';
  } else if (hasPosNeg) {
    boardType = 'triage';
  } else if (hasInbox && columnAnalyses.filter(c => c.isTerminal).length > 1) {
    boardType = 'hybrid';
  }

  return {
    type: boardType,
    columns: columnAnalyses,
  };
}

/**
 * Analyze how effective AI-generated cards have been based on
 * their current column positions
 */
export function analyzeInstructionEffectiveness(
  channel: Channel,
  cards: Record<string, Card>,
  topology: BoardTopology
): Map<ID, InstructionEffectiveness> {
  const results = new Map<ID, InstructionEffectiveness>();

  // Get AI-generated cards in this channel
  const aiCards = Object.values(cards).filter(
    c => c.channelId === channel.id && c.source === 'ai'
  );

  let acceptedCount = 0;
  let rejectedCount = 0;
  let neutralCount = 0;

  for (const card of aiCards) {
    const currentColumn = channel.columns.find(col => col.cardIds.includes(card.id));
    if (!currentColumn) continue;

    const columnAnalysis = topology.columns.find(c => c.columnId === currentColumn.id);
    if (!columnAnalysis) continue;

    switch (columnAnalysis.sentiment) {
      case 'positive':
      case 'done':
        acceptedCount++;
        break;
      case 'negative':
        rejectedCount++;
        break;
      default:
        neutralCount++;
    }
  }

  const total = acceptedCount + rejectedCount + neutralCount;

  // Only cards the user actually moved somewhere conclusive count towards the rate.
  //
  // Untouched cards used to sit in the denominator, so a full inbox read as failure:
  // a shroom that generated ten good cards you had not got to yet scored zero, and the
  // board then nagged you about "low acceptance". "You haven't looked at this" and
  // "you didn't want this" are different facts and must stay that way.
  const reviewedCount = acceptedCount + rejectedCount;
  const acceptanceRate = reviewedCount > 0 ? acceptedCount / reviewedCount : 0;

  // Generate insights based on current distribution
  const patterns: string[] = [];
  if (reviewedCount >= 5) {
    if (acceptanceRate >= 0.7) {
      patterns.push('Most reviewed AI cards were kept');
    } else if (acceptanceRate <= 0.3) {
      patterns.push('Most reviewed AI cards ended up in negative columns');
    }
  }

  results.set('all-ai', {
    instructionCardId: 'all-ai',
    generatedCount: total,
    acceptedCount,
    rejectedCount,
    neutralCount,
    reviewedCount,
    acceptanceRate,
    patterns,
  });

  return results;
}
/**
 * Build a human-readable board context string for AI prompts.
 *
 * Describes what the board IS — the role each column plays, and how generated cards
 * have been reviewed. It deliberately says nothing about what the user likes: the
 * only trustworthy statement of that is the reason attached to a rejection, which
 * `buildRejectionContext` supplies separately.
 *
 * This used to also scan card text for themes and tell the model to prefer or avoid
 * them. It did that with a hardcoded list of cuisines and ingredients left over from
 * an early recipe board, so on every other kind of channel it either said nothing or
 * said something made up. Deleted rather than generalised — the rejection loop already
 * carries this weight, and carries it in the user's own words.
 */
export function buildBoardContext(
  channel: Channel,
  cards: Record<string, Card>
): string | null {
  const topology = analyzeColumnTopology(channel, cards);
  const effectiveness = analyzeInstructionEffectiveness(channel, cards, topology);

  // Check if we have enough cards to analyze
  const totalCards = channel.columns.reduce((sum, col) => sum + col.cardIds.length, 0);
  if (totalCards < 3) {
    return null;
  }

  const lines: string[] = [];

  // Board type insight
  if (topology.type !== 'unknown') {
    const typeDescriptions: Record<BoardType, string> = {
      workflow: 'This board follows a workflow pattern (cards progress through stages)',
      triage: 'This board is used for triage/sorting (cards are categorized, not processed)',
      hybrid: 'This board combines workflow and categorization',
      unknown: '',
    };
    lines.push(typeDescriptions[topology.type]);
  }

  // Column roles, described as what the NAMES say — not as a claim about the cards
  // sitting in them. A card in "Dislike" was probably put there on purpose; a card in
  // "Archive" might have been a success. Only the column's own name is evidence here.
  const positiveColumns = topology.columns.filter(c => c.sentiment === 'positive');
  const negativeColumns = topology.columns.filter(c => c.sentiment === 'negative');

  if (positiveColumns.length > 0) {
    const names = positiveColumns.map(c => `"${c.columnName}"`).join(', ');
    lines.push(`Columns named as keepers: ${names}`);
  }

  if (negativeColumns.length > 0) {
    const names = negativeColumns.map(c => `"${c.columnName}"`).join(', ');
    lines.push(`Columns named as rejections: ${names}`);
  }

  // Review outcomes for generated cards. Reported as counts, with untouched cards
  // named as untouched, so the model cannot read "not yet triaged" as "rejected".
  const allAiEffectiveness = effectiveness.get('all-ai');
  if (allAiEffectiveness && allAiEffectiveness.generatedCount >= 3) {
    lines.push('');
    lines.push(`AI has generated ${allAiEffectiveness.generatedCount} cards currently on the board:`);
    lines.push(`- ${allAiEffectiveness.acceptedCount} kept (in a keeper or done column)`);
    lines.push(`- ${allAiEffectiveness.rejectedCount} in a rejection column`);
    lines.push(`- ${allAiEffectiveness.neutralCount} not yet triaged (no signal either way — do not treat these as rejected)`);

    if (allAiEffectiveness.patterns.length > 0) {
      lines.push('');
      for (const pattern of allAiEffectiveness.patterns) {
        lines.push(`Note: ${pattern}`);
      }
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join('\n');
}


// ============================================================================
// Drift Detection
// ============================================================================

export interface DriftInsight {
  id: string;
  type: 'preference_behavior_mismatch' | 'declining_acceptance' | 'low_acceptance';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedAction?: string;
  relatedPreference?: string;
  evidence?: string;
}

/**
 * Extract keywords from text for matching
 * Only returns meaningful, content-specific words (4+ chars, not common words)
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    // Common pronouns, articles, prepositions
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'and', 'or',
    'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'that', 'this', 'these', 'those', 'it', 'its', 'about', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'can',
    // Common verbs and action words
    'want', 'like', 'prefer', 'looking', 'need', 'make', 'made', 'get', 'got',
    'give', 'take', 'keep', 'stay', 'away', 'come', 'going', 'went', 'goes',
    'find', 'show', 'tell', 'said', 'know', 'think', 'feel', 'seem', 'become',
    // Common adjectives
    'good', 'great', 'nice', 'best', 'better', 'well', 'really', 'much', 'many',
    'little', 'small', 'big', 'large', 'long', 'short', 'high', 'low', 'new',
    'old', 'first', 'last', 'next', 'every', 'any', 'both', 'even', 'still',
    'overly', 'simple', 'complex', 'basic', 'advanced', 'easy', 'hard', 'also',
    // App-specific words that aren't useful for content matching
    'cards', 'content', 'things', 'ideas', 'items', 'suggestions', 'options',
    'type', 'types', 'kind', 'kinds', 'style', 'styles', 'based', 'focus',
    'include', 'avoid', 'generate', 'create', 'add', 'remove', 'update',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !stopWords.has(word));
}

/**
 * Extract user preferences from answered questions and instructions
 */
function extractPreferences(channel: Channel): Array<{ source: string; text: string; keywords: string[] }> {
  const preferences: Array<{ source: string; text: string; keywords: string[] }> = [];

  // From answered questions
  const answeredQuestions = channel.questions?.filter(q => q.status === 'answered' && q.answer) ?? [];
  for (const q of answeredQuestions) {
    if (q.answer) {
      preferences.push({
        source: 'question',
        text: q.answer,
        keywords: extractKeywords(q.answer),
      });
    }
  }

  // From "User preference:" statements in instructions
  const instructions = channel.aiInstructions ?? '';
  const prefMatches = instructions.match(/User preference:\s*([^\n]+)/gi) ?? [];
  for (const match of prefMatches) {
    const prefText = match.replace(/User preference:\s*/i, '').trim();
    if (prefText) {
      preferences.push({
        source: 'instruction',
        text: prefText,
        keywords: extractKeywords(prefText),
      });
    }
  }

  return preferences;
}

/**
 * Check if a card's content matches any of the given keywords
 */
function cardMatchesKeywords(card: Card, keywords: string[]): boolean {
  if (keywords.length === 0) return false;

  const cardText = [
    card.title,
    card.summary ?? '',
    ...(card.messages?.map(m => m.content) ?? []),
  ].join(' ').toLowerCase();

  // Card matches if it contains at least one preference keyword
  return keywords.some(kw => cardText.includes(kw));
}

/**
 * Detect drift between stated preferences and actual behavior
 * Based on current card positions only
 */
export function detectDrift(
  channel: Channel,
  cards: Record<string, Card>
): DriftInsight[] {
  const insights: DriftInsight[] = [];
  const topology = analyzeColumnTopology(channel, cards);
  const effectiveness = analyzeInstructionEffectiveness(channel, cards, topology);

  // Check if we have enough cards to detect drift
  const totalCards = channel.columns.reduce((sum, col) => sum + col.cardIds.length, 0);
  if (totalCards < 3) {
    return insights;
  }

  const preferences = extractPreferences(channel);
  const channelCards = Object.values(cards).filter(c => c.channelId === channel.id);

  // Get negative columns for rejection detection
  const negativeColumnIds = new Set(
    topology.columns
      .filter(c => c.sentiment === 'negative')
      .map(c => c.columnId)
  );

  // Track seen insights to avoid duplicates
  const seenInsightTexts = new Set<string>();
  let insightCounter = 0;

  // Check each preference for drift
  for (const pref of preferences) {
    if (pref.keywords.length === 0) continue;

    // Skip negative preferences - rejecting things you said to avoid is CONSISTENT, not drift
    const prefLower = pref.text.toLowerCase();
    const isNegativePreference = /\b(avoid|stay away|don't|do not|no |never|without|less|fewer|skip|exclude)\b/.test(prefLower);
    if (isNegativePreference) continue;

    // Find cards that match this preference's keywords
    const matchingCards = channelCards.filter(c => cardMatchesKeywords(c, pref.keywords));

    if (matchingCards.length === 0) continue;

    // Count how many matching cards are in negative columns
    let rejectedCount = 0;
    let acceptedCount = 0;
    let neutralCount = 0;

    for (const card of matchingCards) {
      const currentColumn = channel.columns.find(col => col.cardIds.includes(card.id));
      if (!currentColumn) continue;

      if (negativeColumnIds.has(currentColumn.id)) {
        rejectedCount++;
      } else {
        const colAnalysis = topology.columns.find(c => c.columnId === currentColumn.id);
        if (colAnalysis?.sentiment === 'positive' || colAnalysis?.sentiment === 'done') {
          acceptedCount++;
        } else {
          neutralCount++;
        }
      }
    }

    const totalMatching = rejectedCount + acceptedCount + neutralCount;
    if (totalMatching < 2) continue; // Need at least 2 matching cards to detect pattern

    const rejectionRate = rejectedCount / totalMatching;

    // Detect preference-behavior mismatch
    if (rejectionRate >= 0.6 && rejectedCount >= 2) {
      // Skip if we've already processed this preference text
      if (seenInsightTexts.has(pref.text)) continue;
      seenInsightTexts.add(pref.text);

      const severity = rejectionRate >= 0.8 ? 'high' : rejectionRate >= 0.7 ? 'medium' : 'low';
      const keywordSample = pref.keywords.slice(0, 3).join(', ');

      // Only add if we have meaningful keywords
      if (keywordSample.length > 0) {
        insightCounter++;
        insights.push({
          id: `drift-pref-${insightCounter}`,
          type: 'preference_behavior_mismatch',
          severity,
          description: `You mentioned "${pref.text.slice(0, 50)}${pref.text.length > 50 ? '...' : ''}", but ${rejectedCount} of ${totalMatching} related cards are in negative columns.`,
          suggestedAction: `Consider being more specific about what "${keywordSample}" means to you.`,
          relatedPreference: pref.text,
          evidence: `${rejectedCount} in negative, ${acceptedCount} in positive, ${neutralCount} in neutral`,
        });
      }
    }
  }

  // Check overall acceptance rate
  const allAiEffectiveness = effectiveness.get('all-ai');
  // Gated on REVIEWED cards, not generated ones. A shroom that filled an inbox you
  // have not opened yet has told us nothing, and nagging about it was the app blaming
  // the user for its own backlog.
  if (allAiEffectiveness && allAiEffectiveness.reviewedCount >= 5) {
    if (allAiEffectiveness.acceptanceRate <= 0.3) {
      insights.push({
        id: 'drift-low-acceptance',
        type: 'low_acceptance',
        severity: allAiEffectiveness.acceptanceRate <= 0.15 ? 'high' : 'medium',
        description: `Of the AI-generated cards you have sorted, ${Math.round(allAiEffectiveness.acceptanceRate * 100)}% ended up somewhere positive.`,
        suggestedAction: 'Try answering more questions to help the AI understand what you want.',
        evidence: `${allAiEffectiveness.acceptedCount} in positive, ${allAiEffectiveness.rejectedCount} in negative, out of ${allAiEffectiveness.reviewedCount} sorted (${allAiEffectiveness.neutralCount} not yet sorted)`,
      });
    }
  }

  return insights;
}

// ============================================================================
// Rejection Context for AI Prompts
// ============================================================================

const REJECTION_REASON_LABELS: Record<string, string> = {
  too_similar: 'Too similar',
  not_relevant: 'Not relevant',
  too_vague: 'Too vague',
  not_for_me: 'Not for me',
  already_know: 'Already know this',
};

/**
 * Build a concise rejection context block for AI generation prompts.
 *
 * Scoped to the shroom being run, when we know which one that is. Rejections are stored
 * against the shroom that produced the card, and the "What we've learned" panel reads
 * them that way — but this used to take the channel's most recent rejections regardless
 * of origin, so a busy channel let one shroom's rejections push another's out entirely,
 * and every shroom was taught lessons meant for its neighbours. What a shroom reads here
 * is now what its own panel shows.
 *
 * Rejections from other shrooms in the channel are still worth something — they are the
 * same person saying no in the same space — so a few come along, clearly marked as the
 * weaker signal they are.
 */
export function buildRejectionContext(
  rejections: CardRejection[],
  channelId: ID,
  instructionCardId?: ID
): string | null {
  const OWN_LIMIT = 20;
  const OTHERS_LIMIT = 5;

  const channelRejections = rejections
    .filter(r => r.channelId === channelId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (channelRejections.length === 0) return null;

  // Without a shroom id (an ad-hoc run, or an older caller) everything is "own".
  const own = instructionCardId
    ? channelRejections.filter(r => r.instructionCardId === instructionCardId).slice(0, OWN_LIMIT)
    : channelRejections.slice(0, OWN_LIMIT);
  const others = instructionCardId
    ? channelRejections.filter(r => r.instructionCardId !== instructionCardId).slice(0, OTHERS_LIMIT)
    : [];

  if (own.length === 0 && others.length === 0) return null;

  const lines: string[] = ['## Card Rejection History (avoid these patterns)'];

  if (own.length > 0) {
    lines.push(
      instructionCardId
        ? 'Cards THIS shroom generated that were rejected:'
        : 'Recent rejections from this channel:'
    );
    lines.push(...describeRejections(own));
  }

  if (others.length > 0) {
    lines.push('');
    lines.push('Rejected elsewhere in this channel (weaker signal — same user, different job):');
    lines.push(...describeRejections(others));
  }

  return lines.join('\n');
}

/**
 * Group a set of rejections by reason, then surface the user's own words.
 * The free-text feedback is the most valuable line in the block, so it goes last.
 */
function describeRejections(entries: CardRejection[]): string[] {
  const lines: string[] = [];
  const byReason = new Map<string, string[]>();
  const noReason: string[] = [];
  const userNotes: string[] = [];

  for (const r of entries) {
    if (r.reason) {
      const list = byReason.get(r.reason) || [];
      list.push(r.rejectedCardTitle);
      byReason.set(r.reason, list);
    } else {
      noReason.push(r.rejectedCardTitle);
    }
    if (r.feedback) {
      userNotes.push(r.feedback);
    }
  }

  for (const [reason, titles] of byReason.entries()) {
    const label = REJECTION_REASON_LABELS[reason] || reason;
    const titleList = titles.slice(0, 3).map(t => `"${t}"`).join(', ');
    const extra = titles.length > 3 ? ` (+${titles.length - 3} more)` : '';
    lines.push(`- "${label}" (${titles.length}): ${titleList}${extra}`);
  }

  if (noReason.length > 0) {
    const titleList = noReason.slice(0, 3).map(t => `"${t}"`).join(', ');
    lines.push(`- Rejected without reason (${noReason.length}): ${titleList}`);
  }

  for (const note of [...new Set(userNotes)].slice(0, 5)) {
    lines.push(`User note: "${note}"`);
  }

  return lines;
}
