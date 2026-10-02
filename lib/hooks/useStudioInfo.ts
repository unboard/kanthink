'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export interface StudioInfo { channelId: string; sparksColumnId: string }

/**
 * Which channel is your Studio and which column holds its sparks — enough for Home
 * and the card drawer to treat a spark as a spark. Fetched once per page load and
 * shared, and only for admins, since the Studio is admin-only.
 */
let cached: Promise<StudioInfo | null> | null = null;
function load(): Promise<StudioInfo | null> {
  if (!cached) {
    cached = fetch('/api/studio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.studio ? { channelId: d.studio.channelId, sparksColumnId: d.studio.sparksColumnId } : null))
      .catch(() => { cached = null; return null; });
  }
  return cached;
}

export function useStudioInfo(): StudioInfo | null {
  const { data: session } = useSession();
  const admin = !!session?.user?.isAdmin;
  const [info, setInfo] = useState<StudioInfo | null>(null);
  useEffect(() => {
    if (!admin) return;
    let live = true;
    load().then((i) => { if (live) setInfo(i); });
    return () => { live = false; };
  }, [admin]);
  return admin ? info : null;
}
