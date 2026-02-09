'use client';

import type { ChannelMember } from '@/lib/types';

interface AssigneeAvatarsProps {
  userIds: string[];
  members: ChannelMember[];
  size?: 'sm' | 'md';
  maxVisible?: number;
  onClick?: () => void;
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

const sizeClasses = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-6 h-6 text-[10px]',
};

const overlapClasses = {
  sm: '-ml-1.5',
  md: '-ml-2',
};

export function AssigneeAvatars({
  userIds,
  members,
  size = 'sm',
  maxVisible = 3,
  onClick,
}: AssigneeAvatarsProps) {
  if (userIds.length === 0) return null;

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const resolved = userIds.map((id) => memberMap.get(id)).filter(Boolean) as ChannelMember[];
  const visible = resolved.slice(0, maxVisible);
  const overflow = resolved.length - maxVisible;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center flex-shrink-0"
      title={resolved.map((m) => m.name).join(', ')}
    >
      {visible.map((member, i) => (
        <div
          key={member.id}
          className={`${sizeClasses[size]} ${i > 0 ? overlapClasses[size] : ''} rounded-full ring-2 ring-white dark:ring-neutral-900 flex items-center justify-center flex-shrink-0 overflow-hidden`}
        >
          {member.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={member.image}
              alt={member.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-medium flex items-center justify-center">
              {getInitials(member.name)}
            </div>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`${sizeClasses[size]} ${overlapClasses[size]} rounded-full ring-2 ring-white dark:ring-neutral-900 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-medium flex items-center justify-center flex-shrink-0`}
        >
          +{overflow}
        </div>
      )}
    </button>
  );
}
