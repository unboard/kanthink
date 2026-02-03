'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { NavPanel } from './NavPanel';
import { Button } from '@/components/ui';
import { UsageMeter } from '@/components/settings/UsageMeter';
import { UpgradeButton, ManageBillingButton } from '@/components/settings/UpgradeButton';
import { signInWithGoogle } from '@/lib/actions/auth';

export function AccountPanel() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <NavPanel panelKey="account" title="Account" width="md">
      <div className="p-4 space-y-4">
        {status === 'loading' ? (
          <div className="animate-pulse">
            <div className="h-16 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          </div>
        ) : !session ? (
          // Signed out state
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
              <div className="text-center space-y-4">
                <div className="text-4xl">🔐</div>
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">
                    Sign in to get started
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Free tier includes 10 AI requests per month
                  </p>
                </div>
                <form action={signInWithGoogle}>
                  <input type="hidden" name="redirectTo" value={pathname} />
                  <Button type="submit" className="w-full">
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Sign in with Google
                  </Button>
                </form>
              </div>
            </div>

            {/* Benefits list */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Benefits of signing in
              </p>
              <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Sync boards across devices
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  10 free AI requests per month
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Share channels with others
                </li>
              </ul>
            </div>
          </div>
        ) : (
          // Signed in state
          <div className="space-y-4">
            {/* User info */}
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                  <span className="text-violet-600 dark:text-violet-300 font-medium text-lg">
                    {session.user.name?.[0] || session.user.email?.[0] || '?'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-neutral-900 dark:text-white truncate">
                  {session.user.name || 'User'}
                </p>
                <p className="text-sm text-neutral-500 truncate">
                  {session.user.email}
                </p>
              </div>
            </div>

            {/* Subscription Status */}
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {session.user.tier === 'premium' ? 'Premium' : 'Free'} Plan
                    </span>
                    {session.user.tier === 'premium' && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {session.user.tier === 'premium'
                      ? '200 AI requests per month'
                      : '10 AI requests per month'}
                  </p>
                </div>
              </div>

              <UsageMeter />

              <div className="pt-2">
                {session.user.tier === 'premium' ? (
                  <ManageBillingButton size="sm" className="w-full" />
                ) : (
                  <UpgradeButton size="sm" className="w-full" />
                )}
              </div>
            </div>

            {/* Sign out */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          </div>
        )}
      </div>
    </NavPanel>
  );
}
