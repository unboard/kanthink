'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Undo2, Wand2, X, ArrowUp } from 'lucide-react';

/**
 * Change the app from the app itself: say what you want different (and show it with
 * a screenshot or two), and it rebuilds in place. The same build the app's thread
 * runs, written to the same thread, so the drawer and Kan's chat stay in step.
 */
export function ChangeAppPanel({ appId }: { appId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [images, setImages] = useState<{ id: string; preview: string; url?: string; error?: boolean }[]>([]);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const attach = (files: FileList | File[] | null) => {
    for (const file of Array.from(files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, 6)) {
      const id = Math.random().toString(36).slice(2);
      setImages((a) => [...a, { id, preview: URL.createObjectURL(file) }].slice(-6));
      const form = new FormData();
      form.append('file', file);
      void fetch('/api/upload-image', { method: 'POST', body: form })
        .then((r) => r.json())
        .then((d: { url?: string }) => setImages((a) => a.map((x) => (x.id === id ? { ...x, url: d.url, error: !d.url } : x))))
        .catch(() => setImages((a) => a.map((x) => (x.id === id ? { ...x, error: true } : x))));
    }
  };

  const uploading = images.some((i) => !i.url && !i.error);
  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || working || uploading) return;
    setWorking(true);
    setNote(null);
    try {
      const imageUrls = images.map((i) => i.url).filter((u): u is string => Boolean(u));
      const res = await fetch('/api/playground/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, prompt, imageUrls: imageUrls.length ? imageUrls : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `The change didn't go through (${res.status})`);
      // Kan asked something instead of building: show it, keep what they wrote.
      if (data.asked || data.unsupported) {
        const last = (data.app?.messages ?? []).at(-1)?.content as string | undefined;
        setNote({ tone: 'error', text: last ?? 'Kan has a question about this change. Answer it in the app’s thread.' });
        return;
      }
      setText('');
      setImages([]);
      setCanUndo(true);
      setNote({ tone: 'ok', text: 'Updated.' });
      router.refresh();
    } catch (err) {
      setNote({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setWorking(false);
    }
  };

  const undo = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/playground/apps/${appId}/undo`, { method: 'POST' });
      if (!res.ok) throw new Error('Couldn’t undo');
      setCanUndo(false);
      setNote({ tone: 'ok', text: 'Put back how it was.' });
      router.refresh();
    } catch (err) {
      setNote({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t undo' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-violet-700 dark:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 transition-colors"
      >
        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
        {working ? 'Updating…' : 'Change this app'}
      </button>
      {open && (
        <div
          className="fixed right-3 top-11 z-50 w-[min(420px,calc(100vw-24px))] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 p-3 shadow-2xl backdrop-blur"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
          onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); attach(e.dataTransfer.files); } }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">What should be different?</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"><X className="h-3.5 w-3.5" /></button>
          </div>
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {images.map((i) => (
                <div key={i.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.preview} alt="" className={`h-14 w-14 rounded-lg object-cover ring-1 ${i.error ? 'ring-red-400' : 'ring-black/10 dark:ring-white/10'} ${i.url ? '' : 'opacity-50'}`} />
                  {!i.url && !i.error && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" />}
                  <button onClick={() => setImages((a) => a.filter((x) => x.id !== i.id))} aria-label="Remove image" className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-800 p-0.5 text-neutral-200"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <textarea
            autoFocus
            value={text}
            disabled={working}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.some((x) => x.type.startsWith('image/'))) { e.preventDefault(); attach(f); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
            rows={4}
            placeholder="Make the canvas fill the screen, add undo… Paste or drop a screenshot to show what you mean."
            className="w-full resize-none rounded-xl bg-neutral-100 dark:bg-neutral-800/80 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
          />
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} aria-label="Attach an image" title="Attach an image" className="flex h-9 w-9 items-center justify-center rounded-full text-violet-600 dark:text-violet-300 hover:bg-violet-500/10"><ImagePlus className="h-[18px] w-[18px]" /></button>
            {canUndo && !working && (
              <button onClick={() => void undo()} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Undo2 className="h-3.5 w-3.5" /> Undo that change</button>
            )}
            <span className={`min-w-0 flex-1 truncate text-xs ${note?.tone === 'error' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`} title={note?.text}>
              {working ? 'Kan is rebuilding it. A minute or two.' : note?.text}
            </span>
            <button
              onClick={() => void submit()}
              disabled={!text.trim() || working || uploading}
              aria-label="Make the change"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-30"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
