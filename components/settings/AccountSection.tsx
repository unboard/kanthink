'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui'
import { UsageMeter } from './UsageMeter'
import { UpgradeButton, ManageBillingButton } from './UpgradeButton'

export function AccountSection() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Account</h2>
        <div className="animate-pulse">
          <div className="h-16 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Account</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Sign in to unlock AI features and track your usage
          </p>
        </div>

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
            <Button onClick={() => signIn('google', { callbackUrl: '/settings' })} className="w-full max-w-xs">
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
            <p className="text-xs text-neutral-400">
              Requires Google OAuth to be configured in .env.local
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">Account</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Manage your account and subscription
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                <span className="text-violet-600 dark:text-violet-300 font-medium">
                  {session.user.name?.[0] || session.user.email?.[0] || '?'}
                </span>
              </div>
            )}
            <div>
              <p className="font-medium text-neutral-900 dark:text-white">
                {session.user.name || session.user.email}
              </p>
              <p className="text-sm text-neutral-500">
                {session.user.email}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => signOut()}
          >
            Sign out
          </Button>
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
          {session.user.tier === 'premium' ? (
            <ManageBillingButton size="sm" />
          ) : (
            <UpgradeButton size="sm" />
          )}
        </div>

        <UsageMeter />
      </div>
    </div>
  )
}
