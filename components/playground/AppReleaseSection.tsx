'use client';

import { useState } from 'react';
import { Undo2,
  Check,
  Copy,
  Eye,
  ExternalLink,
  FileEdit,
  Globe,
  History,
  Loader2,
  Lock,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type { AppStatus, PlaygroundApp } from '@/lib/types';

interface Props {
  app: PlaygroundApp;
  shareLink: string | null;
  copied: boolean;
  onCopyLink: () => void;
  onUpdated: (app: PlaygroundApp) => void;
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
 *
 * ## Two questions, asked separately
 *
 * The panel used to ask one: "publish?" — with a checkbox for the link buried
 * underneath, visible only once you were already public. That conflated whether the
 * app is up with which version is on it, and there was no way to say "take it down
 * but remember what I was serving".
 *
 * So: a status row at the top — Draft, Published, Unpublished — and a version list
 * below it. The status says whether anyone can reach the app. The list says what
 * they get when they do, with every release previewable before you point the link
 * at it. Neither answer moves the other.
 */
export function AppReleaseSection({
  app, shareLink, copied, onCopyLink, onUpdated,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Open when there is actually a choice to make. One release is a fact; two or
  // more is a decision, and hiding it behind a toggle is how you end up not knowing
  // you could have gone back.
  const [showHistory, setShowHistory] = useState((app.versions?.length ?? 0) > 1);
  const [undoing, setUndoing] = useState(false);

  const hasCode = Boolean(app.code);
  const live = app.publishedVersion ?? null;
  const versions = app.versions ?? [];
  const changed = !!app.hasUnpublishedChanges;
  // Fall back to deriving it, so an older response that predates the field still
  // renders the right state rather than claiming everything is a draft.
  const status: AppStatus = app.status ?? (live ? (app.isPublic ? 'published' : 'unpublished') : 'draft');

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
        {/* Whether anyone can reach it. Three states, exactly one lit, each naming
            what it IS rather than what pressing it would do. */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/60">
            <StatusPill
              active={status === 'draft'}
              // Draft is not a thing you choose; it is where you are until you
              // publish, and there is no way back to it without losing history.
              disabled
              icon={<FileEdit className="w-3 h-3" />}
              label="Draft"
            />
            <StatusPill
              active={status === 'published'}
              disabled={!hasCode || !!busy}
              busy={busy === 'status'}
              onClick={() => act('status', live ? { action: 'republish' } : { action: 'publish' })}
              icon={<Globe className="w-3 h-3" />}
              label="Published"
            />
            <StatusPill
              active={status === 'unpublished'}
              disabled={!live || !!busy}
              busy={busy === 'status'}
              onClick={() => act('status', { action: 'unpublish' })}
              icon={<Lock className="w-3 h-3" />}
              label="Unpublished"
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {status === 'draft'
              ? hasCode
                ? 'Nobody can open this yet. Publishing gives it a link.'
                : 'Build it first — there is nothing to publish.'
              : status === 'unpublished'
                ? `The link is closed. Version ${live!.version} is still the chosen release, so republishing puts it straight back.`
                : `Version ${live!.version} is live on the link.`}
          </p>
        </div>

        {/* What they get. Separate from whether they can get it — an app can be
            unpublished and still have a version waiting, which is the state the old
            single control could not express. */}
        <button
          onClick={() => act('publish', { action: 'publish' })}
          disabled={!hasCode || !!busy || !changed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-neutral-400 transition-colors"
        >
          {busy === 'publish'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
            : !changed
              ? <><Check className="w-3.5 h-3.5" /> Draft matches version {live?.version ?? 1}</>
              : <><Upload className="w-3.5 h-3.5" /> {live ? `Publish version ${live.version + 1}` : 'Publish'}</>}
        </button>

        {/* The link, while it is open. An unpublished app still has a share token,
            but offering it to copy would be offering a link that 404s. */}
        {shareLink && status === 'published' && (
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

        {/* One step back, which exists whether or not anything was ever published.
            Rollback below needs a release; this does not, and the case it covers is
            the common one — a build that went somewhere you did not want. */}
        {app.previousBuild?.code && (
          <div className="px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Undo2 className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-700 dark:text-neutral-200">
                  Undo the last build
                </p>
                <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 leading-snug truncate">
                  {app.previousBuild.notes?.trim() || `Back to v${app.previousBuild.generationCount}`}
                </p>
              </div>
              <button
                onClick={async () => {
                  setUndoing(true);
                  try {
                    const res = await fetch(`/api/playground/apps/${app.id}/undo`, { method: 'POST' });
                    const data = await res.json();
                    if (data?.app) onUpdated(data.app as PlaygroundApp);
                  } finally {
                    setUndoing(false);
                  }
                }}
                disabled={undoing}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {undoing ? 'Going back…' : 'Undo'}
              </button>
            </div>
          </div>
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
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {/* Look before you point the link at it. Runs this release's
                          own code, not the draft. */}
                      <a
                        href={`/play/preview/${app.id}?v=${v.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`Preview version ${v.version}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-600 dark:text-neutral-300 hover:border-violet-400 transition-colors"
                      >
                        <Eye className="w-2.5 h-2.5" />
                        Preview
                      </a>
                      {!v.isLive && (
                        <button
                          onClick={() => act(v.id, { action: 'rollback', versionId: v.id })}
                          disabled={!!busy}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-600 dark:text-neutral-300 hover:border-violet-400 disabled:opacity-40 transition-colors"
                        >
                          {busy === v.id
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <RotateCcw className="w-2.5 h-2.5" />}
                          Make live
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
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

/**
 * One state in the status row.
 *
 * Reads as a segmented control rather than three buttons because the states are
 * exclusive, and the lit one is where you are — not a thing you are about to do.
 */
function StatusPill({
  active, disabled, busy, onClick, icon, label,
}: {
  active: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      aria-pressed={active}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
        active
          ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm ring-1 ring-black/5'
          : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-40 disabled:hover:text-neutral-500'
      }`}
    >
      {busy && !active ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
