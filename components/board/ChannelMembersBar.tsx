'use client';

import { useEffect, useState } from 'react';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import { addPresenceListener, removePresenceListener, type PresenceUser } from '@/lib/sync/pusherClient';
import type { ChannelMember } from '@/lib/types';

interface ChannelMembersBarProps {
  channelId: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ChannelMembersBar({ channelId }: ChannelMembersBarProps) {
  const { members } = useChannelMembers(channelId);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Listen to Pusher presence to track who's online
  useEffect(() => {
    const handlePresence = (presenceMembers: PresenceUser[]) => {
      // Deduplicate by base userId (strip tab suffix like "userId:tabId")
      const ids = new Set(presenceMembers.map((m) => m.id.split(':')[0]));
      setOnlineUserIds(ids);
    };

    addPresenceListener(handlePresence);
    return () => {
      removePresenceListener(handlePresence);
    };
  }, []);

  if (members.length <= 1) return null;

  const maxVisible = 4;
  const visible = members.slice(0, maxVisible);
  const overflow = members.length - maxVisible;

  return (
    <div className="flex items-center -space-x-1.5" title={members.map((m) => m.name).join(', ')}>
      {visible.map((member) => {
        const isOnline = onlineUserIds.has(member.id);
        return (
          <div
            key={member.id}
            className="relative rounded-full ring-2 ring-white dark:ring-neutral-900"
            title={`${member.name}${isOnline ? ' (online)' : ''}`}
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
              {member.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[10px] font-medium flex items-center justify-center">
                  {getInitials(member.name)}
                </div>
              )}
            </div>
            {/* Online/offline dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${
                isOnline
                  ? 'bg-green-500'
                  : 'bg-neutral-300 dark:bg-neutral-600'
              }`}
            />
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300 ring-2 ring-white dark:ring-neutral-900">
          +{overflow}
        </div>
      )}
    </div>
  );
}
