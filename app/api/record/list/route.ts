import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { recordingFrameUrl } from '@/lib/cloudinary';

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
      cloudinaryPublicId: recordings.cloudinaryPublicId,
      durationMs: recordings.durationMs,
      width: recordings.width,
      height: recordings.height,
      aspectRatio: recordings.aspectRatio,
      thumbUrl: recordings.thumbUrl,
      thumbTime: recordings.thumbTime,
      createdAt: recordings.createdAt,
    })
    .from(recordings)
    .where(eq(recordings.ownerId, session.user.id))
    .orderBy(desc(recordings.createdAt));

  // Resolve each recording's effective thumbnail: a custom/AI image if present,
  // otherwise a Cloudinary-rendered video frame at the chosen time.
  const withThumbs = rows.map((r) => ({
    ...r,
    thumbnailUrl:
      r.thumbUrl || recordingFrameUrl(r.cloudinaryPublicId, { timeSec: r.thumbTime ?? 0 }),
  }));

  return NextResponse.json({ recordings: withThumbs });
}
