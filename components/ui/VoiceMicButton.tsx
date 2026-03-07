'use client';

import { useCallback } from 'react';
import { useVoiceAvailability } from '@/lib/hooks/useVoiceAvailability';
import { useVoiceMode } from '@/lib/hooks/useVoiceMode';
import { voiceState } from '@/lib/hooks/voiceState';

interface VoiceMicButtonProps {
  onTranscription: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceMicButton({ onTranscription, className = '', size = 'sm' }: VoiceMicButtonProps) {
  const isAvailable = useVoiceAvailability();
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceMode();

  const handleClick = useCallback(async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) {
        voiceState.lastInputWasVoice = true;
        onTranscription(text);
      }
    } else if (!isTranscribing) {
      await startRecording();
    }
  }, [isRecording, isTranscribing, startRecording, stopRecording, onTranscription]);

  if (!isAvailable) return null;

  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const buttonSize = size === 'sm' ? 'h-[26px] w-7' : 'h-8 w-8';

  // Transcribing — spinner
  if (isTranscribing) {
    return (
      <button
        disabled
        className={`flex-shrink-0 ${buttonSize} flex items-center justify-center rounded-md text-violet-500 ${className}`}
        title="Transcribing..."
      >
        <svg className={`${iconSize} animate-spin`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </button>
    );
  }

  // Recording — pulsing red with duration
  if (isRecording) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className="text-xs text-red-500 tabular-nums font-medium">
          {formatDuration(recordingDuration)}
        </span>
        <button
          onClick={handleClick}
          className={`flex-shrink-0 ${buttonSize} flex items-center justify-center rounded-md text-red-500 hover:text-red-600 transition-colors`}
          title="Stop recording"
        >
          <span className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-30 animate-ping" />
            <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </span>
        </button>
        <button
          onClick={cancelRecording}
          className="flex-shrink-0 p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          title="Cancel"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Idle — mic icon
  return (
    <button
      onClick={handleClick}
      className={`flex-shrink-0 ${buttonSize} flex items-center justify-center rounded-md text-neutral-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors ${className}`}
      title={error || 'Voice input'}
    >
      <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
      </svg>
    </button>
  );
}
