import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  channels,
  columns,
  cards,
  tasks,
  instructionCards,
  folders,
  userChannelOrg,
} from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Types matching the localStorage structure
interface LocalStorageData {
  channels: Record<string, LocalChannel>
  cards: Record<string, LocalCard>
  tasks: Record<string, LocalTask>
  instructionCards: Record<string, LocalInstructionCard>
  folders: Record<string, LocalFolder>
  folderOrder: string[]
  channelOrder: string[]
}

interface LocalChannel {
  id: string
  name: string
  description: string
  status: 'active' | 'paused' | 'archived'
  aiInstructions: string
  includeBacksideInAI?: boolean
  instructionCardIds?: string[]
  columns: LocalColumn[]
  questions?: unknown[]
  instructionHistory?: unknown[]
  suggestionMode?: 'off' | 'manual' | 'daily'
  propertyDefinitions?: unknown[]
  tagDefinitions?: unknown[]
  unlinkedTaskOrder?: string[]
  createdAt: string
  updatedAt: string
}

interface LocalColumn {
  id: string
  name: string
  instructions?: string
  processingPrompt?: string
  autoProcess?: boolean
  cardIds: string[]
  backsideCardIds?: string[]
  isAiTarget?: boolean
}

interface LocalCard {
  id: string
  channelId: string
  title: string
  messages: unknown[]
  coverImageUrl?: string
  summary?: string
  summaryUpdatedAt?: string
  source: 'manual' | 'ai'
  properties?: unknown[]
  tags?: string[]
  spawnedChannelIds?: string[]
  taskIds?: string[]
  hideCompletedTasks?: boolean
  createdAt: string
  updatedAt: string
  createdByInstructionId?: string
  processedByInstructions?: Record<string, string>
}

interface LocalTask {
  id: string
  cardId: string | null
  channelId: string
  title: string
  description: string
  status: 'not_started' | 'in_progress' | 'done'
  createdAt: string
  updatedAt: string
  completedAt?: string
  assignedTo?: string
  dueDate?: string
}

interface LocalInstructionCard {
  id: string
  channelId: string
  title: string
  instructions: string
  action: 'generate' | 'modify' | 'move'
  target: unknown
  contextColumns?: unknown
  runMode: 'manual' | 'automatic'
  cardCount?: number
  interviewQuestions?: string[]
  createdAt: string
  updatedAt: string
  triggers?: unknown[]
  safeguards?: unknown
  isEnabled?: boolean
  lastExecutedAt?: string
  nextScheduledRun?: string
  dailyExecutionCount?: number
  dailyCountResetAt?: string
  executionHistory?: unknown[]
}

interface LocalFolder {
  id: string
  name: string
  channelIds: string[]
  isCollapsed?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * POST /api/migrate
 * Import localStorage data to the database
 */
export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const data = (await req.json()) as LocalStorageData

    // Validate the data structure
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
    }

    const {
      channels: localChannels = {},
      cards: localCards = {},
      tasks: localTasks = {},
      instructionCards: localInstructionCards = {},
      folders: localFolders = {},
      folderOrder = [],
      channelOrder = [],
    } = data

    // Track ID mappings (old ID -> new ID)
    // We'll use the same IDs since they're nanoid format already
    const channelIdMap = new Map<string, string>()
    const columnIdMap = new Map<string, string>()
    const cardIdMap = new Map<string, string>()
    const taskIdMap = new Map<string, string>()
    const instructionIdMap = new Map<string, string>()
    const folderIdMap = new Map<string, string>()

    const now = new Date()

    // 1. Create folders first
    let folderPosition = 0
    for (const folderId of folderOrder) {
      const folder = localFolders[folderId]
      if (!folder) continue

      const newFolderId = nanoid()
      folderIdMap.set(folder.id, newFolderId)

      await db.insert(folders).values({
        id: newFolderId,
        userId,
        name: folder.name,
        isCollapsed: folder.isCollapsed ?? false,
        position: folderPosition++,
        createdAt: new Date(folder.createdAt),
        updatedAt: new Date(folder.updatedAt),
      })
    }

    // 2. Create channels
    for (const channelId of Object.keys(localChannels)) {
      const channel = localChannels[channelId]
      const newChannelId = nanoid()
      channelIdMap.set(channel.id, newChannelId)

      await db.insert(channels).values({
        id: newChannelId,
        ownerId: userId,
        name: channel.name,
        description: channel.description,
        status: channel.status,
        aiInstructions: channel.aiInstructions,
        includeBacksideInAI: channel.includeBacksideInAI ?? false,
        suggestionMode: channel.suggestionMode ?? 'off',
        propertyDefinitions: channel.propertyDefinitions as any,
        tagDefinitions: channel.tagDefinitions as any,
        questions: channel.questions as any,
        instructionHistory: channel.instructionHistory as any,
        unlinkedTaskOrder: channel.unlinkedTaskOrder,
        createdAt: new Date(channel.createdAt),
        updatedAt: new Date(channel.updatedAt),
      })

      // 3. Create columns for this channel
      for (let colIndex = 0; colIndex < channel.columns.length; colIndex++) {
        const col = channel.columns[colIndex]
        const newColumnId = nanoid()
        columnIdMap.set(col.id, newColumnId)

        await db.insert(columns).values({
          id: newColumnId,
          channelId: newChannelId,
          name: col.name,
          instructions: col.instructions,
          processingPrompt: col.processingPrompt,
          autoProcess: col.autoProcess ?? false,
          isAiTarget: col.isAiTarget ?? false,
          position: colIndex,
          createdAt: now,
          updatedAt: now,
        })

        // 4. Create cards for this column (front side)
        for (let cardIndex = 0; cardIndex < col.cardIds.length; cardIndex++) {
          const cardId = col.cardIds[cardIndex]
          const card = localCards[cardId]
          if (!card) continue

          const newCardId = nanoid()
          cardIdMap.set(card.id, newCardId)

          await db.insert(cards).values({
            id: newCardId,
            channelId: newChannelId,
            columnId: newColumnId,
            title: card.title,
            messages: card.messages as any,
            coverImageUrl: card.coverImageUrl,
            summary: card.summary,
            summaryUpdatedAt: card.summaryUpdatedAt ? new Date(card.summaryUpdatedAt) : null,
            source: card.source,
            properties: card.properties as any,
            tags: card.tags,
            position: cardIndex,
            isArchived: false,
            hideCompletedTasks: card.hideCompletedTasks ?? false,
            createdByInstructionId: card.createdByInstructionId,
            processedByInstructions: card.processedByInstructions,
            spawnedChannelIds: card.spawnedChannelIds,
            createdAt: new Date(card.createdAt),
            updatedAt: new Date(card.updatedAt),
          })
        }

        // 5. Create cards for backside (archived)
        const backsideCardIds = col.backsideCardIds ?? []
        for (let cardIndex = 0; cardIndex < backsideCardIds.length; cardIndex++) {
          const cardId = backsideCardIds[cardIndex]
          const card = localCards[cardId]
          if (!card) continue

          const newCardId = nanoid()
          cardIdMap.set(card.id, newCardId)

          await db.insert(cards).values({
            id: newCardId,
            channelId: newChannelId,
            columnId: newColumnId,
            title: card.title,
            messages: card.messages as any,
            coverImageUrl: card.coverImageUrl,
            summary: card.summary,
            summaryUpdatedAt: card.summaryUpdatedAt ? new Date(card.summaryUpdatedAt) : null,
            source: card.source,
            properties: card.properties as any,
            tags: card.tags,
            position: cardIndex,
            isArchived: true,
            hideCompletedTasks: card.hideCompletedTasks ?? false,
            createdByInstructionId: card.createdByInstructionId,
            processedByInstructions: card.processedByInstructions,
            spawnedChannelIds: card.spawnedChannelIds,
            createdAt: new Date(card.createdAt),
            updatedAt: new Date(card.updatedAt),
          })
        }
      }
    }

    // 6. Create tasks (after cards so we can reference them)
    for (const taskId of Object.keys(localTasks)) {
      const task = localTasks[taskId]
      const newTaskId = nanoid()
      taskIdMap.set(task.id, newTaskId)

      const newChannelId = channelIdMap.get(task.channelId)
      const newCardId = task.cardId ? cardIdMap.get(task.cardId) : null

      if (!newChannelId) continue // Skip if channel wasn't migrated

      await db.insert(tasks).values({
        id: newTaskId,
        channelId: newChannelId,
        cardId: newCardId,
        title: task.title,
        description: task.description,
        status: task.status,
        assignedTo: task.assignedTo,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        completedAt: task.completedAt ? new Date(task.completedAt) : null,
        position: 0, // Will be determined by card's taskIds order
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      })
    }

    // 7. Create instruction cards
    for (const icId of Object.keys(localInstructionCards)) {
      const ic = localInstructionCards[icId]
      const newIcId = nanoid()
      instructionIdMap.set(ic.id, newIcId)

      const newChannelId = channelIdMap.get(ic.channelId)
      if (!newChannelId) continue

      // Update target column IDs if present
      let target = ic.target as any
      if (target?.type === 'column' && target.columnId) {
        const newColId = columnIdMap.get(target.columnId)
        if (newColId) {
          target = { type: 'column', columnId: newColId }
        }
      } else if (target?.type === 'columns' && target.columnIds) {
        const newColIds = target.columnIds
          .map((id: string) => columnIdMap.get(id))
          .filter(Boolean)
        target = { type: 'columns', columnIds: newColIds }
      }

      // Update context column IDs if present
      let contextColumns = ic.contextColumns as any
      if (contextColumns?.type === 'columns' && contextColumns.columnIds) {
        const newColIds = contextColumns.columnIds
          .map((id: string) => columnIdMap.get(id))
          .filter(Boolean)
        contextColumns = { type: 'columns', columnIds: newColIds }
      }

      await db.insert(instructionCards).values({
        id: newIcId,
        channelId: newChannelId,
        title: ic.title,
        instructions: ic.instructions,
        action: ic.action,
        target,
        contextColumns,
        runMode: ic.runMode,
        cardCount: ic.cardCount,
        interviewQuestions: ic.interviewQuestions,
        isEnabled: ic.isEnabled ?? false,
        triggers: ic.triggers as any,
        safeguards: ic.safeguards as any,
        lastExecutedAt: ic.lastExecutedAt ? new Date(ic.lastExecutedAt) : null,
        nextScheduledRun: ic.nextScheduledRun ? new Date(ic.nextScheduledRun) : null,
        dailyExecutionCount: ic.dailyExecutionCount ?? 0,
        dailyCountResetAt: ic.dailyCountResetAt ? new Date(ic.dailyCountResetAt) : null,
        executionHistory: ic.executionHistory as any,
        position: 0, // Will be set from channel's instructionCardIds order
        createdAt: new Date(ic.createdAt),
        updatedAt: new Date(ic.updatedAt),
      })
    }

    // 8. Create user channel organization entries
    // First, channels in folders
    for (const folderId of folderOrder) {
      const folder = localFolders[folderId]
      if (!folder) continue

      const newFolderId = folderIdMap.get(folder.id)
      if (!newFolderId) continue

      for (let pos = 0; pos < folder.channelIds.length; pos++) {
        const channelId = folder.channelIds[pos]
        const newChannelId = channelIdMap.get(channelId)
        if (!newChannelId) continue

        await db.insert(userChannelOrg).values({
          userId,
          channelId: newChannelId,
          folderId: newFolderId,
          position: pos,
        })
      }
    }

    // Then, channels at root level
    for (let pos = 0; pos < channelOrder.length; pos++) {
      const channelId = channelOrder[pos]
      const newChannelId = channelIdMap.get(channelId)
      if (!newChannelId) continue

      await db.insert(userChannelOrg).values({
        userId,
        channelId: newChannelId,
        folderId: null,
        position: pos,
      })
    }

    return NextResponse.json({
      success: true,
      migrated: {
        channels: channelIdMap.size,
        cards: cardIdMap.size,
        tasks: taskIdMap.size,
        instructionCards: instructionIdMap.size,
        folders: folderIdMap.size,
      },
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
