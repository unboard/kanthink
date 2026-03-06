'use client';

import { ThemeSection } from '@/components/settings/ThemeSection';

export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-6 sm:pb-8">
      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
        <ThemeSection />
      </div>
    </div>
  );
}
