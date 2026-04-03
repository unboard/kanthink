'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

type SessionState = 'idle' | 'connecting' | 'connected' | 'error';

interface LiveVoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt?: string;
}

// Convert Float32 PCM samples to 16-bit PCM and base64 encode
function float32ToBase64PCM16(float32Array: Float32Array): string {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Resample audio from input rate to target rate
function resampleAudio(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}

export function LiveVoiceMode({ isOpen, onClose, systemPrompt }: LiveVoiceModeProps) {
  const [state, setState] = useState<SessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const setupDoneRef = useRef(false);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setupDoneRef.current = false;
    nextPlayTimeRef.current = 0;
    setIsAiSpeaking(false);
  }, []);

  const playAudioChunk = useCallback((base64Audio: string) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackContextRef.current;

    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Convert 16-bit PCM to Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    setIsAiSpeaking(true);
    source.onended = () => {
      if (nextPlayTimeRef.current <= ctx.currentTime + 0.05) {
        setIsAiSpeaking(false);
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    setState('connecting');
    setError(null);

    try {
      // Get WebSocket URL from server
      const res = await fetch('/api/voice/live');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to get voice session');
      }
      const { wsUrl, model } = await res.json();

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Connect WebSocket
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send setup message
        ws.send(JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
            systemInstruction: systemPrompt
              ? { parts: [{ text: systemPrompt }] }
              : { parts: [{ text: 'You are Kan, a helpful AI assistant for the Kanthink workspace. Be conversational, warm, and concise.' }] },
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Setup complete
          if (msg.setupComplete) {
            setupDoneRef.current = true;
            setState('connected');
            startMicrophoneStreaming(ws, stream);
            return;
          }

          // Audio response from Gemini
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                playAudioChunk(part.inlineData.data);
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        setError('Connection error');
        setState('error');
        cleanup();
      };

      ws.onclose = () => {
        if (state === 'connected') {
          setState('idle');
          cleanup();
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
      setState('error');
      cleanup();
    }
  }, [systemPrompt, cleanup, playAudioChunk, state]);

  const startMicrophoneStreaming = useCallback((ws: WebSocket, stream: MediaStream) => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    // Use ScriptProcessor for reliable chunked audio (AudioWorklet not needed for this use case)
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN || !setupDoneRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const resampled = resampleAudio(inputData, audioContext.sampleRate, 16000);
      const base64 = float32ToBase64PCM16(resampled);

      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64,
          }],
        },
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }, []);

  const endSession = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setState('idle');
    }
    return () => cleanup();
  }, [isOpen, cleanup]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-8 text-center">
        {/* Animated Kan icon */}
        <div className={`relative ${isAiSpeaking ? 'animate-pulse' : ''}`}>
          <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 ${
            state === 'connected'
              ? isAiSpeaking
                ? 'bg-violet-500/40 scale-150'
                : 'bg-violet-500/20 scale-125'
              : 'bg-transparent'
          }`} />
          <div className="relative">
            <KanthinkIcon size={80} className={`transition-colors duration-300 ${
              state === 'connected' ? 'text-violet-400' : 'text-neutral-500'
            }`} />
          </div>
        </div>

        {/* Status text */}
        <div>
          {state === 'idle' && (
            <p className="text-lg text-neutral-300">Ready to talk</p>
          )}
          {state === 'connecting' && (
            <p className="text-lg text-neutral-400">Connecting...</p>
          )}
          {state === 'connected' && !isAiSpeaking && (
            <p className="text-lg text-neutral-300">Listening...</p>
          )}
          {state === 'connected' && isAiSpeaking && (
            <p className="text-lg text-violet-400">Kan is speaking...</p>
          )}
          {state === 'error' && (
            <p className="text-lg text-red-400">{error || 'Something went wrong'}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          {state === 'idle' || state === 'error' ? (
            <button
              onClick={startSession}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-600 text-white transition-all hover:bg-violet-700 hover:scale-105 active:scale-95"
            >
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          ) : state === 'connecting' ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : (
            <button
              onClick={endSession}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 hover:scale-105 active:scale-95"
            >
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => { endSession(); onClose(); }}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
