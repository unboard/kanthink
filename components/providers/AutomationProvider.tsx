'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useStore, getAIAbortSignal } from '@/lib/store';
import { useToastStore } from '@/lib/toastStore';
import type { CardEvent } from '@/lib/types';
import {
  checkScheduledTriggers,
  checkEventTriggers,
  checkThresholdTriggers,
  initializeScheduledTriggers,
  type AutomationContext,
} from '@/lib/automationEngine';
import { automationEvents } from '@/lib/automationEvents';

interface AutomationContextValue {
  emitCardEvent: (event: CardEvent) => void;
  checkThresholds: (channelId: string) => void;
}

const AutomationCtx = createContext<AutomationContextValue | null>(null);

const POLL_INTERVAL = 60000; // Check scheduled triggers every 60 seconds

export function AutomationProvider({ children }: { children: React.ReactNode }) {
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false);

  // Get store state and actions
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const tasks = useStore((s) => s.tasks);
  const instructionCards = useStore((s) => s.instructionCards);

  // Get store actions
  const createCard = useStore((s) => s.createCard);
  const updateCard = useStore((s) => s.updateCard);
  const moveCard = useStore((s) => s.moveCard);
  const setCardProperty = useStore((s) => s.setCardProperty);
  const addMessage = useStore((s) => s.addMessage);
  const createTask = useStore((s) => s.createTask);
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);
  const startAIOperation = useStore((s) => s.startAIOperation);
  const completeAIOperation = useStore((s) => s.completeAIOperation);
  const setCardProcessing = useStore((s) => s.setCardProcessing);
  const setInstructionRunning = useStore((s) => s.setInstructionRunning);

  // Build automation context
  const getAutomationContext = useCallback((): AutomationContext => {
    // Get current state directly from store
    const state = useStore.getState();

    return {
      channels: state.channels,
      cards: state.cards,
      tasks: state.tasks,
      instructionCards: state.instructionCards,
      createCard: (channelId, columnId, input, source, createdByInstructionId) => {
        // Pass createdByInstructionId directly to store for loop prevention
        state.createCard(channelId, columnId, input, source, createdByInstructionId);
      },
      updateCard: state.updateCard,
      moveCard: state.moveCard,
      setCardProperty: state.setCardProperty,
      addMessage: state.addMessage,
      createTask: state.createTask,
      updateInstructionCard: state.updateInstructionCard,
      startAIOperation: state.startAIOperation,
      completeAIOperation: state.completeAIOperation,
      setCardProcessing: state.setCardProcessing,
      setInstructionRunning: state.setInstructionRunning,
      getAIAbortSignal: getAIAbortSignal,
      recordInstructionRun: state.recordInstructionRun,
      addTagDefinition: state.addTagDefinition,
      addTagToCard: state.addTagToCard,
      onCardsSkipped: (count: number, instructionTitle: string) => {
        const addToast = useToastStore.getState().addToast;
        addToast(
          `Skipped ${count} card${count > 1 ? 's' : ''} already processed by "${instructionTitle}"`,
          'info',
          4000
        );
      },
    };
  }, []);

  // Initialize scheduled triggers on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Give the store time to hydrate from localStorage
    const initTimeout = setTimeout(() => {
      const ctx = getAutomationContext();
      initializeScheduledTriggers(ctx);
    }, 1000);

    return () => clearTimeout(initTimeout);
  }, [getAutomationContext]);

  // Start polling for scheduled triggers
  useEffect(() => {
    const checkScheduled = async () => {
      const ctx = getAutomationContext();
      try {
        await checkScheduledTriggers(ctx);
      } catch (error) {
        console.error('[Automation] Error checking scheduled triggers:', error);
      }
    };

    // Initial check after a delay
    const initialTimeout = setTimeout(checkScheduled, 5000);

    // Set up polling
    pollIntervalRef.current = setInterval(checkScheduled, POLL_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [getAutomationContext]);

  // Subscribe to automation events from the event bus
  useEffect(() => {
    const unsubscribeCardEvent = automationEvents.onCardEvent(async (event) => {
      const ctx = getAutomationContext();
      try {
        await checkEventTriggers(ctx, event);
      } catch (error) {
        console.error('[Automation] Error handling card event:', error);
      }
    });

    const unsubscribeThreshold = automationEvents.onThresholdCheck(async (channelId) => {
      const ctx = getAutomationContext();
      try {
        await checkThresholdTriggers(ctx, channelId);
      } catch (error) {
        console.error('[Automation] Error checking thresholds:', error);
      }
    });

    return () => {
      unsubscribeCardEvent();
      unsubscribeThreshold();
    };
  }, [getAutomationContext]);

  // Handler for card events
  const emitCardEvent = useCallback(async (event: CardEvent) => {
    const ctx = getAutomationContext();
    try {
      await checkEventTriggers(ctx, event);
    } catch (error) {
      console.error('[Automation] Error checking event triggers:', error);
    }
  }, [getAutomationContext]);

  // Handler for threshold checks
  const checkThresholds = useCallback(async (channelId: string) => {
    const ctx = getAutomationContext();
    try {
      await checkThresholdTriggers(ctx, channelId);
    } catch (error) {
      console.error('[Automation] Error checking threshold triggers:', error);
    }
  }, [getAutomationContext]);

  const value: AutomationContextValue = {
    emitCardEvent,
    checkThresholds,
  };

  return (
    <AutomationCtx.Provider value={value}>
      {children}
    </AutomationCtx.Provider>
  );
}

export function useAutomation() {
  const context = useContext(AutomationCtx);
  if (!context) {
    throw new Error('useAutomation must be used within an AutomationProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for components that may be outside)
export function useAutomationOptional() {
  return useContext(AutomationCtx);
}
