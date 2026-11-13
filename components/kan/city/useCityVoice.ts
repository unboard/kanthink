'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice mode for Kan City: a hands-free conversation with the same Kan that runs the
 * city. It listens until you stop talking, writes down what you said (the same
 * /api/voice/transcribe every voice surface uses), hands it to Kan, and reads Kan's
 * answer back (/api/voice/tts), then listens again. Kan answers through the city's
 * own agent, so everything it does lands on the map while you talk.
 *
 * Turn by turn rather than a live audio stream, because the city's agent and its
 * tools (bots, plots, the plan) only run there.
 */

export type VoicePhase = 'off' | 'starting' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'speaking';

/** Loud enough to be someone talking (RMS of the time-domain signal, 0–1). */
const SPEECH_RMS = 0.03;
/** This much quiet after speech ends the turn. */
const END_SILENCE_MS = 1100;
/** Speech shorter than this is a cough or a click. */
const MIN_SPEECH_MS = 250;
const MAX_TURN_MS = 60_000;
/** With nobody talking, start a fresh recording now and then so it stays small. */
const IDLE_RESTART_MS = 20_000;

function mimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) if (MediaRecorder.isTypeSupported(t)) return t;
  return 'audio/webm';
}

/** A few silent samples, played on the tap that starts voice mode, so phones let Kan speak later. */
function silentWav(): string {
  const n = 800;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * What Kan's reply sounds like out loud: no markdown, no links, no lists of ids, and
 * not the whole essay. The full reply stays in the thread.
 */
export function spokenText(md: string, max = 700): string {
  let t = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s*\n+\s*/g, '\n')
    .trim();
  if (t.length > max) {
    // End on a sentence when there's one close enough.
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('.\n'));
    t = end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
  }
  return t.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function useCityVoice(opts: {
  /** What they said. Resolves to what Kan answered (null when there's nothing to say aloud). */
  onUtterance(text: string): Promise<string | null>;
  /** They tapped to cut Kan off while it was still working. */
  onCancelThinking?(): void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);

  const cb = useRef(opts);
  useEffect(() => { cb.current = opts; });
  const on = useRef(false);
  const phaseRef = useRef<VoicePhase>('off');
  const set = useCallback((p: VoicePhase) => { phaseRef.current = p; setPhase(p); }, []);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const raf = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const endSpeech = useRef<(() => void) | null>(null);
  /** The next turn, called from inside a turn. */
  const again = useRef<() => void>(() => {});

  const stopRecorder = () => {
    const r = recorder.current;
    recorder.current = null;
    if (r && r.state !== 'inactive') { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* gone */ } }
  };

  const release = useCallback(() => {
    on.current = false;
    cancelAnimationFrame(raf.current);
    stopRecorder();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    analyser.current = null;
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); }
    endSpeech.current?.();
    setLevel(0);
  }, []);

  useEffect(() => release, [release]);

  const speak = useCallback(async (text: string) => {
    const say = spokenText(text);
    if (!say || !on.current) return;
    set('speaking');
    try {
      const r = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: say }) });
      if (!r.ok || !on.current) return;
      const url = URL.createObjectURL(await r.blob());
      const el = audio.current ?? new Audio();
      audio.current = el;
      await new Promise<void>((resolve) => {
        const finish = () => { el.onended = null; el.onerror = null; endSpeech.current = null; URL.revokeObjectURL(url); resolve(); };
        endSpeech.current = () => { el.pause(); finish(); };
        el.onended = finish;
        el.onerror = finish;
        el.src = url;
        el.play().catch(finish);
      });
    } catch { /* the words are on screen anyway */ }
  }, [set]);

  // One turn: record until they stop talking, then write it down and hand it to Kan.
  const listen = useCallback(() => {
    if (!on.current || !stream.current || !analyser.current) return;
    set('listening');
    setHeard(null);
    const type = mimeType();
    const rec = new MediaRecorder(stream.current, { mimeType: type });
    recorder.current = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start(250);
    const began = performance.now();
    let speechAt = 0;
    let lastLoud = 0;
    const buf = new Float32Array(analyser.current.fftSize);

    const finish = async () => {
      cancelAnimationFrame(raf.current);
      setLevel(0);
      await new Promise<void>((r) => { rec.onstop = () => r(); try { rec.stop(); } catch { r(); } });
      recorder.current = null;
      if (!on.current) return;
      set('transcribing');
      let text = '';
      try {
        const form = new FormData();
        form.append('audio', new Blob(chunks, { type }), `turn.${type.includes('mp4') ? 'mp4' : 'webm'}`);
        const r = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
        if (r.ok) text = ((await r.json()).text ?? '').trim();
      } catch { /* try again */ }
      if (!on.current) return;
      if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 2) { again.current(); return; }
      setHeard(text);
      set('thinking');
      const reply = await cb.current.onUtterance(text).catch(() => null);
      if (!on.current) return;
      if (reply) await speak(reply);
      if (on.current) again.current();
    };

    const tick = () => {
      if (!on.current || recorder.current !== rec) return;
      analyser.current!.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 12));
      const now = performance.now();
      if (rms > SPEECH_RMS) {
        if (!speechAt) speechAt = now;
        lastLoud = now;
        if (phaseRef.current === 'listening' && now - speechAt > 120) set('hearing');
      }
      const spoke = speechAt && lastLoud - speechAt > MIN_SPEECH_MS;
      if ((spoke && now - lastLoud > END_SILENCE_MS) || now - began > MAX_TURN_MS) { void finish(); return; }
      if (!speechAt && now - began > IDLE_RESTART_MS) {
        stopRecorder();
        again.current();
        return;
      }
      // A blip that never became speech doesn't hold the turn open.
      if (speechAt && !spoke && now - lastLoud > END_SILENCE_MS) { speechAt = 0; if (phaseRef.current === 'hearing') set('listening'); }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [speak, set]);

  useEffect(() => { again.current = listen; }, [listen]);

  const start = useCallback(async () => {
    if (on.current) return;
    setError(null);
    on.current = true;
    set('starting');
    // Unlock playback on this tap: phones only let audio play from a user gesture.
    try {
      const el = new Audio();
      audio.current = el;
      el.src = silentWav();
      await el.play().catch(() => {});
    } catch { /* not fatal */ }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!on.current) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new AC();
      ctx.current = c;
      const a = c.createAnalyser();
      a.fftSize = 1024;
      c.createMediaStreamSource(s).connect(a);
      analyser.current = a;
      listen();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(/Permission|NotAllowed|denied/i.test(msg) ? 'Kan can’t hear you: allow the microphone for this site.' : 'The microphone didn’t start.');
      release();
      set('off');
    }
  }, [listen, release, set]);

  const stop = useCallback(() => {
    if (phaseRef.current === 'thinking') cb.current.onCancelThinking?.();
    release();
    set('off');
    setHeard(null);
  }, [release, set]);

  /** Tap while Kan talks: stop talking and listen. Tap while it works: stop it. */
  const interrupt = useCallback(() => {
    if (phaseRef.current === 'speaking') endSpeech.current?.();
    else if (phaseRef.current === 'thinking') cb.current.onCancelThinking?.();
  }, []);

  return { phase, level, error, heard, start, stop, interrupt, active: phase !== 'off' };
}
