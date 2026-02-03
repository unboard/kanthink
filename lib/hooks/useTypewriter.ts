import { useState, useEffect, useCallback } from 'react';

interface UseTypewriterOptions {
  /** Characters per second (default: 60) */
  speed?: number;
  /** Delay before starting to type (default: 0) */
  startDelay?: number;
  /** Callback when typing completes */
  onComplete?: () => void;
}

interface UseTypewriterResult {
  /** The portion of text to display */
  displayedText: string;
  /** Whether typing is still in progress */
  isTyping: boolean;
  /** Skip to the end immediately */
  skipToEnd: () => void;
  /** Reset and start typing again */
  reset: () => void;
}

/**
 * Hook for typewriter effect on text.
 * Returns the portion of text to display, updating over time.
 */
export function useTypewriter(
  fullText: string,
  options: UseTypewriterOptions = {}
): UseTypewriterResult {
  const { speed = 60, startDelay = 0, onComplete } = options;

  const [charIndex, setCharIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Calculate interval in ms from chars per second
  const intervalMs = Math.max(1000 / speed, 10);

  // Reset when fullText changes
  useEffect(() => {
    setCharIndex(0);
    setHasStarted(false);
    setIsComplete(false);
  }, [fullText]);

  // Start delay
  useEffect(() => {
    if (hasStarted || !fullText) return;

    const timer = setTimeout(() => {
      setHasStarted(true);
    }, startDelay);

    return () => clearTimeout(timer);
  }, [hasStarted, startDelay, fullText]);

  // Typing effect
  useEffect(() => {
    if (!hasStarted || isComplete || !fullText) return;

    if (charIndex >= fullText.length) {
      setIsComplete(true);
      onComplete?.();
      return;
    }

    const timer = setTimeout(() => {
      // Type faster through whitespace and punctuation
      const currentChar = fullText[charIndex];
      const isWhitespace = /\s/.test(currentChar);
      const nextInterval = isWhitespace ? intervalMs / 3 : intervalMs;

      setCharIndex((prev) => prev + 1);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [hasStarted, isComplete, charIndex, fullText, intervalMs, onComplete]);

  const skipToEnd = useCallback(() => {
    setCharIndex(fullText.length);
    setIsComplete(true);
    onComplete?.();
  }, [fullText, onComplete]);

  const reset = useCallback(() => {
    setCharIndex(0);
    setHasStarted(false);
    setIsComplete(false);
  }, []);

  return {
    displayedText: fullText.slice(0, charIndex),
    isTyping: hasStarted && !isComplete,
    skipToEnd,
    reset,
  };
}

/**
 * Hook for managing typewriter effect on the latest message in a list.
 * Only the most recent message types out; previous messages show in full.
 */
export function useMessageTypewriter(
  messages: Array<{ id: string; content: string; type: string }>,
  options: UseTypewriterOptions = {}
) {
  const lastMessage = messages[messages.length - 1];
  const isKanMessage = lastMessage?.type === 'kan';

  const { displayedText, isTyping, skipToEnd } = useTypewriter(
    isKanMessage ? lastMessage?.content || '' : '',
    {
      ...options,
      startDelay: options.startDelay ?? 100, // Small delay for natural feel
    }
  );

  // Consider "typing" to be true if it's a Kan message that hasn't fully displayed yet
  // This prevents options from flickering during the start delay
  const isEffectivelyTyping = isKanMessage && (isTyping || displayedText.length < (lastMessage?.content?.length || 0));

  return {
    /** Get display text for a message - full text for old messages, typed text for latest Kan message */
    getDisplayText: (messageId: string, content: string, type: string) => {
      if (type !== 'kan') return content;
      if (messageId === lastMessage?.id) return displayedText;
      return content;
    },
    /** Whether the latest message is still typing */
    isTyping: isEffectivelyTyping,
    /** Skip typing animation */
    skipToEnd,
    /** ID of the message currently being typed */
    typingMessageId: isEffectivelyTyping ? lastMessage?.id : null,
  };
}
