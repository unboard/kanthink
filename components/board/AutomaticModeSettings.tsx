'use client';

import { useState } from 'react';
import type {
  Channel,
  AutomaticTrigger,
  AutomaticSafeguards,
  ScheduledTrigger,
  EventTrigger,
  ThresholdTrigger,
  ScheduleInterval,
  EventTriggerType,
  ThresholdOperator,
  ID,
} from '@/lib/types';
import { Input } from '@/components/ui';

interface AutomaticModeSettingsProps {
  triggers: AutomaticTrigger[];
  safeguards: AutomaticSafeguards;
  isEnabled: boolean;
  channel: Channel;
  onTriggersChange: (triggers: AutomaticTrigger[]) => void;
  onSafeguardsChange: (safeguards: AutomaticSafeguards) => void;
  onEnabledChange: (enabled: boolean) => void;
}

const DEFAULT_SAFEGUARDS: AutomaticSafeguards = {
  cooldownMinutes: 5,
  dailyCap: 50,
  preventLoops: true,
};

const SCHEDULE_LABELS: Record<ScheduleInterval, string> = {
  hourly: 'Every hour',
  every4hours: 'Every 4 hours',
  daily: 'Daily',
  weekly: 'Weekly',
};

const EVENT_LABELS: Record<EventTriggerType, string> = {
  card_moved_to: 'Card moved to',
  card_created_in: 'Card created in',
  card_modified: 'Card modified in',
};

export function AutomaticModeSettings({
  triggers,
  safeguards,
  isEnabled,
  channel,
  onTriggersChange,
  onSafeguardsChange,
  onEnabledChange,
}: AutomaticModeSettingsProps) {
  const [isAddingTrigger, setIsAddingTrigger] = useState(false);
  const [newTriggerType, setNewTriggerType] = useState<'scheduled' | 'event' | 'threshold'>('scheduled');

  const effectiveSafeguards = { ...DEFAULT_SAFEGUARDS, ...safeguards };

  const addTrigger = (trigger: AutomaticTrigger) => {
    onTriggersChange([...triggers, trigger]);
    setIsAddingTrigger(false);
  };

  const removeTrigger = (index: number) => {
    onTriggersChange(triggers.filter((_, i) => i !== index));
  };

  const updateTrigger = (index: number, trigger: AutomaticTrigger) => {
    const updated = [...triggers];
    updated[index] = trigger;
    onTriggersChange(updated);
  };

  const getDefaultTrigger = (): AutomaticTrigger => {
    const firstColumnId = channel.columns[0]?.id || '';
    switch (newTriggerType) {
      case 'scheduled':
        return { type: 'scheduled', interval: 'daily' };
      case 'event':
        return { type: 'event', eventType: 'card_moved_to', columnId: firstColumnId };
      case 'threshold':
        return { type: 'threshold', columnId: firstColumnId, operator: 'below', threshold: 5 };
    }
  };

  const getTriggerDescription = (trigger: AutomaticTrigger): string => {
    switch (trigger.type) {
      case 'scheduled': {
        let desc = SCHEDULE_LABELS[trigger.interval];
        if (trigger.interval === 'daily' && trigger.specificTime) {
          desc += ` at ${trigger.specificTime}`;
        }
        if (trigger.interval === 'weekly' && trigger.dayOfWeek !== undefined) {
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          desc += ` on ${days[trigger.dayOfWeek]}`;
          if (trigger.specificTime) desc += ` at ${trigger.specificTime}`;
        }
        return desc;
      }
      case 'event': {
        const col = channel.columns.find(c => c.id === trigger.columnId);
        return `${EVENT_LABELS[trigger.eventType]} "${col?.name || 'Unknown'}"`;
      }
      case 'threshold': {
        const col = channel.columns.find(c => c.id === trigger.columnId);
        return `"${col?.name || 'Unknown'}" has ${trigger.operator === 'below' ? '<' : '>'} ${trigger.threshold} cards`;
      }
    }
  };

  const getTriggerIcon = (type: AutomaticTrigger['type']) => {
    switch (type) {
      case 'scheduled':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'event':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'threshold':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Enable automatic execution
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Run this action automatically based on triggers
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEnabledChange(!isEnabled)}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${isEnabled ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-600'}
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {isEnabled && (
        <>
          {/* Triggers Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Triggers ({triggers.length})
              </label>
              <button
                type="button"
                onClick={() => setIsAddingTrigger(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add trigger
              </button>
            </div>

            {/* Trigger List */}
            {triggers.length === 0 && !isAddingTrigger && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                No triggers configured. Add a trigger to enable automatic execution.
              </p>
            )}

            {triggers.map((trigger, index) => (
              <TriggerItem
                key={index}
                trigger={trigger}
                channel={channel}
                icon={getTriggerIcon(trigger.type)}
                description={getTriggerDescription(trigger)}
                onUpdate={(t) => updateTrigger(index, t)}
                onRemove={() => removeTrigger(index)}
              />
            ))}

            {/* Add Trigger Form */}
            {isAddingTrigger && (
              <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={newTriggerType}
                    onChange={(e) => setNewTriggerType(e.target.value as 'scheduled' | 'event' | 'threshold')}
                    className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="event">Event-based</option>
                    <option value="threshold">Threshold</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addTrigger(getDefaultTrigger())}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingTrigger(false)}
                    className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Safeguards Section */}
          <div className="space-y-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Safeguards
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Cooldown (minutes)
                </label>
                <Input
                  type="number"
                  value={effectiveSafeguards.cooldownMinutes}
                  onChange={(e) => onSafeguardsChange({
                    ...effectiveSafeguards,
                    cooldownMinutes: parseInt(e.target.value) || 5,
                  })}
                  min={1}
                  max={1440}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 dark:text-neutral-400">
                  Daily cap
                </label>
                <Input
                  type="number"
                  value={effectiveSafeguards.dailyCap}
                  onChange={(e) => onSafeguardsChange({
                    ...effectiveSafeguards,
                    dailyCap: parseInt(e.target.value) || 50,
                  })}
                  min={1}
                  max={1000}
                  className="mt-1"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={effectiveSafeguards.preventLoops}
                onChange={(e) => onSafeguardsChange({
                  ...effectiveSafeguards,
                  preventLoops: e.target.checked,
                })}
                className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">
                Prevent loops
              </span>
              <span className="text-xs text-neutral-500">(cards created by this action won&apos;t trigger it again)</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

interface TriggerItemProps {
  trigger: AutomaticTrigger;
  channel: Channel;
  icon: React.ReactNode;
  description: string;
  onUpdate: (trigger: AutomaticTrigger) => void;
  onRemove: () => void;
}

function TriggerItem({ trigger, channel, icon, description, onUpdate, onRemove }: TriggerItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-neutral-500 dark:text-neutral-400">{icon}</span>
        <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">{description}</span>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-neutral-400 hover:text-red-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded Settings */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-neutral-100 dark:border-neutral-700 space-y-2">
          {trigger.type === 'scheduled' && (
            <ScheduledTriggerSettings trigger={trigger} onUpdate={onUpdate} />
          )}
          {trigger.type === 'event' && (
            <EventTriggerSettings trigger={trigger} channel={channel} onUpdate={onUpdate} />
          )}
          {trigger.type === 'threshold' && (
            <ThresholdTriggerSettings trigger={trigger} channel={channel} onUpdate={onUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

function ScheduledTriggerSettings({
  trigger,
  onUpdate,
}: {
  trigger: ScheduledTrigger;
  onUpdate: (t: ScheduledTrigger) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-neutral-500 dark:text-neutral-400">Interval</label>
        <select
          value={trigger.interval}
          onChange={(e) => onUpdate({ ...trigger, interval: e.target.value as ScheduleInterval })}
          className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
        >
          <option value="hourly">Every hour</option>
          <option value="every4hours">Every 4 hours</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {(trigger.interval === 'daily' || trigger.interval === 'weekly') && (
        <div>
          <label className="text-xs text-neutral-500 dark:text-neutral-400">Time</label>
          <Input
            type="time"
            value={trigger.specificTime || '06:00'}
            onChange={(e) => onUpdate({ ...trigger, specificTime: e.target.value })}
            className="mt-1"
          />
        </div>
      )}

      {trigger.interval === 'weekly' && (
        <div>
          <label className="text-xs text-neutral-500 dark:text-neutral-400">Day of week</label>
          <select
            value={trigger.dayOfWeek ?? 1}
            onChange={(e) => onUpdate({ ...trigger, dayOfWeek: parseInt(e.target.value) })}
            className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
          >
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
            <option value={2}>Tuesday</option>
            <option value={3}>Wednesday</option>
            <option value={4}>Thursday</option>
            <option value={5}>Friday</option>
            <option value={6}>Saturday</option>
          </select>
        </div>
      )}
    </div>
  );
}

function EventTriggerSettings({
  trigger,
  channel,
  onUpdate,
}: {
  trigger: EventTrigger;
  channel: Channel;
  onUpdate: (t: EventTrigger) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-neutral-500 dark:text-neutral-400">Event type</label>
        <select
          value={trigger.eventType}
          onChange={(e) => onUpdate({ ...trigger, eventType: e.target.value as EventTriggerType })}
          className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
        >
          <option value="card_moved_to">Card moved to column</option>
          <option value="card_created_in">Card created in column</option>
          <option value="card_modified">Card modified in column</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-neutral-500 dark:text-neutral-400">Column</label>
        <select
          value={trigger.columnId}
          onChange={(e) => onUpdate({ ...trigger, columnId: e.target.value })}
          className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
        >
          {channel.columns.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ThresholdTriggerSettings({
  trigger,
  channel,
  onUpdate,
}: {
  trigger: ThresholdTrigger;
  channel: Channel;
  onUpdate: (t: ThresholdTrigger) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-neutral-500 dark:text-neutral-400">Column</label>
        <select
          value={trigger.columnId}
          onChange={(e) => onUpdate({ ...trigger, columnId: e.target.value })}
          className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
        >
          {channel.columns.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">Condition</label>
          <select
            value={trigger.operator}
            onChange={(e) => onUpdate({ ...trigger, operator: e.target.value as ThresholdOperator })}
            className="w-full mt-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm"
          >
            <option value="below">Falls below</option>
            <option value="above">Exceeds</option>
          </select>
        </div>
        <div className="w-20">
          <label className="text-xs text-neutral-500 dark:text-neutral-400">Cards</label>
          <Input
            type="number"
            value={trigger.threshold}
            onChange={(e) => onUpdate({ ...trigger, threshold: parseInt(e.target.value) || 5 })}
            min={1}
            max={100}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
