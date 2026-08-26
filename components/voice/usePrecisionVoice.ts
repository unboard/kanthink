'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * Precision voice: speech → text → reasoning → speech, as three separate stages.
 *
 * Classic voice mode is Gemini's native-audio Live model — one hop, audio in and
 * audio out. It's fast and sounds good, but the same model that hears you is also
 * the one deciding which tools to call, and it's tuned for conversation rather than
 * for either job specifically.
 *
 * This splits the work:
 *   1. `gemini-3.5-transcribe-live` does nothing but listen. It handles
 *      self-corrections, strips filler, and holds up in noise.
 *   2. `/api/operator-chat` does the thinking, with the full action set — the same
 *      brain the home screen uses, so voice and typing behave identically.
 *   3. `/api/voice/tts` speaks the reply.
 *
 * The cost is latency: three hops instead of one. The gain is that each stage is
 * doing the thing it's actually good at, and the transcript is a first-class output
 * rather than something reconstructed afterwards.
 */

export interface PrecisionTurn {
  role: 'user' | 'kan';
  text: string;
  at: string;
}

interface UsePrecisionVoiceOptions {
  /** Called with the user's finished utterance. Return Kan's spoken reply. */
  onUtterance: (text: string) => Promise<string | null>;
  /** Voice name for TTS. */
  voice?: string;
}

/** Downsample Float32 mic audio to 16kHz PCM16 base64, as the Live API expects. */
function float32ToBase64PCM16(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

export function usePrecisionVoice({ onUtterance, voice = 'Kore' }: UsePrecisionVoiceOptions) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  /** What the user is saying right now, before the turn closes. */
  const [interim, setInterim] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef(0);
  const activeRef = useRef(false);
  const bufRef = useRef('');
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  /** Guards against a second turn firing while the first is still being answered. */
  const busyRef = useRef(false);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      setIsSpeaking(true);
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      audioElRef.current = el;
      await new Promise<void>((resolve) => {
        el.onended = () => resolve();
        el.onerror = () => resolve();
        el.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
    } finally {
      setIsSpeaking(false);
      audioElRef.current = null;
    }
  }, [voice]);

  /** Stop Kan mid-sentence — the user talking over him means he should stop. */
  const interrupt = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  const handleTurnEnd = useCallback(async () => {
    const text = bufRef.current.trim();
    bufRef.current = '';
    setInterim('');
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setIsThinking(true);
    try {
      const reply = await onUtterance(text);
      setIsThinking(false);
      if (reply) await speak(reply);
    } catch {
      setIsThinking(false);
    } finally {
      busyRef.current = false;
    }
  }, [onUtterance, speak]);

  const stop = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(animRef.current);
    procRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    wsRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    procRef.current = null;
    analyserRef.current = null;
    interrupt();
    setConnected(false);
    setMicLevel(0);
  }, [interrupt]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('Connecting…');
    activeRef.current = true;

    let sessionInfo: { wsUrl: string; transcribeModel: string };
    try {
      const res = await fetch('/api/voice/live');
      if (!res.ok) throw new Error((await res.json()).error || 'Could not start voice');
      sessionInfo = await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start voice');
      setStatus('');
      return;
    }

    const ws = new WebSocket(sessionInfo.wsUrl);
    wsRef.current = ws;

    ws.onerror = () => {
      setError('Connection failed');
      setStatus('');
    };
    ws.onclose = () => {
      setConnected(false);
      if (activeRef.current) setStatus('');
    };

    ws.onopen = () => {
      setStatus('Setting up…');
      // Transcription-only session: no tools, no voice config, no system prompt.
      // This model's whole job is turning speech into clean text.
      ws.send(JSON.stringify({
        setup: {
          model: `models/${sessionInfo.transcribeModel}`,
          generationConfig: { responseModalities: ['TEXT'] },
          inputAudioTranscription: {},
        },
      }));
    };

    ws.onmessage = async (event) => {
      let msg: Record<string, unknown>;
      try {
        const raw = event.data instanceof Blob ? await event.data.text() : String(event.data);
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if ('setupComplete' in msg) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          streamRef.current = stream;
          const ctx = new AudioContext();
          ctxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;
          src.connect(analyser);

          const proc = ctx.createScriptProcessor(4096, 1, 1);
          procRef.current = proc;
          proc.onaudioprocess = (e) => {
            if (!activeRef.current || ws.readyState !== WebSocket.OPEN) return;
            const data = e.inputBuffer.getChannelData(0);
            ws.send(JSON.stringify({
              realtimeInput: {
                audio: {
                  data: float32ToBase64PCM16(resample(data, ctx.sampleRate, 16000)),
                  mimeType: 'audio/pcm;rate=16000',
                },
              },
            }));
          };
          src.connect(proc);
          proc.connect(ctx.destination);

          const levels = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!activeRef.current) return;
            analyser.getByteFrequencyData(levels);
            const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
            setMicLevel(avg / 255);
            animRef.current = requestAnimationFrame(tick);
          };
          tick();

          setConnected(true);
          setStatus('');
        } catch {
          setError('Microphone access denied');
          setStatus('');
        }
        return;
      }

      const serverContent = msg.serverContent as
        | { inputTranscription?: { text?: string }; turnComplete?: boolean }
        | undefined;

      if (serverContent?.inputTranscription?.text) {
        // The user speaking is the signal to stop talking over them.
        interrupt();
        bufRef.current += serverContent.inputTranscription.text;
        setInterim(bufRef.current);
      }
      if (serverContent?.turnComplete) {
        void handleTurnEnd();
      }
    };
  }, [handleTurnEnd, interrupt]);

  return {
    start,
    stop,
    connected,
    status,
    error,
    isThinking,
    isSpeaking,
    micLevel,
    interim,
    interrupt,
  };
}
