'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import type { AIOperationContext } from '@/lib/types';

// Verbs that work with different contexts
const VERBS = ['Reading', 'Analyzing', 'Processing', 'Exploring', 'Considering', 'Examining', 'Parsing'];
const CREATIVE_VERBS = ['Imagining', 'Crafting', 'Shaping', 'Composing', 'Designing'];
const THINKING_VERBS = ['Thinking about', 'Pondering', 'Mulling over', 'Reflecting on'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a single contextual message based on current context and cycle
function generateMessage(context?: AIOperationContext, cycle: number = 0): string {
  if (!context) {
    return pickRandom(['Processing', 'Working', 'Thinking']);
  }

  const { action, instructionTitle, targetColumnName, keywords = [] } = context;
  const isCreative = keywords.includes('creative');

  // Different message patterns based on cycle position
  const patterns = [
    // Pattern: verb + instruction title
    () => instructionTitle
      ? `${pickRandom(isCreative ? CREATIVE_VERBS : VERBS)} "${instructionTitle}"`
      : null,

    // Pattern: verb + column
    () => targetColumnName
      ? `${pickRandom(THINKING_VERBS)} ${targetColumnName}`
      : null,

    // Pattern: action-specific
    () => {
      if (action === 'generate') return `Generating ${context.cardCount || 'new'} ideas`;
      if (action === 'modify') return 'Refining content';
      if (action === 'move') return 'Deciding where cards belong';
      return null;
    },

    // Pattern: keyword-based
    () => {
      if (keywords.includes('creative')) return pickRandom(['Finding inspiration', 'Channeling creativity', 'Mixing ideas']);
      if (keywords.includes('technical')) return pickRandom(['Analyzing structure', 'Parsing logic', 'Evaluating code']);
      if (keywords.includes('ideas')) return pickRandom(['Brainstorming', 'Connecting dots', 'Exploring possibilities']);
      if (keywords.includes('writing')) return pickRandom(['Drafting', 'Finding words', 'Composing']);
      return null;
    },

    // Pattern: progress feel
    () => pickRandom(['Almost there', 'Making progress', 'Coming together', 'Taking shape']),
  ];

  // Try patterns in order based on cycle, skip nulls
  const patternIndex = cycle % patterns.length;
  for (let i = 0; i < patterns.length; i++) {
    const idx = (patternIndex + i) % patterns.length;
    const result = patterns[idx]();
    if (result) return result;
  }

  return 'Working';
}

export function AIStatusBar() {
  const aiOperation = useStore((state) => state.aiOperation);
  const cancelAIOperation = useStore((state) => state.cancelAIOperation);

  const [dots, setDots] = useState('');
  const [cycle, setCycle] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Generate message based on current context and cycle
  const getMessage = useCallback(
    () => generateMessage(aiOperation.context, cycle),
    [aiOperation.context, cycle]
  );

  // Animate the dots
  useEffect(() => {
    if (!aiOperation.isActive) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);

    return () => clearInterval(interval);
  }, [aiOperation.isActive]);

  // Cycle to trigger new message generation
  useEffect(() => {
    if (!aiOperation.isActive) {
      setCycle(0);
      return;
    }

    const interval = setInterval(() => {
      setCycle((prev) => prev + 1);
    }, 2200);

    return () => clearInterval(interval);
  }, [aiOperation.isActive]);

  // Track elapsed time
  useEffect(() => {
    if (!aiOperation.isActive) {
      setElapsed(0);
      return;
    }

    const startTime = aiOperation.startedAt
      ? new Date(aiOperation.startedAt).getTime()
      : Date.now();

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [aiOperation.isActive, aiOperation.startedAt]);

  if (!aiOperation.isActive) {
    return null;
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div
      className="
        fixed bottom-5 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-3 px-4 py-2
        bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm
        border border-neutral-200 dark:border-neutral-700
        rounded-full shadow-sm
        animate-in slide-in-from-bottom-2 fade-in duration-200
      "
    >
      {/* Pulsing indicator */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
      </span>

      {/* Status text with animated dots */}
      <span className="text-sm text-neutral-600 dark:text-neutral-400 min-w-[180px]">
        {getMessage()}<span className="inline-block w-5 text-left">{dots}</span>
      </span>

      {/* Elapsed time */}
      <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
        {formatTime(elapsed)}
      </span>

      {/* Cancel button */}
      <button
        onClick={cancelAIOperation}
        className="
          text-sm text-neutral-500 hover:text-neutral-700
          dark:text-neutral-500 dark:hover:text-neutral-300
          transition-colors ml-1
        "
      >
        Cancel
      </button>
    </div>
  );
}
