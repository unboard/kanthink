'use client';

import { useState, useEffect, useRef } from 'react';
import type { Column } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Drawer } from '@/components/ui';

interface ColumnDetailDrawerProps {
  column: Column | null;
  channelId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ColumnDetailDrawer({
  column,
  channelId,
  isOpen,
  onClose,
}: ColumnDetailDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isDescriptionDirty, setIsDescriptionDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateColumn = useStore((s) => s.updateColumn);
  const setColumnInstructions = useStore((s) => s.setColumnInstructions);
  const channels = useStore((s) => s.channels);

  const ai = useSettingsStore((s) => s.ai);

  const channel = channels[channelId];

  useEffect(() => {
    if (column) {
      setName(column.name);
      setDescription(column.instructions || '');
      setIsNameDirty(false);
      setIsDescriptionDirty(false);
      setSuggestions([]);
    }
  }, [column]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(80, textarea.scrollHeight)}px`;
    }
  }, [description]);

  const handleNameChange = (newName: string) => {
    setName(newName);
    setIsNameDirty(true);
  };

  const handleDescriptionChange = (newDescription: string) => {
    setDescription(newDescription);
    setIsDescriptionDirty(true);
  };

  const handleSave = () => {
    if (!column) return;

    if (isNameDirty && name.trim()) {
      updateColumn(channelId, column.id, { name: name.trim() });
      setIsNameDirty(false);
    }

    if (isDescriptionDirty) {
      setColumnInstructions(channelId, column.id, description.trim());
      setIsDescriptionDirty(false);
    }
  };

  const handleClose = () => {
    handleSave();
    onClose();
  };

  const handleSuggestDescriptions = async () => {
    if (!column || !channel) return;

    setIsLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const response = await fetch('/api/column-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnName: column.name,
          channelName: channel.name,
          channelDescription: channel.description,
          channelInstructions: channel.aiInstructions,
          otherColumns: channel.columns
            .filter(c => c.id !== column.id)
            .map(c => ({ name: c.name, description: c.instructions })),
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
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setDescription(suggestion);
    setIsDescriptionDirty(true);
    setSuggestions([]);
  };

  if (!column || !channel) return null;

  const hasUnsavedChanges = isNameDirty || isDescriptionDirty;

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="md" floating>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 pt-12 pb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full text-xl font-semibold text-neutral-900 dark:text-white bg-transparent border-none outline-none placeholder-neutral-400"
            placeholder="Column name"
          />

          {column.isAiTarget && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              AI Target
            </span>
          )}
        </div>

        {/* Description */}
        <div className="p-6">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Description
          </label>

          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder="What is this column for?"
            className="w-full min-h-[80px] px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
          />

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-neutral-500">Suggestions:</p>
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-violet-300 dark:hover:border-violet-600 text-sm text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Suggest button */}
          {!description && suggestions.length === 0 && (
            <button
              onClick={handleSuggestDescriptions}
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
                  Suggest descriptions
                </>
              )}
            </button>
          )}

          {/* Save indicator */}
          {hasUnsavedChanges && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
              <button
                onClick={handleClose}
                className="text-xs px-3 py-1.5 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
