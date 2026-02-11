'use client';

import { AccountSection } from '@/components/settings/AccountSection';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { AISettings } from '@/components/settings/AISettings';
import { SystemInstructions } from '@/components/settings/SystemInstructions';
// Commented out - question system disabled
// import { QuestionSettings } from '@/components/settings/QuestionSettings';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-white mb-6 sm:hidden">Settings</h1>

      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6">
        <AccountSection />
      </div>

      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6">
        <ThemeSection />
      </div>

      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6">
        <AISettings />
      </div>

      {/* Commented out - question system disabled
      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6">
        <QuestionSettings />
      </div>
      */}

      <div className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6">
        <SystemInstructions />
      </div>
    </div>
  );
}
