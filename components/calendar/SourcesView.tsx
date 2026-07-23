'use client';

import { useState } from 'react';
import type { Asset, AssetKind } from '@/lib/calendar/types';
import { ASSET_KINDS, assetKindMeta } from '@/lib/calendar/types';

const EMPTY: Asset = { id: '', business: '', kind: 'audience', name: '', description: '', url: '', tags: [], notes: '', position: 0 };

export function SourcesView({
  assets,
  onSave,
  onDelete,
  onFocusAudience,
}: {
  assets: Asset[];
  onSave: (asset: Asset) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onFocusAudience: (name: string) => void;
}) {
  const [editor, setEditor] = useState<Asset | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">Knowledge base</h2>
        <p className="mt-1 text-sm text-neutral-500">
          The audiences you market to and what you sell or send them. Kan reads all of this to get smarter about your business — the more you add, the better the ideas it generates. Click an audience to focus the calendar on it.
        </p>
      </div>

      <div className="space-y-8">
        {ASSET_KINDS.map((k) => {
          const items = assets.filter((a) => a.kind === k.key);
          return (
            <section key={k.key}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} />
                  <h3 className="text-sm font-semibold text-neutral-800">{k.plural}</h3>
                  <span className="text-xs text-neutral-400">{items.length}</span>
                </div>
                <button onClick={() => setEditor({ ...EMPTY, kind: k.key })}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                  + Add {k.label.toLowerCase()}
                </button>
              </div>
              <p className="mb-3 text-xs text-neutral-400">{k.hint}</p>

              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
                  Nothing yet. Add your first {k.label.toLowerCase()}.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((a) => (
                    <div key={a.id} className="group relative rounded-xl border border-neutral-200 bg-white p-3.5 transition-shadow hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-semibold text-neutral-900">{a.name}</div>
                          {a.description && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-neutral-500">{a.description}</p>}
                        </div>
                      </div>
                      {a.tags.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {a.tags.slice(0, 4).map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{t}</span>)}
                        </div>
                      )}
                      <div className="mt-2.5 flex items-center gap-2 border-t border-neutral-100 pt-2.5 text-[11px]">
                        {k.key === 'audience' && (
                          <button onClick={() => onFocusAudience(a.name)} className="font-medium text-blue-600 hover:text-blue-700">Focus</button>
                        )}
                        {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-700">Visit</a>}
                        <button onClick={() => setEditor(a)} className="ml-auto text-neutral-400 hover:text-neutral-700">Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editor && (
        <AssetEditor
          asset={editor}
          onClose={() => setEditor(null)}
          onSave={async (a) => { await onSave(a); setEditor(null); }}
          onDelete={async (id) => { await onDelete(id); setEditor(null); }}
        />
      )}
    </div>
  );
}

function AssetEditor({ asset, onSave, onDelete, onClose }: {
  asset: Asset;
  onSave: (a: Asset) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Asset>(asset);
  const [saving, setSaving] = useState(false);
  const meta = assetKindMeta(draft.kind);
  const isNew = !draft.id;

  function set<K extends keyof Asset>(k: K, v: Asset[K]) { setDraft((d) => ({ ...d, [k]: v })); }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
            <h3 className="text-sm font-semibold text-neutral-900">{isNew ? `New ${meta.label.toLowerCase()}` : `Edit ${meta.label.toLowerCase()}`}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Type</span>
            <select value={draft.kind} onChange={(e) => set('kind', e.target.value as AssetKind)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {ASSET_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Name</span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder={meta.hint} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Description</span>
            <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3}
              className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">URL (optional)</span>
            <input value={draft.url} onChange={(e) => set('url', e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="https://…" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tags (comma-separated)</span>
            <input value={draft.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="spring, eddm" />
          </label>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          {!isNew ? <button onClick={() => onDelete(draft.id)} className="rounded-lg px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50">Delete</button> : <span />}
          <button onClick={async () => { if (!draft.name.trim()) return; setSaving(true); try { await onSave(draft); } finally { setSaving(false); } }}
            disabled={saving || !draft.name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
