'use client';

import { useState, useEffect, useRef } from 'react';
import type { Channel, InstructionCard, InstructionAction, InstructionTarget, ContextColumnSelection, ID, AutomaticTrigger, AutomaticSafeguards } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Textarea } from '@/components/ui';

interface InstructionDetailDrawerV2Props {
  instructionCard: InstructionCard | null;
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRun: (card: InstructionCard) => Promise<void>;
}

/**
 * V2 Prototype: A more visual, less settings-heavy instruction editor.
 *
 * Key differences:
 * - Visual column selection using clickable chips
 * - Inline action selection as buttons, not radio buttons
 * - Instructions as the hero element
 * - Destination/context as a visual flow diagram
 * - Collapsible advanced settings
 */
export function InstructionDetailDrawerV2({
  instructionCard,
  channel,
  isOpen,
  onClose,
  onRun,
}: InstructionDetailDrawerV2Props) {
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);
  const deleteInstructionCard = useStore((s) => s.deleteInstructionCard);
  const cards = useStore((s) => s.cards);

  // Local form state
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [action, setAction] = useState<InstructionAction>('generate');
  const [selectedColumnIds, setSelectedColumnIds] = useState<ID[]>([]);
  const [cardCount, setCardCount] = useState(5);
  const [contextAllColumns, setContextAllColumns] = useState(true);
  const [contextColumnIds, setContextColumnIds] = useState<ID[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Automatic mode state (kept but hidden in advanced)
  const [triggers, setTriggers] = useState<AutomaticTrigger[]>([]);
  const [safeguards, setSafeguards] = useState<AutomaticSafeguards>({
    cooldownMinutes: 5,
    dailyCap: 50,
    preventLoops: true,
  });
  const [isEnabled, setIsEnabled] = useState(false);

  const isSyncingRef = useRef(false);
  const instructionCardId = instructionCard?.id;

  // Sync form state from props
  useEffect(() => {
    if (instructionCard) {
      isSyncingRef.current = true;
      setTitle(instructionCard.title);
      setInstructions(instructionCard.instructions);
      setAction(instructionCard.action);
      setCardCount(instructionCard.cardCount ?? 5);

      const target = instructionCard.target;
      if (target.type === 'column') {
        setSelectedColumnIds([target.columnId]);
      } else if (target.type === 'columns') {
        setSelectedColumnIds(target.columnIds);
      } else {
        setSelectedColumnIds(channel.columns.map(c => c.id));
      }

      const ctx = instructionCard.contextColumns;
      if (!ctx || ctx.type === 'all') {
        setContextAllColumns(true);
        setContextColumnIds([]);
      } else {
        setContextAllColumns(false);
        setContextColumnIds(ctx.columnIds);
      }

      setTriggers(instructionCard.triggers || []);
      setSafeguards(instructionCard.safeguards || { cooldownMinutes: 5, dailyCap: 50, preventLoops: true });
      setIsEnabled(instructionCard.isEnabled || false);

      setTimeout(() => { isSyncingRef.current = false; }, 0);
    }
  }, [instructionCardId, channel.columns, instructionCard]);

  // Auto-save on changes
  useEffect(() => {
    if (!isSyncingRef.current && instructionCard) {
      handleSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextAllColumns, contextColumnIds, selectedColumnIds, action]);

  const handleSave = () => {
    if (!instructionCard) return;

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

    const contextColumns: ContextColumnSelection | null = contextAllColumns
      ? null
      : { type: 'columns', columnIds: contextColumnIds };

    updateInstructionCard(instructionCard.id, {
      title,
      instructions,
      action,
      target,
      contextColumns,
      runMode: isEnabled ? 'automatic' : 'manual',
      cardCount: action === 'generate' ? cardCount : undefined,
      triggers,
      safeguards,
      isEnabled,
    });
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

  const handleDelete = () => {
    if (!instructionCard) return;
    if (confirm('Delete this action?')) {
      deleteInstructionCard(instructionCard.id);
      onClose();
    }
  };

  const toggleColumn = (columnId: ID) => {
    setSelectedColumnIds(prev =>
      prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]
    );
  };

  const toggleContextColumn = (columnId: ID) => {
    setContextColumnIds(prev =>
      prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]
    );
  };

  if (!instructionCard) return null;

  const actionLabels: Record<InstructionAction, { label: string; icon: React.ReactNode; description: string }> = {
    generate: {
      label: 'Generate',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      description: 'Create new cards',
    },
    modify: {
      label: 'Modify',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      description: 'Update existing cards',
    },
    move: {
      label: 'Move',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      description: 'Move cards between columns',
    },
  };

  // Count cards in selected columns for preview
  const cardsInSelectedColumns = channel.columns
    .filter(c => selectedColumnIds.includes(c.id))
    .reduce((sum, c) => sum + c.cardIds.length, 0);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating>
      <div className="flex flex-col h-full">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            placeholder="Action name..."
            className="text-lg font-semibold bg-transparent border-none outline-none text-neutral-900 dark:text-white placeholder:text-neutral-400 w-full"
          />
          <Button onClick={handleRun} disabled={isRunning} size="sm" className="ml-4 gap-1.5 shrink-0">
            {isRunning ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
            Run
          </Button>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Action Type - Button Group */}
          <div className="flex gap-2">
            {(Object.entries(actionLabels) as [InstructionAction, typeof actionLabels['generate']][]).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setAction(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  action === key
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Instructions - The Hero */}
          <div>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={handleSave}
              placeholder={
                action === 'generate'
                  ? 'Describe what cards to create...'
                  : action === 'modify'
                    ? 'Describe how to modify the cards...'
                    : 'Describe when cards should be moved...'
              }
              rows={5}
              className="text-base"
            />
          </div>

          {/* Visual Flow: Context → Action → Destination */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 space-y-4">
            {/* Destination Columns */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  {action === 'generate' ? 'Add to' : action === 'modify' ? 'Modify in' : 'Move from'}
                </span>
                {action === 'generate' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCardCount(Math.max(1, cardCount - 1))}
                      className="w-6 h-6 rounded bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-600"
                    >
                      -
                    </button>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400 w-12 text-center">
                      {cardCount} cards
                    </span>
                    <button
                      onClick={() => setCardCount(Math.min(20, cardCount + 1))}
                      className="w-6 h-6 rounded bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-600"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {channel.columns.map((col) => {
                  const isSelected = selectedColumnIds.includes(col.id);
                  const cardCount = col.cardIds.length;
                  return (
                    <button
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-600'
                      }`}
                    >
                      {col.name}
                      {(action === 'modify' || action === 'move') && isSelected && cardCount > 0 && (
                        <span className="ml-1.5 text-xs opacity-70">({cardCount})</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(action === 'modify' || action === 'move') && cardsInSelectedColumns > 0 && (
                <p className="text-xs text-neutral-500 mt-2">
                  {cardsInSelectedColumns} card{cardsInSelectedColumns !== 1 ? 's' : ''} will be affected
                </p>
              )}
            </div>

            {/* Divider with arrow */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
            </div>

            {/* Context Columns (what AI sees) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  AI Reads From
                </span>
                <button
                  onClick={() => {
                    setContextAllColumns(!contextAllColumns);
                    if (!contextAllColumns) setContextColumnIds([]);
                  }}
                  className={`text-xs px-2 py-0.5 rounded ${
                    contextAllColumns
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {contextAllColumns ? 'All' : 'Custom'}
                </button>
              </div>
              {contextAllColumns ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  AI can see all {channel.columns.length} columns for context
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {channel.columns.map((col) => {
                    const isSelected = contextColumnIds.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleContextColumn(col.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-white dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {col.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Advanced Settings - Collapsible */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-6">
                {/* Automatic execution toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => {
                      setIsEnabled(e.target.checked);
                      setTimeout(() => handleSave(), 0);
                    }}
                    className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Run automatically
                    </span>
                    <p className="text-xs text-neutral-500">
                      Execute this action on a schedule or when conditions are met
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-neutral-100 dark:border-neutral-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
