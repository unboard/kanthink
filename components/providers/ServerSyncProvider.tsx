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
  setNotificationCallback,
} from '@/lib/sync/pusherClient'
import { useNotificationStore } from '@/lib/notificationStore'
import { useToastStore } from '@/lib/toastStore'
import { registerServiceWorker, requestNotificationPermission, showBrowserNotification } from '@/lib/notifications/serviceWorker'
import type { NotificationData } from '@/lib/notifications/types'
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
  // Track last fetch time for visibility-based refetch
  const lastFetchTimeRef = useRef<number>(0)

  const fetchServerData = useCallback(async () => {
    try {
      // Only show loading state on initial fetch, not background refetches.
      // If we've fetched before (lastFetchTimeRef > 0), this is a background refresh.
      if (lastFetchTimeRef.current === 0) {
        setIsLoading(true)
      }
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
      // Use Promise.allSettled so one failing channel doesn't block the rest.
      // For channels that fail, include them with basic info from the list response
      // so they still appear in the sidebar.
      const channelResults = await Promise.allSettled(
        channelsResponse.channels.map((ch) => fetchChannel(ch.id))
      )

      // Separate successful and failed fetches
      const channelDetails: Awaited<ReturnType<typeof fetchChannel>>[] = []
      const failedChannelIds: string[] = []

      channelsResponse.channels.forEach((ch, i) => {
        const result = channelResults[i]
        if (result.status === 'fulfilled') {
          channelDetails.push(result.value)
        } else {
          failedChannelIds.push(ch.id)
          console.warn(`Failed to load channel ${ch.id} (${ch.name}):`, result.reason)
        }
      })

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
          role: channel.role,
          sharedBy: channel.sharedBy,
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
            conversationHistory: ic.conversationHistory || [],
            steps: ic.steps || undefined,
            createdAt: ic.createdAt,
            updatedAt: ic.updatedAt,
          }
        }
      }

      // Include channels that failed to load - preserve existing store data if available,
      // otherwise fall back to basic info from the list response
      if (failedChannelIds.length > 0) {
        const roleMap = new Map(channelsResponse.channels.map((c) => [c.id, (c as Channel & { role: string }).role]))
        const sharedByMap = new Map(channelsResponse.channels.map((c) => [c.id, (c as Channel & { sharedBy?: unknown }).sharedBy]))
        const currentStore = useStore.getState()

        for (const ch of channelsResponse.channels) {
          if (failedChannelIds.includes(ch.id) && !channels[ch.id]) {
            // Preserve existing data from the store (localStorage) if available
            const existingChannel = currentStore.channels[ch.id]
            if (existingChannel && existingChannel.columns.length > 0) {
              channels[ch.id] = existingChannel
              // Also preserve cards, tasks, and instruction cards for this channel
              for (const col of existingChannel.columns) {
                for (const cardId of [...col.cardIds, ...(col.backsideCardIds || [])]) {
                  if (currentStore.cards[cardId]) {
                    cards[cardId] = currentStore.cards[cardId]
                    // Preserve tasks for this card
                    for (const taskId of (currentStore.cards[cardId].taskIds || [])) {
                      if (currentStore.tasks[taskId]) {
                        tasks[taskId] = currentStore.tasks[taskId]
                      }
                    }
                  }
                }
              }
              for (const icId of (existingChannel.instructionCardIds || [])) {
                if (currentStore.instructionCards[icId]) {
                  instructionCards[icId] = currentStore.instructionCards[icId]
                }
              }
            } else {
              channels[ch.id] = {
                id: ch.id,
                name: ch.name || 'Unknown Channel',
                description: ch.description || '',
                status: ch.status || 'active',
                aiInstructions: ch.aiInstructions || '',
                role: (roleMap.get(ch.id) || 'viewer') as Channel['role'],
                sharedBy: sharedByMap.get(ch.id) as Channel['sharedBy'],
                columns: [],
                instructionCardIds: [],
                createdAt: ch.createdAt,
                updatedAt: ch.updatedAt,
              }
            }
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
              conversationHistory: ic.conversationHistory || [],
              steps: ic.steps || undefined,
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
      lastFetchTimeRef.current = Date.now()

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

    if (sessionStatus === 'authenticated' && session?.user?.id) {
      // Enable server mode immediately when authenticated so that
      // any actions taken before data loads will still sync to server
      enableServerMode()
      setIsServerMode(true)

      if (!hasFetched) {
        fetchServerData()
      }
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
  // Note: We don't disconnect on cleanup to avoid React StrictMode double-render issues
  // Pusher will be disconnected when the user logs out or the page unloads
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

      // Register service worker for browser notifications
      registerServiceWorker()

      // Track whether we've already prompted for notification permission this session
      let hasPromptedPermission = false

      // Set up notification event handler
      setNotificationCallback((data) => {
        const notification = data as unknown as NotificationData
        useNotificationStore.getState().addNotification(notification)
        useToastStore.getState().addToast(notification.title, 'info')

        // Show browser notification if tab is hidden
        if (document.visibilityState === 'hidden') {
          showBrowserNotification({
            title: notification.title,
            body: notification.body,
            notificationId: notification.id,
            url: (notification.data as Record<string, unknown>)?.channelId
              ? `/channel/${(notification.data as Record<string, unknown>).channelId}`
              : '/',
          })
        }

        // Prompt for browser notification permission on first notification
        if (
          !hasPromptedPermission &&
          'Notification' in window &&
          Notification.permission === 'default'
        ) {
          hasPromptedPermission = true
          // Show prompt after a short delay so the notification toast appears first
          setTimeout(() => {
            useToastStore.getState().addToast(
              'Get notified even when this tab is in the background?',
              'info',
              0, // Don't auto-dismiss
              {
                label: 'Enable',
                onClick: async () => {
                  const result = await requestNotificationPermission()
                  useNotificationStore.getState().setHasPermission(result === 'granted')
                  if (result === 'granted') {
                    fetch('/api/notifications/preferences', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ browserNotificationsEnabled: true }),
                    }).catch(() => {})
                  }
                },
              }
            )
          }, 1500)
        }
      })
    }
    // No cleanup - Pusher connection persists for the session
  }, [isServerMode, session?.user?.id, pusherInitialized, applyEventHandler])

  // Load initial notifications after data fetch
  useEffect(() => {
    if (!hasFetched || !session?.user?.id) return

    fetch('/api/notifications?limit=50')
      .then(res => res.json())
      .then(data => {
        if (data.notifications) {
          useNotificationStore.getState().loadNotifications(data.notifications)
        }
      })
      .catch(() => {})

    // Check notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      useNotificationStore.getState().setHasPermission(Notification.permission === 'granted')
    }
  }, [hasFetched, session?.user?.id])

  // Handle service worker notification clicks
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        const { notificationId, url } = event.data
        if (notificationId) {
          useNotificationStore.getState().markAsRead(notificationId)
        }
        if (url && url !== window.location.pathname) {
          window.location.href = url
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // Refetch when tab regains visibility after being backgrounded
  // Mobile browsers kill WebSocket connections when backgrounded, so Pusher
  // misses events. This ensures fresh data when the user returns.
  useEffect(() => {
    if (!isServerMode) return

    const STALE_THRESHOLD = 30_000 // 30 seconds

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchTimeRef.current
        if (elapsed > STALE_THRESHOLD) {
          fetchServerData()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isServerMode, fetchServerData])

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
