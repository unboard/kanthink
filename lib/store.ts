import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { ID, Channel, Card, ChannelInput, CardInput, Column, ChannelQuestion, InstructionRevision, SuggestionMode, PropertyDefinition, CardProperty, PropertyDisplayType, InstructionCard, InstructionCardInput, InstructionAction, InstructionRunMode, Task, TaskInput, TaskStatus, CardMessage, CardMessageType, AIOperation, AIOperationContext, Folder, TagDefinition, InstructionRun, CardChange } from './types';
import { DEFAULT_COLUMN_NAMES, STORAGE_KEY } from './constants';
import { KANTHINK_IDEAS_CHANNEL, KANTHINK_DEV_CHANNEL, type SeedChannelTemplate } from './seedData';
import { emitCardMoved, emitCardCreated, emitCardDeleted } from './automationEvents';
import * as sync from './api/sync';

// Module-level abort controller (not stored in Zustand - can't be serialized)
let currentAbortController: AbortController | null = null;

// Get current abort signal for AI operations
export function getAIAbortSignal(): AbortSignal | undefined {
  return currentAbortController?.signal;
}

// Config for AI-powered channel promotion
export interface PromoteConfig {
  channelName?: string;
  description?: string;
  aiInstructions?: string;
  columns?: Array<{ name: string; isAiTarget?: boolean }>;
  starterInstructions?: Array<{
    title: string;
    instructions: string;
    action: InstructionAction;
    targetColumnName: string;
    runMode: InstructionRunMode;
    cardCount?: number;
  }>;
}

interface KanthinkState {
  channels: Record<ID, Channel>;
  cards: Record<ID, Card>;
  tasks: Record<ID, Task>;
  instructionCards: Record<ID, InstructionCard>;
  folders: Record<ID, Folder>;
  folderOrder: ID[];
  channelOrder: ID[];  // Channels not in any folder
  aiOperation: AIOperation;
  generatingSkeletons: Record<ID, number>;  // columnId -> skeleton count
  instructionRuns: Record<ID, InstructionRun>;  // runId -> run info for undo
  _hasHydrated: boolean;

  // Folder actions
  createFolder: (name: string) => Folder;
  updateFolder: (id: ID, updates: Partial<Omit<Folder, 'id' | 'createdAt'>>) => void;
  deleteFolder: (id: ID) => void;
  reorderFolders: (fromIndex: number, toIndex: number) => void;
  moveChannelToFolder: (channelId: ID, folderId: ID | null) => void;
  toggleFolderCollapse: (folderId: ID) => void;
  reorderChannelInFolder: (folderId: ID, fromIndex: number, toIndex: number) => void;

  // Channel actions
  createChannel: (input: ChannelInput) => Channel;
  createChannelWithStructure: (input: {
    name: string;
    description: string;
    aiInstructions: string;
    columns: Array<{ name: string; description?: string; isAiTarget?: boolean }>;
    instructionCards: Array<{
      title: string;
      instructions: string;
      action: 'generate' | 'modify' | 'move';
      targetColumnName: string;
      cardCount?: number;
    }>;
  }) => Channel;
  updateChannel: (id: ID, updates: Partial<Omit<Channel, 'id' | 'createdAt'>>) => void;
  deleteChannel: (id: ID) => void;
  reorderChannels: (fromIndex: number, toIndex: number) => void;

  // Column actions
  createColumn: (channelId: ID, name: string) => Column | null;
  updateColumn: (channelId: ID, columnId: ID, updates: Partial<Omit<Column, 'id' | 'cardIds'>>) => void;
  deleteColumn: (channelId: ID, columnId: ID) => void;
  reorderColumns: (channelId: ID, fromIndex: number, toIndex: number) => void;
  setColumnInstructions: (channelId: ID, columnId: ID, instructions: string) => void;

  // Card actions
  createCard: (channelId: ID, columnId: ID, input: CardInput, source?: 'manual' | 'ai', createdByInstructionId?: ID) => Card;
  updateCard: (id: ID, updates: Partial<Omit<Card, 'id' | 'channelId' | 'createdAt' | 'source'>>) => void;
  deleteCard: (id: ID) => void;
  deleteAllCardsInColumn: (channelId: ID, columnId: ID) => void;
  moveCard: (cardId: ID, toColumnId: ID, toIndex: number) => void;
  archiveCard: (cardId: ID) => void;
  unarchiveCard: (cardId: ID) => void;
  setCardTasksHidden: (cardId: ID, hidden: boolean) => void;

  // Card message actions
  addMessage: (cardId: ID, type: CardMessageType, content: string, imageUrls?: string[]) => CardMessage | null;
  addAIResponse: (cardId: ID, questionId: ID, content: string) => CardMessage | null;
  editMessage: (cardId: ID, messageId: ID, content: string) => void;
  deleteMessage: (cardId: ID, messageId: ID) => void;
  setCardSummary: (cardId: ID, summary: string) => void;
  setCoverImage: (cardId: ID, url: string | null) => void;

  // Task actions
  createTask: (channelId: ID, cardId: ID | null, input: TaskInput) => Task;
  updateTask: (id: ID, updates: Partial<Omit<Task, 'id' | 'channelId' | 'cardId' | 'createdAt'>>) => void;
  deleteTask: (id: ID) => void;
  completeTask: (id: ID) => void;
  toggleTaskStatus: (id: ID) => void;
  reorderTasks: (cardId: ID, fromIndex: number, toIndex: number) => void;
  reorderUnlinkedTasks: (channelId: ID, fromIndex: number, toIndex: number) => void;

  // Question actions
  addQuestion: (channelId: ID, question: Omit<ChannelQuestion, 'id' | 'createdAt'>) => void;
  answerQuestion: (channelId: ID, questionId: ID, answer: string) => void;
  dismissQuestion: (channelId: ID, questionId: ID) => void;

  // Instruction history actions
  addInstructionRevision: (channelId: ID, instructions: string, source: 'user' | 'ai-suggested' | 'ai-auto') => void;
  rollbackInstruction: (channelId: ID, revisionId: ID) => void;
  setSuggestionMode: (channelId: ID, mode: SuggestionMode) => void;

  // Property actions
  addPropertyDefinition: (channelId: ID, definition: Omit<PropertyDefinition, 'id'>) => PropertyDefinition;
  removePropertyDefinition: (channelId: ID, propertyId: ID) => void;
  setCardProperty: (cardId: ID, key: string, value: string, displayType: PropertyDisplayType, color?: string) => void;
  removeCardProperty: (cardId: ID, key: string) => void;
  setCardProcessing: (cardId: ID, isProcessing: boolean, status?: string) => void;
  setCardProperties: (cardId: ID, properties: CardProperty[]) => void;
  recordInstructionRun: (cardId: ID, instructionId: ID) => void;
  clearInstructionRun: (cardId: ID, instructionId: ID) => void;

  // Tag actions
  addTagDefinition: (channelId: ID, name: string, color: string) => TagDefinition;
  updateTagDefinition: (channelId: ID, tagId: ID, updates: { name?: string; color?: string }) => void;
  removeTagDefinition: (channelId: ID, tagId: ID) => void;
  addTagToCard: (cardId: ID, tagName: string) => void;
  removeTagFromCard: (cardId: ID, tagName: string) => void;

  // Instruction card actions
  createInstructionCard: (channelId: ID, input: InstructionCardInput) => InstructionCard;
  updateInstructionCard: (id: ID, updates: Partial<Omit<InstructionCard, 'id' | 'channelId' | 'createdAt'>>) => void;
  deleteInstructionCard: (id: ID) => void;
  duplicateInstructionCard: (id: ID) => InstructionCard | null;
  reorderInstructionCards: (channelId: ID, fromIndex: number, toIndex: number) => void;

  // Seed and promote actions
  seedInitialChannel: () => void;
  seedDevChannel: (initialCards?: Array<{ title: string; content: string }>) => Channel | null;
  promoteCardToChannel: (cardId: ID, config?: PromoteConfig) => Channel | null;

  // AI operation actions
  startAIOperation: (status: string, context?: AIOperationContext) => void;
  updateAIStatus: (status: string) => void;
  cancelAIOperation: () => void;
  completeAIOperation: () => void;
  setInstructionRunning: (instructionId: ID, isRunning: boolean) => void;

  // Instruction undo actions
  saveInstructionRun: (run: Omit<InstructionRun, 'id'>) => ID;
  undoInstructionRun: (runId: ID) => void;
  getInstructionRuns: (instructionId: ID) => InstructionRun[];

  // Skeleton loading actions
  setGeneratingSkeletons: (columnId: ID, count: number) => void;
  clearGeneratingSkeletons: (columnId: ID) => void;

  // Hydration
  setHasHydrated: (state: boolean) => void;

  // Server sync
  loadFromServer: (data: ServerData) => void;
  clearLocalData: () => void;
  getLocalDataForMigration: () => LocalStorageExport | null;
}

// Types for server sync
export interface ServerData {
  channels: Record<ID, Channel>;
  cards: Record<ID, Card>;
  tasks: Record<ID, Task>;
  instructionCards: Record<ID, InstructionCard>;
  folders: Record<ID, Folder>;
  folderOrder: ID[];
  channelOrder: ID[];
}

export interface LocalStorageExport {
  channels: Record<ID, Channel>;
  cards: Record<ID, Card>;
  tasks: Record<ID, Task>;
  instructionCards: Record<ID, InstructionCard>;
  folders: Record<ID, Folder>;
  folderOrder: ID[];
  channelOrder: ID[];
}

function createDefaultColumns(): Column[] {
  return DEFAULT_COLUMN_NAMES.map((name, index) => ({
    id: nanoid(),
    name,
    cardIds: [],
    isAiTarget: index === 0, // First column (Inbox) is AI target by default
  }));
}

function now(): string {
  return new Date().toISOString();
}

export const useStore = create<KanthinkState>()(
  persist(
    (set, get) => ({
      channels: {},
      cards: {},
      tasks: {},
      instructionCards: {},
      folders: {},
      folderOrder: [],
      channelOrder: [],
      aiOperation: { isActive: false, status: '', runningInstructionIds: [] },
      generatingSkeletons: {},
      instructionRuns: {},
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Server sync actions
      loadFromServer: (data) => {
        set({
          channels: data.channels,
          cards: data.cards,
          tasks: data.tasks,
          instructionCards: data.instructionCards,
          folders: data.folders,
          folderOrder: data.folderOrder,
          channelOrder: data.channelOrder,
          _hasHydrated: true,
        });
      },

      clearLocalData: () => {
        set({
          channels: {},
          cards: {},
          tasks: {},
          instructionCards: {},
          folders: {},
          folderOrder: [],
          channelOrder: [],
          instructionRuns: {},
        });
      },

      getLocalDataForMigration: () => {
        const state = get();
        if (Object.keys(state.channels).length === 0) {
          return null;
        }
        return {
          channels: state.channels,
          cards: state.cards,
          tasks: state.tasks,
          instructionCards: state.instructionCards,
          folders: state.folders,
          folderOrder: state.folderOrder,
          channelOrder: state.channelOrder,
        };
      },

      // Folder actions
      createFolder: (name) => {
        const id = nanoid();
        const timestamp = now();
        const folder: Folder = {
          id,
          name,
          channelIds: [],
          isCollapsed: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          folders: { ...state.folders, [id]: folder },
          folderOrder: [...state.folderOrder, id],
        }));

        // Sync to server
        sync.syncFolderCreate(id, name);

        return folder;
      },

      updateFolder: (id, updates) => {
        set((state) => {
          const folder = state.folders[id];
          if (!folder) return state;

          return {
            folders: {
              ...state.folders,
              [id]: { ...folder, ...updates, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncFolderUpdate(id, updates);
      },

      deleteFolder: (id) => {
        set((state) => {
          const folder = state.folders[id];
          if (!folder) return state;

          // Move all channels in folder back to root channelOrder
          const newChannelOrder = [...state.channelOrder, ...folder.channelIds];

          const { [id]: _, ...remainingFolders } = state.folders;
          return {
            folders: remainingFolders,
            folderOrder: state.folderOrder.filter((fid) => fid !== id),
            channelOrder: newChannelOrder,
          };
        });

        // Sync to server
        sync.syncFolderDelete(id);
      },

      reorderFolders: (fromIndex, toIndex) => {
        const folderId = get().folderOrder[fromIndex];
        set((state) => {
          const newOrder = [...state.folderOrder];
          const [moved] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, moved);
          return { folderOrder: newOrder };
        });

        // Sync to server
        if (folderId) {
          sync.syncReorderFolders(folderId, fromIndex, toIndex);
        }
      },

      moveChannelToFolder: (channelId, folderId) => {
        set((state) => {
          // Remove from current location (either root or another folder)
          let newChannelOrder = state.channelOrder.filter((id) => id !== channelId);
          const newFolders = { ...state.folders };

          // Remove from any existing folder
          for (const [fid, folder] of Object.entries(newFolders)) {
            if (folder.channelIds.includes(channelId)) {
              newFolders[fid] = {
                ...folder,
                channelIds: folder.channelIds.filter((id) => id !== channelId),
                updatedAt: now(),
              };
            }
          }

          // Add to new location
          if (folderId && newFolders[folderId]) {
            newFolders[folderId] = {
              ...newFolders[folderId],
              channelIds: [...newFolders[folderId].channelIds, channelId],
              updatedAt: now(),
            };
          } else {
            // Moving to root
            newChannelOrder = [...newChannelOrder, channelId];
          }

          return { folders: newFolders, channelOrder: newChannelOrder };
        });

        // Sync to server
        sync.syncMoveChannelToFolder(channelId, folderId);
      },

      toggleFolderCollapse: (folderId) => {
        set((state) => {
          const folder = state.folders[folderId];
          if (!folder) return state;

          return {
            folders: {
              ...state.folders,
              [folderId]: { ...folder, isCollapsed: !folder.isCollapsed },
            },
          };
        });
      },

      reorderChannelInFolder: (folderId, fromIndex, toIndex) => {
        const folder = get().folders[folderId];
        const channelId = folder?.channelIds[fromIndex];

        set((state) => {
          const folder = state.folders[folderId];
          if (!folder) return state;

          const newChannelIds = [...folder.channelIds];
          const [moved] = newChannelIds.splice(fromIndex, 1);
          newChannelIds.splice(toIndex, 0, moved);

          return {
            folders: {
              ...state.folders,
              [folderId]: { ...folder, channelIds: newChannelIds, updatedAt: now() },
            },
          };
        });

        // Sync to server
        if (channelId) {
          sync.syncReorderChannelInFolder(channelId, folderId, fromIndex, toIndex);
        }
      },

      createChannel: (input) => {
        const id = nanoid();
        const timestamp = now();
        const columns = createDefaultColumns();
        const channel: Channel = {
          id,
          name: input.name,
          description: input.description ?? '',
          status: 'active',
          aiInstructions: input.aiInstructions ?? '',
          instructionCardIds: [],
          columns,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          channels: { ...state.channels, [id]: channel },
          channelOrder: [...state.channelOrder, id],
        }));

        // Sync to server
        sync.syncChannelCreate(id, {
          name: input.name,
          description: input.description,
          aiInstructions: input.aiInstructions,
          columnNames: columns.map(c => c.name),
        });

        return channel;
      },

      createChannelWithStructure: (input) => {
        const channelId = nanoid();
        const timestamp = now();

        // Create columns with IDs
        const columns: Column[] = input.columns.map((col) => ({
          id: nanoid(),
          name: col.name,
          cardIds: [],
          isAiTarget: col.isAiTarget ?? false,
        }));

        // Create instruction cards
        const instructionCardIds: ID[] = [];
        const newInstructionCards: Record<ID, InstructionCard> = {};

        for (const ic of input.instructionCards) {
          const icId = nanoid();
          const targetColumn = columns.find((c) => c.name === ic.targetColumnName);

          const instructionCard: InstructionCard = {
            id: icId,
            channelId,
            title: ic.title,
            instructions: ic.instructions,
            action: ic.action,
            target: targetColumn
              ? { type: 'column', columnId: targetColumn.id }
              : { type: 'board' },
            runMode: 'manual',
            cardCount: ic.cardCount,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          instructionCardIds.push(icId);
          newInstructionCards[icId] = instructionCard;
        }

        const channel: Channel = {
          id: channelId,
          name: input.name,
          description: input.description,
          status: 'active',
          aiInstructions: input.aiInstructions,
          instructionCardIds,
          columns,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          channels: { ...state.channels, [channelId]: channel },
          instructionCards: { ...state.instructionCards, ...newInstructionCards },
          channelOrder: [...state.channelOrder, channelId],
        }));

        return channel;
      },

      updateChannel: (id, updates) => {
        set((state) => {
          const channel = state.channels[id];
          if (!channel) return state;

          return {
            channels: {
              ...state.channels,
              [id]: { ...channel, ...updates, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncChannelUpdate(id, updates);
      },

      deleteChannel: (id) => {
        set((state) => {
          const { [id]: deleted, ...remainingChannels } = state.channels;
          if (!deleted) return state;

          // Also delete all cards belonging to this channel
          const remainingCards: Record<ID, Card> = {};
          for (const [cardId, card] of Object.entries(state.cards)) {
            if (card.channelId !== id) {
              remainingCards[cardId] = card;
            }
          }

          // Also delete all instruction cards belonging to this channel
          const remainingInstructionCards: Record<ID, InstructionCard> = {};
          for (const [icId, ic] of Object.entries(state.instructionCards)) {
            if (ic.channelId !== id) {
              remainingInstructionCards[icId] = ic;
            }
          }

          return {
            channels: remainingChannels,
            cards: remainingCards,
            instructionCards: remainingInstructionCards,
            channelOrder: state.channelOrder.filter((cid) => cid !== id),
          };
        });

        // Sync to server
        sync.syncChannelDelete(id);
      },

      reorderChannels: (fromIndex, toIndex) => {
        set((state) => {
          const newOrder = [...state.channelOrder];
          const [removed] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, removed);
          return { channelOrder: newOrder };
        });
      },

      createColumn: (channelId, name) => {
        const id = nanoid();
        const column: Column = {
          id,
          name,
          cardIds: [],
        };

        let result: Column | null = null;
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          result = column;
          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                columns: [...channel.columns, column],
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncColumnCreate(channelId, id, name);

        return result;
      },

      updateColumn: (channelId, columnId, updates) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const updatedColumns = channel.columns.map((col) => {
            if (col.id === columnId) {
              return { ...col, ...updates };
            }
            return col;
          });

          return {
            channels: {
              ...state.channels,
              [channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncColumnUpdate(channelId, columnId, updates);
      },

      deleteColumn: (channelId, columnId) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          // Don't allow deleting the last column
          if (channel.columns.length <= 1) return state;

          // Find the column to delete and the first column (Inbox)
          const columnToDelete = channel.columns.find((c) => c.id === columnId);
          if (!columnToDelete) return state;

          const inboxColumn = channel.columns[0];
          const isInbox = inboxColumn.id === columnId;

          // Move cards to Inbox (or second column if deleting Inbox)
          const targetColumn = isInbox ? channel.columns[1] : inboxColumn;

          // If deleting AI target column, transfer to target column
          const wasAiTarget = columnToDelete.isAiTarget;

          const updatedColumns = channel.columns
            .filter((col) => col.id !== columnId)
            .map((col) => {
              if (col.id === targetColumn.id) {
                return {
                  ...col,
                  cardIds: [...col.cardIds, ...columnToDelete.cardIds],
                  isAiTarget: wasAiTarget ? true : col.isAiTarget,
                };
              }
              return col;
            });

          return {
            channels: {
              ...state.channels,
              [channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncColumnDelete(channelId, columnId);
      },

      reorderColumns: (channelId, fromIndex, toIndex) => {
        const channel = get().channels[channelId];
        if (!channel) return;

        const columnId = channel.columns[fromIndex]?.id;

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          const columns = [...ch.columns];
          const [removed] = columns.splice(fromIndex, 1);
          columns.splice(toIndex, 0, removed);

          return {
            channels: {
              ...state.channels,
              [channelId]: { ...ch, columns, updatedAt: now() },
            },
          };
        });

        // Sync column reorder to server
        if (columnId) {
          sync.syncColumnUpdate(channelId, columnId, { position: toIndex });
        }
      },

      setColumnInstructions: (channelId, columnId, instructions) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const updatedColumns = channel.columns.map((col) => {
            if (col.id === columnId) {
              return { ...col, instructions };
            }
            return col;
          });

          return {
            channels: {
              ...state.channels,
              [channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncColumnUpdate(channelId, columnId, { instructions });
      },

      createCard: (channelId, columnId, input, source = 'manual', createdByInstructionId) => {
        const id = nanoid();
        const timestamp = now();

        // Create initial message if provided
        const messages: CardMessage[] = [];
        if (input.initialMessage) {
          messages.push({
            id: nanoid(),
            type: 'note',
            content: input.initialMessage,
            createdAt: timestamp,
          });
        }

        const card: Card = {
          id,
          channelId,
          title: input.title,
          messages,
          source,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdByInstructionId,
        };

        // Get current column length for position
        const state = get();
        const channel = state.channels[channelId];
        const column = channel?.columns.find(c => c.id === columnId);
        const position = column?.cardIds.length ?? 0;

        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const updatedColumns = channel.columns.map((col) => {
            if (col.id === columnId) {
              return { ...col, cardIds: [...col.cardIds, id] };
            }
            return col;
          });

          return {
            cards: { ...state.cards, [id]: card },
            channels: {
              ...state.channels,
              [channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Emit automation event for card creation
        emitCardCreated(id, channelId, columnId, createdByInstructionId);

        // Sync to server
        sync.syncCardCreate(channelId, {
          columnId,
          title: input.title,
          initialMessage: input.initialMessage,
          source,
          position,
        });

        return card;
      },

      updateCard: (id, updates) => {
        const card = get().cards[id];
        if (!card) return;

        set((state) => {
          const card = state.cards[id];
          if (!card) return state;

          return {
            cards: {
              ...state.cards,
              [id]: { ...card, ...updates, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, id, updates);
      },

      deleteCard: (id) => {
        // Capture channelId before deletion for automation event
        const preState = get();
        const preCard = preState.cards[id];
        const channelId = preCard?.channelId;

        set((state) => {
          const card = state.cards[id];
          if (!card) return state;

          const { [id]: deleted, ...remainingCards } = state.cards;
          const channel = state.channels[card.channelId];
          if (!channel) return { cards: remainingCards };

          const updatedColumns = channel.columns.map((col) => ({
            ...col,
            cardIds: col.cardIds.filter((cid) => cid !== id),
          }));

          return {
            cards: remainingCards,
            channels: {
              ...state.channels,
              [card.channelId]: {
                ...channel,
                columns: updatedColumns,
                updatedAt: now(),
              },
            },
          };
        });

        // Emit automation event for card deletion (threshold check)
        if (channelId) {
          emitCardDeleted(channelId);
          // Sync to server
          sync.syncCardDelete(channelId, id);
        }
      },

      deleteAllCardsInColumn: (channelId, columnId) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const column = channel.columns.find((c) => c.id === columnId);
          if (!column || column.cardIds.length === 0) return state;

          // Remove all cards in this column from the cards record
          const remainingCards = { ...state.cards };
          for (const cardId of column.cardIds) {
            delete remainingCards[cardId];
          }

          // Clear the column's cardIds
          const updatedColumns = channel.columns.map((col) => {
            if (col.id === columnId) {
              return { ...col, cardIds: [] };
            }
            return col;
          });

          return {
            cards: remainingCards,
            channels: {
              ...state.channels,
              [channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });
      },

      moveCard: (cardId, toColumnId, toIndex) => {
        // Capture state before mutation for automation event
        const preState = get();
        const preCard = preState.cards[cardId];
        const preChannel = preCard ? preState.channels[preCard.channelId] : null;
        const fromColumnId = preChannel?.columns.find(col => col.cardIds.includes(cardId))?.id;

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          const channel = state.channels[card.channelId];
          if (!channel) return state;

          // Find the source column
          const fromColumn = channel.columns.find((col) => col.cardIds.includes(cardId));
          if (!fromColumn) return state;

          const toColumn = channel.columns.find((col) => col.id === toColumnId);
          if (!toColumn) return state;

          // Remove card from current column
          const updatedColumns = channel.columns.map((col) => {
            if (col.id === fromColumn.id) {
              return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) };
            }
            return col;
          });

          // Add card to target column at specified index
          const finalColumns = updatedColumns.map((col) => {
            if (col.id === toColumnId) {
              const newCardIds = [...col.cardIds];
              newCardIds.splice(toIndex, 0, cardId);
              return { ...col, cardIds: newCardIds };
            }
            return col;
          });

          return {
            channels: {
              ...state.channels,
              [card.channelId]: { ...channel, columns: finalColumns, updatedAt: now() },
            },
          };
        });

        // Emit automation event for card move (only if actually moved to different column)
        if (preCard && fromColumnId && fromColumnId !== toColumnId) {
          emitCardMoved(
            cardId,
            preCard.channelId,
            fromColumnId,
            toColumnId,
            preCard.createdByInstructionId
          );
        }

        // Sync to server
        if (preCard) {
          sync.syncCardMove(preCard.channelId, cardId, toColumnId, toIndex, false);
        }
      },

      archiveCard: (cardId) => {
        const preState = get();
        const preCard = preState.cards[cardId];
        const channel = preCard ? preState.channels[preCard.channelId] : null;
        const column = channel?.columns.find((col) => col.cardIds.includes(cardId));

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          const channel = state.channels[card.channelId];
          if (!channel) return state;

          // Find the column containing this card
          const column = channel.columns.find((col) => col.cardIds.includes(cardId));
          if (!column) return state;

          // Move card from cardIds to backsideCardIds (archived)
          const updatedColumns = channel.columns.map((col) => {
            if (col.id === column.id) {
              return {
                ...col,
                cardIds: col.cardIds.filter((id) => id !== cardId),
                backsideCardIds: [...(col.backsideCardIds ?? []), cardId],
              };
            }
            return col;
          });

          return {
            channels: {
              ...state.channels,
              [card.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Sync to server
        if (preCard && column) {
          const backsidePosition = (column.backsideCardIds?.length ?? 0);
          sync.syncCardMove(preCard.channelId, cardId, column.id, backsidePosition, true);
        }
      },

      unarchiveCard: (cardId) => {
        const preState = get();
        const preCard = preState.cards[cardId];
        const channel = preCard ? preState.channels[preCard.channelId] : null;
        const column = channel?.columns.find((col) => col.backsideCardIds?.includes(cardId));

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          const channel = state.channels[card.channelId];
          if (!channel) return state;

          // Find the column containing this card on backside (archived)
          const column = channel.columns.find((col) => col.backsideCardIds?.includes(cardId));
          if (!column) return state;

          // Move card from backsideCardIds to cardIds
          const updatedColumns = channel.columns.map((col) => {
            if (col.id === column.id) {
              return {
                ...col,
                cardIds: [...col.cardIds, cardId],
                backsideCardIds: (col.backsideCardIds ?? []).filter((id) => id !== cardId),
              };
            }
            return col;
          });

          return {
            channels: {
              ...state.channels,
              [card.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
            },
          };
        });

        // Sync to server (restore to front of column)
        if (preCard && column) {
          const frontPosition = column.cardIds.length;
          sync.syncCardMove(preCard.channelId, cardId, column.id, frontPosition, false);
        }
      },

      setCardTasksHidden: (cardId, hidden) => {
        const card = get().cards[cardId];
        if (!card) return;

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: { ...c, hideCompletedTasks: hidden, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { hideCompletedTasks: hidden });
      },

      // Card message actions
      addMessage: (cardId, type, content, imageUrls) => {
        const id = nanoid();
        const timestamp = now();
        const message: CardMessage = {
          id,
          type,
          content,
          createdAt: timestamp,
          ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
        };

        let result: CardMessage | null = null;
        let channelId: string | null = null;
        let updatedMessages: CardMessage[] = [];

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          result = message;
          channelId = card.channelId;
          updatedMessages = [...(card.messages ?? []), message];

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                messages: updatedMessages,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        if (channelId) {
          sync.syncCardUpdate(channelId, cardId, { messages: updatedMessages });
        }

        return result;
      },

      addAIResponse: (cardId, questionId, content) => {
        const id = nanoid();
        const timestamp = now();
        const message: CardMessage = {
          id,
          type: 'ai_response',
          content,
          createdAt: timestamp,
          replyToMessageId: questionId,
        };

        let result: CardMessage | null = null;
        let channelId: string | null = null;
        let updatedMessages: CardMessage[] = [];

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          result = message;
          channelId = card.channelId;
          updatedMessages = [...(card.messages ?? []), message];

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                messages: updatedMessages,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        if (channelId) {
          sync.syncCardUpdate(channelId, cardId, { messages: updatedMessages });
        }

        return result;
      },

      editMessage: (cardId, messageId, content) => {
        let channelId: string | null = null;
        let updatedMessages: CardMessage[] = [];

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          channelId = card.channelId;
          updatedMessages = (card.messages ?? []).map((m) =>
            m.id === messageId ? { ...m, content } : m
          );

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                messages: updatedMessages,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        if (channelId) {
          sync.syncCardUpdate(channelId, cardId, { messages: updatedMessages });
        }
      },

      deleteMessage: (cardId, messageId) => {
        let channelId: string | null = null;
        let updatedMessages: CardMessage[] = [];

        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          channelId = card.channelId;
          updatedMessages = (card.messages ?? []).filter((m) => m.id !== messageId);

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                messages: updatedMessages,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        if (channelId) {
          sync.syncCardUpdate(channelId, cardId, { messages: updatedMessages });
        }
      },

      setCardSummary: (cardId, summary) => {
        const card = get().cards[cardId];
        if (!card) return;

        const timestamp = now();

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                summary,
                summaryUpdatedAt: timestamp,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { summary, summaryUpdatedAt: timestamp });
      },

      setCoverImage: (cardId, url) => {
        const card = get().cards[cardId];
        if (!card) return;

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                coverImageUrl: url ?? undefined,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { coverImageUrl: url });
      },

      // Task actions
      createTask: (channelId, cardId, input) => {
        const id = nanoid();
        const timestamp = now();
        const task: Task = {
          id,
          cardId,
          channelId,
          title: input.title,
          description: input.description ?? '',
          status: 'not_started',
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => {
          // If task belongs to a card, update the card's taskIds
          if (cardId) {
            const card = state.cards[cardId];
            if (card) {
              return {
                tasks: { ...state.tasks, [id]: task },
                cards: {
                  ...state.cards,
                  [cardId]: {
                    ...card,
                    taskIds: [...(card.taskIds ?? []), id],
                    updatedAt: timestamp,
                  },
                },
              };
            }
          }
          return {
            tasks: { ...state.tasks, [id]: task },
          };
        });

        // Sync to server
        sync.syncTaskCreate(channelId, {
          cardId: cardId ?? undefined,
          title: input.title,
          description: input.description ?? '',
        });

        return task;
      },

      updateTask: (id, updates) => {
        const task = get().tasks[id];
        if (!task) return;

        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;

          return {
            tasks: {
              ...state.tasks,
              [id]: { ...t, ...updates, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncTaskUpdate(task.channelId, id, updates);
      },

      deleteTask: (id) => {
        const task = get().tasks[id];
        if (!task) return;

        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;

          const { [id]: deleted, ...remainingTasks } = state.tasks;

          // If task belongs to a card, remove from card's taskIds
          if (t.cardId) {
            const card = state.cards[t.cardId];
            if (card) {
              return {
                tasks: remainingTasks,
                cards: {
                  ...state.cards,
                  [t.cardId]: {
                    ...card,
                    taskIds: (card.taskIds ?? []).filter((tid) => tid !== id),
                    updatedAt: now(),
                  },
                },
              };
            }
          }

          return { tasks: remainingTasks };
        });

        // Sync to server
        sync.syncTaskDelete(task.channelId, id);
      },

      completeTask: (id) => {
        const task = get().tasks[id];
        if (!task) return;

        const timestamp = now();

        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;

          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: 'done',
                completedAt: timestamp,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        sync.syncTaskUpdate(task.channelId, id, {
          status: 'done',
          completedAt: timestamp,
        });
      },

      toggleTaskStatus: (id) => {
        const task = get().tasks[id];
        if (!task) return;

        // Cycle: not_started -> in_progress -> done -> not_started
        const statusCycle: Record<TaskStatus, TaskStatus> = {
          not_started: 'in_progress',
          in_progress: 'done',
          done: 'not_started',
        };

        const newStatus = statusCycle[task.status];
        const timestamp = now();

        set((state) => {
          const t = state.tasks[id];
          if (!t) return state;

          return {
            tasks: {
              ...state.tasks,
              [id]: {
                ...t,
                status: newStatus,
                completedAt: newStatus === 'done' ? timestamp : undefined,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        sync.syncTaskUpdate(task.channelId, id, {
          status: newStatus,
          completedAt: newStatus === 'done' ? timestamp : undefined,
        });
      },

      reorderTasks: (cardId, fromIndex, toIndex) => {
        const card = get().cards[cardId];
        if (!card || !card.taskIds) return;

        const taskId = card.taskIds[fromIndex];
        const task = get().tasks[taskId];
        if (!task) return;

        set((state) => {
          const c = state.cards[cardId];
          if (!c || !c.taskIds) return state;

          const newTaskIds = [...c.taskIds];
          const [removed] = newTaskIds.splice(fromIndex, 1);
          newTaskIds.splice(toIndex, 0, removed);

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                taskIds: newTaskIds,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncTaskReorder(task.channelId, taskId, cardId, toIndex);
      },

      reorderUnlinkedTasks: (channelId, fromIndex, toIndex) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          // Get current unlinked task order, or build it from existing unlinked tasks
          let currentOrder = channel.unlinkedTaskOrder ?? [];

          // If no order exists, build it from existing unlinked tasks (sorted by createdAt)
          if (currentOrder.length === 0) {
            const unlinkedTasks = Object.values(state.tasks)
              .filter((t) => t.channelId === channelId && !t.cardId)
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            currentOrder = unlinkedTasks.map((t) => t.id);
          }

          const newOrder = [...currentOrder];
          const [removed] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, removed);

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                unlinkedTaskOrder: newOrder,
                updatedAt: now(),
              },
            },
          };
        });
      },

      addQuestion: (channelId, questionData) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const question: ChannelQuestion = {
            id: nanoid(),
            ...questionData,
            createdAt: now(),
          };

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                questions: [...(channel.questions ?? []), question],
                updatedAt: now(),
              },
            },
          };
        });
      },

      answerQuestion: (channelId, questionId, answer) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const updatedQuestions = (channel.questions ?? []).map((q) => {
            if (q.id === questionId) {
              return { ...q, status: 'answered' as const, answer, answeredAt: now() };
            }
            return q;
          });

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                questions: updatedQuestions,
                updatedAt: now(),
              },
            },
          };
        });
      },

      dismissQuestion: (channelId, questionId) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const updatedQuestions = (channel.questions ?? []).map((q) => {
            if (q.id === questionId) {
              return { ...q, status: 'dismissed' as const };
            }
            return q;
          });

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                questions: updatedQuestions,
                updatedAt: now(),
              },
            },
          };
        });
      },

      addInstructionRevision: (channelId, instructions, source) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const revision: InstructionRevision = {
            id: nanoid(),
            instructions,
            source,
            appliedAt: now(),
          };

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                aiInstructions: instructions,
                instructionHistory: [...(channel.instructionHistory ?? []), revision],
                updatedAt: now(),
              },
            },
          };
        });
      },

      rollbackInstruction: (channelId, revisionId) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          const revision = (channel.instructionHistory ?? []).find((r) => r.id === revisionId);
          if (!revision) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                aiInstructions: revision.instructions,
                updatedAt: now(),
              },
            },
          };
        });
      },

      setSuggestionMode: (channelId, mode) => {
        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                suggestionMode: mode,
                updatedAt: now(),
              },
            },
          };
        });
      },

      addPropertyDefinition: (channelId, definition) => {
        const id = nanoid();
        const propertyDef: PropertyDefinition = { id, ...definition };

        const channel = get().channels[channelId];
        const propertyDefinitions = [...(channel?.propertyDefinitions ?? []), propertyDef];

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...ch,
                propertyDefinitions,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncChannelUpdate(channelId, { propertyDefinitions });

        return propertyDef;
      },

      removePropertyDefinition: (channelId, propertyId) => {
        const channel = get().channels[channelId];
        if (!channel) return;

        const propertyDefinitions = (channel.propertyDefinitions ?? []).filter((p) => p.id !== propertyId);

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...ch,
                propertyDefinitions,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncChannelUpdate(channelId, { propertyDefinitions });
      },

      setCardProperty: (cardId, key, value, displayType, color) => {
        const card = get().cards[cardId];
        if (!card) return;

        const existingProperties = card.properties ?? [];
        const existingIndex = existingProperties.findIndex((p) => p.key === key);
        const newProperty: CardProperty = { key, value, displayType, color };

        let updatedProperties: CardProperty[];
        if (existingIndex >= 0) {
          updatedProperties = [...existingProperties];
          updatedProperties[existingIndex] = newProperty;
        } else {
          updatedProperties = [...existingProperties, newProperty];
        }

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: { ...c, properties: updatedProperties, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { properties: updatedProperties });
      },

      removeCardProperty: (cardId, key) => {
        const card = get().cards[cardId];
        if (!card) return;

        const updatedProperties = (card.properties ?? []).filter((p) => p.key !== key);

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                properties: updatedProperties,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { properties: updatedProperties });
      },

      setCardProcessing: (cardId, isProcessing, status) => {
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                isProcessing,
                processingStatus: isProcessing ? status : undefined,
              },
            },
          };
        });
      },

      setCardProperties: (cardId, properties) => {
        const card = get().cards[cardId];
        if (!card) return;

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: { ...c, properties, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { properties });
      },

      recordInstructionRun: (cardId, instructionId) => {
        const card = get().cards[cardId];
        if (!card) return;

        const timestamp = now();
        const processedByInstructions = {
          ...(card.processedByInstructions ?? {}),
          [instructionId]: timestamp,
        };

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                processedByInstructions,
                updatedAt: timestamp,
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { processedByInstructions });
      },

      clearInstructionRun: (cardId, instructionId) => {
        const card = get().cards[cardId];
        if (!card || !card.processedByInstructions) return;

        const { [instructionId]: _, ...remainingInstructions } = card.processedByInstructions;
        const processedByInstructions = Object.keys(remainingInstructions).length > 0
          ? remainingInstructions
          : undefined;

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                processedByInstructions,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { processedByInstructions: processedByInstructions ?? {} });
      },

      addTagDefinition: (channelId, name, color) => {
        const id = nanoid();
        const tagDef: TagDefinition = { id, name, color };

        const channel = get().channels[channelId];
        const tagDefinitions = [...(channel?.tagDefinitions ?? []), tagDef];

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...ch,
                tagDefinitions,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncChannelUpdate(channelId, { tagDefinitions });

        return tagDef;
      },

      updateTagDefinition: (channelId, tagId, updates) => {
        const channel = get().channels[channelId];
        if (!channel) return;

        const tagDef = (channel.tagDefinitions ?? []).find((t) => t.id === tagId);
        if (!tagDef) return;

        const oldName = tagDef.name;
        const newName = updates.name ?? oldName;

        // Update tag definition
        const tagDefinitions = (channel.tagDefinitions ?? []).map((t) =>
          t.id === tagId ? { ...t, ...updates } : t
        );

        // Track cards that need sync if name changed
        const cardsToSync: Array<{ id: string; tags: string[] }> = [];

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          // If name changed, update all cards with this tag
          let updatedCards = state.cards;
          if (updates.name && updates.name !== oldName) {
            updatedCards = { ...state.cards };
            for (const cardId of Object.keys(updatedCards)) {
              const card = updatedCards[cardId];
              if (card.channelId === channelId && card.tags?.includes(oldName)) {
                const newTags = card.tags.map((t) => (t === oldName ? newName : t));
                updatedCards[cardId] = {
                  ...card,
                  tags: newTags,
                  updatedAt: now(),
                };
                cardsToSync.push({ id: cardId, tags: newTags });
              }
            }
          }

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...ch,
                tagDefinitions,
                updatedAt: now(),
              },
            },
            cards: updatedCards,
          };
        });

        // Sync channel tag definitions to server
        sync.syncChannelUpdate(channelId, { tagDefinitions });

        // Sync any cards whose tags were renamed
        for (const { id, tags } of cardsToSync) {
          sync.syncCardUpdate(channelId, id, { tags });
        }
      },

      removeTagDefinition: (channelId, tagId) => {
        const channel = get().channels[channelId];
        if (!channel) return;

        const tagDefinitions = (channel.tagDefinitions ?? []).filter((t) => t.id !== tagId);

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          return {
            channels: {
              ...state.channels,
              [channelId]: {
                ...ch,
                tagDefinitions,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncChannelUpdate(channelId, { tagDefinitions });
      },

      addTagToCard: (cardId, tagName) => {
        const card = get().cards[cardId];
        if (!card) return;

        const existingTags = card.tags ?? [];
        if (existingTags.includes(tagName)) return;

        const tags = [...existingTags, tagName];

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                tags,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { tags });
      },

      removeTagFromCard: (cardId, tagName) => {
        const card = get().cards[cardId];
        if (!card) return;

        const tags = (card.tags ?? []).filter((t) => t !== tagName);

        set((state) => {
          const c = state.cards[cardId];
          if (!c) return state;

          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...c,
                tags,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncCardUpdate(card.channelId, cardId, { tags });
      },

      createInstructionCard: (channelId, input) => {
        const id = nanoid();
        const timestamp = now();
        const instructionCard: InstructionCard = {
          id,
          channelId,
          title: input.title,
          instructions: input.instructions,
          action: input.action,
          target: input.target,
          contextColumns: input.contextColumns,
          runMode: input.runMode ?? 'manual',
          cardCount: input.cardCount,
          interviewQuestions: input.interviewQuestions,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => {
          const channel = state.channels[channelId];
          if (!channel) return state;

          return {
            instructionCards: { ...state.instructionCards, [id]: instructionCard },
            channels: {
              ...state.channels,
              [channelId]: {
                ...channel,
                instructionCardIds: [...(channel.instructionCardIds ?? []), id],
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncInstructionCardCreate(channelId, {
          title: input.title,
          instructions: input.instructions,
          action: input.action,
          target: input.target,
          contextColumns: input.contextColumns,
          runMode: input.runMode ?? 'manual',
          cardCount: input.cardCount,
          interviewQuestions: input.interviewQuestions,
        });

        return instructionCard;
      },

      updateInstructionCard: (id, updates) => {
        const instructionCard = get().instructionCards[id];
        if (!instructionCard) return;

        set((state) => {
          const ic = state.instructionCards[id];
          if (!ic) return state;

          return {
            instructionCards: {
              ...state.instructionCards,
              [id]: { ...ic, ...updates, updatedAt: now() },
            },
          };
        });

        // Sync to server
        sync.syncInstructionCardUpdate(instructionCard.channelId, id, updates);
      },

      deleteInstructionCard: (id) => {
        const instructionCard = get().instructionCards[id];
        if (!instructionCard) return;

        set((state) => {
          const ic = state.instructionCards[id];
          if (!ic) return state;

          const { [id]: deleted, ...remainingInstructionCards } = state.instructionCards;
          const channel = state.channels[ic.channelId];
          if (!channel) return { instructionCards: remainingInstructionCards };

          return {
            instructionCards: remainingInstructionCards,
            channels: {
              ...state.channels,
              [ic.channelId]: {
                ...channel,
                instructionCardIds: (channel.instructionCardIds ?? []).filter((icId) => icId !== id),
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server
        sync.syncInstructionCardDelete(instructionCard.channelId, id);
      },

      duplicateInstructionCard: (id) => {
        const state = get();
        const instructionCard = state.instructionCards[id];
        if (!instructionCard) return null;

        const newId = nanoid();
        const timestamp = now();
        const duplicatedCard: InstructionCard = {
          ...instructionCard,
          id: newId,
          title: `${instructionCard.title} (copy)`,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => {
          const channel = state.channels[instructionCard.channelId];
          if (!channel) return state;

          // Insert duplicate after original
          const existingIds = channel.instructionCardIds ?? [];
          const originalIndex = existingIds.indexOf(id);
          const newIds = [...existingIds];
          newIds.splice(originalIndex + 1, 0, newId);

          return {
            instructionCards: { ...state.instructionCards, [newId]: duplicatedCard },
            channels: {
              ...state.channels,
              [instructionCard.channelId]: {
                ...channel,
                instructionCardIds: newIds,
                updatedAt: now(),
              },
            },
          };
        });

        // Sync to server - create the duplicated instruction card
        sync.syncInstructionCardCreate(instructionCard.channelId, {
          title: duplicatedCard.title,
          instructions: duplicatedCard.instructions,
          action: duplicatedCard.action,
          target: duplicatedCard.target,
          contextColumns: duplicatedCard.contextColumns,
          runMode: duplicatedCard.runMode,
          cardCount: duplicatedCard.cardCount,
          interviewQuestions: duplicatedCard.interviewQuestions,
          isEnabled: duplicatedCard.isEnabled,
          triggers: duplicatedCard.triggers,
          safeguards: duplicatedCard.safeguards,
        });

        return duplicatedCard;
      },

      reorderInstructionCards: (channelId, fromIndex, toIndex) => {
        const channel = get().channels[channelId];
        if (!channel) return;

        const instructionId = (channel.instructionCardIds ?? [])[fromIndex];

        set((state) => {
          const ch = state.channels[channelId];
          if (!ch) return state;

          const instructionCardIds = [...(ch.instructionCardIds ?? [])];
          const [removed] = instructionCardIds.splice(fromIndex, 1);
          instructionCardIds.splice(toIndex, 0, removed);

          return {
            channels: {
              ...state.channels,
              [channelId]: { ...ch, instructionCardIds, updatedAt: now() },
            },
          };
        });

        // Sync position update to server
        if (instructionId) {
          sync.syncInstructionCardUpdate(channelId, instructionId, { position: toIndex });
        }
      },

      seedInitialChannel: () => {
        const state = get();
        // Only seed if no channels exist
        if (Object.keys(state.channels).length > 0) return;

        const template = KANTHINK_IDEAS_CHANNEL;
        const channelId = nanoid();
        const timestamp = now();

        // Create columns with IDs
        const columns: Column[] = template.columns.map((col) => ({
          id: nanoid(),
          name: col.name,
          cardIds: [],
          isAiTarget: col.isAiTarget,
        }));

        // Create instruction cards
        const instructionCardIds: ID[] = [];
        const newInstructionCards: Record<ID, InstructionCard> = {};

        for (const seedCard of template.instructionCards) {
          const icId = nanoid();
          const targetColumn = columns.find((c) => c.name === seedCard.targetColumnName);

          const instructionCard: InstructionCard = {
            id: icId,
            channelId,
            title: seedCard.title,
            instructions: seedCard.instructions,
            action: seedCard.action,
            target: targetColumn
              ? { type: 'column', columnId: targetColumn.id }
              : { type: 'board' },
            runMode: seedCard.runMode,
            cardCount: seedCard.cardCount,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          instructionCardIds.push(icId);
          newInstructionCards[icId] = instructionCard;
        }

        // Create the channel
        const channel: Channel = {
          id: channelId,
          name: template.name,
          description: template.description,
          status: 'active',
          aiInstructions: template.aiInstructions,
          instructionCardIds,
          columns,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          channels: { ...state.channels, [channelId]: channel },
          instructionCards: { ...state.instructionCards, ...newInstructionCards },
          channelOrder: [...state.channelOrder, channelId],
        }));
      },

      seedDevChannel: (initialCards) => {
        const state = get();
        // Check if dev channel already exists
        const existingDev = Object.values(state.channels).find(c => c.name === 'Kanthink <dev>');
        if (existingDev) return existingDev;

        const template = KANTHINK_DEV_CHANNEL;
        const channelId = nanoid();
        const timestamp = now();

        // Create columns with IDs
        const columns: Column[] = template.columns.map((col) => ({
          id: nanoid(),
          name: col.name,
          cardIds: [],
          isAiTarget: col.isAiTarget,
        }));

        // Create instruction cards
        const instructionCardIds: ID[] = [];
        const newInstructionCards: Record<ID, InstructionCard> = {};

        for (const seedCard of template.instructionCards) {
          const icId = nanoid();
          const targetColumn = columns.find((c) => c.name === seedCard.targetColumnName);

          const instructionCard: InstructionCard = {
            id: icId,
            channelId,
            title: seedCard.title,
            instructions: seedCard.instructions,
            action: seedCard.action,
            target: targetColumn
              ? { type: 'column', columnId: targetColumn.id }
              : { type: 'board' },
            runMode: seedCard.runMode,
            cardCount: seedCard.cardCount,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          instructionCardIds.push(icId);
          newInstructionCards[icId] = instructionCard;
        }

        // Create initial cards if provided
        const newCards: Record<ID, Card> = {};
        const inboxColumn = columns.find(c => c.name === 'Inbox');

        if (initialCards && inboxColumn) {
          for (const cardData of initialCards) {
            const cardId = nanoid();
            const card: Card = {
              id: cardId,
              channelId,
              title: cardData.title,
              messages: cardData.content ? [{
                id: nanoid(),
                type: 'note',
                content: cardData.content,
                createdAt: timestamp,
              }] : [],
              source: 'manual',
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            newCards[cardId] = card;
            inboxColumn.cardIds.push(cardId);
          }
        }

        // Create the channel
        const channel: Channel = {
          id: channelId,
          name: template.name,
          description: template.description,
          status: 'active',
          aiInstructions: template.aiInstructions,
          instructionCardIds,
          columns,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          channels: { ...state.channels, [channelId]: channel },
          cards: { ...state.cards, ...newCards },
          instructionCards: { ...state.instructionCards, ...newInstructionCards },
          channelOrder: [...state.channelOrder, channelId],
        }));

        return channel;
      },

      promoteCardToChannel: (cardId, config) => {
        const state = get();
        const card = state.cards[cardId];
        if (!card) return null;

        // Create new channel from card
        const channelId = nanoid();
        const timestamp = now();

        // Get plain text from messages for fallback description
        const plainContent = card.messages
          .map((m) => m.content)
          .join(' ')
          .trim();

        // Create columns - use config if provided, otherwise defaults
        let columns: Column[];
        if (config?.columns && config.columns.length > 0) {
          columns = config.columns.map((col) => ({
            id: nanoid(),
            name: col.name,
            cardIds: [],
            isAiTarget: col.isAiTarget,
          }));
        } else {
          columns = createDefaultColumns();
        }

        // Create instruction cards if provided
        const instructionCardIds: ID[] = [];
        const newInstructionCards: Record<ID, InstructionCard> = {};

        if (config?.starterInstructions) {
          for (const starter of config.starterInstructions) {
            const icId = nanoid();
            const targetColumn = columns.find((c) => c.name === starter.targetColumnName);

            const instructionCard: InstructionCard = {
              id: icId,
              channelId,
              title: starter.title,
              instructions: starter.instructions,
              action: starter.action,
              target: targetColumn
                ? { type: 'column', columnId: targetColumn.id }
                : { type: 'board' },
              runMode: starter.runMode,
              cardCount: starter.cardCount,
              createdAt: timestamp,
              updatedAt: timestamp,
            };

            instructionCardIds.push(icId);
            newInstructionCards[icId] = instructionCard;
          }
        }

        const channel: Channel = {
          id: channelId,
          name: config?.channelName || card.title,
          description: config?.description || plainContent.slice(0, 500),
          status: 'active',
          aiInstructions: config?.aiInstructions || plainContent,
          instructionCardIds,
          columns,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        // Update card with spawned channel reference
        const updatedCard: Card = {
          ...card,
          spawnedChannelIds: [...(card.spawnedChannelIds ?? []), channelId],
          updatedAt: timestamp,
        };

        set((state) => ({
          channels: { ...state.channels, [channelId]: channel },
          cards: { ...state.cards, [cardId]: updatedCard },
          instructionCards: { ...state.instructionCards, ...newInstructionCards },
          channelOrder: [...state.channelOrder, channelId],
        }));

        return channel;
      },

      // AI operation actions
      startAIOperation: (status, context) => {
        // Create new abort controller
        currentAbortController = new AbortController();
        set({
          aiOperation: {
            isActive: true,
            status,
            context,
            startedAt: now(),
            runningInstructionIds: [],
          },
        });
      },

      updateAIStatus: (status) => {
        set((state) => ({
          aiOperation: {
            ...state.aiOperation,
            status,
          },
        }));
      },

      cancelAIOperation: () => {
        // Abort any in-flight requests
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        set({
          aiOperation: { isActive: false, status: '', runningInstructionIds: [] },
        });
      },

      completeAIOperation: () => {
        currentAbortController = null;
        set({
          aiOperation: { isActive: false, status: '', runningInstructionIds: [] },
        });
      },

      setInstructionRunning: (instructionId, isRunning) => {
        set((state) => {
          const currentIds = state.aiOperation.runningInstructionIds || [];
          const newIds = isRunning
            ? currentIds.includes(instructionId) ? currentIds : [...currentIds, instructionId]
            : currentIds.filter(id => id !== instructionId);
          return {
            aiOperation: {
              ...state.aiOperation,
              runningInstructionIds: newIds,
            },
          };
        });
      },

      // Instruction undo actions
      saveInstructionRun: (run) => {
        const id = nanoid();
        const MAX_RUNS_PER_INSTRUCTION = 10;

        set((state) => {
          const newRun: InstructionRun = { ...run, id };
          const updatedRuns = { ...state.instructionRuns, [id]: newRun };

          // Limit to last N runs per instruction (remove oldest if over limit)
          const runsForInstruction = Object.values(updatedRuns)
            .filter(r => r.instructionId === run.instructionId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          if (runsForInstruction.length > MAX_RUNS_PER_INSTRUCTION) {
            const toRemove = runsForInstruction.slice(0, runsForInstruction.length - MAX_RUNS_PER_INSTRUCTION);
            for (const oldRun of toRemove) {
              delete updatedRuns[oldRun.id];
            }
          }

          return { instructionRuns: updatedRuns };
        });

        return id;
      },

      undoInstructionRun: (runId) => {
        const state = get();
        const run = state.instructionRuns[runId];
        if (!run || run.undone) return;

        // Reverse each change
        for (const change of run.changes) {
          switch (change.type) {
            case 'task_added':
              if (change.taskId) {
                // Delete the task that was added
                set((s) => {
                  const task = s.tasks[change.taskId!];
                  if (!task) return s;

                  const { [change.taskId!]: _, ...remainingTasks } = s.tasks;

                  // Also remove from card's taskIds if applicable
                  if (task.cardId && s.cards[task.cardId]) {
                    const card = s.cards[task.cardId];
                    return {
                      tasks: remainingTasks,
                      cards: {
                        ...s.cards,
                        [task.cardId]: {
                          ...card,
                          taskIds: (card.taskIds || []).filter(id => id !== change.taskId),
                          updatedAt: now(),
                        },
                      },
                    };
                  }
                  return { tasks: remainingTasks };
                });
              }
              break;

            case 'title_changed':
              if (change.previousTitle !== undefined) {
                set((s) => {
                  const card = s.cards[change.cardId];
                  if (!card) return s;
                  return {
                    cards: {
                      ...s.cards,
                      [change.cardId]: {
                        ...card,
                        title: change.previousTitle!,
                        updatedAt: now(),
                      },
                    },
                  };
                });
              }
              break;

            case 'property_set':
              if (change.propertyKey) {
                set((s) => {
                  const card = s.cards[change.cardId];
                  if (!card) return s;

                  let updatedProperties = card.properties || [];
                  if (change.previousValue === undefined) {
                    // Property was new, remove it
                    updatedProperties = updatedProperties.filter(p => p.key !== change.propertyKey);
                  } else {
                    // Property was modified, restore previous value
                    updatedProperties = updatedProperties.map(p =>
                      p.key === change.propertyKey
                        ? { ...p, value: change.previousValue! }
                        : p
                    );
                  }

                  return {
                    cards: {
                      ...s.cards,
                      [change.cardId]: {
                        ...card,
                        properties: updatedProperties,
                        updatedAt: now(),
                      },
                    },
                  };
                });
              }
              break;

            case 'message_added':
              if (change.messageId) {
                set((s) => {
                  const card = s.cards[change.cardId];
                  if (!card) return s;
                  return {
                    cards: {
                      ...s.cards,
                      [change.cardId]: {
                        ...card,
                        messages: card.messages.filter(m => m.id !== change.messageId),
                        updatedAt: now(),
                      },
                    },
                  };
                });
              }
              break;
          }
        }

        // Mark the run as undone
        set((s) => ({
          instructionRuns: {
            ...s.instructionRuns,
            [runId]: { ...run, undone: true },
          },
        }));
      },

      getInstructionRuns: (instructionId) => {
        const state = get();
        return Object.values(state.instructionRuns)
          .filter(r => r.instructionId === instructionId)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first
      },

      // Skeleton loading actions
      setGeneratingSkeletons: (columnId, count) => {
        set((state) => ({
          generatingSkeletons: { ...state.generatingSkeletons, [columnId]: count },
        }));
      },

      clearGeneratingSkeletons: (columnId) => {
        set((state) => {
          const { [columnId]: _, ...rest } = state.generatingSkeletons;
          return { generatingSkeletons: rest };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        channels: state.channels,
        cards: state.cards,
        tasks: state.tasks,
        instructionCards: state.instructionCards,
        channelOrder: state.channelOrder,
        folders: state.folders,
        folderOrder: state.folderOrder,
        instructionRuns: state.instructionRuns,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
