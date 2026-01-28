import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type QuestionStatus = 'pending' | 'snoozed' | 'useful' | 'dismissed';

export interface QueuedQuestion {
  id: string;
  channelId: string;
  question: string;
  context: string;
  suggestedAnswers: string[];
  status: QuestionStatus;
  snoozedUntil?: number;
  createdAt: number;
}

interface QuestionQueueState {
  questions: QueuedQuestion[];
  lastQuestionShownAt: number | null;
  sessionQuestionCount: number;
  cardActionsSinceLastQuestion: number;

  // Actions
  addQuestions: (channelId: string, questions: Array<{ question: string; context: string; suggestedAnswers: string[] }>) => void;
  markUseful: (questionId: string) => void;
  dismissQuestion: (questionId: string) => void;
  snoozeQuestion: (questionId: string) => void;
  recordCardAction: () => void;
  markQuestionShown: () => void;
  resetSessionCount: () => void;
  getNextQuestion: (channelId: string) => QueuedQuestion | null;
  getPendingCount: (channelId: string) => number;
  clearChannelQuestions: (channelId: string) => void;
}

const SNOOZE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const useQuestionStore = create<QuestionQueueState>()(
  persist(
    (set, get) => ({
      questions: [],
      lastQuestionShownAt: null,
      sessionQuestionCount: 0,
      cardActionsSinceLastQuestion: 0,

      addQuestions: (channelId, newQuestions) => {
        const existingQuestions = get().questions;
        const existingTexts = new Set(existingQuestions.map((q) => q.question));

        const questionsToAdd: QueuedQuestion[] = newQuestions
          .filter((q) => !existingTexts.has(q.question))
          .map((q) => ({
            id: nanoid(),
            channelId,
            question: q.question,
            context: q.context,
            suggestedAnswers: q.suggestedAnswers,
            status: 'pending' as const,
            createdAt: Date.now(),
          }));

        if (questionsToAdd.length > 0) {
          set((state) => ({
            questions: [...state.questions, ...questionsToAdd],
          }));
        }
      },

      markUseful: (questionId) => {
        set((state) => ({
          questions: state.questions.map((q) =>
            q.id === questionId ? { ...q, status: 'useful' as const } : q
          ),
        }));
      },

      dismissQuestion: (questionId) => {
        set((state) => ({
          questions: state.questions.map((q) =>
            q.id === questionId ? { ...q, status: 'dismissed' as const } : q
          ),
        }));
      },

      snoozeQuestion: (questionId) => {
        set((state) => ({
          questions: state.questions.map((q) =>
            q.id === questionId
              ? { ...q, status: 'snoozed' as const, snoozedUntil: Date.now() + SNOOZE_DURATION_MS }
              : q
          ),
        }));
      },

      recordCardAction: () => {
        set((state) => ({
          cardActionsSinceLastQuestion: state.cardActionsSinceLastQuestion + 1,
        }));
      },

      markQuestionShown: () => {
        set((state) => ({
          lastQuestionShownAt: Date.now(),
          sessionQuestionCount: state.sessionQuestionCount + 1,
          cardActionsSinceLastQuestion: 0,
        }));
      },

      resetSessionCount: () => {
        set({ sessionQuestionCount: 0 });
      },

      getNextQuestion: (channelId) => {
        const now = Date.now();
        const questions = get().questions;

        // Find first pending question for this channel
        const pending = questions.find(
          (q) => q.channelId === channelId && q.status === 'pending'
        );
        if (pending) return pending;

        // Check for snoozed questions that are ready
        const readySnoozed = questions.find(
          (q) =>
            q.channelId === channelId &&
            q.status === 'snoozed' &&
            q.snoozedUntil &&
            q.snoozedUntil <= now
        );
        if (readySnoozed) {
          // Promote back to pending
          set((state) => ({
            questions: state.questions.map((q) =>
              q.id === readySnoozed.id ? { ...q, status: 'pending' as const, snoozedUntil: undefined } : q
            ),
          }));
          return { ...readySnoozed, status: 'pending' as const, snoozedUntil: undefined };
        }

        return null;
      },

      getPendingCount: (channelId) => {
        const now = Date.now();
        return get().questions.filter(
          (q) =>
            q.channelId === channelId &&
            (q.status === 'pending' || (q.status === 'snoozed' && q.snoozedUntil && q.snoozedUntil <= now))
        ).length;
      },

      clearChannelQuestions: (channelId) => {
        set((state) => ({
          questions: state.questions.filter((q) => q.channelId !== channelId),
        }));
      },
    }),
    {
      name: 'kanthink-question-queue',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        questions: state.questions,
        lastQuestionShownAt: state.lastQuestionShownAt,
      }),
    }
  )
);
