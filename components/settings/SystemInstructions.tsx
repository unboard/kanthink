'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/lib/settingsStore';

export function SystemInstructions() {
  const ai = useSettingsStore((s) => s.ai);
  const updateAISettings = useSettingsStore((s) => s.updateAISettings);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);

  const [instructions, setInstructions] = useState('');

  // Sync local state with store after hydration
  useEffect(() => {
    if (hasHydrated) {
      setInstructions(ai.systemInstructions);
    }
  }, [hasHydrated, ai.systemInstructions]);

  const handleBlur = () => {
    if (instructions !== ai.systemInstructions) {
      updateAISettings({ systemInstructions: instructions });
    }
  };

  if (!hasHydrated) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">System Instructions</h2>
        <div className="animate-pulse">
          <div className="h-32 bg-neutral-200 dark:bg-neutral-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">System Instructions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Set the AI&apos;s personality and approach for all channels
        </p>
      </div>

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        onBlur={handleBlur}
        placeholder="You are a creative and thoughtful assistant. Be concise and actionable. Focus on practical ideas that can be implemented quickly..."
        rows={6}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
      />

      <div className="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          How instructions work
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-neutral-500">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-500" />
            <span><strong>System instructions</strong> (above) apply to all channels</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
            <span><strong>Channel instructions</strong> are set in each channel&apos;s settings</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-300" />
            <span><strong>Column instructions</strong> can be added via the column menu</span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-neutral-500">
          All three levels combine when generating cards, giving you fine-grained control over AI suggestions.
        </p>
      </div>
    </div>
  );
}
