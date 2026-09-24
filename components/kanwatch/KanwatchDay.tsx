'use client';

/**
 * Kanwatch — where a day's browsing time actually went.
 *
 * Read top to bottom: what the day was meant to be about, how it went (totals, the
 * week, a timeline), where the time went by channel and by kind of work, then each
 * stretch of the day with Jev's read on it — confirm, correct, or mark not-work.
 * Those answers, and your notes on sites, are what make the next day's reads better.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface Page {
  site: string;
  path: string;
  title: string;
  heading: string;
  search: string;
  seconds: number;
  doing: string;
}

interface Episode {
  id: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  privateSeconds: number;
  status: 'open' | 'closed' | 'judged';
  guess: {
    kind: string;
    channelId: string | null;
    channelName: string | null;
    cardId: string | null;
    cardTitle: string | null;
    probability: number | null;
  } | null;
  mode: string | null;
  focusScore: number | null;
  worthCard: number | null;
  verdict: 'confirmed' | 'corrected' | 'not_work' | null;
  verdictChannelId: string | null;
  verdictChannelName: string | null;
  verdictCardTitle: string | null;
  label: string | null;
  pages: Page[];
}

interface Site {
  domain: string;
  seconds: number;
  want: 'more' | 'right' | 'less' | null;
  purpose: string;
}

interface DayData {
  date: string;
  intention: string;
  extension: { connected: boolean; lastSeenAt?: number | null; fresh?: boolean };
  channels: { id: string; name: string }[];
  episodes: Episode[];
  sites: Site[];
  week: { start: number; activeSeconds: number; notWorkSeconds: number; privateSeconds: number }[];
}

const MODE_LABELS: Record<string, string> = {
  building: 'Building',
  researching: 'Researching',
  learning: 'Learning',
  communicating: 'Communicating',
  planning: 'Planning',
  admin: 'Admin',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  news_social: 'News & social',
};

const PALETTE = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316', '#06b6d4'];
const NOT_WORK = '#a3a3a3';
const UNCLEAR = '#d4d4d4';
const PRIVATE = '#404040';

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ---- time helpers ----------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dayBounds(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { from: new Date(y, m - 1, d).getTime(), to: new Date(y, m - 1, d + 1).getTime() };
}
function shiftDate(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + days));
}
function duration(seconds: number) {
  const m = Math.round(seconds / 60);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---- what an episode was -------------------------------------------------------

interface Reading {
  bucket: string;       // grouping key
  label: string;        // what to call it
  color: string;
  decided: boolean;     // the user said so, rather than Jev guessing
}

function readEpisode(e: Episode): Reading {
  if (e.verdict === 'not_work') return { bucket: 'not_work', label: e.label || 'Not work', color: NOT_WORK, decided: true };
  if (e.verdict) {
    const name = e.verdictCardTitle
      ? `${e.verdictChannelName ?? ''} › ${e.verdictCardTitle}`
      : e.verdictChannelName ?? e.label ?? 'Work';
    const key = e.verdictChannelId ?? `label:${e.label ?? 'work'}`;
    return { bucket: key, label: e.label && !e.verdictChannelName ? e.label : name, color: colorFor(key), decided: true };
  }
  if (e.pages.length === 0 && e.privateSeconds > 0) return { bucket: 'private', label: 'Private', color: PRIVATE, decided: true };
  const g = e.guess;
  if (!g || e.status !== 'judged') return { bucket: 'unread', label: 'Not read yet', color: UNCLEAR, decided: false };
  switch (g.kind) {
    case 'channel':
    case 'card':
      if (g.channelId) {
        return {
          bucket: g.channelId,
          label: g.cardTitle ? `${g.channelName} › ${g.cardTitle}` : g.channelName ?? 'Work',
          color: colorFor(g.channelId),
          decided: false,
        };
      }
      return { bucket: 'unclear', label: 'Unclear', color: UNCLEAR, decided: false };
    case 'new_work':
      return { bucket: 'new_work', label: 'Something new', color: '#a78bfa', decided: false };
    case 'not_work':
      return { bucket: 'not_work', label: 'Not work', color: NOT_WORK, decided: false };
    case 'private':
      return { bucket: 'private', label: 'Private', color: PRIVATE, decided: true };
    default:
      return { bucket: 'unclear', label: 'Unclear', color: UNCLEAR, decided: false };
  }
}

// ---- page ------------------------------------------------------------------------

export function KanwatchDay() {
  const router = useRouter();
  const [date, setDate] = useState(() => toDateString(new Date()));
  const [data, setData] = useState<DayData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [showSetup, setShowSetup] = useState(false);
  const [onlyNeedsYou, setOnlyNeedsYou] = useState(false);

  const load = useCallback(async (d: string) => {
    const { from, to } = dayBounds(d);
    try {
      const res = await fetch(`/api/kanwatch/day?date=${d}&from=${from}&to=${to}`);
      if (res.status === 403) return setState('forbidden');
      if (!res.ok) return setState('error');
      setData(await res.json());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  const changeDate = (d: string) => {
    setState('loading');
    setDate(d);
  };

  useEffect(() => {
    // Fetching the day is syncing with the server; state is only set once it answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(date);
  }, [date, load]);

  // The day keeps filling in while you watch it.
  useEffect(() => {
    if (date !== toDateString(new Date())) return;
    const t = setInterval(() => load(date), 60000);
    return () => clearInterval(t);
  }, [date, load]);

  const isToday = date === toDateString(new Date());

  if (state === 'forbidden') {
    return (
      <Shell onHome={() => router.push('/')}>
        <p className="py-20 text-center text-sm text-neutral-500">Kanwatch isn&rsquo;t available on this account yet.</p>
      </Shell>
    );
  }

  return (
    <Shell
      onHome={() => router.push('/')}
      right={
        <div className="flex items-center gap-2">
          <ConnectionChip extension={data?.extension} onClick={() => setShowSetup((s) => !s)} />
        </div>
      }
    >
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6">
        <DateNav date={date} isToday={isToday} onChange={changeDate} />

        {(showSetup || (data && !data.extension.connected)) && (
          <SetupPanel
            connected={!!data?.extension.connected}
            date={date}
            onChanged={() => load(date)}
            onClose={data?.extension.connected ? () => setShowSetup(false) : undefined}
          />
        )}

        {state === 'loading' && !data && <p className="text-sm text-neutral-500">Reading your day…</p>}
        {state === 'error' && <p className="text-sm text-red-500">Couldn&rsquo;t load this day.</p>}

        {data && (
          <>
            {/* Keyed so a new day or a saved value resets the field. */}
            <Intention key={`${date}:${data.intention}`} date={date} value={data.intention} onSaved={() => load(date)} />
            <Summary data={data} />
            <Week week={data.week} date={date} onPick={changeDate} />
            <Timeline episodes={data.episodes} />
            <WhereItWent episodes={data.episodes} />
            <Episodes
              episodes={data.episodes}
              channels={data.channels}
              onlyNeedsYou={onlyNeedsYou}
              setOnlyNeedsYou={setOnlyNeedsYou}
              onChanged={() => load(date)}
            />
            <Sites sites={data.sites} onChanged={() => load(date)} />
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, right, onHome }: { children: React.ReactNode; right?: React.ReactNode; onHome: () => void }) {
  return (
    <div className="flex h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <button onClick={onHome} className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
          <KanthinkIcon size={20} className="text-violet-500" />
          Kanwatch
        </button>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 sm:inline dark:text-neutral-500">
          where your time went
        </span>
        <div className="ml-auto">{right}</div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function ConnectionChip({ extension, onClick }: { extension?: DayData['extension']; onClick: () => void }) {
  const connected = !!extension?.connected;
  const lastSeen = extension?.lastSeenAt;
  const fresh = !!extension?.fresh;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900"
    >
      <span className={`h-2 w-2 rounded-full ${!connected ? 'bg-neutral-400' : fresh ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      {!connected ? 'Extension not connected' : lastSeen ? `Last heard ${clock(lastSeen)}` : 'Connected — waiting'}
      <span className="text-neutral-400">· Privacy</span>
    </button>
  );
}

function DateNav({ date, isToday, onChange }: { date: string; isToday: boolean; onChange: (d: string) => void }) {
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(shiftDate(date, -1))} className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-200/60 dark:hover:bg-neutral-800" aria-label="Previous day">‹</button>
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">{isToday ? 'Today' : label}</h1>
      {isToday && <span className="text-sm text-neutral-500">{label}</span>}
      <button
        onClick={() => onChange(shiftDate(date, 1))}
        disabled={isToday}
        className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-200/60 disabled:opacity-30 dark:hover:bg-neutral-800"
        aria-label="Next day"
      >›</button>
      {!isToday && (
        <button onClick={() => onChange(toDateString(new Date()))} className="ml-auto text-xs text-violet-600 hover:underline dark:text-violet-400">
          Back to today
        </button>
      )}
    </div>
  );
}

function Intention({ date, value, onSaved }: { date: string; value: string; onSaved: () => void }) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (text.trim() === value.trim()) return;
    setSaving(true);
    const { from, to } = dayBounds(date);
    await fetch('/api/kanwatch/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, intention: text, from, to }),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <section>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
        This day is for
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="e.g. Ship the billing fixes and answer support"
        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      />
      <p className="mt-1.5 text-xs text-neutral-500">
        {saving ? 'Saving — the day will be re-read against it…' : 'Focus is measured against this. Without it, Kanwatch only says where time went.'}
      </p>
    </section>
  );
}

function Summary({ data }: { data: DayData }) {
  const stats = useMemo(() => {
    let active = 0;
    let privateTime = 0;
    let notWork = 0;
    let focusWeighted = 0;
    let focusSeconds = 0;
    for (const e of data.episodes) {
      active += e.activeSeconds;
      privateTime += e.privateSeconds;
      const r = readEpisode(e);
      if (r.bucket === 'not_work') notWork += e.activeSeconds;
      if (e.focusScore !== null && r.bucket !== 'private') {
        focusWeighted += e.focusScore * e.activeSeconds;
        focusSeconds += e.activeSeconds;
      }
    }
    return {
      active,
      privateTime,
      workShare: active > 0 ? Math.round(((active - notWork - privateTime) / active) * 100) : null,
      focus: focusSeconds > 0 ? Math.round(focusWeighted / focusSeconds) : null,
    };
  }, [data.episodes]);

  const tiles = [
    { label: 'Active in the browser', value: duration(stats.active) },
    { label: 'On work', value: stats.workShare === null ? '—' : `${Math.max(0, stats.workShare)}%` },
    { label: 'On what the day was for', value: stats.focus === null ? '—' : `${stats.focus}%`, hint: stats.focus === null ? 'Set what the day is for' : undefined },
    { label: 'Private', value: duration(stats.privateTime), hint: 'Time only — never what' },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-neutral-200 bg-white px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-[11px] text-neutral-500">{t.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{t.value}</div>
          {t.hint && <div className="mt-0.5 text-[11px] text-neutral-400">{t.hint}</div>}
        </div>
      ))}
    </section>
  );
}

function Week({ week, date, onPick }: { week: DayData['week']; date: string; onPick: (d: string) => void }) {
  const max = Math.max(1, ...week.map((w) => w.activeSeconds));
  return (
    <section>
      <SectionTitle>The week</SectionTitle>
      <div className="flex h-24 items-end gap-2">
        {week.map((w) => {
          const d = toDateString(new Date(w.start));
          const selected = d === date;
          const workSeconds = Math.max(0, w.activeSeconds - w.notWorkSeconds - w.privateSeconds);
          return (
            <button key={w.start} onClick={() => onPick(d)} className="group flex flex-1 flex-col items-center gap-1" title={`${duration(w.activeSeconds)} active`}>
              <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-900">
                <div style={{ height: `${(w.privateSeconds / max) * 100}%`, background: PRIVATE }} />
                <div style={{ height: `${(w.notWorkSeconds / max) * 100}%`, background: NOT_WORK }} />
                <div className={selected ? 'bg-violet-500' : 'bg-violet-400/60 group-hover:bg-violet-400'} style={{ height: `${(workSeconds / max) * 100}%` }} />
              </div>
              <span className={`text-[11px] ${selected ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-500'}`}>
                {new Date(w.start).toLocaleDateString([], { weekday: 'short' })}
              </span>
            </button>
          );
        })}
      </div>
      <Legend items={[['Work', '#8b5cf6'], ['Not work', NOT_WORK], ['Private', PRIVATE]]} />
    </section>
  );
}

function Timeline({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) {
    return (
      <section>
        <SectionTitle>Timeline</SectionTitle>
        <p className="text-sm text-neutral-500">Nothing recorded yet for this day.</p>
      </section>
    );
  }
  const start = Math.min(...episodes.map((e) => e.startedAt));
  const end = Math.max(...episodes.map((e) => e.endedAt));
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  const last = new Date(end);
  last.setHours(last.getHours() + 1, 0, 0, 0);
  const span = last.getTime() - first.getTime();
  const hours: number[] = [];
  for (let t = first.getTime(); t <= last.getTime(); t += 3600000) hours.push(t);

  return (
    <section>
      <SectionTitle>Timeline</SectionTitle>
      <div className="relative h-10 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
        {episodes.map((e) => {
          const r = readEpisode(e);
          const left = ((e.startedAt - first.getTime()) / span) * 100;
          const width = Math.max(0.4, ((e.endedAt - e.startedAt) / span) * 100);
          return (
            <a
              key={e.id}
              href={`#ep-${e.id}`}
              title={`${clock(e.startedAt)}–${clock(e.endedAt)} · ${r.label} · ${duration(e.activeSeconds)}`}
              className="absolute inset-y-1 rounded-[3px] transition-opacity hover:opacity-80"
              style={{ left: `${left}%`, width: `${width}%`, background: r.color, opacity: r.decided ? 1 : 0.7 }}
            />
          );
        })}
      </div>
      <div className="relative mt-1 h-4">
        {hours.map((t, i) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 text-[10px] text-neutral-400"
            style={{ left: `${((t - first.getTime()) / span) * 100}%`, display: hours.length > 12 && i % 2 ? 'none' : undefined }}
          >
            {new Date(t).toLocaleTimeString([], { hour: 'numeric' })}
          </span>
        ))}
      </div>
    </section>
  );
}

function WhereItWent({ episodes }: { episodes: Episode[] }) {
  const { buckets, modes, total } = useMemo(() => {
    const b = new Map<string, { label: string; color: string; seconds: number }>();
    const m = new Map<string, number>();
    let t = 0;
    for (const e of episodes) {
      const r = readEpisode(e);
      const publicSeconds = e.activeSeconds - e.privateSeconds;
      if (e.privateSeconds > 0) {
        const p = b.get('private') ?? { label: 'Private', color: PRIVATE, seconds: 0 };
        p.seconds += e.privateSeconds;
        b.set('private', p);
      }
      if (publicSeconds > 0 && r.bucket !== 'private') {
        // Group by channel, not by card, so the bars read as areas of work.
        const label = r.label.split(' › ')[0];
        const cur = b.get(r.bucket) ?? { label, color: r.color, seconds: 0 };
        cur.seconds += publicSeconds;
        b.set(r.bucket, cur);
        if (e.mode) m.set(e.mode, (m.get(e.mode) ?? 0) + publicSeconds);
      }
      t += e.activeSeconds;
    }
    return {
      buckets: [...b.values()].sort((x, y) => y.seconds - x.seconds),
      modes: [...m.entries()].sort((x, y) => y[1] - x[1]),
      total: t,
    };
  }, [episodes]);

  if (total === 0) return null;
  return (
    <section className="grid gap-6 sm:grid-cols-[1.4fr_1fr]">
      <div>
        <SectionTitle>Where the time went</SectionTitle>
        <div className="space-y-2">
          {buckets.map((b) => (
            <div key={b.label + b.color}>
              <div className="flex justify-between text-sm">
                <span className="truncate text-neutral-800 dark:text-neutral-200">{b.label}</span>
                <span className="tabular-nums text-neutral-500">{duration(b.seconds)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                <div className="h-full rounded-full" style={{ width: `${(b.seconds / total) * 100}%`, background: b.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {modes.length > 0 && (
        <div>
          <SectionTitle>What kind of work</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {modes.map(([mode, seconds]) => (
              <span key={mode} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
                {MODE_LABELS[mode] ?? mode} <span className="tabular-nums text-neutral-400">{duration(seconds)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function needsYou(e: Episode): boolean {
  if (e.verdict || e.status !== 'judged') return false;
  if (e.pages.length === 0) return false;
  const r = readEpisode(e);
  return r.bucket === 'unclear' || r.bucket === 'new_work' || (e.guess?.probability ?? 0) < 60;
}

function Episodes({
  episodes, channels, onlyNeedsYou, setOnlyNeedsYou, onChanged,
}: {
  episodes: Episode[];
  channels: DayData['channels'];
  onlyNeedsYou: boolean;
  setOnlyNeedsYou: (v: boolean) => void;
  onChanged: () => void;
}) {
  const pending = episodes.filter(needsYou).length;
  const shown = (onlyNeedsYou ? episodes.filter(needsYou) : episodes).slice().reverse();
  if (episodes.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <SectionTitle className="mb-0">The day, piece by piece</SectionTitle>
        {pending > 0 && (
          <button
            onClick={() => setOnlyNeedsYou(!onlyNeedsYou)}
            className={`ml-auto rounded-full px-2.5 py-1 text-xs ${onlyNeedsYou ? 'bg-violet-600 text-white' : 'bg-violet-500/10 text-violet-700 dark:text-violet-300'}`}
          >
            {onlyNeedsYou ? 'Show all' : `${pending} Kan isn't sure about`}
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Tell Kan when it&rsquo;s right or wrong. Each answer becomes an example it uses to read the next stretch.
      </p>
      <div className="space-y-2">
        {shown.map((e) => (
          <EpisodeRow key={e.id} episode={e} channels={channels} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function EpisodeRow({ episode: e, channels, onChanged }: { episode: Episode; channels: DayData['channels']; onChanged: () => void }) {
  const r = readEpisode(e);
  const [editing, setEditing] = useState(false);
  const [channelId, setChannelId] = useState(e.verdictChannelId ?? e.guess?.channelId ?? '');
  const [label, setLabel] = useState(e.label ?? '');
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    await fetch(`/api/kanwatch/episodes/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditing(false);
    onChanged();
  };

  const onlyPrivate = e.pages.length === 0;

  return (
    <div id={`ep-${e.id}`} className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: r.color }} />
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.label}</span>
        {!r.decided && r.bucket !== 'unread' && e.guess?.probability != null && (
          <span className="text-[11px] text-neutral-400">Kan&rsquo;s guess · {e.guess.probability}% sure</span>
        )}
        {r.decided && e.verdict && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">You said</span>}
        {e.mode && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">{MODE_LABELS[e.mode] ?? e.mode}</span>}
        {e.focusScore !== null && !onlyPrivate && (
          <span className="text-[11px] text-neutral-400">{e.focusScore >= 67 ? 'On plan' : e.focusScore >= 34 ? 'Near the plan' : 'Off plan'}</span>
        )}
        <span className="ml-auto text-xs tabular-nums text-neutral-500">
          {clock(e.startedAt)}–{clock(e.endedAt)} · {duration(e.activeSeconds)}
        </span>
      </div>

      {e.pages.length > 0 && (
        <ul className="mt-2.5 space-y-1 pl-5">
          {e.pages.map((p, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
                <span className="text-neutral-400">{p.site}</span>
                {' · '}
                {p.search ? <>searched <em>&ldquo;{p.search}&rdquo;</em></> : p.title || p.heading || p.path}
              </span>
              <span className="flex-shrink-0 text-[11px] text-neutral-400">{p.doing} · {duration(p.seconds)}</span>
            </li>
          ))}
        </ul>
      )}
      {e.privateSeconds > 0 && (
        <p className="mt-1.5 pl-5 text-[11px] text-neutral-400">+ {duration(e.privateSeconds)} private (nothing recorded but the time)</p>
      )}

      {!onlyPrivate && e.status === 'judged' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-5">
          {!e.verdict && r.bucket !== 'unclear' && r.bucket !== 'new_work' && (
            <SmallButton disabled={busy} onClick={() => send({ verdict: r.bucket === 'not_work' ? 'not_work' : 'confirmed' })}>✓ Right</SmallButton>
          )}
          <SmallButton disabled={busy} onClick={() => setEditing(!editing)}>{e.verdict ? 'Change' : 'It was…'}</SmallButton>
          {e.verdict !== 'not_work' && <SmallButton disabled={busy} onClick={() => send({ verdict: 'not_work', label })}>Not work</SmallButton>}
          {e.verdict && <SmallButton disabled={busy} onClick={() => send({ verdict: null })}>Undo</SmallButton>}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-5">
          <select
            value={channelId}
            onChange={(ev) => setChannelId(ev.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="">No channel</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={label}
            onChange={(ev) => setLabel(ev.target.value)}
            placeholder="In your words (optional)"
            className="min-w-[12rem] flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
          <SmallButton primary disabled={busy || (!channelId && !label.trim())} onClick={() => send({ verdict: 'corrected', channelId: channelId || undefined, label })}>
            Save
          </SmallButton>
        </div>
      )}
    </div>
  );
}

function Sites({ sites, onChanged }: { sites: Site[]; onChanged: () => void }) {
  if (sites.length === 0) return null;
  const notes = sites.flatMap((s) => {
    if (s.want === 'less' && s.seconds >= 20 * 60) return [`${duration(s.seconds)} on ${s.domain}, which you wanted less of.`];
    if (s.want === 'more' && s.seconds >= 10 * 60) return [`${duration(s.seconds)} on ${s.domain} — the kind of time you wanted more of.`];
    return [];
  });
  return (
    <section>
      <SectionTitle>Sites</SectionTitle>
      <p className="mb-3 text-xs text-neutral-500">
        Say what a site is for and whether you want more or less of it. Kan reads future visits with that in mind.
      </p>
      {notes.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg bg-violet-500/5 px-3 py-2 text-[13px] text-neutral-700 dark:text-neutral-300">
          {notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}
      <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        {sites.map((s) => <SiteRow key={`${s.domain}:${s.purpose}`} site={s} onChanged={onChanged} />)}
      </div>
    </section>
  );
}

function SiteRow({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const [purpose, setPurpose] = useState(site.purpose);

  const save = async (patch: Record<string, unknown>) => {
    await fetch('/api/kanwatch/sites', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: site.domain, ...patch }),
    });
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <div className="w-40 min-w-0">
        <div className="truncate text-sm text-neutral-800 dark:text-neutral-200">{site.domain}</div>
        <div className="text-[11px] tabular-nums text-neutral-400">{duration(site.seconds)}</div>
      </div>
      <input
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onBlur={() => purpose !== site.purpose && save({ purpose })}
        placeholder="What is it for you?"
        className="min-w-[10rem] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-neutral-700 hover:border-neutral-200 focus:border-neutral-300 focus:outline-none dark:text-neutral-300 dark:hover:border-neutral-700"
      />
      <div className="flex overflow-hidden rounded-md border border-neutral-200 text-[11px] dark:border-neutral-700">
        {(['less', 'right', 'more'] as const).map((w) => (
          <button
            key={w}
            onClick={() => save({ want: site.want === w ? null : w })}
            className={`px-2 py-1 ${site.want === w ? 'bg-violet-600 text-white' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}
          >
            {w === 'less' ? 'Less' : w === 'right' ? 'About right' : 'More'}
          </button>
        ))}
      </div>
    </div>
  );
}

function SetupPanel({ connected, date, onChanged, onClose }: { connected: boolean; date: string; onChanged: () => void; onClose?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    const res = await fetch('/api/kanwatch/token', { method: 'POST' });
    const body = await res.json();
    setToken(body.token ?? null);
    setBusy(false);
    onChanged();
  };
  const disconnect = async () => {
    await fetch('/api/kanwatch/token', { method: 'DELETE' });
    setToken(null);
    onChanged();
  };
  const deleteDay = async () => {
    const { from, to } = dayBounds(date);
    await fetch(`/api/kanwatch/data?from=${from}&to=${to}`, { method: 'DELETE' });
    onChanged();
  };
  const deleteAll = async () => {
    await fetch('/api/kanwatch/data', { method: 'DELETE' });
    setConfirmAll(false);
    onChanged();
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">Privacy &amp; connection</h2>
        {onClose && <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">Close</button>}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Recorded</div>
          <ul className="space-y-1 text-[13px] text-neutral-600 dark:text-neutral-400">
            <li>Site and page path, with ids and query strings removed</li>
            <li>Page title and first heading, with emails, numbers and tokens masked</li>
            <li>What you searched for on search engines (can be switched off)</li>
            <li>Time on the page, and counts of keys, clicks, scrolling and video</li>
          </ul>
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-red-500">Never recorded</div>
          <ul className="space-y-1 text-[13px] text-neutral-600 dark:text-neutral-400">
            <li>What you type, form contents, passwords, page text, screenshots</li>
            <li>Banking, payments, tax, government, health, insurance, email and password sites — time only</li>
            <li>Any sign-in, checkout, payment or account-security page — time only</li>
            <li>Incognito windows, and anything while paused</li>
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Raw page records are deleted after 30 days. The stretches of your day are read by Jev (TypeSafe) using only the masked fields above. You can make any site private from the extension.
      </p>

      <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        {token ? (
          <div className="space-y-2">
            <p className="text-[13px] text-neutral-700 dark:text-neutral-300">Paste this key into the Kanwatch extension. It&rsquo;s shown once; connecting again replaces it.</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-neutral-100 px-2 py-1.5 text-xs dark:bg-neutral-950">{token}</code>
              <SmallButton primary onClick={async () => { await navigator.clipboard.writeText(token); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</SmallButton>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-[13px] text-neutral-700 dark:text-neutral-300">
            <p>
              <strong>Install:</strong> in Chrome open <code className="text-xs">chrome://extensions</code>, turn on Developer mode, choose <em>Load unpacked</em>, and pick the <code className="text-xs">extensions/kanwatch</code> folder from the Kanthink repo.
            </p>
            <div className="flex flex-wrap gap-2">
              <SmallButton primary disabled={busy} onClick={connect}>{connected ? 'Replace the extension key' : 'Connect extension'}</SmallButton>
              {connected && <SmallButton onClick={disconnect}>Disconnect</SmallButton>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <SmallButton onClick={deleteDay}>Delete this day</SmallButton>
        {confirmAll ? (
          <>
            <span className="text-xs text-red-500">Delete every day, intention and site note?</span>
            <SmallButton danger onClick={deleteAll}>Yes, delete everything</SmallButton>
            <SmallButton onClick={() => setConfirmAll(false)}>Keep it</SmallButton>
          </>
        ) : (
          <SmallButton danger onClick={() => setConfirmAll(true)}>Delete everything</SmallButton>
        )}
      </div>
    </section>
  );
}

// ---- small pieces ----------------------------------------------------------------

function SectionTitle({ children, className = 'mb-3' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`${className} font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500`}>
      {children}
    </h2>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex gap-4 text-[11px] text-neutral-500">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function SmallButton({
  children, onClick, disabled, primary, danger,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
        primary
          ? 'bg-violet-600 text-white hover:bg-violet-500'
          : danger
            ? 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30'
            : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}
