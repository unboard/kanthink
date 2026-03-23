'use client';

import { useState, useRef, useEffect } from 'react';

interface SnoozePickerProps {
  onSnooze: (until: string) => void;
  onClose: () => void;
}

function getSnoozeOptions() {
  const now = new Date();

  // Later today - 3 hours from now (or 6pm if that's sooner, minimum 1 hour ahead)
  const laterToday = new Date(now);
  laterToday.setHours(laterToday.getHours() + 3);
  laterToday.setMinutes(0, 0, 0);
  // If it's already past 6pm, push to 9pm
  const sixPm = new Date(now);
  sixPm.setHours(18, 0, 0, 0);
  const showLaterToday = now.getHours() < 20; // Only show if before 8pm

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

  const options = [];

  if (showLaterToday) {
    options.push({
      label: 'Later today',
      sublabel: formatTime(laterToday),
      value: laterToday.toISOString(),
    });
  }

  options.push(
    { label: 'Tomorrow', sublabel: formatDate(tomorrow), value: tomorrow.toISOString() },
    { label: '3 days', sublabel: formatDate(threeDays), value: threeDays.toISOString() },
    { label: 'Next week', sublabel: formatDate(nextWeek), value: nextWeek.toISOString() },
  );

  return options;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function SnoozePicker({ onSnooze, onClose }: SnoozePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const options = getSnoozeOptions();
  const [showCustom, setShowCustom] = useState(false);

  // Default custom date/time: tomorrow 9am
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 1);
  defaultDate.setHours(9, 0, 0, 0);

  const [customDate, setCustomDate] = useState(toLocalDateStr(defaultDate));
  const [customTime, setCustomTime] = useState(toLocalTimeStr(defaultDate));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleCustomSnooze = (e: React.MouseEvent) => {
    e.stopPropagation();
    const [year, month, day] = customDate.split('-').map(Number);
    const [hours, minutes] = customTime.split(':').map(Number);
    const snoozeDate = new Date(year, month - 1, day, hours, minutes);

    // Don't allow snoozing in the past
    if (snoozeDate <= new Date()) return;

    onSnooze(snoozeDate.toISOString());
    onClose();
  };

  // Check if custom date/time is valid (in the future)
  const isCustomValid = (() => {
    const [year, month, day] = customDate.split('-').map(Number);
    const [hours, minutes] = customTime.split(':').map(Number);
    const snoozeDate = new Date(year, month - 1, day, hours, minutes);
    return snoozeDate > new Date();
  })();

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden min-w-[220px]"
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

      {/* Divider */}
      <div className="border-t border-neutral-100 dark:border-neutral-700" />

      {/* Custom date/time toggle */}
      {!showCustom ? (
        <button
          onClick={(e) => { e.stopPropagation(); setShowCustom(true); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-neutral-700 dark:text-neutral-200">Pick date & time</span>
        </button>
      ) : (
        <div className="px-3 py-2.5 space-y-2">
          <div className="flex gap-2">
            <input
              type="date"
              value={customDate}
              min={toLocalDateStr(new Date())}
              onChange={(e) => setCustomDate(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-[100px] px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <button
            onClick={handleCustomSnooze}
            disabled={!isCustomValid}
            className="w-full px-3 py-1.5 text-sm font-medium rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Snooze
          </button>
        </div>
      )}
    </div>
  );
}
