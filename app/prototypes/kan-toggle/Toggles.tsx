'use client';

import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * Five ways to switch the card composer between writing a note and asking Kan.
 *
 * Today it's two small text buttons that look like nothing, and people miss
 * them. Every one of these is a real switch with Kan riding in the knob — the
 * brief was "easier to see, and fun".
 *
 * One constraint shapes all five: the mascot is a single monochrome path, so
 * he can't blink or change expression. The personality has to come from motion,
 * scale, colour and what happens *around* him.
 */

export interface ToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
}

export interface ToggleOption {
  id: string;
  name: string;
  note: string;
  /** Variants that light up the whole composer, not just the control. */
  lightsUpComposer?: boolean;
  Component: (props: ToggleProps) => React.ReactElement;
}

/** Spores that puff out of the knob when Kan arrives. */
function Spores({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <>
      {[
        { x: -9, y: -11, d: 0 },
        { x: 7, y: -13, d: 0.07 },
        { x: 12, y: -3, d: 0.13 },
      ].map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full bg-cyan-200"
          style={{
            boxShadow: '0 0 6px rgba(103,232,249,.9)',
            ['--sx' as string]: `${s.x}px`,
            ['--sy' as string]: `${s.y}px`,
            animation: `kt-spore .9s cubic-bezier(.1,.7,.3,1) ${s.d}s both`,
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Sprout switch                                                    */
/* ------------------------------------------------------------------ */

function SproutSwitch({ on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="kt-group flex items-center gap-2 rounded-full py-0.5 pr-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
    >
      <span className={on ? 'text-neutral-500' : 'font-medium text-neutral-200'}>Note</span>

      <span
        className={`relative h-[22px] w-[42px] rounded-full border transition-colors duration-200 ${
          on ? 'border-violet-400/60 bg-violet-500/25' : 'border-neutral-600 bg-neutral-700/60'
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] flex h-[16px] w-[16px] items-center justify-center rounded-full transition-all duration-300 ${
            on ? 'bg-violet-500 text-white shadow-[0_0_10px_rgba(167,139,250,.8)]' : 'bg-neutral-400 text-neutral-800'
          }`}
          style={{
            transform: on ? 'translateX(20px)' : 'none',
            transitionTimingFunction: 'cubic-bezier(.34,1.6,.5,1)',
          }}
        >
          <KanthinkIcon size={11} />
          <Spores on={on} />
        </span>
      </span>

      <span className={on ? 'font-medium text-violet-300' : 'text-neutral-500'}>Ask Kan</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 2. He comes up out of the ground                                    */
/* ------------------------------------------------------------------ */

function SproutFromSoil({ on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
    >
      {/* Kan is behind the ground, not clipped by it — so buried means the soil
          bar is drawn over him and only his cap shows above the line. */}
      <span className="relative block h-[26px] w-[48px]">
        <span
          className={`absolute bottom-[3px] left-0 flex h-[15px] w-[15px] items-center justify-center transition-all duration-[420ms] ${
            on ? 'text-violet-300' : 'text-neutral-400'
          }`}
          style={{
            transform: on ? 'translate(30px, -9px) scale(1.4)' : 'translate(4px, -3px) scale(1)',
            transitionTimingFunction: 'cubic-bezier(.3,1.5,.45,1)',
          }}
        >
          <KanthinkIcon size={15} />
          <Spores on={on} />
        </span>

        <span
          aria-hidden
          className={`absolute inset-x-0 bottom-0 h-[13px] rounded-full transition-colors duration-300 ${
            on ? 'bg-violet-500/30 ring-1 ring-inset ring-violet-400/40' : 'bg-neutral-700'
          }`}
        />
      </span>

      <span
        key={on ? 'on' : 'off'}
        className={on ? 'font-medium text-violet-300' : 'text-neutral-400'}
        style={{ animation: 'kt-swap .3s ease-out both' }}
      >
        {on ? 'Kan is up' : 'Just a note'}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 3. The lamp                                                         */
/* ------------------------------------------------------------------ */

function LampSwitch({ on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
    >
      <span
        className={`relative h-[22px] w-[44px] rounded-full border transition-colors duration-300 ${
          on ? 'border-amber-300/50 bg-amber-400/15' : 'border-neutral-600 bg-neutral-800'
        }`}
      >
        {/* Light thrown upward out of the cap. */}
        {on && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-6 left-[26px] h-7 w-10 -translate-x-1/2"
            style={{
              background: 'linear-gradient(to top, rgba(253,230,138,.35), transparent 72%)',
              clipPath: 'polygon(38% 100%, 62% 100%, 100% 0, 0 0)',
              animation: 'kt-lamp .45s ease-out both',
            }}
          />
        )}
        <span
          className={`absolute left-[2px] top-[2px] flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all duration-300 ${
            on
              ? 'bg-amber-300 text-amber-900 shadow-[0_0_14px_rgba(252,211,77,.9)]'
              : 'bg-neutral-700 text-neutral-500'
          }`}
          style={{
            transform: on ? 'translateX(20px)' : 'none',
            transitionTimingFunction: 'cubic-bezier(.34,1.5,.5,1)',
          }}
        >
          <KanthinkIcon size={12} />
        </span>
      </span>

      <span className={on ? 'font-medium text-amber-200' : 'text-neutral-400'}>
        {on ? "Kan's listening" : 'Kan is off'}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 4. The sentence                                                     */
/* ------------------------------------------------------------------ */

function SentenceSwitch({ on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className={`relative flex h-[26px] w-[148px] items-center rounded-full border text-left text-xs transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
        on ? 'border-violet-400/60 bg-violet-500/20 pl-3 pr-[26px]' : 'border-neutral-700 bg-neutral-800 pl-[26px] pr-3'
      }`}
    >
      {/* Violet floods in behind the knob as it crosses. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-violet-500/15 transition-all duration-[350ms]"
        style={{ width: on ? '100%' : '26px' }}
      />
      <span
        className={`absolute left-[3px] top-[3px] z-10 flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-[350ms] ${
          on ? 'bg-violet-500 text-white shadow-[0_0_10px_rgba(167,139,250,.8)]' : 'bg-neutral-600 text-neutral-300'
        }`}
        style={{
          transform: on ? 'translateX(119px)' : 'none',
          transitionTimingFunction: 'cubic-bezier(.34,1.5,.5,1)',
        }}
      >
        <KanthinkIcon size={13} />
        <Spores on={on} />
      </span>

      <span
        key={on ? 'on' : 'off'}
        className={`relative z-0 truncate ${on ? 'text-violet-200' : 'text-neutral-400'}`}
        style={{ animation: 'kt-swap .3s ease-out both' }}
      >
        {on ? 'Asking Kan' : 'Writing a note'}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Nudge him awake                                                  */
/* ------------------------------------------------------------------ */

function WakeHimUp({ on, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="kt-group flex items-center gap-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
    >
      <span
        className={`relative h-[22px] w-[42px] rounded-full border transition-colors duration-300 ${
          on ? 'border-violet-400/60 bg-violet-500/20' : 'border-neutral-700 bg-neutral-800'
        }`}
      >
        {/* Asleep on the left, with a z drifting off him. */}
        {!on && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-[15px] top-[-3px] text-[8px] leading-none text-neutral-500"
            style={{ animation: 'kt-snooze 2.6s ease-in-out infinite' }}
          >
            z
          </span>
        )}

        {/* Listening pulse once he's awake. */}
        {on && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-[1px] top-[1px] h-[20px] w-[20px] rounded-full border border-violet-400/70"
            style={{ animation: 'kt-pulse 1.8s ease-out infinite' }}
          />
        )}

        <span
          className={`kt-wiggle absolute left-[2px] top-[2px] flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all duration-300 ${
            on ? 'bg-violet-500 text-white' : 'bg-neutral-700 text-neutral-500'
          }`}
          style={{
            transform: on ? 'translateX(20px) rotate(0deg)' : 'rotate(-16deg)',
            transitionTimingFunction: 'cubic-bezier(.34,1.6,.5,1)',
          }}
        >
          <KanthinkIcon size={12} />
        </span>

        {/* The question mark he pops up with. */}
        {on && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-[7px] right-[-2px] rounded-full bg-violet-400 px-[4px] text-[8px] font-bold leading-[12px] text-neutral-900"
            style={{ transformOrigin: 'bottom left', animation: 'kt-pop .38s cubic-bezier(.2,1.5,.4,1) .12s both' }}
          >
            ?
          </span>
        )}
      </span>

      <span className={on ? 'font-medium text-violet-300' : 'text-neutral-400'}>
        {on ? 'Ask Kan' : 'Wake Kan'}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

export const TOGGLES: ToggleOption[] = [
  {
    id: 'sprout',
    name: 'Sprout switch',
    note: 'The plain reading of the brief: a real switch, Kan in the knob, a label on each side so nobody has to guess which end is which. He lands with a bounce and puffs spores. Safest of the five.',
    Component: SproutSwitch,
  },
  {
    id: 'soil',
    name: 'Up out of the ground',
    note: 'The track is soil and Kan is buried in it — flick it and he surfaces on the far side, twice the size, above the line of the track. The most mushroom-native, and the one that reads as a character rather than a control.',
    Component: SproutFromSoil,
  },
  {
    id: 'lamp',
    name: 'The lamp',
    note: "His cap is a lamp: switch it on and light spills up over what you're typing, and the whole box warms. Answers \"easier to see\" most directly, because the composer itself changes, not just the toggle.",
    lightsUpComposer: true,
    Component: LampSwitch,
  },
  {
    id: 'sentence',
    name: 'The sentence',
    note: 'One wide pill that says what you are doing in words — "Writing a note" becomes "Asking Kan" as violet floods in behind him. Impossible to misread, and the biggest target to hit on a phone.',
    Component: SentenceSwitch,
  },
  {
    id: 'wake',
    name: 'Nudge him awake',
    note: 'Kan is asleep on the left with a z drifting off him, tipped over at an angle. Flick it and he snaps upright, pops a "?", and sits there pulsing while he listens. Most personality, least conventional.',
    Component: WakeHimUp,
  },
];

/** The two text buttons that ship today, for comparison. */
function CurrentToggle({ on, onChange }: ToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md p-0.5">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(false)}
        className={`rounded px-2 py-0.5 text-xs transition-colors ${
          !on ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        Note
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(true)}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
          on ? 'bg-violet-900/40 text-violet-300' : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        <KanthinkIcon size={12} />
        Ask Kan
      </button>
    </div>
  );
}

export const CURRENT_TOGGLE: ToggleOption = {
  id: 'current',
  name: 'Today',
  note: 'What ships now. Two text buttons with no affordance between them — nothing says these are the two halves of one choice, which is why people miss the Kan half entirely.',
  Component: CurrentToggle,
};

export function ToggleStyles() {
  return (
    <style>{`
      @keyframes kt-spore {
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(.3); }
        20%  { opacity: 1; }
        100% { opacity: 0; transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1); }
      }
      @keyframes kt-swap {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes kt-pop {
        0%   { opacity: 0; transform: scale(.3); }
        70%  { opacity: 1; transform: scale(1.15); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes kt-lamp {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes kt-snooze {
        0%   { opacity: 0; transform: translate(0, 2px) scale(.7); }
        30%  { opacity: .9; }
        100% { opacity: 0; transform: translate(5px, -9px) scale(1.1); }
      }
      @keyframes kt-pulse {
        0%   { opacity: .8; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.75); }
      }
      @keyframes kt-wiggle {
        0%, 100% { rotate: 0deg; }
        25%      { rotate: -9deg; }
        75%      { rotate: 9deg; }
      }
      .kt-group:hover .kt-wiggle { animation: kt-wiggle .5s ease-in-out; }
      @media (prefers-reduced-motion: reduce) {
        .kt-stage *, .kt-stage { animation: none !important; transition-duration: .01ms !important; }
      }
    `}</style>
  );
}
