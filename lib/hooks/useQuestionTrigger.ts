'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuestionStore } from '@/lib/questionStore';
import { useSettingsStore } from '@/lib/settingsStore';
import type { Channel, Card } from '@/lib/types';

const MIN_TIME_BETWEEN_QUESTIONS = 5 * 60 * 1000; // 5 minutes
const CARD_ACTIONS_THRESHOLD = 3;
const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes idle before showing question

interface UseQuestionTriggerOptions {
  channel: Channel;
  cards: Record<string, Card>;
  isDragging: boolean;
}

interface UseQuestionTriggerReturn {
  recordCardMove: () => void;
  recordCardCreate: () => void;
  shouldShowQuestion: boolean;
  currentQuestion: ReturnType<typeof useQuestionStore.getState>['getNextQuestion'] extends (channelId: string) => infer R ? R : never;
  handleUseful: () => void;
  handleSnooze: () => void;
  handleDismiss: () => void;
  fetchQuestionsIfNeeded: () => Promise<void>;
}

export function useQuestionTrigger({
  channel,
  cards,
  isDragging,
}: UseQuestionTriggerOptions): UseQuestionTriggerReturn {
  const questionFrequency = useSettingsStore((s) => s.questionFrequency);
  const aiSettings = useSettingsStore((s) => s.ai);

  const {
    lastQuestionShownAt,
    sessionQuestionCount,
    cardActionsSinceLastQuestion,
    addQuestions,
    markUseful: markQueuedUseful,
    dismissQuestion: dismissQueuedQuestion,
    snoozeQuestion,
    recordCardAction,
    markQuestionShown,
    getNextQuestion,
    getPendingCount,
  } = useQuestionStore();

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Get the next pending question for this channel
  const currentQuestion = getNextQuestion(channel.id);

  // Determine if we should show a question based on frequency settings
  const canShowQuestion = useCallback((): boolean => {
    if (questionFrequency === 'off') return false;
    if (isDragging) return false;

    const now = Date.now();
    const timeSinceLastQuestion = lastQuestionShownAt
      ? now - lastQuestionShownAt
      : Infinity;

    // Rate limit: minimum time between questions
    if (timeSinceLastQuestion < MIN_TIME_BETWEEN_QUESTIONS) return false;

    // Session limits based on frequency mode
    if (questionFrequency === 'light' && sessionQuestionCount >= 1) return false;
    if (questionFrequency === 'moderate' && sessionQuestionCount >= 3) return false;

    return true;
  }, [questionFrequency, isDragging, lastQuestionShownAt, sessionQuestionCount]);

  // Check if triggers are met
  const triggersAreMet = useCallback((): boolean => {
    // Need enough card actions
    if (cardActionsSinceLastQuestion < CARD_ACTIONS_THRESHOLD) return false;
    return true;
  }, [cardActionsSinceLastQuestion]);

  // Should we show the question toast
  const shouldShowQuestion =
    currentQuestion !== null &&
    canShowQuestion() &&
    (triggersAreMet() || questionFrequency === 'light');

  // Fetch questions from API
  const fetchQuestionsIfNeeded = useCallback(async () => {
    if (isFetchingRef.current) return;
    if (questionFrequency === 'off') return;

    // Don't re-fetch if we already have pending questions for this channel
    const pendingCount = getPendingCount(channel.id);
    if (pendingCount > 0) return;

    // Rate limit fetching per channel
    if (hasFetchedRef.current) return;

    isFetchingRef.current = true;
    hasFetchedRef.current = true;

    try {
      const response = await fetch('/api/analyze-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          cards,
        }),
      });

      if (!response.ok) return;

      const result = await response.json();

      if (result.questions && result.questions.length > 0) {
        addQuestions(channel.id, result.questions);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    channel,
    cards,
    aiSettings,
    questionFrequency,
    addQuestions,
    getPendingCount,
  ]);

  // Record card actions
  const recordCardMove = useCallback(() => {
    recordCardAction();
  }, [recordCardAction]);

  const recordCardCreate = useCallback(() => {
    recordCardAction();
  }, [recordCardAction]);

  // Handle marking question as useful (no board modification - purely cerebral)
  const handleUseful = useCallback(() => {
    if (!currentQuestion) return;
    markQueuedUseful(currentQuestion.id);
    markQuestionShown();
  }, [currentQuestion, markQueuedUseful, markQuestionShown]);

  // Handle snoozing a question
  const handleSnooze = useCallback(() => {
    if (!currentQuestion) return;
    snoozeQuestion(currentQuestion.id);
    markQuestionShown();
  }, [currentQuestion, snoozeQuestion, markQuestionShown]);

  // Handle dismissing a question
  const handleDismiss = useCallback(() => {
    if (!currentQuestion) return;
    dismissQueuedQuestion(currentQuestion.id);
    markQuestionShown();
  }, [currentQuestion, dismissQueuedQuestion, markQuestionShown]);

  // Fetch questions when channel loads (if frequency is not off)
  useEffect(() => {
    if (questionFrequency !== 'off') {
      // Small delay to not block initial render
      const timer = setTimeout(() => {
        fetchQuestionsIfNeeded();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [channel.id, questionFrequency]);

  // Reset fetch flag when channel changes
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [channel.id]);

  // Idle timer for showing questions after inactivity
  useEffect(() => {
    if (questionFrequency === 'off') return;

    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        // If we have cards and questions pending, trigger check
        const channelCards = Object.values(cards).filter(
          (c) => c.channelId === channel.id
        );
        if (channelCards.length > 0 && canShowQuestion()) {
          fetchQuestionsIfNeeded();
        }
      }, IDLE_TIMEOUT);
    };

    resetIdleTimer();

    // Reset on any user interaction
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetIdleTimer));

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      events.forEach((event) =>
        window.removeEventListener(event, resetIdleTimer)
      );
    };
  }, [channel.id, questionFrequency, cards, canShowQuestion, fetchQuestionsIfNeeded]);

  return {
    recordCardMove,
    recordCardCreate,
    shouldShowQuestion,
    currentQuestion,
    handleUseful,
    handleSnooze,
    handleDismiss,
    fetchQuestionsIfNeeded,
  };
}
