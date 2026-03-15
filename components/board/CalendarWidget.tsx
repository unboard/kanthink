'use client';

import { useState } from 'react';
import type { Card as CardType, CalendarTypeData } from '@/lib/types';
import { useStore } from '@/lib/store';

interface CalendarWidgetProps {
  card: CardType;
}

const DAY_NAMES_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number, firstDayOfWeek: number): number {
  const day = new Date(year, month, 1).getDay();
  return (day - firstDayOfWeek + 7) % 7;
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function MonthGrid({ data, onDayClick }: { data: CalendarTypeData; onDayClick?: (day: number) => void }) {
  const { month, year, showWeekends, firstDayOfWeek } = data;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month, firstDayOfWeek);
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const todayDate = today.getDate();
  const dayItems = data.dayItems || {};

  const dayNames = firstDayOfWeek === 1 ? DAY_NAMES_MON : ['Sun', ...DAY_NAMES_MON.slice(0, 6)];
  const visibleDays = showWeekends ? dayNames : dayNames.filter(d => d !== 'Sat' && d !== 'Sun');

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(firstDay).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <div className="select-none">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {visibleDays.map((name) => (
          <div key={name} className="text-center text-[9px] font-medium text-neutral-400 dark:text-neutral-500 py-1">
            {name}
          </div>
        ))}
      </div>
      {/* Day cells */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map((day, di) => {
            if (!showWeekends) {
              const actualDayIndex = (di + firstDayOfWeek) % 7;
              if (actualDayIndex === 0 || actualDayIndex === 6) return null;
            }
            const dateKey = day ? formatDateKey(year, month, day) : '';
            const hasItems = day ? (dayItems[dateKey]?.length ?? 0) > 0 : false;
            const isToday = isCurrentMonth && day === todayDate;

            return (
              <button
                key={di}
                onClick={() => day && onDayClick?.(day)}
                disabled={!day}
                className={`
                  relative w-full aspect-square flex items-center justify-center text-[10px] rounded-md transition-colors
                  ${!day ? '' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}
                  ${isToday ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold' : 'text-neutral-600 dark:text-neutral-400'}
                `}
              >
                {day}
                {hasItems && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-violet-500" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TableView({ data, onUpdateItems }: { data: CalendarTypeData; onUpdateItems: (dayItems: Record<string, string[]>) => void }) {
  const { month, year, showWeekends } = data;
  const daysInMonth = getDaysInMonth(year, month);
  const dayItems = data.dayItems || {};
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [addingType, setAddingType] = useState<'card' | 'task' | null>(null);

  const days: { date: number; dayName: string; dateKey: string; isWeekend: boolean }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!showWeekends && isWeekend) continue;
    days.push({
      date: d,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateKey: formatDateKey(year, month, d),
      isWeekend,
    });
  }

  const addItem = (dateKey: string) => {
    if (!newItemText.trim()) return;
    const updated = { ...dayItems };
    updated[dateKey] = [...(updated[dateKey] || []), newItemText.trim()];
    onUpdateItems(updated);
    setNewItemText('');
    setAddingDay(null);
  };

  const removeItem = (dateKey: string, index: number) => {
    const updated = { ...dayItems };
    updated[dateKey] = (updated[dateKey] || []).filter((_, i) => i !== index);
    if (updated[dateKey].length === 0) delete updated[dateKey];
    onUpdateItems(updated);
  };

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {days.map(({ date, dayName, dateKey, isWeekend }) => {
        const items = dayItems[dateKey] || [];
        const today = new Date();
        const isToday = today.getDate() === date && today.getMonth() === month && today.getFullYear() === year;

        return (
          <div
            key={dateKey}
            className={`flex gap-2 py-1.5 px-2 ${isToday ? 'bg-violet-50 dark:bg-violet-900/10' : ''} ${isWeekend ? 'opacity-60' : ''}`}
          >
            <div className="w-12 flex-shrink-0 flex items-start gap-1">
              <span className={`text-[10px] font-medium ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-400'}`}>
                {dayName}
              </span>
              <span className={`text-[10px] ${isToday ? 'text-violet-600 dark:text-violet-400 font-bold' : 'text-neutral-500'}`}>
                {date}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-1 group/item">
                  <span className="text-[10px] text-neutral-600 dark:text-neutral-400 truncate flex-1">{item}</span>
                  <button
                    onClick={() => removeItem(dateKey, i)}
                    className="opacity-0 group-hover/item:opacity-100 text-neutral-300 hover:text-red-500 transition-opacity"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {addingDay === dateKey ? (
                <div className="space-y-1">
                  {addingType === null ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setAddingType('card')}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600"
                      >
                        + Card
                      </button>
                      <button
                        onClick={() => setAddingType('task')}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600"
                      >
                        + Task
                      </button>
                      <button
                        onClick={() => { setAddingDay(null); setAddingType(null); }}
                        className="text-[9px] text-neutral-300 dark:text-neutral-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { addItem(dateKey); setAddingType(null); } if (e.key === 'Escape') { setAddingDay(null); setAddingType(null); } }}
                        placeholder={addingType === 'card' ? 'Card title...' : 'Task title...'}
                        className="flex-1 text-[10px] bg-transparent border-b border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-violet-500 py-0.5"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setAddingDay(dateKey); setNewItemText(''); setAddingType(null); }}
                  className="text-[9px] text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-400"
                >
                  +
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarWidget({ card }: CalendarWidgetProps) {
  const updateCard = useStore((s) => s.updateCard);
  const data = (card.typeData as unknown as CalendarTypeData) || {
    style: 'month-table',
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    showWeekends: true,
    firstDayOfWeek: 1,
    dayItems: {},
  };

  const navigateMonth = (delta: number) => {
    let newMonth = data.month + delta;
    let newYear = data.year;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    updateCard(card.id, { typeData: { ...data, month: newMonth, year: newYear } as unknown as Record<string, unknown> });
  };

  const updateDayItems = (dayItems: Record<string, string[]>) => {
    updateCard(card.id, { typeData: { ...data, dayItems } as unknown as Record<string, unknown> });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-md shadow-sm p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => navigateMonth(-1)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          {MONTH_NAMES[data.month]} {data.year}
        </span>
        <button onClick={() => navigateMonth(1)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 p-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Month grid */}
      {(data.style === 'month-table' || data.style === 'month-only') && (
        <MonthGrid data={data} />
      )}

      {/* Divider */}
      {data.style === 'month-table' && (
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-2" />
      )}

      {/* Table view */}
      {(data.style === 'month-table' || data.style === 'table-only') && (
        <div className="max-h-48 overflow-y-auto">
          <TableView data={data} onUpdateItems={updateDayItems} />
        </div>
      )}
    </div>
  );
}
