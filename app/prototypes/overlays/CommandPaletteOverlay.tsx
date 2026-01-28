'use client';

import { useState, useEffect, useRef } from 'react';

interface Suggestion {
  id: string;
  type: 'action' | 'template' | 'recent';
  label: string;
  description?: string;
  shortcut?: string;
  icon: React.ReactNode;
}

const suggestions: Suggestion[] = [
  {
    id: 'create',
    type: 'action',
    label: 'Create channel',
    description: 'Start a new blank channel',
    shortcut: 'Enter',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    id: 'reading',
    type: 'template',
    label: 'Reading List',
    description: 'Books and articles to read',
    icon: <span className="text-sm">📚</span>,
  },
  {
    id: 'learning',
    type: 'template',
    label: 'Learning Path',
    description: 'Courses and skills',
    icon: <span className="text-sm">🎓</span>,
  },
  {
    id: 'ideas',
    type: 'template',
    label: 'Idea Backlog',
    description: 'Project ideas',
    icon: <span className="text-sm">💡</span>,
  },
  {
    id: 'research',
    type: 'template',
    label: 'Research Feed',
    description: 'Research and notes',
    icon: <span className="text-sm">🔬</span>,
  },
];

interface CommandPaletteOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CommandPaletteOverlay({ isOpen, onClose, onCreate }: CommandPaletteOverlayProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on query
  const filteredSuggestions = query.trim()
    ? suggestions.filter(
        (s) =>
          s.label.toLowerCase().includes(query.toLowerCase()) ||
          s.description?.toLowerCase().includes(query.toLowerCase())
      )
    : suggestions;

  // Show "create with this name" option when typing a custom name
  const showCreateWithName = query.trim() && !filteredSuggestions.some(s => s.label.toLowerCase() === query.toLowerCase());

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const totalItems = filteredSuggestions.length + (showCreateWithName ? 1 : 0);

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % totalItems);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + totalItems) % totalItems);
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect(selectedIndex);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedIndex, filteredSuggestions, showCreateWithName, query]);

  const handleSelect = (index: number) => {
    // If create with custom name is shown and selected
    if (showCreateWithName && index === 0) {
      onCreate(query.trim());
      return;
    }

    const adjustedIndex = showCreateWithName ? index - 1 : index;
    const suggestion = filteredSuggestions[adjustedIndex];

    if (suggestion) {
      if (suggestion.type === 'action' && suggestion.id === 'create') {
        if (query.trim()) {
          onCreate(query.trim());
        } else {
          // Focus input if empty
          inputRef.current?.focus();
        }
      } else if (suggestion.type === 'template') {
        onCreate(suggestion.label);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Create a channel..."
            className="flex-1 bg-transparent text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none text-base"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {/* Create with custom name - shown first when typing */}
          {showCreateWithName && (
            <button
              onClick={() => onCreate(query.trim())}
              onMouseEnter={() => setSelectedIndex(0)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedIndex === 0
                  ? 'bg-violet-50 dark:bg-violet-900/20'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                selectedIndex === 0
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
              }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${
                  selectedIndex === 0 ? 'text-violet-900 dark:text-violet-100' : 'text-neutral-900 dark:text-white'
                }`}>
                  Create "{query.trim()}"
                </div>
                <div className="text-xs text-neutral-500">New channel</div>
              </div>
              {selectedIndex === 0 && (
                <kbd className="px-1.5 py-0.5 text-xs text-neutral-400 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
                  Enter
                </kbd>
              )}
            </button>
          )}

          {/* Suggestions */}
          {filteredSuggestions.map((suggestion, index) => {
            const actualIndex = showCreateWithName ? index + 1 : index;
            const isSelected = selectedIndex === actualIndex;

            return (
              <button
                key={suggestion.id}
                onClick={() => handleSelect(actualIndex)}
                onMouseEnter={() => setSelectedIndex(actualIndex)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-violet-50 dark:bg-violet-900/20'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isSelected
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                }`}>
                  {suggestion.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${
                    isSelected ? 'text-violet-900 dark:text-violet-100' : 'text-neutral-900 dark:text-white'
                  }`}>
                    {suggestion.label}
                  </div>
                  {suggestion.description && (
                    <div className="text-xs text-neutral-500 truncate">
                      {suggestion.description}
                    </div>
                  )}
                </div>
                {isSelected && suggestion.shortcut && (
                  <kbd className="px-1.5 py-0.5 text-xs text-neutral-400 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
                    {suggestion.shortcut}
                  </kbd>
                )}
                {suggestion.type === 'template' && (
                  <span className="text-xs text-neutral-400 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">
                    template
                  </span>
                )}
              </button>
            );
          })}

          {/* No results */}
          {filteredSuggestions.length === 0 && !showCreateWithName && (
            <div className="px-4 py-8 text-center text-neutral-500">
              No matching templates
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-4 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">Enter</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
