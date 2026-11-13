'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { startWorkingSound } from '@/lib/audio/workingSound';
import {
  LIVE_PROVIDERS,
  buildAudioMessage,
  buildSetupMessage,
  buildSilentNote,
  buildSpokenNote,
  buildToolResponses,
  isLiveProvider,
  normalizeLiveEvent,
  resolveVoice,
  type LiveProvider,
} from '@/lib/voice/liveProviders';
import { cityVoicePrompt, cityVoiceTools, jobDoneNote, type CityVoicePlot } from '@/lib/kan/city/voice';

/**
 * Voice mode for Kan City, on the same live voice socket as the original voice mode
 * (components/voice/LiveVoiceMode.tsx): Kan hears you as you talk and answers the
 * moment you stop. Work goes to the city's agent as a background job, so Kan keeps
 * talking while the city shows it happening, and tells you when it lands.
 */

export type LivePhase = 'off' | 'connecting' | 'listening' | 'hearing' | 'speaking';

export interface CityJob {
  id: string;
  ask: string;
  label: string;
  status: 'waiting' | 'running' | 'done' | 'failed';
}

export interface JobResult { reply: string | null; did: string[]; error?: string | null }

const PROVIDER_KEY = 'kanthink-voice-provider';
const VOICE_KEY = 'kanthink-voice-name';

function storedProvider(): LiveProvider {
  try { const v = localStorage.getItem(PROVIDER_KEY); return isLiveProvider(v) ? v : 'google'; } catch { return 'google'; }
}
function storedVoice(p: LiveProvider): string {
  try { return resolveVoice(p, localStorage.getItem(`${VOICE_KEY}-${p}`) ?? (p === 'google' ? localStorage.getItem(VOICE_KEY) : null)); } catch { return LIVE_PROVIDERS[p].defaultVoice; }
}

function pcm16(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  const bytes = new Uint8Array(i16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)];
  return out;
}

export function useCityLive(opts: {
  name?: string | null;
  plots: CityVoicePlot[];
  /** Do the work through the city's agent. Resolves when it lands. */
  runJob(instruction: string): Promise<JobResult>;
  /** Stop the job that's running. */
  cancelJob?(): void;
}) {
  const [phase, setPhase] = useState<LivePhase>('off');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** What they're saying, as it comes. */
  const [heard, setHeard] = useState('');
  /** What Kan is saying, as it comes. */
  const [said, setSaid] = useState('');
  const [jobs, setJobs] = useState<CityJob[]>([]);

  const cb = useRef(opts);
  useEffect(() => { cb.current = opts; });
  const on = useRef(false);
  const provider = useRef<LiveProvider>('google');
  const ws = useRef<WebSocket | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const micCtx = useRef<AudioContext | null>(null);
  const proc = useRef<ScriptProcessorNode | null>(null);
  const raf = useRef(0);
  const playCtx = useRef<AudioContext | null>(null);
  const nextPlay = useRef(0);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const userBuf = useRef('');
  const kanBuf = useRef('');
  const queue = useRef<CityJob[]>([]);
  const working = useRef(false);
  const wake = useRef<WakeLockSentinel | null>(null);
  const hum = useRef<(() => void) | null>(null);
  const speaking = useRef(false);

  const setSpeaking = useCallback((v: boolean) => {
    speaking.current = v;
    setPhase((p) => (p === 'off' || p === 'connecting' ? p : v ? 'speaking' : 'listening'));
  }, []);

  const hush = useCallback(() => {
    for (const s of sources.current) { try { s.stop(); } catch { /* done */ } }
    sources.current = [];
    nextPlay.current = 0;
    setSpeaking(false);
  }, [setSpeaking]);

  const play = useCallback((b64: string) => {
    if (!playCtx.current || playCtx.current.state === 'closed') playCtx.current = new AudioContext({ sampleRate: 24000 });
    const ctx = playCtx.current;
    if (ctx.state === 'suspended') void ctx.resume();
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
      const buf = ctx.createBuffer(1, f32.length, 24000);
      buf.getChannelData(0).set(f32);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const t = Math.max(ctx.currentTime, nextPlay.current);
      src.start(t);
      nextPlay.current = t + buf.duration;
      sources.current.push(src);
      setSpeaking(true);
      src.onended = () => {
        sources.current = sources.current.filter((s) => s !== src);
        if (!sources.current.length) setSpeaking(false);
      };
    } catch { /* a bad chunk */ }
  }, [setSpeaking]);

  const sendFrames = useCallback((frames: unknown[]) => {
    const s = ws.current;
    if (!s || s.readyState !== WebSocket.OPEN) return;
    for (const f of frames) s.send(JSON.stringify(f));
  }, []);

  /** Tell Kan something without making it talk. */
  const note = useCallback((text: string) => sendFrames([buildSilentNote(provider.current, text)]), [sendFrames]);

  /** Tell Kan something it should talk about, once nobody is mid-sentence. */
  const announce = useCallback((text: string) => {
    let tries = 0;
    const go = () => {
      if (!on.current) return;
      if ((speaking.current || userBuf.current.trim()) && tries++ < 24) { setTimeout(go, 500); return; }
      sendFrames(buildSpokenNote(provider.current, text));
    };
    go();
  }, [sendFrames]);

  const patchJob = (id: string, status: CityJob['status']) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, status } : j)));

  // One job at a time, in the order Kan started them.
  const pump = useCallback(async () => {
    if (working.current) return;
    const job = queue.current.shift();
    if (!job) return;
    working.current = true;
    patchJob(job.id, 'running');
    let out: JobResult;
    try { out = await cb.current.runJob(job.ask); } catch (e) { out = { reply: null, did: [], error: e instanceof Error ? e.message : 'Something went wrong' }; }
    working.current = false;
    patchJob(job.id, out.error ? 'failed' : 'done');
    if (on.current && out.error !== 'Stopped') announce(jobDoneNote({ ask: job.label || job.ask, ...out }));
    void pump();
  }, [announce]);

  const onTool = useCallback((call: { id: string; name: string; args: Record<string, string> }): string => {
    if (call.name !== 'city_job') return `There is no tool called ${call.name}. Use city_job.`;
    const ask = (call.args.instruction ?? '').trim();
    if (!ask) return 'The job needs an instruction. Ask them what they want done.';
    const job: CityJob = { id: call.id || crypto.randomUUID(), ask, label: (call.args.label ?? '').trim() || ask.slice(0, 60), status: 'waiting' };
    const waitingBehind = queue.current.length + (working.current ? 1 : 0);
    queue.current.push(job);
    setJobs((all) => [...all.slice(-5), job]);
    void pump();
    return waitingBehind
      ? `Queued: it starts after the ${waitingBehind} job${waitingBehind > 1 ? 's' : ''} ahead of it. Tell them in a few words, then keep talking.`
      : 'Started. It runs in the background and the city shows it as it happens. Say in a few words that you are on it, then keep the conversation going. Do not say it is done until the [Job done] note.';
  }, [pump]);

  const release = useCallback(() => {
    on.current = false;
    cancelAnimationFrame(raf.current);
    try { proc.current?.disconnect(); } catch { /* gone */ }
    proc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void micCtx.current?.close().catch(() => {});
    micCtx.current = null;
    const s = ws.current;
    ws.current = null;
    if (s) { s.onclose = null; s.onmessage = null; try { s.close(1000); } catch { /* closed */ } }
    hush();
    hum.current?.(); hum.current = null;
    void wake.current?.release().catch(() => {});
    wake.current = null;
    userBuf.current = ''; kanBuf.current = '';
    setLevel(0);
  }, [hush]);

  useEffect(() => release, [release]);

  // The working sound, under the quiet while a job runs: the same one the original voice mode plays.
  const busy = jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (busy && phase !== 'speaking' && phase !== 'off' && playCtx.current && playCtx.current.state !== 'closed') {
      try { hum.current?.(); hum.current = startWorkingSound(playCtx.current, { level: 0.12 }); } catch { /* best effort */ }
    } else { hum.current?.(); hum.current = null; }
  }, [busy, phase]);

  const startMic = useCallback((socket: WebSocket, s: MediaStream) => {
    const ctx = new AudioContext();
    micCtx.current = ctx;
    const src = ctx.createMediaStreamSource(s);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const arr = new Uint8Array(analyser.frequencyBinCount);
    let loud = 0;
    const tick = () => {
      if (!on.current) return;
      analyser.getByteFrequencyData(arr);
      let sum = 0;
      for (let i = 0; i < arr.length; i++) sum += arr[i];
      const l = sum / arr.length / 255;
      setLevel(l);
      loud = l > 0.15 ? loud + 1 : Math.max(0, loud - 1);
      // Talking over Kan stops Kan (Gemini doesn't report barge-in itself).
      if (loud > 8 && sources.current.length) { hush(); loud = 0; }
      if (!speaking.current) setPhase((p) => (p === 'listening' && l > 0.12 ? 'hearing' : p === 'hearing' && l < 0.05 ? 'listening' : p));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    const p = ctx.createScriptProcessor(4096, 1, 1);
    proc.current = p;
    p.onaudioprocess = (e) => {
      if (socket.readyState !== 1 || !on.current) return;
      const data = resample(e.inputBuffer.getChannelData(0), ctx.sampleRate, LIVE_PROVIDERS[provider.current].micSampleRate);
      socket.send(JSON.stringify(buildAudioMessage(provider.current, pcm16(data))));
    };
    src.connect(p);
    p.connect(ctx.destination);
  }, [hush]);

  const start = useCallback(async () => {
    if (on.current) return;
    on.current = true;
    setError(null); setHeard(''); setSaid(''); setJobs([]);
    queue.current = [];
    setPhase('connecting');
    // On this tap, so phones let Kan be heard later.
    if (!playCtx.current || playCtx.current.state === 'closed') playCtx.current = new AudioContext({ sampleRate: 24000 });
    void playCtx.current.resume().catch(() => {});
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { wake.current = l; }).catch(() => {});
    const p = storedProvider();
    provider.current = p;
    try {
      const kanwatch = Promise.race([
        fetch(`/api/kanwatch/context?tz=${new Date().getTimezoneOffset()}`).then((r) => (r.ok ? r.json() : {})).then((d: { context?: string }) => d.context ?? '').catch(() => ''),
        new Promise<string>((r) => setTimeout(() => r(''), 1500)),
      ]);
      const r = await fetch(`/api/voice/live?provider=${p}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.wsUrl) throw new Error(d.error || 'Voice didn’t start');
      const context = await kanwatch;
      if (!on.current) return;
      const socket: WebSocket = d.clientSecret ? new WebSocket(d.wsUrl, ['realtime', `openai-insecure-api-key.${d.clientSecret}`]) : new WebSocket(d.wsUrl);
      ws.current = socket;
      let started = false;
      const timer = setTimeout(() => { if (!started) { setError('Voice took too long to connect.'); stopRef.current(); } }, 12_000);
      socket.onopen = () => {
        const search = p === 'google';
        socket.send(JSON.stringify(buildSetupMessage(p, {
          model: d.model,
          voice: storedVoice(p),
          tools: cityVoiceTools(search),
          systemInstruction: cityVoicePrompt({ name: cb.current.name, plots: cb.current.plots, kanwatch: context, search }),
        })));
      };
      socket.onmessage = async (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : await event.data.text();
          const evt = normalizeLiveEvent(p, JSON.parse(raw));
          if (!evt) return;
          if (evt.ready && !started) {
            started = true;
            clearTimeout(timer);
            try {
              const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
              if (!on.current) { s.getTracks().forEach((t) => t.stop()); return; }
              stream.current = s;
              startMic(socket, s);
              setPhase('listening');
              // Kan opens: a quick hello so they know it's there.
              sendFrames(buildSpokenNote(p, '[Voice mode just opened in Kan City] Say a short hello, a few words, and ask what they want to do. Nothing else.'));
            } catch {
              setError('Kan can’t hear you: allow the microphone for this site.');
              stopRef.current();
            }
          }
          if (evt.inputTranscript) {
            if (kanBuf.current) { kanBuf.current = ''; }
            userBuf.current += evt.inputTranscript;
            setHeard(userBuf.current.trim());
          }
          if (evt.outputTranscript) {
            if (userBuf.current) userBuf.current = '';
            kanBuf.current += evt.outputTranscript;
            setSaid(kanBuf.current.trim());
          }
          if (evt.turnComplete) { userBuf.current = ''; kanBuf.current = ''; }
          if (evt.interrupted) hush();
          if (evt.audio) play(evt.audio);
          if (evt.toolCalls?.length) {
            const results = evt.toolCalls.map((c) => ({ id: c.id, name: c.name, result: onTool(c) }));
            sendFrames(buildToolResponses(p, results));
          }
          if (evt.error && !started) { setError(evt.error); stopRef.current(); }
        } catch { /* a frame we can't read */ }
      };
      socket.onerror = () => { if (!started) { setError('Voice couldn’t connect.'); stopRef.current(); } };
      socket.onclose = () => { if (on.current) { setError(started ? 'Voice disconnected.' : 'Voice couldn’t connect.'); stopRef.current(); } };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice didn’t start');
      stopRef.current();
    }
  }, [hush, onTool, play, sendFrames, startMic]);

  const stop = useCallback(() => {
    release();
    setPhase('off');
    setHeard(''); setSaid('');
  }, [release]);
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  /** Tap while Kan talks: it stops talking. */
  const interrupt = useCallback(() => { if (speaking.current) hush(); }, [hush]);

  /** Stop the running job and drop the ones waiting. */
  const cancelJobs = useCallback(() => {
    for (const j of queue.current) patchJob(j.id, 'failed');
    queue.current = [];
    cb.current.cancelJob?.();
    note('[System] They stopped the jobs that were running. Nothing more is being done.');
  }, [note]);

  return { phase, level, error, heard, said, jobs, busy, start, stop, interrupt, cancelJobs, note, active: phase !== 'off' };
}
