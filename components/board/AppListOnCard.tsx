'use client';

import type { ID, PlaygroundAppSummary } from '@/lib/types';

interface AppListOnCardProps {
  apps: PlaygroundAppSummary[];
  maxVisible?: number;
  onAppClick?: (appId: ID) => void;
}

/**
 * Apps on the board card face, listed the way tasks are.
 *
 * An app is a thing the card produced, so it is visible and reachable from the
 * column without opening the card first — same as a task. Deliberately quieter
 * than the task rows: there is no checkbox and no add affordance, because making
 * an app costs a model call and belongs behind the drawer.
 */
export function AppListOnCard({ apps, maxVisible = 3, onAppClick }: AppListOnCardProps) {
  const visible = apps.filter((a) => !a.isArchived);
  if (visible.length === 0) return null;

  const shown = visible.slice(0, maxVisible);
  const hiddenCount = visible.length - shown.length;

  return (
    <div className="mt-2 space-y-0.5 -mx-1.5" onClick={(e) => e.stopPropagation()}>
      {shown.map((app) => (
        <div
          key={app.id}
          className="flex items-center gap-2 group/app px-1.5 py-1 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          onClick={() => onAppClick?.(app.id)}
        >
          <span
            className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${
              app.generationCount > 0
                ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'
            }`}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 3l-2.286 6.857L5 12l5.714 2.143L13 21l2.286-6.857L21 12l-5.714-2.143L13 3z" />
            </svg>
          </span>
          <span className="text-xs flex-1 truncate text-neutral-600 dark:text-neutral-400 group-hover/app:text-neutral-900 dark:group-hover/app:text-white">
            {app.title}
          </span>
          {app.generationCount > 0 && (
            <span className="text-[10px] text-neutral-400 flex-shrink-0">v{app.generationCount}</span>
          )}
          {app.isPublic && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"
              title="Published"
            />
          )}
        </div>
      ))}

      {hiddenCount > 0 && (
        <div className="text-xs text-neutral-400 px-1.5">
          +{hiddenCount} more app{hiddenCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
