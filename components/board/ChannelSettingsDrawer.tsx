'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { Channel, ChannelStatus, InstructionCard, Card, Task } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Button, Input, Textarea, Drawer } from '@/components/ui';
import { InstructionGuide, type GuideResult } from '@/components/guide/InstructionGuide';
import { SharePanel } from '@/components/sharing/SharePanel';
import { useServerSync } from '@/components/providers/ServerSyncProvider';

// Export format that's portable (uses column names instead of IDs)
interface ChannelExport {
  name: string;
  description: string;
  aiInstructions: string;
  columns: Array<{
    name: string;
    instructions?: string;
    isAiTarget?: boolean;
  }>;
  instructionCards: Array<{
    title: string;
    instructions: string;
    action: 'generate' | 'modify' | 'move';
    targetColumnName: string;
    contextColumnNames?: string[];
    runMode: 'manual' | 'automatic';
    cardCount?: number;
  }>;
  cards?: Array<{
    title: string;
    columnName: string;
    messages: Array<{ type: 'note' | 'question' | 'ai_response'; content: string }>;
    tasks?: Array<{ title: string; description: string; status: 'not_started' | 'in_progress' | 'done' }>;
  }>;
}

function generateExport(
  channel: Channel,
  instructionCards: Record<string, InstructionCard>,
  allCards: Record<string, Card>,
  allTasks: Record<string, Task>
): ChannelExport {
  const columnIdToName = new Map(channel.columns.map(col => [col.id, col.name]));

  const columnsExport = channel.columns.map(col => ({
    name: col.name,
    ...(col.instructions ? { instructions: col.instructions } : {}),
    ...(col.isAiTarget ? { isAiTarget: true } : {}),
  }));

  const instructionCardIds = channel.instructionCardIds || [];
  const instructionCardsExport = instructionCardIds
    .map(id => instructionCards[id])
    .filter(Boolean)
    .map(card => {
      let targetColumnName = 'Inbox';
      if (card.target.type === 'column') {
        targetColumnName = columnIdToName.get(card.target.columnId) || 'Inbox';
      } else if (card.target.type === 'columns' && card.target.columnIds.length > 0) {
        targetColumnName = columnIdToName.get(card.target.columnIds[0]) || 'Inbox';
      }

      let contextColumnNames: string[] | undefined;
      if (card.contextColumns?.type === 'columns') {
        contextColumnNames = card.contextColumns.columnIds
          .map(id => columnIdToName.get(id))
          .filter((name): name is string => Boolean(name));
      }

      return {
        title: card.title,
        instructions: card.instructions,
        action: card.action,
        targetColumnName,
        ...(contextColumnNames?.length ? { contextColumnNames } : {}),
        runMode: card.runMode,
        ...(card.cardCount ? { cardCount: card.cardCount } : {}),
      };
    });

  const cardsExport: ChannelExport['cards'] = [];
  for (const column of channel.columns) {
    for (const cardId of column.cardIds) {
      const card = allCards[cardId];
      if (!card) continue;

      const cardTasks = (card.taskIds || [])
        .map(taskId => allTasks[taskId])
        .filter(Boolean)
        .map(task => ({
          title: task.title,
          description: task.description,
          status: task.status,
        }));

      cardsExport.push({
        title: card.title,
        columnName: column.name,
        messages: card.messages.map(msg => ({
          type: msg.type,
          content: msg.content,
        })),
        ...(cardTasks.length > 0 ? { tasks: cardTasks } : {}),
      });
    }
  }

  return {
    name: channel.name,
    description: channel.description,
    aiInstructions: channel.aiInstructions,
    columns: columnsExport,
    instructionCards: instructionCardsExport,
    ...(cardsExport.length > 0 ? { cards: cardsExport } : {}),
  };
}

interface ChannelSettingsDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

export function ChannelSettingsDrawer({ channel, isOpen, onClose }: ChannelSettingsDrawerProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { isServerMode } = useServerSync();
  const updateChannel = useStore((s) => s.updateChannel);
  const deleteChannel = useStore((s) => s.deleteChannel);
  const addInstructionRevision = useStore((s) => s.addInstructionRevision);
  const instructionCards = useStore((s) => s.instructionCards);
  const allCards = useStore((s) => s.cards);
  const allTasks = useStore((s) => s.tasks);

  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description);
  const [status, setStatus] = useState<ChannelStatus>(channel.status);
  const [includeBacksideInAI, setIncludeBacksideInAI] = useState(channel.includeBacksideInAI ?? false);
  const [aiInstructions, setAiInstructions] = useState(channel.aiInstructions || '');
  const [showInstructionChat, setShowInstructionChat] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportTab, setExportTab] = useState<'export' | 'import'>('export');
  const [copied, setCopied] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const createChannelWithStructure = useStore((s) => s.createChannelWithStructure);
  const createCard = useStore((s) => s.createCard);
  const addMessage = useStore((s) => s.addMessage);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);

  // Sync form state when drawer opens or channel changes
  useEffect(() => {
    if (isOpen) {
      setName(channel.name);
      setDescription(channel.description);
      setStatus(channel.status);
      setIncludeBacksideInAI(channel.includeBacksideInAI ?? false);
      setAiInstructions(channel.aiInstructions || '');
      setShowInstructionChat(false);
      setShowShare(false);
      setShowExport(false);
      setImportJson('');
      setImportError(null);
    }
  }, [channel.id, isOpen]);

  const handleSave = () => {
    if (aiInstructions.trim() !== (channel.aiInstructions || '')) {
      addInstructionRevision(channel.id, aiInstructions.trim(), 'user');
    }

    updateChannel(channel.id, {
      name: name.trim() || channel.name,
      description: description.trim(),
      status,
      includeBacksideInAI,
    });
  };

  const handleClose = () => {
    handleSave();
    onClose();
  };

  const handleGuideComplete = (result: GuideResult) => {
    setAiInstructions(result.instructions);
    addInstructionRevision(channel.id, result.instructions, 'ai-suggested');
    setShowInstructionChat(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this channel?')) {
      deleteChannel(channel.id);
      onClose();
      router.push('/');
    }
  };

  const handleImportCreate = () => {
    try {
      const data = JSON.parse(importJson);
      if (!data.name || !Array.isArray(data.columns)) {
        setImportError('Invalid format: missing name or columns');
        return;
      }

      const newChannel = createChannelWithStructure({
        name: data.name,
        description: data.description || '',
        aiInstructions: data.aiInstructions || '',
        columns: data.columns.map((col: { name: string; instructions?: string; isAiTarget?: boolean }) => ({
          name: col.name,
          description: col.instructions || '',
          isAiTarget: col.isAiTarget,
        })),
        instructionCards: data.instructionCards?.map((card: { title: string; instructions: string; action: string; targetColumnName: string; cardCount?: number }) => ({
          title: card.title,
          instructions: card.instructions,
          action: card.action,
          targetColumnName: card.targetColumnName,
          cardCount: card.cardCount,
        })) || [],
      });

      // Import cards if present
      if (data.cards && Array.isArray(data.cards)) {
        const columnNameToId = new Map(newChannel.columns.map((col: { id: string; name: string }) => [col.name, col.id]));
        const firstColumnId = newChannel.columns[0]?.id;

        for (const importedCard of data.cards) {
          const targetColumnId = columnNameToId.get(importedCard.columnName) || firstColumnId;
          if (!targetColumnId) continue;

          const firstNote = importedCard.messages?.find((m: { type: string }) => m.type === 'note' || m.type === 'ai_response');
          const card = createCard(
            newChannel.id,
            targetColumnId,
            { title: importedCard.title, initialMessage: firstNote?.content },
            'manual'
          );

          const startIndex = firstNote ? 1 : 0;
          for (let i = startIndex; i < (importedCard.messages?.length || 0); i++) {
            const msg = importedCard.messages[i];
            addMessage(card.id, msg.type, msg.content);
          }

          if (importedCard.tasks) {
            for (const task of importedCard.tasks) {
              const createdTask = createTask(newChannel.id, card.id, {
                title: task.title,
                description: task.description || '',
              });
              if (task.status !== 'not_started') {
                updateTask(createdTask.id, {
                  status: task.status,
                  ...(task.status === 'done' ? { completedAt: new Date().toISOString() } : {}),
                });
              }
            }
          }
        }
      }

      onClose();
      router.push(`/channel/${newChannel.id}`);
    } catch (e) {
      setImportError('Invalid JSON format');
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="md" floating title="Channel Settings">
      <div className="p-6 pt-12 space-y-6">
        {/* Channel name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Channel name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this channel about?"
          />
        </div>

        {/* Status */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ChannelStatus)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Include archived cards in AI */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBacksideInAI}
              onChange={(e) => setIncludeBacksideInAI(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 dark:border-neutral-600 dark:bg-neutral-800"
            />
            <div>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Include archived cards in AI context
              </span>
              <p className="text-xs text-neutral-500">
                When enabled, archived cards (backside of columns) will be included in the AI prompt for better context.
              </p>
            </div>
          </label>
        </div>

        {/* AI Instructions */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              AI Instructions
            </label>
            <button
              type="button"
              onClick={() => setShowInstructionChat(!showInstructionChat)}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {showInstructionChat ? 'Hide AI Chat' : 'Develop with AI'}
            </button>
          </div>
          <Textarea
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
            rows={4}
            placeholder="Tell the AI what kind of content to generate for this channel..."
            className="mb-2"
          />
          <p className="text-xs text-neutral-500 mb-4">
            These instructions guide the AI when generating cards for this channel.
          </p>

          {showInstructionChat && (
            <InstructionGuide
              channelName={channel.name}
              onComplete={handleGuideComplete}
              onCancel={() => setShowInstructionChat(false)}
            />
          )}
        </div>

        {/* Share Section - only show in server mode */}
        {isServerMode && session?.user && (
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setShowShare(!showShare)}
              className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showShare ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Share Channel
            </button>

            {showShare && (
              <div className="mt-3">
                <SharePanel channelId={channel.id} />
              </div>
            )}
          </div>
        )}

        {/* Export/Import Section */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setShowExport(!showExport)}
            className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showExport ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Export / Import Channel
          </button>

          {showExport && (
            <div className="mt-3 space-y-3">
              {/* Tabs */}
              <div className="flex gap-4 border-b border-neutral-200 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => setExportTab('export')}
                  className={`pb-2 text-sm font-medium transition-colors ${
                    exportTab === 'export'
                      ? 'text-neutral-900 dark:text-white border-b-2 border-neutral-900 dark:border-white -mb-px'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setExportTab('import')}
                  className={`pb-2 text-sm font-medium transition-colors ${
                    exportTab === 'import'
                      ? 'text-neutral-900 dark:text-white border-b-2 border-neutral-900 dark:border-white -mb-px'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  Import
                </button>
              </div>

              {exportTab === 'export' ? (
                <>
                  <p className="text-xs text-neutral-500">
                    Copy this JSON to back up your channel configuration including all cards and tasks.
                  </p>
                  <div className="relative">
                    <Textarea
                      value={JSON.stringify(generateExport(channel, instructionCards, allCards, allTasks), null, 2)}
                      readOnly
                      rows={10}
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(generateExport(channel, instructionCards, allCards, allTasks), null, 2));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </span>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-neutral-500">
                    Paste a channel export JSON to create a new channel with that configuration.
                  </p>
                  {importError && (
                    <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
                      <p className="text-xs text-red-700 dark:text-red-300">{importError}</p>
                    </div>
                  )}
                  <Textarea
                    value={importJson}
                    onChange={(e) => {
                      setImportJson(e.target.value);
                      setImportError(null);
                    }}
                    placeholder='Paste channel JSON here...'
                    rows={10}
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={handleImportCreate}
                    disabled={!importJson.trim()}
                  >
                    Create channel from import
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Delete channel */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete channel
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
