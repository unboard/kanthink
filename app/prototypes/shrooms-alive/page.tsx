'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shrooms alive — ten ways an automation stops being a menu item.
 *
 * The earlier round (prototypes/shrooms-in-channel) asked where a shroom should
 * SIT on a board. This one takes the placement question as answered and goes at
 * the three things that actually make shrooms feel like a separate app you visit:
 *
 *   running one    — today it means leaving the board, finding a list, pressing Run
 *   making one     — the conversational builder is the good part, and it is buried
 *   reading one    — the graph view was meant to explain them and never worked
 *
 * Each concept below is one answer to one of those, shown against the same board so
 * they can be compared rather than admired. Nothing here ships as-is.
 */

// ── Mock data ────────────────────────────────────────────────────────────────

interface DemoCard {
  id: string;
  title: string;
  blurb?: string;
  /** Shrooms that have already touched this card, oldest first. */
  touchedBy?: { shroom: string; what: string; when: string }[];
}

interface DemoColumn {
  id: string;
  name: string;
  cards: DemoCard[];
}

interface DemoShroom {
  id: string;
  name: string;
  /** One-line English form of the whole automation. */
  sentence: string;
  reads: string;
  writes: string;
  trigger: string;
  /** Whether it fires on its own or waits to be asked. */
  standing: boolean;
  verb: string;
}

const COLUMNS: DemoColumn[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    cards: [
      { id: 'c1', title: 'Reading app for Lennon', blurb: 'Cat-themed, multiple choice' },
      {
        id: 'c2',
        title: 'Pricing page rewrite',
        blurb: 'Too many words above the fold',
        touchedBy: [{ shroom: 'Triage', what: 'tagged it “marketing”', when: '2h ago' }],
      },
      { id: 'c3', title: 'Birding palette idea' },
    ],
  },
  {
    id: 'drafting',
    name: 'Drafting',
    cards: [
      {
        id: 'c4',
        title: 'Word study lesson',
        blurb: 'Roll & spell typing game',
        touchedBy: [
          { shroom: 'Triage', what: 'moved it here', when: 'yesterday' },
          { shroom: 'Spec Writer', what: 'wrote the brief', when: '4h ago' },
        ],
      },
      { id: 'c5', title: 'Onboarding email #2' },
    ],
  },
  {
    id: 'ready',
    name: 'Ready',
    cards: [{ id: 'c6', title: 'Tip splitter', blurb: 'Ready to build' }],
  },
];

const SHROOMS: DemoShroom[] = [
  {
    id: 's1',
    name: 'Triage',
    sentence: 'When a card lands in Inbox, tag it and move it to Drafting.',
    reads: 'inbox',
    writes: 'drafting',
    trigger: 'a card lands in Inbox',
    standing: true,
    verb: 'sorting',
  },
  {
    id: 's2',
    name: 'Spec Writer',
    sentence: 'On request, read a card and write a build brief onto it.',
    reads: 'drafting',
    writes: 'drafting',
    trigger: 'you ask',
    standing: false,
    verb: 'writing a brief',
  },
  {
    id: 's3',
    name: 'App Builder',
    sentence: 'On request, build an app from a card in Ready.',
    reads: 'ready',
    writes: 'ready',
    trigger: 'you ask',
    standing: false,
    verb: 'building',
  },
  {
    id: 's4',
    name: 'Monday Digest',
    sentence: 'Every Monday at 9am, report on everything that moved.',
    reads: 'board',
    writes: 'report',
    trigger: 'Mondays, 9am',
    standing: true,
    verb: 'summarising',
  },
];

// ── Shared chrome ────────────────────────────────────────────────────────────

function Cap({ size = 14 }: { size?: number }) {
  return <span style={{ fontSize: size, lineHeight: 1 }}>🍄</span>;
}

function Card({
  card,
  children,
  dim,
  draggable,
  onDragStart,
  onDragEnd,
  ring,
}: {
  card: DemoCard;
  children?: React.ReactNode;
  dim?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  ring?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-lg border bg-[#141417] px-2.5 py-2 transition-all ${
        ring ? 'border-violet-500/60 shadow-[0_0_0_3px_rgba(139,92,246,0.12)]' : 'border-white/[0.07]'
      } ${dim ? 'opacity-30' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <p className="text-[12.5px] font-medium leading-snug text-neutral-100">{card.title}</p>
      {card.blurb && <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{card.blurb}</p>}
      {children}
    </div>
  );
}

function Board({
  columns = COLUMNS,
  renderCard,
  columnHeader,
  columnFooter,
  columnRing,
}: {
  columns?: DemoColumn[];
  renderCard?: (card: DemoCard, columnId: string) => React.ReactNode;
  columnHeader?: (columnId: string) => React.ReactNode;
  columnFooter?: (columnId: string) => React.ReactNode;
  columnRing?: (columnId: string) => string | null;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {columns.map((col) => {
        const ring = columnRing?.(col.id);
        return (
          <div
            key={col.id}
            className={`w-[210px] flex-shrink-0 rounded-xl border bg-white/[0.015] p-2 transition-all ${
              ring ? ring : 'border-white/[0.05]'
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {col.name}
              </span>
              <span className="font-mono text-[10px] text-neutral-700">{col.cards.length}</span>
            </div>
            {columnHeader?.(col.id)}
            <div className="space-y-1.5">
              {col.cards.map((card) =>
                renderCard ? (
                  <div key={card.id}>{renderCard(card, col.id)}</div>
                ) : (
                  <Card key={card.id} card={card} />
                )
              )}
            </div>
            {columnFooter?.(col.id)}
          </div>
        );
      })}
    </div>
  );
}

interface ViewProps {
  say: (msg: string) => void;
}

// ── 01 · Drop to run ─────────────────────────────────────────────────────────

function DropToRun({ say }: ViewProps) {
  const [dragging, setDragging] = useState<DemoCard | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div>
      <Board
        renderCard={(card) => (
          <Card
            card={card}
            draggable
            onDragStart={() => setDragging(card)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
          />
        )}
      />
      <div
        className={`mt-3 rounded-xl border p-2.5 transition-all ${
          dragging ? 'border-violet-500/40 bg-violet-500/[0.06]' : 'border-white/[0.05] bg-white/[0.015]'
        }`}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          {dragging ? `Drop “${dragging.title}” on a shroom` : 'Shrooms'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SHROOMS.map((s) => (
            <div
              key={s.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((cur) => (cur === s.id ? null : cur))}
              onDrop={() => {
                if (dragging) say(`“${s.name}” is ${s.verb} on “${dragging.title}”`);
                setDragging(null);
                setOver(null);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all ${
                over === s.id
                  ? 'scale-105 border-violet-400 bg-violet-500/20 text-neutral-50'
                  : dragging
                    ? 'border-violet-500/30 bg-white/[0.03] text-neutral-300'
                    : 'border-white/[0.07] bg-white/[0.02] text-neutral-400'
              }`}
            >
              <Cap size={13} />
              {s.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 02 · Card sleeve ─────────────────────────────────────────────────────────

function CardSleeve({ say }: ViewProps) {
  const [openCard, setOpenCard] = useState<string | null>('c4');
  return (
    <Board
      renderCard={(card, columnId) => {
        const usable = SHROOMS.filter((s) => s.reads === columnId || s.reads === 'board');
        const open = openCard === card.id;
        return (
          <div
            onMouseEnter={() => setOpenCard(card.id)}
            onMouseLeave={() => setOpenCard((c) => (c === card.id ? null : c))}
          >
            <Card card={card}>
              <div
                className={`grid transition-all duration-200 ${
                  open ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-wrap gap-1 border-t border-white/[0.06] pt-1.5">
                    {usable.length === 0 && (
                      <span className="text-[10px] text-neutral-700">nothing watches this column</span>
                    )}
                    {usable.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => say(`“${s.name}” is ${s.verb} on “${card.title}”`)}
                        className="flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-neutral-300 hover:bg-violet-500/20 hover:text-neutral-50"
                      >
                        <Cap size={10} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        );
      }}
    />
  );
}

// ── 03 · Say it ──────────────────────────────────────────────────────────────

function SayIt({ say }: ViewProps) {
  const [text, setText] = useState('have the spec writer look at this');
  const match = SHROOMS.find((s) => {
    const t = text.toLowerCase();
    return t.includes(s.name.toLowerCase()) || t.includes(s.name.split(' ')[0].toLowerCase());
  });
  return (
    <div>
      <Board columns={[COLUMNS[1]]} />
      <div className="mt-3 rounded-xl border border-white/[0.07] bg-[#141417] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Card composer · “Word study lesson”
        </p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-neutral-100 outline-none focus:border-violet-500/50"
          placeholder="Ask for something…"
        />
        <div className="mt-2 flex min-h-[26px] items-center gap-2">
          {match ? (
            <>
              <span className="flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-1 text-[11px] text-violet-200">
                <Cap size={11} />
                {match.name}
              </span>
              <span className="text-[11px] text-neutral-500">will run on this card</span>
              <button
                onClick={() => say(`“${match.name}” is ${match.verb} on “Word study lesson”`)}
                className="ml-auto rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-700"
              >
                Send
              </button>
            </>
          ) : (
            <span className="text-[11px] text-neutral-600">
              No shroom named — this sends as an ordinary note.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 04 · Standing orders ─────────────────────────────────────────────────────

function StandingOrders({ say }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          This channel runs on
        </p>
        <div className="space-y-1">
          {SHROOMS.map((s) => (
            <div key={s.id} className="group flex items-start gap-2">
              <span className="mt-[3px]">
                <Cap size={12} />
              </span>
              {editing === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.sentence}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditing(null);
                      say(`Rewrote “${s.name}” — Kan will confirm the change`);
                    }
                  }}
                  className="flex-1 rounded border border-violet-500/50 bg-black/40 px-2 py-1 text-[12.5px] text-neutral-100 outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditing(s.id)}
                  className="flex-1 text-left text-[12.5px] leading-relaxed text-neutral-300 hover:text-neutral-50"
                >
                  {s.sentence}
                  <span className="ml-1.5 text-[10px] text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100">
                    edit
                  </span>
                </button>
              )}
              {!s.standing && (
                <button
                  onClick={() => say(`“${s.name}” is ${s.verb}`)}
                  className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10.5px] text-neutral-600 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-neutral-200 group-hover:opacity-100"
                >
                  run now
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <Board />
    </div>
  );
}

// ── 05 · Trails (the map, on the board) ──────────────────────────────────────

function Trails({ say }: ViewProps) {
  const [hover, setHover] = useState<string | null>('s1');
  const active = SHROOMS.find((s) => s.id === hover);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SHROOMS.map((s) => (
          <button
            key={s.id}
            onMouseEnter={() => setHover(s.id)}
            onFocus={() => setHover(s.id)}
            onClick={() => say(`“${s.name}” is ${s.verb}`)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all ${
              hover === s.id
                ? 'border-violet-500/50 bg-violet-500/[0.14] text-neutral-50'
                : 'border-white/[0.07] bg-white/[0.02] text-neutral-400'
            }`}
          >
            <Cap size={13} />
            {s.name}
          </button>
        ))}
      </div>
      <Board
        columnRing={(id) => {
          if (!active) return null;
          if (active.reads === 'board') return 'border-violet-500/40 bg-violet-500/[0.05]';
          if (active.reads === id && active.writes === id)
            return 'border-violet-500/50 bg-violet-500/[0.07]';
          if (active.reads === id) return 'border-sky-500/50 bg-sky-500/[0.05]';
          if (active.writes === id) return 'border-emerald-500/50 bg-emerald-500/[0.05]';
          return null;
        }}
        columnHeader={(id) => {
          if (!active) return null;
          const label =
            active.reads === 'board'
              ? 'reads the whole board'
              : active.reads === id && active.writes === id
                ? 'reads and writes here'
                : active.reads === id
                  ? 'reads from here'
                  : active.writes === id
                    ? 'writes here'
                    : null;
          if (!label) return null;
          return (
            <p className="mb-1.5 rounded bg-black/40 px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-wider text-neutral-400">
              {label}
            </p>
          );
        }}
      />
      <p className="mt-3 text-[11.5px] text-neutral-600">
        {active
          ? `${active.name} · runs when ${active.trigger}`
          : 'Hover a shroom to see where it reaches.'}
      </p>
    </div>
  );
}

// ── 06 · Ghost card ──────────────────────────────────────────────────────────

function GhostCard({ say }: ViewProps) {
  const [stage, setStage] = useState<'idle' | 'thinking' | 'writing' | 'done'>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = () => {
    setStage('thinking');
    say('“Triage” is sorting — output lands in Drafting');
    timers.current.push(setTimeout(() => setStage('writing'), 1100));
    timers.current.push(
      setTimeout(() => {
        setStage('done');
        say('“Triage” finished · 1 card drafted');
      }, 2400)
    );
  };

  return (
    <div>
      <button
        onClick={run}
        disabled={stage !== 'idle' && stage !== 'done'}
        className="mb-3 flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/[0.12] px-2.5 py-1.5 text-[12px] text-neutral-100 disabled:opacity-50"
      >
        <Cap size={13} />
        Run Triage
      </button>
      <Board
        columnFooter={(id) => {
          if (id !== 'drafting' || stage === 'idle') return null;
          return (
            <div className="mt-1.5">
              <div
                className={`rounded-lg border border-dashed px-2.5 py-2 transition-all ${
                  stage === 'done'
                    ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                    : 'border-violet-500/40 bg-violet-500/[0.05]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {stage !== 'done' && (
                    <span className="h-2.5 w-2.5 flex-shrink-0 animate-spin rounded-full border-2 border-violet-700 border-t-violet-300" />
                  )}
                  <p className="text-[12px] font-medium text-neutral-200">
                    {stage === 'thinking' ? 'Triage is reading Inbox…' : 'Pricing page rewrite'}
                  </p>
                </div>
                {stage === 'writing' && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-4/5 animate-pulse rounded bg-white/[0.08]" />
                    <div className="h-1.5 w-3/5 animate-pulse rounded bg-white/[0.06]" />
                  </div>
                )}
                {stage === 'done' && (
                  <p className="mt-0.5 text-[11px] text-neutral-500">Tagged “marketing” · moved here</p>
                )}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

// ── 07 · Column understudy ───────────────────────────────────────────────────

function Understudy({ say }: ViewProps) {
  return (
    <Board
      columnFooter={(id) => {
        const watchers = SHROOMS.filter((s) => s.reads === id);
        if (watchers.length === 0) {
          return (
            <div className="mt-1.5 rounded-lg border border-dashed border-white/[0.06] px-2.5 py-2 text-[10.5px] text-neutral-700">
              nothing watches this column
            </div>
          );
        }
        return (
          <div className="mt-1.5 space-y-1">
            {watchers.map((s) => (
              <button
                key={s.id}
                onClick={() => say(`“${s.name}” is ${s.verb}`)}
                className="flex w-full items-start gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-left hover:border-violet-500/40 hover:bg-violet-500/[0.06]"
              >
                <span className="mt-[1px]">
                  <Cap size={11} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-neutral-300">{s.name}</span>
                  <span className="block text-[10px] leading-snug text-neutral-600">
                    {s.standing ? `waiting for ${s.trigger}` : 'waiting to be asked'}
                  </span>
                </span>
                {s.standing && (
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500/70" />
                )}
              </button>
            ))}
          </div>
        );
      }}
    />
  );
}

// ── 08 · Passport ────────────────────────────────────────────────────────────

function Passport() {
  return (
    <div className="max-w-[420px] rounded-xl border border-white/[0.07] bg-[#141417] p-3">
      <p className="text-[13px] font-medium text-neutral-100">Word study lesson</p>
      <p className="mt-0.5 text-[11.5px] text-neutral-500">Roll &amp; spell typing game</p>

      <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
        How this card got here
      </p>
      <div className="space-y-0">
        {[
          { shroom: 'You', what: 'wrote it from your phone', when: 'Mon' },
          { shroom: 'Triage', what: 'tagged it “lesson” and moved it to Drafting', when: 'Mon' },
          { shroom: 'Spec Writer', what: 'wrote the build brief', when: 'Tue' },
          { shroom: 'App Builder', what: 'built “Roll & Spell” v1', when: '4h ago' },
        ].map((entry, i, all) => (
          <div key={entry.shroom + i} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className="mt-[3px] flex h-4 w-4 items-center justify-center">
                {entry.shroom === 'You' ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                ) : (
                  <Cap size={11} />
                )}
              </span>
              {i < all.length - 1 && <span className="w-px flex-1 bg-white/[0.08]" />}
            </div>
            <div className="pb-2.5">
              <p className="text-[11.5px] leading-snug text-neutral-300">
                <span className="font-medium text-neutral-100">{entry.shroom}</span> {entry.what}
              </p>
              <p className="text-[10px] text-neutral-600">{entry.when}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 09 · Weather ─────────────────────────────────────────────────────────────

function Weather({ say }: ViewProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <p className="flex-1 text-[12.5px] text-neutral-300">
          <span className="text-neutral-500">2 shrooms standing.</span> Triage sorted 3 cards
          today. Monday Digest runs in <span className="text-neutral-100">2 days</span>.
        </p>
        <button
          onClick={() => say('Opened the run history')}
          className="flex-shrink-0 text-[11px] text-neutral-600 hover:text-neutral-300"
        >
          history
        </button>
      </div>
      <Board />
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
        <span className="text-[13px]">⚠</span>
        <p className="flex-1 text-[11.5px] text-amber-200/80">
          Spec Writer hasn&apos;t run in 12 days — nothing has landed in Drafting.
        </p>
        <button
          onClick={() => say('Opened Spec Writer')}
          className="text-[11px] text-amber-200/70 hover:text-amber-100"
        >
          look
        </button>
      </div>
    </div>
  );
}

// ── 10 · Teach from this card ────────────────────────────────────────────────

function TeachFromCard({ say }: ViewProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  return (
    <div className="max-w-[460px]">
      <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-3">
        <p className="text-[13px] font-medium text-neutral-100">Pricing page rewrite</p>
        <p className="mt-1.5 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[11.5px] leading-relaxed text-neutral-400">
          <span className="text-neutral-500">You just:</span> tagged it “marketing”, moved it to
          Drafting, and asked Kan for a brief.
        </p>

        {step === 0 && (
          <button
            onClick={() => setStep(1)}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-500/40 px-3 py-2 text-[12px] text-violet-300 hover:bg-violet-500/[0.08]"
          >
            <Cap size={12} />
            Do this every time?
          </button>
        )}

        {step >= 1 && (
          <div className="mt-2.5 rounded-lg border border-violet-500/35 bg-violet-500/[0.07] p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              <Cap size={11} /> New shroom, from what you did
            </p>
            <p className="text-[12.5px] leading-relaxed text-neutral-200">
              When a card lands in <span className="text-violet-200">Inbox</span> and looks like
              marketing, tag it, move it to <span className="text-violet-200">Drafting</span>, and
              write a brief.
            </p>
            {step === 1 ? (
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => {
                    setStep(2);
                    say('Kan is asking two questions before turning this on');
                  }}
                  className="flex-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-violet-700"
                >
                  Refine with Kan
                </button>
                <button
                  onClick={() => {
                    setStep(0);
                    say('Dismissed');
                  }}
                  className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-neutral-400"
                >
                  Not now
                </button>
              </div>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[11.5px] text-neutral-400">
                  <span className="text-neutral-200">Kan:</span> Should this only fire on cards you
                  didn&apos;t write yourself?
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => say('Shroom created · off until you turn it on')}
                    className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/[0.1]"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => say('Shroom created · off until you turn it on')}
                    className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/[0.1]"
                  >
                    Any card
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Answers = 'running' | 'making' | 'reading';

const ANSWER_LABEL: Record<Answers, string> = {
  running: 'running one',
  making: 'making one',
  reading: 'reading one',
};

const ANSWER_COLOR: Record<Answers, string> = {
  running: '#8b5cf6',
  making: '#10b981',
  reading: '#38bdf8',
};

const OPTIONS: {
  key: string;
  n: number;
  name: string;
  answers: Answers;
  pitch: string;
  component: (p: ViewProps) => React.ReactElement;
}[] = [
  {
    key: 'drop',
    n: 1,
    name: 'Drop to Run',
    answers: 'running',
    pitch:
      'Drag a card onto a shroom. No menu, no Run button — the board already teaches drag, and this is the only invocation that never asks you to leave the card you were looking at. Drag one of the cards above and the rail wakes up.',
    component: DropToRun,
  },
  {
    key: 'sleeve',
    n: 2,
    name: 'Card Sleeve',
    answers: 'running',
    pitch:
      'Every card carries the shrooms that can act on it along its bottom edge, revealed on hover. The most literal reading of “inside the card” — and it answers a question the shroom list cannot: not what exists, but what applies here. Hover any card.',
    component: CardSleeve,
  },
  {
    key: 'say',
    n: 3,
    name: 'Say It',
    answers: 'running',
    pitch:
      'Name a shroom in the composer and it becomes the run. The conversational builder is the part you already like — this extends it from making a shroom to using one, so the same sentence-shaped gesture does both. Edit the text and watch the chip.',
    component: SayIt,
  },
  {
    key: 'orders',
    n: 4,
    name: 'Standing Orders',
    answers: 'making',
    pitch:
      'Stop showing shrooms as objects and show them as sentences the channel obeys. Editing the sentence is editing the automation — which is the conversational builder, moved out of a drawer and onto the board where it is also the documentation. Click a line.',
    component: StandingOrders,
  },
  {
    key: 'trails',
    n: 5,
    name: 'Trails',
    answers: 'reading',
    pitch:
      'The map, drawn on the real board instead of a separate canvas. The graph view failed partly because it made you learn a second picture of your own channel — here the columns light up in place: blue reads, green writes. Hover the caps.',
    component: Trails,
  },
  {
    key: 'ghost',
    n: 6,
    name: 'Ghost Card',
    answers: 'reading',
    pitch:
      'Output appears where it will land, filling in as it works. A run stops being an event you check on afterwards and becomes something happening on the board in front of you — which also removes the need to go looking for what it did.',
    component: GhostCard,
  },
  {
    key: 'understudy',
    n: 7,
    name: 'Column Understudy',
    answers: 'reading',
    pitch:
      'A slot at the foot of each column naming what is watching it and what it is waiting for. Triggers are the least visible thing about a shroom and the most important — this is the only concept that makes a schedule legible without opening anything.',
    component: Understudy,
  },
  {
    key: 'passport',
    n: 8,
    name: 'Passport',
    answers: 'reading',
    pitch:
      'Inside the card: who did what to it, you and the shrooms in one thread. Answers “where did this come from?”, which today has no answer anywhere in the product — and quietly teaches what each shroom does by showing its work.',
    component: () => <Passport />,
  },
  {
    key: 'weather',
    n: 9,
    name: 'Weather',
    answers: 'reading',
    pitch:
      'Not a control surface — a barometer. One line on whether the automations are alive, plus the thing worth knowing: something has stopped firing. A shroom that silently stopped working is the failure mode nothing currently catches.',
    component: Weather,
  },
  {
    key: 'teach',
    n: 10,
    name: 'Teach From This Card',
    answers: 'making',
    pitch:
      'You did a thing by hand; it offers to make that a rule. Authoring at the moment of intent rather than in a builder you have to go and find — and it hands off to the conversational flow to sharpen it, so the good part stays the good part.',
    component: TeachFromCard,
  },
];

export default function ShroomsAlivePage() {
  const [active, setActive] = useState('drop');
  const [log, setLog] = useState<string | null>(null);
  const option = OPTIONS.find((o) => o.key === active)!;
  const View = option.component;

  const say = (msg: string) => setLog(msg);

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-neutral-200">
      <div className="mx-auto max-w-[1080px] px-6 py-12">
        <header className="mb-9">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            Prototype
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Shrooms alive</h1>
          <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-neutral-400">
            An earlier round asked where a shroom should <em>sit</em> on a board. This one takes
            that as settled and goes at what actually makes shrooms feel like a separate app you
            visit: <strong className="text-neutral-300">running one</strong> means leaving the
            board to find a list and press Run,{' '}
            <strong className="text-neutral-300">making one</strong> hides the conversational
            builder — the best part — behind a drawer, and{' '}
            <strong className="text-neutral-300">reading one</strong> was supposed to be the graph
            view, which never worked. Ten answers, same board in each.
          </p>
        </header>

        <div className="mb-6 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                setActive(o.key);
                setLog(null);
              }}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                active === o.key
                  ? 'border-violet-500/45 bg-violet-500/[0.12] text-neutral-50'
                  : 'border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/[0.12] hover:text-neutral-200'
              }`}
            >
              <span
                className={`font-mono text-[10px] ${
                  active === o.key ? 'text-violet-300' : 'text-neutral-600'
                }`}
              >
                {String(o.n).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{o.name}</span>
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ background: ANSWER_COLOR[o.answers] }}
                title={ANSWER_LABEL[o.answers]}
              />
            </button>
          ))}
        </div>

        <div className="mb-5 flex items-start gap-4 border-l-2 border-neutral-800 pl-4">
          <p className="max-w-[70ch] flex-1 text-[13px] leading-relaxed text-neutral-500">
            {option.pitch}
          </p>
          <span
            className="flex-shrink-0 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{
              background: `${ANSWER_COLOR[option.answers]}18`,
              color: ANSWER_COLOR[option.answers],
            }}
          >
            {ANSWER_LABEL[option.answers]}
          </span>
        </div>

        <View say={say} />

        <div className="mt-4 h-5 font-mono text-[11px] text-neutral-600" aria-live="polite">
          {log}
        </div>

        <footer className="mt-16 space-y-3 border-t border-neutral-900 pt-6 text-[12.5px] leading-relaxed text-neutral-600">
          <p className="max-w-[70ch]">
            These are not ten rivals. Running, making and reading are three different problems and
            a real answer takes one of each — the interesting question is which three combine
            without stacking three new pieces of furniture on the board.
          </p>
          <p className="max-w-[70ch]">
            <strong className="text-neutral-500">Trails (5)</strong> is the honest replacement for
            the graph view: the reason a separate map is hard to keep working is that it is a
            second drawing of a thing you already have on screen. Drawing on the board itself
            cannot drift out of date, because it <em>is</em> the board.{' '}
            <strong className="text-neutral-500">Column Understudy (7)</strong> is the cheapest
            real win — it makes triggers visible, which is the single most hidden thing about a
            shroom.
          </p>
          <p className="max-w-[70ch]">
            <strong className="text-neutral-500">Standing Orders (4)</strong> and{' '}
            <strong className="text-neutral-500">Teach From This Card (10)</strong> are the two
            that take the conversational builder seriously — one makes the sentence the permanent
            representation, the other catches intent at the moment it exists. They are also the
            two that would change the data model rather than just the surface.
          </p>
        </footer>
      </div>
    </div>
  );
}
