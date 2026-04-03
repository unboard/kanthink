'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

type SessionState = 'connecting' | 'connected' | 'error';

const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore' },
  { id: 'Puck', label: 'Puck' },
  { id: 'Charon', label: 'Charon' },
  { id: 'Fenrir', label: 'Fenrir' },
  { id: 'Aoede', label: 'Aoede' },
  { id: 'Leda', label: 'Leda' },
  { id: 'Orus', label: 'Orus' },
  { id: 'Zephyr', label: 'Zephyr' },
];

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

const VOICE_STORAGE_KEY = 'kanthink-voice-name';

export function LiveVoiceMode({ isOpen, onClose, systemPrompt }: LiveVoiceModeProps) {
  const [state, setState] = useState<SessionState | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceName, setVoiceName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(VOICE_STORAGE_KEY) || 'Kore';
    }
    return 'Kore';
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const setupDoneRef = useRef(false);
  const isConnectedRef = useRef(false);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
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
    isConnectedRef.current = false;
    nextPlayTimeRef.current = 0;
    setIsAiSpeaking(false);
    setMicLevel(0);
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

  const startMicrophoneStreaming = useCallback((ws: WebSocket, stream: MediaStream) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);

    // Analyser for visual level meter
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    source.connect(analyser);

    // Animate mic level
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length / 255;
      setMicLevel(avg);
      animFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();

    // Audio processor for streaming to Gemini
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

  const startSession = useCallback(async () => {
    setState('connecting');
    setError(null);

    try {
      const res = await fetch('/api/voice/live');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to get voice session');
      }
      const { wsUrl, model } = await res.json();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
            systemInstruction: systemPrompt
              ? { parts: [{ text: systemPrompt }] }
              : { parts: [{ text: 'You are Kan, a helpful AI assistant for the Kanthink workspace. Be conversational, warm, and concise. Keep responses short for voice — 2-3 sentences max.' }] },
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.setupComplete) {
            setupDoneRef.current = true;
            isConnectedRef.current = true;
            setState('connected');
            startMicrophoneStreaming(ws, stream);
            return;
          }

          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
                playAudioChunk(part.inlineData.data);
              }
            }
          }

          // Log errors from server
          if (msg.error) {
            console.error('[Voice] Server error:', msg.error);
            setError(msg.error.message || 'Server error');
            setState('error');
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = (e) => {
        console.error('[Voice] WebSocket error:', e);
        setError('Connection error');
        setState('error');
        cleanup();
      };

      ws.onclose = (e) => {
        console.log('[Voice] WebSocket closed:', e.code, e.reason);
        if (isConnectedRef.current) {
          cleanup();
          setState('idle');
        }
      };
    } catch (err) {
      console.error('[Voice] Start error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
      setState('error');
      cleanup();
    }
  }, [systemPrompt, cleanup, playAudioChunk, startMicrophoneStreaming, voiceName]);

  const endSession = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  // Auto-start session when opened
  useEffect(() => {
    if (isOpen && state === 'idle') {
      startSession();
    }
    if (!isOpen) {
      cleanup();
      setState('idle');
    }
    return () => cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleVoiceChange = (v: string) => {
    setVoiceName(v);
    localStorage.setItem(VOICE_STORAGE_KEY, v);
  };

  if (!isOpen) return null;

  // Mic level visualization bars
  const barCount = 5;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const center = Math.floor(barCount / 2);
    const dist = Math.abs(i - center);
    const scale = Math.max(0.15, micLevel * (1 - dist * 0.2));
    return scale;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
      {/* Close X */}
      <button
        onClick={() => { endSession(); onClose(); }}
        className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white transition-colors z-10"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Settings gear */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="absolute top-4 left-4 p-2 text-neutral-500 hover:text-white transition-colors z-10"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-14 left-4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 w-56 z-10">
          <p className="text-xs text-neutral-400 font-medium mb-2">Voice</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICE_OPTIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => handleVoiceChange(v.id)}
                className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${
                  voiceName === v.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-3">Voice changes apply on next session</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-6 text-center">
        {/* Kan icon with glow */}
        <div className="relative">
          <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-300 ${
            state === 'connected'
              ? isAiSpeaking
                ? 'bg-violet-500/50 scale-[2]'
                : 'bg-violet-500/20 scale-150'
              : state === 'connecting'
                ? 'bg-violet-500/10 scale-125'
                : 'bg-transparent'
          }`} />
          <div className="relative">
            <KanthinkIcon size={72} className={`transition-colors duration-300 ${
              state === 'connected' ? 'text-violet-400' : 'text-neutral-500'
            }`} />
          </div>
        </div>

        {/* Audio level visualization */}
        {state === 'connected' && (
          <div className="flex items-center gap-1 h-10">
            {bars.map((scale, i) => (
              <div
                key={i}
                className={`w-1.5 rounded-full transition-all duration-75 ${
                  isAiSpeaking ? 'bg-violet-400' : 'bg-neutral-400'
                }`}
                style={{ height: `${Math.max(6, scale * 40)}px` }}
              />
            ))}
          </div>
        )}

        {/* Status */}
        <div>
          {state === 'connecting' && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-sm text-neutral-400">Connecting...</p>
            </div>
          )}
          {state === 'connected' && !isAiSpeaking && (
            <p className="text-sm text-neutral-400">Listening...</p>
          )}
          {state === 'connected' && isAiSpeaking && (
            <p className="text-sm text-violet-400">Kan is speaking</p>
          )}
          {state === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">{error || 'Something went wrong'}</p>
              <button
                onClick={startSession}
                className="text-xs text-violet-400 hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* End call button */}
        {state === 'connected' && (
          <button
            onClick={() => { endSession(); onClose(); }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 hover:scale-105 active:scale-95"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
