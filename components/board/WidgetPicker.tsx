'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import type { CalendarTypeData, PollTypeData, ShroomTypeData, ID } from '@/lib/types';
import { useStore } from '@/lib/store';

interface WidgetPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWidget: (cardType: string, title: string, typeData: Record<string, unknown>) => void;
  channelId?: ID;
}

interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  hasSettings: boolean;
}

const WIDGETS: WidgetDefinition[] = [
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Month grid with day schedule',
    icon: '📅',
    hasSettings: true,
  },
  {
    id: 'poll',
    name: 'Poll',
    description: 'Quick voting for decisions',
    icon: '📊',
    hasSettings: true,
  },
  {
    id: 'shroom',
    name: 'Shroom',
    description: 'Place an AI shroom in a column',
    icon: '🍄',
    hasSettings: true,
  },
];

function CalendarSettings({ onCreate }: { onCreate: (title: string, data: CalendarTypeData) => void }) {
  const now = new Date();
  const [style, setStyle] = useState<CalendarTypeData['style']>('month-table');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Calendar Settings</h3>

      {/* Style */}
      <div>
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 block">Style</label>
        <div className="flex gap-2">
          {[
            { value: 'month-table' as const, label: 'Month + Table' },
            { value: 'month-only' as const, label: 'Month Only' },
            { value: 'table-only' as const, label: 'Table Only' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStyle(opt.value)}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                style === opt.value
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Month/Year */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
          >
            {monthNames.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={() => onCreate(`${monthNames[month]} ${year}`, {
          style,
          month,
          year,
          showWeekends: true,
          firstDayOfWeek: 1,
          dayEntries: {},
        })}
        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
      >
        Create Calendar
      </button>
    </div>
  );
}

function PollSettings({ onCreate, creatorId }: { onCreate: (title: string, data: PollTypeData) => void; creatorId?: string }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const addOption = () => {
    if (options.length < 5) setOptions([...options, '']);
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Poll Settings</h3>

      <div>
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Question</label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should we prioritize?"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
          autoFocus
        />
      </div>

      <div>
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Options</label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="text-neutral-400 hover:text-red-500 px-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 5 && (
          <button onClick={addOption} className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline">
            + Add option
          </button>
        )}
      </div>

      <button
        onClick={() => {
          if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
          onCreate(question, {
            question,
            options: options.filter(o => o.trim()).map((text, i) => ({
              id: `opt_${i}`,
              text: text.trim(),
              voterIds: [],
            })),
            closed: false,
            creatorId,
          });
        }}
        disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        Create Poll
      </button>
    </div>
  );
}

const ACTION_ICONS: Record<string, string> = {
  generate: '+',
  modify: '✎',
  move: '↔',
};

function ShroomSettings({ channelId, onCreate }: { channelId?: ID; onCreate: (title: string, data: ShroomTypeData) => void }) {
  const instructionCards = useStore((s) => s.instructionCards);
  const favoriteIds = useStore((s) => s.favoriteInstructionCardIds);

  // Get channel shrooms + favorited/global shrooms
  const channelShrooms = Object.values(instructionCards).filter(
    (ic) => channelId && ic.channelId === channelId
  );
  const favoritedShrooms = favoriteIds
    .map((id) => instructionCards[id])
    .filter(Boolean)
    .filter((ic) => !channelId || ic.channelId === channelId || !ic.channelId || ic.isGlobalResource);
  const globalShrooms = Object.values(instructionCards).filter(
    (ic) => ic.isGlobalResource && !channelShrooms.some((cs) => cs.id === ic.id)
  );

  // Deduplicate
  const seen = new Set<string>();
  const allShrooms = [...channelShrooms, ...favoritedShrooms, ...globalShrooms].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  if (allShrooms.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Select a Shroom</h3>
        <div className="py-8 text-center">
          <span className="text-3xl mb-2 block">🍄</span>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No shrooms available</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Create a shroom in channel settings first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Select a Shroom</h3>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {allShrooms.map((shroom) => (
          <button
            key={shroom.id}
            onClick={() => onCreate(shroom.title, { instructionCardId: shroom.id })}
            className="w-full text-left px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🍄</span>
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{shroom.title}</span>
              <span className="ml-auto flex-shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 uppercase">
                {ACTION_ICONS[shroom.action] || '+'} {shroom.action}
              </span>
            </div>
            {shroom.instructions && (
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500 line-clamp-1">{shroom.instructions}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WidgetPicker({ isOpen, onClose, onCreateWidget, channelId }: WidgetPickerProps) {
  const { data: session } = useSession();
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { onClose(); setSelectedWidget(null); }} />

      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              {selectedWidget ? 'Configure' : 'Widgets'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {selectedWidget ? 'Set up your widget' : 'Add a smart card to your column'}
            </p>
          </div>
          <button
            onClick={() => { if (selectedWidget) setSelectedWidget(null); else onClose(); }}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {selectedWidget ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {!selectedWidget ? (
            /* Widget grid */
            <div className="grid grid-cols-2 gap-3">
              {WIDGETS.map((widget) => (
                <button
                  key={widget.id}
                  onClick={() => setSelectedWidget(widget.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all"
                >
                  <span className="text-3xl">{widget.icon}</span>
                  <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{widget.name}</span>
                  <span className="text-[10px] text-neutral-400 text-center">{widget.description}</span>
                </button>
              ))}
            </div>
          ) : selectedWidget === 'calendar' ? (
            <CalendarSettings onCreate={(title, data) => {
              onCreateWidget('calendar', title, data as unknown as Record<string, unknown>);
              setSelectedWidget(null);
              onClose();
            }} />
          ) : selectedWidget === 'poll' ? (
            <PollSettings creatorId={session?.user?.id} onCreate={(title, data) => {
              onCreateWidget('poll', title, data as unknown as Record<string, unknown>);
              setSelectedWidget(null);
              onClose();
            }} />
          ) : selectedWidget === 'shroom' ? (
            <ShroomSettings channelId={channelId} onCreate={(title, data) => {
              onCreateWidget('shroom', title, data as unknown as Record<string, unknown>);
              setSelectedWidget(null);
              onClose();
            }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
