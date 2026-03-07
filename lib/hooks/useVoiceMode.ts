'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type VoiceState = 'idle' | 'recording' | 'transcribing';

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return 'audio/webm';
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}

const MAX_RECORDING_MS = 60_000;
const VOICE_OUTPUT_KEY = 'kanthink-voice-output';

export function useVoiceMode() {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabledState] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(VOICE_OUTPUT_KEY) !== 'false';
  });
  const [lastInputWasVoice, setLastInputWasVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<((text: string | null) => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVoiceOutputEnabled = useCallback((enabled: boolean) => {
    setVoiceOutputEnabledState(enabled);
    localStorage.setItem(VOICE_OUTPUT_KEY, String(enabled));
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Cleanup stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);

        const blob = new Blob(chunksRef.current, { type: mimeType });

        // If cancelled (no resolve waiting), just return
        if (!stopResolveRef.current) return;

        if (blob.size < 100) {
          stopResolveRef.current(null);
          stopResolveRef.current = null;
          setState('idle');
          return;
        }

        setState('transcribing');

        try {
          const ext = getFileExtension(mimeType);
          const formData = new FormData();
          formData.append('audio', blob, `recording.${ext}`);

          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Transcription failed');
          }

          const data = await res.json();
          setLastInputWasVoice(true);
          stopResolveRef.current?.(data.text || null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription failed');
          stopResolveRef.current?.(null);
        } finally {
          stopResolveRef.current = null;
          setState('idle');
        }
      };

      recorder.start();
      setState('recording');
      setRecordingDuration(0);

      // Duration counter
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      // Auto-stop at max duration
      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Microphone permission denied. Please allow access in your browser settings.'
        : msg);
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current?.state !== 'recording') {
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      mediaRecorderRef.current.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    stopResolveRef.current = null;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState('idle');
    setRecordingDuration(0);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsSpeaking(true);

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
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const clearLastInputWasVoice = useCallback(() => {
    setLastInputWasVoice(false);
  }, []);

  return {
    // Recording
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    // TTS
    speak,
    stopSpeaking,
    isSpeaking,
    voiceOutputEnabled,
    setVoiceOutputEnabled,
    // Voice input tracking
    lastInputWasVoice,
    clearLastInputWasVoice,
  };
}
