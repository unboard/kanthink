'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { ChannelMember } from '@/lib/types';
import { fetchChannelMembers } from '@/lib/api/client';

// Simple in-memory cache: channelId -> { members, fetchedAt }
const cache = new Map<string, { members: ChannelMember[]; fetchedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

export function useChannelMembers(channelId: string | undefined) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    if (!channelId) {
      setMembers([]);
      return;
    }

    // Check cache
    const cached = cache.get(channelId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setMembers(cached.members);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchChannelMembers(channelId)
      .then((data) => {
        if (cancelled) return;
        const memberList = data.members as ChannelMember[];
        cache.set(channelId, { members: memberList, fetchedAt: Date.now() });
        setMembers(memberList);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: just the current user
        if (session?.user?.id) {
          setMembers([{
            id: session.user.id as string,
            name: (session.user.name ?? session.user.email ?? 'You') as string,
            email: (session.user.email ?? '') as string,
            image: (session.user.image ?? null) as string | null,
          }]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [channelId, session?.user?.id]);

  return { members, loading };
}

/** Invalidate cache for a channel (e.g. after a share change) */
export function invalidateChannelMembers(channelId: string) {
  cache.delete(channelId);
}
