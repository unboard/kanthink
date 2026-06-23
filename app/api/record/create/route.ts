import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings } from '@/lib/db/schema';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { recordingDeliveryUrl } from '@/lib/cloudinary';

export const runtime = 'nodejs';

/**
 * Called after the browser has uploaded the recording directly to Cloudinary.
 * Persists a row keyed by a short share id and returns the watch URL.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  const body = await request.json().catch(() => null);
  if (!body || typeof body.publicId !== 'string') {
    return NextResponse.json({ error: 'Missing publicId' }, { status: 400 });
  }

  const id = nanoid(10);
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled recording';

  await db.insert(recordings).values({
    id,
    ownerId: session.user.id,
    title,
    cloudinaryPublicId: body.publicId,
    cloudinaryUrl: recordingDeliveryUrl(body.publicId),
    durationMs: Math.max(0, Math.round(Number(body.durationMs) || 0)),
    width: Math.max(0, Math.round(Number(body.width) || 0)),
    height: Math.max(0, Math.round(Number(body.height) || 0)),
    aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : '16:9',
    editSpec: { trimStart: 0, trimEnd: null, masks: [] },
  });

  return NextResponse.json({ id, url: `/watch/${id}` });
}
