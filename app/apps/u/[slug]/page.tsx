import { db } from '@/lib/db';
import { channels, playgroundApps, users } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { formatAppPrice } from '@/lib/playground/appAccess';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

/** The publisher and their listed apps, or null if the page is not public. */
async function loadPage(slug: string) {
  const owner = await db.query.users.findFirst({
    where: and(eq(users.appPageSlug, slug), eq(users.appPagePublic, true)),
    columns: { id: true, name: true, image: true, appPageTitle: true, appPageBio: true },
  });
  if (!owner) return null;

  // Apps belong to channels, and channels belong to one person — so "this
  // publisher's apps" is the set on the channels they own. An app on a channel
  // shared *to* them is somebody else's to publish.
  const owned = await db.query.channels.findMany({
    where: eq(channels.ownerId, owner.id),
    columns: { id: true },
  });
  if (owned.length === 0) return { owner, apps: [] };

  const apps = await db.query.playgroundApps.findMany({
    where: and(
      inArray(playgroundApps.channelId, owned.map((c) => c.id)),
      eq(playgroundApps.isPublic, true),
      eq(playgroundApps.isArchived, false),
    ),
    orderBy: [desc(playgroundApps.updatedAt)],
  });

  return {
    owner,
    // listedInDirectory defaults on, so treat only an explicit false as hidden —
    // rows written before the column existed must not silently vanish.
    apps: apps.filter((a) => a.listedInDirectory !== false && a.shareToken && a.code),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return { title: 'Not found' };

  const title = page.owner.appPageTitle || `${page.owner.name || 'Apps'}`;
  const description = page.owner.appPageBio || `Apps built on Kanthink.`;
  return {
    title: `${title} · Kanthink`,
    description,
    openGraph: {
      title,
      description,
      images: page.apps.find((a) => a.thumbnailUrl)?.thumbnailUrl
        ? [{ url: page.apps.find((a) => a.thumbnailUrl)!.thumbnailUrl! }]
        : undefined,
    },
  };
}

/**
 * A publisher's public shelf.
 *
 * Everything they have published and chosen to list, with a price where there is
 * one. No account needed to look; the apps themselves decide who gets in.
 */
export default async function PublicAppPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();

  const { owner, apps } = page;
  const title = owner.appPageTitle || (owner.name ? `${owner.name}'s apps` : 'Apps');

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
        <header className="flex items-start gap-4 mb-10">
          {owner.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={owner.image}
              alt=""
              className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-neutral-900 dark:text-white">
              {title}
            </h1>
            {owner.appPageBio && (
              <p className="mt-2 max-w-2xl text-sm sm:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {owner.appPageBio}
              </p>
            )}
          </div>
        </header>

        {apps.length === 0 ? (
          <p className="py-20 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Nothing published yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <a
                key={app.id}
                href={`/play/${app.shareToken}`}
                className="group flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden hover:border-violet-400/60 hover:shadow-lg hover:shadow-violet-500/5 transition-all"
              >
                <div className="relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  {app.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
                      <KanthinkIcon size={28} className="text-violet-400" />
                    </div>
                  )}
                  {app.paywallEnabled && app.priceAmount ? (
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-900/85 text-white backdrop-blur-sm">
                      {formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}
                    </span>
                  ) : (
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/90 text-white backdrop-blur-sm">
                      Free
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                    {app.title}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {app.tagline || app.summary || 'Open it and see.'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}

        <footer className="mt-16 pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            <KanthinkIcon size={14} className="text-violet-500" />
            <span className="font-medium">Made with Kanthink</span>
          </Link>
        </footer>
      </div>
    </div>
  );
}
