'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { AppWindow, ArrowLeft, Hammer, Loader2, MapPin, MessageCircle, Power, Scale, Search, Sparkles, Terminal, X } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { ShroomBot } from './ShroomBot';
import { hash } from '@/lib/kan/city/layout';
import type { CensusResident, CensusStaff } from '@/lib/kan/city/census';

/**
 * The census: everyone who works for you on one page. The staff who don't live in a
 * building (Kan, Jev, the Builder, Claude Code, the shrooms), then every channel's
 * resident by neighborhood, with its job, hours and week. Tap one for the whole file.
 */

type Filter = 'all' | 'duty' | 'busy' | 'needs' | 'off';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'duty', label: 'On duty' },
  { key: 'busy', label: 'Busy this week' },
  { key: 'needs', label: 'Needs you' },
  { key: 'off', label: 'Off duty' },
];

const STAFF_ICON: Record<CensusStaff['key'], React.ReactNode> = {
  kan: <KanthinkIcon size={18} className="text-violet-300" />,
  jev: <Scale className="h-4 w-4 text-sky-300" />,
  builder: <Hammer className="h-4 w-4 text-amber-300" />,
  claude: <Terminal className="h-4 w-4 text-orange-300" />,
  shrooms: <Sparkles className="h-4 w-4 text-emerald-300" />,
};

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const every = (h: number) => (h === 168 ? 'weekly' : h === 24 ? 'daily' : h % 24 === 0 ? `every ${h / 24} days` : `every ${h}h`);
function when(at: number | null) {
  if (!at) return null;
  const d = at - Date.now();
  const abs = Math.abs(d);
  const s = abs < 3600_000 ? `${Math.max(1, Math.round(abs / 60_000))}m` : abs < 86400_000 ? `${Math.round(abs / 3600_000)}h` : `${Math.round(abs / 86400_000)}d`;
  return d > 0 ? `in ${s}` : `${s} ago`;
}
const busyness = (r: CensusResident) => r.week.runs + r.week.chats + r.week.changes;

export function Census({ onClose, onVisit, onTalk, onDuty }: {
  onClose(): void;
  onVisit(channelId: string): void;
  onTalk(channelId: string): void;
  onDuty(channelId: string, on: boolean): Promise<unknown>;
}) {
  const [data, setData] = useState<{ residents: CensusResident[]; staff: CensusStaff[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [staffOpen, setStaffOpen] = useState<CensusStaff['key'] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/prototypes/kan/city/census').catch(() => null);
    if (!r?.ok) { setError('Couldn’t take the census'); return; }
    setData(await r.json());
    setError(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open || staffOpen) { setOpen(null); setStaffOpen(null); } else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, staffOpen, onClose]);

  const residents = data?.residents ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return residents.filter((r) => {
      if (filter === 'duty' && !r.duty.on) return false;
      if (filter === 'off' && r.duty.on) return false;
      if (filter === 'busy' && busyness(r) === 0) return false;
      if (filter === 'needs' && !r.asks.length) return false;
      if (!needle) return true;
      return [r.name, r.channel.name, r.channel.purpose, r.channel.job, r.neighborhood].some((s) => s.toLowerCase().includes(needle));
    });
  }, [residents, filter, q]);
  const hoods = useMemo(() => {
    const m = new Map<string, CensusResident[]>();
    for (const r of shown) m.set(r.neighborhood, [...(m.get(r.neighborhood) ?? []), r]);
    for (const list of m.values()) list.sort((a, b) => Number(b.duty.on) - Number(a.duty.on) || busyness(b) - busyness(a) || a.name.localeCompare(b.name));
    return [...m].sort(([a], [b]) => (a === 'Downtown' ? 1 : b === 'Downtown' ? -1 : a.localeCompare(b)));
  }, [shown]);

  const onDutyCount = residents.filter((r) => r.duty.on).length;
  const spent = residents.reduce((n, r) => n + r.week.spentCents, 0);
  const picked = residents.find((r) => r.channelId === open) ?? null;
  const pickedStaff = data?.staff.find((s) => s.key === staffOpen) ?? null;

  const toggle = async (r: CensusResident) => {
    setBusy(r.channelId);
    await onDuty(r.channelId, !r.duty.on);
    await load();
    setBusy(null);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex flex-col bg-neutral-950/97 text-neutral-100 backdrop-blur-xl" role="dialog" aria-label="Census">
      <header className="flex flex-shrink-0 items-start gap-3 border-b border-white/5 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] lg:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold">Census</h1>
          <p className="text-[13px] text-neutral-400">
            {data ? `${residents.length} residents · ${onDutyCount} on duty · ${usd(spent)} spent this week, plus ${data.staff.length} on staff` : 'Counting everyone…'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className={`min-h-0 flex-1 overflow-y-auto px-4 pb-10 lg:px-8 ${picked || pickedStaff ? 'hidden lg:block' : ''}`}>
          {error && <p className="mt-6 text-[13px] text-rose-300">{error}. <button onClick={() => void load()} className="underline">Try again</button></p>}
          {!data && !error && <p className="mt-6 flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Counting everyone…</p>}

          {data && (
            <>
              <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Staff</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.staff.map((s) => (
                  <button key={s.key} onClick={() => { setStaffOpen(s.key); setOpen(null); }} className={`rounded-2xl border p-3 text-left transition hover:border-white/20 ${staffOpen === s.key ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5">{STAFF_ICON[s.key]}</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium">{s.name}</span>
                        <span className="block text-[12px] text-neutral-500">{s.role}</span>
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-neutral-400">{s.doing}</p>
                    {s.presence && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-neutral-300"><span className={`h-1.5 w-1.5 rounded-full ${presenceLine(s.presence).dot}`} />{s.presence.state === 'offline' ? 'Offline' : s.presence.state === 'working' ? 'Online, working' : 'Online'}</p>}
                    <p className="mt-2 text-[12px] text-neutral-300">{s.week.map((w) => `${w.value} ${w.label}`).join(' · ')}</p>
                  </button>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-2">
                <h2 className="mr-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Residents</h2>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-xs ${filter === f.key ? 'bg-violet-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}>{f.label}</button>
                  ))}
                </div>
                <label className="ml-auto flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 sm:w-64">
                  <Search className="h-3.5 w-3.5 text-neutral-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone or a job" className="w-full bg-transparent text-[13px] outline-none placeholder:text-neutral-600" />
                </label>
              </div>

              {hoods.length === 0 && <p className="mt-6 text-[13px] text-neutral-500">Nobody matches.</p>}
              {hoods.map(([hood, list]) => (
                <section key={hood} className="mt-5">
                  <h3 className="mb-1.5 text-[12px] font-medium text-neutral-500">{hood} <span className="text-neutral-700">· {list.length}</span></h3>
                  <ul className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((r) => (
                      <li key={r.channelId}>
                        <button onClick={() => { setOpen(r.channelId); setStaffOpen(null); }} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:border-white/20 ${open === r.channelId ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/5 bg-white/[0.03]'}`}>
                          <ShroomBot seed={hash(r.channelId)} size={36} status={r.asks.length ? 'needs' : r.duty.on ? 'idle' : 'off'} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-medium">{r.name}</span>
                              <span className={`flex-shrink-0 rounded-full px-1.5 py-px text-[10px] ${r.duty.on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-neutral-500'}`}>{r.duty.on ? `On duty · ${every(r.duty.everyHours)}` : 'Off duty'}</span>
                            </span>
                            <span className="block truncate text-[12px] text-neutral-400">Runs {r.channel.name}</span>
                            <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-neutral-500">{r.channel.job || r.channel.purpose || 'No job written down yet.'}</span>
                            <span className="mt-1.5 block text-[11px] text-neutral-500">
                              {busyness(r) ? [r.week.runs && `${r.week.runs} run${r.week.runs === 1 ? '' : 's'}`, r.week.chats && `${r.week.chats} chat${r.week.chats === 1 ? '' : 's'}`, r.week.changes && `${r.week.changes} change${r.week.changes === 1 ? '' : 's'}`, r.week.spentCents && usd(r.week.spentCents)].filter(Boolean).join(' · ') : 'Quiet this week'}
                              {r.asks.length > 0 && <span className="text-amber-300"> · needs you</span>}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </main>

        {(picked || pickedStaff) && (
          <aside className="min-h-0 w-full flex-shrink-0 overflow-y-auto border-l border-white/5 px-4 pb-10 pt-3 lg:w-[440px] lg:px-6">
            <button onClick={() => { setOpen(null); setStaffOpen(null); }} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-400 hover:bg-white/5 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Everyone
            </button>
            {picked && <ResidentFile r={picked} busy={busy === picked.channelId} onVisit={() => onVisit(picked.channelId)} onTalk={() => onTalk(picked.channelId)} onToggle={() => void toggle(picked)} />}
            {pickedStaff && <StaffFile s={pickedStaff} />}
          </aside>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

function ResidentFile({ r, busy, onVisit, onTalk, onToggle }: { r: CensusResident; busy: boolean; onVisit(): void; onTalk(): void; onToggle(): void }) {
  return (
    <div>
      <div className="mt-3 flex items-start gap-3">
        <ShroomBot seed={hash(r.channelId)} size={56} status={r.duty.on ? 'idle' : 'off'} />
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold">{r.name}</h2>
          <p className="text-[13px] text-neutral-400">Runs {r.channel.name} · {r.neighborhood}</p>
          <p className="mt-1 text-[13px] leading-snug text-neutral-300">{r.personality}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onTalk} className="flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500"><MessageCircle className="h-3.5 w-3.5" /> Talk</button>
        <button onClick={onVisit} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5"><MapPin className="h-3.5 w-3.5" /> Visit</button>
        <button disabled={busy} onClick={onToggle} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} {r.duty.on ? 'Take off duty' : 'Put on duty'}
        </button>
      </div>

      <Section title="Hours">
        <p className="text-[13px] text-neutral-300">
          {r.duty.on ? `On duty, works ${every(r.duty.everyHours)}${r.duty.nextRunAt ? `, next ${when(r.duty.nextRunAt)}` : ''}.` : 'Off duty: only works when someone talks to it.'}
          {' '}Up to {usd(r.duty.budgetCents)} a day.{r.duty.lastRunAt ? ` Last worked ${when(r.duty.lastRunAt)}.` : ''}
        </p>
        {r.attention.level && <p className="mt-1 text-[12px] text-neutral-500">Kan has it {r.attention.level}{r.attention.why ? `: ${r.attention.why}` : '.'}</p>}
        {r.startedByKan && <p className="mt-1 text-[12px] text-neutral-500">Kan started this one.</p>}
      </Section>

      <Section title="Its job">
        {r.channel.purpose && <p className="text-[13px] leading-relaxed text-neutral-300">{r.channel.purpose}</p>}
        {r.channel.job
          ? <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] leading-relaxed text-neutral-200">{r.channel.job}</p>
          : <p className="mt-1 text-[13px] text-neutral-500">No standing instructions. Tell {r.name} what to do each run and it’ll write them down.</p>}
      </Section>

      <Section title="This week">
        <p className="text-[13px] text-neutral-300">{r.week.runs} run{r.week.runs === 1 ? '' : 's'} on its own{r.week.runs ? ` (${r.week.changes} change${r.week.changes === 1 ? '' : 's'})` : ''}, {r.week.chats} chat{r.week.chats === 1 ? '' : 's'} with you, {usd(r.week.spentCents)} spent{r.week.errors ? `, ${r.week.errors} failed` : ''}.</p>
        {r.lastReport && (
          <div className="mt-2 rounded-xl bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] text-neutral-500">{r.lastReport.trigger === 'chat' ? 'Last said' : 'Last report'} · {when(r.lastReport.at)}</p>
            <div className="prose prose-invert prose-sm max-w-none text-[13px] text-neutral-200 prose-p:my-1"><ReactMarkdown>{r.lastReport.text}</ReactMarkdown></div>
          </div>
        )}
        {r.asks.map((a, i) => <p key={i} className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-amber-100">{a}</p>)}
        <Link href={`/prototypes/kan/bots?channel=${r.channelId}`} className="mt-2 inline-block text-[12px] text-violet-300 hover:text-violet-200">Every run and what it cost</Link>
      </Section>

      {r.notes && (
        <Section title="Its notes to itself">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-neutral-400">{r.notes}</p>
        </Section>
      )}

      <Section title={`Works with · ${r.cards} card${r.cards === 1 ? '' : 's'}`}>
        {r.shrooms.length === 0 && r.apps.length === 0 && <p className="text-[13px] text-neutral-500">No shrooms or apps here yet.</p>}
        {r.shrooms.length > 0 && (
          <ul className="space-y-1">
            {r.shrooms.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px]">
                <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${s.on ? 'text-emerald-300' : 'text-neutral-600'}`} />
                <span className="min-w-0 flex-1 truncate text-neutral-200">{s.title}</span>
                <span className="flex-shrink-0 text-[11px] text-neutral-500">{s.action}{s.on ? '' : ' · off'}{s.runsThisWeek ? ` · ${s.runsThisWeek} this week` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {r.apps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.apps.map((a) => <span key={a.id} className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-0.5 text-[12px] text-violet-200"><AppWindow className="h-3 w-3" />{a.title}</span>)}
          </div>
        )}
      </Section>
    </div>
  );
}

function presenceLine(p: NonNullable<CensusStaff['presence']>) {
  if (p.state === 'working') return { dot: 'animate-pulse bg-emerald-400', text: 'Online and working right now' };
  if (p.state === 'idle') return { dot: 'bg-emerald-400', text: `Online: a session is open${p.sessions > 1 ? ` (${p.sessions})` : ''}, waiting for you` };
  if (!p.wired) return { dot: 'bg-neutral-600', text: 'Can’t tell yet: its presence hooks aren’t set up on your computer' };
  return { dot: 'bg-neutral-600', text: `Offline${p.lastSeenAt ? `, last seen ${when(p.lastSeenAt)}` : ''}` };
}

/** A note for Claude Code: a card in Work → Do these. */
function NoteForClaude({ presence }: { presence: NonNullable<CensusStaff['presence']> }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const send = async () => {
    setState('sending');
    const r = await fetch('/api/prototypes/kan/city/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
    if (!r?.ok) { setState((await r?.json().catch(() => null))?.error ?? 'That didn’t send'); return; }
    setText('');
    setState('sent');
  };
  return (
    <div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); if (state !== 'sending') setState('idle'); }} rows={4} placeholder="What should Claude Code do? The first line becomes the card’s title." className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-600" />
      <div className="mt-2 flex items-center gap-3">
        <button disabled={!text.trim() || state === 'sending'} onClick={() => void send()} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40">{state === 'sending' ? 'Leaving it…' : 'Leave in Do these'}</button>
        {state === 'sent' && <span className="text-[12px] text-emerald-300">{presence.state === 'offline' ? 'Left in Do these. It’ll be there when you next ask Claude Code to look.' : 'Left in Do these. The open session hears about it on its next turn.'}</span>}
        {state !== 'idle' && state !== 'sending' && state !== 'sent' && <span className="text-[12px] text-rose-300">{state}</span>}
      </div>
    </div>
  );
}

function StaffFile({ s }: { s: CensusStaff }) {
  const p = s.presence ? presenceLine(s.presence) : null;
  return (
    <div>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">{STAFF_ICON[s.key]}</span>
        <div>
          <h2 className="text-[19px] font-semibold">{s.name}</h2>
          <p className="text-[13px] text-neutral-400">{s.role}</p>
        </div>
      </div>
      {p && <p className="mt-3 flex items-center gap-2 text-[13px] text-neutral-200"><span className={`h-2 w-2 flex-shrink-0 rounded-full ${p.dot}`} />{p.text}</p>}
      <Section title="What it does">
        <p className="text-[13px] leading-relaxed text-neutral-200">{s.doing}</p>
      </Section>
      {s.presence && (
        <Section title="Leave it a note">
          <NoteForClaude presence={s.presence} />
        </Section>
      )}
      <Section title="This week">
        <ul className="space-y-1">
          {s.week.map((w) => <li key={w.label} className="flex justify-between text-[13px]"><span className="text-neutral-400">{w.label}</span><span className="font-medium text-neutral-100">{w.value}</span></li>)}
        </ul>
      </Section>
      {s.details.length > 0 && (
        <Section title={s.key === 'kan' ? 'What you’ve told it about your work' : 'Details'}>
          <ul className="space-y-1.5">{s.details.map((d, i) => <li key={i} className="text-[13px] leading-snug text-neutral-300">{d}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}
