'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * How a playground card reads in a column.
 *
 * Constraints this round, from use:
 *  - Title and description render EXACTLY as any other card. No badge above the
 *    title, no icon beside it, no change to spacing. A playground card is a card.
 *  - The building state is the one that already exists — `.card-processing` plus
 *    `isProcessing` (glowing top edge, ambient wash, Kan watermark, status line).
 *    There is no second building animation to design.
 *  - The only licence is a subtle mark that it is a playground, and a bottom area
 *    carrying status and whatever else is worth knowing without opening it.
 *  - No previews. A preview belongs in its own tab.
 *
 * So the five below differ in one thing only: how quietly the card says what it is.
 */

type BuildState = 'draft' | 'building' | 'built' | 'published';

const TITLE = 'Pricing prototype';
const SUMMARY = 'Explores four checkout flows for the $19.95 plan, including a decoy-price variant.';

const STATES: BuildState[] = ['draft', 'building', 'built', 'published'];

/** The shared bottom line. Same content everywhere, so the variants stay comparable. */
function Meta({ state, withLabel = false }: { state: BuildState; withLabel?: boolean }) {
  if (state === 'building') return null;

  const bits: React.ReactNode[] = [];
  if (withLabel) bits.push(<span key="l" className="text-violet-500 dark:text-violet-400 font-medium">Playground</span>);

  if (state === 'draft') {
    bits.push(<span key="s">Not built yet</span>);
  } else {
    bits.push(<span key="v">v4</span>);
    bits.push(
      state === 'published' ? (
        <span key="p" className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Live
        </span>
      ) : (
        <span key="p">Private</span>
      )
    );
    bits.push(<span key="d" className="font-mono">three.js</span>);
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
      {bits.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
          {b}
        </span>
      ))}
    </div>
  );
}

/** Body shared by every variant — deliberately identical to an ordinary card. */
function Body({ state, withLabel }: { state: BuildState; withLabel?: boolean }) {
  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
      <Meta state={state} withLabel={withLabel} />
    </div>
  );
}

/** The existing agent-processing treatment, reproduced exactly. */
function Processing() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://res.cloudinary.com/dcht3dytz/image/upload/f_png,w_128,h_128/v1769532115/kanthink-icon_pbne7q.svg"
        alt=""
        className="absolute bottom-1 right-1 w-16 h-16 opacity-[0.07] pointer-events-none select-none"
      />
      <div className="px-3 pt-2 pb-0">
        <span className="text-[10px] font-medium text-violet-500 dark:text-violet-400">
          Building the app…
        </span>
      </div>
    </>
  );
}

const SHELL = 'relative rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow';

/* ── 1. Nothing but the line ──────────────────────────────────────────────
   No mark at all. The bottom line says "Playground" and that is the entire
   signal. Maximally quiet; you have to read to know.                          */
function JustTheLine({ state }: { state: BuildState }) {
  return (
    <div className={`${SHELL} ${state === 'building' ? 'card-processing' : ''}`}>
      {state === 'building' && <Processing />}
      <Body state={state} withLabel />
    </div>
  );
}

/* ── 2. Corner mark ───────────────────────────────────────────────────────
   A small sparkle in the top-right, absolutely positioned so it costs no
   layout and cannot push the title. Reads as a stamp on the card.             */
function CornerMark({ state }: { state: BuildState }) {
  return (
    <div className={`${SHELL} ${state === 'building' ? 'card-processing' : ''}`}>
      {state === 'building' && <Processing />}
      {state !== 'building' && (
        <svg
          className="absolute top-2.5 right-2.5 w-3 h-3 text-violet-400/70 dark:text-violet-500/60 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      )}
      <Body state={state} />
    </div>
  );
}

/* ── 3. Left hairline ─────────────────────────────────────────────────────
   A 2px violet edge. The card already uses a left border for card.color, so
   this borrows a language the board speaks — and scans down a stack.          */
function Hairline({ state }: { state: BuildState }) {
  return (
    <div
      className={`${SHELL} border-l-2 border-violet-400/70 dark:border-violet-500/50 ${
        state === 'building' ? 'card-processing' : ''
      }`}
    >
      {state === 'building' && <Processing />}
      <Body state={state} />
    </div>
  );
}

/* ── 4. Tinted surface ────────────────────────────────────────────────────
   The card sits on a barely-there violet wash instead of plain white. Marks
   the whole object rather than an edge of it. Subtlest in light mode; check
   it in dark, where tint reads more strongly.                                 */
function Tinted({ state }: { state: BuildState }) {
  return (
    <div
      className={`relative rounded-md bg-violet-50/60 dark:bg-violet-950/20 shadow-sm hover:shadow-md transition-shadow ${
        state === 'building' ? 'card-processing' : ''
      }`}
    >
      {state === 'building' && <Processing />}
      <Body state={state} />
    </div>
  );
}

/* ── 5. Recessed base ─────────────────────────────────────────────────────
   The metadata sits in a slightly inset footer, so the card has a base the
   way a built thing sits on a plinth. Body untouched; the difference is that
   the status has somewhere to live rather than floating under the text.       */
function RecessedBase({ state }: { state: BuildState }) {
  return (
    <div className={`${SHELL} overflow-hidden ${state === 'building' ? 'card-processing' : ''}`}>
      {state === 'building' && <Processing />}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
      </div>
      {state !== 'building' && (
        <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800">
          <div className="-mt-2">
            <Meta state={state} withLabel />
          </div>
        </div>
      )}
    </div>
  );
}

const CONCEPTS = [
  {
    n: 1, name: 'Nothing but the line', Component: JustTheLine,
    blurb: 'No mark at all — the bottom line carries the word "Playground" and that is the whole signal. Quietest possible; you have to read to know.',
  },
  {
    n: 2, name: 'Corner mark', Component: CornerMark,
    blurb: 'A small sparkle top-right, absolutely positioned so it costs no layout and can never push the title. Reads as a stamp.',
  },
  {
    n: 3, name: 'Left hairline', Component: Hairline,
    blurb: 'A 2px violet edge. The card already uses a left border for card.color, so this borrows a language the board speaks — and scans down a stack.',
  },
  {
    n: 4, name: 'Tinted surface', Component: Tinted,
    blurb: 'A barely-there violet wash on the whole card rather than one edge of it. Check it in dark, where tint reads more strongly than in light.',
  },
  {
    n: 5, name: 'Recessed base', Component: RecessedBase,
    blurb: 'Status sits in a slightly inset footer, so it has somewhere to live instead of floating under the description. Body untouched.',
  },
];

export default function PlaygroundCardsPrototype() {
  const [dark, setDark] = useState(true);
  const [mixed, setMixed] = useState(true);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <Link
            href="/prototypes"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Prototypes
          </Link>

          <div className="flex items-start justify-between gap-6 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">Playground cards in a column</h1>
            <div className="flex-shrink-0 flex gap-2">
              <button
                onClick={() => setMixed((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-violet-400 transition-colors"
              >
                {mixed ? 'Hide plain card' : 'Show plain card'}
              </button>
              <button
                onClick={() => setDark((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-violet-400 transition-colors"
              >
                {dark ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed mb-2">
            Title and description are byte-identical to an ordinary card in all five. The building
            state is the existing <code className="font-mono text-[11px] text-violet-500">card-processing</code>{' '}
            treatment, not a new one. The only variable is how quietly the card says what it is.
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-10">
            Leave the plain card on — the real question is whether you can tell them apart in a mixed column.
          </p>

          <div className="space-y-12">
            {CONCEPTS.map(({ n, name, blurb, Component }) => (
              <section key={n}>
                <div className="flex items-baseline gap-2.5 mb-1">
                  <span className="text-[11px] font-mono text-neutral-400">{n}</span>
                  <h2 className="text-base font-semibold">{name}</h2>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xl leading-relaxed mb-4">
                  {blurb}
                </p>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {mixed && (
                    <div className="w-[272px] flex-shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">plain card</div>
                      <div className={SHELL}>
                        <div className="p-3">
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
                            Trial cancellation analysis
                          </h3>
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">
                            Why 40% of trials never reach the second session, from last quarter&apos;s exit surveys.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {STATES.map((s) => (
                    <div key={s} className="w-[272px] flex-shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">{s}</div>
                      <Component state={s} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-16 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold mb-2">Notes</h2>
            <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1.5 leading-relaxed">
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Building is not a variant.</strong>{' '}
                Every concept shows the same existing treatment, so there is only ever one building
                animation on the board no matter which mark you pick.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Today&apos;s badge is gone.</strong>{' '}
                The current gradient &ldquo;Playground&rdquo; pill sits above the title and pushes the
                body down, so a playground card is a different height from its neighbours. None of
                these touch the body.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">1 and 2 are the quietest.</strong>{' '}
                If a playground should feel like an ordinary card that happens to have an app, they
                win. 3 and 4 are for boards where playgrounds are the point.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Cost is not shown.</strong>{' '}
                It lives in Info. Worth checking that it feels far enough away — builds cost real
                money and nothing on the board hints at it.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
