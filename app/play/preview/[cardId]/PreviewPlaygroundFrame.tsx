'use client';

import { useState } from 'react';
import { RefreshCw, Eye } from 'lucide-react';

interface Props {
  srcDoc: string;
  title: string;
  isPublished: boolean;
}

/**
 * Full-viewport owner preview.
 *
 * Deliberately thinner chrome than the public frame: no "Made with Kanthink"
 * footer (you know), just a title, a reload, and a note when the playground isn't
 * published yet. The iframe gets everything else.
 */
export function PreviewPlaygroundFrame({ srcDoc, title, isPublished }: Props) {
  // Remounting the iframe is the only reliable way to re-run a srcDoc document —
  // the app keeps no state outside it, so a key bump is a clean restart.
  const [runId, setRunId] = useState(0);

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-neutral-950">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
            {title}
          </span>
          {!isPublished && (
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
              Preview — not published
            </span>
          )}
        </div>
        <button
          onClick={() => setRunId((n) => n + 1)}
          title="Restart the app"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Restart
        </button>
      </div>
      <iframe
        key={runId}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-modals allow-popups allow-forms"
        allow="autoplay; clipboard-write"
        className="flex-1 w-full border-0"
        title={title}
      />
    </div>
  );
}
