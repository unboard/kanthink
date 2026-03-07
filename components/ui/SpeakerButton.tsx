'use client';

import { useState, useCallback, useRef } from 'react';
import { useVoiceAvailability } from '@/lib/hooks/useVoiceAvailability';

interface SpeakerButtonProps {
  text: string;
  className?: string;
}

export function SpeakerButton({ text, className = '' }: SpeakerButtonProps) {
  const isAvailable = useVoiceAvailability();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error('TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  }, [isPlaying, text]);

  if (!isAvailable || !text.trim()) return null;

  return (
    <button
      onClick={handleClick}
      className={`p-1 text-neutral-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors ${className}`}
      title={isPlaying ? 'Stop playback' : 'Read aloud'}
    >
      {isPlaying ? (
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
