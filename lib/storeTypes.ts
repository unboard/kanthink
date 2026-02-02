/**
 * Store type definitions for use in other modules.
 * This avoids circular dependencies when modules need to reference the store type.
 */

import type { StoreApi } from 'zustand'
import type { ID, Channel, Card, Task, InstructionCard, Folder, InstructionRun } from './types'

// Minimal state shape for the apply function
export interface KanthinkStateShape {
  channels: Record<ID, Channel>
  cards: Record<ID, Card>
  tasks: Record<ID, Task>
  instructionCards: Record<ID, InstructionCard>
  folders: Record<ID, Folder>
  folderOrder: ID[]
  channelOrder: ID[]
  instructionRuns: Record<ID, InstructionRun>
}

// Store API type
export type KanthinkStore = StoreApi<KanthinkStateShape>
