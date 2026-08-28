'use client';

import { useCallback, useEffect, useState } from 'react';
import { CARDS, ageLabel, type DemoCard } from '../data';

/**
 * 02 — THE SORT
 *
 * Attacks: "deciding requires comparing everything at once."
 *
 * Processing a board is hard for a specific reason, and it isn't laziness. A
 * column of forty cards asks you to make one decision about forty things, which
 * is forty times harder than forty decisions about one thing. So you look at it,
 * feel the weight, and close the tab.
 *
 * So: the board hands you a single card and four exits. No comparison, no
 * scrolling, no choosing where to start. Crucially the session is *finite* — you
 * can see how many are left, and it ends. Kanban has no end state; this does.
 *
 * The stack behind is the only place the backlog is drawn, and it is drawn as
 * thickness rather than as a list. You can feel how much is left without reading
 * a single title of it.
 */

type Verdict = { key: string; label: string; hint: string; tone: string };

const VERDICTS: Verdict[] = [
  { key: '1', label: 'Today', hint: 'Do it now, or today', tone: 'text-emerald-300 border-emerald-400/30 hover:bg-emerald-400/10' },
  { key: '2', label: 'This week', hint: 'Real, but not now', tone: 'text-violet-300 border-violet-400/30 hover:bg-violet-400/10' },
  { key: '3', label: 'Waiting', hint: 'Somebody else has it', tone: 'text-amber-300 border-amber-400/30 hover:bg-amber-400/10' },
  { key: '4', label: 'Let it go', hint: 'It was never going to happen', tone: 'text-white/45 border-white/15 hover:bg-white/[0.06]' },
];

export default function Sort() {
  // Oldest first, deliberately. Start with what has been rotting the longest.
  const queue: DemoCard[] = [...CARDS.filter((c) => c.column === 'inbox' || c.column === 'someday')].sort(
    (a, b) => b.age - a.age
  );

  const [i, setI] = useState(0);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [leaving, setLeaving] = useState<string | null>(null);

  const decide = useCallback(
    (v: Verdict) => {
      if (i >= queue.length || leaving) return;
      setLeaving(v.label);
      setTally((t) => ({ ...t, [v.label]: (t[v.label] ?? 0) + 1 }));
      setTimeout(() => {
        setI((n) => n + 1);
        setLeaving(null);
      }, 180);
    },
    [i, queue.length, leaving]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = VERDICTS.find((x) => x.key === e.key);
      if (v) decide(v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide]);

  const card = queue[i];
  const remaining = queue.length - i;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Progress as a hairline, not a widget. */}
      <div className="h-px w-full shrink-0 bg-white/[0.07]">
        <div
          className="h-px bg-violet-400/70 transition-all duration-300"
          style={{ width: `${(i / queue.length) * 100}%` }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
        {card ? (
          <>
            <p className="mb-10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
              {remaining} left · {ageLabel(card.age)} untouched
            </p>

            {/* The card, with the remainder of the queue drawn behind it as depth. */}
            <div className="relative w-full max-w-xl">
              {[2, 1].map((d) =>
                queue[i + d] ? (
                  <div
                    key={d}
                    className="absolute inset-x-0 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                    style={{ top: -d * 8, bottom: d * 8, transform: `scale(${1 - d * 0.035})` }}
                  />
                ) : null
              )}

              <div
                className={`relative rounded-lg border border-white/12 bg-[#141414] px-7 py-10 transition-all duration-150 sm:px-10 sm:py-14 ${
                  leaving ? 'translate-y-2 scale-[0.97] opacity-0' : 'opacity-100'
                }`}
              >
                <h2 className="text-3xl font-light leading-[1.15] tracking-tight text-white sm:text-[42px]">
                  {card.title}
                </h2>
                {card.note && <p className="mt-4 text-base font-light text-white/40">{card.note}</p>}
              </div>
            </div>

            <div className="mt-10 grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
              {VERDICTS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => decide(v)}
                  title={v.hint}
                  className={`rounded-md border px-3 py-4 text-left transition-colors ${v.tone}`}
                >
                  <span className="block font-mono text-[10px] text-white/25">{v.key}</span>
                  <span className="mt-1.5 block text-sm">{v.label}</span>
                </button>
              ))}
            </div>

            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/20">
              Keys 1–4
            </p>
          </>
        ) : (
          <div className="w-full max-w-xl text-center">
            <h2 className="text-4xl font-light tracking-tight text-white sm:text-5xl">Empty.</h2>
            <p className="mt-4 text-lg font-light text-white/40">
              {queue.length} cards, and the inbox no longer exists.
            </p>

            <dl className="mx-auto mt-10 max-w-sm">
              {VERDICTS.map((v) => (
                <div key={v.key} className="flex items-baseline justify-between border-b border-white/[0.06] py-3">
                  <dt className="text-sm font-light text-white/60">{v.label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-white/80">{tally[v.label] ?? 0}</dd>
                </div>
              ))}
            </dl>

            <button
              onClick={() => {
                setI(0);
                setTally({});
              }}
              className="mt-10 rounded-md border border-white/15 px-5 py-2.5 text-sm text-white/60 transition-colors hover:border-white/30 hover:text-white"
            >
              Run it again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
