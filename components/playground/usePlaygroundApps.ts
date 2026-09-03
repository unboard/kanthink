'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaygroundApp } from '@/lib/types';

/**
 * The apps hanging off one card.
 *
 * Deliberately not in the zustand store. Apps are only ever read inside an open
 * card drawer, and each one carries a whole generated source file — putting them
 * in the global store would mean every board load hauls around code for apps
 * nobody has opened, and every store write risks syncing a stale copy of one.
 * Local state, fetched when the drawer opens, is the right size for this.
 */
export function usePlaygroundApps(cardId: string | undefined, enabled: boolean) {
  const [apps, setApps] = useState<PlaygroundApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow response for a card the user has already navigated away from.
  const requestedCardRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!cardId) return;
    requestedCardRef.current = cardId;
    setLoading(true);
    try {
      const res = await fetch(`/api/playground/apps?cardId=${encodeURIComponent(cardId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (requestedCardRef.current !== cardId) return;
      if (!res.ok) {
        setError(data?.error || 'Could not load apps');
        return;
      }
      setApps(Array.isArray(data.apps) ? data.apps : []);
      setError(null);
    } catch {
      if (requestedCardRef.current === cardId) setError('Could not load apps');
    } finally {
      if (requestedCardRef.current === cardId) setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    if (!enabled || !cardId) return;
    void refresh();
  }, [enabled, cardId, refresh]);

  /** Merge a server copy of one app into the list without refetching the rest. */
  const mergeApp = useCallback((app: PlaygroundApp) => {
    setApps((prev) => {
      const idx = prev.findIndex((a) => a.id === app.id);
      if (idx === -1) return [...prev, app];
      const next = [...prev];
      next[idx] = app;
      return next;
    });
  }, []);

  const createApp = useCallback(async (title?: string): Promise<PlaygroundApp | null> => {
    if (!cardId) return null;
    try {
      const res = await fetch('/api/playground/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, title }),
      });
      const data = await res.json();
      if (!res.ok || !data?.app) {
        setError(data?.error || 'Could not create the app');
        return null;
      }
      mergeApp(data.app);
      return data.app as PlaygroundApp;
    } catch {
      setError('Could not create the app');
      return null;
    }
  }, [cardId, mergeApp]);

  const updateApp = useCallback(async (
    appId: string,
    patch: Partial<Pick<PlaygroundApp, 'title' | 'isPublic' | 'modelId' | 'position'>>
  ): Promise<PlaygroundApp | null> => {
    // Optimistic: renaming and publishing should feel instant.
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...patch } : a)));
    try {
      const res = await fetch(`/api/playground/apps/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.app) return null;
      mergeApp(data.app);
      return data.app as PlaygroundApp;
    } catch {
      return null;
    }
  }, [mergeApp]);

  const deleteApp = useCallback(async (appId: string) => {
    setApps((prev) => prev.filter((a) => a.id !== appId));
    try {
      await fetch(`/api/playground/apps/${appId}`, { method: 'DELETE' });
    } catch {
      // Restoring a row the server may well have deleted is worse than a stale
      // list that the next open corrects.
    }
  }, []);

  return { apps, loading, error, refresh, createApp, updateApp, deleteApp, mergeApp };
}
