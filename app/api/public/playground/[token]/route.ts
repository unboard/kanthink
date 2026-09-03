import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/public/playground/:token
 * Returns the latest snapshot for a published playground app. No auth required.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  });

  if (!app) {
    return NextResponse.json({ error: 'App not found or not public' }, { status: 404 });
  }
  if (!app.code) {
    return NextResponse.json({ error: 'App has no code yet' }, { status: 404 });
  }

  return NextResponse.json({
    title: app.title,
    summary: app.summary || '',
    code: app.code,
    generationCount: app.generationCount || 0,
  });
}
