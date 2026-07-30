'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  PRODUCT_UPDATES,
  PRODUCT_UPDATE_KIND_LABELS,
  latestProductUpdate,
  unseenProductUpdates,
  type ProductUpdateKind,
} from '@/lib/productUpdates';

const LAST_SEEN_KEY = 'kanthink_updates_last_seen';

const KIND_STYLES: Record<ProductUpdateKind, string> = {
  capability: 'bg-violet-500/15 text-violet-300',
  workflow: 'bg-sky-500/15 text-sky-300',
  automation: 'bg-teal-500/15 text-teal-300',
  fix: 'bg-amber-500/15 text-amber-300',
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The last-seen marker, read through useSyncExternalStore.
 *
 * localStorage is an external store, so this is the SSR-safe way to read it: the server
 * snapshot reports "everything seen" and the client snapshot reports the truth, which
 * means the unseen badge appears on hydration instead of mismatching. Writes go through
 * `setLastSeen` so the same tab re-renders, and the `storage` event covers other tabs.
 */
/** Sentinel meaning "don't compute unseen": an id that will never match an entry. */
const SUPPRESS_BADGE = '__suppress__';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getClientSnapshot(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    // Private mode / storage disabled — treat everything as already seen rather than
    // nagging with a badge that can never be cleared.
    return SUPPRESS_BADGE;
  }
}

function getServerSnapshot(): string {
  return SUPPRESS_BADGE;
}

function setLastSeen(id: string) {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, id);
  } catch {
    /* noop */
  }
  listeners.forEach((notify) => notify());
}

/**
 * A quiet strip on the home screen surfacing meaningful platform changes.
 *
 * Collapsed by default to a single line, because the point is to be noticeable without
 * competing with the user's actual work. The unseen dot is the only thing asking for
 * attention, and expanding the panel clears it.
 */
export function WhatsNew() {
  const lastSeenId = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [isExpanded, setIsExpanded] = useState(false);

  const latest = latestProductUpdate();
  if (!latest) return null;

  const unseen = unseenProductUpdates(lastSeenId);
  const hasUnseen = unseen.length > 0;

  const toggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && hasUnseen) setLastSeen(latest.id);
  };

  return (
    <div className="mb-3 rounded-xl border border-neutral-700/60 bg-neutral-900/60">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={isExpanded}
      >
        <span className="text-sm leading-none">✨</span>
        <h2 className="text-xs font-medium text-neutral-400 flex-shrink-0">
          What&apos;s new
        </h2>
        {hasUnseen && (
          <span className="flex-shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
            {unseen.length}
          </span>
        )}
        {!isExpanded && (
          <span className="truncate text-xs text-neutral-500">{latest.title}</span>
        )}
        <svg
          className={`ml-auto h-3.5 w-3.5 flex-shrink-0 text-neutral-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="max-h-72 space-y-3 overflow-y-auto border-t border-neutral-700/60 px-4 py-3">
          {PRODUCT_UPDATES.map((update) => (
            <div key={update.id}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_STYLES[update.kind]}`}>
                  {PRODUCT_UPDATE_KIND_LABELS[update.kind]}
                </span>
                <span className="text-[10px] text-neutral-500">{formatDate(update.date)}</span>
              </div>
              <p className="text-xs font-medium text-neutral-200">{update.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{update.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
