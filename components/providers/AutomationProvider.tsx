'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useStore, getAIAbortSignal } from '@/lib/store';
import { useToastStore } from '@/lib/toastStore';
import {
  checkThresholdTriggers,
  initializeScheduledTriggers,
  type AutomationContext,
} from '@/lib/automationEngine';
import { automationEvents } from '@/lib/automationEvents';
import { useServerSync } from '@/components/providers/ServerSyncProvider';

interface AutomationContextValue {
  checkThresholds: (channelId: string) => void;
}

const AutomationCtx = createContext<AutomationContextValue | null>(null);

export function AutomationProvider({ children }: { children: React.ReactNode }) {
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
  const { refetch } = useServerSync();

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
      refetch,
      onCardsSkipped: (count: number, instructionTitle: string) => {
        const addToast = useToastStore.getState().addToast;
        addToast(
          `Skipped ${count} card${count > 1 ? 's' : ''} already processed by "${instructionTitle}"`,
          'info',
          4000
        );
      },
    };
  }, [refetch]);

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

  // The 60s scheduled poll that used to live here is gone: /api/cron/shrooms runs
  // scheduled shrooms server-side, so polling from a tab would just double-fire them
  // (and only while someone happened to be looking at the board).

  // Subscribe to automation events from the event bus
  useEffect(() => {
    // Card created / moved events are handled server-side (lib/shrooms/runEventTriggers.ts)
    // from the routes that write the row, so they fire whether or not a tab is open.
    // Subscribing here as well would run every shroom twice.

    const unsubscribeThreshold = automationEvents.onThresholdCheck(async (channelId) => {
      const ctx = getAutomationContext();
      try {
        await checkThresholdTriggers(ctx, channelId);
      } catch (error) {
        console.error('[Automation] Error checking thresholds:', error);
      }
    });

    return () => {
      unsubscribeThreshold();
    };
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
