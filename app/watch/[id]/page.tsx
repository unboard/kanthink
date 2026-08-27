import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, type RecordingEditSpecJson } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { recordingDeliveryUrl, recordingFrameUrl } from '@/lib/cloudinary';
import { getViewStats } from '@/lib/record/views';
import WatchPlayer from '@/components/record/WatchPlayer';

export const runtime = 'nodejs';
// Views change on every load, so this page can never be statically cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await params;
  const [rec] = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  return { title: rec ? `${rec.title} — Kanthink` : 'Recording — Kanthink' };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id } = await params;

  const [rec] = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec) notFound();

  const session = await auth();
  const isOwner = session?.user?.id === rec.ownerId;

  // Only the owner sees the count, so only the owner's render pays for the query.
  const views = isOwner ? await getViewStats(rec.id) : null;

  const spec: RecordingEditSpecJson = rec.editSpec ?? { trimStart: 0, trimEnd: null, masks: [] };

  return (
    <WatchPlayer
      recording={{
        id: rec.id,
        title: rec.title,
        // Derived, not the stored column — see recordingDeliveryUrl().
        cloudinaryUrl: recordingDeliveryUrl(rec.cloudinaryPublicId),
        durationMs: rec.durationMs,
        width: rec.width,
        height: rec.height,
        aspectRatio: rec.aspectRatio || '16:9',
        editSpec: spec,
        // Same derivation the gallery uses: a custom image wins, otherwise the
        // frame at the chosen time.
        thumbnailUrl: rec.thumbUrl || recordingFrameUrl(rec.cloudinaryPublicId, { timeSec: rec.thumbTime ?? 0 }),
      }}
      isOwner={isOwner}
      views={views}
    />
  );
}
