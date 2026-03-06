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

          {session?.user?.isAdmin && (
            <Link
              href="/admin"
              className="ml-auto flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Admin
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-6 sm:pt-8">
          {/* Chip nav */}
          <nav className="flex gap-2 overflow-x-auto scrollbar-none pb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
            {TABS.map((tab) => {
              const isActive = tab.href === '/settings'
                ? pathname === '/settings'
                : pathname.startsWith(tab.href);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {children}
      </div>
    </div>
  );
}
