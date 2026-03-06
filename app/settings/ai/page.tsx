'use client';

import { AISettings } from '@/components/settings/AISettings';
import { SystemInstructions } from '@/components/settings/SystemInstructions';

export default function AISettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
        <AISettings />
      </div>

      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
        <SystemInstructions />
      </div>
    </div>
  );
}
