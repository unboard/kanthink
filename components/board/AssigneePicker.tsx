'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useChannelMembers } from '@/lib/hooks/useChannelMembers';
import type { ChannelMember } from '@/lib/types';

interface AssigneePickerProps {
  channelId: string;
  selectedUserIds: string[];
  onToggleUser: (userId: string) => void;
  onClose: () => void;
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

export function AssigneePicker({
  channelId,
  selectedUserIds,
  onToggleUser,
  onClose,
}: AssigneePickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();
  const { members, loading } = useChannelMembers(channelId);

  const currentUserId = session?.user?.id as string | undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selectedSet = new Set(selectedUserIds);

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort: current user first, then selected, then alphabetical
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    const aSelected = selectedSet.has(a.id);
    const bSelected = selectedSet.has(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="relative p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg space-y-3">
      {/* Search */}
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search members..."
        className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      {/* Assign to me quick action */}
      {currentUserId && !searchTerm && !selectedSet.has(currentUserId) && (
        <button
          onClick={() => onToggleUser(currentUserId)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Assign to me
        </button>
      )}

      {/* Members list */}
      {loading ? (
        <p className="text-sm text-neutral-500 text-center py-2">Loading...</p>
      ) : sortedMembers.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sortedMembers.map((member) => {
            const isSelected = selectedSet.has(member.id);
            return (
              <button
                key={member.id}
                onClick={() => onToggleUser(member.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                  isSelected
                    ? 'bg-violet-50 dark:bg-violet-900/20'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {/* Avatar */}
                <div className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden">
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

                {/* Name + email */}
                <div className="flex-1 text-left min-w-0">
                  <div className="text-neutral-800 dark:text-neutral-200 truncate">
                    {member.name}
                    {member.id === currentUserId && (
                      <span className="text-neutral-400 dark:text-neutral-500 ml-1">(you)</span>
                    )}
                  </div>
                </div>

                {/* Check */}
                {isSelected && (
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 text-center py-2">
          {searchTerm ? 'No matching members' : 'No members found'}
        </p>
      )}

      <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
