'use client';

import { useEffect, useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/* ── Thinking indicators ─────────────────────────────────────────
   Replacements for the three bouncing dots. Each keeps the same footprint
   so it can drop into the existing "Kan is thinking..." row. */

export function CurrentDots() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <div key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
      <span className="text-xs text-neutral-400">Kan is thinking...</span>
    </div>
  );
}

/** Cap breathes like something alive, spores drift up from under it. */
export function BreathingCap() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-5 w-5 items-center justify-center">
        <KanthinkIcon size={18} className="text-violet-400 kp-breathe" />
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="kp-spore absolute h-[3px] w-[3px] rounded-full bg-violet-300/70"
            style={{ left: `${4 + i * 5}px`, animationDelay: `${i * 600}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** Gills shimmer left to right — a wave through vertical strokes. */
export function GillShimmer() {
  return (
    <div className="flex items-center gap-2.5">
      <KanthinkIcon size={18} className="text-violet-400/80" />
      <span className="flex items-end gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="kp-gill w-[2px] rounded-full bg-violet-400"
            style={{ animationDelay: `${i * 110}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** Three caps rise and settle in sequence, like a small colony popping up. */
export function PoppingCaps() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex items-end gap-1">
        {[0, 1, 2].map((i) => (
          // The icon takes no style prop, so the delay rides on a wrapper.
          <span key={i} className="kp-pop inline-flex" style={{ animationDelay: `${i * 180}ms` }}>
            <KanthinkIcon size={13} className="text-violet-400" />
          </span>
        ))}
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** A ring of spores orbits the cap — continuous, calm, no bouncing. */
export function SporeOrbit() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-6 w-6 items-center justify-center">
        <span className="kp-orbit absolute inset-0">
          <span className="absolute left-1/2 top-0 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-violet-300" />
          <span className="absolute bottom-0 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-violet-300/50" />
        </span>
        <KanthinkIcon size={15} className="text-violet-400" />
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/* ── Bolder thinking indicators ──────────────────────────────────
   The first set kept the mascot sitting still and animated something near it.
   These change shape, draw themselves, or move the whole mark — meant to be
   noticed rather than tolerated. */

/** Threads branch outward and retract, like a network searching for something. */
export function MyceliumWeb() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-6 w-6 overflow-visible">
        <g stroke="currentColor" className="text-violet-400" strokeWidth="1.2" strokeLinecap="round" fill="none">
          {[
            'M16 16 L6 8', 'M16 16 L27 10', 'M16 16 L8 26',
            'M16 16 L26 25', 'M16 16 L16 4', 'M16 16 L3 17',
          ].map((d, i) => (
            <path key={d} d={d} className="kp-thread" style={{ animationDelay: `${i * 220}ms` }} />
          ))}
        </g>
        {[[6, 8], [27, 10], [8, 26], [26, 25], [16, 4], [3, 17]].map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx} cy={cy} r="1.6"
            className="kp-node fill-violet-300"
            style={{ animationDelay: `${i * 220 + 400}ms` }}
          />
        ))}
        <circle cx="16" cy="16" r="2.6" className="fill-violet-500" />
      </svg>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** The cap morphs like a liquid blob, never settling on one shape. */
export function LiquidCap() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="kp-blob inline-block h-5 w-5 bg-gradient-to-br from-violet-400 to-fuchsia-500" />
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** Rings pulse outward from beneath, like something signalling underground. */
export function SoilRipple() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-6 w-6 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="kp-ripple absolute inset-0 rounded-full border border-violet-400"
            style={{ animationDelay: `${i * 700}ms` }}
          />
        ))}
        <KanthinkIcon size={14} className="relative text-violet-400" />
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** A mushroom grows from spore to full cap, then starts over. */
export function TimeLapseGrowth() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-6 w-6 items-end justify-center overflow-hidden">
        <span className="kp-grow inline-flex origin-bottom">
          <KanthinkIcon size={20} className="text-violet-400" />
        </span>
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/** A light sweeps across the mark, as if reading it line by line. */
export function ScanningBeam() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-md">
        <KanthinkIcon size={19} className="text-violet-500/40" />
        <span className="kp-scan pointer-events-none absolute inset-y-0 w-3 bg-gradient-to-r from-transparent via-violet-200/70 to-transparent" />
      </span>
      <span className="text-xs text-neutral-400">Kan is thinking</span>
    </div>
  );
}

/* ── Working / fetching states ───────────────────────────────────
   The current version is the bare text "Fetching analytics data...".
   These show what is happening and that time is passing. Real progress is
   unknowable for a Mixpanel export, so these show honest stages and elapsed
   time rather than a fake percentage. */

function useElapsed(active: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => setMs(Date.now() - started), 100);
    return () => clearInterval(id);
  }, [active]);
  return ms;
}

/** Stage is a function of elapsed time, so it needs no state of its own. */
function stageFromElapsed(elapsed: number, stageCount: number, dwell = 1600): number {
  return Math.min(Math.floor(elapsed / dwell), stageCount - 1);
}

const ANALYTICS_STAGES = [
  'Reaching Mixpanel',
  'Reading print_order events',
  'Grouping by product',
  'Building the table',
];

export function CurrentFetching() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <span className="text-sm text-neutral-300">Fetching analytics data...</span>
    </div>
  );
}

/** Stage checklist — each step ticks off as it completes. Most informative. */
export function StageChecklist({ active }: { active: boolean }) {
  const elapsed = useElapsed(active);
  const stage = stageFromElapsed(elapsed, ANALYTICS_STAGES.length);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-neutral-300">
          <KanthinkIcon size={14} className="text-violet-400 kp-breathe" />
          Working on your query
        </span>
        <span className="tabular-nums text-[11px] text-neutral-500">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <ul className="space-y-1.5">
        {ANALYTICS_STAGES.map((label, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <li key={label} className="flex items-center gap-2 text-xs">
              <span className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
                done ? 'border-violet-500 bg-violet-500' : current ? 'border-violet-400' : 'border-neutral-700'
              }`}>
                {done && (
                  <svg viewBox="0 0 24 24" className="h-2 w-2 text-neutral-950" fill="none" stroke="currentColor" strokeWidth={4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {current && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />}
              </span>
              <span className={done ? 'text-neutral-500 line-through decoration-neutral-700' : current ? 'text-neutral-200' : 'text-neutral-600'}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Mycelium bar — a growing thread rather than a percentage. */
export function MyceliumBar({ active }: { active: boolean }) {
  const elapsed = useElapsed(active);
  const stage = stageFromElapsed(elapsed, ANALYTICS_STAGES.length);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <KanthinkIcon size={14} className="text-violet-400 kp-breathe" />
        <span className="text-xs text-neutral-300">{ANALYTICS_STAGES[stage]}</span>
        <span className="ml-auto tabular-nums text-[11px] text-neutral-500">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="kp-crawl h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
      </div>
      <p className="mt-2 text-[11px] text-neutral-600">
        Step {stage + 1} of {ANALYTICS_STAGES.length}
      </p>
    </div>
  );
}

/** Compact single line — for places where a full card is too heavy. */
export function CompactPulse({ active }: { active: boolean }) {
  const elapsed = useElapsed(active);
  const stage = stageFromElapsed(elapsed, ANALYTICS_STAGES.length);
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500/40" />
        <KanthinkIcon size={13} className="relative text-violet-400" />
      </span>
      <span className="text-xs text-neutral-300">{ANALYTICS_STAGES[stage]}…</span>
      <span className="ml-auto tabular-nums text-[11px] text-neutral-500">{(elapsed / 1000).toFixed(1)}s</span>
    </div>
  );
}
