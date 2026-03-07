'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoiceAvailability } from '@/lib/hooks/useVoiceAvailability';

// Global singleton — only one audio plays at a time across all SpeakerButtons
let globalAudio: HTMLAudioElement | null = null;
let globalCleanup: (() => void) | null = null;
let globalActiveId: string | null = null;

function stopGlobalAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = '';
    globalAudio = null;
  }
  globalCleanup?.();
  globalCleanup = null;
  globalActiveId = null;
}

interface SpeakerButtonProps {
  text: string;
  messageId?: string;
  className?: string;
}

export function SpeakerButton({ text, messageId, className = '' }: SpeakerButtonProps) {
  const isAvailable = useVoiceAvailability();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const instanceId = useRef(messageId || Math.random().toString(36));
  const abortRef = useRef<AbortController | null>(null);

  // Sync state if another button takes over global audio
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying && globalActiveId !== instanceId.current) {
        setIsPlaying(false);
        setIsLoading(false);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (globalActiveId === instanceId.current) {
        stopGlobalAudio();
      }
      abortRef.current?.abort();
    };
  }, []);

  const handleClick = useCallback(async () => {
    // If this button is playing, stop it
    if (isPlaying || isLoading) {
      abortRef.current?.abort();
      if (globalActiveId === instanceId.current) stopGlobalAudio();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    // Stop any other playing audio first
    stopGlobalAudio();

    globalActiveId = instanceId.current;
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error('TTS failed');

      // Collect chunks and play as soon as we have the blob
      const blob = await res.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      globalAudio = audio;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        setIsPlaying(false);
        setIsLoading(false);
        if (globalActiveId === instanceId.current) {
          globalActiveId = null;
          globalAudio = null;
          globalCleanup = null;
        }
      };

      globalCleanup = cleanup;
      audio.onended = cleanup;
      audio.onerror = cleanup;

      setIsLoading(false);
      setIsPlaying(true);
      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setIsPlaying(false);
      setIsLoading(false);
    }
  }, [isPlaying, isLoading, text]);

  if (!isAvailable || !text.trim()) return null;

  return (
    <button
      onClick={handleClick}
      className={`p-1 text-neutral-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors ${className}`}
      title={isPlaying ? 'Stop playback' : isLoading ? 'Loading...' : 'Read aloud'}
    >
      {isLoading ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : isPlaying ? (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.5l5-4v15l-5-4H4a1 1 0 01-1-1v-5a1 1 0 011-1h2.5z" />
        </svg>
      )}
    </button>
  );
}
