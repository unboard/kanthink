'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui';
import { InstructionGuide, type GuideResult, type ChannelStructure } from './InstructionGuide';
import { isAIConfigured } from '@/lib/settingsStore';

// Exported card data format
interface ImportedCard {
  title: string;
  columnName: string;
  messages: Array<{ type: 'note' | 'question' | 'ai_response'; content: string }>;
  tasks?: Array<{ title: string; description: string; status: 'not_started' | 'in_progress' | 'done' }>;
}

// Import format (matches export from ChannelSettings)
interface ChannelImport {
  name: string;
  description: string;
  aiInstructions: string;
  columns: Array<{
    name: string;
    instructions?: string;
    isAiTarget?: boolean;
  }>;
  instructionCards?: Array<{
    title: string;
    instructions: string;
    action: 'generate' | 'modify' | 'move';
    targetColumnName: string;
    contextColumnNames?: string[];
    runMode: 'manual' | 'automatic';
    cardCount?: number;
  }>;
  cards?: ImportedCard[];
}

function parseImportJson(json: string): ChannelImport | null {
  try {
    const data = JSON.parse(json);
    // Basic validation
    if (!data.name || typeof data.name !== 'string') return null;
    if (!Array.isArray(data.columns)) return null;
    return data as ChannelImport;
  } catch {
    return null;
  }
}

// Cards to import after channel creation
export interface ImportedCardsData {
  cards: ImportedCard[];
}

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChannel: (data: {
    name: string;
    description: string;
    aiInstructions: string;
    structure?: ChannelStructure;
    importedCards?: ImportedCardsData;
  }) => void;
}

export function CreateChannelModal({
  isOpen,
  onClose,
  onCreateChannel,
}: CreateChannelModalProps) {
  const [mode, setMode] = useState<'guide' | 'manual' | 'import' | 'import-confirm'>('guide');
  const [manualName, setManualName] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedImport, setParsedImport] = useState<ChannelImport | null>(null);
  const [includeCards, setIncludeCards] = useState(true);
  const aiConfigured = isAIConfigured();

  const handleGuideComplete = (result: GuideResult) => {
    onCreateChannel({
      name: result.channelName,
      description: result.channelDescription,
      aiInstructions: result.instructions,
      structure: result.structure,
    });
    handleClose();
  };

  const handleManualCreate = () => {
    if (!manualName.trim()) return;
    onCreateChannel({
      name: manualName.trim(),
      description: '',
      aiInstructions: '',
    });
    handleClose();
  };

  const handleImportParse = () => {
    const data = parseImportJson(importJson);
    if (!data) {
      setImportError('Invalid JSON format. Please paste a valid channel export.');
      return;
    }

    setParsedImport(data);

    // If there are cards, show confirmation step
    if (data.cards && data.cards.length > 0) {
      setMode('import-confirm');
    } else {
      // No cards, create directly
      handleImportCreate(data, false);
    }
  };

  const handleImportCreate = (data: ChannelImport, withCards: boolean) => {
    // Convert import format to ChannelStructure
    const structure: ChannelStructure = {
      channelName: data.name,
      channelDescription: data.description || '',
      instructions: data.aiInstructions || '',
      columns: data.columns.map(col => ({
        name: col.name,
        description: col.instructions || '',
        isAiTarget: col.isAiTarget,
      })),
      instructionCards: data.instructionCards?.map(card => ({
        title: card.title,
        instructions: card.instructions,
        action: card.action,
        targetColumnName: card.targetColumnName,
        cardCount: card.cardCount,
      })) || [],
    };

    onCreateChannel({
      name: data.name,
      description: data.description || '',
      aiInstructions: data.aiInstructions || '',
      structure,
      importedCards: withCards && data.cards ? { cards: data.cards } : undefined,
    });
    handleClose();
  };

  const handleClose = () => {
    setMode('guide');
    setManualName('');
    setImportJson('');
    setImportError(null);
    setParsedImport(null);
    setIncludeCards(true);
    onClose();
  };

  // If AI not configured, allow manual or import mode only
  const effectiveMode = aiConfigured ? mode : (mode === 'import' || mode === 'import-confirm' ? mode : 'manual');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      size="lg"
    >
      <div className="min-h-[280px]">
        {effectiveMode === 'guide' ? (
          <div className="relative">
            {/* Guide content */}
            <InstructionGuide
              onComplete={handleGuideComplete}
              onCancel={() => setMode('manual')}
            />
            {/* Import link in bottom right */}
            <button
              type="button"
              onClick={() => setMode('import')}
              className="absolute bottom-4 right-6 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              Import JSON
            </button>
          </div>
        ) : effectiveMode === 'import' ? (
          <>
            {/* Import mode */}
            <div className="p-6">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                Import channel
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                Paste a channel configuration JSON to recreate the channel structure.
              </p>

              {importError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
                  <p className="text-sm text-red-700 dark:text-red-300">{importError}</p>
                </div>
              )}

              <textarea
                value={importJson}
                onChange={(e) => {
                  setImportJson(e.target.value);
                  setImportError(null);
                }}
                placeholder='{"name": "My Channel", "columns": [...], ...}'
                autoFocus
                rows={8}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 transition-colors font-mono text-sm"
              />

              <div className="mt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
                >
                  Create manually
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportParse}
                    disabled={!importJson.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : effectiveMode === 'import-confirm' && parsedImport ? (
          <>
            {/* Import confirmation - cards found */}
            <div className="p-6">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                Import "{parsedImport.name}"
              </h2>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {parsedImport.columns.length} columns
                </div>
                {parsedImport.instructionCards && parsedImport.instructionCards.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {parsedImport.instructionCards.length} actions
                  </div>
                )}
                {parsedImport.cards && parsedImport.cards.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {parsedImport.cards.length} content cards
                  </div>
                )}
              </div>

              {parsedImport.cards && parsedImport.cards.length > 0 && (
                <div className="mb-6 p-4 rounded-md bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                    This backup includes {parsedImport.cards.length} cards with content
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="includeCards"
                        checked={includeCards}
                        onChange={() => setIncludeCards(true)}
                        className="w-4 h-4 text-neutral-900 dark:text-white"
                      />
                      <div>
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          Import cards
                        </span>
                        <p className="text-xs text-neutral-500">Cards will be placed in their original columns</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="includeCards"
                        checked={!includeCards}
                        onChange={() => setIncludeCards(false)}
                        className="w-4 h-4 text-neutral-900 dark:text-white"
                      />
                      <div>
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          Skip cards
                        </span>
                        <p className="text-xs text-neutral-500">Only import channel structure and settings</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setMode('import')}
                  className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
                >
                  Back
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportCreate(parsedImport, includeCards)}
                    className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-md transition-colors"
                  >
                    Create channel
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Manual mode */}
            <div className="p-6">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
                Create channel
              </h2>

              {!aiConfigured && (
                <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Configure your AI API key in settings to use the guided setup.
                  </p>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleManualCreate();
                }}
              >
                <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                  Channel name
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g., Book Recommendations"
                  autoFocus
                  className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 transition-colors"
                />

                <div className="mt-6 flex justify-between items-center">
                  <div className="flex gap-3">
                    {aiConfigured && (
                      <button
                        type="button"
                        onClick={() => setMode('guide')}
                        className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
                      >
                        Guided setup
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMode('import')}
                      className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
                    >
                      Import backup
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!manualName.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
