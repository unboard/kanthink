import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const rows = await db
    .select({
      id: recordings.id,
      title: recordings.title,
      cloudinaryUrl: recordings.cloudinaryUrl,
      durationMs: recordings.durationMs,
      aspectRatio: recordings.aspectRatio,
      createdAt: recordings.createdAt,
    })
    .from(recordings)
    .where(eq(recordings.ownerId, session.user.id))
    .orderBy(desc(recordings.createdAt));

  return NextResponse.json({ recordings: rows });
}
