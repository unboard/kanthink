'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * What Kan noticed: one pass of the attention loop, read like a note from a chief
 * of staff. Kan says what it saw in everything you gave it, which areas it would
 * start, reshape, quiet or wake, and where your loose input goes. Nothing changes
 * until you say "Do it", so you can judge its judgment first.
 */

type Change = 'start' | 'reshape' | 'quiet' | 'mute' | 'wake' | 'keep';

interface Pass {
  id: string;
  mode: 'rehearsal' | 'live';
  status: 'running' | 'done' | 'error';
  inputs: Record<string, number> | null;
  decisions: {
    note: string;
    areas: { channelId: string | null; name: string; attention: 'active' | 'quiet' | 'muted'; change: Change; why: string; purpose?: string; columns?: string[]; bot?: { on: boolean; everyHours?: number } }[];
    filings: { input: string; area: string; as: 'card' | 'note'; title: string }[];
  } | null;
  costMillicents: number;
  error: string | null;
  appliedAt: string | null;
  appliedLog: string[] | null;
  startedAt: string;
}

const CHANGE: Record<Change, { label: string; className: string }> = {
  start: { label: 'Start', className: 'bg-violet-500/20 text-violet-200' },
  reshape: { label: 'Reshape', className: 'bg-sky-500/15 text-sky-200' },
  wake: { label: 'Wake', className: 'bg-emerald-500/15 text-emerald-200' },
  keep: { label: 'Keep', className: 'bg-neutral-800 text-neutral-300' },
  quiet: { label: 'Quiet', className: 'bg-neutral-800 text-neutral-400' },
  mute: { label: 'Mute', className: 'bg-neutral-900 text-neutral-500' },
};
const ORDER: Change[] = ['start', 'reshape', 'wake', 'keep', 'quiet', 'mute'];

const INPUT_WORDS: Record<string, [string, string]> = {
  voice: ['thing you said out loud', 'things you said out loud'],
  chat: ['message', 'messages'],
  share: ['share', 'shares'],
  note: ['note on a card', 'notes on cards'],
  browsing: ['day of browsing', 'days of browsing'],
  read: ['page you read', 'pages you read'],
};

function inputSummary(inputs: Record<string, number> | null) {
  if (!inputs) return '';
  const parts = Object.entries(INPUT_WORDS).filter(([k]) => inputs[k]).map(([k, [one, many]]) => `${inputs[k]} ${inputs[k] === 1 ? one : many}`);
  if (!parts.length) return 'Nothing new since last time.';
  const last = parts.pop();
  return `Read ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}

export default function AttentionPage() {
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState<'think' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/attention');
    if (r.status === 401) { setSignedOut(true); setPasses([]); return; }
    const d = await r.json().catch(() => ({ passes: [], names: {} }));
    setPasses(d.passes ?? []);
    setNames(d.names ?? {});
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latest = passes?.[0];
  const thinking = latest?.status === 'running';
  useEffect(() => {
    if (!thinking) return;
    const t = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(t);
  }, [thinking, load]);

  const think = async () => {
    setBusy('think');
    setError(null);
    await fetch('/api/prototypes/kan/attention', { method: 'POST' });
    setTimeout(() => { void load().finally(() => setBusy(null)); }, 1500);
  };

  const apply = async (id: string) => {
    setBusy('apply');
    setError(null);
    const r = await fetch(`/api/prototypes/kan/attention/${id}/apply`, { method: 'POST' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'That didn’t work.');
    await load();
    setBusy(null);
  };

  const d = latest?.status === 'done' ? latest.decisions : null;
  const areaName = (id: string) => names[id] ?? id;
  const byArea = new Map<string, string[]>();
  for (const f of d?.filings ?? []) byArea.set(areaName(f.area), [...(byArea.get(areaName(f.area)) ?? []), f.title]);
  const areas = [...(d?.areas ?? [])].sort((a, b) => ORDER.indexOf(a.change) - ORDER.indexOf(b.change));

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0b] text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-900 px-4 py-3 md:px-6">
        <Link href="/prototypes/kan" className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-sm font-medium text-neutral-300">Kan</span>
          <ChevronRight className="h-3.5 w-3.5 text-neutral-700" />
          <span className="text-sm text-neutral-400">What I noticed</span>
        </Link>
        <Link href="/prototypes/kan/bots" className="rounded-full px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200">Bots</Link>
      </header>

      <main className="mx-auto w-full max-w-[680px] px-4 pb-20 pt-8 md:px-8">
        {passes === null ? (
          <Loader2 className="mx-auto mt-20 h-5 w-5 animate-spin text-neutral-600" />
        ) : signedOut ? (
          <p className="text-sm text-neutral-400">Sign in on the <Link href="/prototypes/kan" className="text-violet-400">Kan page</Link> first.</p>
        ) : !latest ? (
          <div className="mt-16 text-center">
            <p className="text-[15px] text-neutral-300">I haven’t looked over what you’ve given me yet.</p>
            <button onClick={() => void think()} disabled={busy !== null} className="mt-4 rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {busy ? 'Starting…' : 'Have a look'}
            </button>
          </div>
        ) : thinking ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            Reading everything you’ve given me lately. This takes a minute or two.
          </div>
        ) : latest.status === 'error' ? (
          <div className="mt-10">
            <p className="text-sm text-red-400">That pass failed: {latest.error}</p>
            <button onClick={() => void think()} className="mt-3 text-sm text-violet-400">Try again</button>
          </div>
        ) : d && (
          <>
            <p className="text-xs text-neutral-600">
              {new Date(latest.startedAt).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' · '}{inputSummary(latest.inputs)}
            </p>
            <div className="mt-4 flex gap-3">
              <KanthinkIcon size={22} className="mt-1 flex-shrink-0 text-violet-400" />
              <p className="text-[17px] leading-relaxed text-neutral-100">{d.note}</p>
            </div>

            {latest.appliedLog ? (
              <section className="mt-8 rounded-xl border border-neutral-900 px-4 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Done</p>
                <ul className="space-y-1.5 text-[13px] text-neutral-300">{latest.appliedLog.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </section>
            ) : (
              <div className="mt-6 flex gap-2">
                <button onClick={() => void apply(latest.id)} disabled={busy !== null} className="flex items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                  {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Do it
                </button>
                <button onClick={() => void think()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Think again
                </button>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <section className="mt-10">
              <h2 className="mb-3 text-xs text-neutral-500">What changes</h2>
              <div className="space-y-4">
                {areas.map((a, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[a.change].className}`}>{CHANGE[a.change].label}</span>
                      <span className="text-[15px] text-neutral-100">{a.name}</span>
                      {a.bot && a.change !== 'mute' && (
                        <span className="text-[12px] text-neutral-600">{a.bot.on ? `· bot ${a.bot.everyHours ? `every ${a.bot.everyHours}h` : 'on'}` : '· no bot'}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-400">{a.why}</p>
                    {(a.change === 'start' || a.change === 'reshape') && a.columns?.length ? (
                      <p className="mt-1 text-[12px] text-neutral-600">{a.columns.join(' → ')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {byArea.size > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 text-xs text-neutral-500">Where things go</h2>
                <div className="space-y-4">
                  {[...byArea.entries()].map(([area, titles]) => (
                    <div key={area}>
                      <p className="text-[14px] text-neutral-200">{area}</p>
                      <ul className="mt-1 space-y-0.5 text-[13px] text-neutral-500">{titles.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="mt-10 text-xs text-neutral-700">This look cost ${(latest.costMillicents / 100_000).toFixed(2)}.</p>
          </>
        )}
      </main>
    </div>
  );
}
