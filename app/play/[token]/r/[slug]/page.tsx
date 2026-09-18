import { db } from '@/lib/db';
import { playgroundApps } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import {
  accessCookieName,
  formatAppPrice,
  gatesAction,
  hasActiveAccess,
  isPaywalled,
} from '@/lib/playground/appAccess';
import { resolveAppSession } from '@/lib/playground/appSession';
import { purchasesForMember, toRef } from '@/lib/playground/appPurchases';
import { AppPaywall } from '../../AppPaywall';
import { signPayToken } from '@/lib/playground/payToken';
import { getPublishedVersion } from '@/lib/playground/appRelease';
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
  if (!app) notFound();

  // A record link opens the published release, like every other way in.
  const release = await getPublishedVersion(app);
  if (!release) notFound();

  const record = (app.savedRecords || []).find((r) => r.slug === slug);
  if (!record) notFound();

  // A record link is a second door into the same app, so it needs the same lock —
  // and the same choice of where that lock sits. Gating this at the door while the
  // app gates an action would make a shared record the way around the paywall.
  let resolved = null as Awaited<ReturnType<typeof resolveAppSession>>;
  let entitled = false;
  if (isPaywalled(app)) {
    const jar = await cookies();
    resolved = await resolveAppSession(jar.get(accessCookieName(app.id))?.value, app.id);
    const valid = resolved?.member ?? null;
    // Entitlement lives on purchases, not on the customer, so two purchases under
    // one address are two separate grants that end independently.
    const purchases = valid ? (await purchasesForMember(valid.id)).map(toRef) : [];

    entitled = hasActiveAccess(app, resolved?.session, purchases);

    if (!entitled && !gatesAction(app)) {
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

  const title = release.title || app.title || 'Kanthink Playground';

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';

  const srcDoc = buildPlaygroundDoc(release.code, {
    title,
    uploadUrl: `${origin}/api/playground/upload`,
    aiUrl: `${origin}/api/playground/ai`,
    saveUrl: `${origin}/api/playground/save`,
    appToken: app.appToken || signAppToken(app.id),
    pay: gatesAction(app)
      ? {
          entitled,
          price: formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval),
          recurring: app.priceInterval === 'month' || app.priceInterval === 'year',
          token:
            entitled && resolved
              ? signPayToken({
                  appId: app.id,
                  appUserId: resolved.member.id,
                  epoch: resolved.member.sessionEpoch ?? 0,
                  scope: resolved.session.scope,
                  purchaseId: resolved.session.purchaseId,
                })
              : null,
        }
      : null,
    deps: resolveDeps(release.dependencies || []).deps,
    initialRecord: {
      slug: record.slug,
      data: record.data,
      label: record.label,
    },
  });

  return (
    <PublicPlaygroundFrame
      srcDoc={srcDoc}
      title={title}
      token={token}
      unlockPrice={
        gatesAction(app) && !entitled
          ? formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)
          : null
      }
      unlockRecurring={app.priceInterval === 'month' || app.priceInterval === 'year'}
    />
  );
}
