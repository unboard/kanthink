'use client';

import { useState, useCallback } from 'react';
import type { Card as CardType, CalendarTypeData, CalendarDayEntry } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui';
import { nanoid } from 'nanoid';

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

function formatDayHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Icons for entry types
function EntryTypeIcon({ type, className = 'w-3 h-3' }: { type: CalendarDayEntry['type']; className?: string }) {
  if (type === 'card') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    );
  }
  if (type === 'task') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  // note
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

// ─── Day Detail Drawer ─────────────────────────────────────────────────

interface DayDetailDrawerProps {
  dateKey: string;
  isOpen: boolean;
  onClose: () => void;
  data: CalendarTypeData;
  onAddEntry: (dateKey: string, entry: CalendarDayEntry) => void;
  onRemoveEntry: (dateKey: string, entryId: string) => void;
  onAddThread: (dateKey: string, content: string) => void;
  onCreateCard: (dateKey: string, title: string) => void;
  onCreateTask: (dateKey: string, title: string) => void;
}

function DayDetailDrawer({
  dateKey,
  isOpen,
  onClose,
  data,
  onAddEntry,
  onRemoveEntry,
  onAddThread,
  onCreateCard,
  onCreateTask,
}: DayDetailDrawerProps) {
  const [addMode, setAddMode] = useState<'card' | 'task' | 'note' | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [threadInput, setThreadInput] = useState('');

  const entries = data.dayEntries?.[dateKey] || [];
  const threads = data.dayThreads?.[dateKey] || [];
  const tasks = useStore((s) => s.tasks);

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    if (addMode === 'card') {
      onCreateCard(dateKey, newTitle.trim());
    } else if (addMode === 'task') {
      onCreateTask(dateKey, newTitle.trim());
    } else if (addMode === 'note') {
      const noteEntry: CalendarDayEntry = { type: 'note', id: nanoid(), title: newTitle.trim() };
      onAddEntry(dateKey, noteEntry);
    }
    setNewTitle('');
    setAddMode(null);
  };

  const handleAddThread = () => {
    if (!threadInput.trim()) return;
    onAddThread(dateKey, threadInput.trim());
    setThreadInput('');
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md">
      <div className="p-6">
        {/* Day header */}
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-4">
          {formatDayHeader(dateKey)}
        </h2>

        {/* Entries list */}
        <div className="mb-6">
          <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Items
          </h3>
          {entries.length === 0 && (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 italic">No items for this day</p>
          )}
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 group p-2 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <EntryTypeIcon type={entry.type} className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                {entry.type === 'task' ? (
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-sm truncate ${tasks[entry.id]?.status === 'done' ? 'line-through text-neutral-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                      {entry.title}
                    </span>
                    {tasks[entry.id]?.status === 'done' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">Done</span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate flex-1">{entry.title}</span>
                )}
                <span className="text-[9px] text-neutral-400 capitalize flex-shrink-0">{entry.type}</span>
                <button
                  onClick={() => onRemoveEntry(dateKey, entry.id)}
                  className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-500 transition-opacity flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add item */}
          {addMode ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <EntryTypeIcon type={addMode} className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                    if (e.key === 'Escape') { setAddMode(null); setNewTitle(''); }
                  }}
                  placeholder={`${addMode === 'card' ? 'Card' : addMode === 'task' ? 'Task' : 'Note'} title...`}
                  className="flex-1 text-sm bg-transparent border-b border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-violet-500 py-1"
                  autoFocus
                />
                <button
                  onClick={handleAdd}
                  className="text-xs px-2 py-1 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddMode(null); setNewTitle(''); }}
                  className="text-xs text-neutral-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 mt-3">
              <button
                onClick={() => setAddMode('card')}
                className="text-[10px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
              >
                + Card
              </button>
              <button
                onClick={() => setAddMode('task')}
                className="text-[10px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
              >
                + Task
              </button>
              <button
                onClick={() => setAddMode('note')}
                className="text-[10px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-600 transition-colors"
              >
                + Note
              </button>
            </div>
          )}
        </div>

        {/* Thread section */}
        <div>
          <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            Notes / Thread
          </h3>
          {threads.length === 0 && (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 italic mb-2">No notes yet</p>
          )}
          <div className="space-y-2 mb-3">
            {threads.map((t) => (
              <div key={t.id} className="text-sm text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-md p-2">
                <div>{t.content}</div>
                <div className="text-[9px] text-neutral-400 mt-1">
                  {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddThread(); }}
              placeholder="Add a note..."
              className="flex-1 text-sm bg-neutral-50 dark:bg-neutral-800 rounded-md px-3 py-1.5 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={handleAddThread}
              disabled={!threadInput.trim()}
              className="text-xs px-3 py-1.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Month Grid ────────────────────────────────────────────────────────

function MonthGrid({ data, onDayClick }: { data: CalendarTypeData; onDayClick?: (day: number) => void }) {
  const { month, year, showWeekends, firstDayOfWeek } = data;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month, firstDayOfWeek);
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const todayDate = today.getDate();
  const dayEntries = data.dayEntries || {};

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
            const hasEntries = day ? (dayEntries[dateKey]?.length ?? 0) > 0 : false;
            const isToday = isCurrentMonth && day === todayDate;

            return (
              <button
                key={di}
                onClick={() => day && onDayClick?.(day)}
                disabled={!day}
                className={`
                  relative w-full aspect-square flex items-center justify-center text-[10px] rounded-md transition-colors
                  ${!day ? '' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'}
                  ${isToday ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold' : 'text-neutral-600 dark:text-neutral-400'}
                `}
              >
                {day}
                {hasEntries && (
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

// ─── Table View ────────────────────────────────────────────────────────

function TableView({
  data,
  onDayClick,
  onCreateCard,
  onCreateTask,
}: {
  data: CalendarTypeData;
  onDayClick: (dateKey: string) => void;
  onCreateCard: (dateKey: string, title: string) => void;
  onCreateTask: (dateKey: string, title: string) => void;
}) {
  const { month, year, showWeekends } = data;
  const daysInMonth = getDaysInMonth(year, month);
  const dayEntries = data.dayEntries || {};
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<'card' | 'task' | null>(null);
  const [newItemText, setNewItemText] = useState('');

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

  const handleAdd = (dateKey: string) => {
    if (!newItemText.trim() || !addingType) return;
    if (addingType === 'card') {
      onCreateCard(dateKey, newItemText.trim());
    } else {
      onCreateTask(dateKey, newItemText.trim());
    }
    setNewItemText('');
    setAddingDay(null);
    setAddingType(null);
  };

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {days.map(({ date, dayName, dateKey, isWeekend }) => {
        const entries = dayEntries[dateKey] || [];
        const today = new Date();
        const isToday = today.getDate() === date && today.getMonth() === month && today.getFullYear() === year;

        return (
          <div
            key={dateKey}
            className={`flex gap-2 py-1.5 px-2 ${isToday ? 'bg-violet-50 dark:bg-violet-900/10' : ''} ${isWeekend ? 'opacity-60' : ''}`}
          >
            <button
              onClick={() => onDayClick(dateKey)}
              className="w-12 flex-shrink-0 flex items-start gap-1 hover:opacity-70 transition-opacity"
            >
              <span className={`text-[10px] font-medium ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-400'}`}>
                {dayName}
              </span>
              <span className={`text-[10px] ${isToday ? 'text-violet-600 dark:text-violet-400 font-bold' : 'text-neutral-500'}`}>
                {date}
              </span>
            </button>
            <div className="flex-1 min-w-0">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-1 group/item cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1"
                  onClick={() => onDayClick(dateKey)}
                >
                  <EntryTypeIcon type={entry.type} className="w-2.5 h-2.5 text-neutral-400 flex-shrink-0" />
                  <span className="text-[10px] text-neutral-600 dark:text-neutral-400 truncate flex-1">{entry.title}</span>
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAdd(dateKey);
                          if (e.key === 'Escape') { setAddingDay(null); setAddingType(null); }
                        }}
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

// ─── Main Calendar Widget ──────────────────────────────────────────────

export function CalendarWidget({ card }: CalendarWidgetProps) {
  const updateCard = useStore((s) => s.updateCard);
  const createCardAction = useStore((s) => s.createCard);
  const createColumnTask = useStore((s) => s.createColumnTask);
  const channels = useStore((s) => s.channels);

  const channelId = card.channelId;
  const channel = channels[channelId];
  const columnId = channel?.columns?.find(c => c.cardIds?.includes(card.id))?.id || '';

  const data: CalendarTypeData = (card.typeData as unknown as CalendarTypeData) || {
    style: 'month-table',
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    showWeekends: true,
    firstDayOfWeek: 1,
    dayEntries: {},
    dayThreads: {},
  };

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const saveData = useCallback((updated: CalendarTypeData) => {
    updateCard(card.id, { typeData: updated as unknown as Record<string, unknown> });
  }, [card.id, updateCard]);

  const navigateMonth = (delta: number) => {
    let newMonth = data.month + delta;
    let newYear = data.year;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    saveData({ ...data, month: newMonth, year: newYear });
  };

  const openDayDrawer = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    setIsDrawerOpen(true);
  };

  const handleDayClick = (day: number) => {
    const dateKey = formatDateKey(data.year, data.month, day);
    openDayDrawer(dateKey);
  };

  const handleTableDayClick = (dateKey: string) => {
    openDayDrawer(dateKey);
  };

  // ─── Entry management ─────────────────────────────────────────

  const addEntryToDay = useCallback((dateKey: string, entry: CalendarDayEntry) => {
    const updated = { ...data };
    const entries = { ...(updated.dayEntries || {}) };
    entries[dateKey] = [...(entries[dateKey] || []), entry];
    updated.dayEntries = entries;
    saveData(updated);
  }, [data, saveData]);

  const removeEntryFromDay = useCallback((dateKey: string, entryId: string) => {
    const updated = { ...data };
    const entries = { ...(updated.dayEntries || {}) };
    entries[dateKey] = (entries[dateKey] || []).filter(e => e.id !== entryId);
    if (entries[dateKey].length === 0) delete entries[dateKey];
    updated.dayEntries = entries;
    saveData(updated);
  }, [data, saveData]);

  const handleCreateCard = useCallback((dateKey: string, title: string) => {
    if (!channelId || !columnId) return;
    const newCard = createCardAction(channelId, columnId, { title });
    const entry: CalendarDayEntry = { type: 'card', id: newCard.id, title };
    addEntryToDay(dateKey, entry);
  }, [channelId, columnId, createCardAction, addEntryToDay]);

  const handleCreateTask = useCallback((dateKey: string, title: string) => {
    if (!channelId || !columnId) return;
    const newTask = createColumnTask(channelId, columnId, { title });
    const entry: CalendarDayEntry = { type: 'task', id: newTask.id, title };
    addEntryToDay(dateKey, entry);
  }, [channelId, columnId, createColumnTask, addEntryToDay]);

  const handleAddThread = useCallback((dateKey: string, content: string) => {
    const updated = { ...data };
    const threads = { ...(updated.dayThreads || {}) };
    threads[dateKey] = [...(threads[dateKey] || []), { id: nanoid(), content, createdAt: new Date().toISOString() }];
    updated.dayThreads = threads;
    saveData(updated);
  }, [data, saveData]);

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
        <MonthGrid data={data} onDayClick={handleDayClick} />
      )}

      {/* Divider */}
      {data.style === 'month-table' && (
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-2" />
      )}

      {/* Table view */}
      {(data.style === 'month-table' || data.style === 'table-only') && (
        <div className="max-h-48 overflow-y-auto">
          <TableView
            data={data}
            onDayClick={handleTableDayClick}
            onCreateCard={handleCreateCard}
            onCreateTask={handleCreateTask}
          />
        </div>
      )}

      {/* Day Detail Drawer */}
      {selectedDateKey && (
        <DayDetailDrawer
          dateKey={selectedDateKey}
          isOpen={isDrawerOpen}
          onClose={() => { setIsDrawerOpen(false); setSelectedDateKey(null); }}
          data={data}
          onAddEntry={addEntryToDay}
          onRemoveEntry={removeEntryFromDay}
          onAddThread={handleAddThread}
          onCreateCard={handleCreateCard}
          onCreateTask={handleCreateTask}
        />
      )}
    </div>
  );
}
