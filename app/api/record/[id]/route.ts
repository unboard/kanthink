import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, type RecordingEditSpecJson, type RecordingMaskJson } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { destroyVideo } from '@/lib/cloudinary';

export const runtime = 'nodejs';

/** Public read — used by the watch page (server) and not strictly needed by clients, but handy. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchema();
  const { id } = await params;

  const [rec] = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(rec);
}

function sanitizeEditSpec(input: unknown): RecordingEditSpecJson | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const trimStart = Math.max(0, Number(raw.trimStart) || 0);
  const trimEnd = raw.trimEnd == null ? null : Math.max(0, Number(raw.trimEnd) || 0);
  const masks: RecordingMaskJson[] = Array.isArray(raw.masks)
    ? raw.masks.slice(0, 50).map((m): RecordingMaskJson => {
        const mm = m as Record<string, unknown>;
        return {
          id: typeof mm.id === 'string' ? mm.id : crypto.randomUUID(),
          start: Math.max(0, Number(mm.start) || 0),
          end: Math.max(0, Number(mm.end) || 0),
          style: mm.style === 'blur' ? 'blur' : 'cover',
          label: typeof mm.label === 'string' ? mm.label.slice(0, 120) : undefined,
        };
      })
    : [];
  return { trimStart, trimEnd, masks };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id } = await params;

  const [rec] = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (rec.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.title === 'string') {
    update.title = body.title.trim().slice(0, 200) || 'Untitled recording';
  }
  if ('editSpec' in body) {
    const spec = sanitizeEditSpec(body.editSpec);
    if (spec) update.editSpec = spec;
  }
  // Thumbnail: an explicit image URL (AI/custom), or null to fall back to a frame.
  if ('thumbUrl' in body) {
    update.thumbUrl =
      typeof body.thumbUrl === 'string' && body.thumbUrl.trim() ? body.thumbUrl.trim() : null;
  }
  if ('thumbTime' in body) {
    update.thumbTime = Math.max(0, Math.round(Number(body.thumbTime) || 0));
    // Choosing a scene frame implies dropping any custom image, unless one was
    // explicitly provided in the same request.
    if (!('thumbUrl' in body)) update.thumbUrl = null;
  }

  await db.update(recordings).set(update).where(eq(recordings.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id } = await params;

  const [rec] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id), eq(recordings.ownerId, session.user.id)))
    .limit(1);
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await destroyVideo(rec.cloudinaryPublicId).catch(() => {});
  await db.delete(recordings).where(eq(recordings.id, id));

  return NextResponse.json({ ok: true });
}
