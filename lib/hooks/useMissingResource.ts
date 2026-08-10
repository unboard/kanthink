'use client';

import { useEffect, useRef, useState } from 'react';
import { useServerSync } from '@/components/providers/ServerSyncProvider';

/**
 * Why a channel or card isn't on screen.
 *
 * `checking` is the only state that isn't an answer — the caller should keep
 * showing a spinner until it turns into one of the others.
 */
export type MissingVerdict =
  /** Still asking the server. */
  | 'checking'
  /** The server says it doesn't exist. This is a real 404. */
  | 'gone'
  /** It exists, but not for this account. */
  | 'noAccess'
  /** We couldn't reach the server, so we don't know. */
  | 'unreachable'
  /** The server has it and this device's copy is behind. */
  | 'stale';

/**
 * Decide whether something absent from the local store is actually missing.
 *
 * The board renders from a store that is a *snapshot* — hydrated from
 * localStorage, refreshed by sync, patched by Pusher. Absent from that snapshot
 * is not the same as absent from the database: a card made on your phone thirty
 * seconds ago is real, and this tab may not have heard about it yet. So nothing
 * is declared a 404 without asking the server first.
 *
 * The inverse race — a card created *here* that the server hasn't stored yet —
 * can't reach this hook, because `loadFromServer` preserves cards with pending
 * creates. If it's in the store we render it and never ask.
 */
export function useMissingResource({
  apiPath,
  enabled,
  isPresent,
}: {
  /** API route that returns 200 for this resource, 404 when it truly doesn't exist. */
  apiPath: string;
  /** False while the resource is on screen or the first sync is still running. */
  enabled: boolean;
  /** Re-read the store after a refetch — has the resource arrived? */
  isPresent: () => boolean;
}): MissingVerdict {
  const { refetch } = useServerSync();
  // The answer is stored with the path it answers, so a verdict about the last
  // card can never be shown for this one.
  const [answer, setAnswer] = useState<{ path: string; verdict: MissingVerdict } | null>(null);
  // One question per resource. Without this, the refetch below re-renders the
  // caller and we'd ask again about the same thing forever.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      asked.current = null;
      return;
    }
    if (asked.current === apiPath) return;
    asked.current = apiPath;

    let cancelled = false;
    const answered = (verdict: MissingVerdict) => {
      if (!cancelled) setAnswer({ path: apiPath, verdict });
    };

    (async () => {
      try {
        const res = await fetch(apiPath);
        if (cancelled) return;

        if (res.status === 404) return answered('gone');
        if (res.status === 401 || res.status === 403) return answered('noAccess');
        if (!res.ok) return answered('unreachable');

        // It exists and we don't have it, so the snapshot is behind. Pull a
        // fresh one rather than 404 something that is sitting in the database.
        await refetch();
        if (cancelled) return;
        // If the refetch brought it in, the caller is about to render it and
        // this hook has nothing left to say.
        answered(isPresent() ? 'checking' : 'stale');
      } catch {
        answered('unreachable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiPath, enabled, refetch, isPresent]);

  return enabled && answer?.path === apiPath ? answer.verdict : 'checking';
}
