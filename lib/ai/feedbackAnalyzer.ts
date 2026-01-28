/**
 * Feedback Analyzer
 *
 * Analyzes current board state to infer user preferences and patterns.
 * Uses column names and current card positions as signals.
 *
 * Design principle: Where cards ARE is the signal, not where they've been.
 * No movement history or deletion tracking - just current state analysis.
 */

import type { Channel, Card, ID } from '../types';

// Column sentiment keywords (lowercase for matching)
const POSITIVE_KEYWORDS = ['like', 'liked', 'love', 'favorite', 'favorites', 'keep', 'good', 'yes', 'approved', 'accept', 'accepted', 'interesting', 'useful', 'important', 'priority', 'high', 'best', 'top', 'starred', 'saved'];
const NEGATIVE_KEYWORDS = ['dislike', 'disliked', 'hate', 'trash', 'delete', 'bad', 'no', 'reject', 'rejected', 'skip', 'skipped', 'not relevant', 'irrelevant', 'low', 'worst', 'spam', 'archive', 'archived', 'ignore', 'ignored'];
const INBOX_KEYWORDS = ['inbox', 'new', 'incoming', 'triage', 'unsorted', 'raw', 'ideas', 'backlog'];
const DONE_KEYWORDS = ['done', 'complete', 'completed', 'finished', 'shipped', 'published', 'resolved', 'closed'];
const PROGRESS_KEYWORDS = ['progress', 'in progress', 'doing', 'working', 'active', 'current', 'this week', 'today', 'now', 'next', 'next up'];

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
  acceptedCount: number;      // In positive columns
  rejectedCount: number;      // In negative columns
  neutralCount: number;       // Still in inbox or neutral
  acceptanceRate: number;     // 0-1
  patterns: string[];         // Human-readable insights
}

/**
 * Infer sentiment from column name using keyword matching
 */
export function inferColumnSentiment(columnName: string): ColumnSentiment {
  const name = columnName.toLowerCase().trim();

  // Check each category (order matters - more specific/negative first)
  // IMPORTANT: Check negative BEFORE positive because "dislike" contains "like"
  if (INBOX_KEYWORDS.some(kw => name.includes(kw))) return 'inbox';
  if (DONE_KEYWORDS.some(kw => name.includes(kw))) return 'done';
  if (PROGRESS_KEYWORDS.some(kw => name.includes(kw))) return 'progress';
  if (NEGATIVE_KEYWORDS.some(kw => name.includes(kw))) return 'negative';
  if (POSITIVE_KEYWORDS.some(kw => name.includes(kw))) return 'positive';

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
  const acceptanceRate = total > 0 ? acceptedCount / total : 0;

  // Generate insights based on current distribution
  const patterns: string[] = [];
  if (total >= 5) {
    if (acceptanceRate >= 0.7) {
      patterns.push('AI suggestions are working well (70%+ acceptance)');
    } else if (acceptanceRate <= 0.3) {
      patterns.push('AI suggestions need improvement (70%+ in negative/inbox columns)');
    }
  }

  results.set('all-ai', {
    instructionCardId: 'all-ai',
    generatedCount: total,
    acceptedCount,
    rejectedCount,
    neutralCount,
    acceptanceRate,
    patterns,
  });

  return results;
}

/**
 * Extract meaningful content patterns from a set of cards
 * Returns common themes found in card titles and content
 */
function extractContentPatterns(cardsToAnalyze: Card[]): string[] {
  if (cardsToAnalyze.length === 0) return [];

  // Collect all text from card titles and first message
  const allText = cardsToAnalyze.map(card => {
    const titleText = card.title || '';
    const contentText = card.messages?.[0]?.content?.slice(0, 500) || '';
    return `${titleText} ${contentText}`.toLowerCase();
  });

  // Common food/cuisine keywords to look for
  const cuisinePatterns = [
    { keywords: ['tofu', 'tempeh', 'seitan'], label: 'tofu/plant proteins' },
    { keywords: ['vegan', 'plant-based', 'dairy-free'], label: 'vegan dishes' },
    { keywords: ['vegetarian', 'meatless', 'veggie'], label: 'vegetarian dishes' },
    { keywords: ['gluten-free', 'gluten free'], label: 'gluten-free options' },
    { keywords: ['thai', 'thailand'], label: 'Thai cuisine' },
    { keywords: ['indian', 'curry', 'masala', 'tikka'], label: 'Indian cuisine' },
    { keywords: ['mexican', 'taco', 'burrito', 'enchilada'], label: 'Mexican cuisine' },
    { keywords: ['italian', 'pasta', 'risotto', 'pizza'], label: 'Italian cuisine' },
    { keywords: ['japanese', 'sushi', 'ramen', 'miso'], label: 'Japanese cuisine' },
    { keywords: ['chinese', 'stir-fry', 'wok', 'szechuan'], label: 'Chinese cuisine' },
    { keywords: ['korean', 'kimchi', 'bibimbap', 'gochujang'], label: 'Korean cuisine' },
    { keywords: ['mediterranean', 'greek', 'feta', 'hummus'], label: 'Mediterranean cuisine' },
    { keywords: ['middle eastern', 'falafel', 'shawarma', 'tahini'], label: 'Middle Eastern cuisine' },
    { keywords: ['french', 'bourguignon', 'croissant', 'beurre'], label: 'French cuisine' },
    { keywords: ['vietnamese', 'pho', 'banh mi'], label: 'Vietnamese cuisine' },
    { keywords: ['moroccan', 'tagine', 'harissa'], label: 'Moroccan cuisine' },
    { keywords: ['caribbean', 'jerk', 'plantain'], label: 'Caribbean cuisine' },
    { keywords: ['turkish', 'kebab', 'menemen'], label: 'Turkish cuisine' },
    { keywords: ['cuban', 'mojo'], label: 'Cuban cuisine' },
    { keywords: ['chicken', 'poultry'], label: 'chicken dishes' },
    { keywords: ['beef', 'steak', 'brisket'], label: 'beef dishes' },
    { keywords: ['pork', 'bacon', 'ham'], label: 'pork dishes' },
    { keywords: ['fish', 'salmon', 'cod', 'seafood', 'shrimp'], label: 'seafood dishes' },
    { keywords: ['soup', 'stew', 'broth'], label: 'soups and stews' },
    { keywords: ['salad', 'fresh', 'raw'], label: 'salads' },
    { keywords: ['breakfast', 'morning', 'brunch', 'pancake', 'oat'], label: 'breakfast items' },
    { keywords: ['spicy', 'hot', 'chili', 'pepper'], label: 'spicy dishes' },
    { keywords: ['comfort', 'hearty', 'rich', 'creamy'], label: 'comfort food' },
    { keywords: ['healthy', 'light', 'low-cal', 'nutritious'], label: 'health-focused meals' },
    { keywords: ['quick', 'easy', 'simple', '15-minute', '30-minute'], label: 'quick/easy meals' },
    { keywords: ['complex', 'elaborate', 'gourmet', 'advanced'], label: 'complex recipes' },
  ];

  // Count matches for each pattern
  const patternCounts: { label: string; count: number }[] = [];

  for (const pattern of cuisinePatterns) {
    let matchCount = 0;
    for (const text of allText) {
      if (pattern.keywords.some(kw => text.includes(kw))) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      patternCounts.push({ label: pattern.label, count: matchCount });
    }
  }

  // Sort by count and return top patterns (those appearing in 30%+ of cards or at least 2 cards)
  const threshold = Math.max(2, Math.floor(cardsToAnalyze.length * 0.3));
  return patternCounts
    .filter(p => p.count >= Math.min(threshold, 2))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(p => `${p.label} (${p.count} cards)`);
}

/**
 * Build a human-readable feedback context string for AI prompts
 * Based on current card positions, not movement history
 */
export function buildFeedbackContext(
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

  // Column insights
  const positiveColumns = topology.columns.filter(c => c.sentiment === 'positive');
  const negativeColumns = topology.columns.filter(c => c.sentiment === 'negative');

  if (positiveColumns.length > 0) {
    const names = positiveColumns.map(c => `"${c.columnName}"`).join(', ');
    lines.push(`Positive columns (user likes content here): ${names}`);
  }

  if (negativeColumns.length > 0) {
    const names = negativeColumns.map(c => `"${c.columnName}"`).join(', ');
    lines.push(`Negative columns (user rejects content here): ${names}`);
  }

  // Content pattern analysis - what types of content are liked/disliked
  const positiveColumnIds = new Set(positiveColumns.map(c => c.columnId));
  const negativeColumnIds = new Set(negativeColumns.map(c => c.columnId));

  const likedCards: Card[] = [];
  const dislikedCards: Card[] = [];

  for (const col of channel.columns) {
    const columnCards = col.cardIds.map(id => cards[id]).filter(Boolean);
    if (positiveColumnIds.has(col.id)) {
      likedCards.push(...columnCards);
    } else if (negativeColumnIds.has(col.id)) {
      dislikedCards.push(...columnCards);
    }
  }

  if (likedCards.length >= 2 || dislikedCards.length >= 2) {
    lines.push('');
    lines.push('## Content Preferences (IMPORTANT - use these to guide generation)');

    if (dislikedCards.length >= 2) {
      const dislikedPatterns = extractContentPatterns(dislikedCards);
      if (dislikedPatterns.length > 0) {
        lines.push('');
        lines.push(`**AVOID generating these types** (user has ${dislikedCards.length} cards in negative columns):`);
        for (const pattern of dislikedPatterns) {
          lines.push(`  - ${pattern}`);
        }
      }
    }

    if (likedCards.length >= 2) {
      const likedPatterns = extractContentPatterns(likedCards);
      if (likedPatterns.length > 0) {
        lines.push('');
        lines.push(`**PREFER generating these types** (user has ${likedCards.length} cards in positive columns):`);
        for (const pattern of likedPatterns) {
          lines.push(`  - ${pattern}`);
        }
      }
    }

    if (likedCards.length > 0 && dislikedCards.length > 0) {
      const ratio = dislikedCards.length / likedCards.length;
      if (ratio >= 3) {
        lines.push('');
        lines.push(`⚠️ High rejection rate: ${dislikedCards.length} in negative columns vs ${likedCards.length} in positive. Strongly consider changing approach.`);
      }
    }
  }

  // Effectiveness insights
  const allAiEffectiveness = effectiveness.get('all-ai');
  if (allAiEffectiveness && allAiEffectiveness.generatedCount >= 3) {
    lines.push('');
    lines.push(`AI has generated ${allAiEffectiveness.generatedCount} cards currently on the board:`);
    lines.push(`- ${allAiEffectiveness.acceptedCount} in positive/done columns (${Math.round(allAiEffectiveness.acceptanceRate * 100)}%)`);
    lines.push(`- ${allAiEffectiveness.rejectedCount} in negative columns`);
    lines.push(`- ${allAiEffectiveness.neutralCount} in inbox/neutral columns`);

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

/**
 * Get a summary of column semantics for the AI to understand board structure
 */
export function getColumnSemanticsSummary(channel: Channel): string {
  const lines: string[] = ['Board columns and their inferred purpose:'];

  for (const col of channel.columns) {
    const sentiment = inferColumnSentiment(col.name);
    const sentimentLabel: Record<ColumnSentiment, string> = {
      inbox: 'inbox/entry point',
      positive: 'positive/accepted',
      negative: 'negative/rejected',
      neutral: 'neutral',
      done: 'completed',
      progress: 'in progress',
    };
    lines.push(`- "${col.name}": ${sentimentLabel[sentiment]}`);
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
  if (allAiEffectiveness && allAiEffectiveness.generatedCount >= 5) {
    if (allAiEffectiveness.acceptanceRate <= 0.3) {
      insights.push({
        id: 'drift-low-acceptance',
        type: 'low_acceptance',
        severity: allAiEffectiveness.acceptanceRate <= 0.15 ? 'high' : 'medium',
        description: `Only ${Math.round(allAiEffectiveness.acceptanceRate * 100)}% of AI-generated cards are in positive columns.`,
        suggestedAction: 'Try answering more questions to help the AI understand what you want.',
        evidence: `${allAiEffectiveness.acceptedCount} in positive, ${allAiEffectiveness.rejectedCount} in negative out of ${allAiEffectiveness.generatedCount} total`,
      });
    }
  }

  return insights;
}
