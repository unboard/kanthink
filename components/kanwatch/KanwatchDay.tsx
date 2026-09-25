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

interface ServerReading {
  key: string;
  label: string;
  folder: string | null;
  channelName: string | null;
  decided: boolean;
  probability: number | null;
}

interface SessionData {
  id: string;
  episodeIds: string[];
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  privateSeconds: number;
  reading: ServerReading;
  modes: { mode: string; seconds: number; yours: boolean }[];
  live: boolean;
  answered: boolean;
  focusScore: number | null;
  pages: Page[];
  basis: { notes: string[]; pastAnswers: number } | null;
}

interface DayStory {
  headline: string;
  threads: { title: string; detail: string }[];
  looseEnds: string[];
  sessions: Record<string, string>;
  writtenAt: number;
  stale?: boolean;
}

interface Episode {
  id: string;
  /** What it was for, as the server reads it: Folder / Channel › Card, your words, or a state. */
  reading: ServerReading;
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
    /** guess kind 'area': one of the areas you named yourself */
    label: string | null;
  } | null;
  /** What you were doing — yours if you set it, Jev's read otherwise. */
  mode: string | null;
  modeIsYours: boolean;
  focusScore: number | null;
  worthCard: number | null;
  verdict: 'confirmed' | 'corrected' | 'not_work' | null;
  verdictChannelId: string | null;
  verdictChannelName: string | null;
  verdictCardTitle: string | null;
  label: string | null;
  /** Still in progress: this is a live read, and it will be read again when it ends. */
  live: boolean;
  /** What the read drew on: your site notes, and how many past answers about these sites. */
  basis: { notes: string[]; pastAnswers: number } | null;
  pages: Page[];
}

interface Site {
  domain: string;
  seconds: number;
  want: 'more' | 'right' | 'less' | null;
  purpose: string;
  /** Kan's read on the site from today's episodes, when you haven't described it. */
  kanThinks: string | null;
}

interface DayData {
  date: string;
  intention: string;
  extension: { connected: boolean; lastSeenAt?: number | null; fresh?: boolean };
  channels: { id: string; name: string; folder: string | null }[];
  /** Areas you've named before, in your own words. */
  areas: string[];
  sessions: SessionData[];
  episodes: Episode[];
  sites: Site[];
  week: { start: number; activeSeconds: number; notWorkSeconds: number; privateSeconds: number }[];
  reads: {
    counts: Record<string, number>;
    total: number;
    worthALook: WorthRead[];
    others: { id: string; url: string; domain: string | null; title: string | null; category: string | null; seconds: number; status: string }[];
  };
}

interface WorthRead {
  id: string;
  url: string;
  domain: string | null;
  title: string | null;
  kind: string | null;
  seconds: number;
  category: string | null;
  tldr: string | null;
  why: string | null;
  nudge: string | null;
  nudgeKind: 'kanthink' | 'app' | 'revisit' | 'reflect' | null;
  verdict: 'saved' | 'dismissed' | null;
  reflection: string | null;
  cardId: string | null;
  manual: boolean | null;
  scores: { worth: number | null; kanthink: number | null; app: number | null };
  /** An existing app this idea would fit into, if Jev thinks so. */
  relatedApp: { id: string; title: string } | null;
  /** The app built from this page, once you've asked for one. */
  builtApp: { id: string; title: string; channelId: string; cardId: string; ready: boolean } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  work_learning: 'work learning',
  general_learning: 'learning',
  reference: 'reference',
  news: 'news',
  entertainment: 'entertainment',
  social_chatter: 'social chatter',
  shopping: 'shopping',
  reading: 'still reading',
  other: 'other',
};

const NUDGE_LABELS: Record<string, string> = {
  kanthink: 'For Kanthink?',
  app: 'An app?',
  revisit: 'Worth coming back to',
  reflect: 'What did you think?',
};

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

// ---- what a stretch was for ----------------------------------------------------

interface Reading {
  bucket: string;
  label: string;
  color: string;
  decided: boolean;
  folder: string | null;
  channelName: string | null;
  probability: number | null;
}

function colorOf(key: string): string {
  if (key === 'not_work') return NOT_WORK;
  if (key === 'private') return PRIVATE;
  if (key === 'unread' || key === 'unclear') return UNCLEAR;
  if (key === 'new_work') return '#a78bfa';
  return colorFor(key);
}

function toReading(r: ServerReading): Reading {
  return {
    bucket: r.key, label: r.label, color: colorOf(r.key), decided: r.decided,
    folder: r.folder, channelName: r.channelName, probability: r.probability,
  };
}

function readEpisode(e: Episode): Reading {
  return toReading(e.reading);
}

// ---- page ------------------------------------------------------------------------

export function KanwatchDay() {
  const router = useRouter();
  const [date, setDate] = useState(() => toDateString(new Date()));
  const [data, setData] = useState<DayData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [showSetup, setShowSetup] = useState(false);
  const [onlyNeedsYou, setOnlyNeedsYou] = useState(false);
  const [story, setStory] = useState<DayStory | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);

  // The story is fetched on its own: the day's numbers never wait on an LLM.
  const loadStory = useCallback(async (d: string, refresh = false) => {
    const { from, to } = dayBounds(d);
    setStoryLoading(true);
    try {
      const res = await fetch(`/api/kanwatch/story?date=${d}&from=${from}&to=${to}${refresh ? '&refresh=1' : ''}`);
      const body = res.ok ? await res.json() : null;
      setStory(body?.story ?? null);
    } catch {
      /* the story is a nicety; the day works without it */
    } finally {
      setStoryLoading(false);
    }
  }, []);

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
    setStory(null);
    setDate(d);
  };

  useEffect(() => {
    // Fetching the day is syncing with the server; state is only set once it answers.
    load(date);
    loadStory(date);
  }, [date, load, loadStory]);

  // A notification links to /kanwatch#read-…; the page renders after the data arrives,
  // so scroll to it once it is there.
  useEffect(() => {
    if (!data || typeof window === 'undefined' || !window.location.hash.startsWith('#read-')) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [data]);

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
            <DayStoryCard story={story} loading={storyLoading} onRefresh={() => loadStory(date, true)} />
            {/* Keyed so a new day or a saved value resets the field. */}
            <Intention key={`${date}:${data.intention}`} date={date} value={data.intention} onSaved={() => { load(date); loadStory(date, true); }} />
            <Summary data={data} />
            <Timeline episodes={data.episodes} />
            <WhereItWent episodes={data.episodes} />
            <WorthALook reads={data.reads} channels={data.channels} onChanged={() => load(date)} />
            <Sessions
              sessions={data.sessions ?? []}
              story={story}
              channels={data.channels}
              areas={data.areas ?? []}
              onlyNeedsYou={onlyNeedsYou}
              setOnlyNeedsYou={setOnlyNeedsYou}
              onChanged={() => load(date)}
            />
            <Week week={data.week} date={date} onPick={changeDate} />
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
    <section className="flex items-center gap-3">
      <label htmlFor="kw-intention" className="flex-shrink-0 text-[13px] text-neutral-500">This day is for</label>
      <input
        id="kw-intention"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="say what you meant to do, and focus is measured against it"
        className="min-w-0 flex-1 border-b border-neutral-200 bg-transparent px-1 py-1 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:border-violet-500 focus:outline-none dark:border-neutral-800 dark:text-neutral-100"
      />
      {saving && <span className="text-[11px] text-neutral-400">re-reading…</span>}
    </section>
  );
}

function Summary({ data }: { data: DayData }) {
  const stats = useMemo(() => {
    let active = 0;
    let read = 0;
    let privateTime = 0;
    let notWork = 0;
    let focusWeighted = 0;
    let focusSeconds = 0;
    for (const e of data.episodes) {
      active += e.activeSeconds;
      privateTime += e.privateSeconds;
      const r = readEpisode(e);
      if (r.bucket !== 'unread') read += e.activeSeconds;
      if (r.bucket === 'not_work') notWork += e.activeSeconds;
      if (e.focusScore !== null && r.bucket !== 'private') {
        focusWeighted += e.focusScore * e.activeSeconds;
        focusSeconds += e.activeSeconds;
      }
    }
    return {
      active,
      privateTime,
      // Only what Kan has read counts either way; unread time is not assumed to be work.
      workShare: read > 0 ? Math.round(((read - notWork - privateTime) / read) * 100) : null,
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
  const { groups, modes, total } = useMemo(() => {
    const items = new Map<string, { key: string; label: string; short: string; folder: string | null; color: string; seconds: number }>();
    const m = new Map<string, number>();
    let t = 0;
    for (const e of episodes) {
      const r = readEpisode(e);
      const pub = e.activeSeconds - e.privateSeconds;
      if (e.privateSeconds > 0) {
        const p = items.get('private') ?? { key: 'private', label: 'Private', short: 'Private', folder: null, color: PRIVATE, seconds: 0 };
        p.seconds += e.privateSeconds;
        items.set('private', p);
      }
      if (pub > 0 && r.bucket !== 'private') {
        // By channel, not card: the bars read as areas of work.
        const label = r.label.split(' › ')[0];
        const cur = items.get(r.bucket) ?? { key: r.bucket, label, short: r.channelName ?? label, folder: r.folder, color: r.color, seconds: 0 };
        cur.seconds += pub;
        items.set(r.bucket, cur);
        if (e.mode) m.set(e.mode, (m.get(e.mode) ?? 0) + pub);
      }
      t += e.activeSeconds;
    }
    // Channels in a folder roll up under it, as in the sidebar. A folder with a single
    // channel is one line — "MyCreativeShop / Work" — not a header over "Work".
    const grouped = new Map<string, { folder: string | null; seconds: number; items: (typeof items extends Map<string, infer V> ? V : never)[] }>();
    for (const item of items.values()) {
      const key = item.folder ? `folder:${item.folder}` : `item:${item.key}`;
      const g = grouped.get(key) ?? { folder: item.folder, seconds: 0, items: [] };
      g.seconds += item.seconds;
      g.items.push(item);
      grouped.set(key, g);
    }
    for (const g of grouped.values()) g.items.sort((x, y) => y.seconds - x.seconds);
    return {
      groups: [...grouped.values()].sort((x, y) => y.seconds - x.seconds),
      modes: [...m.entries()].sort((x, y) => y[1] - x[1]),
      total: t,
    };
  }, [episodes]);

  if (total === 0) return null;

  const bar = (seconds: number, color: string) => (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
      <div className="h-full rounded-full" style={{ width: `${(seconds / total) * 100}%`, background: color }} />
    </div>
  );

  return (
    <section className="grid gap-8 sm:grid-cols-[1.5fr_1fr]">
      <div>
        <SectionTitle>What it was for</SectionTitle>
        <div className="space-y-3">
          {groups.map((g) => {
            if (!g.folder || g.items.length === 1) {
              return g.items.map((b) => (
                <div key={b.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate text-neutral-800 dark:text-neutral-200">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: b.color }} />
                      {b.label}
                    </span>
                    <span className="tabular-nums text-neutral-500">{duration(b.seconds)}</span>
                  </div>
                  {bar(b.seconds, b.color)}
                </div>
              ));
            }
            return (
              <div key={`folder:${g.folder}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{g.folder}</span>
                  <span className="tabular-nums text-neutral-500">{duration(g.seconds)}</span>
                </div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                  {g.items.map((b) => <div key={b.key} className="h-full" style={{ width: `${(b.seconds / total) * 100}%`, background: b.color }} />)}
                </div>
                <div className="mt-1.5 space-y-0.5 pl-3">
                  {g.items.map((b) => (
                    <div key={b.key} className="flex items-center justify-between text-[13px]">
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-neutral-600 dark:text-neutral-400">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: b.color }} />
                        {b.short}
                      </span>
                      <span className="tabular-nums text-neutral-400">{duration(b.seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {modes.length > 0 && (
        <div>
          <SectionTitle>What you were doing</SectionTitle>
          <div className="space-y-2">
            {modes.map(([mode, seconds]) => (
              <div key={mode} className="flex items-center gap-3 text-[13px]">
                <span className="w-28 flex-shrink-0 text-neutral-700 dark:text-neutral-300">{MODE_LABELS[mode] ?? mode}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                  <div className="h-full rounded-full bg-neutral-400 dark:bg-neutral-600" style={{ width: `${(seconds / modes[0][1]) * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums text-neutral-400">{duration(seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function needsYou(s: SessionData): boolean {
  if (s.answered || s.reading.decided || s.pages.length === 0) return false;
  return s.reading.key === 'unclear' || s.reading.key === 'new_work' || s.reading.key === 'unread' || (s.reading.probability ?? 0) < 60;
}

function Sessions({
  sessions, story, channels, areas, onlyNeedsYou, setOnlyNeedsYou, onChanged,
}: {
  sessions: SessionData[];
  story: DayStory | null;
  channels: DayData['channels'];
  areas: string[];
  onlyNeedsYou: boolean;
  setOnlyNeedsYou: (v: boolean) => void;
  onChanged: () => void;
}) {
  if (sessions.length === 0) return null;
  const pending = sessions.filter(needsYou).length;
  const shown = (onlyNeedsYou ? sessions.filter(needsYou) : sessions).slice().reverse();

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <SectionTitle className="mb-0">Your day, session by session</SectionTitle>
        {pending > 0 && (
          <button
            onClick={() => setOnlyNeedsYou(!onlyNeedsYou)}
            className={`ml-auto rounded-full px-2.5 py-1 text-xs ${onlyNeedsYou ? 'bg-violet-600 text-white' : 'bg-violet-500/10 text-violet-700 dark:text-violet-300'}`}
          >
            {onlyNeedsYou ? 'Show all' : `${pending} Kan isn’t sure about`}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {shown.map((s) => (
          <SessionRow key={s.id} session={s} summary={story?.sessions[s.id] ?? null} channels={channels} areas={areas} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function SessionRow({
  session: s, summary, channels, areas, onChanged,
}: {
  session: SessionData;
  summary: string | null;
  channels: DayData['channels'];
  areas: string[];
  onChanged: () => void;
}) {
  const r = toReading(s.reading);
  const [editing, setEditing] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [label, setLabel] = useState(r.bucket.startsWith('label:') ? r.label : '');
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const onlyPrivate = s.pages.length === 0;
  const topMode = s.modes[0];

  // A session is several stretches; an answer about it is an answer about each.
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    await Promise.all(s.episodeIds.map((id) => fetch(`/api/kanwatch/episodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })));
    setBusy(false);
    setEditing(false);
    onChanged();
  };

  return (
    <div id={`ep-${s.id}`} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: r.color }} />
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.label}</span>
        {s.answered && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">you said</span>}
        {!s.answered && !r.decided && r.probability !== null && (
          <span className="text-[11px] text-neutral-400">Kan · {r.probability}%</span>
        )}
        {s.live && (
          <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" /> now
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-neutral-500">
          {clock(s.startedAt)}–{clock(s.endedAt)} · {duration(s.activeSeconds)}
        </span>
      </div>

      {summary && <p className="mt-1.5 pl-5 text-[14px] leading-snug text-neutral-800 dark:text-neutral-200">{summary}</p>}

      {!onlyPrivate && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-5 text-[11px] text-neutral-500">
          {topMode && (
            <label className="inline-flex items-center gap-1" title="What you were doing — change it without changing what it was for">
              <select
                value={topMode.mode}
                disabled={busy}
                onChange={(ev) => send({ mode: ev.target.value })}
                className={`cursor-pointer appearance-none rounded-full px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  topMode.yours
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          )}
          {s.modes.slice(1, 3).map((m) => <span key={m.mode}>+ {MODE_LABELS[m.mode]?.toLowerCase() ?? m.mode}</span>)}
          {s.focusScore !== null && (
            <span>· {s.focusScore >= 67 ? 'on plan' : s.focusScore >= 34 ? 'near the plan' : 'off plan'}</span>
          )}
          {s.privateSeconds > 0 && <span>· {duration(s.privateSeconds)} private</span>}
          <button onClick={() => setShowPages(!showPages)} className="ml-1 text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline dark:hover:text-neutral-200">
            {showPages ? 'hide pages' : `${s.pages.length} ${s.pages.length === 1 ? 'page' : 'pages'}`}
          </button>
          {!s.answered && s.reading.probability !== null && (
            <span className="ml-auto flex gap-1.5">
              {!r.decided && r.bucket !== 'unclear' && r.bucket !== 'new_work' && r.bucket !== 'unread' && (
                <SmallButton disabled={busy} onClick={() => send({ verdict: r.bucket === 'not_work' ? 'not_work' : 'confirmed' })}>✓ Right</SmallButton>
              )}
              <SmallButton disabled={busy} onClick={() => setEditing(!editing)}>It was…</SmallButton>
              {r.bucket !== 'not_work' && <SmallButton disabled={busy} onClick={() => send({ verdict: 'not_work' })}>Not work</SmallButton>}
            </span>
          )}
          {s.answered && (
            <span className="ml-auto flex gap-1.5">
              <SmallButton disabled={busy} onClick={() => setEditing(!editing)}>Change</SmallButton>
              <SmallButton disabled={busy} onClick={() => send({ verdict: null })}>Undo</SmallButton>
            </span>
          )}
        </div>
      )}

      {showPages && (
        <ul className="mt-2 space-y-1 border-t border-neutral-100 pl-5 pt-2 dark:border-neutral-800">
          {s.pages.map((p, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
                <span className="text-neutral-400">{p.site}</span>
                {' · '}
                {p.search ? <>searched <em>&ldquo;{p.search}&rdquo;</em></> : p.title || p.heading || p.path}
              </span>
              <span className="flex-shrink-0 text-[11px] text-neutral-400">{p.doing} · {duration(p.seconds)}</span>
            </li>
          ))}
          {s.basis && (s.basis.notes.length > 0 || s.basis.pastAnswers > 0) && !s.answered && (
            <li className="pt-1 text-[11px] text-neutral-400">
              Kan read this using {[
                s.basis.notes.length > 0 ? `your note on ${s.basis.notes.join(', ')}` : '',
                s.basis.pastAnswers > 0 ? `${s.basis.pastAnswers} earlier ${s.basis.pastAnswers === 1 ? 'answer' : 'answers'} about these sites` : '',
              ].filter(Boolean).join(' and ')}.
            </li>
          )}
        </ul>
      )}

      {editing && (
        <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-[11px] uppercase tracking-wide text-neutral-400">For</span>
            <select
              value={channelId}
              onChange={(ev) => setChannelId(ev.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">Pick a channel…</option>
              <ChannelOptions channels={channels} />
            </select>
            <span className="text-[11px] text-neutral-400">or</span>
            <input
              list={`areas-${s.id}`}
              value={label}
              onChange={(ev) => setLabel(ev.target.value)}
              placeholder="your own words"
              className="min-w-[12rem] flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            <datalist id={`areas-${s.id}`}>{areas.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-[11px] uppercase tracking-wide text-neutral-400">Doing</span>
            <select
              value={mode}
              onChange={(ev) => setMode(ev.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">Leave as it is</option>
              {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <SmallButton
              primary
              disabled={busy || (!channelId && !label.trim())}
              onClick={() => send({ verdict: 'corrected', channelId: channelId || undefined, label, ...(mode ? { mode } : {}) })}
            >
              Save
            </SmallButton>
            <span className="text-[11px] text-neutral-400">Names you give here become choices Kan can pick next time.</span>
          </div>
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
        What each site is for, and whether you want more or less of it. Where you haven&rsquo;t said, Kan&rsquo;s read is shown — confirm it or write your own, and today&rsquo;s other visits are re-read with it.
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
        placeholder={site.kanThinks ? `Kan thinks: ${site.kanThinks}` : 'What is it for you?'}
        className="min-w-[10rem] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-neutral-700 hover:border-neutral-200 focus:border-neutral-300 focus:outline-none dark:text-neutral-300 dark:hover:border-neutral-700"
      />
      {!site.purpose && site.kanThinks && (
        <button
          onClick={() => save({ purpose: site.kanThinks })}
          className="rounded-md px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
          title="Keep Kan's read as your note for this site"
        >
          ✓ Right
        </button>
      )}
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

/** Channel options grouped under your folders, the way the sidebar shows them. */
function ChannelOptions({ channels }: { channels: DayData['channels'] }) {
  const groups = new Map<string, DayData['channels']>();
  for (const c of channels) {
    const key = c.folder ?? '';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const named = [...groups.entries()].filter(([f]) => f).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <>
      {named.map(([folder, list]) => (
        <optgroup key={folder} label={folder}>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
      {(groups.get('') ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );
}

// ---- the day story ----------------------------------------------------------------

function DayStoryCard({ story, loading, onRefresh }: { story: DayStory | null; loading: boolean; onRefresh: () => void }) {
  if (!story && !loading) return null;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center gap-2">
        <KanthinkIcon size={16} className="text-violet-500" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Kan’s read on your day</span>
        {story && (
          <button onClick={onRefresh} disabled={loading} className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-40 dark:hover:text-neutral-200">
            {loading ? 'Reading…' : story.stale ? 'Update — the day has moved on' : `Written ${clock(story.writtenAt)} · refresh`}
          </button>
        )}
      </div>
      {!story ? (
        <p className="text-sm text-neutral-500">Kan is reading your day…</p>
      ) : (
        <>
          <p className="text-[17px] leading-snug text-neutral-900 dark:text-neutral-100">{story.headline}</p>
          {story.threads.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {story.threads.map((t) => (
                <li key={t.title} className="text-[14px] leading-snug text-neutral-700 dark:text-neutral-300">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{t.title}.</span> {t.detail}
                </li>
              ))}
            </ul>
          )}
          {story.looseEnds.length > 0 && (
            <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Loose ends</div>
              {story.looseEnds.map((l) => <p key={l} className="text-[13px] text-neutral-600 dark:text-neutral-400">{l}</p>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---- worth a look ----------------------------------------------------------------

function WorthALook({ reads, channels, onChanged }: { reads: DayData['reads']; channels: DayData['channels']; onChanged: () => void }) {
  const [showOthers, setShowOthers] = useState(false);
  if (!reads || reads.total === 0) return null;
  const counts = Object.entries(reads.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${CATEGORY_LABELS[k] ?? k}`)
    .join(' · ');

  return (
    <section>
      <SectionTitle>Worth a look</SectionTitle>
      <p className="mb-3 text-xs text-neutral-500">
        Kan read {reads.total} public {reads.total === 1 ? 'page' : 'pages'} you spent time on today: {counts}.
        {reads.worthALook.length > 0 ? ' These stood out.' : ' Nothing stood out yet.'}
      </p>
      <div className="space-y-3">
        {reads.worthALook.map((r) => <WorthCard key={r.id} read={r} channels={channels} onChanged={onChanged} />)}
      </div>
      {reads.others.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowOthers(!showOthers)} className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
            {showOthers ? 'Hide' : 'Show'} the other {reads.others.length} {reads.others.length === 1 ? 'page' : 'pages'} Kan read
          </button>
          {showOthers && (
            <ul className="mt-2 space-y-1">
              {reads.others.map((o) => (
                <li key={o.id} className="flex items-baseline gap-2 text-[13px]">
                  <a href={o.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-neutral-700 hover:underline dark:text-neutral-300">
                    <span className="text-neutral-400">{o.domain}</span> · {o.title || o.url}
                  </a>
                  <span className="flex-shrink-0 text-[11px] text-neutral-400">
                    {o.status === 'judged' ? CATEGORY_LABELS[o.category ?? 'other'] ?? o.category : 'still reading'} · {duration(o.seconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function WorthCard({ read: r, channels, onChanged }: { read: WorthRead; channels: DayData['channels']; onChanged: () => void }) {
  const [reflection, setReflection] = useState(r.reflection ?? '');
  const [channelId, setChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAppIdea = r.nudgeKind === 'app' || (r.scores.app ?? 0) >= 60;

  const build = async (mode: 'new' | 'extend') => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/kanwatch/reads/${r.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, channelId: channelId || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'That didn’t work.');
    if (mode === 'extend') {
      // The idea is in the app's thread; open it there to decide and press Update app.
      window.location.href = `/channel/${data.channelId}/card/${data.cardId}?app=${data.appId}`;
      return;
    }
    onChanged();
  };

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/kanwatch/reads/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'That didn’t work.');
    setBusy(false);
    onChanged();
  };

  return (
    <article id={`read-${r.id}`} className="scroll-mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 text-[15px] font-medium text-neutral-900 hover:underline dark:text-neutral-100">
          {r.title || r.url}
        </a>
        <span className="text-[11px] text-neutral-400">
          {r.domain}{r.kind ? ` · ${r.kind}` : ''} · read {duration(r.seconds)}{r.category ? ` · ${CATEGORY_LABELS[r.category] ?? r.category}` : ''}
        </span>
        {r.verdict === 'saved' && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Saved as a card</span>}
      </div>

      {r.tldr && <p className="mt-2 text-[14px] leading-relaxed text-neutral-700 dark:text-neutral-300">{r.tldr}</p>}
      {r.why && <p className="mt-1.5 text-[13px] text-neutral-500">{r.why}</p>}

      {r.nudge && (
        <div className="mt-3 rounded-lg bg-violet-500/5 p-3">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
            {NUDGE_LABELS[r.nudgeKind ?? 'reflect'] ?? 'Kan asks'}
          </div>
          <p className="text-[14px] text-neutral-800 dark:text-neutral-200">{r.nudge}</p>
          <div className="mt-2 flex gap-2">
            <input
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && reflection.trim() && send({ reflection })}
              placeholder="Your take (optional)"
              className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            {reflection.trim() !== (r.reflection ?? '') && (
              <SmallButton disabled={busy} onClick={() => send({ reflection })}>Keep</SmallButton>
            )}
          </div>
        </div>
      )}

      {r.builtApp && (
        <a
          href={`/channel/${r.builtApp.channelId}/card/${r.builtApp.cardId}?app=${r.builtApp.id}`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
        >
          {r.builtApp.ready ? '✓' : <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          {r.builtApp.ready ? `${r.builtApp.title} is built — open it` : `Building ${r.builtApp.title}… you’ll get a notification when it lands`}
        </a>
      )}

      {isAppIdea && !r.builtApp && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SmallButton primary disabled={busy} onClick={() => build('new')}>Build as a new app</SmallButton>
          {r.relatedApp && (
            <SmallButton disabled={busy} onClick={() => build('extend')}>Add to {r.relatedApp.title}</SmallButton>
          )}
          <span className="text-[11px] text-neutral-400">
            {r.relatedApp ? `Kan thinks it could fit your ${r.relatedApp.title} app.` : 'Doesn’t overlap any of your apps.'}
          </span>
        </div>
      )}

      {r.verdict !== 'saved' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="">{isAppIdea ? 'Channel (optional)…' : 'Save to…'}</option>
            <ChannelOptions channels={channels} />
          </select>
          <SmallButton primary disabled={busy || !channelId} onClick={() => send({ verdict: 'saved', channelId, reflection })}>Save as card</SmallButton>
          <SmallButton disabled={busy} onClick={() => send({ verdict: 'dismissed' })}>Not interesting</SmallButton>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      )}
    </article>
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
