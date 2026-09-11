import { db } from '@/lib/db';
import { appUsers, playgroundApps } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import {
  accessCookieName,
  formatAppPrice,
  hasActiveAccess,
  isPaywalled,
  verifyAccessToken,
} from '@/lib/playground/appAccess';
import { findPublishedApp } from '@/lib/playground/publicApp';
import { PublicPlaygroundFrame } from './PublicPlaygroundFrame';
import { AppPaywall } from './AppPaywall';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ purchase?: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const app = await findPublishedApp(token);
  const title = app?.title || 'Kanthink Playground';
  const summary = app?.tagline || app?.summary || 'A mini app built on Kanthink.';
  return {
    title: `${title} · Kanthink`,
    description: summary,
    openGraph: {
      title,
      description: summary,
      images: app?.thumbnailUrl ? [{ url: app.thumbnailUrl }] : undefined,
    },
  };
}

export default async function PlayPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { purchase } = await searchParams;

  const app = await findPublishedApp(token);
  if (!app?.code) {
    notFound();
  }

  // The paywall, if there is one. Access is resolved from the row rather than from
  // the cookie alone, so a refund or a lapsed subscription takes effect on the very
  // next load without anything having to expire.
  let canManageBilling = false;
  if (isPaywalled(app)) {
    const jar = await cookies();
    const memberId = verifyAccessToken(jar.get(accessCookieName(app.id))?.value);
    const member = memberId
      ? await db.query.appUsers.findFirst({ where: eq(appUsers.id, memberId) })
      : null;
    const valid = member && member.appId === app.id ? member : null;
    // Only a subscription has anything to manage; a one-time purchase is done.
    canManageBilling = Boolean(valid?.stripeSubscriptionId && valid.stripeCustomerId);

    if (!hasActiveAccess(app, valid)) {
      return (
        <AppPaywall
          token={token}
          title={app.title}
          tagline={app.tagline || app.summary || ''}
          thumbnailUrl={app.thumbnailUrl ?? null}
          price={formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}
          recurring={app.priceInterval === 'month' || app.priceInterval === 'year'}
          notice={purchase === 'canceled' ? 'canceled' : purchase === 'unconfirmed' ? 'unconfirmed' : null}
        />
      );
    }
  }

  // A cheap opens counter for the owner's directory. Fire and forget — a page that
  // fails to count a view should still show the app.
  void db
    .update(playgroundApps)
    .set({ viewCount: sql`${playgroundApps.viewCount} + 1` })
    .where(eq(playgroundApps.id, app.id))
    .catch(() => {});

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

  return (
    <PublicPlaygroundFrame
      srcDoc={srcDoc}
      title={title}
      token={token}
      justPurchased={purchase === 'success'}
      canManageBilling={canManageBilling}
    />
  );
}
