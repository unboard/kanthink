'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface Week { earnedCents: number; sales: number; draftsWaiting: number; readyForYou: number }

/**
 * One line under the Studio's header: the week, and what's waiting on you.
 *
 * Styled like the channel description line so the board looks like every other
 * board. Renders nothing on any channel that isn't your Studio.
 */
export function StudioStrip({ channelId }: { channelId: string }) {
  const [week, setWeek] = useState<Week | null>(null);
  const { data: session } = useSession();
  const admin = !!session?.user?.isAdmin;
  useEffect(() => {
    // Studio is admin-only for now, so nobody else's boards make the request.
    if (!admin) return;
    let live = true;
    fetch(`/api/studio?channelId=${encodeURIComponent(channelId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setWeek(d?.studio?.week ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [channelId, admin]);

  if (!admin || !week) return null;
  const earned = week.earnedCents / 100;
  const waiting = week.draftsWaiting + week.readyForYou;
  return (
    <p className="px-4 sm:px-6 -mt-1 mb-2 text-xs text-neutral-400 dark:text-neutral-500 line-clamp-1">
      This week{' '}
      <span className={earned > 0 ? 'text-green-600 dark:text-green-400' : ''}>
        ${Number.isInteger(earned) ? earned : earned.toFixed(2)} from {week.sales} {week.sales === 1 ? 'sale' : 'sales'}
      </span>
      .{' '}
      {waiting > 0
        ? <>{week.readyForYou > 0 && `${week.readyForYou} ready for you. `}{week.draftsWaiting > 0 && `${week.draftsWaiting} ${week.draftsWaiting === 1 ? 'email draft' : 'email drafts'} waiting. `}</>
        : 'Nothing waiting on you. '}
      <Link href="/people" className="text-violet-500 hover:underline dark:text-violet-400">People</Link>
    </p>
  );
}
