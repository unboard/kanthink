'use client';

import { useState, useEffect, useRef } from 'react';
import type { Channel, InstructionCard, InstructionAction, InstructionTarget, InstructionRunMode, ContextColumnSelection, ID, AutomaticTrigger, AutomaticSafeguards, InstructionRun } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Input, Textarea, HighlightedTextarea } from '@/components/ui';
import { ContextViewer } from './ContextViewer';
import { AutomaticModeSettings } from './AutomaticModeSettings';

interface InstructionDetailDrawerProps {
  instructionCard: InstructionCard | null;
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRun: (card: InstructionCard) => Promise<void>;
}

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
  const cards = useStore((s) => s.cards);
  const instructionRuns = useStore((s) => s.instructionRuns);
  const undoInstructionRun = useStore((s) => s.undoInstructionRun);

  // Local form state
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [action, setAction] = useState<InstructionAction>('generate');
  const [selectedColumnIds, setSelectedColumnIds] = useState<ID[]>([]);
  const [runMode, setRunMode] = useState<InstructionRunMode>('manual');
  const [cardCount, setCardCount] = useState(5);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Automatic mode state
  const [triggers, setTriggers] = useState<AutomaticTrigger[]>([]);
  const [safeguards, setSafeguards] = useState<AutomaticSafeguards>({
    cooldownMinutes: 5,
    dailyCap: 50,
    preventLoops: true,
  });
  const [isEnabled, setIsEnabled] = useState(false);

  // Context columns state
  const [contextAllColumns, setContextAllColumns] = useState(true);
  const [contextColumnIds, setContextColumnIds] = useState<ID[]>([]);
  const [isContextDropdownOpen, setIsContextDropdownOpen] = useState(false);
  const contextDropdownRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false); // Track when we're syncing from props

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const ai = useSettingsStore((s) => s.ai);

  // Get the latest run for this instruction that can be undone
  const latestRun = instructionCard
    ? Object.values(instructionRuns)
        .filter(r => r.instructionId === instructionCard.id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    : null;

  const handleUndo = () => {
    if (latestRun && !latestRun.undone) {
      undoInstructionRun(latestRun.id);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
      if (contextDropdownRef.current && !contextDropdownRef.current.contains(event.target as Node)) {
        setIsContextDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync form state when switching to a different instruction card (by ID)
  // We only sync on ID change to avoid resetting local state during edits
  const instructionCardId = instructionCard?.id;
  useEffect(() => {
    if (instructionCard) {
      isSyncingRef.current = true;

      setTitle(instructionCard.title);
      setInstructions(instructionCard.instructions);
      setAction(instructionCard.action);
      setRunMode(instructionCard.runMode);
      setCardCount(instructionCard.cardCount ?? 5);

      // Convert target to selectedColumnIds (destination)
      const target = instructionCard.target;
      if (target.type === 'column') {
        setSelectedColumnIds([target.columnId]);
      } else if (target.type === 'columns') {
        setSelectedColumnIds(target.columnIds);
      } else {
        // board = all columns
        setSelectedColumnIds(channel.columns.map(c => c.id));
      }

      // Sync context columns
      const ctx = instructionCard.contextColumns;
      if (!ctx || ctx.type === 'all') {
        setContextAllColumns(true);
        setContextColumnIds([]);
      } else {
        setContextAllColumns(false);
        setContextColumnIds(ctx.columnIds);
      }

      // Sync automatic mode state
      setTriggers(instructionCard.triggers || []);
      setSafeguards(instructionCard.safeguards || {
        cooldownMinutes: 5,
        dailyCap: 50,
        preventLoops: true,
      });
      setIsEnabled(instructionCard.isEnabled || false);

      // Reset suggestions when switching cards
      setSuggestions([]);

      // Reset sync flag after state updates are processed
      setTimeout(() => { isSyncingRef.current = false; }, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionCardId, channel.columns]);

  // Auto-save when context columns or destination columns change (but not when syncing from props)
  useEffect(() => {
    if (!isSyncingRef.current && instructionCard) {
      handleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextAllColumns, contextColumnIds, selectedColumnIds]);

  // Accept optional overrides for values that may not be in state yet (due to React batching)
  const handleSave = (overrides?: {
    triggers?: AutomaticTrigger[];
    safeguards?: AutomaticSafeguards;
    isEnabled?: boolean;
  }) => {
    if (!instructionCard) return;

    // Convert selectedColumnIds to target (destination)
    let target: InstructionTarget;
    if (selectedColumnIds.length === 0) {
      // Default to first column if none selected
      target = { type: 'column', columnId: channel.columns[0]?.id || '' };
    } else if (selectedColumnIds.length === 1) {
      target = { type: 'column', columnId: selectedColumnIds[0] };
    } else if (selectedColumnIds.length === channel.columns.length) {
      target = { type: 'board' };
    } else {
      target = { type: 'columns', columnIds: selectedColumnIds };
    }

    // Build contextColumns (undefined = all columns, which is the default)
    const contextColumns: ContextColumnSelection | undefined = contextAllColumns
      ? undefined
      : { type: 'columns', columnIds: contextColumnIds };

    // Use overrides if provided (for immediate saves before state updates)
    const effectiveTriggers = overrides?.triggers ?? triggers;
    const effectiveSafeguards = overrides?.safeguards ?? safeguards;
    const effectiveIsEnabled = overrides?.isEnabled ?? isEnabled;
    // Derive runMode from isEnabled
    const effectiveRunMode = effectiveIsEnabled ? 'automatic' : 'manual';

    updateInstructionCard(instructionCard.id, {
      title,
      instructions,
      action,
      target,
      contextColumns,
      runMode: effectiveRunMode,
      cardCount: action === 'generate' ? cardCount : undefined,
      // Automatic mode fields - always save them
      triggers: effectiveTriggers,
      safeguards: effectiveSafeguards,
      isEnabled: effectiveIsEnabled,
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

  const handleColumnToggle = (columnId: ID) => {
    setSelectedColumnIds((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const handleSelectAllColumns = () => {
    if (selectedColumnIds.length === channel.columns.length) {
      setSelectedColumnIds([]);
    } else {
      setSelectedColumnIds(channel.columns.map(c => c.id));
    }
  };

  // Context column handlers (auto-saved via useEffect)
  const handleContextColumnToggle = (columnId: ID) => {
    setContextColumnIds((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const handleSelectAllContextColumns = () => {
    if (contextColumnIds.length === channel.columns.length) {
      setContextColumnIds([]);
    } else {
      setContextColumnIds(channel.columns.map(c => c.id));
    }
  };

  // Auto-save on blur
  const handleFieldBlur = () => {
    handleSave();
  };

  // Get display text for destination column selector
  const getColumnSelectorText = () => {
    if (selectedColumnIds.length === 0) return 'Select columns...';
    if (selectedColumnIds.length === channel.columns.length) return 'All columns';
    if (selectedColumnIds.length === 1) {
      const col = channel.columns.find(c => c.id === selectedColumnIds[0]);
      return col?.name || 'Unknown';
    }
    return `${selectedColumnIds.length} columns selected`;
  };

  // Get display text for context column selector
  const getContextSelectorText = () => {
    if (contextColumnIds.length === 0) return 'Select columns...';
    if (contextColumnIds.length === channel.columns.length) return 'All columns';
    if (contextColumnIds.length === 1) {
      const col = channel.columns.find(c => c.id === contextColumnIds[0]);
      return col?.name || 'Unknown';
    }
    return `${contextColumnIds.length} columns selected`;
  };

  if (!instructionCard) return null;

  // Build context object for viewer - shows what AI will see when instruction runs
  const destinationColumns = channel.columns.filter((c) => selectedColumnIds.includes(c.id));
  const effectiveContextColumns = contextAllColumns
    ? channel.columns
    : channel.columns.filter((c) => contextColumnIds.includes(c.id));

  const contextCardsPreview = effectiveContextColumns.flatMap((col) =>
    col.cardIds.slice(0, 3).map((cardId) => {
      const card = cards[cardId];
      if (!card) return null;
      return {
        column: col.name,
        title: card.title,
        preview: card.summary || (card.messages && card.messages[0]?.content.slice(0, 100)) || '',
      };
    }).filter(Boolean)
  );

  const aiContext = {
    channel: {
      name: channel.name,
      description: channel.description,
    },
    instruction: {
      title,
      action,
      instructions: instructions.slice(0, 200) + (instructions.length > 200 ? '...' : ''),
      cardCount: action === 'generate' ? cardCount : undefined,
      runMode,
    },
    addToColumns: destinationColumns.map((c) => c.name),
    aiSees: contextAllColumns ? 'All columns' : effectiveContextColumns.map((c) => c.name),
    existingCards: contextCardsPreview.length > 0 ? contextCardsPreview : '(no cards)',
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pr-8">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Edit Action
            </h2>
            <ContextViewer context={aiContext} title="Action Context" />
          </div>
          <div className="flex items-center gap-2">
            {latestRun && (
              <Button
                onClick={handleUndo}
                disabled={latestRun.undone}
                variant="secondary"
                className="gap-1.5"
                title={latestRun.undone ? 'Already undone' : `Undo last run (${latestRun.changes.length} changes)`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                {latestRun.undone ? 'Undone' : 'Undo'}
              </Button>
            )}
            <Button onClick={handleRun} disabled={isRunning} className="gap-1.5">
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
              {isRunning ? 'Running...' : 'Run'}
            </Button>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleFieldBlur}
            placeholder="Action name"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Instructions
          </label>
          <HighlightedTextarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={handleFieldBlur}
            placeholder="Describe what the AI should do..."
            rows={6}
          />

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-neutral-500">Suggestions:</p>
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInstructions(suggestion);
                    setSuggestions([]);
                    handleSave();
                  }}
                  className="w-full text-left px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-violet-300 dark:hover:border-violet-600 text-sm text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Suggest button */}
          {!instructions && suggestions.length === 0 && title && (
            <button
              onClick={async () => {
                setIsLoadingSuggestions(true);
                setSuggestions([]);
                try {
                  const response = await fetch('/api/instruction-suggest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      instructionTitle: title,
                      action,
                      channelName: channel.name,
                      channelDescription: channel.description,
                      aiConfig: {
                        provider: ai.provider,
                        apiKey: ai.apiKey,
                        model: ai.model,
                      },
                    }),
                  });
                  if (response.ok) {
                    const data = await response.json();
                    setSuggestions(data.suggestions || []);
                  }
                } catch (err) {
                  console.error('Failed to get suggestions:', err);
                } finally {
                  setIsLoadingSuggestions(false);
                }
              }}
              disabled={isLoadingSuggestions}
              className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoadingSuggestions ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Getting suggestions...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  Suggest instructions
                </>
              )}
            </button>
          )}

          <p className="mt-2 text-xs text-neutral-500">
            Be specific about what you want the AI to do.
          </p>
        </div>

        {/* Action Type - Radio buttons */}
        <fieldset>
          <legend className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            Action
          </legend>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="instruction-action"
                checked={action === 'generate'}
                onChange={() => setAction('generate')}
                onBlur={handleFieldBlur}
                className="mt-1 h-4 w-4 text-violet-600 border-neutral-300 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Generate new cards
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Create new cards in the target column(s) based on your instructions.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="instruction-action"
                checked={action === 'modify'}
                onChange={() => setAction('modify')}
                onBlur={handleFieldBlur}
                className="mt-1 h-4 w-4 text-violet-600 border-neutral-300 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Modify existing cards
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Update the title and content of cards already in the target column(s).
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="instruction-action"
                checked={action === 'move'}
                onChange={() => setAction('move')}
                onBlur={handleFieldBlur}
                className="mt-1 h-4 w-4 text-violet-600 border-neutral-300 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Move cards
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Move cards between columns based on criteria you define.
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Card Count (for generate action) */}
        {action === 'generate' && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Number of cards to generate
            </label>
            <Input
              type="number"
              value={cardCount}
              onChange={(e) => setCardCount(parseInt(e.target.value) || 5)}
              onBlur={handleFieldBlur}
              min={1}
              max={20}
              className="w-24"
            />
          </div>
        )}

        {/* Destination Columns - contextual based on action */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            {action === 'generate' ? 'Add to column(s)' : action === 'modify' ? 'Modify cards in' : 'Move cards from'}
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            {action === 'generate'
              ? 'Where should new cards be created?'
              : action === 'modify'
                ? 'Which column\'s cards should be modified?'
                : 'Which column\'s cards should the AI consider moving?'}
          </p>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
              className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-left focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
            >
              <span className={selectedColumnIds.length === 0 ? 'text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}>
                {getColumnSelectorText()}
              </span>
              <svg className={`h-4 w-4 text-neutral-400 transition-transform ${isColumnDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isColumnDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <div className="p-2 border-b border-neutral-100 dark:border-neutral-700">
                  <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700">
                    <input
                      type="checkbox"
                      checked={selectedColumnIds.length === channel.columns.length}
                      onChange={handleSelectAllColumns}
                      className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
                    />
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Select all
                    </span>
                  </label>
                </div>
                <div className="p-2 max-h-48 overflow-y-auto">
                  {channel.columns.map((col) => (
                    <label key={col.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700">
                      <input
                        type="checkbox"
                        checked={selectedColumnIds.includes(col.id)}
                        onChange={() => handleColumnToggle(col.id)}
                        className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        {col.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Awareness - What columns AI sees */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            AI sees
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            What existing cards should the AI reference for context?
          </p>

          {/* All columns toggle */}
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={contextAllColumns}
              onChange={(e) => {
                setContextAllColumns(e.target.checked);
                if (e.target.checked) {
                  setContextColumnIds([]);
                }
              }}
              className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Include all columns
            </span>
          </label>

          {/* Column selector (only shown when not "all") */}
          {!contextAllColumns && (
            <div className="relative" ref={contextDropdownRef}>
              <button
                type="button"
                onClick={() => setIsContextDropdownOpen(!isContextDropdownOpen)}
                className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-left focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
              >
                <span className={contextColumnIds.length === 0 ? 'text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}>
                  {getContextSelectorText()}
                </span>
                <svg className={`h-4 w-4 text-neutral-400 transition-transform ${isContextDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isContextDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                  <div className="p-2 border-b border-neutral-100 dark:border-neutral-700">
                    <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700">
                      <input
                        type="checkbox"
                        checked={contextColumnIds.length === channel.columns.length}
                        onChange={handleSelectAllContextColumns}
                        className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
                      />
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Select all
                      </span>
                    </label>
                  </div>
                  <div className="p-2 max-h-48 overflow-y-auto">
                    {channel.columns.map((col) => (
                      <label key={col.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700">
                        <input
                          type="checkbox"
                          checked={contextColumnIds.includes(col.id)}
                          onChange={() => handleContextColumnToggle(col.id)}
                          className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600"
                        />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {col.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Automatic Execution Settings */}
        <AutomaticModeSettings
          triggers={triggers}
          safeguards={safeguards}
          isEnabled={isEnabled}
          channel={channel}
          onTriggersChange={(t) => {
            setTriggers(t);
            // Pass new triggers directly to avoid stale state
            setTimeout(() => handleSave({ triggers: t }), 0);
          }}
          onSafeguardsChange={(s) => {
            setSafeguards(s);
            // Pass new safeguards directly to avoid stale state
            setTimeout(() => handleSave({ safeguards: s }), 0);
          }}
          onEnabledChange={(e) => {
            setIsEnabled(e);
            // Sync runMode with isEnabled
            const newRunMode = e ? 'automatic' : 'manual';
            setRunMode(newRunMode);
            // Pass both values directly to avoid stale state
            setTimeout(() => handleSave({ isEnabled: e }), 0);
          }}
        />

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleDuplicate}>
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
              Delete
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
