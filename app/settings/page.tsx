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
      <AccountSection />

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <ThemeSection />

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <AISettings />

      {/* Commented out - question system disabled
      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <QuestionSettings />
      */}

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <SystemInstructions />
    </div>
  );
}
