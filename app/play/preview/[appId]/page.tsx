import { db } from '@/lib/db';
import { playgroundAppVersions, playgroundApps } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getChannelPermission } from '@/lib/api/permissions';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { signDraftAppToken } from '@/lib/playground/appToken';
import { resolveDeps } from '@/lib/playground/runtime';
import { formatAppPrice, gatesAction } from '@/lib/playground/appAccess';
import { ownerDraftDataToken } from '@/lib/playground/publicApp';
import { readAll } from '@/lib/playground/customerData';
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
 *
 * With `?v=<versionId>` it runs one release rather than the draft. Choosing which
 * version customers get is a real decision, and making it from a list of dates and
 * build notes is guessing; this is how you look at one before you point the link at
 * it. The release's own code and dependencies are used — the draft is not consulted
 * at all — so what you see is exactly what that version serves.
 */

interface PageProps {
  params: Promise<{ appId: string }>;
  /** `?v=<versionId>` previews one release instead of the draft. */
  searchParams: Promise<{ v?: string }>;
}

export const dynamic = 'force-dynamic';

// A private preview should never be indexed or previewed by a link unfurler.
export const metadata: Metadata = {
  title: 'App preview',
  robots: { index: false, follow: false },
};

export default async function PlaygroundPreviewPage({ params, searchParams }: PageProps) {
  const { appId } = await params;
  const { v: versionId } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) notFound();

  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, appId) });
  if (!app) notFound();

  // Viewing the preview requires the same access as viewing the card it hangs off.
  const permission = await getChannelPermission(
    app.channelId,
    session.user.id,
    session.user.email
  );
  if (!permission) notFound();

  // Which copy is being previewed. A named version is loaded from the versions
  // table and must belong to this app, so a guessed id from another app resolves
  // to nothing rather than rendering somebody else's code under this title.
  const version = versionId
    ? await db.query.playgroundAppVersions.findFirst({
        where: and(
          eq(playgroundAppVersions.id, versionId),
          eq(playgroundAppVersions.appId, app.id),
        ),
      })
    : null;
  if (versionId && !version) notFound();

  const code = version?.code ?? app.code;
  const dependencies = version?.dependencies ?? app.dependencies;

  // An app with no code yet is a real app mid-build, not a missing one. A build
  // runs for minutes and this link is handed out the moment the app is created,
  // so 404ing here would report a working flow as broken.
  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-6">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-violet-900 border-t-violet-500 animate-spin" />
          <p className="text-sm text-neutral-300">Kan is building {app.title}</p>
          <p className="text-xs text-neutral-500 mt-1">
            This takes a few minutes. Refresh when you&apos;re ready.
          </p>
        </div>
      </div>
    );
  }

  const title = version?.title || app.title || 'Kanthink Playground';

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : '';

  const draftData = session?.user?.id ? await ownerDraftDataToken(app, session.user.id) : null;
  const draftSaved = draftData ? await readAll(app.id, draftData.member.id, 'draft') : [];

  const srcDoc = buildPlaygroundDoc(code, {
    title,
    uploadUrl: `${origin}/api/playground/upload`,
    aiUrl: `${origin}/api/playground/ai`,
    saveUrl: `${origin}/api/playground/save`,
    // A draft token: anything this preview saves is kept off the live records,
    // so trying out a save cannot overwrite what customers have stored.
    appToken: signDraftAppToken(app.id),
    dataUrl: `${origin}/api/playground/data`,
    dataToken: draftData?.token,
    customer: draftData ? { email: draftData.member.email, name: draftData.member.name } : null,
    customerData: Object.fromEntries(draftSaved.map((r) => [r.key, r.value])),
    // The author's own preview of an action-gated app. It starts locked so they
    // can see what a visitor sees, and unlock() flips it in place — there is
    // nobody to sell to here, and buying your own app to test it is not a flow.
    pay: gatesAction(app)
      ? {
          entitled: false,
          price: formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval),
          recurring: app.priceInterval === 'month' || app.priceInterval === 'year',
          preview: true,
        }
      : null,
    deps: resolveDeps(dependencies || []).deps,
  });

  return (
    <PreviewPlaygroundFrame
      srcDoc={srcDoc}
      title={title}
      isPublished={!!app.isPublic}
      appId={app.id}
      // Named so nobody mistakes an old release for the draft they were editing.
      versionLabel={version ? `Version ${version.version}` : null}
      versionIsLive={version ? version.id === app.publishedVersionId : false}
    />
  );
}
