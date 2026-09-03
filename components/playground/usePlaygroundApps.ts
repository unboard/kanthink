'use client';

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import type { ID, PlaygroundApp, PlaygroundAppSummary } from '@/lib/types';

/**
 * The apps on one card, as the board and drawer see them.
 *
 * Summaries come from the store, which the channel fetch fills — so a card face
 * in a column and the card's Apps tab read the same list without either of them
 * fetching. The heavy parts of an app (its code, thread and saved records) are
 * never in here; the drawer loads those for the one app you open.
 */
export function useCardApps(cardId: ID | undefined) {
  const allApps = useStore((s) => s.playgroundApps);
  const upsertPlaygroundApp = useStore((s) => s.upsertPlaygroundApp);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apps = useMemo(() => {
    if (!cardId) return [];
    return Object.values(allApps)
      .filter((a) => a.cardId === cardId && !a.isArchived)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  }, [allApps, cardId]);

  const createApp = useCallback(async (title?: string): Promise<PlaygroundAppSummary | null> => {
    if (!cardId) return null;
    setCreating(true);
    setError(null);
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
      const created = data.app as PlaygroundApp;
      const summary: PlaygroundAppSummary = {
        id: created.id,
        cardId: created.cardId,
        channelId: created.channelId,
        title: created.title,
        summary: created.summary,
        generationCount: created.generationCount,
        isPublic: !!created.isPublic,
        position: created.position,
        isArchived: !!created.isArchived,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
      upsertPlaygroundApp(summary);
      return summary;
    } catch {
      setError('Could not create the app');
      return null;
    } finally {
      setCreating(false);
    }
  }, [cardId, upsertPlaygroundApp]);

  return { apps, createApp, creating, error };
}
