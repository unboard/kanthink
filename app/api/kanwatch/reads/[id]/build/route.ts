import { NextResponse } from 'next/server';
import { kanwatchUser } from '@/lib/kanwatch/access';
import { BuildError, buildAppFromRead, extendAppFromRead } from '@/lib/kanwatch/build';

// The first build runs after the response, for minutes; the function has to live that long.
export const maxDuration = 800;

/**
 * POST /api/kanwatch/reads/:id/build
 *
 * { mode: 'new', channelId? }  a card from the page, an app on it, and the first build
 * { mode: 'extend' }           the idea into the related app's thread (no rebuild)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await kanwatchUser();
  if (!userId) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = body.mode === 'extend'
      ? await extendAppFromRead(userId, id)
      : await buildAppFromRead(userId, id, typeof body.channelId === 'string' && body.channelId ? body.channelId : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BuildError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
