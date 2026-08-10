'use client';

import { useEffect, useRef, useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * Five alternatives to the "Saved ✓" screen that ends a share into Kanthink.
 *
 * The brief: the moment should feel like a small win. It should not promise
 * what Kan will do with the thing, because at this point nobody knows yet — so
 * every variant celebrates the catch, not the outcome.
 */

export interface ConfirmProps {
  title: string;
  channelName: string;
  columnName: string;
}

export interface ConfirmOption {
  id: string;
  name: string;
  note: string;
  Component: (props: ConfirmProps) => React.ReactElement;
}

/** Shared footer. Deliberately quiet — the celebration is above it. */
function Actions({ channelName, tone = 'violet' }: { channelName: string; tone?: 'violet' | 'amber' }) {
  const link = tone === 'amber' ? 'text-amber-300/90 hover:text-amber-200' : 'text-violet-300 hover:text-violet-200';
  return (
    <div
      className="mt-7 flex flex-col items-center gap-2.5 sc-anim"
      style={{ animation: 'sc-rise .5s cubic-bezier(.2,.8,.3,1) 1.05s both' }}
    >
      <button className={`text-[13px] underline underline-offset-4 ${link}`}>
        Open {channelName}
      </button>
      <button className="text-xs text-neutral-500 hover:text-neutral-300">Done</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Spore burst                                                      */
/* ------------------------------------------------------------------ */

const SPORES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.18 : 0);
  const dist = 64 + (i % 4) * 26;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist - 10,
    size: 2 + (i % 3) * 1.5,
    delay: 0.34 + (i % 5) * 0.03,
    dur: 1 + (i % 4) * 0.25,
  };
});

function SporeBurst({ title, channelName, columnName }: ConfirmProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-7 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <span
          className="absolute h-24 w-24 rounded-full border border-violet-400/70"
          style={{ animation: 'sc-ring 1.1s cubic-bezier(.15,.7,.3,1) .3s both' }}
        />
        <span
          className="absolute h-24 w-24 rounded-full border border-cyan-300/50"
          style={{ animation: 'sc-ring 1.3s cubic-bezier(.15,.7,.3,1) .42s both' }}
        />
        {SPORES.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-cyan-200"
            style={{
              width: s.size,
              height: s.size,
              boxShadow: '0 0 8px rgba(103,232,249,.9)',
              ['--sx' as string]: `${s.x}px`,
              ['--sy' as string]: `${s.y}px`,
              animation: `sc-spore ${s.dur}s cubic-bezier(.1,.7,.3,1) ${s.delay}s both`,
            }}
          />
        ))}
        <KanthinkIcon
          size={62}
          className="relative text-violet-300 drop-shadow-[0_0_18px_rgba(167,139,250,.55)]"
        />
      </div>

      <p
        className="mt-5 text-[26px] font-semibold leading-tight tracking-tight text-white"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .5s both' }}
      >
        Into the mycelium
      </p>
      <p
        className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .68s both' }}
      >
        {title}
      </p>
      <p
        className="mt-3.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] uppercase tracking-wide text-violet-300"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .84s both' }}
      >
        {channelName} · {columnName}
      </p>

      <Actions channelName={channelName} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. It lands on the board                                            */
/* ------------------------------------------------------------------ */

function BoardLanding({ title, channelName, columnName }: ConfirmProps) {
  const columns = ['Raw ideas', columnName, 'Later'];
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex w-full items-end gap-2" style={{ height: 168 }}>
        {columns.map((name, i) => {
          const isTarget = i === 1;
          return (
            <div key={name} className="relative min-w-0 flex-1">
              <p
                className={`mb-1.5 truncate text-[10px] uppercase tracking-wide ${
                  isTarget ? 'text-violet-300' : 'text-neutral-600'
                }`}
              >
                {name}
              </p>
              <div
                className="relative rounded-lg border border-neutral-800 bg-neutral-900/70 p-1.5"
                style={
                  isTarget
                    ? { animation: 'sc-columnglow 1.2s ease-out .35s both', height: 132 }
                    : { height: 132 }
                }
              >
                {/* resident cards, so the new one has somewhere to land */}
                {[0, 1].map((c) => (
                  <div key={c} className="mb-1.5 h-6 rounded bg-neutral-800/80" />
                ))}

                {isTarget && (
                  <>
                    <div
                      className="overflow-hidden rounded bg-gradient-to-br from-violet-500 to-violet-700 px-1.5 py-1 text-left shadow-lg shadow-violet-900/50"
                      style={{ animation: 'sc-fly 1s cubic-bezier(.2,.9,.3,1) .1s both' }}
                    >
                      <p className="truncate text-[8px] font-medium leading-tight text-white">{title}</p>
                      <p className="mt-0.5 text-[7px] text-violet-200/80">just now</p>
                    </div>
                    <span
                      className="absolute -top-1 left-1/2 -translate-x-1/2 text-xs font-semibold text-violet-300"
                      style={{ animation: 'sc-plusone 1.1s ease-out .55s both' }}
                    >
                      +1
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-white"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .75s both' }}
      >
        It&rsquo;s on the board
      </p>
      <p
        className="mt-2 text-sm text-neutral-400"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .9s both' }}
      >
        Top of <span className="text-neutral-200">{columnName}</span> in {channelName}
      </p>

      <Actions channelName={channelName} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Kan catches it                                                   */
/* ------------------------------------------------------------------ */

function KanCatch({ title, channelName, columnName }: ConfirmProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-7 text-center">
      <div className="relative flex h-[190px] w-full items-end justify-center">
        {/* the thing you shared, falling in */}
        <div
          className="absolute left-1/2 top-0 w-[190px] -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-left shadow-xl"
          style={{ animation: 'sc-catchdrop 1.15s cubic-bezier(.4,.1,.3,1) .05s both' }}
        >
          <p className="truncate text-[11px] font-medium text-neutral-100">{title}</p>
          <p className="mt-0.5 text-[9px] text-neutral-500">shared just now</p>
        </div>

        {/* impact flash on the cap */}
        <span
          className="absolute bottom-[74px] h-16 w-16 rounded-full bg-violet-400/40 blur-xl"
          style={{ animation: 'sc-flash .7s ease-out .78s both' }}
        />

        <div className="relative" style={{ transformOrigin: 'bottom center', animation: 'sc-squash 1s cubic-bezier(.3,.9,.4,1) .55s both' }}>
          <KanthinkIcon size={96} className="text-violet-300" />
        </div>

        {/* speech bubble */}
        <div
          className="absolute right-3 top-16 rounded-2xl rounded-br-md bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-900 shadow-lg"
          style={{ transformOrigin: 'bottom right', animation: 'sc-pop .5s cubic-bezier(.2,1.4,.4,1) 1s both' }}
        >
          Got it.
        </div>
      </div>

      <p
        className="mt-4 text-[26px] font-semibold leading-tight tracking-tight text-white"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) 1.05s both' }}
      >
        Kan caught it
      </p>
      <p
        className="mt-2 text-sm text-neutral-400"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) 1.18s both' }}
      >
        Sitting in {channelName} · {columnName}
      </p>

      <Actions channelName={channelName} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Collected — specimen stamp                                       */
/* ------------------------------------------------------------------ */

function SpecimenStamp({ title, channelName, columnName }: ConfirmProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-7 text-center">
      <div
        className="relative w-full rounded-md border border-neutral-700/80 bg-[#141210] px-4 pb-16 pt-4 text-left shadow-2xl"
        style={{ animation: 'sc-thud 1s cubic-bezier(.3,.9,.4,1) .1s both' }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
          Specimen 0448
        </p>
        <p className="mt-2 line-clamp-2 font-mono text-[13px] leading-relaxed text-neutral-200">
          {title}
        </p>
        <div className="mt-3 space-y-1 font-mono text-[10px] text-neutral-600">
          <p>CHANNEL &nbsp;{channelName}</p>
          <p>FILED &nbsp;&nbsp;&nbsp;&nbsp;{columnName}</p>
        </div>

        {/* the stamp */}
        <div
          className="absolute -bottom-3 right-3"
          style={{ animation: 'sc-stamp .9s cubic-bezier(.25,.9,.3,1) .35s both' }}
        >
          <div className="rounded border-[3px] border-amber-400/85 px-3 py-1.5 text-amber-300/90 mix-blend-screen">
            <p className="text-[17px] font-black uppercase tracking-[0.14em] leading-none">Collected</p>
            <p className="mt-1 text-center font-mono text-[8px] uppercase tracking-[0.2em] opacity-80">
              Kanthink field kit
            </p>
          </div>
        </div>
        <span
          className="pointer-events-none absolute -bottom-2 right-6 h-12 w-32 rounded-full bg-amber-300/20 blur-lg"
          style={{ animation: 'sc-flash .6s ease-out .58s both' }}
        />
      </div>

      <p
        className="mt-8 text-lg font-medium text-neutral-200"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .8s both' }}
      >
        Added to the collection
      </p>

      <Actions channelName={channelName} tone="amber" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Streak ring                                                      */
/* ------------------------------------------------------------------ */

const TARGET_COUNT = 128;

function StreakRing({ title, channelName, columnName }: ConfirmProps) {
  const [count, setCount] = useState(TARGET_COUNT - 12);
  const raf = useRef<number>(0);

  // Counting up is the whole point of this one, so it runs in JS rather than
  // CSS — the number has to land on the real total.
  useEffect(() => {
    const from = TARGET_COUNT - 12;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(from + (TARGET_COUNT - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    const delay = window.setTimeout(() => { raf.current = requestAnimationFrame(tick); }, 300);
    return () => { window.clearTimeout(delay); cancelAnimationFrame(raf.current); };
  }, []);

  const circumference = 2 * Math.PI * 56;

  return (
    <div className="flex h-full flex-col items-center justify-center px-7 text-center">
      <div className="relative flex h-[150px] w-[150px] items-center justify-center">
        <svg viewBox="0 0 128 128" className="absolute h-full w-full -rotate-90">
          <circle cx="64" cy="64" r="56" fill="none" stroke="rgb(38 38 38)" strokeWidth="5" />
          <circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="url(#sc-grad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{
              ['--circ' as string]: `${circumference}`,
              animation: 'sc-sweep 1.1s cubic-bezier(.25,.8,.3,1) .25s both',
            }}
          />
          <defs>
            <linearGradient id="sc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{ animation: 'sc-pop .5s cubic-bezier(.2,1.3,.4,1) .2s both' }}>
          <p className="text-[44px] font-semibold leading-none tracking-tight text-white tabular-nums">
            {count}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-neutral-500">collected</p>
        </div>
      </div>

      <p
        className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-white"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .75s both' }}
      >
        Sixth this week
      </p>
      <p
        className="mt-2 line-clamp-1 text-sm text-neutral-400"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .88s both' }}
      >
        {title}
      </p>

      <div
        className="mt-4 flex items-center gap-1.5"
        style={{ animation: 'sc-rise .55s cubic-bezier(.2,.8,.3,1) .98s both' }}
      >
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
          const filled = i <= 4;
          const today = i === 4;
          return (
            <span
              key={i}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] ${
                today
                  ? 'bg-violet-500 text-white'
                  : filled
                    ? 'bg-violet-500/25 text-violet-200'
                    : 'border border-neutral-800 text-neutral-700'
              }`}
              style={today ? { animation: 'sc-pop .45s cubic-bezier(.2,1.5,.4,1) 1.12s both' } : undefined}
            >
              {d}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-neutral-600">
        {channelName} · {columnName}
      </p>

      <Actions channelName={channelName} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The current screen, for side-by-side comparison. */
function CurrentSaved({ title, channelName }: ConfirmProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-7 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
        <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="mb-1 font-medium text-white">Saved</p>
      <p className="truncate text-sm text-neutral-400">{title}</p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <button className="text-sm text-violet-400 underline underline-offset-2">Open {channelName}</button>
        <button className="text-xs text-neutral-500">Done</button>
      </div>
    </div>
  );
}

export const CONFIRMATIONS: ConfirmOption[] = [
  {
    id: 'spores',
    name: 'Spore burst',
    note: 'Kan blooms and throws spores. The most on-brand of the five — it reads as the thing entering a living system rather than a form submitting.',
    Component: SporeBurst,
  },
  {
    id: 'board',
    name: 'It lands on the board',
    note: 'A miniature board, and your card flies in and settles on top of the column you chose. Shows you the place, not a promise.',
    Component: BoardLanding,
  },
  {
    id: 'catch',
    name: 'Kan catches it',
    note: 'The link drops and Kan takes the hit — squash, flash, "Got it." Most personality, and the one that carries the mascot furthest.',
    Component: KanCatch,
  },
  {
    id: 'stamp',
    name: 'Collected',
    note: 'A specimen slip with a stamp that thuds down. Tactile and collector-ish; leans on the field-kit language the shroom cards use.',
    Component: SpecimenStamp,
  },
  {
    id: 'streak',
    name: 'Sixth this week',
    note: 'Counts up your running total and lights up today. The dopamine comes from the streak, not the single save — riskiest, since it can nag on a quiet week.',
    Component: StreakRing,
  },
];

export const CURRENT: ConfirmOption = {
  id: 'current',
  name: 'Today',
  note: 'The green tick that ships now, for comparison.',
  Component: CurrentSaved,
};

/** One stylesheet for every variant. Rendered once by the page. */
export function ConfirmStyles() {
  return (
    <style>{`
      @keyframes sc-rise {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes sc-pop {
        0%   { opacity: 0; transform: scale(.4); }
        70%  { opacity: 1; transform: scale(1.08); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes sc-ring {
        0%   { opacity: .9; transform: scale(.35); }
        100% { opacity: 0;  transform: scale(2.5); }
      }
      @keyframes sc-spore {
        0%   { opacity: 0; transform: translate(0,0) scale(.3); }
        18%  { opacity: 1; }
        100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(1); }
      }
      @keyframes sc-fly {
        0%   { opacity: 0; transform: translate(64px, -150px) rotate(10deg) scale(1.25); }
        22%  { opacity: 1; }
        72%  { transform: translate(0, 5px) rotate(-1.5deg) scale(1); }
        86%  { transform: translate(0, -3px); }
        100% { opacity: 1; transform: none; }
      }
      @keyframes sc-columnglow {
        0%, 45%  { box-shadow: none; }
        62%      { box-shadow: 0 0 0 2px rgba(167,139,250,.8), 0 0 34px rgba(139,92,246,.55); }
        100%     { box-shadow: 0 0 0 1px rgba(167,139,250,.3); }
      }
      @keyframes sc-plusone {
        0%, 40%  { opacity: 0; transform: translateY(4px); }
        55%      { opacity: 1; }
        100%     { opacity: 0; transform: translateY(-26px); }
      }
      @keyframes sc-catchdrop {
        0%   { opacity: 0; transform: translate(-50%, -110px) rotate(-7deg) scale(1.05); }
        25%  { opacity: 1; }
        62%  { opacity: 1; transform: translate(-50%, 86px) rotate(1deg) scale(.92); }
        100% { opacity: 0; transform: translate(-50%, 96px) rotate(1deg) scale(.5); }
      }
      @keyframes sc-squash {
        0%, 20%  { transform: scale(1, 1); }
        30%      { transform: scale(1.16, .84); }
        48%      { transform: scale(.94, 1.07); }
        70%      { transform: scale(1.03, .98); }
        100%     { transform: scale(1, 1); }
      }
      @keyframes sc-flash {
        0%   { opacity: 0; transform: scale(.4); }
        30%  { opacity: 1; transform: scale(1.1); }
        100% { opacity: 0; transform: scale(1.5); }
      }
      @keyframes sc-thud {
        0%   { opacity: 0; transform: translateY(-14px) scale(.97); }
        40%  { opacity: 1; transform: none; }
        58%  { transform: translateY(3px) scale(1.008); }
        72%  { transform: translateY(-1px); }
        100% { transform: none; }
      }
      @keyframes sc-stamp {
        0%   { opacity: 0; transform: rotate(-26deg) scale(2.8); }
        45%  { opacity: 1; }
        62%  { transform: rotate(-9deg) scale(.95); }
        76%  { transform: rotate(-9deg) scale(1.05); }
        100% { opacity: 1; transform: rotate(-9deg) scale(1); }
      }
      @keyframes sc-sweep {
        from { stroke-dashoffset: var(--circ); }
        to   { stroke-dashoffset: calc(var(--circ) * 0.12); }
      }
      @media (prefers-reduced-motion: reduce) {
        .sc-stage *, .sc-stage { animation-duration: .01ms !important; animation-delay: 0ms !important; }
      }
    `}</style>
  );
}
