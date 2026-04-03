'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

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

function float32ToBase64PCM16(float32Array: Float32Array): string {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function resampleAudio(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const len = Math.round(input.length / ratio);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, input.length - 1);
    out[i] = input[lo] * (1 - (idx - lo)) + input[hi] * (idx - lo);
  }
  return out;
}

const VOICE_KEY = 'kanthink-voice-name';

export function LiveVoiceMode({ isOpen, onClose, systemPrompt }: LiveVoiceModeProps) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceName, setVoiceName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(VOICE_KEY) || 'Kore' : 'Kore'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef(0);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayRef = useRef(0);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(animRef.current);
    processorRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    playCtxRef.current?.close().catch(() => {});
    if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    wsRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    processorRef.current = null;
    analyserRef.current = null;
    playCtxRef.current = null;
    nextPlayRef.current = 0;
    setConnected(false);
    setIsAiSpeaking(false);
    setMicLevel(0);
  }, []);

  const playChunk = useCallback((b64: string) => {
    if (!playCtxRef.current) return; // should already be created by start()
    const ctx = playCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime, nextPlayRef.current);
    src.start(t);
    nextPlayRef.current = t + buf.duration;
    setIsAiSpeaking(true);
    src.onended = () => { if (nextPlayRef.current <= ctx.currentTime + 0.05) setIsAiSpeaking(false); };
  }, []);

  const startMic = useCallback((ws: WebSocket, stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    src.connect(analyser);
    const arr = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!activeRef.current) return;
      analyser.getByteFrequencyData(arr);
      let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i];
      setMicLevel(s / arr.length / 255);
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = proc;
    proc.onaudioprocess = (e) => {
      if (ws.readyState !== 1 || !activeRef.current) return;
      const data = e.inputBuffer.getChannelData(0);
      const re = resampleAudio(data, ctx.sampleRate, 16000);
      ws.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: float32ToBase64PCM16(re) }] },
      }));
    };
    src.connect(proc);
    proc.connect(ctx.destination);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('Fetching session...');
    activeRef.current = true;

    // Create playback AudioContext NOW during user gesture so mobile doesn't block it
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    if (playCtxRef.current.state === 'suspended') {
      await playCtxRef.current.resume();
    }

    try {
      // 1. Get WebSocket URL
      const res = await fetch('/api/voice/live');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server error ${res.status}`);
      }
      const { wsUrl, model } = await res.json();
      if (!wsUrl) throw new Error('No WebSocket URL returned');

      setStatus('Connecting to Gemini...');

      // 2. Open WebSocket
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        const timeout = setTimeout(() => { ws.close(); reject(new Error('Connection timed out')); }, 10000);

        ws.onopen = () => {
          setStatus('Sending setup...');
          ws.send(JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
              },
              ...(systemPrompt
                ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
                : { systemInstruction: { parts: [{ text: 'You are Kan, a helpful AI assistant. Be conversational and concise. Keep responses to 2-3 sentences.' }] } }
              ),
            },
          }));
        };

        ws.onmessage = async (event) => {
          try {
            // Browser WebSocket may receive Blob instead of string
            const raw = typeof event.data === 'string' ? event.data : await event.data.text();
            const msg = JSON.parse(raw);
            if (msg.setupComplete) {
              clearTimeout(timeout);
              setStatus('Requesting microphone...');

              // 3. Get mic AFTER setup
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                streamRef.current = stream;
                setConnected(true);
                setStatus('');
                startMic(ws, stream);
                resolve();
              } catch (micErr) {
                ws.close();
                reject(new Error('Microphone access denied'));
              }
              return;
            }
            if (msg.serverContent?.modelTurn?.parts) {
              for (const p of msg.serverContent.modelTurn.parts) {
                if (p.inlineData?.data) playChunk(p.inlineData.data);
              }
            }
            if (msg.error) {
              clearTimeout(timeout);
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            }
          } catch { /* ignore */ }
        };

        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed')); };
        ws.onclose = (e) => {
          clearTimeout(timeout);
          if (!activeRef.current) return;
          if (e.code !== 1000) reject(new Error(`Disconnected (${e.code})`));
          else { stop(); }
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('');
      stop();
    }
  }, [voiceName, systemPrompt, stop, playChunk, startMic]);

  // Auto-start on open, cleanup on close
  useEffect(() => {
    if (isOpen) { start(); }
    else { stop(); setStatus(''); setError(null); }
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const bars = Array.from({ length: 5 }, (_, i) => {
    const d = Math.abs(i - 2);
    return Math.max(0.15, micLevel * (1 - d * 0.2));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
      <button onClick={() => { stop(); onClose(); }} className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white z-10">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <button onClick={() => setShowSettings(!showSettings)} className="absolute top-4 left-4 p-2 text-neutral-500 hover:text-white z-10">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {showSettings && (
        <div className="absolute top-14 left-4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 w-56 z-10">
          <p className="text-xs text-neutral-400 font-medium mb-2">Voice</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICE_OPTIONS.map((v) => (
              <button key={v.id} onClick={() => { setVoiceName(v.id); localStorage.setItem(VOICE_KEY, v.id); }}
                className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${voiceName === v.id ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
              >{v.label}</button>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-3">Changes apply on next session</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-300 ${
            connected ? isAiSpeaking ? 'bg-violet-500/50 scale-[2]' : 'bg-violet-500/20 scale-150' : 'bg-transparent'
          }`} />
          <KanthinkIcon size={72} className={`relative transition-colors duration-300 ${connected ? 'text-violet-400' : 'text-neutral-500'}`} />
        </div>

        {connected && (
          <div className="flex items-center gap-1 h-10">
            {bars.map((s, i) => (
              <div key={i} className={`w-1.5 rounded-full transition-all duration-75 ${isAiSpeaking ? 'bg-violet-400' : 'bg-neutral-400'}`}
                style={{ height: `${Math.max(6, s * 40)}px` }} />
            ))}
          </div>
        )}

        <div>
          {status && !error && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-sm text-neutral-400">{status}</p>
            </div>
          )}
          {connected && !isAiSpeaking && !status && <p className="text-sm text-neutral-400">Listening...</p>}
          {connected && isAiSpeaking && <p className="text-sm text-violet-400">Kan is speaking</p>}
          {error && (
            <div className="space-y-2 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={start} className="text-xs text-violet-400 hover:underline">Try again</button>
            </div>
          )}
        </div>

        {connected && (
          <button onClick={() => { stop(); onClose(); }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
