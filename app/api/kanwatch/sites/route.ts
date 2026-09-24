import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kanwatchSites } from '@/lib/db/schema';
import { kanwatchUser } from '@/lib/kanwatch/access';

/**
 * PUT /api/kanwatch/sites — { domain, want?, purpose? }: your own read on a site.
 *
 * `want` is whether you'd like more, about the same, or less time there; `purpose`
 * is what the site is for, in your words. Both feed back into how episodes on that
 * site are judged, and into the focus notes on the day view.
 */
export async function PUT(request: Request) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const domain = String(body.domain ?? '').toLowerCase().trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(domain) || domain.length > 120) {
    return NextResponse.json({ error: 'Bad domain' }, { status: 400 });
  }
  const want = ['more', 'right', 'less'].includes(body.want) ? (body.want as 'more' | 'right' | 'less') : null;
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0, 200) : undefined;

  const now = new Date();
  const set: Partial<typeof kanwatchSites.$inferInsert> = { updatedAt: now };
  if ('want' in body) set.want = want;
  if (purpose !== undefined) set.purpose = purpose || null;

  await db.insert(kanwatchSites)
    .values({ userId, domain, want, purpose: purpose || null, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [kanwatchSites.userId, kanwatchSites.domain], set });

  return NextResponse.json({ ok: true });
}
