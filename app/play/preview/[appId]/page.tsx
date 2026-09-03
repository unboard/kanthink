import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getChannelPermission } from '@/lib/api/permissions';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import { PreviewPlaygroundFrame } from './PreviewPlaygroundFrame';
import type { Metadata } from 'next';

/**
 * Owner-only full-viewport preview of an app, published or not.
 *
 * This exists because the old in-page fullscreen toggle rendered `position: fixed`
 * inside the card drawer. Any transformed ancestor makes a fixed element resolve
 * against that ancestor instead of the viewport, so "fullscreen" was clipped to the
 * drawer and unusable. A real page in a new tab has no container to escape.
 *
 * Unlike /play/{token} this does NOT require the app to be public — it's gated on
 * channel permission instead, so you can try an app before deciding to publish.
 */

interface PageProps {
  params: Promise<{ appId: string }>;
}

export const dynamic = 'force-dynamic';

// A private preview should never be indexed or previewed by a link unfurler.
export const metadata: Metadata = {
  title: 'App preview',
  robots: { index: false, follow: false },
};

export default async function PlaygroundPreviewPage({ params }: PageProps) {
  const { appId } = await params;

  const session = await auth();
  if (!session?.user?.id) notFound();

  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  if (!app?.code) notFound();

  // Viewing the preview requires the same access as viewing the card it hangs off.
  const permission = await getChannelPermission(
    app.channelId,
    session.user.id,
    session.user.email
  );
  if (!permission) notFound();

  const title = app.title || 'Kanthink Playground';

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

  return <PreviewPlaygroundFrame srcDoc={srcDoc} title={title} isPublished={!!app.isPublic} />;
}
