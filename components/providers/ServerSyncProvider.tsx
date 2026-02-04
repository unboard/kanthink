'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useStore, type ServerData } from '@/lib/store'
import { fetchChannels, fetchChannel, fetchFolders, fetchGlobalShrooms } from '@/lib/api/client'
import { enableServerMode, disableServerMode } from '@/lib/api/sync'
import { initBroadcastSync } from '@/lib/sync/broadcastSync'
import { applyBroadcastEvent } from '@/lib/sync/applyBroadcastEvent'
import {
  initPusher,
  subscribeToChannels,
  subscribeToUser,
  subscribeToChannel,
  unsubscribeFromChannel,
  disconnect as disconnectPusher,
  getSubscribedChannels,
} from '@/lib/sync/pusherClient'
import { MigrationModal } from '@/components/MigrationModal'
import { STORAGE_KEY } from '@/lib/constants'
import type { Channel, Card, Task, InstructionCard, Folder, Column } from '@/lib/types'

// Server response types (include position/columnId fields)
interface ServerCard extends Card {
  columnId: string
  position: number
  isArchived?: boolean
}

interface ServerColumn extends Omit<Column, 'cardIds' | 'backsideCardIds'> {
  position: number
}

interface ServerTask extends Task {
  position: number
}

interface ServerFolder extends Folder {
  channelIds: string[]
  position?: number
}

interface ServerSyncContextValue {
  isLoading: boolean
  isServerMode: boolean
  error: string | null
  refetch: () => Promise<void>
}

const ServerSyncContext = createContext<ServerSyncContextValue>({
  isLoading: true,
  isServerMode: false,
  error: null,
  refetch: async () => {},
})

export function useServerSync() {
  return useContext(ServerSyncContext)
}

interface ServerSyncProviderProps {
  children: ReactNode
}

export function ServerSyncProvider({ children }: ServerSyncProviderProps) {
  const { data: session, status: sessionStatus } = useSession()
  const loadFromServer = useStore((s) => s.loadFromServer)
  const hasHydrated = useStore((s) => s._hasHydrated)
  const localChannels = useStore((s) => s.channels)

  const [isLoading, setIsLoading] = useState(true)
  const [isServerMode, setIsServerMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMigration, setShowMigration] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [pusherInitialized, setPusherInitialized] = useState(false)

  // Track channel IDs we've loaded for Pusher subscription
  const loadedChannelIdsRef = useRef<string[]>([])

  const fetchServerData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch channels list and folders in parallel
      const [channelsResponse, foldersResponse] = await Promise.all([
        fetchChannels(),
        fetchFolders(),
      ])

      // If no channels on server, check for local data to migrate
      if (channelsResponse.channels.length === 0) {
        // Check localStorage directly (not the store, which may have been cleared)
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.state && Object.keys(parsed.state.channels || {}).length > 0) {
            setShowMigration(true)
            setIsLoading(false)
            return
          }
        }
      }

      // Fetch full details for each channel
      const channelDetails = await Promise.all(
        channelsResponse.channels.map((ch) => fetchChannel(ch.id))
      )

      // Build the data structure
      const channels: Record<string, Channel> = {}
      const cards: Record<string, Card> = {}
      const tasks: Record<string, Task> = {}
      const instructionCards: Record<string, InstructionCard> = {}
      const folders: Record<string, Folder> = {}

      // Process folders (including virtual Help folder)
      for (const folder of foldersResponse.folders as ServerFolder[]) {
        folders[folder.id] = {
          id: folder.id,
          name: folder.name,
          channelIds: folder.channelIds,
          isCollapsed: folder.isCollapsed ?? false,
          isVirtual: (folder as ServerFolder & { isVirtual?: boolean }).isVirtual,
          isLocked: (folder as ServerFolder & { isLocked?: boolean }).isLocked,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        }
      }

      // Process each channel's data
      for (const detail of channelDetails) {
        const { channel } = detail
        const serverColumns = detail.columns as unknown as ServerColumn[]
        const channelCards = detail.cards as unknown as ServerCard[]
        const channelTasks = detail.tasks as unknown as ServerTask[]
        const channelInstructions = detail.instructionCards

        // Build column structure with card IDs
        const columnsWithCards: Column[] = serverColumns.map((col) => {
          const colCards = channelCards.filter((c) => c.columnId === col.id)
          const frontCards = colCards.filter((c) => !c.isArchived).sort((a, b) => a.position - b.position)
          const backCards = colCards.filter((c) => c.isArchived).sort((a, b) => a.position - b.position)

          return {
            id: col.id,
            name: col.name,
            instructions: col.instructions,
            processingPrompt: col.processingPrompt,
            autoProcess: col.autoProcess,
            isAiTarget: col.isAiTarget,
            cardIds: frontCards.map((c) => c.id),
            backsideCardIds: backCards.map((c) => c.id),
          }
        })

        channels[channel.id] = {
          id: channel.id,
          name: channel.name,
          description: channel.description || '',
          status: channel.status || 'active',
          aiInstructions: channel.aiInstructions || '',
          includeBacksideInAI: channel.includeBacksideInAI ?? false,
          isGlobalHelp: channel.isGlobalHelp ?? false,
          columns: columnsWithCards.sort((a, b) => {
            const aCol = serverColumns.find((c) => c.id === a.id)
            const bCol = serverColumns.find((c) => c.id === b.id)
            return (aCol?.position ?? 0) - (bCol?.position ?? 0)
          }),
          instructionCardIds: channelInstructions.map((ic) => ic.id),
          propertyDefinitions: channel.propertyDefinitions || [],
          tagDefinitions: channel.tagDefinitions || [],
          questions: channel.questions || [],
          instructionHistory: channel.instructionHistory || [],
          suggestionMode: channel.suggestionMode || 'off',
          unlinkedTaskOrder: channel.unlinkedTaskOrder || [],
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
        }

        // Process cards
        for (const card of channelCards) {
          // Build taskIds from tasks that belong to this card
          const cardTaskIds = channelTasks
            .filter((t) => t.cardId === card.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((t) => t.id)

          cards[card.id] = {
            id: card.id,
            channelId: card.channelId,
            title: card.title,
            messages: card.messages || [],
            coverImageUrl: card.coverImageUrl,
            summary: card.summary,
            summaryUpdatedAt: card.summaryUpdatedAt,
            source: card.source || 'manual',
            properties: card.properties || [],
            tags: card.tags || [],
            taskIds: cardTaskIds,
            hideCompletedTasks: card.hideCompletedTasks ?? false,
            createdByInstructionId: card.createdByInstructionId,
            processedByInstructions: card.processedByInstructions || {},
            spawnedChannelIds: card.spawnedChannelIds || [],
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          }
        }

        // Process tasks
        for (const task of channelTasks) {
          tasks[task.id] = {
            id: task.id,
            cardId: task.cardId,
            channelId: task.channelId,
            title: task.title,
            description: task.description || '',
            status: task.status || 'not_started',
            assignedTo: task.assignedTo,
            dueDate: task.dueDate,
            completedAt: task.completedAt,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          }
        }

        // Process instruction cards
        for (const ic of channelInstructions) {
          instructionCards[ic.id] = {
            id: ic.id,
            channelId: ic.channelId,
            title: ic.title,
            instructions: ic.instructions,
            action: ic.action,
            target: ic.target,
            contextColumns: ic.contextColumns,
            runMode: ic.runMode || 'manual',
            cardCount: ic.cardCount,
            interviewQuestions: ic.interviewQuestions || [],
            isEnabled: ic.isEnabled ?? false,
            triggers: ic.triggers || [],
            safeguards: ic.safeguards,
            lastExecutedAt: ic.lastExecutedAt,
            nextScheduledRun: ic.nextScheduledRun,
            dailyExecutionCount: ic.dailyExecutionCount ?? 0,
            dailyCountResetAt: ic.dailyCountResetAt,
            executionHistory: ic.executionHistory || [],
            createdAt: ic.createdAt,
            updatedAt: ic.updatedAt,
          }
        }
      }

      // Fetch and merge global resource shrooms (available to all users)
      try {
        const globalShroomsResponse = await fetchGlobalShrooms()
        for (const ic of globalShroomsResponse.instructionCards) {
          // Only add if not already present (user might own the channel with this shroom)
          if (!instructionCards[ic.id]) {
            instructionCards[ic.id] = {
              id: ic.id,
              channelId: ic.channelId,
              title: ic.title,
              instructions: ic.instructions,
              action: ic.action,
              target: ic.target,
              contextColumns: ic.contextColumns,
              runMode: ic.runMode || 'manual',
              cardCount: ic.cardCount,
              interviewQuestions: ic.interviewQuestions || [],
              isEnabled: ic.isEnabled ?? false,
              triggers: ic.triggers || [],
              safeguards: ic.safeguards,
              lastExecutedAt: ic.lastExecutedAt,
              nextScheduledRun: ic.nextScheduledRun,
              dailyExecutionCount: ic.dailyExecutionCount ?? 0,
              dailyCountResetAt: ic.dailyCountResetAt,
              executionHistory: ic.executionHistory || [],
              isGlobalResource: true,
              createdAt: ic.createdAt,
              updatedAt: ic.updatedAt,
            }
          }
        }
      } catch (e) {
        // Global shrooms are optional - don't fail if this errors
        console.warn('Could not fetch global shrooms:', e)
      }

      // Build folder order and channel order
      // Help folder (if present) should always be first in the order
      const serverFolders = foldersResponse.folders as ServerFolder[]
      const helpFolder = serverFolders.find((f) => f.id === '__help__')
      const userFolders = serverFolders
        .filter((f) => f.id !== '__help__')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      const folderOrder = helpFolder
        ? ['__help__', ...userFolders.map((f) => f.id)]
        : userFolders.map((f) => f.id)

      const channelOrder = foldersResponse.rootChannelIds

      // Load into store
      const serverData: ServerData = {
        channels,
        cards,
        tasks,
        instructionCards,
        folders,
        folderOrder,
        channelOrder,
      }

      loadFromServer(serverData)
      enableServerMode()
      setIsServerMode(true)
      setHasFetched(true)

      // Store channel IDs for Pusher subscription
      loadedChannelIdsRef.current = Object.keys(channels)
    } catch (err) {
      console.error('Failed to fetch server data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [loadFromServer])

  // Fetch data when authenticated
  useEffect(() => {
    if (sessionStatus === 'loading') {
      return
    }

    if (sessionStatus === 'authenticated' && session?.user?.id && !hasFetched) {
      fetchServerData()
    } else if (sessionStatus === 'unauthenticated') {
      // Not authenticated - use localStorage (default behavior)
      disableServerMode()
      setIsLoading(false)
      setIsServerMode(false)
    }
  }, [sessionStatus, session?.user?.id, hasFetched, fetchServerData])

  // Handler for applying events from BroadcastChannel or Pusher
  const applyEventHandler = useCallback((event: Parameters<typeof applyBroadcastEvent>[0]) => {
    // Apply the event to our local store
    const set = useStore.setState
    const get = useStore.getState
    applyBroadcastEvent(event, set, get)
  }, [])

  // Initialize cross-tab sync via BroadcastChannel
  useEffect(() => {
    const cleanup = initBroadcastSync(applyEventHandler)
    return cleanup
  }, [applyEventHandler])

  // Initialize Pusher for cross-device sync
  useEffect(() => {
    if (!isServerMode || !session?.user?.id || pusherInitialized) {
      return
    }

    // Initialize Pusher with the event handler
    const success = initPusher(applyEventHandler)

    if (success) {
      setPusherInitialized(true)

      // Subscribe to user's personal channel
      subscribeToUser(session.user.id)

      // Subscribe to all loaded channels
      if (loadedChannelIdsRef.current.length > 0) {
        subscribeToChannels(loadedChannelIdsRef.current)
      }
    }

    return () => {
      // Cleanup Pusher on unmount
      disconnectPusher()
      setPusherInitialized(false)
    }
  }, [isServerMode, session?.user?.id, pusherInitialized, applyEventHandler])

  // Track channel changes for Pusher subscriptions
  useEffect(() => {
    if (!pusherInitialized) {
      return
    }

    const currentChannelIds = Object.keys(localChannels)
    const subscribedChannels = getSubscribedChannels()

    // Subscribe to new channels
    for (const channelId of currentChannelIds) {
      if (!subscribedChannels.includes(channelId)) {
        subscribeToChannel(channelId)
      }
    }

    // Unsubscribe from removed channels
    for (const channelId of subscribedChannels) {
      if (!currentChannelIds.includes(channelId)) {
        unsubscribeFromChannel(channelId)
      }
    }
  }, [localChannels, pusherInitialized])

  const handleMigrationComplete = useCallback(() => {
    setShowMigration(false)
    // Refetch from server after migration
    setHasFetched(false)
  }, [])

  const value: ServerSyncContextValue = {
    isLoading: sessionStatus === 'loading' || isLoading,
    isServerMode,
    error,
    refetch: fetchServerData,
  }

  return (
    <ServerSyncContext.Provider value={value}>
      {children}
      {showMigration && (
        <MigrationModal
          onClose={() => setShowMigration(false)}
          onMigrationComplete={handleMigrationComplete}
        />
      )}
    </ServerSyncContext.Provider>
  )
}
