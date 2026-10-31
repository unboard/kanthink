'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppWindow, ArrowUp, AudioLines, Keyboard, Loader2, Maximize2, Mic, Play, Plus, Square, StickyNote, Volume2 } from 'lucide-react';
import { ShroomBot } from './ShroomBot';
import { hash } from '@/lib/kan/city/layout';
import type { CityPlot } from './types';

/**
 * Talking with a resident. The thread is a card in its channel; this is a window on it.
 *
 * Three ways to talk, remembered per device:
 * - Type: text in, text out.
 * - Speak: text or the mic in, and the bot answers out loud in its own voice.
 * - Talk: hands free. It speaks, then listens; you answer; it hears you stop and replies.
 */

type Mode = 'type' | 'speak' | 'talk';
interface Line {
  id: string; who: 'you' | 'bot' | 'other'; name: string; text: string; at: string;
  /** What it made: apps (building or ready) and cards, to open from the chat. */
  apps?: { id: string; title: string; cardId: string }[];
  cards?: { id: string; title: string }[];
}
export interface OpenApp { id: string; title: string; href: string; full?: boolean }
interface Chat {
  resident: { channelId: string; name: string; voice: string; personality: string };
  channelName: string;
  cardId: string;
  title: string;
  messages: Line[];
}

const MODE_KEY = 'kan-city-talk-mode';
const readMode = (): Mode => {
  try { const m = localStorage.getItem(MODE_KEY); return m === 'speak' || m === 'talk' ? m : 'type'; } catch { return 'type'; }
};

export function BotChat({ plot, neighbors, onSaid, onVisits, onBoard, onOpenApp }: {
  plot: CityPlot;
  /** Residents next door, who this one can go and talk to. */
  neighbors: CityPlot[];
  /** Each line the resident says, so the city can put it in a bubble over its head. */
  onSaid(text: string): void;
  onVisits(v: { from: string; to: string }[]): void;
  onBoard(): void;
  /** Play an app it built: in the drawer, or full screen. */
  onOpenApp(app: OpenApp): void;
}) {
  const id = plot.channelId;
  const name = plot.resident.name;
  const [chat, setChat] = useState<Chat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [speaking, setSpeaking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const voice = useRef(plot.resident.voice);
  voice.current = plot.resident.voice;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const ear = useListener();
  const audio = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; audio.current?.pause(); };
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private window */ }
    if (m === 'type') { audio.current?.pause(); ear.cancel(); }
  };

  /** Say it out loud in the resident's voice; resolves when it's done talking. */
  const speak = useCallback(async (text: string) => {
    audio.current?.pause();
    try {
      setSpeaking(true);
      const res = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1200), voice: voice.current }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      await new Promise<void>((resolve) => { a.onended = () => resolve(); a.onerror = () => resolve(); void a.play().catch(() => resolve()); });
      URL.revokeObjectURL(url);
    } finally {
      if (alive.current) setSpeaking(false);
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setDraft('');
    setSending(true);
    setError(null);
    setChat((c) => c && { ...c, messages: [...c.messages, { id: `me-${Date.now()}`, who: 'you', name: 'You', text: t, at: new Date().toISOString() }] });
    try {
      const res = await fetch('/api/prototypes/kan/city/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: id, action: 'say', text: t }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'They didn’t catch that.'); return; }
      if (!alive.current) return;
      setChat(j.chat);
      onSaid(j.reply);
      if (j.visits?.length) onVisits(j.visits);
      if (modeRef.current !== 'type') await speak(j.reply);
      if (modeRef.current === 'talk' && alive.current) void listenAndSend();
    } catch {
      setError('They didn’t catch that.');
    } finally {
      if (alive.current) setSending(false);
    }
    // listenAndSend is defined below and only read when the reply lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sending, onSaid, onVisits, speak]);

  const listenAndSend = useCallback(async () => {
    const heard = await ear.listen();
    if (heard && alive.current) void send(heard);
  }, [ear, send]);

  const open = useCallback(async (fresh: boolean) => {
    setChat(null);
    setError(null);
    try {
      const res = await fetch('/api/prototypes/kan/city/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: id, action: fresh ? 'new' : 'open' }) });
      const j = await res.json();
      if (!alive.current) return;
      if (!res.ok) { setError(j.error ?? `${name} isn’t home.`); return; }
      setChat(j);
      const last = j.messages.at(-1);
      if (last?.who === 'bot') {
        onSaid(last.text);
        if (modeRef.current !== 'type') {
          await speak(last.text);
          if (modeRef.current === 'talk' && alive.current) void listenAndSend();
        }
      }
    } catch {
      setError(`${name} isn’t home.`);
    }
    // Opening once per resident; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { void open(false); }, [open]);

  /** Fetch the thread again without clearing it: a build landed and the bot said so. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/prototypes/kan/city/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: id, action: 'open' }) });
      if (!res.ok || !alive.current) return;
      const j: Chat = await res.json();
      setChat((c) => {
        if (c && j.messages.length > c.messages.length) {
          const last = j.messages.at(-1);
          if (last?.who === 'bot') {
            onSaid(last.text);
            if (modeRef.current !== 'type') void speak(last.text);
          }
        }
        return j;
      });
    } catch { /* next poll */ }
  }, [id, onSaid, speak]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [chat?.messages.length, sending]);

  const status = ear.state === 'listening' ? 'Listening… just talk' : ear.state === 'hearing' ? 'Hearing you…' : ear.state === 'thinking' ? 'Writing down what you said…'
    : sending ? `${name} is thinking…` : speaking ? `${name} is talking…` : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 pr-8">
        <ShroomBot seed={hash(id)} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[19px] font-semibold leading-tight text-neutral-50">{name}</h3>
          <p className="text-[12px] text-neutral-500">Runs {plot.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-400">{plot.resident.personality}</p>
        </div>
      </div>

      {/* How to talk. */}
      <div className="mt-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1 text-[12px]">
        {([['type', Keyboard, 'Type'], ['speak', Volume2, 'Out loud'], ['talk', AudioLines, 'Hands free']] as const).map(([m, Icon, label]) => (
          <button
            key={m}
            onClick={() => { setMode(m); if (m === 'talk' && !sending && !speaking && ear.state === 'idle') void listenAndSend(); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 ${mode === m ? 'bg-violet-500 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div ref={list} className="mt-3 min-h-[160px] flex-1 space-y-2.5 overflow-y-auto pr-1">
        {!chat && !error && <p className="flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> {name} is coming over…</p>}
        {chat?.messages.map((m) => (
          <div key={m.id} className={`flex ${m.who === 'you' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[14px] leading-relaxed ${m.who === 'you' ? 'rounded-br-md bg-violet-600 text-white' : m.who === 'other' ? 'bg-sky-500/10 text-sky-50' : 'rounded-bl-md bg-white/[0.06] text-neutral-100'}`}>
              {m.who !== 'you' && <p className="mb-0.5 text-[11px] font-medium text-violet-300">{m.name}</p>}
              <div className="prose prose-invert prose-sm max-w-none break-words prose-p:my-0.5"><ReactMarkdown>{m.text}</ReactMarkdown></div>
              {m.apps?.map((a) => <AppTile key={`${m.id}-${a.id}`} app={a} onOpen={onOpenApp} onReady={refresh} />)}
              {m.cards && m.cards.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.cards.map((c) => (
                    <button key={c.id} onClick={onBoard} className="flex max-w-full items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-left text-[12px] text-neutral-200 hover:bg-white/10">
                      <StickyNote className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" /> <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {status && <p className="flex items-center gap-2 text-[12px] text-neutral-500">{ear.state === 'idle' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />}{status}</p>}
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</p>}
        {ear.error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{ear.error}</p>}
      </div>

      {/* Send it to a neighbor. */}
      {neighbors.length > 0 && chat && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 text-[12px]">
          {neighbors.slice(0, 8).map((n) => (
            <button key={n.channelId} onClick={() => setDraft(`Go talk to ${n.resident.name} about `)} className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-white/10 py-1 pl-1 pr-2.5 text-neutral-300 hover:border-violet-400/50">
              <ShroomBot seed={hash(n.channelId)} size={18} /> Talk to {n.resident.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="mt-2 flex items-end gap-1.5 rounded-2xl border border-white/10 bg-neutral-900/80 p-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } e.stopPropagation(); }}
          rows={1}
          placeholder={`Say something to ${name}…`}
          className="block max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
        />
        {ear.state === 'idle' ? (
          <button type="button" onClick={() => void listenAndSend()} disabled={sending} aria-label="Talk" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-violet-300 hover:bg-white/5 disabled:opacity-40"><Mic className="h-5 w-5" /></button>
        ) : (
          <button type="button" onClick={() => ear.stop()} aria-label="Done talking" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-white"><Square className="h-3.5 w-3.5 fill-current" /></button>
        )}
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
      </form>

      <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
        <button onClick={onBoard} className="truncate hover:text-neutral-200">Saved as a card in {plot.name}</button>
        <button onClick={() => void open(true)} disabled={sending} className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5 hover:text-neutral-200"><Plus className="h-3 w-3" /> New chat</button>
      </div>
    </div>
  );
}

/**
 * An app a bot built from the chat: building (with what the builder's doing now),
 * then ready to play in the drawer or full screen.
 */
function AppTile({ app, onOpen, onReady }: { app: { id: string; title: string }; onOpen(a: OpenApp): void; onReady(): void }) {
  const [s, setS] = useState<{ status: 'building' | 'ready' | 'failed'; step: string | null; href: string; title: string } | null>(null);
  const was = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const res = await fetch(`/api/prototypes/kan/city/talk?app=${encodeURIComponent(app.id)}`);
        if (res.ok && !stop) {
          const j = await res.json();
          setS(j);
          // It just finished while we watched: the bot will have said so in the thread.
          if (was.current === 'building' && j.status !== 'building') setTimeout(onReady, 1500);
          was.current = j.status;
          if (j.status !== 'building') return;
        }
      } catch { /* try again */ }
      if (!stop) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [app.id, onReady]);

  const ready = s?.status === 'ready';
  const title = s?.title || app.title;
  return (
    <div className={`mt-2 overflow-hidden rounded-xl border ${ready ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/10 bg-black/20'}`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${ready ? 'bg-violet-500 text-white' : 'bg-white/10 text-neutral-300'}`}>
          {s && s.status === 'building' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppWindow className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-neutral-50">{title}</p>
          <p className="truncate text-[11px] text-neutral-400">
            {!s ? 'Checking…' : s.status === 'ready' ? 'Ready to play' : s.status === 'failed' ? 'The build didn’t finish' : s.step ?? 'Building… a minute or two'}
          </p>
        </div>
      </div>
      {ready && s && (
        <div className="flex gap-1.5 border-t border-white/10 px-2 py-2">
          <button onClick={() => onOpen({ id: app.id, title, href: s.href })} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-violet-400"><Play className="h-3.5 w-3.5" /> Play here</button>
          <button onClick={() => onOpen({ id: app.id, title, href: s.href, full: true })} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] text-neutral-200 hover:bg-white/5"><Maximize2 className="h-3.5 w-3.5" /> Full screen</button>
        </div>
      )}
    </div>
  );
}

/**
 * The mic, listening for one thing said: it starts when you start talking and stops
 * on its own after you pause, then hands back the words.
 */
function useListener() {
  const [state, setState] = useState<'idle' | 'listening' | 'hearing' | 'thinking'>('idle');
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);

  const listen = useCallback(async (): Promise<string | null> => {
    if (stopRef.current) return null;
    setError(null);
    cancelled.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('The mic is off. Allow it in the browser to talk.');
      return null;
    }
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    setState('listening');

    const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    const started = performance.now();
    let spokeAt = 0, quietSince = 0, raf = 0;
    const finish = () => {
      cancelAnimationFrame(raf);
      if (rec.state !== 'inactive') rec.stop();
    };
    stopRef.current = finish;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const loud = Math.sqrt(sum / buf.length) > 0.022;
      const now = performance.now();
      if (loud) { if (!spokeAt) { spokeAt = now; setState('hearing'); } quietSince = 0; }
      else if (spokeAt && !quietSince) quietSince = now;
      // A pause after speaking ends it; so does a long silence, or a very long turn.
      if ((spokeAt && quietSince && now - quietSince > 1300) || (!spokeAt && now - started > 12_000) || now - started > 60_000) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    rec.start(250);
    raf = requestAnimationFrame(tick);
    await done;
    stopRef.current = null;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    if (cancelled.current || !spokeAt) { setState('idle'); return null; }
    setState('thinking');
    try {
      const fd = new FormData();
      fd.append('audio', new Blob(chunks, { type: mime }), `talk.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Couldn’t make that out.'); return null; }
      return (j.text as string | undefined)?.trim() || null;
    } catch {
      setError('Couldn’t make that out.');
      return null;
    } finally {
      setState('idle');
    }
  }, []);

  const stop = useCallback(() => stopRef.current?.(), []);
  const cancel = useCallback(() => { cancelled.current = true; stopRef.current?.(); }, []);
  useEffect(() => () => { cancelled.current = true; stopRef.current?.(); }, []);
  return { state, error, listen, stop, cancel };
}
