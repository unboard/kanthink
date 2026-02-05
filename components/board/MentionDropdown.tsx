'use client';

import { useRef, useEffect } from 'react';
import type { ChannelMember } from '@/lib/types';

interface MentionDropdownProps {
  members: ChannelMember[];
  query: string;
  selectedIndex: number;
  onSelect: (member: ChannelMember) => void;
  onClose: () => void;
}

export function MentionDropdown({ members, query, selectedIndex, onSelect, onClose }: MentionDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filtered = members.filter((m) => {
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Keep selected item in view
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto"
    >
      {filtered.map((member, index) => (
        <button
          key={member.id}
          ref={(el) => { itemRefs.current[index] = el; }}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur on textarea
            onSelect(member);
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            index === selectedIndex
              ? 'bg-violet-50 dark:bg-violet-900/30'
              : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
          }`}
        >
          {member.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.image} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0">
              <span className="text-violet-600 dark:text-violet-300 font-medium" style={{ fontSize: '9px' }}>
                {member.name[0] || '?'}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
              {member.name}
            </div>
            {member.email !== member.name && (
              <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                {member.email}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
