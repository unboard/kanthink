'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Lock, Globe, ExternalLink, Loader2, ArrowLeft,
} from 'lucide-react';

/**
 * How a playground card reads in a column.
 *
 * A playground card is a card whose subject is a built thing, so it needs to carry
 * the same title and description as any card, plus enough state that you can tell at
 * a glance whether it exists yet, whether it's live, and what it's made of — without
 * opening it. Five ways to say that, from "a card with a footer" to "not a card at
 * all", shown at real column width against the real card styling.
 *
 * No live previews here. A preview belongs in its own tab, never inside a card.
 */

type BuildState = 'draft' | 'building' | 'built' | 'published';

interface Demo {
  state: BuildState;
  version?: number;
  libs?: string[];
  cost?: string;
  when?: string;
}

const TITLE = 'Pricing prototype';
const SUMMARY = 'Explores four checkout flows for the $19.95 plan, including a decoy-price variant.';

const STATES: Demo[] = [
  { state: 'draft', when: 'workshopping' },
  { state: 'building', when: 'just now' },
  { state: 'built', version: 4, libs: ['three'], cost: '$0.41', when: '2h ago' },
  { state: 'published', version: 4, libs: ['three', 'd3'], cost: '$0.41', when: '2h ago' },
];

const STATE_LABEL: Record<BuildState, string> = {
  draft: 'Not built yet',
  building: 'Building…',
  built: 'Built',
  published: 'Live',
};

const STATE_DOT: Record<BuildState, string> = {
  draft: 'bg-neutral-400',
  building: 'bg-amber-500',
  built: 'bg-violet-500',
  published: 'bg-emerald-500',
};

/* ── 1. Footer strip ──────────────────────────────────────────────────────
   The smallest possible departure: an ordinary card with one quiet line at the
   bottom. Wins on consistency — a column of these still reads as a column of
   cards. Risk is that it under-signals: at a glance it's just a card.          */
function FooterStrip({ d }: { d: Demo }) {
  return (
    <div className="rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow p-3">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
      <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATE_DOT[d.state]} ${d.state === 'building' ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
          {STATE_LABEL[d.state]}
        </span>
        {d.version && <span className="text-[11px] text-neutral-400">v{d.version}</span>}
        <span className="ml-auto flex items-center gap-1">
          {d.state === 'published' ? (
            <Globe className="w-3 h-3 text-emerald-500" />
          ) : d.version ? (
            <Lock className="w-3 h-3 text-neutral-300 dark:text-neutral-600" />
          ) : null}
        </span>
      </div>
    </div>
  );
}

/* ── 2. Window chrome ─────────────────────────────────────────────────────
   A title bar with traffic lights. You know it's software before you read a
   word, which is the whole job. Costs vertical space, and leans on a Mac
   metaphor that may feel borrowed.                                            */
function WindowChrome({ d }: { d: Demo }) {
  return (
    <div className="rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <span className="w-2 h-2 rounded-full bg-red-400/70" />
        <span className="w-2 h-2 rounded-full bg-amber-400/70" />
        <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
        <span className="ml-1 text-[10px] font-mono text-neutral-400 truncate">
          {d.version ? `v${d.version}` : 'unbuilt'}
        </span>
        {d.state === 'published' && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        )}
        {d.state === 'building' && (
          <Loader2 className="ml-auto w-3 h-3 animate-spin text-amber-500" />
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
      </div>
    </div>
  );
}

/* ── 3. Spec sheet ────────────────────────────────────────────────────────
   Monospace metadata below the description: version, libraries, spend. Treats
   the card as a build record. Densest in information, and the only one that
   shows cost — but the technical register may not suit every board.           */
function SpecSheet({ d }: { d: Demo }) {
  return (
    <div className="rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
        </div>
      </div>
      <div className="mt-2.5 rounded bg-neutral-50 dark:bg-neutral-800/60 px-2 py-1.5 font-mono text-[10px] text-neutral-500 dark:text-neutral-400 space-y-0.5">
        {d.state === 'draft' ? (
          <div className="text-neutral-400 dark:text-neutral-500">no build yet</div>
        ) : d.state === 'building' ? (
          <div className="text-amber-600 dark:text-amber-400">building…</div>
        ) : (
          <>
            <div>
              v{d.version} · {d.state === 'published' ? 'live' : 'private'} · {d.when}
            </div>
            <div className="truncate">
              {(d.libs || []).join(' ')} {d.cost && `· ${d.cost}`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 4. Status-forward ────────────────────────────────────────────────────
   The state is the loudest element — a coloured band across the top and a word
   you read first. Borrowed from deploy dashboards, where "is it live" is the
   only question. Strongest at a glance; risks making every card shout.         */
function StatusForward({ d }: { d: Demo }) {
  const band: Record<BuildState, string> = {
    draft: 'bg-neutral-200 dark:bg-neutral-700',
    building: 'bg-amber-400',
    built: 'bg-violet-500',
    published: 'bg-emerald-500',
  };
  const text: Record<BuildState, string> = {
    draft: 'text-neutral-500 dark:text-neutral-400',
    building: 'text-amber-600 dark:text-amber-400',
    built: 'text-violet-600 dark:text-violet-400',
    published: 'text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className={`h-1 ${band[d.state]} ${d.state === 'building' ? 'animate-pulse' : ''}`} />
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${text[d.state]}`}>
            {STATE_LABEL[d.state]}
          </span>
          {d.version && (
            <span className="text-[10px] font-medium text-neutral-400">v{d.version}</span>
          )}
          {d.state === 'published' && (
            <ExternalLink className="ml-auto w-3 h-3 text-neutral-300 dark:text-neutral-600" />
          )}
        </div>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
      </div>
    </div>
  );
}

/* ── 5. Spine ─────────────────────────────────────────────────────────────
   A coloured left edge does the identifying, so the card body stays exactly as
   it is. Scales best in a dense column — you can scan a stack and see which are
   playgrounds without reading. Subtlest, and colour alone is a weak signal for
   anyone who can't see it, so it carries a chip too.                           */
function Spine({ d }: { d: Demo }) {
  const spine: Record<BuildState, string> = {
    draft: 'bg-neutral-300 dark:bg-neutral-700',
    building: 'bg-amber-400',
    built: 'bg-violet-500',
    published: 'bg-emerald-500',
  };
  return (
    <div className="flex rounded-md bg-white dark:bg-neutral-900 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className={`w-1 flex-shrink-0 ${spine[d.state]} ${d.state === 'building' ? 'animate-pulse' : ''}`} />
      <div className="p-3 min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">{TITLE}</h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-2">{SUMMARY}</p>
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-[9.5px] font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="w-2.5 h-2.5" />
            Playground
          </span>
          {d.version && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[9.5px] font-medium text-neutral-500 dark:text-neutral-400">
              v{d.version}
            </span>
          )}
          {d.state === 'published' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[9.5px] font-medium text-emerald-700 dark:text-emerald-300">
              Live
            </span>
          )}
          {d.state === 'building' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-[9.5px] font-medium text-amber-700 dark:text-amber-300">
              Building…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const CONCEPTS = [
  {
    n: 1,
    name: 'Footer strip',
    blurb: 'An ordinary card with one quiet line at the bottom. Most consistent with the rest of the board — and the least distinguishable at a glance.',
    Component: FooterStrip,
  },
  {
    n: 2,
    name: 'Window chrome',
    blurb: 'A title bar with traffic lights. You know it is software before reading a word. Costs a row of height and borrows a Mac metaphor.',
    Component: WindowChrome,
  },
  {
    n: 3,
    name: 'Spec sheet',
    blurb: 'Monospace build record under the description — version, libraries, spend. The only one that surfaces cost. Technical register.',
    Component: SpecSheet,
  },
  {
    n: 4,
    name: 'Status-forward',
    blurb: 'State is the loudest element, deploy-dashboard style. Strongest at a glance; risks every card shouting for attention.',
    Component: StatusForward,
  },
  {
    n: 5,
    name: 'Spine',
    blurb: 'A coloured left edge identifies it, body unchanged. Scans best in a dense column. Colour alone is weak, so it carries a chip too.',
    Component: Spine,
  },
];

export default function PlaygroundCardsPrototype() {
  const [dark, setDark] = useState(true);

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
            <button
              onClick={() => setDark((v) => !v)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-violet-400 transition-colors"
            >
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed mb-10">
            A playground card carries the same title and description as any card, plus enough
            state to tell — without opening it — whether the app exists, whether it is live, and
            what it is made of. Shown at real column width against real card styling. No live
            previews: a preview belongs in its own tab, never inside a card.
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
                  {STATES.map((d) => (
                    <div key={d.state} className="w-[272px] flex-shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
                        {d.state}
                      </div>
                      <Component d={d} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-16 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold mb-2">What to weigh</h2>
            <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1.5 leading-relaxed">
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Scanning a mixed column.</strong>{' '}
                Most columns hold ordinary cards too. 5 and 1 sit quietly among them; 2 and 4 announce
                themselves. Which is right depends on whether a playground is the exception or the point.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Height.</strong>{' '}
                2 costs a full extra row on every card. In a column of ten, that is a screenful.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Cost visibility.</strong>{' '}
                Only 3 shows spend. Builds cost real money, so a board where that is never visible
                is a board where it accumulates unnoticed.
              </li>
              <li>
                <strong className="text-neutral-700 dark:text-neutral-300">Colour alone.</strong>{' '}
                4 and 5 lean on colour for state. Both carry a word as well, which they must.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
