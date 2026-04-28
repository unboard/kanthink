'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { CardDetailDrawer } from '@/components/board/CardDetailDrawer';
import { TaskDrawer } from '@/components/board/TaskDrawer';
import { VoiceSpores } from './VoiceSpores';
import { KanChart, parseChartDirectives, type TableConfig } from '@/components/charts/KanChart';

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
        description: 'Create a new task. PREFER create_card for most user requests — only use create_task when the user explicitly says "task", "to-do", "todo", or "checklist item", or when adding a sub-task under an existing card. Tasks are short, status-tracked checklist items; cards are first-class kanban units with a thread, properties, and richer content. ALWAYS provide a description (the user has complained about empty tasks). For standalone tasks (no cardId), ALWAYS provide columnName so the task lands in a visible column on the board.',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            cardId: { type: 'STRING', description: 'Parent card ID. Omit for a standalone task — but if omitted you MUST pass columnName.' },
            columnName: { type: 'STRING', description: 'Column to place a standalone task in (e.g. "Inbox", "This Week"). Required when cardId is omitted; ignored when cardId is set. If you are not sure which column, ask the user.' },
            title: { type: 'STRING', description: 'Short, action-oriented task title.' },
            description: { type: 'STRING', description: 'REQUIRED in practice — write a 1-3 sentence description in markdown explaining what the task involves and why. Use **bold**, bullet lists, or links if helpful. Never leave this empty.' },
          },
          required: ['channelId', 'title', 'description'],
        },
      },
      {
        name: 'create_card',
        description: 'Create a new card in a channel with a rich first message',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            columnName: { type: 'STRING', description: 'Column name (e.g. Inbox, Working On)' },
            title: { type: 'STRING', description: 'Card title' },
            content: { type: 'STRING', description: 'Card first message in markdown. Use ## headers, **bold**, - bullet lists, 1. numbered lists, [links](url), > blockquotes to make it well-structured and readable.' },
          },
          required: ['channelId', 'title'],
        },
      },
      {
        name: 'add_note',
        description: 'Add a note/message to a card thread. Format the content as rich markdown.',
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID' },
            content: { type: 'STRING', description: 'Note content in markdown. Use headers (##), bold (**text**), bullet lists (- item), numbered lists (1. item), links [text](url), and blockquotes (> text) to structure the content nicely.' },
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
        description: 'Search for cards in a specific channel by keyword, or get the most recent cards in a channel. ONLY use when the user explicitly asks to find or look up cards in a specific channel. Do NOT use for general questions like "what is going on" or "what should I work on" — answer those from the context you already have.',
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
        name: 'query_mixpanel',
        description: 'Query Mixpanel analytics data. Use conversationally: show overview first, then suggest properties to drill into. Use action="list_properties" to discover what properties an event has. Use action="list_values" to see values for a property. Filter with property + value params. Pass chartType when the user asks for a specific visualization (e.g. "pie chart of orders by category") — otherwise omit and a sensible default is picked.',
        parameters: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING', description: 'The analytics question in natural language' },
            action: { type: 'STRING', description: 'Action: "query" (default), "list_properties" (show properties for an event), "list_values" (show values for a property)' },
            event: { type: 'STRING', description: 'Specific event name (e.g., editor_subscribe, print_order)' },
            property: { type: 'STRING', description: 'Property name to filter by or inspect values of' },
            value: { type: 'STRING', description: 'Property value to filter on' },
            dateRange: { type: 'STRING', description: 'Date range: last_7_days, last_30_days, last_90_days, or YYYY-MM-DD:YYYY-MM-DD' },
            chartType: { type: 'STRING', description: 'Optional preferred chart type: "line" (trends over time), "bar" (category comparison), "pie"/"donut" (proportional breakdown of parts in a whole), "value" (single metric). Use "pie" when the user asks for a breakdown, distribution, share, or split of a total.' },
          },
          required: ['question'],
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
        name: 'unarchive_card',
        description: 'Unarchive a previously archived card so it shows up on the board again. Use when the user says "unarchive X", "bring back X", or "restore X".',
        parameters: {
          type: 'OBJECT',
          properties: { cardId: { type: 'STRING', description: 'Card ID or card title (search matches archived cards too)' } },
          required: ['cardId'],
        },
      },
      {
        name: 'move_card',
        description: 'Move a card to a different column within its channel. Use when the user says "move X to Y column".',
        parameters: {
          type: 'OBJECT',
          properties: {
            cardId: { type: 'STRING', description: 'Card ID or card title' },
            columnName: { type: 'STRING', description: 'Target column name (e.g. "Done", "In Progress", "Inbox")' },
          },
          required: ['cardId', 'columnName'],
        },
      },
      {
        name: 'draft_email',
        description: 'Draft an email for the user to review before sending. This does NOT send it — it creates a draft on screen. Do NOT read the email content aloud. Infer the best style from context (tone, recipient, purpose) — do NOT ask the user to pick a style. Available styles: professional (formal business), casual (friendly), newsletter (bold header banner), update (channel/project update with label).',
        parameters: {
          type: 'OBJECT',
          properties: {
            to: { type: 'STRING', description: 'Recipient email address' },
            subject: { type: 'STRING', description: 'Email subject line' },
            body: { type: 'STRING', description: 'Email body. Use ## for section headers, - for bullet lists, > for callout quotes, and numbered lists. Bold with **text**. Write naturally — the template handles formatting.' },
            style: { type: 'STRING', description: 'Email style: professional, casual, newsletter, or update' },
            recipientName: { type: 'STRING', description: 'Recipient first name for greeting (optional)' },
            cardTitle: { type: 'STRING', description: 'Title of a referenced Kanthink card (optional)' },
            cardId: { type: 'STRING', description: 'ID of a referenced Kanthink card for linking (optional)' },
            ctaText: { type: 'STRING', description: 'Call-to-action button text (optional)' },
            ctaUrl: { type: 'STRING', description: 'Call-to-action button URL (optional)' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'generate_image',
        description: 'Generate an image using AI. Creates a visual image preview on screen. Do NOT describe the generated image in detail — just confirm you\'re generating it and let the visual card appear.',
        parameters: {
          type: 'OBJECT',
          properties: {
            prompt: { type: 'STRING', description: 'Detailed image description/prompt' },
            aspectRatio: { type: 'STRING', description: 'Aspect ratio: 1:1 (default), 3:4, 4:3, 9:16, 16:9' },
          },
          required: ['prompt'],
        },
      },
    ],
  },
  { googleSearch: {} },
];

interface EmailDraft {
  id: string;
  to: string;
  subject: string;
  body: string;
  style: string;
  recipientName?: string;
  cardTitle?: string;
  cardId?: string;
  ctaText?: string;
  ctaUrl?: string;
  status: 'drafting' | 'ready' | 'sending' | 'sent' | 'failed';
}

interface CardPreview {
  id: string;
  title: string;
  summary?: string;
  channelName: string;
  channelId: string;
  columnName?: string;
  messages: { type: string; content: string }[];
  tasks: { id: string; title: string; status: string }[];
  tags?: string[];
  coverImageUrl?: string;
}

interface ImageGenCard {
  id: string;
  prompt: string;
  aspectRatio: string;
  imageUrl?: string;
  status: 'generating' | 'ready' | 'failed';
  error?: string;
}

interface TaskPreview {
  id: string;
  title: string;
  status: string;
  description?: string;
  cardId?: string | null;
  channelId?: string;
}

interface ActionLog {
  id: string;
  action: string;
  result: string;
  success: boolean;
  timestamp: Date;
  cardPreview?: CardPreview;
  taskPreview?: TaskPreview;
  emailDraft?: EmailDraft;
  imageGen?: ImageGenCard;
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

function VoiceTable({ config }: { config: TableConfig }) {
  return (
    <div className="px-3 pb-3">
      {config.title && <p className="text-xs font-medium text-neutral-400 px-1 mb-2">{config.title}</p>}
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-neutral-800/60">
              {config.columns.map(col => (
                <th key={col} className="px-3 py-2 text-left text-neutral-400 font-medium whitespace-nowrap capitalize">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row, i) => (
              <tr key={i} className="border-t border-neutral-800/50 hover:bg-neutral-800/30">
                {config.columns.map(col => (
                  <td key={col} className="px-3 py-2 text-neutral-200 whitespace-nowrap">
                    {row[col] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {config.rows.length > 15 && (
        <p className="text-[10px] text-neutral-500 mt-1 px-1">Showing first 15 of {config.rows.length} rows</p>
      )}
    </div>
  );
}

/** Isolated wrapper to prevent store re-renders from affecting voice audio */
function VoiceCardDrawer({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = useStore((s) => s.cards[cardId]);
  return <CardDetailDrawer card={card ?? null} isOpen={true} onClose={onClose} />;
}

function VoiceTaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useStore((s) => s.tasks[taskId]);
  return <TaskDrawer task={task ?? null} isOpen={true} onClose={onClose} />;
}

export function LiveVoiceMode({ isOpen, onClose, systemPrompt }: LiveVoiceModeProps) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const hasGeneratingImages = actions.some(a => a.imageGen?.status === 'generating');
  const threadIdRef = useRef<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const actionFeedRef = useRef<HTMLDivElement>(null);
  const [expandedEmail, setExpandedEmail] = useState<EmailDraft | null>(null);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const processingNodesRef = useRef<{ osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null>(null);
  // Latest resumption handle from Gemini — used to transparently resume if the transport drops.
  const resumptionHandleRef = useRef<string | null>(null);

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
    // Stop processing sound if active
    if (processingNodesRef.current) {
      try { processingNodesRef.current.osc1.stop(); processingNodesRef.current.osc2.stop(); } catch {}
      processingNodesRef.current = null;
    }
    // Release screen wake lock
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setConnected(false); setIsAiSpeaking(false); setIsProcessing(false); setMicLevel(0);
  }, []);

  // Subtle processing tone — plays during tool execution
  const startProcessingSound = useCallback(() => {
    try {
      const ctx = playCtxRef.current;
      if (!ctx || ctx.state === 'closed') return;
      // Clean up any existing processing sound
      if (processingNodesRef.current) {
        try { processingNodesRef.current.osc1.stop(); processingNodesRef.current.osc2.stop(); } catch {}
        processingNodesRef.current = null;
      }
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.5); // Very quiet
      gain.connect(ctx.destination);
      // Low sine — calm ambient hum
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(220, ctx.currentTime);
      // Slow LFO sweep for subtle movement
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.3, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(15, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfo.start();
      osc1.connect(gain);
      osc1.start();
      // Higher harmonic — airy texture
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(660, ctx.currentTime);
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.015, ctx.currentTime);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      processingNodesRef.current = { osc1, osc2, gain };
    } catch { /* best effort */ }
  }, []);

  const stopProcessingSound = useCallback(() => {
    if (!processingNodesRef.current) return;
    try {
      const ctx = playCtxRef.current;
      const { osc1, osc2, gain } = processingNodesRef.current;
      if (ctx && ctx.state !== 'closed') {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        osc1.stop(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 0.4);
      } else {
        osc1.stop(); osc2.stop();
      }
    } catch {}
    processingNodesRef.current = null;
  }, []);

  // Stop all queued AI audio (for interruption)
  const interruptPlayback = useCallback(() => {
    for (const s of activeSources.current) { try { s.stop(); } catch {} }
    activeSources.current = [];
    nextPlayRef.current = 0;
    setIsAiSpeaking(false);
  }, []);

  const playChunk = useCallback((b64: string) => {
    // Recreate AudioContext if it was closed or doesn't exist
    if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    try {
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
    } catch (e) {
      console.error('[Voice playback]', e);
    }
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

  const sendEmail = useCallback(async (draftId: string) => {
    setActions(prev => prev.map(a =>
      a.emailDraft?.id === draftId ? { ...a, emailDraft: { ...a.emailDraft!, status: 'sending' as const } } : a
    ));
    try {
      const draft = actions.find(a => a.emailDraft?.id === draftId)?.emailDraft;
      if (!draft) return;
      const res = await fetch('/api/voice/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_email', args: {
          to: draft.to, subject: draft.subject, body: draft.body,
          style: draft.style, recipientName: draft.recipientName || '',
          cardTitle: draft.cardTitle || '', cardId: draft.cardId || '',
          ctaText: draft.ctaText || '', ctaUrl: draft.ctaUrl || '',
        } }),
      });
      const data = await res.json();
      const success = !data.result.startsWith('Failed') && !data.result.startsWith('Email error');
      setActions(prev => prev.map(a =>
        a.emailDraft?.id === draftId
          ? { ...a, emailDraft: { ...a.emailDraft!, status: success ? 'sent' as const : 'failed' as const }, result: data.result, success }
          : a
      ));

      // Let Kan know the user just sent the draft so it doesn't keep treating the email as pending.
      // turnComplete: false so the context is absorbed silently without triggering an unprompted reply.
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const note = success
          ? `[System] The user just pressed Send on the draft email to ${draft.to} (subject "${draft.subject}"). It has been delivered. Treat the send_email action as complete for the rest of this conversation and don't ask about it again unless the user brings it up.`
          : `[System] The user pressed Send on the draft email to ${draft.to} but delivery failed.`;
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: note }] }],
            turnComplete: false,
          },
        }));
      }
    } catch {
      setActions(prev => prev.map(a =>
        a.emailDraft?.id === draftId ? { ...a, emailDraft: { ...a.emailDraft!, status: 'failed' as const } } : a
      ));
    }
  }, [actions]);

  const executeAction = useCallback(async (name: string, args: Record<string, string>): Promise<string> => {
    // Draft email — don't send, just show in UI
    if (name === 'draft_email') {
      const draftId = crypto.randomUUID();
      const style = args.style || 'professional';
      const draft: EmailDraft = {
        id: draftId, to: args.to, subject: args.subject, body: args.body,
        style, recipientName: args.recipientName, cardTitle: args.cardTitle,
        cardId: args.cardId, ctaText: args.ctaText, ctaUrl: args.ctaUrl,
        status: 'ready',
      };
      setActions(prev => [...prev, {
        id: crypto.randomUUID(), action: 'draft_email',
        result: `${style} email draft ready for ${args.to}`,
        success: true, timestamp: new Date(), emailDraft: draft,
      }]);
      return `Email draft is ready on screen for the user to review and send. Do NOT read the email content aloud.`;
    }

    // Generate image — fire and forget, update UI when done
    if (name === 'generate_image') {
      const genId = crypto.randomUUID();
      const card: ImageGenCard = {
        id: genId,
        prompt: args.prompt,
        aspectRatio: args.aspectRatio || '1:1',
        status: 'generating',
      };
      setActions(prev => [...prev, {
        id: crypto.randomUUID(), action: 'generate_image',
        result: 'Generating image...',
        success: true, timestamp: new Date(), imageGen: card,
      }]);

      // Fire and forget — update state when done
      fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: args.prompt, aspectRatio: args.aspectRatio || '1:1' }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setActions(prev => {
            const updated = prev.map(a =>
              a.imageGen?.id === genId
                ? { ...a, imageGen: { ...a.imageGen!, imageUrl: data.url, status: 'ready' as const } }
                : a
            );
            // Auto-attach to any pending email draft
            const emailAction = updated.find(a => a.emailDraft?.status === 'ready');
            if (emailAction?.emailDraft && data.url) {
              return updated.map(a =>
                a.emailDraft?.id === emailAction.emailDraft!.id
                  ? { ...a, emailDraft: { ...a.emailDraft!, body: a.emailDraft!.body + `\n\n![Generated image](${data.url})` } }
                  : a
              );
            }
            return updated;
          });
        } else {
          const errData = await res.json().catch(() => ({ error: 'Generation failed' }));
          setActions(prev => prev.map(a =>
            a.imageGen?.id === genId
              ? { ...a, imageGen: { ...a.imageGen!, status: 'failed' as const, error: errData.error || 'Generation failed' } }
              : a
          ));
        }
      }).catch(() => {
        setActions(prev => prev.map(a =>
          a.imageGen?.id === genId
            ? { ...a, imageGen: { ...a.imageGen!, status: 'failed' as const, error: 'Generation failed' } }
            : a
        ));
      });

      return 'Image is being generated — the user will see it on screen when ready.';
    }

    // Async Mixpanel queries — don't block voice while fetching data
    if (name === 'query_mixpanel') {
      const queryId = crypto.randomUUID();
      setActions(prev => [...prev, {
        id: queryId, action: 'query_mixpanel',
        result: 'Fetching analytics data...',
        success: true, timestamp: new Date(),
      }]);

      fetch('/api/voice/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: name, args }),
      }).then(async (res) => {
        const data = await res.json();
        setActions(prev => prev.map(a =>
          a.id === queryId
            ? { ...a, result: data.result || 'No data found.' }
            : a
        ));
      }).catch(() => {
        setActions(prev => prev.map(a =>
          a.id === queryId
            ? { ...a, result: 'Query failed.', success: false }
            : a
        ));
      });

      return 'I\'m pulling up that data now — it\'ll appear on screen in a moment.';
    }

    try {
      const res = await fetch('/api/voice/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: name, args }),
      });
      const data = await res.json();
      // Use voiceResult (without chart JSON) for what Gemini speaks, but full result for UI
      const voiceReturn = data.voiceResult || data.result;

      setActions(prev => [...prev, {
        id: crypto.randomUUID(), action: name, result: data.result,
        success: !data.result.startsWith('Failed'), timestamp: new Date(),
        cardPreview: data.cardPreview,
        taskPreview: data.taskPreview,
      }]);
      return voiceReturn;
    } catch (err) {
      const msg = `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setActions(prev => [...prev, { id: crypto.randomUUID(), action: name, result: msg, success: false, timestamp: new Date() }]);
      return msg;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null); setStatus('Fetching session...'); setActions([]);
    // Acquire screen wake lock to prevent screen from going black
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
    }
    activeRef.current = true;
    if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
    if (playCtxRef.current.state === 'suspended') await playCtxRef.current.resume();

    try {
      const res = await fetch('/api/voice/live');
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error ${res.status}`); }
      const { wsUrl, model } = await res.json();
      if (!wsUrl) throw new Error('No WebSocket URL returned');

      // Retry logic for transient WebSocket errors (e.g. 1011 server errors)
      const MAX_RETRIES = 2;
      const connectWs = (attempt: number): Promise<void> => new Promise<void>((resolve, reject) => {
        if (!activeRef.current) { reject(new Error('Cancelled')); return; }
        setStatus(attempt > 0 ? `Reconnecting (attempt ${attempt + 1})...` : 'Connecting...');
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
              // Keep long back-and-forth conversations alive past Gemini's default audio-session cap
              // by compressing older context into a sliding window.
              contextWindowCompression: { slidingWindow: {} },
              // Ask the server for resumption handles so we can reconnect mid-conversation if the
              // transport drops before the user intentionally ends the session.
              sessionResumption: resumptionHandleRef.current
                ? { handle: resumptionHandleRef.current }
                : {},
              systemInstruction: { parts: [{ text: (systemPrompt || 'You are Kan, a helpful AI assistant.') + `

TOOL USE RULES — CRITICAL:
You have tools available, but ONLY use them when the user EXPLICITLY asks you to take an action. Examples of explicit requests: "mark that task complete", "create a card for this", "archive that card", "send an email to Bob".

NEVER call a tool based on:
- Your own interpretation of what might be helpful
- Conversational context that wasn't a direct request
- Assumptions about what the user wants done

If you're unsure whether the user wants you to take an action, ASK first — don't just do it. Say "Would you like me to [action]?" and wait for confirmation.

Google Search is the exception — you may use it freely when the user asks about current information, URLs, or research topics.

EMAIL WORKFLOW:
Before drafting an email, make sure you understand:
1. The recipient (who is it going to?)
2. The intent/purpose (what's the goal of this email?)
Do NOT ask about email style — infer it from context (tone, recipient, purpose). Say something like "I'll draft that in a professional tone" and proceed. The user can request changes after seeing the draft.

When drafting, use the draft_email tool. This creates a visual draft on screen — it does NOT send it. Do NOT read the email content aloud. Just say "I've drafted that — you can review and send it on screen." Write the body using clean prose, not raw markdown syntax. Use headers and structure naturally — avoid showing asterisks or markdown characters in the email text.

ANALYTICS DATA EXPLORATION:
When the user asks about analytics, events, or Mixpanel data, act as a data concierge:
1. First query the event to show an overview (count + daily chart)
2. Mention the available properties: "I can break this down by screen, plan_type, or source — which one interests you?"
3. If they pick a property, use action="list_values" to show what values exist
4. If they pick a value, filter the query with property + value params
5. Always mention the date range and offer to change it: "This shows the last 7 days — want a different range?"
6. Suggest comparisons: "Want me to compare this to the previous period?"
7. If the user isn't sure of the exact event name, show the top events list and help them find it
Be proactive — don't just answer, guide them to insights.

IMAGE GENERATION:
When the user asks you to create, generate, or draw an image, use the generate_image tool. Provide a detailed, descriptive prompt. Do NOT describe the generated image verbally — just say "I'm generating that for you" and let the visual card appear. If they specify an orientation (landscape, portrait, square), map to the appropriate aspectRatio (16:9, 9:16, 1:1 etc.).

When the user asks to create an email with images, use BOTH draft_email and generate_image tools. The image will be automatically attached to the email when it finishes generating.

CARDS vs TASKS — DEFAULT TO CARDS:
When the user asks you to capture something — an idea, a bug, a feature, a note, a thing to look into — create a CARD, not a task. Cards are the primary kanban unit; they have a thread, can be moved between columns, and gain context over time. Only call create_task when:
- The user literally says "task", "to-do", "todo", or "checklist item", OR
- You are breaking down an existing card into sub-items (cardId is set).
For standalone tasks, you MUST pass columnName so it lands on the board — never create a task without a column or a parent card. ALWAYS write a real description for tasks (1-3 sentences explaining what it involves). Empty-description tasks are a known regression and a user complaint.

CONTENT FORMATTING:
When creating notes, cards, or tasks with content, ALWAYS use rich markdown formatting. The app renders markdown so it looks great. Use:
- ## Headers for sections
- **Bold** for emphasis
- Bullet lists (- item) for multiple points
- Numbered lists (1. item) for steps
- [Links](url) for references
- > Blockquotes for callouts
Never write plain unformatted paragraphs — structure the content so it's scannable and well-organized.

After any tool executes, always confirm what you did.

NEVER claim you completed an action unless you actually called the corresponding tool and saw it succeed. Do not say "I created that card", "I added the task", "I archived it", or any similar past-tense confirmation unless the tool was invoked and returned a result. If the user asks for an action and you haven't called the tool yet, say what you're about to do ("I'll create that card now") — then call the tool. Fabricating a success message is worse than asking for clarification.` }] },
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
              setIsProcessing(true);
              startProcessingSound();
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
              stopProcessingSound();
              setIsProcessing(false);
            }

            // Track the resumption handle so we can reconnect transparently if the socket drops.
            if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate?.newHandle) {
              resumptionHandleRef.current = msg.sessionResumptionUpdate.newHandle;
            }

            // Gemini warns us ~60s before it tears down the connection for rotation. We don't need
            // to do anything beyond logging — sessionResumption + ws.onclose auto-retry handle it.
            if (msg.goAway?.timeLeft) {
              console.info('[Voice] Server rotating session in', msg.goAway.timeLeft);
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

      // Retry with backoff for transient server errors
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await connectWs(attempt);
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Unknown error');
          // Only retry on server-side WebSocket errors (1011, 1013, etc.) or connection failures
          const isRetryable = /Disconnected \(10(1[1-5])\)|Connection failed|timed out/i.test(lastError.message);
          if (!isRetryable || attempt >= MAX_RETRIES || !activeRef.current) break;
          // Brief delay before retry
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      if (lastError) throw lastError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus(''); stop();
    }
  }, [voiceName, systemPrompt, stop, playChunk, startMic, executeAction, connected]);

  // Save voice session to operator chat thread on close
  const saveSession = useCallback(async (sessionActions: ActionLog[]) => {
    if (sessionActions.length === 0) return;
    try {
      // Create a thread
      const res = await fetch('/api/operator-chat/threads', { method: 'POST' });
      if (!res.ok) return;
      const { id: threadId } = await res.json();

      // Build messages from actions
      const now = new Date().toISOString();
      const messages = sessionActions.map(a => {
        let content = '';
        const imageUrls: string[] = [];

        if (a.emailDraft) {
          const sent = a.emailDraft.status === 'sent' ? ' (sent)' : '';
          content = `**Email${sent}** to ${a.emailDraft.to}\n**Subject:** ${a.emailDraft.subject}\n\n${a.emailDraft.body.slice(0, 200)}${a.emailDraft.body.length > 200 ? '...' : ''}`;
        } else if (a.imageGen) {
          content = `**Image generated** (${a.imageGen.aspectRatio})\n${a.imageGen.prompt}`;
          if (a.imageGen.imageUrl) imageUrls.push(a.imageGen.imageUrl);
          if (a.imageGen.status === 'failed') content = `**Image failed:** ${a.imageGen.error || 'Unknown error'}`;
        } else {
          content = `**${a.action}:** ${a.result}`;
        }

        return {
          id: crypto.randomUUID(),
          type: 'ai_response' as const,
          content,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          authorId: 'kan',
          authorName: 'Kan',
          createdAt: a.timestamp.toISOString(),
        };
      });

      // Title from first action
      const first = sessionActions[0];
      const title = first.emailDraft
        ? `Voice: Email to ${first.emailDraft.to}`
        : first.imageGen
        ? 'Voice: Image generation'
        : `Voice: ${first.action}`;

      // Save via PATCH
      await fetch(`/api/operator-chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.slice(0, 60),
          messages: [
            { id: crypto.randomUUID(), type: 'question', content: 'Voice session', createdAt: now },
            ...messages,
          ],
        }),
      }).catch(() => {});
    } catch {
      // Best-effort save
    }
  }, []);

  // Auto-scroll action feed when new actions appear
  useEffect(() => {
    if (actions.length > 0 && actionFeedRef.current) {
      setTimeout(() => actionFeedRef.current?.scrollTo({ top: actionFeedRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  }, [actions.length]);

  // Fetch rendered email HTML when preview opens
  useEffect(() => {
    if (!expandedEmail) { setEmailPreviewHtml(null); return; }
    fetch('/api/voice/email-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: expandedEmail.subject,
        body: expandedEmail.body,
        style: expandedEmail.style,
        recipientName: expandedEmail.recipientName,
        cardTitle: expandedEmail.cardTitle,
        cardId: expandedEmail.cardId,
        ctaText: expandedEmail.ctaText,
        ctaUrl: expandedEmail.ctaUrl,
      }),
    }).then(r => r.json()).then(d => setEmailPreviewHtml(d.html)).catch(() => {});
  }, [expandedEmail]);

  useEffect(() => {
    if (isOpen) { start(); threadIdRef.current = null; }
    else {
      // Save session before clearing
      const currentActions = actions;
      if (currentActions.length > 0) saveSession(currentActions);
      stop(); setStatus(''); setError(null); setActions([]);
    }
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Re-acquire wake lock and resume audio when page becomes visible again
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && activeRef.current) {
        // Re-acquire wake lock (it gets released when page goes hidden)
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          navigator.wakeLock.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
        }
        // Resume audio context if suspended
        if (playCtxRef.current?.state === 'suspended') {
          playCtxRef.current.resume().catch(() => {});
        }
        if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
    }
  }, []);

  if (!isOpen) return null;

  const bars = Array.from({ length: 5 }, (_, i) => Math.max(0.15, micLevel * (1 - Math.abs(i - 2) * 0.2)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950">
      {/* Voice-specific spore particles — more particles, higher opacity, reactive to AI speaking */}
      <VoiceSpores isSpeaking={isAiSpeaking} isProcessing={isProcessing} />
      {/* Gradient glow at edges */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isAiSpeaking ? 'opacity-80' : 'opacity-40'}`}
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.2) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(6,182,212,0.2) 0%, transparent 50%), radial-gradient(ellipse at 0% 50%, rgba(167,139,250,0.1) 0%, transparent 40%), radial-gradient(ellipse at 100% 50%, rgba(34,211,238,0.1) 0%, transparent 40%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full w-full px-6 pt-5 pb-4 safe-area-bottom" style={{ maxWidth: '100%' }}>
        {/* Top bar — logo + status label + settings */}
        <div className="flex items-center gap-3">
          <KanthinkIcon size={32} className="text-white" />
          <div className="flex items-center gap-1.5 bg-neutral-800/80 rounded-full px-3 py-1.5">
            {connected && !isMuted && (
              <div className="flex items-center gap-0.5 h-4">
                {bars.map((s, i) => (
                  <div key={i} className={`w-1 rounded-full ${isAiSpeaking ? 'bg-violet-400 animate-voice-bar' : 'bg-cyan-400 transition-all duration-75'}`}
                    style={isAiSpeaking
                      ? { animationDelay: `${i * 0.12}s` }
                      : { height: `${Math.max(3, s * 16)}px` }
                    } />
                ))}
              </div>
            )}
            {isMuted && (
              <svg className="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
            <span className={`text-xs ml-1 ${isMuted ? 'text-red-400' : isAiSpeaking ? 'text-violet-300' : 'text-neutral-300'}`}>
              {!connected ? 'Connecting...' : isMuted ? 'Muted' : isProcessing ? 'Processing...' : isAiSpeaking ? 'Kan is speaking' : 'Listening'}
            </span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="absolute top-16 left-6 bg-neutral-800 border border-neutral-700 rounded-xl p-4 w-56 z-20">
            <p className="text-xs text-neutral-400 font-medium mb-2">Voice</p>
            <div className="grid grid-cols-2 gap-1.5">
              {VOICE_OPTIONS.map(v => (
                <button key={v.id} onClick={() => { setVoiceName(v.id); localStorage.setItem(VOICE_KEY, v.id); }}
                  className={`px-2 py-1.5 rounded-lg text-xs ${voiceName === v.id ? 'bg-violet-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
                >{v.label}</button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 mt-3">Changes apply on next session</p>
          </div>
        )}

        {/* Main body — scrollable, shows loading/error + action feed */}
        <div ref={actionFeedRef} className="flex-1 overflow-y-auto px-2 py-4">
          {status && !error && (
            <div className="flex items-center justify-center gap-2 py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-sm text-neutral-400">{status}</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={start} className="text-xs text-violet-400 hover:underline">Try again</button>
            </div>
          )}

          {/* Action feed — only shows mutations and previews, not search results */}
          <div className="space-y-3">
            {actions.filter(a => !['search_cards'].includes(a.action)).map(a => (
              <div key={a.id}>
                {/* Generated image */}
                {a.imageGen ? (
                  <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl overflow-hidden animate-slide-in">
                    <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                        <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">{a.imageGen.aspectRatio}</span>
                      </div>
                      <div>
                        {a.imageGen.status === 'generating' && <span className="text-xs text-violet-400 animate-pulse">Generating...</span>}
                        {a.imageGen.status === 'ready' && <span className="text-xs text-green-400">Ready</span>}
                        {a.imageGen.status === 'failed' && <span className="text-xs text-red-400">Failed</span>}
                      </div>
                    </div>
                    {a.imageGen.status === 'generating' ? (
                      <div className="px-4 py-12 flex items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                      </div>
                    ) : a.imageGen.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={a.imageGen.imageUrl} alt={a.imageGen.prompt} className="w-full" />
                    ) : a.imageGen.error ? (
                      <div className="px-4 py-6 text-center text-sm text-red-400">{a.imageGen.error}</div>
                    ) : null}
                    {a.imageGen.status === 'ready' && (
                      <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                        <p className="text-xs text-neutral-400 truncate flex-1">{a.imageGen.prompt}</p>
                        <a
                          href={a.imageGen.imageUrl}
                          download={`kan-image-${a.imageGen.id.slice(0, 8)}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Save
                        </a>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Email draft */}
                {a.emailDraft ? (
                  <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl overflow-hidden animate-slide-in">
                    <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs text-neutral-400">To: <span className="text-neutral-200">{a.emailDraft.to}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">{a.emailDraft.style || 'professional'}</span>
                        {a.emailDraft.status === 'sent' && <span className="text-xs text-green-400">Sent</span>}
                        {a.emailDraft.status === 'sending' && <span className="text-xs text-violet-400 animate-pulse">Sending...</span>}
                        {a.emailDraft.status === 'failed' && <span className="text-xs text-red-400">Failed</span>}
                      </div>
                    </div>
                    <div className="px-4 py-3 cursor-pointer hover:bg-neutral-800/50 transition-colors" onClick={() => setExpandedEmail(a.emailDraft!)}>
                      <p className="text-sm font-medium text-white mb-1">{a.emailDraft.subject}</p>
                      <p className="text-xs text-neutral-400 line-clamp-2">{a.emailDraft.body.replace(/[#*>\-]/g, '').slice(0, 120)}...</p>
                      <p className="text-[10px] text-neutral-500 mt-1">Tap to preview full email</p>
                    </div>
                    {a.emailDraft.status === 'ready' && (
                      <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
                        <button
                          onClick={() => sendEmail(a.emailDraft!.id)}
                          disabled={hasGeneratingImages}
                          className={`flex-1 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                            hasGeneratingImages ? 'bg-neutral-700 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'
                          }`}
                        >
                          {hasGeneratingImages ? 'Waiting for images...' : 'Send Email'}
                        </button>
                        <button
                          onClick={() => setActions(prev => prev.filter(x => x.id !== a.id))}
                          className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 transition-colors"
                        >
                          Discard
                        </button>
                      </div>
                    )}
                  </div>
                ) : a.taskPreview ? (
                  <div className="bg-neutral-900/90 border border-neutral-700 rounded-xl overflow-hidden animate-slide-in cursor-pointer hover:border-violet-500/50 transition-colors"
                    onClick={() => setExpandedTaskId(a.taskPreview!.id)}>
                    {/* Task created banner */}
                    <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs font-medium text-green-400">Task created</span>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const statuses = ['not_started', 'in_progress', 'on_hold', 'done'];
                          const currentIdx = statuses.indexOf(a.taskPreview!.status);
                          const nextStatus = statuses[(currentIdx + 1) % statuses.length];
                          // Update task status via API
                          fetch('/api/voice/action', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'update_task_status', args: { taskId: a.taskPreview!.id, status: nextStatus } }),
                          }).then(() => {
                            setActions(prev => prev.map(act =>
                              act.taskPreview?.id === a.taskPreview!.id
                                ? { ...act, taskPreview: { ...act.taskPreview!, status: nextStatus } }
                                : act
                            ));
                          }).catch(() => {});
                        }}
                        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          a.taskPreview.status === 'done'
                            ? 'bg-green-500 border-green-500'
                            : a.taskPreview.status === 'in_progress'
                            ? 'border-blue-400 bg-blue-400/20'
                            : a.taskPreview.status === 'on_hold'
                            ? 'border-amber-400 bg-amber-400/20'
                            : 'border-neutral-500'
                        }`}
                      >
                        {a.taskPreview.status === 'done' && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${a.taskPreview.status === 'done' ? 'text-neutral-500 line-through' : 'text-white'}`}>
                          {a.taskPreview.title}
                        </p>
                        {a.taskPreview.description && (
                          <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{a.taskPreview.description}</p>
                        )}
                        <p className="text-[10px] text-neutral-500 mt-1 capitalize">{a.taskPreview.status.replace('_', ' ')}</p>
                      </div>
                    </div>
                  </div>
                ) : a.cardPreview ? (
                  <div className="relative bg-neutral-900/90 border border-neutral-700 rounded-xl overflow-hidden animate-slide-in hover:border-violet-500/50 transition-colors">
                    {/* Full-card hit target — absolute button sits above all content so taps
                        on the title, whitespace, tags, etc. all open the card. Content
                        beneath stays visually normal; only the click routing moves up here. */}
                    <button
                      type="button"
                      onClick={() => setExpandedCardId(a.cardPreview!.id)}
                      aria-label={`Open card ${a.cardPreview.title}`}
                      className="absolute inset-0 z-10 w-full h-full cursor-pointer"
                    />
                    {/* Card created banner */}
                    {a.action === 'create_card' && (
                      <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-medium text-green-400">Card created</span>
                      </div>
                    )}
                    {a.cardPreview.coverImageUrl && (
                      <img src={a.cardPreview.coverImageUrl} alt="" className="w-full h-24 object-cover" />
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-violet-400 mb-1">{a.cardPreview.channelName}{a.cardPreview.columnName ? ` › ${a.cardPreview.columnName}` : ''}</p>
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
                  /* Regular action result — card style with chart/table support */
                  (() => {
                    const parsed = parseChartDirectives(a.result);
                    const charts = parsed.charts;
                    const tables = parsed.tables || [];
                    const cleanText = parsed.cleanText.trim();
                    return (
                      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl animate-slide-in overflow-hidden">
                        {cleanText && (
                          <div className="flex items-start gap-3 px-4 py-3">
                            {a.success ? (
                              <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                <svg className="h-3 w-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : (
                              <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="h-3 w-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </div>
                            )}
                            <span className={`text-sm ${a.success ? 'text-white' : 'text-red-300'}`}>{cleanText.slice(0, 500)}{cleanText.length > 500 ? '...' : ''}</span>
                          </div>
                        )}
                        {tables.map((table, ti) => (
                          <VoiceTable key={ti} config={table} />
                        ))}
                        {charts.map((chart, ci) => (
                          <div key={ci} className="px-2 pb-3">
                            <KanChart config={chart} />
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom buttons — Mute + Stop */}
        {connected && (
          <div className="flex gap-3 px-4 pb-2">
            <button onClick={toggleMute}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                isMuted ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700'
              }`}>
              {isMuted ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={() => { stop(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 text-sm font-medium transition-colors">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Expanded email preview overlay */}
      {expandedEmail && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/30" onClick={() => setExpandedEmail(null)}>
          <div className="w-full max-w-lg h-[85vh] bg-neutral-900 border-t border-neutral-700 rounded-t-2xl flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-4 w-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-neutral-400">To: {expandedEmail.to}</span>
                  <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">{expandedEmail.style}</span>
                </div>
                <p className="text-sm font-semibold text-white truncate">{expandedEmail.subject}</p>
              </div>
              <button onClick={() => setExpandedEmail(null)} className="p-1.5 text-neutral-400 hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {emailPreviewHtml ? (
                <iframe
                  srcDoc={emailPreviewHtml}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              )}
            </div>
            {expandedEmail.status === 'ready' && (
              <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-4 py-3 flex gap-2">
                <button onClick={() => { sendEmail(expandedEmail.id); setExpandedEmail(null); }}
                  disabled={hasGeneratingImages}
                  className={`flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors ${hasGeneratingImages ? 'bg-neutral-700 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}>
                  {hasGeneratingImages ? 'Waiting for images...' : 'Send Email'}</button>
                <button onClick={() => { setActions(prev => prev.filter(x => x.emailDraft?.id !== expandedEmail.id)); setExpandedEmail(null); }}
                  className="px-4 py-2.5 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700">Discard</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded card detail overlay — read-only, voice stays active */}
      {/* Full card detail drawer (real component, live data) */}
      {expandedCardId && (
        <VoiceCardDrawer cardId={expandedCardId} onClose={() => setExpandedCardId(null)} />
      )}

      {/* Full task detail drawer */}
      {expandedTaskId && (
        <VoiceTaskDrawer taskId={expandedTaskId} onClose={() => setExpandedTaskId(null)} />
      )}
    </div>
  );
}
