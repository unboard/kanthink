'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Play, Pause, Maximize, X, Link2, Check, MoreVertical, Trash2,
  ImageIcon, Sparkles, Loader2, Film, Plus, Camera, Clapperboard,
} from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface Recording {
  id: string;
  title: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  durationMs: number;
  width: number;
  height: number;
  aspectRatio: string | null;
  thumbUrl: string | null;
  thumbTime: number;
  thumbnailUrl: string;
  createdAt: string | null;
}

// ---- helpers ----
function ratio(rec: Pick<Recording, 'aspectRatio' | 'width' | 'height'>): [number, number] {
  if (rec.aspectRatio && /^\d+:\d+$/.test(rec.aspectRatio)) {
    const [w, h] = rec.aspectRatio.split(':').map(Number);
    if (w > 0 && h > 0) return [w, h];
  }
  if (rec.width > 0 && rec.height > 0) return [rec.width, rec.height];
  return [16, 9];
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RecordGallery() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [editing, setEditing] = useState<Recording | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/record/list');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-neutral-200">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-800 bg-[#0b0b0c]/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={22} className="text-emerald-400" />
          <span className="font-semibold">Recordings</span>
        </div>
        <Link
          href="/record"
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-black hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" /> New recording
        </Link>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-neutral-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : recordings.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {recordings.map((rec) => (
              <GalleryCard
                key={rec.id}
                rec={rec}
                onPlay={() => setPlaying(rec)}
                onEditThumb={() => setEditing(rec)}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </div>

      {playing && <PlayerOverlay rec={playing} onClose={() => setPlaying(null)} />}
      {editing && (
        <ThumbnailEditor
          rec={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Clapperboard className="h-12 w-12 text-neutral-600" />
      <div>
        <p className="text-lg font-medium text-neutral-300">No recordings yet</p>
        <p className="mt-1 text-sm text-neutral-500">Record a screen + webcam demo to see it here.</p>
      </div>
      <Link
        href="/record"
        className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
      >
        <Plus className="h-4 w-4" /> New recording
      </Link>
    </div>
  );
}

// ===== Card =====
function GalleryCard({
  rec, onPlay, onEditThumb, onChanged,
}: {
  rec: Recording;
  onPlay: () => void;
  onEditThumb: () => void;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [r, h] = ratio(rec);
  const watchUrl = typeof window !== 'undefined' ? `${window.location.origin}/watch/${rec.id}` : `/watch/${rec.id}`;

  const copy = () => {
    navigator.clipboard.writeText(watchUrl);
    setCopied(true);
    setMenuOpen(false);
    setTimeout(() => setCopied(false), 1500);
  };

  const del = async () => {
    if (!confirm('Delete this recording? This cannot be undone.')) return;
    setBusy(true);
    setMenuOpen(false);
    const res = await fetch(`/api/record/${rec.id}`, { method: 'DELETE' });
    if (res.ok) onChanged();
    else setBusy(false);
  };

  return (
    <li className={`group ${busy ? 'pointer-events-none opacity-50' : ''}`}>
      {/* Thumbnail */}
      <div
        className="relative cursor-pointer overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
        style={{ aspectRatio: `${r} / ${h}` }}
        onClick={onPlay}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rec.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />

        {/* Play affordance */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
            <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
          </div>
        </div>

        {/* Duration badge */}
        {rec.durationMs > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {fmtDuration(rec.durationMs)}
          </span>
        )}

        {/* Thumbnail edit button */}
        <button
          onClick={(e) => { e.stopPropagation(); onEditThumb(); }}
          className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 backdrop-blur-sm transition hover:bg-black/80 group-hover:opacity-100"
          title="Change thumbnail"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Thumbnail
        </button>

        {/* ⋯ menu */}
        <div className="absolute right-2 top-2">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/80 group-hover:opacity-100"
            aria-label="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div
                className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/95 text-sm shadow-xl backdrop-blur"
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => { onEditThumb(); setMenuOpen(false); }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-neutral-800">
                  <ImageIcon className="h-4 w-4 text-neutral-400" /> Edit thumbnail
                </button>
                <button onClick={copy} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-neutral-800">
                  <Link2 className="h-4 w-4 text-neutral-400" /> Copy link
                </button>
                <Link href={`/watch/${rec.id}`} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-neutral-800">
                  <Maximize className="h-4 w-4 text-neutral-400" /> Open watch page
                </Link>
                <button onClick={del} className="flex w-full items-center gap-2.5 border-t border-neutral-800 px-3.5 py-2.5 text-left text-red-400 hover:bg-neutral-800">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title + meta */}
      <div className="mt-3 px-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100">{rec.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
          <span>{fmtDate(rec.createdAt)}</span>
          {rec.durationMs > 0 && (<><span aria-hidden>·</span><span className="tabular-nums">{fmtDuration(rec.durationMs)}</span></>)}
          {copied && <span className="ml-1 text-emerald-400">Link copied</span>}
        </p>
      </div>
    </li>
  );
}

// ===== Overlay player (plays over the gallery) =====
function PlayerOverlay({ rec, onClose }: { rec: Recording; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(rec.durationMs / 1000 || 0);
  const [copied, setCopied] = useState(false);
  const [r, h] = ratio(rec);
  const watchUrl = typeof window !== 'undefined' ? `${window.location.origin}/watch/${rec.id}` : `/watch/${rec.id}`;

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const copy = () => {
    navigator.clipboard.writeText(watchUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl bg-black shadow-2xl"
        style={{ width: `min(94vw, calc(82vh * ${r} / ${h}))`, aspectRatio: `${r} / ${h}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={rec.cloudinaryUrl}
          autoPlay
          playsInline
          onClick={togglePlay}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { if (isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
          onEnded={() => setPlaying(false)}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* Controls */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-3 pt-10">
          <div
            className="mb-2 h-1.5 cursor-pointer rounded-full bg-white/25"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientX - box.left) / box.width;
              const v = videoRef.current;
              if (v && duration) { v.currentTime = frac * duration; setCurrent(frac * duration); }
            }}
          >
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="flex items-center gap-3 text-sm text-white">
            <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <span className="tabular-nums text-neutral-200">{fmtDuration(current * 1000)} / {fmtDuration(duration * 1000)}</span>
            <button onClick={copy} className="ml-auto flex items-center gap-1.5 text-neutral-200 hover:text-white" aria-label="Copy link">
              {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Link2 className="h-5 w-5" />}
            </button>
            <button
              onClick={() => wrapRef.current?.requestFullscreen?.().catch(() => {})}
              className="text-neutral-200 hover:text-white"
              aria-label="Fullscreen"
            >
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Thumbnail editor =====
type Tab = 'scene' | 'ai';

function ThumbnailEditor({ rec, onClose, onSaved }: { rec: Recording; onClose: () => void; onSaved: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<Tab>('scene');
  const [current, setCurrent] = useState(rec.thumbTime || 0);
  const [duration, setDuration] = useState(rec.durationMs / 1000 || 0);
  const [saving, setSaving] = useState(false);
  const [r, h] = ratio(rec);

  // AI state
  const [prompt, setPrompt] = useState(rec.title || '');
  const [generating, setGenerating] = useState(false);
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/record/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  }, [rec.id, onSaved]);

  const useCurrentFrame = () => patch({ thumbTime: Math.round(current) });
  const useFirstFrame = () => patch({ thumbTime: 0 });

  const generate = async () => {
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim() || rec.title,
          aspectRatio: rec.aspectRatio && /^\d+:\d+$/.test(rec.aspectRatio) ? rec.aspectRatio : '16:9',
          quality: 'hd',
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) setAiUrl(data.url);
      else setAiError(data.error || 'Generation failed');
    } catch {
      setAiError('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const useAiImage = () => { if (aiUrl) patch({ thumbUrl: aiUrl }); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="font-semibold text-neutral-100">Thumbnail</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4">
          <button
            onClick={() => setTab('scene')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === 'scene' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            <Camera className="h-4 w-4" /> Scene frame
          </button>
          <button
            onClick={() => setTab('ai')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === 'ai' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            <Sparkles className="h-4 w-4" /> Generate with AI
          </button>
        </div>

        <div className="p-5">
          {tab === 'scene' ? (
            <div className="space-y-4">
              <div className="relative mx-auto overflow-hidden rounded-lg bg-black" style={{ width: `min(100%, calc(48vh * ${r} / ${h}))`, aspectRatio: `${r} / ${h}` }}>
                <video
                  ref={videoRef}
                  src={rec.cloudinaryUrl}
                  playsInline
                  muted
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (isFinite(v.duration)) setDuration(v.duration);
                    v.currentTime = rec.thumbTime || 0;
                  }}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, duration)}
                  step={0.1}
                  value={Math.min(current, duration || 0)}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    const v = videoRef.current;
                    if (v) v.currentTime = t;
                    setCurrent(t);
                  }}
                  className="w-full accent-emerald-500"
                />
                <div className="mt-1 flex justify-between text-xs text-neutral-500">
                  <span className="tabular-nums">{fmtDuration(current * 1000)}</span>
                  <span className="tabular-nums">{fmtDuration(duration * 1000)}</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">Scrub to the moment you want, then set it as the thumbnail.</p>
              <div className="flex gap-2">
                <button
                  onClick={useCurrentFrame}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black enabled:hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Use this frame
                </button>
                <button
                  onClick={useFirstFrame}
                  disabled={saving}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                >
                  First frame
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative mx-auto flex items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900" style={{ width: `min(100%, calc(40vh * ${r} / ${h}))`, aspectRatio: `${r} / ${h}` }}>
                {aiUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={aiUrl} alt="Generated thumbnail" className="h-full w-full object-cover" />
                ) : generating ? (
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
                ) : (
                  <Film className="h-8 w-8 text-neutral-700" />
                )}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Describe the thumbnail…"
                className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
              {aiError && <p className="text-xs text-red-400">{aiError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={generate}
                  disabled={generating || !prompt.trim()}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 enabled:hover:bg-neutral-800 disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiUrl ? 'Regenerate' : 'Generate'}
                </button>
                <button
                  onClick={useAiImage}
                  disabled={!aiUrl || saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black enabled:hover:bg-emerald-400 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Use this image
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
