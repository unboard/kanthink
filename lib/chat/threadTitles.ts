/**
 * Titles for conversations with Kan, written from what they were about.
 *
 * A thread used to be named after its first line. For typed chat that's often fine;
 * for voice it's useless — every session opens with a greeting, and "Hey Kan" comes
 * out of speech-to-text as "I can." — so history read as a column of "I can."s.
 *
 * Titles are written in the background, a batch per LLM call, for threads that have
 * gone quiet (an active voice session keeps saving; its topic isn't settled yet).
 * Once written, a title is kept: later saves of the thread don't overwrite it.
 */

import { and, desc, eq, lt, or, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { operatorChatThreads } from '@/lib/db/schema';
import { getLLMClientForUser } from '@/lib/ai/llm';
import { recordUsage } from '@/lib/usage';

const BATCH = 12;
/** A thread still being added to may yet change subject. */
const QUIET_MS = 2 * 60 * 1000;

type Thread = typeof operatorChatThreads.$inferSelect;

export const VOICE_PREFIX = '🎙 ';

export function isVoice(t: Pick<Thread, 'kind' | 'title'>): boolean {
  return t.kind === 'voice' || (t.title ?? '').startsWith(VOICE_PREFIX);
}

export function displayTitle(t: Pick<Thread, 'title'>): string {
  const raw = (t.title ?? '').replace(VOICE_PREFIX, '').trim();
  return raw || 'New conversation';
}

/** Threads whose title is still their first line, with something in them to title. */
export async function untitledThreads(userId: string, limit = BATCH): Promise<Thread[]> {
  const rows = await db.query.operatorChatThreads.findMany({
    where: and(
      eq(operatorChatThreads.userId, userId),
      or(isNull(operatorChatThreads.titleGenerated), eq(operatorChatThreads.titleGenerated, false)),
      lt(operatorChatThreads.updatedAt, new Date(Date.now() - QUIET_MS)),
    ),
    orderBy: [desc(operatorChatThreads.updatedAt)],
    limit: limit * 2,
  });
  return rows.filter((t) => (t.messages ?? []).some((m) => m.type === 'question' && m.content?.trim())).slice(0, limit);
}

export async function titleThreads(userId: string): Promise<number> {
  const threads = await untitledThreads(userId);
  if (threads.length === 0) return 0;

  const { client, source } = await getLLMClientForUser(userId, undefined, 'chat');
  if (!client) return 0;

  const input = threads.map((t) => ({
    id: t.id,
    voice: isVoice(t) || undefined,
    lines: (t.messages ?? []).slice(0, 10).map((m) => `${m.type === 'question' ? 'User' : 'Kan'}: ${(m.content ?? '').replace(/\s+/g, ' ').slice(0, 220)}`),
  }));

  let titles: Record<string, string> = {};
  try {
    const res = await client.complete([
      {
        role: 'system',
        content:
          'You title conversations between a user and Kan, the assistant in their Kanban app, for their history list. ' +
          'For each conversation write a title of 3–7 words saying what it was about — the actual subject or task, specific ' +
          '(e.g. "Adding a card to Work", "Pricing for pet sitting", "Kanwatch privacy review"). Sentence case, no quotes, no emoji, no trailing period. ' +
          'Ignore greetings and small talk. Voice transcripts mishear the assistant\'s name: "I can", "Hey Cam", "can" all mean "Kan" — never use them as the subject. ' +
          'If a conversation has no real subject, write "Quick chat with Kan". ' +
          'Reply with JSON only: {"<id>": "<title>", ...}.',
      },
      { role: 'user', content: JSON.stringify(input) },
    ]);
    if (source === 'owner') await recordUsage(userId, 'chat-titles');
    const match = res.content.match(/\{[\s\S]*\}/);
    if (match) titles = JSON.parse(match[0]);
  } catch (err) {
    console.warn('[threads] titling failed', err instanceof Error ? err.message : err);
    return 0;
  }

  let done = 0;
  for (const t of threads) {
    const title = typeof titles[t.id] === 'string' ? titles[t.id].replace(/["\n]/g, '').trim().slice(0, 80) : '';
    if (!title) continue;
    await db.update(operatorChatThreads)
      .set({ title, titleGenerated: true, kind: isVoice(t) ? 'voice' : t.kind })
      .where(eq(operatorChatThreads.id, t.id));
    done++;
  }
  return done;
}
