import type { PlaygroundApp, PlaygroundAppSummary } from '@/lib/types';

/**
 * Watch a build until it lands, independently of the request that started it.
 *
 * A build runs for minutes. The request that kicks it off stays open that whole
 * time, so a backgrounded tab, a locked phone or a flaky connection loses the
 * socket — while the server function runs to completion and writes the result
 * regardless. Waiting only on that response meant the thread sat spinning after
 * the app was already finished.
 *
 * So the watcher is the source of truth for "is it done", and the original
 * response is treated as a bonus rather than the signal.
 */

const POLL_INTERVAL_MS = 4000;
const MAX_WATCH_MS = 10 * 60 * 1000;

export function toAppSummary(app: PlaygroundApp): PlaygroundAppSummary {
  return {
    id: app.id,
    cardId: app.cardId,
    channelId: app.channelId,
    title: app.title,
    summary: app.summary,
    generationCount: app.generationCount,
    isPublic: !!app.isPublic,
    position: app.position,
    isArchived: !!app.isArchived,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

/**
 * Poll until the app's build count passes `since`, then hand back the finished app.
 *
 * Resolves with null if it gives up — a watcher that ran out of patience is not an
 * error worth showing anyone, since the app will still be there next time the
 * channel loads.
 */
export function watchAppBuild(
  appId: string,
  since: number,
  onBuilt: (app: PlaygroundApp) => void
): () => void {
  let stopped = false;
  const startedAt = Date.now();

  const poll = async () => {
    if (stopped) return;
    if (Date.now() - startedAt > MAX_WATCH_MS) {
      stop();
      return;
    }
    try {
      const res = await fetch(`/api/playground/status/${appId}?since=${since}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      // `pending: true` is the cheap answer — the server withholds the payload
      // until the count actually moves, so there is nothing to do yet.
      if (data?.pending) return;
      const app = data?.app as PlaygroundApp | undefined;
      if (app && app.generationCount > since) {
        stop();
        onBuilt(app);
      }
    } catch {
      // Offline or mid-deploy. The next tick tries again.
    }
  };

  const interval = setInterval(poll, POLL_INTERVAL_MS);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void poll();
  };
  document.addEventListener('visibilitychange', onVisibility);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  // Check once straight away: a fast build can finish before the first tick.
  void poll();

  return stop;
}
