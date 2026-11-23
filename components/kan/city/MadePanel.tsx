'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Gift, Loader2, Play, Trash2 } from 'lucide-react';
import type { OpenApp } from '@/components/kan/city/BotChat';

export interface MadeItem {
  id: string;
  title: string;
  kind: 'learn' | 'money' | 'fun';
  forWhom: string;
  why: string;
  status: 'building' | 'ready' | 'failed' | 'kept' | 'tossed' | 'handed';
  route: 'app' | 'claude';
  appId: string | null;
  href: string | null;
  at: number;
}
export interface MadeData { weeklyCents: number; spentCents: number; items: MadeItem[] }

const KIND = { learn: 'To learn', money: 'To earn', fun: 'For fun' } as const;
const BUDGETS = [0, 100, 300, 500, 1000];

/** Made for you, fetched on its own so the city doesn't wait for it. */
export function useMade() {
  const [data, setData] = useState<MadeData | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/made').catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch on mount; setData lands after it resolves
  useEffect(() => { void load(); }, [load]);
  return { data, reload: load, fresh: data?.items.filter((i) => i.status === 'ready').length ?? 0 };
}

const post = (body: object) => fetch('/api/prototypes/kan/made', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * What Kan made on its own: open one, keep it, or toss it (and Kan learns). The budget
 * sits at the bottom, small, because it's set once.
 */
export function MadePanel({ data, onChanged, onOpen }: { data: MadeData | null; onChanged(): void; onOpen(a: OpenApp): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [tossing, setTossing] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [asked, setAsked] = useState(false);
  const act = async (key: string, body: object) => { setBusy(key); await post(body).catch(() => null); setBusy(null); onChanged(); };
  if (!data) return <p className="flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Looking…</p>;
  const left = Math.max(0, data.weeklyCents - data.spentCents);
  return (
    <div>
      <p className="pr-8 text-[11px] uppercase tracking-wider text-pink-300">Kan made these on its own</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold text-neutral-50">Made for you</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">From what you share, say and read, Kan picks something that would help you learn, earn or have fun, and builds it with Gemini 4 Neon. Keep what you like; toss the rest and it learns.</p>
      <div className="mt-3 space-y-2">
        {data.items.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-start gap-3">
              <Gift className={`mt-0.5 h-4 w-4 flex-shrink-0 ${m.status === 'kept' ? 'text-yellow-300' : 'text-pink-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-neutral-100">{m.title}</p>
                <p className="text-[11.5px] text-neutral-500">
                  {KIND[m.kind]} · for {m.forWhom}
                  {m.status === 'building' ? ' · being made' : m.status === 'failed' ? ' · didn’t come out' : m.status === 'handed' ? ' · waiting for Claude Code' : m.status === 'kept' ? ' · kept' : ''}
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-neutral-400">{m.why}</p>
              </div>
            </div>
            {tossing === m.id ? (
              <div className="mt-2 flex gap-1.5">
                <input autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why not? (optional, helps Kan)" className="min-w-0 flex-1 rounded-full border border-white/15 bg-transparent px-3 py-1.5 text-[12.5px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none" />
                <button onClick={() => { void act(m.id, { action: 'toss', id: m.id, text: why }); setTossing(null); setWhy(''); }} className="rounded-full bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700">Toss</button>
                <button onClick={() => setTossing(null)} className="rounded-full px-2 py-1.5 text-xs text-neutral-400 hover:text-neutral-200">Cancel</button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                {m.href && m.appId && (
                  <button onClick={() => onOpen({ id: m.appId!, title: m.title, href: m.href! })} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-200"><Play className="h-3 w-3" /> Open</button>
                )}
                {m.status === 'ready' && (
                  <button disabled={busy === m.id} onClick={() => void act(m.id, { action: 'keep', id: m.id })} className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"><Check className="h-3 w-3" /> Keep</button>
                )}
                {m.status !== 'building' && (
                  <button onClick={() => setTossing(m.id)} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-200"><Trash2 className="h-3 w-3" /> Toss</button>
                )}
              </div>
            )}
          </div>
        ))}
        {!data.items.length && <p className="text-[13px] text-neutral-500">Nothing yet. Kan looks once a day, and only makes something when it’s sure you’d be glad to find it.</p>}
      </div>
      <button
        disabled={asked || data.weeklyCents === 0}
        onClick={() => { setAsked(true); void post({ action: 'now' }); }}
        className="mt-3 flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50"
      >
        <Gift className="h-3.5 w-3.5" /> {asked ? 'Kan is looking. It will tell you if it makes something.' : 'Have Kan look now'}
      </button>
      <div className="mt-4 border-t border-white/5 pt-3">
        <p className="text-[11.5px] text-neutral-500">Weekly budget · ${(data.spentCents / 100).toFixed(2)} spent, ${(left / 100).toFixed(2)} left</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {BUDGETS.map((c) => (
            <button
              key={c}
              disabled={busy === 'budget'}
              onClick={() => void act('budget', { action: 'budget', cents: c })}
              className={`rounded-full px-2.5 py-1 text-[11.5px] ${data.weeklyCents === c ? 'bg-white text-neutral-900' : 'border border-white/10 text-neutral-300 hover:bg-white/5'}`}
            >
              {c === 0 ? 'Off' : `$${c / 100}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
