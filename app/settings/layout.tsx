'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const TABS = [
  { label: 'Account', href: '/settings' },
  { label: 'AI', href: '/settings/ai' },
  { label: 'Notifications', href: '/settings/notifications' },
  { label: 'Appearance', href: '/settings/appearance' },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-4 px-4 sm:px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Settings
          </h1>
        </div>

        {/* Tab bar */}
        <nav className="flex gap-1 px-4 sm:px-6 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = tab.href === '/settings'
              ? pathname === '/settings'
              : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}

          {session?.user?.isAdmin && (
            <Link
              href="/admin"
              className="shrink-0 ml-auto px-3 py-2.5 text-sm font-medium border-b-2 border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors flex items-center gap-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Admin
            </Link>
          )}
        </nav>
      </header>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
