'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The shroom row — trails, states, the drawer, and identity.
 *
 * Follows the "Trails" concept from prototypes/shrooms-alive, which survived
 * review. Four things it has to get right before it can ship:
 *
 *   1. Can a hover honestly describe every shroom shape? (No — see TrailAccuracy.)
 *   2. What does a shroom cap look like while its job is running?
 *   3. Where do you go to edit or make one?
 *   4. How do you tell four caps apart at 24px?
 */

// ── Shroom avatars ───────────────────────────────────────────────────────────

const CAP_SHAPES = [
  'round', 'flat', 'conical', 'bell', 'ruffled', 'wide',
  'tall', 'button', 'parasol', 'puffball', 'coral', 'morel',
] as const;
type CapShape = (typeof CAP_SHAPES)[number];

const PATTERNS = ['plain', 'spots', 'gills', 'rings'] as const;
type Pattern = (typeof PATTERNS)[number];

const PALETTE: { key: string; name: string; cap: string; deep: string; stem: string }[] = [
  { key: 'violet', name: 'Violet', cap: '#8b5cf6', deep: '#6d28d9', stem: '#e9e4f5' },
  { key: 'crimson', name: 'Crimson', cap: '#e11d48', deep: '#9f1239', stem: '#f7e4e8' },
  { key: 'amber', name: 'Amber', cap: '#f59e0b', deep: '#b45309', stem: '#f8efdd' },
  { key: 'emerald', name: 'Emerald', cap: '#10b981', deep: '#047857', stem: '#dff2ea' },
  { key: 'sky', name: 'Sky', cap: '#0ea5e9', deep: '#0369a1', stem: '#dcedf8' },
  { key: 'fuchsia', name: 'Fuchsia', cap: '#d946ef', deep: '#a21caf', stem: '#f6e2fa' },
  { key: 'slate', name: 'Slate', cap: '#64748b', deep: '#334155', stem: '#e6e9ee' },
  { key: 'lime', name: 'Lime', cap: '#84cc16', deep: '#4d7c0f', stem: '#eaf4d9' },
  { key: 'coral', name: 'Coral', cap: '#fb7185', deep: '#be123c', stem: '#fae6e9' },
  { key: 'indigo', name: 'Indigo', cap: '#6366f1', deep: '#3730a3', stem: '#e3e4fa' },
  { key: 'teal', name: 'Teal', cap: '#14b8a6', deep: '#0f766e', stem: '#dcf1ee' },
  { key: 'sand', name: 'Sand', cap: '#a8a29e', deep: '#57534e', stem: '#eeebe8' },
];

interface Avatar {
  shape: CapShape;
  pattern: Pattern;
  color: string;
}

/** The cap outline for each shape, drawn in a 32×32 box. */
function capPath(shape: CapShape): string {
  switch (shape) {
    case 'round':
      return 'M4 17c0-7.2 5.4-12 12-12s12 4.8 12 12c0 1.6-1.2 2.4-3 2.4H7c-1.8 0-3-.8-3-2.4z';
    case 'flat':
      return 'M3 18c0-5.6 5.8-9.6 13-9.6s13 4 13 9.6c0 1.3-1 1.9-2.6 1.9H5.6C4 19.9 3 19.3 3 18z';
    case 'conical':
      return 'M16 4l11 14.5c.7 1 0 2-1.4 2H6.4c-1.4 0-2.1-1-1.4-2z';
    case 'bell':
      return 'M6 19c0-9 3.6-14 10-14s10 5 10 14c0 1-.9 1.5-2.2 1.5H8.2C6.9 20.5 6 20 6 19z';
    case 'ruffled':
      return 'M4 17c0-7 5.4-12 12-12s12 5 12 12c0 1.7-2 .6-3.4 1.6-1.4 1-2.6-1-4-.2-1.4.8-2.6 1.2-4.6 1.2s-3.2-.4-4.6-1.2c-1.4-.8-2.6 1.2-4-.2C6 17.6 4 18.7 4 17z';
    case 'wide':
      return 'M1.5 17.5C1.5 11.7 8 7.5 16 7.5s14.5 4.2 14.5 10c0 1.6-1.3 2.4-3.2 2.4H4.7c-1.9 0-3.2-.8-3.2-2.4z';
    case 'tall':
      return 'M10 18c0-8.5 2.4-13 6-13s6 4.5 6 13c0 1.2-.7 1.8-1.8 1.8h-8.4C10.7 19.8 10 19.2 10 18z';
    case 'button':
      return 'M7 18.5c0-5.5 4-9.5 9-9.5s9 4 9 9.5c0 1.1-.8 1.6-2.1 1.6H9.1C7.8 20.1 7 19.6 7 18.5z';
    case 'parasol':
      return 'M2.5 18c0-7.5 6-13 13.5-13S29.5 10.5 29.5 18c0 1.2-.8 1.6-2 1.6h-23c-1.2 0-2-.4-2-1.6z';
    case 'puffball':
      return 'M16 4a11 11 0 100 22 11 11 0 000-22z';
    case 'coral':
      return 'M16 20c-1 0-1.4-.7-1.4-1.6 0-2-2-2.4-3-3.6-1-1.2-1-3.4.6-4.2 1.2-.6 1-2 .4-3-.7-1.2.2-2.8 1.7-2.8 1.4 0 2 1.2 3.4 1.2s2-1.2 3.4-1.2c1.5 0 2.4 1.6 1.7 2.8-.6 1-.8 2.4.4 3 1.6.8 1.6 3 .6 4.2-1 1.2-3 1.6-3 3.6 0 .9-.4 1.6-1.4 1.6z';
    case 'morel':
      return 'M16 4c4.6 0 7.5 3.6 7.5 8.5S20.6 21 16 21s-7.5-3.6-7.5-8.5S11.4 4 16 4z';
  }
}

/** Whether a shape has a visible stem below the cap. */
function hasStem(shape: CapShape): boolean {
  return shape !== 'puffball' && shape !== 'coral';
}

function ShroomAvatar({
  avatar,
  size = 32,
  className = '',
}: {
  avatar: Avatar;
  size?: number;
  className?: string;
}) {
  const c = PALETTE.find((p) => p.key === avatar.color) ?? PALETTE[0];
  const id = `${avatar.shape}-${avatar.pattern}-${avatar.color}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={capPath(avatar.shape)} />
        </clipPath>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.cap} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
      </defs>

      {hasStem(avatar.shape) && (
        <path
          d="M13 19h6c0 4.5.6 6.5 1.2 8.2.2.6-.2 1.1-.9 1.1h-6.6c-.7 0-1.1-.5-.9-1.1.6-1.7 1.2-3.7 1.2-8.2z"
          fill={c.stem}
        />
      )}

      <path d={capPath(avatar.shape)} fill={`url(#grad-${id})`} />

      <g clipPath={`url(#clip-${id})`}>
        {avatar.pattern === 'spots' && (
          <>
            <circle cx="11" cy="12" r="2.1" fill="#fff" opacity="0.85" />
            <circle cx="20" cy="10.5" r="1.6" fill="#fff" opacity="0.85" />
            <circle cx="16.5" cy="15.5" r="1.3" fill="#fff" opacity="0.7" />
            <circle cx="24" cy="15" r="1.1" fill="#fff" opacity="0.6" />
          </>
        )}
        {avatar.pattern === 'gills' && (
          <g stroke="#000" strokeOpacity="0.22" strokeWidth="1">
            {[6, 9, 12, 15, 18, 21, 24, 27].map((x) => (
              <line key={x} x1={x} y1="4" x2={x} y2="21" />
            ))}
          </g>
        )}
        {avatar.pattern === 'rings' && (
          <g fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6">
            <ellipse cx="16" cy="19" rx="5" ry="4" />
            <ellipse cx="16" cy="19" rx="9.5" ry="7.5" />
          </g>
        )}
      </g>
    </svg>
  );
}

// ── Mock shrooms ─────────────────────────────────────────────────────────────

type RunState = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'skipped';

interface Stop {
  column: string;
  verb: string;
  /** Destinations that aren't columns — a report, or the review queue. */
  offBoard?: 'report' | 'review';
}

interface Shroom {
  id: string;
  name: string;
  avatar: Avatar;
  /** Ordered stops. One entry = simple shroom; several = a multi-step one. */
  stops: Stop[];
  reads: string[];
  trigger: string;
  standing: boolean;
  chainsTo?: string;
  global?: boolean;
}

const COLUMNS = ['Inbox', 'Drafting', 'Ready', 'Done'];

const SHROOMS: Shroom[] = [
  {
    id: 's1',
    name: 'Triage',
    avatar: { shape: 'round', pattern: 'spots', color: 'crimson' },
    reads: ['Inbox'],
    stops: [
      { column: 'Inbox', verb: 'tags it' },
      { column: 'Drafting', verb: 'moves it here' },
    ],
    trigger: 'a card lands in Inbox',
    standing: true,
  },
  {
    id: 's2',
    name: 'Spec Writer',
    avatar: { shape: 'conical', pattern: 'gills', color: 'sky' },
    reads: ['Drafting'],
    stops: [{ column: 'Drafting', verb: 'writes a brief onto it' }],
    trigger: 'you ask',
    standing: false,
    chainsTo: 'App Builder',
  },
  {
    id: 's3',
    name: 'App Builder',
    avatar: { shape: 'parasol', pattern: 'rings', color: 'emerald' },
    reads: ['Ready'],
    stops: [{ column: 'Ready', verb: 'builds an app on it' }],
    trigger: 'you ask',
    standing: false,
  },
  {
    id: 's4',
    name: 'Idea Farm',
    avatar: { shape: 'coral', pattern: 'plain', color: 'fuchsia' },
    reads: ['Inbox', 'Drafting', 'Ready', 'Done'],
    stops: [{ column: 'Inbox', verb: 'drops 5 new cards', offBoard: 'review' }],
    trigger: 'Fridays, 8am',
    standing: true,
  },
  {
    id: 's5',
    name: 'Monday Digest',
    avatar: { shape: 'flat', pattern: 'plain', color: 'amber' },
    reads: ['Inbox', 'Drafting', 'Ready', 'Done'],
    stops: [{ column: '', verb: 'emails you a summary', offBoard: 'report' }],
    trigger: 'Mondays, 9am',
    standing: true,
    global: true,
  },
];

// ── 01 · Trail accuracy ──────────────────────────────────────────────────────

function TrailAccuracy() {
  const [hover, setHover] = useState<string>('s1');
  const s = SHROOMS.find((x) => x.id === hover)!;
  const stopFor = (col: string) => s.stops.findIndex((st) => st.column === col);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SHROOMS.map((x) => (
          <button
            key={x.id}
            onMouseEnter={() => setHover(x.id)}
            onFocus={() => setHover(x.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] transition-all ${
              hover === x.id
                ? 'border-violet-500/50 bg-violet-500/[0.14] text-neutral-50'
                : 'border-white/[0.07] bg-white/[0.02] text-neutral-400'
            }`}
          >
            <ShroomAvatar avatar={x.avatar} size={16} />
            {x.name}
          </button>
        ))}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {COLUMNS.map((col) => {
          const idx = stopFor(col);
          const isStop = idx !== -1;
          const isRead = s.reads.includes(col) && !isStop;
          return (
            <div
              key={col}
              className={`w-[180px] flex-shrink-0 rounded-xl border p-2 transition-all ${
                isStop
                  ? 'border-violet-500/55 bg-violet-500/[0.08]'
                  : isRead
                    ? 'border-sky-500/40 bg-sky-500/[0.04]'
                    : 'border-white/[0.05] bg-white/[0.015]'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  {col}
                </span>
                {isStop && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 font-mono text-[9px] font-bold text-white">
                    {idx + 1}
                  </span>
                )}
              </div>
              {isStop ? (
                <p className="rounded bg-black/40 px-1.5 py-1 text-[10.5px] leading-snug text-violet-200">
                  {s.stops[idx].verb}
                  {s.stops[idx].offBoard === 'review' && (
                    <span className="mt-0.5 block text-amber-300/80">→ waits for your approval</span>
                  )}
                </p>
              ) : isRead ? (
                <p className="text-[10px] text-sky-300/70">reads for context</p>
              ) : (
                <div className="h-[22px]" />
              )}
              <div className="mt-2 space-y-1 opacity-40">
                <div className="h-6 rounded border border-white/[0.06] bg-[#141417]" />
                <div className="h-6 rounded border border-white/[0.06] bg-[#141417]" />
              </div>
            </div>
          );
        })}

        {/* Off-board destinations get their own stop, rather than being invisible. */}
        {s.stops.some((st) => st.offBoard === 'report') && (
          <div className="w-[180px] flex-shrink-0 rounded-xl border border-amber-500/45 bg-amber-500/[0.06] p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                Your inbox
              </span>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 font-mono text-[9px] font-bold text-black">
                1
              </span>
            </div>
            <p className="rounded bg-black/40 px-1.5 py-1 text-[10.5px] text-amber-200">
              emails you a summary
            </p>
            <p className="mt-2 text-[10px] text-neutral-600">not on the board</p>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1 border-l-2 border-neutral-800 pl-3">
        <p className="text-[12px] text-neutral-300">
          <span className="text-neutral-500">Runs when</span> {s.trigger}
          {!s.standing && <span className="text-neutral-600"> · manual</span>}
        </p>
        {s.chainsTo && (
          <p className="text-[12px] text-neutral-400">
            <span className="text-neutral-600">then hands off to</span>{' '}
            <span className="text-violet-300">{s.chainsTo}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── 02 · The row, with states ────────────────────────────────────────────────

function RowStates() {
  const [states, setStates] = useState<Record<string, RunState>>({
    s1: 'idle',
    s2: 'running',
    s3: 'done',
    s4: 'skipped',
    s5: 'failed',
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = (id: string) => {
    setStates((s) => ({ ...s, [id]: 'queued' }));
    timers.current.push(setTimeout(() => setStates((s) => ({ ...s, [id]: 'running' })), 500));
    timers.current.push(setTimeout(() => setStates((s) => ({ ...s, [id]: 'done' })), 3000));
    timers.current.push(setTimeout(() => setStates((s) => ({ ...s, [id]: 'idle' })), 7000));
  };

  return (
    <div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {SHROOMS.map((s) => (
            <ShroomChip key={s.id} shroom={s} state={states[s.id]} onRun={() => run(s.id)} />
          ))}
          <button className="ml-auto flex items-center gap-1.5 rounded-lg border border-dashed border-white/[0.1] px-2.5 py-1.5 text-[11.5px] text-neutral-500 hover:border-violet-500/40 hover:text-neutral-300">
            All shrooms
          </button>
        </div>
      </div>

      <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
        Every state, side by side
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(['idle', 'queued', 'running', 'done', 'failed', 'skipped'] as RunState[]).map((st, i) => (
          <div key={st} className="flex flex-col items-center gap-1.5">
            <ShroomChip shroom={SHROOMS[i % SHROOMS.length]} state={st} onRun={() => {}} />
            <span className="font-mono text-[9.5px] text-neutral-700">{st}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-[68ch] text-[11.5px] leading-relaxed text-neutral-600">
        <strong className="text-neutral-500">Skipped</strong> is the one worth having and the one
        nothing currently shows. A shroom that hit its daily cap or was stopped by loop prevention
        looks identical to one that simply didn&apos;t fire — the run record already stores{' '}
        <code className="text-neutral-500">skippedReason</code>, and nowhere displays it.
      </p>
    </div>
  );
}

function ShroomChip({
  shroom,
  state,
  onRun,
}: {
  shroom: Shroom;
  state: RunState;
  onRun: () => void;
}) {
  const busy = state === 'running' || state === 'queued';
  const tone =
    state === 'running'
      ? 'border-violet-500/60 bg-violet-500/[0.14]'
      : state === 'queued'
        ? 'border-violet-500/30 bg-violet-500/[0.06]'
        : state === 'done'
          ? 'border-emerald-500/50 bg-emerald-500/[0.09]'
          : state === 'failed'
            ? 'border-red-500/50 bg-red-500/[0.09]'
            : state === 'skipped'
              ? 'border-amber-500/40 bg-amber-500/[0.07]'
              : 'border-white/[0.07] bg-white/[0.02]';

  return (
    <button
      onClick={onRun}
      className={`relative flex items-center gap-1.5 overflow-hidden rounded-lg border px-2 py-1.5 text-[12px] text-neutral-200 transition-all ${tone}`}
      title={shroom.name}
    >
      {/* The bar is the job's progress, on the button that owns the job. */}
      {state === 'running' && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-violet-900/50">
          <span className="absolute inset-y-0 w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] bg-violet-400" />
        </span>
      )}
      <span className={`relative flex-shrink-0 ${busy ? 'animate-pulse' : ''}`}>
        <ShroomAvatar avatar={shroom.avatar} size={16} />
        {state === 'running' && (
          <span className="absolute -inset-1 rounded-full border border-violet-400/40" />
        )}
      </span>
      <span className={busy ? 'text-neutral-300' : ''}>{shroom.name}</span>
      {state === 'done' && <span className="text-[10px] text-emerald-300">3 cards</span>}
      {state === 'failed' && <span className="text-[10px] text-red-300">failed</span>}
      {state === 'skipped' && <span className="text-[10px] text-amber-300">daily cap</span>}
      {state === 'queued' && <span className="text-[10px] text-neutral-500">queued</span>}
      <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </button>
  );
}

// ── 03 · The drawer ──────────────────────────────────────────────────────────

function ShroomDrawer() {
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState<string | null>('s1');
  const channelShrooms = SHROOMS.filter((s) => !s.global);
  const globalShrooms = SHROOMS.filter((s) => s.global);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-neutral-300 hover:border-violet-500/40"
        >
          {open ? 'Close' : 'Open'} drawer
        </button>
        <p className="text-[11.5px] text-neutral-600">
          Clicking a cap opens the drawer already scrolled to that shroom.
        </p>
      </div>

      <div className="relative h-[440px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#0e0e11]">
        <div className="p-3 opacity-40">
          <div className="mb-2 flex gap-1.5">
            {SHROOMS.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[12px] text-neutral-400"
              >
                <ShroomAvatar avatar={s.avatar} size={15} />
                {s.name}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {COLUMNS.slice(0, 3).map((c) => (
              <div key={c} className="h-32 w-[150px] rounded-lg border border-white/[0.05] bg-white/[0.01]" />
            ))}
          </div>
        </div>

        <div
          className={`absolute inset-y-0 right-0 w-[320px] border-l border-white/[0.08] bg-[#141417] transition-transform duration-300 ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
            <p className="text-[13px] font-medium text-neutral-100">Shrooms</p>
            <button className="rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-700">
              + New
            </button>
          </div>

          <div className="h-[calc(100%-46px)] overflow-y-auto px-2 py-2">
            <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              This channel
            </p>
            {channelShrooms.map((s) => (
              <DrawerRow
                key={s.id}
                shroom={s}
                focused={focused === s.id}
                onClick={() => setFocused(s.id)}
              />
            ))}

            <p className="px-1 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              Everywhere
            </p>
            {globalShrooms.map((s) => (
              <DrawerRow
                key={s.id}
                shroom={s}
                focused={focused === s.id}
                onClick={() => setFocused(s.id)}
              />
            ))}

            <button className="mt-3 w-full rounded-lg border border-dashed border-white/[0.1] px-3 py-2.5 text-[11.5px] text-neutral-500 hover:border-violet-500/40 hover:text-neutral-300">
              Describe a new one to Kan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerRow({
  shroom,
  focused,
  onClick,
}: {
  shroom: Shroom;
  focused: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-1 flex w-full items-start gap-2.5 rounded-lg border px-2 py-2 text-left transition-colors ${
        focused
          ? 'border-violet-500/45 bg-violet-500/[0.1]'
          : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]'
      }`}
    >
      <span className="mt-[1px] flex-shrink-0">
        <ShroomAvatar avatar={shroom.avatar} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-neutral-100">{shroom.name}</span>
          {shroom.standing && (
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500/80" />
          )}
        </span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-neutral-500">
          {shroom.stops.map((s) => s.verb).join(', then ')}
        </span>
        <span className="mt-0.5 block text-[10px] text-neutral-600">runs when {shroom.trigger}</span>
      </span>
      {focused && (
        <span className="mt-[3px] flex-shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-neutral-300">
          edit
        </span>
      )}
    </button>
  );
}

// ── 04 · Avatar library ──────────────────────────────────────────────────────

function AvatarLibrary() {
  const [picked, setPicked] = useState<Avatar>({
    shape: 'round',
    pattern: 'spots',
    color: 'crimson',
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
        <ShroomAvatar avatar={picked} size={56} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-neutral-100">Triage</p>
          <p className="font-mono text-[10.5px] text-neutral-600">
            {picked.shape} · {picked.pattern} · {picked.color}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {[14, 16, 22, 32].map((n) => (
              <ShroomAvatar key={n} avatar={picked} size={n} />
            ))}
            <span className="ml-1 text-[10px] text-neutral-700">
              at the sizes the row actually uses
            </span>
          </div>
        </div>
      </div>

      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        Cap
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {CAP_SHAPES.map((shape) => (
          <button
            key={shape}
            onClick={() => setPicked((p) => ({ ...p, shape }))}
            className={`rounded-lg border p-1.5 transition-colors ${
              picked.shape === shape
                ? 'border-violet-500/60 bg-violet-500/[0.12]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]'
            }`}
            title={shape}
          >
            <ShroomAvatar avatar={{ ...picked, shape }} size={30} />
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        Colour
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c.key}
            onClick={() => setPicked((p) => ({ ...p, color: c.key }))}
            className={`rounded-lg border p-1.5 transition-colors ${
              picked.color === c.key
                ? 'border-violet-500/60 bg-violet-500/[0.12]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]'
            }`}
            title={c.name}
          >
            <ShroomAvatar avatar={{ ...picked, color: c.key }} size={30} />
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        Markings
      </p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {PATTERNS.map((pattern) => (
          <button
            key={pattern}
            onClick={() => setPicked((p) => ({ ...p, pattern }))}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
              picked.pattern === pattern
                ? 'border-violet-500/60 bg-violet-500/[0.12] text-neutral-100'
                : 'border-white/[0.06] bg-white/[0.02] text-neutral-500 hover:border-white/[0.14]'
            }`}
          >
            <ShroomAvatar avatar={{ ...picked, pattern }} size={22} />
            <span className="text-[11px]">{pattern}</span>
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        A shelf of them, so they can be told apart at a glance
      </p>
      <div className="flex flex-wrap gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
        {CAP_SHAPES.map((shape, i) => (
          <ShroomAvatar
            key={shape}
            avatar={{
              shape,
              pattern: PATTERNS[i % PATTERNS.length],
              color: PALETTE[(i * 5) % PALETTE.length].key,
            }}
            size={34}
          />
        ))}
      </div>
      <p className="mt-2 max-w-[68ch] text-[11.5px] leading-relaxed text-neutral-600">
        Shape carries further than colour at 16px, so shape should be the thing Kan varies first
        when he assigns one — and two shrooms in the same channel should never get the same cap,
        whatever their colour.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'trail', n: 1, name: 'Trail accuracy', component: TrailAccuracy },
  { key: 'states', n: 2, name: 'The row & its states', component: RowStates },
  { key: 'drawer', n: 3, name: 'The drawer', component: ShroomDrawer },
  { key: 'avatars', n: 4, name: 'Avatar library', component: AvatarLibrary },
];

const PITCH: Record<string, string> = {
  trail:
    'Two colours could not tell the truth about every shroom, so the trail is ordered stops instead: numbered badges in step order, blue for columns read only for context, and off-board destinations — an email, the review queue — given their own stop rather than vanishing. Hover each of the five; Triage is two stops, Monday Digest never touches the board, Idea Farm lands in review rather than on the column.',
  states:
    'The cap holds its own job. Queued, running with a progress bar on the button itself, finished with a count that fades back to rest, failed, and skipped — which is the state nothing currently shows and the one that explains a shroom that looks broken but is only capped.',
  drawer:
    'One place for all of them, channel first and global below, each row saying what it does and when in plain words rather than making you open it to find out. Clicking a cap in the row opens this already scrolled to that shroom, so a click is never just a directory. New shrooms start where they are good — describing one to Kan.',
  avatars:
    'Twelve caps, twelve colours, four markings. Enough for every shroom in a channel to be a different silhouette, which is what matters at row size — pick one and watch it at 14, 16, 22 and 32px.',
};

export default function ShroomRowPage() {
  const [active, setActive] = useState('trail');
  const section = SECTIONS.find((s) => s.key === active)!;
  const View = section.component;

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-neutral-200">
      <div className="mx-auto max-w-[1080px] px-6 py-12">
        <header className="mb-9">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            Prototype
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">The shroom row</h1>
          <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-neutral-400">
            Trails survived the last round, so this works it up: what a hover can honestly say
            about a shroom, what a cap looks like while its job runs, where you go to edit or make
            one, and how you tell four caps apart at 16 pixels.
          </p>
        </header>

        <div className="mb-6 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                active === s.key
                  ? 'border-violet-500/45 bg-violet-500/[0.12] text-neutral-50'
                  : 'border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/[0.12] hover:text-neutral-200'
              }`}
            >
              <span
                className={`font-mono text-[10px] ${
                  active === s.key ? 'text-violet-300' : 'text-neutral-600'
                }`}
              >
                {String(s.n).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{s.name}</span>
            </button>
          ))}
        </div>

        <p className="mb-5 max-w-[70ch] border-l-2 border-neutral-800 pl-4 text-[13px] leading-relaxed text-neutral-500">
          {PITCH[active]}
        </p>

        <View />

        <footer className="mt-16 space-y-3 border-t border-neutral-900 pt-6 text-[12.5px] leading-relaxed text-neutral-600">
          <p className="max-w-[70ch]">
            <strong className="text-neutral-500">The honest limit on trails.</strong> A shroom can
            read one column, several, or the whole board; write to a column, an email, or a review
            queue; run several steps in order; and hand off to another shroom afterwards. Ordered
            stops cover all of that. What they cannot show is a{' '}
            <em>conditional</em> — a shroom that only moves a card if it looks like marketing draws
            the same trail as one that always moves it. That is a real gap, and the honest fix is
            wording, not drawing: the sentence under the trail should say “sometimes”.
          </p>
          <p className="max-w-[70ch]">
            A board-wide reader lighting every column also says nothing, so those are drawn as a
            single quiet wash rather than four bright columns — the difference between “reads
            everything” and “reads these two” has to survive at a glance.
          </p>
        </footer>
      </div>
    </div>
  );
}
