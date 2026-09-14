'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  History,
  Loader2,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type { PlaygroundApp } from '@/lib/types';

interface Props {
  app: PlaygroundApp;
  shareLink: string | null;
  copied: boolean;
  onCopyLink: () => void;
  onUpdated: (app: PlaygroundApp) => void;
  /** Turning the link off entirely, which is separate from which release is on it. */
  onTogglePublic: () => void;
}

/**
 * What customers are getting, and how to change it.
 *
 * Building and publishing used to be the same act: a build wrote straight to the
 * link people were using, so improving something you had sold meant rewriting it
 * underneath its customers, and a bad build broke it for everyone at once.
 *
 * They are two acts now. The draft is yours to break. This panel is the only thing
 * that moves the public link, and it moves it to a release that already exists —
 * which is why rolling back is instant and cannot half-happen.
 */
export function AppReleaseSection({
  app, shareLink, copied, onCopyLink, onUpdated, onTogglePublic,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const hasCode = Boolean(app.code);
  const live = app.publishedVersion ?? null;
  const versions = app.versions ?? [];
  const changed = !!app.hasUnpublishedChanges;

  const act = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.app) { setError(data?.error || 'That did not work.'); return; }
      onUpdated(data.app as PlaygroundApp);
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
        What customers get
      </h3>

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        {/* The live state, stated plainly. */}
        <div className="px-3 py-3 flex items-start gap-3">
          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
            live ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
          }`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              {live ? `Version ${live.version} is live` : 'Nothing published yet'}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {live
                ? changed
                  ? 'Your draft has changes nobody can see yet.'
                  : 'The draft and the live version are the same.'
                : hasCode
                  ? 'Your draft is ready. Publishing it gives it a link.'
                  : 'Build it first — there is nothing to publish.'}
            </p>
          </div>
        </div>

        {/* Publish. */}
        <button
          onClick={() => act('publish', { action: 'publish' })}
          disabled={!hasCode || !!busy || (!!live && !changed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-neutral-400 transition-colors"
        >
          {busy === 'publish'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
            : live && !changed
              ? <><Check className="w-3.5 h-3.5" /> Up to date</>
              : <><Upload className="w-3.5 h-3.5" /> {live ? `Publish version ${live.version + 1}` : 'Publish'}</>}
        </button>

        {/* The link, and the draft that is not on it. */}
        {shareLink && (
          <button
            onClick={onCopyLink}
            className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5"
          >
            {copied ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <Copy className="w-3.5 h-3.5 flex-shrink-0" />}
            <span className="truncate">{copied ? 'Link copied' : shareLink}</span>
          </button>
        )}

        {hasCode && (
          <a
            href={`/play/preview/${app.id}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
          >
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            Preview your draft
            {changed && (
              <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400">unpublished</span>
            )}
          </a>
        )}

        {/* History and rollback. */}
        {versions.length > 0 && (
          <>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <History className="w-3.5 h-3.5 flex-shrink-0" />
              {versions.length} release{versions.length === 1 ? '' : 's'}
              <span className="ml-auto text-neutral-400">{showHistory ? 'Hide' : 'Show'}</span>
            </button>

            {showHistory && (
              <ul className="border-t border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
                {versions.map((v) => (
                  <li key={v.id} className="px-3 py-2.5 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        Version {v.version}
                        {v.isLive && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold uppercase tracking-wide">
                            Live
                          </span>
                        )}
                      </p>
                      {v.notes && (
                        <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2">
                          {v.notes}
                        </p>
                      )}
                      {v.publishedAt && (
                        <p className="mt-0.5 text-[10px] text-neutral-400">
                          {new Date(v.publishedAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                    {!v.isLive && (
                      <button
                        onClick={() => act(v.id, { action: 'rollback', versionId: v.id })}
                        disabled={!!busy}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-600 dark:text-neutral-300 hover:border-violet-400 disabled:opacity-40 transition-colors"
                      >
                        {busy === v.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <RotateCcw className="w-2.5 h-2.5" />}
                        Serve this
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* Taking the link down is a different decision from which release is on it. */}
        {app.isPublic && (
          <label className="flex items-center gap-3 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 cursor-pointer">
            <input
              type="checkbox"
              checked={!!app.isPublic}
              onChange={onTogglePublic}
              className="w-4 h-4 rounded accent-violet-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-white flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-emerald-500" />
                Link is open
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Turning this off closes the link without changing which release is on it.
              </p>
            </div>
          </label>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
          {error}
        </p>
      )}
    </section>
  );
}
