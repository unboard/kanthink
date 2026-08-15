import type { InstructionCard } from '@/lib/types';
import type { LLMProvider } from '@/lib/ai/providers/types';

/**
 * Detect if instructions suggest the AI needs real web data
 * (e.g., finding YouTube videos, linking articles, referencing real URLs)
 */
export function detectWebSearchIntent(instructions: string): boolean {
  if (!instructions) return false;
  const lower = instructions.toLowerCase();
  const webKeywords = [
    'youtube', 'video', 'link', 'url', 'website', 'webpage',
    'search for', 'find online', 'look up', 'browse',
    'article', 'blog post', 'podcast', 'episode',
    'reddit', 'twitter', 'github', 'stack overflow',
    'http', 'www', '.com', '.org', '.io',
  ];
  return webKeywords.some(kw => lower.includes(kw));
}

/** Whether this run should go to the web at all. */
export function shouldResearchWeb(
  card: Pick<InstructionCard, 'instructions' | 'webAccess'>
): boolean {
  const mode = card.webAccess?.mode ?? 'auto';
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return detectWebSearchIntent(card.instructions || '');
}

/**
 * The query to run when nothing more specific is derivable from the board.
 *
 * An explicit focus wins over the instructions: the instructions are written to the
 * model and read like a job description, which makes a poor search query.
 */
export function baseSearchQuery(
  card: Pick<InstructionCard, 'instructions' | 'webAccess'>
): string {
  const focus = card.webAccess?.focus?.trim();
  const source = focus || card.instructions || '';
  return source.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export interface WebResearchFindings {
  content: string[];
  urls: { url: string; title: string; topic: string }[];
}

/**
 * Run searches and collect what came back, de-duplicated by URL.
 *
 * Failures are swallowed per query rather than per batch — one dead search shouldn't
 * cost the run every other result.
 */
export async function researchWeb(
  llm: LLMProvider,
  queries: string[],
  systemPrompt: string,
  topics: string[] = []
): Promise<WebResearchFindings> {
  if (!llm.webSearch) return { content: [], urls: [] };

  const results = await Promise.all(
    queries.map((query) =>
      llm.webSearch!(query, systemPrompt).catch((err) => {
        console.warn(`Web search failed for "${query}":`, err);
        return null;
      })
    )
  );

  const findings: WebResearchFindings = { content: [], urls: [] };
  const seen = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    const topic = topics[i] || queries[i];
    if (result.content) findings.content.push(`### Results for: ${topic}\n${result.content}`);
    for (const r of result.webSearchResults ?? []) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        findings.urls.push({ url: r.url, title: r.title || '', topic });
      }
    }
  }

  return findings;
}

/**
 * The block appended to a prompt so the model uses what was found and nothing else.
 *
 * Returns an empty string when there's nothing to say, so callers can append blindly.
 */
export function formatResearchBlock(findings: WebResearchFindings): string {
  if (findings.content.length === 0 && findings.urls.length === 0) return '';

  const urlSection =
    findings.urls.length > 0
      ? `\n\n### Verified URLs (use ONLY these — grouped by topic)\n${findings.urls
          .map((r) => `- [${r.topic}] ${r.title}: ${r.url}`)
          .join('\n')}`
      : '';

  return (
    `\n\n## Web Research (real data from the internet)\n` +
    `CRITICAL: You may ONLY use URLs from the "Verified URLs" list below. Do NOT invent, ` +
    `guess, or fabricate ANY URLs. If a topic has no verified URL, say "no link found" for ` +
    `that topic — do NOT make one up.\n\n${findings.content.join('\n\n')}${urlSection}`
  );
}
