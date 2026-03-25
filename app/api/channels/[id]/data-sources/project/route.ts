import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelDataSources } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';

// POST /api/channels/[id]/data-sources/project — save selected Mixpanel project
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const { id: channelId } = await params;

  const body = await request.json();
  const { projectId, projectName } = body;

  if (!projectId || !projectName) {
    return NextResponse.json({ error: 'Missing projectId or projectName' }, { status: 400 });
  }

  // Get existing data source
  const [source] = await db
    .select()
    .from(channelDataSources)
    .where(and(eq(channelDataSources.channelId, channelId), eq(channelDataSources.provider, 'mixpanel')))
    .limit(1);

  if (!source) {
    return NextResponse.json({ error: 'Mixpanel not connected' }, { status: 404 });
  }

  // Merge projectId and projectName into existing metadata
  const existingMetadata = (source.metadata as Record<string, unknown>) || {};
  const updatedMetadata = {
    ...existingMetadata,
    projectId,
    projectName,
  };

  await db
    .update(channelDataSources)
    .set({
      metadata: updatedMetadata,
      updatedAt: new Date(),
    })
    .where(eq(channelDataSources.id, source.id));

  return NextResponse.json({ success: true, metadata: updatedMetadata });
}
