'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { signInWithGoogle } from '@/lib/actions/auth';
import { KanthinkIcon } from '../icons/KanthinkIcon';

interface UsageData {
  used: number;
  limit: number;
  remaining: number;
  isAnonymous: boolean;
}

export function AnonymousUpgradeBanner() {
  const { data: session, status } = useSession();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if user is authenticated
  const isAuthenticated = status === 'authenticated' && session?.user;

  useEffect(() => {
    // Only fetch usage for anonymous users
    if (isAuthenticated) return;

    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/usage');
        if (res.ok) {
          const data = await res.json();
          setUsage(data);
        }
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      }
    };

    fetchUsage();
  }, [isAuthenticated]);

  // Don't render if authenticated, dismissed, or still loading
  if (isAuthenticated || isDismissed || status === 'loading') {
    return null;
  }

  // Don't show banner if user has plenty of credits or hasn't used any yet
  if (!usage || (usage.remaining > 5 && usage.used === 0)) {
    return null;
  }

  const handleSignUp = async () => {
    const formData = new FormData();
    formData.set('redirectTo', window.location.pathname);
    await signInWithGoogle(formData);
  };

  // Different messaging based on usage
  const isAtLimit = usage.remaining === 0;
  const isLow = usage.remaining <= 3 && usage.remaining > 0;

  return (
    <div className={`mx-4 sm:mx-6 mb-3 rounded-lg border p-3 ${
      isAtLimit
        ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
        : 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 text-violet-500 flex-shrink-0">
            <KanthinkIcon />
          </div>
          <div className="min-w-0">
            {isAtLimit ? (
              <>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  You've used all your free credits
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Sign up to unlock 10 more AI requests per month - free forever
                </p>
              </>
            ) : isLow ? (
              <>
                <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
                  {usage.remaining} credit{usage.remaining !== 1 ? 's' : ''} remaining
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  Sign up now to unlock 10 more requests when you need them
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
                  {usage.used} of {usage.limit} free credits used
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  Sign up to unlock 10 more AI requests - no payment required
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSignUp}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isAtLimit
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            Sign up free
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
