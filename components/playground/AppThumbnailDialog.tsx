'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import type { AppDirectoryEntry, PlaygroundApp } from '@/lib/types';

type ThumbnailTarget = Pick<AppDirectoryEntry, 'id' | 'title' | 'thumbnailUrl'>;

interface Props {
  app: ThumbnailTarget;
  isOpen: boolean;
  onClose: () => void;
  /** Handed the updated row so the caller can put it straight back in its list. */
  onUpdated: (app: PlaygroundApp) => void;
  /** Where to send someone who wants to change the house style. */
  settingsHref?: string;
}

type Mode = 'default' | 'custom' | 'upload';

/**
 * Giving an app a face.
 *
 * Three ways in, in the order people actually want them: let Kan decide, describe
 * it yourself, or use a picture you already have. The first two keep the account's
 * house style, which is what makes a directory look like one person's shelf.
 *
 * The default is one button and no typing, because the whole point of generating
 * these is that nobody wants to write twenty image prompts.
 */
export function AppThumbnailDialog({ app, isOpen, onClose, onUpdated, settingsHref = '/settings/apps' }: Props) {
  const [mode, setMode] = useState<Mode>('default');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.app) {
        setError(data?.error || 'Could not make a thumbnail.');
        return;
      }
      onUpdated(data.app as PlaygroundApp);
      onClose();
    } catch {
      setError('Could not make a thumbnail.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/playground/apps/${app.id}/thumbnail`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data?.app) {
        onUpdated(data.app as PlaygroundApp);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (mode === 'default') return run({ mode: 'default' });
    if (mode === 'custom') {
      if (!prompt.trim()) { setError('Describe what you want to see.'); return; }
      return run({ mode: 'custom', prompt: prompt.trim() });
    }
    if (!imageUrl.trim()) { setError('Paste an image URL.'); return; }
    return run({ mode: 'upload', imageUrl: imageUrl.trim() });
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title={`Thumbnail for ${app.title}`} size="lg">
      <div className="space-y-4">
        {app.thumbnailUrl && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={app.thumbnailUrl}
              alt=""
              className="w-16 h-16 rounded-xl object-cover border border-neutral-200 dark:border-neutral-800"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              This app already has a thumbnail. Generating again replaces it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <ModeButton
            active={mode === 'default'}
            onClick={() => setMode('default')}
            icon={<Sparkles className="w-4 h-4" />}
            label="Use my style"
            blurb="Kan reads the app"
          />
          <ModeButton
            active={mode === 'custom'}
            onClick={() => setMode('custom')}
            icon={<Wand2 className="w-4 h-4" />}
            label="Describe it"
            blurb="Your words, my style"
          />
          <ModeButton
            active={mode === 'upload'}
            onClick={() => setMode('upload')}
            icon={<Upload className="w-4 h-4" />}
            label="Use an image"
            blurb="Paste a URL"
          />
        </div>

        {mode === 'default' && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Kan writes the prompt from what this app is — its name, its tagline and the notes
            from its last build — and renders it in your account&apos;s app style, so it comes
            out looking like the rest of your shelf.{' '}
            <a href={settingsHref} className="text-violet-600 dark:text-violet-400 hover:underline">
              Change the style
            </a>
          </p>
        )}

        {mode === 'custom' && (
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              autoFocus
              placeholder="A sleepy cat curled around a calculator…"
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400 resize-none"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Describe the subject only — your account style still decides how it looks.
            </p>
          </div>
        )}

        {mode === 'upload' && (
          <div>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              autoFocus
              placeholder="https://…"
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white outline-none focus:border-violet-400"
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Any image URL. Nothing is generated, so this is instant and free.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {busy
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'upload' ? 'Saving…' : 'Generating…'}</>
              : <><ImageIcon className="w-4 h-4" /> {mode === 'upload' ? 'Use this image' : 'Generate'}</>}
          </button>
          {app.thumbnailUrl && (
            <button
              onClick={clear}
              disabled={busy}
              title="Remove the thumbnail"
              className="px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-red-500 hover:border-red-500/40 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {busy && mode !== 'upload' && (
          <p className="text-xs text-center text-neutral-400">
            Image models take a moment. Leaving this open is fine — the result is saved either way.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ModeButton({
  active, onClick, icon, label, blurb,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; blurb: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
        active
          ? 'border-violet-400 bg-violet-500/10'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${
        active ? 'text-violet-700 dark:text-violet-300' : 'text-neutral-700 dark:text-neutral-200'
      }`}>
        {icon}
        {label}
      </span>
      <span className="block mt-0.5 text-[10.5px] text-neutral-500 dark:text-neutral-400">{blurb}</span>
    </button>
  );
}
