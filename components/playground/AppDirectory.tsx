'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppDrawer } from './AppDrawer';
import { AppThumbnailDialog } from './AppThumbnailDialog';
import { formatAppPrice } from '@/lib/playground/appAccess';
import type { AppDirectoryEntry, PlaygroundApp } from '@/lib/types';
import {
  AlertCircle,
  Check,
  Copy,
  Globe,
  Hammer,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquareText,
  Pencil,
  Play,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

type SortKey = 'updated' | 'created' | 'name' | 'audience' | 'views';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Newest' },
  { key: 'name', label: 'A–Z' },
  { key: 'audience', label: 'Most people' },
  { key: 'views', label: 'Most opened' },
];

/**
 * Apps from the same card get a colour, not a container.
 *
 * A card that produced four apps is a set, and the grid should say so — but pulling
 * those four out into their own panel breaks the one thing a grid is good at, which
 * is letting your eye run over everything at once. A ring and a chip carry the same
 * information and leave the layout alone.
 */
const GROUP_ACCENTS = [
  { ring: 'ring-violet-400/70', chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
  { ring: 'ring-sky-400/70', chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  { ring: 'ring-emerald-400/70', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  { ring: 'ring-amber-400/70', chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
  { ring: 'ring-rose-400/70', chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  { ring: 'ring-fuchsia-400/70', chip: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300' },
];

function accentFor(cardId: string) {
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) hash = (hash * 31 + cardId.charCodeAt(i)) >>> 0;
  return GROUP_ACCENTS[hash % GROUP_ACCENTS.length];
}

/**
 * Every app you have made, in one place.
 *
 * Apps live on cards, which is right — an app is an artifact of the thinking that
 * produced it — but it means the only way to find one was to remember which card,
 * on which board, six weeks ago. This is the view that does not require remembering.
 */
export function AppDirectory() {
  const [apps, setApps] = useState<AppDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [channelId, setChannelId] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [openApp, setOpenApp] = useState<AppDirectoryEntry | null>(null);
  const [thumbnailFor, setThumbnailFor] = useState<AppDirectoryEntry | null>(null);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [profilePublic, setProfilePublic] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/playground/directory', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not load your apps');
        return;
      }
      setApps(data.apps || []);
      setError(null);
    } catch {
      setError('Could not load your apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ?app=… opens straight into one app. This is where an "someone left feedback"
  // notification lands, and it should land on the thing it is about.
  const deepLinkId = searchParams.get('app');
  useEffect(() => {
    if (!deepLinkId) return;
    const match = apps.find((a) => a.id === deepLinkId);
    if (match) setOpenApp((prev) => prev ?? match);
  }, [deepLinkId, apps]);

  // The public page link in the header. Cheap, and it is the one thing people
  // forget they have turned on.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/playground/profile', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setProfileSlug(data.profile?.appPageSlug ?? null);
        setProfilePublic(!!data.profile?.appPagePublic);
      } catch { /* the header just shows less */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Fold a changed row back into the list without refetching the whole directory. */
  const applyUpdate = useCallback((updated: PlaygroundApp) => {
    setApps((prev) => prev.map((a) => (a.id === updated.id ? {
      ...a,
      title: updated.title,
      summary: updated.summary,
      tagline: updated.tagline,
      isPublic: !!updated.isPublic,
      shareToken: updated.shareToken,
      thumbnailUrl: updated.thumbnailUrl,
      thumbnailStatus: updated.thumbnailStatus ?? 'none',
      generationCount: updated.generationCount,
      paywallEnabled: !!updated.paywallEnabled,
      priceAmount: updated.priceAmount,
      priceCurrency: updated.priceCurrency,
      priceInterval: updated.priceInterval,
      updatedAt: updated.updatedAt,
    } : a)));
    setThumbnailFor((prev) => (prev && prev.id === updated.id
      ? { ...prev, thumbnailUrl: updated.thumbnailUrl ?? null }
      : prev));
  }, []);

  const channels = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of apps) map.set(app.channelId, app.channelName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [apps]);

  /** How many apps each card produced — what makes a group a group. */
  const groupSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of apps) counts.set(app.cardId, (counts.get(app.cardId) ?? 0) + 1);
    return counts;
  }, [apps]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = apps.filter((app) => {
      if (cardFilter && app.cardId !== cardFilter) return false;
      if (channelId !== 'all' && app.channelId !== channelId) return false;
      if (publishedOnly && !app.isPublic) return false;
      if (!needle) return true;
      return [app.title, app.tagline, app.summary, app.cardTitle, app.channelName]
        .some((field) => field?.toLowerCase().includes(needle));
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case 'name': return a.title.localeCompare(b.title);
        case 'created': return b.createdAt.localeCompare(a.createdAt);
        case 'audience': return b.audienceCount - a.audienceCount || b.updatedAt.localeCompare(a.updatedAt);
        case 'views': return b.viewCount - a.viewCount || b.updatedAt.localeCompare(a.updatedAt);
        default: return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [apps, query, channelId, publishedOnly, cardFilter, sort]);

  const unbuilt = apps.filter((a) => a.generationCount === 0).length;
  const missingThumbnails = apps.filter((a) => !a.thumbnailUrl && a.generationCount > 0).length;
  const filtering = Boolean(query || channelId !== 'all' || publishedOnly || cardFilter);
  const filteredCardTitle = cardFilter ? apps.find((a) => a.cardId === cardFilter)?.cardTitle : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 mb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Apps</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {loading
                ? 'Gathering everything you have built…'
                : apps.length === 0
                  ? 'Every app built from a card lands here.'
                  : `${apps.length} app${apps.length === 1 ? '' : 's'} across ${channels.length} channel${channels.length === 1 ? '' : 's'}` +
                    (unbuilt ? ` · ${unbuilt} not built yet` : '')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {profileSlug && profilePublic && (
              <PublicPageLink slug={profileSlug} />
            )}
            <Link
              href="/settings/apps"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-600 dark:text-neutral-300 hover:border-violet-400/60 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              App settings
            </Link>
          </div>
        </div>

        {/* Toolbar */}
        {apps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps, cards, channels…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
              />
            </div>

            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-700 dark:text-neutral-200 outline-none focus:border-violet-400"
            >
              <option value="all">All channels</option>
              {channels.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-700 dark:text-neutral-200 outline-none focus:border-violet-400"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>

            <button
              onClick={() => setPublishedOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
                publishedOnly
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300'
              }`}
            >
              <Globe className="w-4 h-4" />
              Published
            </button>
          </div>
        )}

        {/* The group filter, as a removable chip rather than a mode you get stuck in. */}
        {cardFilter && (
          <button
            onClick={() => setCardFilter(null)}
            className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            Apps from “{filteredCardTitle ?? 'one card'}”
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {missingThumbnails > 0 && !filtering && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-2xl border border-violet-500/20 bg-violet-500/5">
            <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {missingThumbnails} app{missingThumbnails === 1 ? ' has' : 's have'} no thumbnail yet. Hit
              {' '}<span className="font-medium text-violet-600 dark:text-violet-400">Generate</span>{' '}
              on a tile to give {missingThumbnails === 1 ? 'it' : 'them'} a face — your account style
              keeps them looking like a set.
            </p>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-sm text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading apps…
          </div>
        ) : error ? (
          <div className="py-20 flex flex-col items-center gap-2 text-sm text-red-500">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        ) : apps.length === 0 ? (
          <EmptyDirectory />
        ) : visible.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing matches that.</p>
            <button
              onClick={() => { setQuery(''); setChannelId('all'); setPublishedOnly(false); setCardFilter(null); }}
              className="mt-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map((app) => (
              <AppTile
                key={app.id}
                app={app}
                groupSize={groupSizes.get(app.cardId) ?? 1}
                grouped={!cardFilter}
                onOpen={() => setOpenApp(app)}
                onThumbnail={() => setThumbnailFor(app)}
                onFilterGroup={() => setCardFilter(app.cardId)}
              />
            ))}
          </div>
        )}
      </div>

      {openApp && (
        <AppDrawer
          appId={openApp.id}
          card={{ id: openApp.cardId, title: openApp.cardTitle, channelId: openApp.channelId }}
          isOpen
          onClose={() => { setOpenApp(null); void load(); }}
          onOpenSourceCard={(cardId) => {
            // A full navigation rather than a router push: the card lives on a board
            // this page has never loaded, and the drawer is closing behind it anyway.
            window.location.href = `/channel/${openApp.channelId}/card/${cardId}`;
          }}
        />
      )}

      {thumbnailFor && (
        <AppThumbnailDialog
          app={thumbnailFor}
          isOpen
          onClose={() => setThumbnailFor(null)}
          onUpdated={applyUpdate}
        />
      )}
    </div>
  );
}

function AppTile({
  app, groupSize, grouped, onOpen, onThumbnail, onFilterGroup,
}: {
  app: AppDirectoryEntry;
  groupSize: number;
  /** False while already filtered to one card — the ring has nothing left to say. */
  grouped: boolean;
  onOpen: () => void;
  onThumbnail: () => void;
  onFilterGroup: () => void;
}) {
  const accent = accentFor(app.cardId);
  const inGroup = grouped && groupSize > 1;
  const built = app.generationCount > 0;
  const playHref = app.isPublic && app.shareToken
    ? `/play/${app.shareToken}`
    : `/play/preview/${app.id}`;

  return (
    <div className="group flex flex-col">
      <div
        className={`relative aspect-square rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-800 ${
          inGroup ? `ring-2 ring-offset-2 ring-offset-transparent ${accent.ring}` : ''
        }`}
      >
        {app.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <PlaceholderArt pending={app.thumbnailStatus === 'pending'} failed={app.thumbnailStatus === 'failed'} />
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {inGroup && (
            <button
              onClick={onFilterGroup}
              title={`${groupSize} apps from “${app.cardTitle}”`}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm ${accent.chip}`}
            >
              <Layers className="w-2.5 h-2.5" />
              {groupSize}
            </button>
          )}
          {app.unreadCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500 text-white">
              <MessageSquareText className="w-2.5 h-2.5" />
              {app.unreadCount}
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {app.isPublic && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/90 text-white backdrop-blur-sm">
              <Globe className="w-2.5 h-2.5" />
              Live
            </span>
          )}
          {app.paywallEnabled && app.priceAmount ? (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-900/85 text-white backdrop-blur-sm">
              {formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}
            </span>
          ) : null}
        </div>

        {/* Two verbs, never one. "Open" was always ambiguous between running the
            thing and working on it, and those are different intentions. */}
        <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent pt-8">
          {built ? (
            <a
              href={playHref}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 text-neutral-900 text-xs font-semibold hover:bg-white transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              Play
            </a>
          ) : (
            <button
              onClick={onOpen}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 text-neutral-900 text-xs font-semibold hover:bg-white transition-colors"
            >
              <Hammer className="w-3 h-3" />
              Build
            </button>
          )}
          <button
            onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-900/85 text-white text-xs font-semibold hover:bg-neutral-900 backdrop-blur-sm transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>

        {!app.thumbnailUrl && (
          <button
            onClick={onThumbnail}
            className="absolute inset-x-2 top-1/2 -translate-y-1/2 mx-auto w-fit flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors group-hover:opacity-0"
          >
            <ImageIcon className="w-3 h-3" />
            Generate
          </button>
        )}
      </div>

      <div className="mt-2 min-w-0">
        <div className="flex items-start gap-1.5">
          <button
            onClick={onOpen}
            className="min-w-0 flex-1 text-left text-sm font-medium text-neutral-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400"
          >
            {app.title}
          </button>
          {app.thumbnailUrl && (
            <button
              onClick={onThumbnail}
              title="Change the thumbnail"
              className="flex-shrink-0 p-0.5 rounded text-neutral-300 dark:text-neutral-600 hover:text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
          {app.tagline || app.summary || (built ? `v${app.generationCount}` : 'Not built yet')}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
          {app.channelName}
          {app.audienceCount > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />
              {app.audienceCount}
              {app.paidCount > 0 && <span className="text-emerald-500"> · {app.paidCount} paid</span>}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The tile before it has a picture.
 *
 * Deliberately not a grey box: a directory of grey boxes tells you nothing, and an
 * app with no thumbnail is still an app you might be looking for. The initials give
 * every tile something to recognise from across the grid.
 */
function PlaceholderArt({ pending, failed }: { pending: boolean; failed: boolean }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
      {pending ? (
        <span className="flex flex-col items-center gap-1.5 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[10px]">Generating…</span>
        </span>
      ) : failed ? (
        <span className="flex flex-col items-center gap-1.5 text-amber-500">
          <AlertCircle className="w-5 h-5" />
          <span className="text-[10px]">Try again</span>
        </span>
      ) : (
        <Hammer className="w-7 h-7 text-neutral-300 dark:text-neutral-700" />
      )}
    </div>
  );
}

function PublicPageLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const href = `/apps/u/${slug}`;

  return (
    <div className="flex items-center rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <Link
        href={href}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">/apps/u/{slug}</span>
        <span className="sm:hidden">Public page</span>
      </Link>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}${href}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* the link is right there to copy by hand */ }
        }}
        title="Copy the public link"
        className="px-2.5 py-2 border-l border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function EmptyDirectory() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
        <Hammer className="w-7 h-7 text-white" />
      </div>
      <h2 className="text-lg font-medium text-neutral-900 dark:text-white">No apps yet</h2>
      <p className="mt-2 mx-auto max-w-md text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
        Apps are built from cards. Open any card, go to its Apps tab, and the card&apos;s own
        thread goes in as the brief. Everything you build shows up here.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
      >
        Go to your boards
      </Link>
    </div>
  );
}
