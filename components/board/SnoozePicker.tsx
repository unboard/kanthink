'use client';

import { useState, useRef, useEffect } from 'react';

interface SnoozePickerProps {
  onSnooze: (until: string) => void;
  onClose: () => void;
}

function getSnoozeOptions() {
  const now = new Date();

  // Tomorrow 9am
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  // 3 days from now 9am
  const threeDays = new Date(now);
  threeDays.setDate(threeDays.getDate() + 3);
  threeDays.setHours(9, 0, 0, 0);

  // Next week Monday 9am
  const nextWeek = new Date(now);
  const daysUntilMonday = ((8 - nextWeek.getDay()) % 7) || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: 'Tomorrow', sublabel: formatDate(tomorrow), value: tomorrow.toISOString() },
    { label: '3 days', sublabel: formatDate(threeDays), value: threeDays.toISOString() },
    { label: 'Next week', sublabel: formatDate(nextWeek), value: nextWeek.toISOString() },
  ];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function SnoozePicker({ onSnooze, onClose }: SnoozePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const options = getSnoozeOptions();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden min-w-[180px]"
    >
      <div className="px-3 py-2 text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
        Snooze until
      </div>
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={(e) => {
            e.stopPropagation();
            onSnooze(opt.value);
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
        >
          <span className="text-sm text-neutral-700 dark:text-neutral-200">{opt.label}</span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">{opt.sublabel}</span>
        </button>
      ))}
    </div>
  );
}
