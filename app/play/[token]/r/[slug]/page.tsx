import { db } from '@/lib/db';
import { appUsers, playgroundApps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import {
  accessCookieName,
  formatAppPrice,
  hasActiveAccess,
  isPaywalled,
  verifyAccessToken,
} from '@/lib/playground/appAccess';
import { AppPaywall } from '../../AppPaywall';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import { PublicPlaygroundFrame } from '../../PublicPlaygroundFrame';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ token: string; slug: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, slug } = await params;
  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  });
  const record = (app?.savedRecords || []).find((r) => r.slug === slug);
  const appTitle = app?.title || 'Kanthink Playground';
  const summary = app?.summary || 'A mini app built on Kanthink.';
  const ogTitle = record?.label ? `${record.label} · ${appTitle}` : appTitle;
  return {
    title: `${ogTitle} · Kanthink`,
    description: summary,
    openGraph: { title: ogTitle, description: summary },
  };
}

/**
 * Public per-record render. Same playground app as `/play/{token}` but the
 * iframe is hydrated with `window.kanthinkInitial.record` set to the saved
 * record, so the app can mount in a specific saved state (e.g. an idea the
 * sender wants the recipient to see first).
 */
export default async function PlayRecordPage({ params }: PageProps) {
  const { token, slug } = await params;

  const app = await db.query.playgroundApps.findFirst({
    where: and(eq(playgroundApps.shareToken, token), eq(playgroundApps.isPublic, true)),
  });
  if (!app?.code) notFound();

  const record = (app.savedRecords || []).find((r) => r.slug === slug);
  if (!record) notFound();

  // A record link is a second door into the same app, so it needs the same lock.
  if (isPaywalled(app)) {
    const jar = await cookies();
    const memberId = verifyAccessToken(jar.get(accessCookieName(app.id))?.value);
    const member = memberId
      ? await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
      : null;
    const valid = member && member.appId === app.id ? member : null;

    if (!hasActiveAccess(app, valid)) {
      return (
        <AppPaywall
          token={token}
          title={app.title}
          tagline={app.tagline || app.summary || ''}
          thumbnailUrl={app.thumbnailUrl ?? null}
          price={formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}
          recurring={app.priceInterval === 'month' || app.priceInterval === 'year'}
          notice={null}
        />
      );
    }
  }

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
    initialRecord: {
      slug: record.slug,
      data: record.data,
      label: record.label,
    },
  });

  return <PublicPlaygroundFrame srcDoc={srcDoc} title={title} token={token} />;
}
