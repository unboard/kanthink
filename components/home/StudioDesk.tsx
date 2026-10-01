'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Week { earnedCents: number; sales: number; draftsWaiting: number; readyForYou: number }

/**
 * What the Studio's crew has left for you: email drafts to approve, and apps built
 * and waiting for a "ship it". Same shape as the shroom desk beside it, and silent
 * when there's nothing to decide.
 */
export function StudioDesk() {
  const router = useRouter();
  const [state, setState] = useState<{ channelId: string; week: Week } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/studio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.studio) setState({ channelId: d.studio.channelId, week: d.studio.week }); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!state) return null;
  const { week, channelId } = state;
  if (week.draftsWaiting === 0 && week.readyForYou === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-neutral-700/60 bg-neutral-900/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm leading-none">✉️</span>
        <h2 className="text-xs font-medium text-neutral-400">Your Studio</h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {week.draftsWaiting > 0 && (
          <button onClick={() => router.push('/people')} className="flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-2.5 py-1.5 text-xs text-violet-200 transition-colors hover:bg-violet-500/25">
            <span className="font-medium">{week.draftsWaiting}</span>
            <span className="text-violet-300/80">{week.draftsWaiting === 1 ? 'email draft' : 'email drafts'} to approve in People</span>
          </button>
        )}
        {week.readyForYou > 0 && (
          <button onClick={() => router.push(`/channel/${channelId}`)} className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25">
            <span className="font-medium">{week.readyForYou}</span>
            <span className="text-emerald-300/80">{week.readyForYou === 1 ? 'app' : 'apps'} built and ready to ship</span>
          </button>
        )}
      </div>
    </div>
  );
}
