import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import { PublicPlaygroundFrame } from './PublicPlaygroundFrame';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  });
  const title = app?.title || 'Kanthink Playground';
  const summary = app?.summary || 'A mini app built on Kanthink.';
  return {
    title: `${title} · Kanthink`,
    description: summary,
    openGraph: { title, description: summary },
  };
}

export default async function PlayPage({ params }: PageProps) {
  const { token } = await params;

  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  });

  if (!app?.code) {
    notFound();
  }

  const title = app.title || 'Kanthink Playground';
  // Resolve the deployment origin from request headers so the iframe's upload
  // helper has an absolute URL it can call across the opaque-origin boundary.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';
  const srcDoc = buildPlaygroundDoc(app.code, {
    title,
    uploadUrl: `${origin}/api/playground/upload`,
    aiUrl: `${origin}/api/playground/ai`,
    saveUrl: `${origin}/api/playground/save`,
    appToken: app.appToken || signAppToken(app.id),
    deps: resolveDeps(app.dependencies || []).deps,
  });

  return <PublicPlaygroundFrame srcDoc={srcDoc} title={title} />;
}
