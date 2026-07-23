'use client';

import { useEffect, useState } from 'react';
import type { Idea, MarketingChannel, IdeaStatus, Effort } from '@/lib/calendar/types';
import { CHANNELS, OWNERS, STATUSES, channelMeta } from '@/lib/calendar/types';
import { formatFullDate } from './dateUtils';

const EMPTY: Idea = {
  id: '', business: '', title: '', date: null, channel: 'email', audience: '',
  objective: '', justification: '', metric: '', owner: 'Dustin', collaborators: [],
  tools: [], effort: 'M', status: 'planned', notes: '', position: 0,
};

export function IdeaDetail({
  idea,
  audiences,
  onSave,
  onDelete,
  onClose,
}: {
  idea: Idea | 'new' | null;
  audiences: string[];
  onSave: (idea: Idea) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const isNew = idea === 'new';
  const [draft, setDraft] = useState<Idea>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (idea === 'new') {
      setDraft({ ...EMPTY });
      setEditing(true);
    } else if (idea) {
      setDraft(idea);
      setEditing(false);
    }
  }, [idea]);

  if (!idea) return null;

  function set<K extends keyof Idea>(key: K, value: Idea[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      if (isNew) onClose();
    } finally {
      setSaving(false);
    }
  }

  const cm = channelMeta(draft.channel);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-[1px]" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: cm.bg, color: cm.text }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: cm.color }} />
              {cm.label}
            </span>
            <span className="text-[11px] text-neutral-400">{isNew ? 'New idea' : draft.date ? formatFullDate(draft.date) : 'Backlog'}</span>
          </div>
          <div className="flex items-center gap-1">
            {!isNew && !editing && (
              <button onClick={() => setEditing(true)} className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">Edit</button>
            )}
            <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <div className="space-y-4">
              <Field label="Title">
                <input value={draft.title} onChange={(e) => set('title', e.target.value)} autoFocus
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Short action name" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input type="date" value={draft.date || ''} onChange={(e) => set('date', e.target.value || null)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </Field>
                <Field label="Channel">
                  <select value={draft.channel} onChange={(e) => set('channel', e.target.value as MarketingChannel)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Audience">
                <input list="cal-audiences" value={draft.audience} onChange={(e) => set('audience', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Who this targets" />
                <datalist id="cal-audiences">{audiences.map((a) => <option key={a} value={a} />)}</datalist>
              </Field>

              <Field label="Objective"><TextArea value={draft.objective} onChange={(v) => set('objective', v)} placeholder="What it's meant to achieve" /></Field>
              <Field label="Why now (justification)"><TextArea value={draft.justification} onChange={(v) => set('justification', v)} placeholder="The timing rationale" /></Field>
              <Field label="Revenue metric">
                <input value={draft.metric} onChange={(e) => set('metric', e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="The metric it moves" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner">
                  <select value={draft.owner} onChange={(e) => set('owner', e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {OWNERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Collaborators">
                  <input value={draft.collaborators.join(', ')} onChange={(e) => set('collaborators', splitList(e.target.value))}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Erica, Jason" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select value={draft.status} onChange={(e) => set('status', e.target.value as IdeaStatus)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Effort">
                  <select value={draft.effort} onChange={(e) => set('effort', e.target.value as Effort)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="S">S — small</option><option value="M">M — medium</option><option value="L">L — large</option>
                  </select>
                </Field>
              </div>

              <Field label="Tools">
                <input value={draft.tools.join(', ')} onChange={(e) => set('tools', splitList(e.target.value))}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Customer.io, React Email, /design" />
              </Field>
              <Field label="Notes"><TextArea value={draft.notes} onChange={(v) => set('notes', v)} rows={4} placeholder="Playbook detail" /></Field>
            </div>
          ) : (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold leading-snug text-neutral-900">{draft.title}</h2>

              <div className="flex flex-wrap gap-2">
                {draft.audience && <Pill>{draft.audience}</Pill>}
                <Pill>{OWNERS.find((o) => o.key === draft.owner)?.label || draft.owner}</Pill>
                <Pill>Effort {draft.effort}</Pill>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUSES.find((s) => s.key === draft.status)?.color }} />
                  {STATUSES.find((s) => s.key === draft.status)?.label}
                </span>
              </div>

              {draft.objective && <ReadField label="Objective">{draft.objective}</ReadField>}
              {draft.justification && <ReadField label="Why now">{draft.justification}</ReadField>}
              {draft.metric && <ReadField label="Revenue metric">{draft.metric}</ReadField>}
              {draft.notes && <ReadField label="Notes">{draft.notes}</ReadField>}
              {draft.collaborators.length > 0 && <ReadField label="Collaborators">{draft.collaborators.join(', ')}</ReadField>}
              {draft.tools.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tools</div>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.tools.map((t) => <span key={t} className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">{t}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          {!isNew ? (
            <button onClick={() => onDelete(draft.id)} className="rounded-lg px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50">Delete</button>
          ) : <span />}
          {editing ? (
            <div className="flex gap-2">
              {!isNew && <button onClick={() => setEditing(false)} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">Cancel</button>}
              <button onClick={handleSave} disabled={saving || !draft.title.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Saving…' : 'Save idea'}
              </button>
            </div>
          ) : (
            <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">Close</button>
          )}
        </div>
      </div>
    </>
  );
}

function splitList(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function TextArea({ value, onChange, rows = 2, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
  );
}

function ReadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <p className="text-[14px] leading-relaxed text-neutral-700">{children}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">{children}</span>;
}
