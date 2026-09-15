import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import {
  accessCookieName,
  canReadPrivateData,
  formatAppPrice,
  hasActiveAccess,
  isPaywalled,
} from '@/lib/playground/appAccess';
import { resolveAppSession } from '@/lib/playground/appSession';
import { purchasesForMember, toRef } from '@/lib/playground/appPurchases';
import { findPublishedApp } from '@/lib/playground/publicApp';
import { getPublishedVersion } from '@/lib/playground/appRelease';
import { readAll, signDataToken } from '@/lib/playground/customerData';
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
  const release = app ? await getPublishedVersion(app) : null;
  const title = release?.title || app?.title || 'Kanthink Playground';
  const summary = app?.tagline || release?.summary || app?.summary || 'A mini app built on Kanthink.';
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
  if (!app) notFound();

  // The release, not the draft. A build in progress — or a broken one — cannot
  // reach anybody here, because this never reads app.code at all.
  const release = await getPublishedVersion(app);
  if (!release) notFound();

  // The paywall, if there is one. Access is resolved from the row rather than from
  // the cookie alone, so a refund or a lapsed subscription takes effect on the very
  // next load without anything having to expire.
  let canManageBilling = false;
  // Resolved for every app, not only the paid ones. Customer storage means a free
  // app has something private behind a sign-in as well, and the page needs to know
  // who is here before it can hand the iframe anything.
  const jar = await cookies();
  const resolved = await resolveAppSession(jar.get(accessCookieName(app.id))?.value, app.id);
  if (isPaywalled(app)) {
    const valid = resolved?.member ?? null;
    // Entitlement lives on purchases, not on the customer, so two purchases under
    // one address are two separate grants that end independently.
    const purchases = valid ? (await purchasesForMember(valid.id)).map(toRef) : [];
    // Only a subscription has anything to manage; a one-time purchase is done.
    // Billing is inbox-private, so the link only appears for a verified session.
    canManageBilling = Boolean(
      valid?.stripeSubscriptionId && valid.stripeCustomerId && canReadPrivateData(resolved?.session),
    );

    if (!hasActiveAccess(app, resolved?.session, purchases)) {
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

  const title = release.title || app.title || 'Kanthink Playground';
  // Resolve the deployment origin from request headers so the iframe's upload
  // helper has an absolute URL it can call across the opaque-origin boundary.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';
  // Only a session that proved its address may carry data. A purchase proves the
  // payment, not the inbox, and someone's saved work is inbox-private.
  const member = resolved && canReadPrivateData(resolved.session) ? resolved.member : null;
  const saved = member ? await readAll(app.id, member.id, 'live') : [];
  const srcDoc = buildPlaygroundDoc(release.code, {
    title,
    uploadUrl: `${origin}/api/playground/upload`,
    aiUrl: `${origin}/api/playground/ai`,
    saveUrl: `${origin}/api/playground/save`,
    dataUrl: `${origin}/api/playground/data`,
    appToken: app.appToken || signAppToken(app.id),
    dataToken: member
      ? signDataToken({
          appId: app.id,
          appUserId: member.id,
          epoch: member.sessionEpoch ?? 0,
          scope: 'live',
        })
      : undefined,
    customer: member ? { email: member.email, name: member.name } : null,
    customerData: Object.fromEntries(saved.map((r) => [r.key, r.value])),
    signInUrl: `${origin}/play/${token}`,
    deps: resolveDeps(release.dependencies || []).deps,
  });

  return (
    <PublicPlaygroundFrame
      srcDoc={srcDoc}
      title={title}
      token={token}
      justPurchased={purchase === 'success'}
      canManageBilling={canManageBilling}
      customerEmail={member?.email ?? null}
    />
  );
}
