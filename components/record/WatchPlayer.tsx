'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Play, Pause, Maximize, Copy, Check, Download, Scissors, Plus,
  Trash2, Save, X, Loader2,
} from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { RecordingEditSpecJson, RecordingMaskJson } from '@/lib/db/schema';

interface RecordingData {
  id: string;
  title: string;
  cloudinaryUrl: string;
  durationMs: number;
  width: number;
  height: number;
  aspectRatio: string;
  editSpec: RecordingEditSpecJson;
}

export default function WatchPlayer({ recording, isOwner }: { recording: RecordingData; isOwner: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [spec, setSpec] = useState<RecordingEditSpecJson>(recording.editSpec);
  const [savedSpec, setSavedSpec] = useState<RecordingEditSpecJson>(recording.editSpec);
  const [duration, setDuration] = useState(recording.durationMs / 1000 || 0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState(recording.title);

  const start = spec.trimStart;
  const end = spec.trimEnd ?? duration;
  const span = Math.max(0.001, end - start);

  // ----- Playback clamping to the trimmed range -----
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    if (!editing) {
      if (t < start) { v.currentTime = start; return; }
      if (spec.trimEnd != null && t >= spec.trimEnd) {
        v.pause();
        setPlaying(false);
        v.currentTime = spec.trimEnd;
      }
    }
    setCurrent(v.currentTime);
  }, [start, spec.trimEnd, editing]);

  const onLoadedMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    v.currentTime = start;
  }, [start]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (!editing && (v.currentTime < start || v.currentTime >= end)) v.currentTime = start;
      v.play(); setPlaying(true);
    } else {
      v.pause(); setPlaying(false);
    }
  }, [start, end, editing]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrent(t);
  }, []);

  // ----- Active mask (during viewing, within the trimmed window) -----
  const activeMask = !editing
    ? spec.masks.find((m) => current >= m.start && current < m.end)
    : undefined;

  // ----- Owner actions -----
  const dirty = JSON.stringify(spec) !== JSON.stringify(savedSpec) || title !== recording.title;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/record/${recording.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editSpec: spec, title }),
      });
      setSavedSpec(spec);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [recording.id, spec, title]);

  const addMaskHere = useCallback(() => {
    const s = current;
    const e = Math.min(duration, current + 3);
    const mask: RecordingMaskJson = {
      id: crypto.randomUUID(), start: s, end: e, style: 'cover', label: 'Loading…',
    };
    setSpec((p) => ({ ...p, masks: [...p.masks, mask].sort((a, b) => a.start - b.start) }));
  }, [current, duration]);

  const updateMask = (id: string, patch: Partial<RecordingMaskJson>) =>
    setSpec((p) => ({ ...p, masks: p.masks.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const removeMask = (id: string) =>
    setSpec((p) => ({ ...p, masks: p.masks.filter((m) => m.id !== id) }));

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const goFullscreen = useCallback(() => {
    wrapRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // progress within trimmed window
  const progress = Math.min(1, Math.max(0, (current - start) / span));

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <Link href="/record" className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-emerald-400" />
          <span className="font-semibold">Kan Record</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            href={recording.cloudinaryUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            <Download className="h-4 w-4" /> Download
          </a>
          {isOwner && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400"
            >
              <Scissors className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-5">
        {isOwner && editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-lg font-semibold outline-none focus:border-emerald-500"
          />
        ) : (
          <h1 className="mb-3 text-lg font-semibold">{title}</h1>
        )}

        {/* Player */}
        <div ref={wrapRef} className="relative overflow-hidden rounded-xl border border-neutral-800 bg-black">
          <video
            ref={videoRef}
            src={recording.cloudinaryUrl}
            playsInline
            onClick={togglePlay}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMeta}
            onEnded={() => setPlaying(false)}
            className="w-full"
          />

          {/* Loading-mask overlay (viewer mode) */}
          {activeMask && <MaskOverlay mask={activeMask} />}

          {/* Custom control bar */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <div
              className="group mb-2 h-1.5 cursor-pointer rounded-full bg-white/25"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const frac = (e.clientX - r.left) / r.width;
                seekTo(start + frac * span);
              }}
            >
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={togglePlay}>
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="tabular-nums text-neutral-300">
                {fmt(Math.max(0, current - start))} / {fmt(span)}
              </span>
              <button onClick={goFullscreen} className="ml-auto">
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Editor */}
        {isOwner && editing && (
          <Editor
            duration={duration}
            current={current}
            spec={spec}
            setSpec={setSpec}
            seekTo={seekTo}
            addMaskHere={addMaskHere}
            updateMask={updateMask}
            removeMask={removeMask}
          />
        )}

        {isOwner && editing && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 font-medium text-black enabled:hover:bg-emerald-400 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={() => { setSpec(savedSpec); setTitle(recording.title); setEditing(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Editor(props: {
  duration: number;
  current: number;
  spec: RecordingEditSpecJson;
  setSpec: React.Dispatch<React.SetStateAction<RecordingEditSpecJson>>;
  seekTo: (t: number) => void;
  addMaskHere: () => void;
  updateMask: (id: string, patch: Partial<RecordingMaskJson>) => void;
  removeMask: (id: string) => void;
}) {
  const { duration, current, spec, setSpec, seekTo } = props;
  const d = Math.max(0.001, duration);
  const start = spec.trimStart;
  const end = spec.trimEnd ?? duration;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      {/* Timeline */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-neutral-400">
          <span className="flex items-center gap-1"><Scissors className="h-3.5 w-3.5" /> Trim</span>
          <span className="tabular-nums">{fmt(start)} → {fmt(end)}</span>
        </div>
        <div className="relative h-10 rounded-lg bg-neutral-800">
          {/* trimmed-away regions */}
          <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/60" style={{ width: `${(start / d) * 100}%` }} />
          <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/60" style={{ width: `${((d - end) / d) * 100}%` }} />
          {/* masks */}
          {spec.masks.map((m) => (
            <div
              key={m.id}
              title={m.label}
              className="absolute inset-y-1 rounded bg-amber-500/60"
              style={{ left: `${(m.start / d) * 100}%`, width: `${((m.end - m.start) / d) * 100}%` }}
            />
          ))}
          {/* playhead */}
          <div className="absolute inset-y-0 w-0.5 bg-emerald-400" style={{ left: `${(current / d) * 100}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-neutral-400">
          <label>
            Start ({fmt(start)})
            <input
              type="range" min={0} max={d} step={0.1} value={start}
              onChange={(e) => { const v = Math.min(Number(e.target.value), end - 0.2); setSpec((p) => ({ ...p, trimStart: v })); seekTo(v); }}
              className="mt-1 w-full accent-emerald-500"
            />
          </label>
          <label>
            End ({fmt(end)})
            <input
              type="range" min={0} max={d} step={0.1} value={end}
              onChange={(e) => { const v = Math.max(Number(e.target.value), start + 0.2); setSpec((p) => ({ ...p, trimEnd: v >= d ? null : v })); seekTo(v); }}
              className="mt-1 w-full accent-emerald-500"
            />
          </label>
        </div>
      </div>

      {/* Masks */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Loading covers</span>
          <button
            onClick={props.addMaskHere}
            className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add at playhead
          </button>
        </div>
        {spec.masks.length === 0 && (
          <p className="text-xs text-neutral-500">
            Add a cover over a stretch where your product is loading. Choose an opaque branded card or a blur.
          </p>
        )}
        <div className="space-y-2">
          {spec.masks.map((m) => (
            <div key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex rounded-md bg-neutral-800 p-0.5 text-xs">
                  <button
                    onClick={() => props.updateMask(m.id, { style: 'cover' })}
                    className={`rounded px-2 py-0.5 ${m.style === 'cover' ? 'bg-emerald-500 text-black' : 'text-neutral-300'}`}
                  >Cover</button>
                  <button
                    onClick={() => props.updateMask(m.id, { style: 'blur' })}
                    className={`rounded px-2 py-0.5 ${m.style === 'blur' ? 'bg-emerald-500 text-black' : 'text-neutral-300'}`}
                  >Blur</button>
                </div>
                {m.style === 'cover' && (
                  <input
                    value={m.label ?? ''}
                    onChange={(e) => props.updateMask(m.id, { label: e.target.value })}
                    placeholder="Label"
                    className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-emerald-500"
                  />
                )}
                <span className="tabular-nums text-xs text-neutral-500">{fmt(m.start)}–{fmt(m.end)}</span>
                <button onClick={() => props.removeMask(m.id)} className="text-neutral-500 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
                <label>
                  Start
                  <input
                    type="range" min={0} max={d} step={0.1} value={m.start}
                    onChange={(e) => props.updateMask(m.id, { start: Math.min(Number(e.target.value), m.end - 0.1) })}
                    className="mt-0.5 w-full accent-amber-500"
                  />
                </label>
                <label>
                  End
                  <input
                    type="range" min={0} max={d} step={0.1} value={m.end}
                    onChange={(e) => props.updateMask(m.id, { end: Math.max(Number(e.target.value), m.start + 0.1) })}
                    className="mt-0.5 w-full accent-amber-500"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaskOverlay({ mask }: { mask: RecordingMaskJson }) {
  if (mask.style === 'blur') {
    return <div className="absolute inset-0 backdrop-blur-xl bg-black/10" />;
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-neutral-900 to-black">
      <KanthinkIcon size={48} className="text-emerald-400" />
      <div className="flex items-center gap-2 text-neutral-300">
        <span className="text-lg font-medium">{mask.label || 'Loading'}</span>
        <span className="flex gap-1">
          <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
        </span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: delay }} />;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
