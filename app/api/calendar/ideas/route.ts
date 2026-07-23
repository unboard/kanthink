import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { marketingIdeas } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { seedMcsCalendar, seedMcsAssets } from '@/lib/calendar/seed-mcs';
import { toIdea } from '@/lib/calendar/serialize';
import type { NewDbMarketingIdea } from '@/lib/db/schema';

export const runtime = 'nodejs';

function slug(v: string | null): string {
  return (v || '').trim().toLowerCase();
}

// GET /api/calendar/ideas?business=mycreativeshop
export async function GET(req: Request) {
  await ensureSchema();
  const business = slug(new URL(req.url).searchParams.get('business'));
  if (!business) {
    return NextResponse.json({ error: 'business is required' }, { status: 400 });
  }

  // Auto-seed the MCS playbook + knowledge base the first time the calendar opens.
  await seedMcsCalendar(business);
  await seedMcsAssets(business);

  const rows = await db
    .select()
    .from(marketingIdeas)
    .where(eq(marketingIdeas.business, business))
    .orderBy(asc(marketingIdeas.date), asc(marketingIdeas.position));

  return NextResponse.json({ ideas: rows.map(toIdea) });
}

// POST /api/calendar/ideas — create or update a single idea (direct UI edits:
// drag-reschedule, status change, inline edits). Body: { business, idea }
export async function POST(req: Request) {
  await ensureSchema();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const business = slug(body.business);
  const idea = body.idea;
  if (!business || !idea || typeof idea !== 'object') {
    return NextResponse.json({ error: 'business and idea are required' }, { status: 400 });
  }

  const now = new Date();

  // Whitelist the writable fields.
  const patch: Partial<NewDbMarketingIdea> = {};
  if (typeof idea.title === 'string') patch.title = idea.title;
  if ('date' in idea) patch.date = idea.date || null;
  if (typeof idea.channel === 'string') patch.channel = idea.channel;
  if (typeof idea.audience === 'string') patch.audience = idea.audience;
  if (typeof idea.objective === 'string') patch.objective = idea.objective;
  if (typeof idea.justification === 'string') patch.justification = idea.justification;
  if (typeof idea.metric === 'string') patch.metric = idea.metric;
  if (typeof idea.owner === 'string') patch.owner = idea.owner;
  if (Array.isArray(idea.collaborators)) patch.collaborators = idea.collaborators;
  if (Array.isArray(idea.tools)) patch.tools = idea.tools;
  if (typeof idea.effort === 'string') patch.effort = idea.effort;
  if (typeof idea.status === 'string') patch.status = idea.status;
  if (typeof idea.notes === 'string') patch.notes = idea.notes;
  if (typeof idea.position === 'number') patch.position = idea.position;

  if (idea.id) {
    // Update existing (scoped to business).
    await db
      .update(marketingIdeas)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(marketingIdeas.id, idea.id), eq(marketingIdeas.business, business)));
    const [row] = await db
      .select()
      .from(marketingIdeas)
      .where(and(eq(marketingIdeas.id, idea.id), eq(marketingIdeas.business, business)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ idea: toIdea(row) });
  }

  // Create new.
  if (!patch.title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  const [row] = await db
    .insert(marketingIdeas)
    .values({ business, ...patch, createdAt: now, updatedAt: now } as NewDbMarketingIdea)
    .returning();
  return NextResponse.json({ idea: toIdea(row) });
}

// DELETE /api/calendar/ideas?business=...&id=...
export async function DELETE(req: Request) {
  await ensureSchema();
  const params = new URL(req.url).searchParams;
  const business = slug(params.get('business'));
  const id = params.get('id');
  if (!business || !id) {
    return NextResponse.json({ error: 'business and id are required' }, { status: 400 });
  }
  await db
    .delete(marketingIdeas)
    .where(and(eq(marketingIdeas.id, id), eq(marketingIdeas.business, business)));
  return NextResponse.json({ ok: true });
}
