import type { CardEvent } from './types';

type CardEventListener = (event: CardEvent) => void;
type ThresholdCheckListener = (channelId: string) => void;

// Simple event emitter for automation events
class AutomationEventBus {
  private cardEventListeners: Set<CardEventListener> = new Set();
  private thresholdListeners: Set<ThresholdCheckListener> = new Set();

  // Subscribe to card events
  onCardEvent(listener: CardEventListener): () => void {
    this.cardEventListeners.add(listener);
    return () => this.cardEventListeners.delete(listener);
  }

  // Subscribe to threshold checks
  onThresholdCheck(listener: ThresholdCheckListener): () => void {
    this.thresholdListeners.add(listener);
    return () => this.thresholdListeners.delete(listener);
  }

  // Emit a card event
  emitCardEvent(event: CardEvent): void {
    // Use setTimeout to avoid blocking the main operation
    setTimeout(() => {
      this.cardEventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[AutomationEvents] Error in card event listener:', error);
        }
      });
    }, 0);
  }

  // Emit a threshold check request
  emitThresholdCheck(channelId: string): void {
    // Use setTimeout to avoid blocking the main operation
    setTimeout(() => {
      this.thresholdListeners.forEach(listener => {
        try {
          listener(channelId);
        } catch (error) {
          console.error('[AutomationEvents] Error in threshold listener:', error);
        }
      });
    }, 0);
  }
}

// Singleton instance
export const automationEvents = new AutomationEventBus();

// Convenience functions for emitting events
export function emitCardMoved(
  cardId: string,
  channelId: string,
  fromColumnId: string,
  toColumnId: string,
  createdByInstructionId?: string
): void {
  automationEvents.emitCardEvent({
    type: 'moved',
    cardId,
    channelId,
    fromColumnId,
    toColumnId,
    createdByInstructionId,
  });
  // Also check thresholds after a move
  automationEvents.emitThresholdCheck(channelId);
}

export function emitCardCreated(
  cardId: string,
  channelId: string,
  toColumnId: string,
  createdByInstructionId?: string
): void {
  automationEvents.emitCardEvent({
    type: 'created',
    cardId,
    channelId,
    toColumnId,
    createdByInstructionId,
  });
  // Also check thresholds after creation
  automationEvents.emitThresholdCheck(channelId);
}

export function emitCardModified(
  cardId: string,
  channelId: string
): void {
  automationEvents.emitCardEvent({
    type: 'modified',
    cardId,
    channelId,
  });
}

export function emitCardDeleted(channelId: string): void {
  // Just check thresholds after deletion (the card no longer exists)
  automationEvents.emitThresholdCheck(channelId);
}
