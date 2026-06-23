import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, type RecordingEditSpecJson } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import WatchPlayer from '@/components/record/WatchPlayer';

export const runtime = 'nodejs';

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

  const spec: RecordingEditSpecJson = rec.editSpec ?? { trimStart: 0, trimEnd: null, masks: [] };

  return (
    <WatchPlayer
      recording={{
        id: rec.id,
        title: rec.title,
        cloudinaryUrl: rec.cloudinaryUrl,
        durationMs: rec.durationMs,
        width: rec.width,
        height: rec.height,
        aspectRatio: rec.aspectRatio || '16:9',
        editSpec: spec,
      }}
      isOwner={isOwner}
    />
  );
}
