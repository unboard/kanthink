/**
 * Apply a broadcast event from another tab to the local Zustand store.
 *
 * This is called when we receive an event from BroadcastChannel.
 * We need to apply the changes directly without triggering re-broadcasts.
 */

import type { BroadcastEvent } from './broadcastSync'
import type { KanthinkStateShape } from '../storeTypes'

type PartialState = Partial<KanthinkStateShape>

/**
 * Apply a broadcast event to the store.
 * The store's set function is passed in to avoid circular dependencies.
 */
export function applyBroadcastEvent(
  event: BroadcastEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (partial: PartialState | ((state: KanthinkStateShape) => PartialState)) => void,
  getState: () => KanthinkStateShape
): void {
  const now = () => new Date().toISOString()

  // Helper that maintains proper typing
  const set = (fn: (state: KanthinkStateShape) => PartialState) => setState(fn)

  switch (event.type) {
    // ===== FOLDER EVENTS =====
    case 'folder:create':
      set((state) => ({
        folders: { ...state.folders, [event.folder.id]: event.folder },
        folderOrder: [...state.folderOrder, event.folder.id],
      }))
      break

    case 'folder:update':
      set((state) => {
        const folder = state.folders[event.id]
        if (!folder) return state
        return {
          folders: {
            ...state.folders,
            [event.id]: { ...folder, ...event.updates, updatedAt: now() },
          },
        }
      })
      break

    case 'folder:delete':
      set((state) => {
        const { [event.id]: _, ...remainingFolders } = state.folders
        return {
          folders: remainingFolders,
          folderOrder: state.folderOrder.filter((id) => id !== event.id),
          channelOrder: [...state.channelOrder, ...event.channelIds],
        }
      })
      break

    case 'folder:reorder':
      set((state) => {
        const newOrder = [...state.folderOrder]
        const [moved] = newOrder.splice(event.fromIndex, 1)
        newOrder.splice(event.toIndex, 0, moved)
        return { folderOrder: newOrder }
      })
      break

    case 'folder:toggleCollapse':
      set((state) => {
        const folder = state.folders[event.id]
        if (!folder) return state
        return {
          folders: {
            ...state.folders,
            [event.id]: { ...folder, isCollapsed: event.isCollapsed },
          },
        }
      })
      break

    // ===== CHANNEL ORGANIZATION EVENTS =====
    case 'channel:moveToFolder':
      set((state) => {
        let newChannelOrder = state.channelOrder.filter((id) => id !== event.channelId)
        const newFolders = { ...state.folders }

        // Remove from any existing folder
        for (const [fid, folder] of Object.entries(newFolders)) {
          if (folder.channelIds.includes(event.channelId)) {
            newFolders[fid] = {
              ...folder,
              channelIds: folder.channelIds.filter((id) => id !== event.channelId),
              updatedAt: now(),
            }
          }
        }

        // Add to new location
        if (event.folderId && newFolders[event.folderId]) {
          newFolders[event.folderId] = {
            ...newFolders[event.folderId],
            channelIds: [...newFolders[event.folderId].channelIds, event.channelId],
            updatedAt: now(),
          }
        } else {
          newChannelOrder = [...newChannelOrder, event.channelId]
        }

        return { folders: newFolders, channelOrder: newChannelOrder }
      })
      break

    case 'channel:reorderInFolder':
      set((state) => {
        const folder = state.folders[event.folderId]
        if (!folder) return state

        const newChannelIds = [...folder.channelIds]
        const [moved] = newChannelIds.splice(event.fromIndex, 1)
        newChannelIds.splice(event.toIndex, 0, moved)

        return {
          folders: {
            ...state.folders,
            [event.folderId]: { ...folder, channelIds: newChannelIds, updatedAt: now() },
          },
        }
      })
      break

    case 'channel:reorder':
      set((state) => {
        const newOrder = [...state.channelOrder]
        const [removed] = newOrder.splice(event.fromIndex, 1)
        newOrder.splice(event.toIndex, 0, removed)
        return { channelOrder: newOrder }
      })
      break

    // ===== CHANNEL EVENTS =====
    case 'channel:create':
      set((state) => ({
        channels: { ...state.channels, [event.channel.id]: event.channel },
        channelOrder: [...state.channelOrder, event.channel.id],
      }))
      break

    case 'channel:update':
      set((state) => {
        const channel = state.channels[event.id]
        if (!channel) return state
        return {
          channels: {
            ...state.channels,
            [event.id]: { ...channel, ...event.updates, updatedAt: now() },
          },
        }
      })
      break

    case 'channel:delete':
      set((state) => {
        const { [event.id]: deleted, ...remainingChannels } = state.channels
        if (!deleted) return state

        // Also remove cards and instruction cards
        const remainingCards: Record<string, typeof state.cards[string]> = {}
        for (const [cardId, card] of Object.entries(state.cards)) {
          if (card.channelId !== event.id) {
            remainingCards[cardId] = card
          }
        }

        const remainingInstructionCards: Record<string, typeof state.instructionCards[string]> = {}
        for (const [icId, ic] of Object.entries(state.instructionCards)) {
          if (ic.channelId !== event.id) {
            remainingInstructionCards[icId] = ic
          }
        }

        return {
          channels: remainingChannels,
          cards: remainingCards,
          instructionCards: remainingInstructionCards,
          channelOrder: state.channelOrder.filter((cid) => cid !== event.id),
        }
      })
      break

    // ===== COLUMN EVENTS =====
    case 'column:create':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state
        return {
          channels: {
            ...state.channels,
            [event.channelId]: {
              ...channel,
              columns: [...channel.columns, event.column],
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'column:update':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const updatedColumns = channel.columns.map((col) =>
          col.id === event.columnId ? { ...col, ...event.updates } : col
        )

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'column:delete':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel || channel.columns.length <= 1) return state

        const columnToDelete = channel.columns.find((c) => c.id === event.columnId)
        if (!columnToDelete) return state

        const inboxColumn = channel.columns[0]
        const isInbox = inboxColumn.id === event.columnId
        const targetColumn = isInbox ? channel.columns[1] : inboxColumn
        const wasAiTarget = columnToDelete.isAiTarget

        const updatedColumns = channel.columns
          .filter((col) => col.id !== event.columnId)
          .map((col) => {
            if (col.id === targetColumn.id) {
              return {
                ...col,
                cardIds: [...col.cardIds, ...columnToDelete.cardIds],
                isAiTarget: wasAiTarget ? true : col.isAiTarget,
              }
            }
            return col
          })

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'column:reorder':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const columns = [...channel.columns]
        const [removed] = columns.splice(event.fromIndex, 1)
        columns.splice(event.toIndex, 0, removed)

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns, updatedAt: now() },
          },
        }
      })
      break

    // ===== CARD EVENTS =====
    case 'card:create':
      set((state) => {
        const channel = state.channels[event.card.channelId]
        if (!channel) return state

        const updatedColumns = channel.columns.map((col) => {
          if (col.id === event.columnId) {
            const newCardIds = [...col.cardIds]
            newCardIds.splice(event.position, 0, event.card.id)
            return { ...col, cardIds: newCardIds }
          }
          return col
        })

        return {
          cards: { ...state.cards, [event.card.id]: event.card },
          channels: {
            ...state.channels,
            [event.card.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'card:update':
      set((state) => {
        const card = state.cards[event.id]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.id]: { ...card, ...event.updates, updatedAt: now() },
          },
        }
      })
      break

    case 'card:delete':
      set((state) => {
        const { [event.id]: deleted, ...remainingCards } = state.cards
        if (!deleted) return state

        const channel = state.channels[event.channelId]
        if (!channel) return { cards: remainingCards }

        const updatedColumns = channel.columns.map((col) => ({
          ...col,
          cardIds: col.cardIds.filter((cid) => cid !== event.id),
          backsideCardIds: col.backsideCardIds?.filter((cid) => cid !== event.id),
        }))

        return {
          cards: remainingCards,
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'card:deleteAllInColumn':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const remainingCards = { ...state.cards }
        for (const cardId of event.cardIds) {
          delete remainingCards[cardId]
        }

        const updatedColumns = channel.columns.map((c) => {
          if (c.id === event.columnId) {
            return { ...c, cardIds: [] }
          }
          return c
        })

        return {
          cards: remainingCards,
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'card:move':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        // Remove card from source column
        const updatedColumns = channel.columns.map((col) => {
          if (col.id === event.fromColumnId) {
            return {
              ...col,
              cardIds: col.cardIds.filter((id) => id !== event.cardId),
              backsideCardIds: col.backsideCardIds?.filter((id) => id !== event.cardId),
            }
          }
          return col
        })

        // Add card to target column
        const finalColumns = updatedColumns.map((col) => {
          if (col.id === event.toColumnId) {
            const newCardIds = [...col.cardIds]
            newCardIds.splice(event.toIndex, 0, event.cardId)
            return { ...col, cardIds: newCardIds }
          }
          return col
        })

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: finalColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'card:archive':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const updatedColumns = channel.columns.map((col) => {
          if (col.id === event.columnId) {
            return {
              ...col,
              cardIds: col.cardIds.filter((id) => id !== event.cardId),
              backsideCardIds: [...(col.backsideCardIds ?? []), event.cardId],
            }
          }
          return col
        })

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    case 'card:unarchive':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const updatedColumns = channel.columns.map((col) => {
          if (col.id === event.columnId) {
            return {
              ...col,
              cardIds: [...col.cardIds, event.cardId],
              backsideCardIds: (col.backsideCardIds ?? []).filter((id) => id !== event.cardId),
            }
          }
          return col
        })

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, columns: updatedColumns, updatedAt: now() },
          },
        }
      })
      break

    // ===== CARD MESSAGE EVENTS =====
    case 'card:addMessage':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.cardId]: {
              ...card,
              messages: [...(card.messages ?? []), event.message],
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'card:editMessage':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.cardId]: {
              ...card,
              messages: (card.messages ?? []).map((m) =>
                m.id === event.messageId ? { ...m, content: event.content } : m
              ),
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'card:deleteMessage':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.cardId]: {
              ...card,
              messages: (card.messages ?? []).filter((m) => m.id !== event.messageId),
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'card:setSummary':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.cardId]: {
              ...card,
              summary: event.summary,
              summaryUpdatedAt: now(),
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'card:setCoverImage':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card) return state
        return {
          cards: {
            ...state.cards,
            [event.cardId]: {
              ...card,
              coverImageUrl: event.url ?? undefined,
              updatedAt: now(),
            },
          },
        }
      })
      break

    // ===== TASK EVENTS =====
    case 'task:create':
      set((state) => {
        if (event.cardId) {
          const card = state.cards[event.cardId]
          if (card) {
            return {
              tasks: { ...state.tasks, [event.task.id]: event.task },
              cards: {
                ...state.cards,
                [event.cardId]: {
                  ...card,
                  taskIds: [...(card.taskIds ?? []), event.task.id],
                  updatedAt: now(),
                },
              },
            }
          }
        }
        return { tasks: { ...state.tasks, [event.task.id]: event.task } }
      })
      break

    case 'task:update':
      set((state) => {
        const task = state.tasks[event.id]
        if (!task) return state
        return {
          tasks: {
            ...state.tasks,
            [event.id]: { ...task, ...event.updates, updatedAt: now() },
          },
        }
      })
      break

    case 'task:delete':
      set((state) => {
        const { [event.id]: deleted, ...remainingTasks } = state.tasks
        if (!deleted) return state

        if (event.cardId) {
          const card = state.cards[event.cardId]
          if (card) {
            return {
              tasks: remainingTasks,
              cards: {
                ...state.cards,
                [event.cardId]: {
                  ...card,
                  taskIds: (card.taskIds ?? []).filter((tid) => tid !== event.id),
                  updatedAt: now(),
                },
              },
            }
          }
        }
        return { tasks: remainingTasks }
      })
      break

    case 'task:complete':
      set((state) => {
        const task = state.tasks[event.id]
        if (!task) return state
        return {
          tasks: {
            ...state.tasks,
            [event.id]: {
              ...task,
              status: 'done',
              completedAt: event.completedAt,
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'task:toggleStatus':
      set((state) => {
        const task = state.tasks[event.id]
        if (!task) return state
        return {
          tasks: {
            ...state.tasks,
            [event.id]: {
              ...task,
              status: event.status as 'not_started' | 'in_progress' | 'done',
              completedAt: event.completedAt,
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'task:reorder':
      set((state) => {
        const card = state.cards[event.cardId]
        if (!card || !card.taskIds) return state

        const newTaskIds = [...card.taskIds]
        const [removed] = newTaskIds.splice(event.fromIndex, 1)
        newTaskIds.splice(event.toIndex, 0, removed)

        return {
          cards: {
            ...state.cards,
            [event.cardId]: { ...card, taskIds: newTaskIds, updatedAt: now() },
          },
        }
      })
      break

    case 'task:reorderUnlinked':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        let currentOrder = channel.unlinkedTaskOrder ?? []
        if (currentOrder.length === 0) {
          const unlinkedTasks = Object.values(state.tasks)
            .filter((t) => t.channelId === event.channelId && !t.cardId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          currentOrder = unlinkedTasks.map((t) => t.id)
        }

        const unlinkedTaskOrder = [...currentOrder]
        const [removed] = unlinkedTaskOrder.splice(event.fromIndex, 1)
        unlinkedTaskOrder.splice(event.toIndex, 0, removed)

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, unlinkedTaskOrder, updatedAt: now() },
          },
        }
      })
      break

    // ===== INSTRUCTION CARD EVENTS =====
    case 'instructionCard:create':
      set((state) => {
        const channel = state.channels[event.instructionCard.channelId]
        if (!channel) return state

        return {
          instructionCards: { ...state.instructionCards, [event.instructionCard.id]: event.instructionCard },
          channels: {
            ...state.channels,
            [event.instructionCard.channelId]: {
              ...channel,
              instructionCardIds: [...(channel.instructionCardIds ?? []), event.instructionCard.id],
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'instructionCard:update':
      set((state) => {
        const ic = state.instructionCards[event.id]
        if (!ic) return state
        return {
          instructionCards: {
            ...state.instructionCards,
            [event.id]: { ...ic, ...event.updates, updatedAt: now() },
          },
        }
      })
      break

    case 'instructionCard:delete':
      set((state) => {
        const { [event.id]: deleted, ...remainingInstructionCards } = state.instructionCards
        if (!deleted) return state

        const channel = state.channels[event.channelId]
        if (!channel) return { instructionCards: remainingInstructionCards }

        return {
          instructionCards: remainingInstructionCards,
          channels: {
            ...state.channels,
            [event.channelId]: {
              ...channel,
              instructionCardIds: (channel.instructionCardIds ?? []).filter((icId) => icId !== event.id),
              updatedAt: now(),
            },
          },
        }
      })
      break

    case 'instructionCard:reorder':
      set((state) => {
        const channel = state.channels[event.channelId]
        if (!channel) return state

        const instructionCardIds = [...(channel.instructionCardIds ?? [])]
        const [removed] = instructionCardIds.splice(event.fromIndex, 1)
        instructionCardIds.splice(event.toIndex, 0, removed)

        return {
          channels: {
            ...state.channels,
            [event.channelId]: { ...channel, instructionCardIds, updatedAt: now() },
          },
        }
      })
      break

    // ===== SERVER SYNC EVENTS =====
    case 'server:load':
      // Another tab loaded from server - we should refresh
      // For now, just log it - could trigger a refetch
      console.log('[BroadcastSync] Another tab loaded from server at', event.timestamp)
      break

    case 'server:clear':
      // Another tab cleared data - clear ours too
      set(() => ({
        channels: {},
        cards: {},
        tasks: {},
        instructionCards: {},
        folders: {},
        folderOrder: [],
        channelOrder: [],
        instructionRuns: {},
      }))
      break

    default:
      // Unhandled event type - log for debugging
      console.warn('[BroadcastSync] Unhandled event type:', (event as { type: string }).type)
  }
}
