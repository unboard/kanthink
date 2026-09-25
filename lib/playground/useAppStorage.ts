'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The real storage behind a generated app's localStorage.
 *
 * The iframe runs on an opaque origin, so it has no storage of its own and the
 * runtime gives it an in-memory stand-in. That made a saved high score last exactly
 * as long as the tab was not reloaded — and an app telling someone their score was
 * saved when it was not is the most misleading thing this runtime could produce.
 *
 * So the host page holds it. This hook keeps a per-app bucket in the browser's real
 * localStorage, hands it to the iframe as a seed, and writes back whatever the app
 * stores. Still per-device — that is a property of the runtime, and the generator is
 * told never to describe it as syncing — but it now survives a refresh.
 */
export function useAppStorage(appKey: string) {
  const storageKey = `kpg_host_${appKey}`;
  // The app's iframe. Only messages from it are the app's: a site the app opened in
  // a new tab can still reach this page through window.opener, and must not be able
  // to write into the app's storage.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [seed] = useState<Record<string, Record<string, string>>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      // A browser with storage blocked simply gets the in-memory behaviour back.
      return {};
    }
  });

  // Persist whatever the app writes, keyed by area so localStorage and
  // sessionStorage do not overwrite one another.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFromFrame(event, frameRef.current)) return;
      const payload = event.data as { type?: string; area?: string; data?: Record<string, string> };
      if (payload?.type !== 'kpg_storage' || !payload.area) return;
      try {
        const raw = window.localStorage.getItem(storageKey);
        const current = raw ? JSON.parse(raw) : {};
        current[payload.area] = payload.data ?? {};
        window.localStorage.setItem(storageKey, JSON.stringify(current));
      } catch {
        // Nothing to do — the app keeps working, it just will not survive a reload.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [storageKey]);

  /**
   * Put the seed into the document before it runs.
   *
   * A placeholder rather than a postMessage, because the app reads storage during
   * its first render and a message would arrive too late to be there.
   */
  const withSeed = useCallback(
    // '<' is escaped so a stored </script> cannot close the tag it is written into.
    (doc: string) => doc.replace('/*__KPG_SEED__*/', `window.__kpg_seed = ${JSON.stringify(seed).replace(/</g, '\\u003c')};`),
    [seed],
  );

  return useMemo(() => ({ withSeed, frameRef }), [withSeed]);
}

/** True when a message came from this app's own iframe, not another window. */
export function isFromFrame(event: MessageEvent, frame: HTMLIFrameElement | null): boolean {
  return !!frame?.contentWindow && event.source === frame.contentWindow;
}
