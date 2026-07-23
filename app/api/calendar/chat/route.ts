import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { marketingIdeas, marketingChat, marketingAssets } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createLLMClient } from '@/lib/ai/llm';
import type { LLMMessage } from '@/lib/ai/providers/types';
import { seedMcsCalendar, seedMcsAssets } from '@/lib/calendar/seed-mcs';
import { toIdea, toAsset } from '@/lib/calendar/serialize';
import { buildCalendarSystemPrompt } from '@/lib/calendar/system-prompt';
import { getBusiness } from '@/lib/calendar/types';
import type { MarketingChatMessageJson } from '@/lib/db/schema';

export const runtime = 'nodejs';

interface ActionCreate { type: 'create'; idea: Record<string, unknown> }
interface ActionUpdate { type: 'update'; id: string; idea: Record<string, unknown> }
interface ActionDelete { type: 'delete'; id: string }
type Action = ActionCreate | ActionUpdate | ActionDelete;

const WRITABLE = new Set([
  'title', 'date', 'channel', 'audience', 'objective', 'justification',
  'metric', 'owner', 'collaborators', 'tools', 'effort', 'status', 'notes', 'position',
]);

function cleanIdeaFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!WRITABLE.has(k)) continue;
    if (k === 'collaborators' || k === 'tools') {
      out[k] = Array.isArray(v) ? v.map(String) : [];
    } else if (k === 'position') {
      if (typeof v === 'number') out[k] = v;
    } else if (k === 'date') {
      out[k] = v == null || v === '' ? null : String(v);
    } else {
      out[k] = v == null ? '' : String(v);
    }
  }
  return out;
}

export async function POST(req: Request) {
  await ensureSchema();

  const apiKey = process.env.OWNER_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const business = String(body?.business || '').trim().toLowerCase();
  const messages: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body?.messages) ? body.messages : [];
  const focusAudience: string | null = typeof body?.focusAudience === 'string' && body.focusAudience.trim() ? body.focusAudience.trim() : null;
  const biz = getBusiness(business);
  if (!biz) {
    return NextResponse.json({ error: 'Unknown business' }, { status: 400 });
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  await seedMcsCalendar(business);
  await seedMcsAssets(business);

  // Load the full current calendar so Kan is aware of every idea.
  const rows = await db
    .select()
    .from(marketingIdeas)
    .where(eq(marketingIdeas.business, business))
    .orderBy(asc(marketingIdeas.date), asc(marketingIdeas.position));
  const ideas = rows.map(toIdea);

  // Load the knowledge base so Kan grounds ideas in our audiences/products/tools.
  const assetRows = await db
    .select()
    .from(marketingAssets)
    .where(eq(marketingAssets.business, business))
    .orderBy(asc(marketingAssets.kind), asc(marketingAssets.position));
  const assets = assetRows.map(toAsset);

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = buildCalendarSystemPrompt(biz.name, today, ideas, assets, focusAudience);

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let message = '';
  let actions: Action[] = [];
  try {
    const client = createLLMClient({ provider: 'openai', apiKey, model: 'gpt-4.1' });
    const response = await client.complete(llmMessages, { maxTokens: 3000 });

    let jsonStr = response.content.trim();
    const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      message = typeof parsed.message === 'string' ? parsed.message : '';
      actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    } catch {
      // Not valid JSON — treat the whole thing as a plain reply, no actions.
      message = response.content;
      actions = [];
    }
  } catch (err) {
    console.error('[Calendar Chat] LLM error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Chat failed: ${msg}` }, { status: 500 });
  }

  // Apply actions.
  const now = new Date();
  let changed = 0;
  const appliedSummaries: string[] = [];
  const maxPos = ideas.reduce((m, i) => Math.max(m, i.position), 0);

  for (const action of actions) {
    try {
      if (action.type === 'create' && action.idea) {
        const fields = cleanIdeaFields(action.idea);
        if (!fields.title) continue;
        await db.insert(marketingIdeas).values({
          business,
          title: String(fields.title),
          date: (fields.date as string | null) ?? null,
          channel: (fields.channel as string) || 'other',
          audience: (fields.audience as string) || '',
          objective: (fields.objective as string) || '',
          justification: (fields.justification as string) || '',
          metric: (fields.metric as string) || '',
          owner: (fields.owner as string) || 'Dustin',
          collaborators: (fields.collaborators as string[]) || [],
          tools: (fields.tools as string[]) || [],
          effort: (fields.effort as string) || 'M',
          status: ((fields.status as string) || 'planned') as 'idea' | 'planned' | 'in_progress' | 'done' | 'skipped',
          notes: (fields.notes as string) || '',
          position: typeof fields.position === 'number' ? fields.position : maxPos + 1 + changed,
          createdAt: now,
          updatedAt: now,
        });
        changed++;
        appliedSummaries.push(`added "${fields.title}"`);
      } else if (action.type === 'update' && action.id) {
        const fields = cleanIdeaFields(action.idea || {});
        if (Object.keys(fields).length === 0) continue;
        await db
          .update(marketingIdeas)
          .set({ ...fields, updatedAt: now })
          .where(and(eq(marketingIdeas.id, action.id), eq(marketingIdeas.business, business)));
        changed++;
        appliedSummaries.push(`updated an idea`);
      } else if (action.type === 'delete' && action.id) {
        await db
          .delete(marketingIdeas)
          .where(and(eq(marketingIdeas.id, action.id), eq(marketingIdeas.business, business)));
        changed++;
        appliedSummaries.push(`removed an idea`);
      }
    } catch (e) {
      console.error('[Calendar Chat] action failed:', action, e);
    }
  }

  // Reload the calendar after mutations.
  const freshRows = await db
    .select()
    .from(marketingIdeas)
    .where(eq(marketingIdeas.business, business))
    .orderBy(asc(marketingIdeas.date), asc(marketingIdeas.position));
  const freshIdeas = freshRows.map(toIdea);

  // Persist the shared team thread (best-effort).
  try {
    const threadMessages: MarketingChatMessageJson[] = messages.map((m, i) => ({
      id: `m-${i}`,
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString(),
    }));
    threadMessages.push({ id: nanoid(), role: 'assistant', content: message, createdAt: new Date().toISOString() });
    await db
      .insert(marketingChat)
      .values({ business, messages: threadMessages, updatedAt: now })
      .onConflictDoUpdate({ target: marketingChat.business, set: { messages: threadMessages, updatedAt: now } });
  } catch (e) {
    console.error('[Calendar Chat] thread persist failed:', e);
  }

  return NextResponse.json({
    message,
    changed,
    appliedSummaries,
    ideas: freshIdeas,
  });
}
