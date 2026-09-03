'use client';

import type { PlaygroundApp } from '@/lib/types';
import { Globe, Hammer, Loader2, Plus } from 'lucide-react';

interface AppsPanelProps {
  apps: PlaygroundApp[];
  loading?: boolean;
  onOpen: (appId: string) => void;
  onCreate: () => void;
  /** Compact rows with no heading, for sitting under the task list. */
  compact?: boolean;
  creating?: boolean;
}

/**
 * The apps on a card, listed like tasks.
 *
 * Rendered twice: as the Apps tab, and under the task list on the Tasks tab. An app
 * is an artifact of the card in the same way a task is a piece of its work, so it
 * belongs in the same visual language — a row you can scan, not a separate mode.
 */
export function AppsPanel({ apps, loading, onOpen, onCreate, compact = false, creating = false }: AppsPanelProps) {
  if (compact && apps.length === 0 && !loading) return null;

  return (
    <div className={compact ? 'px-4 pb-4 pt-2' : 'px-4 py-4'}>
      {compact && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          Apps
        </p>
      )}

      {loading && apps.length === 0 ? (
        <div className="flex items-center gap-2 py-6 justify-center text-sm text-neutral-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading apps…
        </div>
      ) : (
        <div className="space-y-1.5">
          {apps.map((app) => (
            <AppRow key={app.id} app={app} onOpen={onOpen} />
          ))}

          {apps.length === 0 && !compact && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <Hammer className="w-5 h-5 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No apps yet</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-xs mx-auto">
                An app is built from this card — its thread and tasks go in as the brief.
              </p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onCreate}
        disabled={creating}
        className="mt-2 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        New app
      </button>
    </div>
  );
}

function AppRow({ app, onOpen }: { app: PlaygroundApp; onOpen: (appId: string) => void }) {
  const built = app.generationCount > 0;
  return (
    <button
      onClick={() => onOpen(app.id)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-violet-400/60 dark:hover:border-violet-500/40 transition-colors text-left group"
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          built
            ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
        }`}
      >
        <Hammer className="w-4 h-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
          {app.title}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
          {built
            ? `${app.summary || 'Built'} · v${app.generationCount}`
            : 'Not built yet'}
        </p>
      </div>

      {app.isPublic && (
        <Globe className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label="Published" />
      )}
    </button>
  );
}
