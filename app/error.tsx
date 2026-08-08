'use client';

import { useEffect } from 'react';
import { DeadEnd } from '@/components/ui/DeadEnd';
import { STORAGE_KEY } from '@/lib/constants';

/**
 * Catches render errors below the root layout.
 *
 * The third action exists because of how this app stores state: the board
 * renders from a Zustand store persisted to localStorage, so a cache written by
 * an older shape of the code is a real cause of a render throw — and one that
 * reset() cannot fix, because reset() re-runs the same render against the same
 * bad data. Clearing the cache is the only recovery for that case, and until now
 * there was no way for a user to do it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Don't let this be one more silently swallowed failure.
    console.error('[app/error]', error);
  }, [error]);

  const clearAndReload = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked or unavailable — the reload is still worth attempting.
    }
    window.location.href = '/';
  };

  return (
    <DeadEnd
      eyebrow="error · something broke"
      title="That didn't load."
      body="Something threw while rendering this page. Trying again fixes most of it. Nothing on your boards has changed."
      actions={[
        { label: 'Try again', onClick: reset, primary: true },
        { label: 'Go to your boards', href: '/' },
        {
          label: 'Clear this device’s cache and reload',
          onClick: clearAndReload,
          note: 'Removes the copy of your boards saved on this device, then loads them fresh from the server. Nothing is deleted.',
        },
      ]}
    />
  );
}
