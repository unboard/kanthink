/**
 * Intent inference for conversational channel creation.
 * Analyzes user input to determine what type of channel they want to create.
 */

export type ChannelIntent = 'learning' | 'ideas' | 'tasks' | 'tracking' | 'unknown';

interface IntentMatch {
  intent: ChannelIntent;
  confidence: number;
  matchedKeywords: string[];
}

// Keywords that indicate each intent type
const INTENT_KEYWORDS: Record<Exclude<ChannelIntent, 'unknown'>, string[]> = {
  learning: [
    'learn', 'learning', 'study', 'studying', 'research', 'researching',
    'explore', 'exploring', 'understand', 'understanding', 'course', 'courses',
    'book', 'books', 'reading', 'read', 'articles', 'article', 'tutorial',
    'tutorials', 'education', 'educational', 'discover', 'knowledge',
  ],
  ideas: [
    'brainstorm', 'brainstorming', 'idea', 'ideas', 'creative', 'creativity',
    'think', 'thinking', 'concept', 'concepts', 'innovation', 'innovate',
    'inspiration', 'inspire', 'imagine', 'imagination', 'explore ideas',
    'generate ideas', 'ideation', 'draft', 'drafts', 'writing', 'content',
  ],
  tasks: [
    'task', 'tasks', 'project', 'projects', 'manage', 'managing', 'management',
    'to-do', 'todo', 'todos', 'organize', 'organizing', 'work', 'working',
    'productivity', 'productive', 'sprint', 'sprints', 'deadline', 'deadlines',
    'plan', 'planning', 'schedule', 'goal', 'goals', 'habit', 'habits',
  ],
  tracking: [
    'track', 'tracking', 'monitor', 'monitoring', 'follow', 'following',
    'watch', 'watching', 'news', 'updates', 'feed', 'feeds', 'keep up',
    'stay updated', 'competitor', 'competitors', 'trends', 'trending',
    'industry', 'market', 'surveillance',
  ],
};

// Phrases that strongly indicate intent (weighted higher)
const STRONG_PHRASES: Record<Exclude<ChannelIntent, 'unknown'>, string[]> = {
  learning: [
    'want to learn', 'learning about', 'study for', 'research on',
    'understand better', 'reading list', 'book list',
  ],
  ideas: [
    'brainstorm ideas', 'generate ideas', 'creative ideas', 'come up with',
    'thinking about', 'explore ideas', 'idea board',
  ],
  tasks: [
    'manage my', 'organize my', 'project tasks', 'to-do list', 'task list',
    'project board', 'work tasks', 'get things done',
  ],
  tracking: [
    'keep track of', 'stay updated', 'monitor the', 'follow the',
    'track updates', 'news about', 'watch list',
  ],
};

/**
 * Normalizes text for matching (lowercase, remove extra spaces)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Counts keyword matches in text
 */
function countKeywordMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const normalizedText = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    // Use word boundary matching for single words, substring for phrases
    if (normalizedKeyword.includes(' ')) {
      if (normalizedText.includes(normalizedKeyword)) {
        matched.push(keyword);
      }
    } else {
      const regex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
      if (regex.test(normalizedText)) {
        matched.push(keyword);
      }
    }
  }

  return { count: matched.length, matched };
}

/**
 * Infers the user's intent from their input text.
 * Returns the best matching intent with confidence score.
 */
export function inferIntent(userInput: string): IntentMatch {
  const normalizedInput = normalizeText(userInput);

  if (!normalizedInput || normalizedInput.length < 3) {
    return { intent: 'unknown', confidence: 0, matchedKeywords: [] };
  }

  const scores: Record<Exclude<ChannelIntent, 'unknown'>, { score: number; matched: string[] }> = {
    learning: { score: 0, matched: [] },
    ideas: { score: 0, matched: [] },
    tasks: { score: 0, matched: [] },
    tracking: { score: 0, matched: [] },
  };

  // Check each intent type
  for (const intent of Object.keys(INTENT_KEYWORDS) as Exclude<ChannelIntent, 'unknown'>[]) {
    // Check regular keywords (1 point each)
    const keywordMatch = countKeywordMatches(normalizedInput, INTENT_KEYWORDS[intent]);
    scores[intent].score += keywordMatch.count;
    scores[intent].matched.push(...keywordMatch.matched);

    // Check strong phrases (2 points each)
    const phraseMatch = countKeywordMatches(normalizedInput, STRONG_PHRASES[intent]);
    scores[intent].score += phraseMatch.count * 2;
    scores[intent].matched.push(...phraseMatch.matched);
  }

  // Find the highest scoring intent
  let bestIntent: Exclude<ChannelIntent, 'unknown'> = 'learning';
  let bestScore = 0;

  for (const intent of Object.keys(scores) as Exclude<ChannelIntent, 'unknown'>[]) {
    if (scores[intent].score > bestScore) {
      bestScore = scores[intent].score;
      bestIntent = intent;
    }
  }

  // Calculate confidence (0-1 scale)
  // High confidence if we have multiple matches or strong phrases
  const confidence = bestScore === 0
    ? 0
    : Math.min(1, bestScore / 4); // 4+ matches = full confidence

  // If confidence is too low, return unknown
  if (confidence < 0.25) {
    return { intent: 'unknown', confidence: 0, matchedKeywords: [] };
  }

  return {
    intent: bestIntent,
    confidence,
    matchedKeywords: scores[bestIntent].matched,
  };
}

/**
 * Gets a friendly label for an intent
 */
export function getIntentLabel(intent: ChannelIntent): string {
  const labels: Record<ChannelIntent, string> = {
    learning: 'Learning & Research',
    ideas: 'Ideas & Brainstorming',
    tasks: 'Project & Task Management',
    tracking: 'Monitoring & Tracking',
    unknown: 'General',
  };
  return labels[intent];
}

/**
 * Gets a description of what the intent means
 */
export function getIntentDescription(intent: ChannelIntent): string {
  const descriptions: Record<ChannelIntent, string> = {
    learning: 'Explore topics, find insights, and build knowledge',
    ideas: 'Generate creative ideas and develop concepts',
    tasks: 'Organize work, track progress, and manage projects',
    tracking: 'Stay updated on topics and monitor developments',
    unknown: 'A flexible space for organizing information',
  };
  return descriptions[intent];
}
