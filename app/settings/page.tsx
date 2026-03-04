'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AccountSection } from '@/components/settings/AccountSection';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { AISettings } from '@/components/settings/AISettings';
import { SystemInstructions } from '@/components/settings/SystemInstructions';
// Commented out - question system disabled
// import { QuestionSettings } from '@/components/settings/QuestionSettings';

export default function SettingsPage() {
  const { data: session } = useSession();

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

      {session?.user?.isAdmin && (
        <Link
          href="/admin"
          className="rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 mb-6 flex items-center gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
        >
          <svg className="h-5 w-5 text-neutral-500 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Admin</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Manage admin tools and settings</p>
          </div>
          <svg className="h-4 w-4 ml-auto text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}
