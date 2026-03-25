import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

// GET /api/channels/[id]/data-sources — list connected data sources
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id: channelId } = await params;

  const sources = await db
    .select({
      id: channelDataSources.id,
      provider: channelDataSources.provider,
      status: channelDataSources.status,
      metadata: channelDataSources.metadata,
      createdAt: channelDataSources.createdAt,
    })
    .from(channelDataSources)
    .where(eq(channelDataSources.channelId, channelId));

  return NextResponse.json({ sources });
}

// DELETE /api/channels/[id]/data-sources?provider=mixpanel — disconnect a data source
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id: channelId } = await params;
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');

  if (!provider) {
    return NextResponse.json({ error: 'Missing provider param' }, { status: 400 });
  }

  await db.delete(channelDataSources).where(
    and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, provider))
  );

  return NextResponse.json({ success: true });
}
