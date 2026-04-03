'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore' }, { id: 'Puck', label: 'Puck' },
  { id: 'Charon', label: 'Charon' }, { id: 'Fenrir', label: 'Fenrir' },
  { id: 'Aoede', label: 'Aoede' }, { id: 'Leda', label: 'Leda' },
  { id: 'Orus', label: 'Orus' }, { id: 'Zephyr', label: 'Zephyr' },
];

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'complete_task',
        description: 'Mark a task as completed/done',
        parameters: { type: 'OBJECT', properties: { taskId: { type: 'STRING', description: 'The task ID to complete' } }, required: ['taskId'] },
      },
      {
        name: 'create_task',
        description: 'Create a new task in a channel, optionally on a card',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            cardId: { type: 'STRING', description: 'Card ID (optional - omit for standalone task)' },
            title: { type: 'STRING', description: 'Task title' },
            description: { type: 'STRING', description: 'Task description (optional)' },
          },
          required: ['channelId', 'title'],
        },
      },
      {
        name: 'create_card',
        description: 'Create a new card in a channel',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            columnName: { type: 'STRING', description: 'Column name (e.g. Inbox, Working On)' },
            title: { type: 'STRING', description: 'Card title' },
            content: { type: 'STRING', description: 'Card content/first message (optional)' },
          },
          required: ['channelId', 'title'],
        },
      },
      {
        name: 'add_note',
        description: 'Add a note/message to a card thread',
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID' },
            content: { type: 'STRING', description: 'Note content (markdown)' },
          },
          required: ['cardId', 'content'],
        },
      },
      {
        name: 'update_task_status',
        description: 'Update a task status (not_started, in_progress, on_hold, done)',
        parameters: {
          type: 'OBJECT',
          properties: {
            taskId: { type: 'STRING', description: 'Task ID' },
            status: { type: 'STRING', description: 'New status' },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'search_cards',
        description: 'Search for cards in a channel by keyword, or get the most recent cards. Use this when the user asks about cards you cannot see in the initial context, or when they ask about recently added/modified cards.',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID or channel name to search in' },
            query: { type: 'STRING', description: 'Search keyword (optional — omit to get most recent cards)' },
            limit: { type: 'STRING', description: 'Number of results to return (default: 5)' },
          },
          required: ['channelId'],
        },
      },
      {
        name: 'show_card',
        description: 'Show a visual preview of a card so the user can see its details. Use when the user wants to view a card, see its content, or get more detail about it.',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title' } },
          required: ['cardId'],
        },
      },
      {
        name: 'archive_card',
        description: 'Archive a card (remove it from the board)',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title' } },
          required: ['cardId'],
        },
      },
      {
        name: 'send_email',
        description: 'Send an email to someone. Compose a professional email based on what the user describes.',
        parameters: {
          type: 'OBJECT',
          properties: {
            to: { type: 'STRING', description: 'Recipient email address' },
            subject: { type: 'STRING', description: 'Email subject line' },
            body: { type: 'STRING', description: 'Email body content (plain text or markdown)' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
  },
  { googleSearch: {} },
];

interface CardPreview {
  id: string;
  title: string;
  summary?: string;
  channelName: string;
  channelId: string;
  messages: { type: string; content: string }[];
  tasks: { id: string; title: string; status: string }[];
  tags?: string[];
  coverImageUrl?: string;
}

interface ActionLog {
  id: string;
  action: string;
  result: string;
  success: boolean;
  timestamp: Date;
  cardPreview?: CardPreview;
}

interface LiveVoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt?: string;
}

function float32ToBase64PCM16(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const b = new Uint8Array(i16.buffer);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const r = from / to, len = Math.round(input.length / r), out = new Float32Array(len);
  for (let i = 0; i < len; i++) { const idx = i * r, lo = Math.floor(idx); out[i] = input[lo] * (1 - (idx - lo)) + (input[Math.min(lo + 1, input.length - 1)] || 0) * (idx - lo); }
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
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [expandedCard, setExpandedCard] = useState<CardPreview | null>(null);
  const [voiceName, setVoiceName] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(VOICE_KEY) || 'Kore' : 'Kore'
  );

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef(0);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayRef = useRef(0);
  const activeRef = useRef(false);
  const activeSources = useRef<AudioBufferSourceNode[]>([]);

  const stop = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(animRef.current);
    procRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    playCtxRef.current?.close().catch(() => {});
    if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    wsRef.current = null; streamRef.current = null; audioCtxRef.current = null;
    procRef.current = null; analyserRef.current = null; playCtxRef.current = null;
    nextPlayRef.current = 0;
    setConnected(false); setIsAiSpeaking(false); setMicLevel(0);
  }, []);

  // Stop all queued AI audio (for interruption)
  const interruptPlayback = useCallback(() => {
    for (const s of activeSources.current) { try { s.stop(); } catch {} }
    activeSources.current = [];
    nextPlayRef.current = 0;
    setIsAiSpeaking(false);
  }, []);

  const playChunk = useCallback((b64: string) => {
    if (!playCtxRef.current) return;
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
    src.buffer = buf; src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime, nextPlayRef.current);
    src.start(t); nextPlayRef.current = t + buf.duration;
    activeSources.current.push(src);
    setIsAiSpeaking(true);
    src.onended = () => {
      activeSources.current = activeSources.current.filter(s => s !== src);
      if (activeSources.current.length === 0) setIsAiSpeaking(false);
    };
  }, []);

  const startMic = useCallback((ws: WebSocket, stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    analyserRef.current = analyser; src.connect(analyser);
    const arr = new Uint8Array(analyser.frequencyBinCount);
    let speechFrames = 0;
    const tick = () => {
      if (!activeRef.current) return;
      analyser.getByteFrequencyData(arr);
      let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i];
      const level = s / arr.length / 255;
      setMicLevel(level);
      // Voice activity detection — interrupt AI when user speaks
      if (level > 0.15) { speechFrames++; } else { speechFrames = Math.max(0, speechFrames - 1); }
      if (speechFrames > 8 && activeSources.current.length > 0) {
        interruptPlayback();
        speechFrames = 0;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    procRef.current = proc;
    proc.onaudioprocess = (e) => {
      if (ws.readyState !== 1 || !activeRef.current) return;
      const data = e.inputBuffer.getChannelData(0);
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: float32ToBase64PCM16(resample(data, ctx.sampleRate, 16000)), mimeType: 'audio/pcm;rate=16000' } } }));
    };
    src.connect(proc); proc.connect(ctx.destination);
  }, [interruptPlayback]);

  const executeAction = useCallback(async (name: string, args: Record<string, string>): Promise<string> => {
    try {
      const res = await fetch('/api/voice/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: name, args }),
      });
      const data = await res.json();
      setActions(prev => [...prev, {
        id: crypto.randomUUID(), action: name, result: data.result,
        success: !data.result.startsWith('Failed'), timestamp: new Date(),
        cardPreview: data.cardPreview,
      }]);
      return data.result;
    } catch (err) {
      const msg = `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setActions(prev => [...prev, { id: crypto.randomUUID(), action: name, result: msg, success: false, timestamp: new Date() }]);
      return msg;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null); setStatus('Fetching session...'); setActions([]);
    activeRef.current = true;
    if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
    if (playCtxRef.current.state === 'suspended') await playCtxRef.current.resume();

    try {
      const res = await fetch('/api/voice/live');
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error ${res.status}`); }
      const { wsUrl, model } = await res.json();
      if (!wsUrl) throw new Error('No WebSocket URL returned');

      setStatus('Connecting...');
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        const timeout = setTimeout(() => { ws.close(); reject(new Error('Connection timed out')); }, 10000);

        ws.onopen = () => {
          setStatus('Setting up...');
          ws.send(JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
              },
              systemInstruction: { parts: [{ text: (systemPrompt || 'You are Kan, a helpful AI assistant.') + `

TOOL USE RULES — CRITICAL:
You have tools available, but ONLY use them when the user EXPLICITLY asks you to take an action. Examples of explicit requests: "mark that task complete", "create a card for this", "archive that card", "send an email to Bob".

NEVER call a tool based on:
- Your own interpretation of what might be helpful
- Conversational context that wasn't a direct request
- Assumptions about what the user wants done

If you're unsure whether the user wants you to take an action, ASK first — don't just do it. Say "Would you like me to [action]?" and wait for confirmation.

Google Search is the exception — you may use it freely when the user asks about current information, URLs, or research topics.

After any tool executes, always confirm what you did.` }] },
              tools: TOOLS,
            },
          }));
        };

        ws.onmessage = async (event) => {
          try {
            const raw = typeof event.data === 'string' ? event.data : await event.data.text();
            const msg = JSON.parse(raw);

            if (msg.setupComplete) {
              clearTimeout(timeout);
              setStatus('Requesting microphone...');
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
                streamRef.current = stream;
                setConnected(true); setStatus('');
                startMic(ws, stream);
                resolve();
              } catch { reject(new Error('Microphone access denied')); }
              return;
            }

            // Audio response
            if (msg.serverContent?.modelTurn?.parts) {
              for (const p of msg.serverContent.modelTurn.parts) {
                if (p.inlineData?.data) playChunk(p.inlineData.data);
              }
            }

            // Tool call from Gemini
            if (msg.toolCall?.functionCalls) {
              for (const call of msg.toolCall.functionCalls) {
                const result = await executeAction(call.name, call.args || {});
                // Send tool response back to Gemini
                ws.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      id: call.id,
                      name: call.name,
                      response: { result },
                    }],
                  },
                }));
              }
            }

            if (msg.error) {
              clearTimeout(timeout);
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onerror = () => { clearTimeout(timeout); reject(new Error('Connection failed')); };
        ws.onclose = (e) => {
          clearTimeout(timeout);
          if (!activeRef.current) return;
          if (e.code !== 1000 && !connected) reject(new Error(`Disconnected (${e.code})`));
          else stop();
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(''); stop();
    }
  }, [voiceName, systemPrompt, stop, playChunk, startMic, executeAction, connected]);

  useEffect(() => {
    if (isOpen) start();
    else { stop(); setStatus(''); setError(null); setActions([]); }
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const bars = Array.from({ length: 5 }, (_, i) => Math.max(0.15, micLevel * (1 - Math.abs(i - 2) * 0.2)));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
      <button onClick={() => { stop(); onClose(); }} className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white z-10">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <button onClick={() => setShowSettings(!showSettings)} className="absolute top-4 left-4 p-2 text-neutral-500 hover:text-white z-10">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </button>

      {showSettings && (
        <div className="absolute top-14 left-4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 w-56 z-10">
          <p className="text-xs text-neutral-400 font-medium mb-2">Voice</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICE_OPTIONS.map(v => (
              <button key={v.id} onClick={() => { setVoiceName(v.id); localStorage.setItem(VOICE_KEY, v.id); }}
                className={`px-2 py-1.5 rounded-lg text-xs ${voiceName === v.id ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
              >{v.label}</button>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-3">Changes apply on next session</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-300 ${connected ? isAiSpeaking ? 'bg-violet-500/50 scale-[2]' : 'bg-violet-500/20 scale-150' : 'bg-transparent'}`} />
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

        {/* Action log — visual feedback for tool calls */}
        {actions.length > 0 && (
          <div className="w-full max-w-sm space-y-2 mt-2 max-h-[40vh] overflow-y-auto">
            {actions.map(a => (
              <div key={a.id}>
                {/* Card preview */}
                {a.cardPreview ? (
                  <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl overflow-hidden animate-slide-in cursor-pointer hover:border-violet-500/50 transition-colors"
                    onClick={() => setExpandedCard(a.cardPreview!)}>
                    {a.cardPreview.coverImageUrl && (
                      <img src={a.cardPreview.coverImageUrl} alt="" className="w-full h-24 object-cover" />
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-violet-400 mb-1">{a.cardPreview.channelName}</p>
                        <p className="text-[10px] text-neutral-500">Tap to expand</p>
                      </div>
                      <p className="text-sm font-medium text-white">{a.cardPreview.title}</p>
                      {a.cardPreview.summary && <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{a.cardPreview.summary}</p>}
                      {a.cardPreview.tags && a.cardPreview.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {a.cardPreview.tags.map(t => <span key={t} className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">{t}</span>)}
                        </div>
                      )}
                      {a.cardPreview.tasks.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {a.cardPreview.tasks.map(t => (
                            <div key={t.id} className="flex items-center gap-1.5 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'done' ? 'bg-green-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-neutral-500'}`} />
                              <span className={t.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-300'}>{t.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {a.cardPreview.messages.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-neutral-800">
                          <p className="text-[10px] text-neutral-500 mb-1">Recent thread</p>
                          {a.cardPreview.messages.slice(-2).map((m, i) => (
                            <p key={i} className="text-xs text-neutral-400 truncate">{m.content}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Regular action result */
                  <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 rounded-xl px-4 py-2.5 animate-slide-in">
                    {a.success ? (
                      <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className={`text-sm ${a.success ? 'text-green-300' : 'text-red-300'}`}>{a.result}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {connected && (
          <button onClick={() => { stop(); onClose(); }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all mt-2">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
        )}
      </div>

      {/* Expanded card detail overlay — read-only, voice stays active */}
      {expandedCard && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/30" onClick={() => setExpandedCard(null)}>
          <div className="w-full max-w-lg h-[85vh] bg-neutral-900 border-t border-neutral-700 rounded-t-2xl overflow-y-auto animate-slide-up"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between z-10">
              <div className="min-w-0">
                <p className="text-xs text-violet-400">{expandedCard.channelName}</p>
                <p className="text-sm font-semibold text-white truncate">{expandedCard.title}</p>
              </div>
              <button onClick={() => setExpandedCard(null)} className="p-1.5 text-neutral-400 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {expandedCard.coverImageUrl && (
              <img src={expandedCard.coverImageUrl} alt="" className="w-full h-32 object-cover" />
            )}

            <div className="px-4 py-4 space-y-4">
              {/* Summary */}
              {expandedCard.summary && (
                <p className="text-sm text-neutral-300">{expandedCard.summary}</p>
              )}

              {/* Tags */}
              {expandedCard.tags && expandedCard.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {expandedCard.tags.map(t => (
                    <span key={t} className="text-xs bg-neutral-800 text-neutral-300 px-2 py-1 rounded-md">{t}</span>
                  ))}
                </div>
              )}

              {/* Tasks */}
              {expandedCard.tasks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 mb-2">Tasks ({expandedCard.tasks.filter(t => t.status === 'done').length}/{expandedCard.tasks.length} done)</p>
                  <div className="space-y-1.5">
                    {expandedCard.tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                          t.status === 'done' ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-neutral-600'
                        }`}>
                          {t.status === 'done' && '✓'}
                        </span>
                        <span className={`text-sm ${t.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{t.title}</span>
                        {t.status !== 'done' && t.status !== 'not_started' && (
                          <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">{t.status.replace('_', ' ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Thread messages */}
              {expandedCard.messages.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 mb-2">Thread ({expandedCard.messages.length} messages)</p>
                  <div className="space-y-3">
                    {expandedCard.messages.map((m, i) => (
                      <div key={i} className={`rounded-lg px-3 py-2 text-sm ${
                        m.type === 'ai_response'
                          ? 'bg-violet-500/10 border border-violet-500/20 text-neutral-300'
                          : m.type === 'question'
                            ? 'bg-blue-500/10 border border-blue-500/20 text-neutral-300'
                            : 'bg-neutral-800 text-neutral-300'
                      }`}>
                        <p className="text-[10px] text-neutral-500 mb-1">
                          {m.type === 'ai_response' ? 'Kan' : m.type === 'question' ? 'Question' : 'Note'}
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">{m.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
