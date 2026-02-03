'use client';

import { useState, useEffect, useRef } from 'react';
import type { Channel, InstructionCard, InstructionAction, InstructionTarget, ContextColumnSelection, ID, AutomaticTrigger, AutomaticSafeguards, ScheduleInterval, EventTriggerType, ThresholdOperator, InstructionScope } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Drawer } from '@/components/ui/Drawer';
import { HighlightedTextarea } from '@/components/ui';

interface InstructionDetailDrawerProps {
  instructionCard: InstructionCard | null;
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRun: (card: InstructionCard) => Promise<void>;
}

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

export function InstructionDetailDrawer({
  instructionCard,
  channel,
  isOpen,
  onClose,
  onRun,
}: InstructionDetailDrawerProps) {
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);
  const deleteInstructionCard = useStore((s) => s.deleteInstructionCard);
  const duplicateInstructionCard = useStore((s) => s.duplicateInstructionCard);
  const instructionRuns = useStore((s) => s.instructionRuns);
  const undoInstructionRun = useStore((s) => s.undoInstructionRun);

  // Local form state
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [action, setAction] = useState<InstructionAction>('generate');
  const [selectedColumnIds, setSelectedColumnIds] = useState<ID[]>([]);
  const [cardCount, setCardCount] = useState(5);

  // Context state
  const [contextEnabled, setContextEnabled] = useState(true);
  const [contextColumnIds, setContextColumnIds] = useState<ID[]>([]);
  const isSyncingRef = useRef(false);

  // Automation state
  const [automationExpanded, setAutomationExpanded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [triggers, setTriggers] = useState<AutomaticTrigger[]>([]);
  const [safeguards, setSafeguards] = useState<AutomaticSafeguards>({
    cooldownMinutes: 5,
    dailyCap: 50,
    preventLoops: true,
  });
  const [addingTriggerType, setAddingTriggerType] = useState<'scheduled' | 'event' | 'threshold' | null>(null);

  // Scope state
  const [scope, setScope] = useState<InstructionScope>('channel');

  const [isRunning, setIsRunning] = useState(false);

  // Get the latest run for undo
  const latestRun = instructionCard
    ? Object.values(instructionRuns)
        .filter(r => r.instructionId === instructionCard.id && !r.undone)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    : null;

  // Sync form state when switching cards
  const instructionCardId = instructionCard?.id;
  useEffect(() => {
    if (instructionCard) {
      isSyncingRef.current = true;

      setTitle(instructionCard.title);
      setInstructions(instructionCard.instructions);
      setAction(instructionCard.action);
      setCardCount(instructionCard.cardCount ?? 5);

      // Convert target to selectedColumnIds
      const target = instructionCard.target;
      if (target.type === 'column') {
        setSelectedColumnIds([target.columnId]);
      } else if (target.type === 'columns') {
        setSelectedColumnIds(target.columnIds);
      } else {
        setSelectedColumnIds(channel.columns.map(c => c.id));
      }

      // Sync context columns
      const ctx = instructionCard.contextColumns;
      if (!ctx || ctx.type === 'all') {
        setContextEnabled(true);
        setContextColumnIds(channel.columns.map(c => c.id));
      } else {
        setContextEnabled(ctx.columnIds.length > 0);
        setContextColumnIds(ctx.columnIds);
      }

      // Sync automation state
      setTriggers(instructionCard.triggers || []);
      setSafeguards(instructionCard.safeguards || {
        cooldownMinutes: 5,
        dailyCap: 50,
        preventLoops: true,
      });
      setIsEnabled(instructionCard.isEnabled || false);

      // Sync scope
      setScope(instructionCard.scope || 'channel');

      setTimeout(() => { isSyncingRef.current = false; }, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionCardId, channel.columns]);

  // Auto-save when selections change
  useEffect(() => {
    if (!isSyncingRef.current && instructionCard) {
      handleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextEnabled, contextColumnIds, selectedColumnIds]);

  const handleSave = (overrides?: {
    triggers?: AutomaticTrigger[];
    safeguards?: AutomaticSafeguards;
    isEnabled?: boolean;
    scope?: InstructionScope;
  }) => {
    if (!instructionCard) return;

    // Convert selectedColumnIds to target
    let target: InstructionTarget;
    if (selectedColumnIds.length === 0) {
      target = { type: 'column', columnId: channel.columns[0]?.id || '' };
    } else if (selectedColumnIds.length === 1) {
      target = { type: 'column', columnId: selectedColumnIds[0] };
    } else if (selectedColumnIds.length === channel.columns.length) {
      target = { type: 'board' };
    } else {
      target = { type: 'columns', columnIds: selectedColumnIds };
    }

    // Build contextColumns
    const contextColumns: ContextColumnSelection | null = !contextEnabled
      ? { type: 'columns', columnIds: [] }
      : contextColumnIds.length === channel.columns.length
        ? null // null = all columns
        : { type: 'columns', columnIds: contextColumnIds };

    const effectiveTriggers = overrides?.triggers ?? triggers;
    const effectiveSafeguards = overrides?.safeguards ?? safeguards;
    const effectiveIsEnabled = overrides?.isEnabled ?? isEnabled;
    const effectiveScope = overrides?.scope ?? scope;

    updateInstructionCard(instructionCard.id, {
      title,
      instructions,
      action,
      target,
      contextColumns,
      runMode: effectiveIsEnabled ? 'automatic' : 'manual',
      cardCount: action === 'generate' ? cardCount : undefined,
      triggers: effectiveTriggers,
      safeguards: effectiveSafeguards,
      isEnabled: effectiveIsEnabled,
      scope: effectiveScope,
    });
  };

  const handleDelete = () => {
    if (!instructionCard) return;
    if (confirm('Delete this action?')) {
      deleteInstructionCard(instructionCard.id);
      onClose();
    }
  };

  const handleDuplicate = () => {
    if (!instructionCard) return;
    const newCard = duplicateInstructionCard(instructionCard.id);
    if (newCard) {
      onClose();
    }
  };

  const handleRun = async () => {
    if (!instructionCard || isRunning) return;
    handleSave();
    setIsRunning(true);
    try {
      await onRun(instructionCard);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUndo = () => {
    if (latestRun) {
      undoInstructionRun(latestRun.id);
    }
  };

  const toggleTarget = (colId: ID) => {
    setSelectedColumnIds(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const toggleContext = (colId: ID) => {
    setContextColumnIds(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const addTrigger = (type: 'scheduled' | 'event' | 'threshold') => {
    const firstColumnId = channel.columns[0]?.id || '';
    let newTrigger: AutomaticTrigger;

    switch (type) {
      case 'scheduled':
        newTrigger = { type: 'scheduled', interval: 'daily' };
        break;
      case 'event':
        newTrigger = { type: 'event', eventType: 'card_moved_to', columnId: firstColumnId };
        break;
      case 'threshold':
        newTrigger = { type: 'threshold', columnId: firstColumnId, operator: 'below', threshold: 5 };
        break;
    }

    const newTriggers = [...triggers, newTrigger];
    setTriggers(newTriggers);
    setAddingTriggerType(null);
    handleSave({ triggers: newTriggers });
  };

  const removeTrigger = (index: number) => {
    const newTriggers = triggers.filter((_, i) => i !== index);
    setTriggers(newTriggers);
    handleSave({ triggers: newTriggers });
  };

  const updateTrigger = (index: number, trigger: AutomaticTrigger) => {
    const updated = [...triggers];
    updated[index] = trigger;
    setTriggers(updated);
    handleSave({ triggers: updated });
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
        return `"${col?.name || 'Unknown'}" ${trigger.operator === 'below' ? 'falls below' : 'exceeds'} ${trigger.threshold} cards`;
      }
    }
  };

  if (!instructionCard) return null;

  const totalContextCards = channel.columns
    .filter(c => contextColumnIds.includes(c.id))
    .reduce((sum, c) => sum + c.cardIds.length, 0);

  const targetColumnNames = channel.columns
    .filter(c => selectedColumnIds.includes(c.id))
    .map(c => c.name);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm">
              {action === 'generate' ? '✨' : action === 'modify' ? '✏️' : '↔️'}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleSave()}
              className="text-lg font-semibold bg-transparent border-none outline-none text-neutral-900 dark:text-white placeholder-neutral-400"
              placeholder="Action name..."
            />
          </div>
          <div className="flex items-center gap-2">
            {latestRun && (
              <button
                onClick={handleUndo}
                className="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5"
                title={`Undo last run (${latestRun.changes.length} changes)`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Undo
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white flex items-center gap-2 transition-colors"
            >
              {isRunning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
              {isRunning ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5">
            {/* Pipeline Container */}
            <div className="relative">
              {/* Connecting Line */}
              <div className="absolute left-6 top-10 bottom-10 w-0.5 bg-gradient-to-b from-violet-500/50 via-emerald-500/50 to-amber-500/30 dark:from-violet-500/30 dark:via-emerald-500/30 dark:to-amber-500/20" />

              {/* Step 1: Action */}
              <div className="relative pl-14 pb-6">
                <div className="absolute left-3 w-7 h-7 rounded-full bg-violet-500/20 border-2 border-violet-500/50 flex items-center justify-center">
                  <span className="text-xs">⚡</span>
                </div>
                <div className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-2">ACTION</div>

                {/* Action type tabs */}
                <div className="flex gap-2 mb-4">
                  {(['generate', 'modify', 'move'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => { setAction(a); setTimeout(handleSave, 0); }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        action === a
                          ? 'bg-violet-600 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {a === 'generate' && '✨ Generate'}
                      {a === 'modify' && '✏️ Modify'}
                      {a === 'move' && '↔️ Move'}
                    </button>
                  ))}
                </div>

                {/* Instructions */}
                <HighlightedTextarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  onBlur={() => handleSave()}
                  placeholder="Describe what Kan should do..."
                  rows={5}
                  className="w-full"
                />

                {/* Card count for generate */}
                {action === 'generate' && (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">Create</span>
                    <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden">
                      <button
                        onClick={() => { setCardCount(Math.max(1, cardCount - 1)); setTimeout(handleSave, 0); }}
                        className="w-8 h-8 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-white transition-colors flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-neutral-900 dark:text-white font-medium">{cardCount}</span>
                      <button
                        onClick={() => { setCardCount(Math.min(20, cardCount + 1)); setTimeout(handleSave, 0); }}
                        className="w-8 h-8 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-white transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">new cards</span>
                  </div>
                )}
              </div>

              {/* Step 2: Output */}
              <div className="relative pl-14 pb-6">
                <div className="absolute left-3 w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
                  <span className="text-xs">→</span>
                </div>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                  {action === 'generate' ? 'ADD TO' : action === 'modify' ? 'MODIFY IN' : 'MOVE BETWEEN'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {channel.columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => toggleTarget(col.id)}
                      className={`group relative px-3 py-2 rounded-lg text-sm transition-all ${
                        selectedColumnIds.includes(col.id)
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-200'
                          : 'bg-neutral-100 dark:bg-neutral-800 border border-transparent text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
                      }`}
                    >
                      <div className="font-medium">{col.name}</div>
                      {selectedColumnIds.includes(col.id) && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Learn From (Optional) */}
              <div className="relative pl-14">
                <div className={`absolute left-3 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  contextEnabled
                    ? 'bg-amber-500/20 border-2 border-amber-500/50'
                    : 'bg-neutral-200 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-700'
                }`}>
                  <span className="text-xs">{contextEnabled ? '👁' : '○'}</span>
                </div>

                {/* Header with toggle */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${contextEnabled ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                      LEARN FROM
                    </span>
                    <span className="text-[10px] text-neutral-500 bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                      OPTIONAL
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const newEnabled = !contextEnabled;
                      setContextEnabled(newEnabled);
                      if (newEnabled) {
                        setContextColumnIds(channel.columns.map(c => c.id));
                      }
                    }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      contextEnabled ? 'bg-amber-500/30' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      contextEnabled
                        ? 'left-4 bg-amber-500'
                        : 'left-0.5 bg-neutral-400 dark:bg-neutral-500'
                    }`} />
                  </button>
                </div>

                {contextEnabled ? (
                  <>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                      Reference existing cards to avoid duplicates and stay relevant
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {channel.columns.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => toggleContext(col.id)}
                          className={`group relative px-3 py-2 rounded-lg text-sm transition-all ${
                            contextColumnIds.includes(col.id)
                              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-200'
                              : 'bg-neutral-100 dark:bg-neutral-800 border border-transparent text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
                          }`}
                        >
                          <div className="font-medium">{col.name}</div>
                          <div className="text-xs opacity-60">{col.cardIds.length} cards</div>
                          {contextColumnIds.includes(col.id) && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {totalContextCards > 0 && (
                      <div className="mt-2 text-xs text-neutral-500">
                        {totalContextCards} cards available as context
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-neutral-400 dark:text-neutral-600">
                    Kan won't reference existing cards
                  </p>
                )}
              </div>
            </div>

            {/* Summary Preview */}
            <div className="mt-8 p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700/50">
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">PREVIEW</div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {action === 'generate' && (
                  <>
                    Generate <span className="text-violet-600 dark:text-violet-400 font-medium">{cardCount} cards</span> and add to{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {targetColumnNames.length === 0 ? '...' : targetColumnNames.join(', ')}
                    </span>
                    {contextEnabled && contextColumnIds.length > 0 && (
                      <>, learning from <span className="text-amber-600 dark:text-amber-400 font-medium">{totalContextCards} existing cards</span></>
                    )}
                  </>
                )}
                {action === 'modify' && (
                  <>
                    Modify cards in{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {targetColumnNames.length === 0 ? '...' : targetColumnNames.join(', ')}
                    </span>
                  </>
                )}
                {action === 'move' && (
                  <>
                    Reorganize cards across{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {targetColumnNames.length === 0 ? '...' : targetColumnNames.join(', ')}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Automation Section */}
            <div className="mt-4">
              <button
                onClick={() => setAutomationExpanded(!automationExpanded)}
                className="w-full flex items-center justify-between py-3 px-4 bg-neutral-100 dark:bg-neutral-800/50 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-violet-500/20' : 'bg-neutral-200 dark:bg-neutral-700'}`}>
                    <svg className={`w-4 h-4 ${isEnabled ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Automation</div>
                    <div className="text-xs text-neutral-500">
                      {isEnabled ? `${triggers.length} trigger${triggers.length !== 1 ? 's' : ''} active` : 'Manual only'}
                    </div>
                  </div>
                </div>
                <svg className={`w-5 h-5 text-neutral-400 transition-transform ${automationExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {automationExpanded && (
                <div className="mt-3 p-4 bg-neutral-50 dark:bg-neutral-800/30 rounded-xl border border-neutral-200 dark:border-neutral-700/50 space-y-4">
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Enable automation</div>
                      <div className="text-xs text-neutral-500">Run automatically based on triggers</div>
                    </div>
                    <button
                      onClick={() => {
                        const newEnabled = !isEnabled;
                        setIsEnabled(newEnabled);
                        handleSave({ isEnabled: newEnabled });
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        isEnabled ? 'bg-violet-600' : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        isEnabled ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {isEnabled && (
                    <>
                      {/* Triggers */}
                      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            Triggers ({triggers.length})
                          </div>
                        </div>

                        {/* Trigger list */}
                        <div className="space-y-2">
                          {triggers.map((trigger, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                              <div className="w-6 h-6 rounded bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center">
                                {trigger.type === 'scheduled' && (
                                  <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                {trigger.type === 'event' && (
                                  <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                )}
                                {trigger.type === 'threshold' && (
                                  <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">
                                {getTriggerDescription(trigger)}
                              </span>
                              <button
                                onClick={() => removeTrigger(index)}
                                className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add trigger buttons */}
                        {addingTriggerType === null ? (
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => addTrigger('scheduled')}
                              className="flex-1 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-colors"
                            >
                              + Schedule
                            </button>
                            <button
                              onClick={() => addTrigger('event')}
                              className="flex-1 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-colors"
                            >
                              + Event
                            </button>
                            <button
                              onClick={() => addTrigger('threshold')}
                              className="flex-1 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-colors"
                            >
                              + Threshold
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* Safeguards */}
                      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Safeguards</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-neutral-500">Cooldown (min)</label>
                            <input
                              type="number"
                              value={safeguards.cooldownMinutes}
                              onChange={(e) => {
                                const newSafeguards = { ...safeguards, cooldownMinutes: parseInt(e.target.value) || 5 };
                                setSafeguards(newSafeguards);
                                handleSave({ safeguards: newSafeguards });
                              }}
                              min={1}
                              max={1440}
                              className="w-full mt-1 px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-neutral-500">Daily cap</label>
                            <input
                              type="number"
                              value={safeguards.dailyCap}
                              onChange={(e) => {
                                const newSafeguards = { ...safeguards, dailyCap: parseInt(e.target.value) || 50 };
                                setSafeguards(newSafeguards);
                                handleSave({ safeguards: newSafeguards });
                              }}
                              min={1}
                              max={1000}
                              className="w-full mt-1 px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 mt-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={safeguards.preventLoops}
                            onChange={(e) => {
                              const newSafeguards = { ...safeguards, preventLoops: e.target.checked };
                              setSafeguards(newSafeguards);
                              handleSave({ safeguards: newSafeguards });
                            }}
                            className="w-4 h-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-neutral-700 dark:text-neutral-300">Prevent loops</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Scope Section */}
            <div className="mt-4 p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700/50">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-neutral-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Visibility</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setScope('channel');
                    handleSave({ scope: 'channel' });
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    scope === 'channel'
                      ? 'bg-violet-600 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  This Channel
                </button>
                <button
                  onClick={() => {
                    setScope('global');
                    handleSave({ scope: 'global' });
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    scope === 'global'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                  </svg>
                  Global
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {scope === 'channel'
                  ? 'Only visible and runnable in this channel'
                  : 'Visible in Shrooms panel and runnable on any channel'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={handleDuplicate}
              className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Duplicate
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Drawer>
  );
}
