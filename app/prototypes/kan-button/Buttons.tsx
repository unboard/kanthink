'use client';

import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * Ten push buttons for bringing Kan into a message.
 *
 * The model underneath all of them is the same, and it isn't a mode: pressing
 * the button puts `@kan` at the front of what you're about to send. Typing
 * `@kan` yourself does exactly the same thing — the button is the shortcut, not
 * the mechanism. So the placeholder never changes, because the field is just a
 * field, and the only thing that appears is the mention.
 *
 * They latch, walkie-talkie style: press to open the channel, press again to
 * close it. Every one of them has to answer "is Kan on this message or not?"
 * from across the room.
 */

export interface ButtonProps {
  on: boolean;
  onChange: (on: boolean) => void;
}

export interface ButtonOption {
  id: string;
  name: string;
  note: string;
  Component: (props: ButtonProps) => React.ReactElement;
}

/** Signal arcs, for the variants that broadcast. */
function Signal({ on, className = '' }: { on: boolean; className?: string }) {
  if (!on) return null;
  return (
    <span aria-hidden className={`pointer-events-none absolute ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute rounded-full border border-violet-400/80"
          style={{
            inset: `${-3 - i * 4}px`,
            animation: `kb-signal 1.6s ease-out ${i * 0.22}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* 1 ---------------------------------------------------------------- */

function PushToTalk({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-100 active:translate-y-[2px] ${
        on
          ? 'translate-y-[3px] border-violet-400/70 bg-violet-600 text-white shadow-none'
          : 'border-neutral-600 bg-neutral-700 text-neutral-200 shadow-[0_3px_0_rgb(64,64,64)]'
      }`}
    >
      <span
        className={`h-[6px] w-[6px] rounded-full transition-colors ${
          on ? 'kb-blink bg-red-400 shadow-[0_0_6px_rgba(248,113,113,.9)]' : 'bg-neutral-500'
        }`}
      />
      <KanthinkIcon size={12} />
      {on ? 'On air' : 'Chat with Kan'}
    </button>
  );
}

/* 2 ---------------------------------------------------------------- */

function RubberButton({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 text-[11px]"
    >
      <span
        className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-full transition-all duration-150 ${
          on
            ? 'scale-[.92] text-white shadow-[inset_0_2px_5px_rgba(0,0,0,.55)]'
            : 'text-neutral-200 shadow-[0_2px_4px_rgba(0,0,0,.5),inset_0_-2px_3px_rgba(0,0,0,.35),inset_0_2px_2px_rgba(255,255,255,.18)]'
        }`}
        style={{
          background: on
            ? 'radial-gradient(circle at 50% 40%, #a78bfa, #6d28d9)'
            : 'radial-gradient(circle at 50% 32%, #525252, #262626)',
        }}
      >
        <KanthinkIcon size={14} />
        <Signal on={on} className="inset-0" />
      </span>
      <span className={on ? 'font-medium text-violet-300' : 'text-neutral-400'}>
        {on ? 'Kan is on this one' : 'Chat with Kan'}
      </span>
    </button>
  );
}

/* 3 ---------------------------------------------------------------- */

function Keycap({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 text-[11px]"
    >
      <span
        className={`relative flex h-[26px] w-[38px] items-end justify-center rounded-[5px] pb-[3px] transition-all duration-100 ${
          on ? 'bg-neutral-900' : 'bg-neutral-900'
        }`}
        style={{ boxShadow: on ? 'inset 0 1px 3px rgba(0,0,0,.8)' : '0 2px 0 #171717' }}
      >
        <span
          className={`flex h-[20px] w-[34px] items-center justify-center rounded-[4px] font-mono text-[9px] font-bold tracking-wider transition-all duration-100 ${
            on
              ? 'translate-y-[2px] bg-violet-600 text-white shadow-[0_0_10px_rgba(139,92,246,.7)]'
              : 'bg-neutral-700 text-neutral-300 shadow-[0_2px_0_#404040]'
          }`}
        >
          KAN
        </span>
      </span>
      <span className={on ? 'font-medium text-violet-300' : 'text-neutral-400'}>
        {on ? 'Key down' : 'Chat with Kan'}
      </span>
    </button>
  );
}

/* 4 ---------------------------------------------------------------- */

function Antenna({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="relative flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-700 px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition-all duration-150 active:translate-y-[1px]"
      style={
        on
          ? { background: '#6d28d9', borderColor: 'rgba(167,139,250,.6)', color: '#fff' }
          : undefined
      }
    >
      {/* The aerial telescopes out of the top-right when the channel opens. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-[7px] top-0 w-[2px] origin-bottom rounded-full bg-violet-300 transition-all duration-300"
        style={{ height: on ? 14 : 0, transform: `translateY(${on ? -14 : 0}px)` }}
      />
      {on && (
        <span
          aria-hidden
          className="kb-blip pointer-events-none absolute right-[4px] top-[-18px] h-[7px] w-[7px] rounded-full bg-violet-300"
          style={{ boxShadow: '0 0 8px rgba(167,139,250,.95)' }}
        />
      )}
      <KanthinkIcon size={12} />
      {on ? 'Channel open' : 'Chat with Kan'}
    </button>
  );
}

/* 5 ---------------------------------------------------------------- */

function Intercom({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-2 rounded-lg border px-1.5 py-1 transition-colors duration-200 ${
        on ? 'border-amber-300/40 bg-amber-400/10' : 'border-neutral-700 bg-neutral-800/80'
      }`}
    >
      <span
        className={`flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-150 ${
          on
            ? 'bg-amber-300 text-amber-900 shadow-[inset_0_2px_4px_rgba(120,53,15,.5),0_0_12px_rgba(252,211,77,.8)]'
            : 'bg-neutral-600 text-neutral-300 shadow-[0_1px_2px_rgba(0,0,0,.6)]'
        }`}
      >
        <KanthinkIcon size={11} />
      </span>
      <span
        className={`pr-1 font-mono text-[9px] uppercase tracking-[0.15em] ${
          on ? 'text-amber-200' : 'text-neutral-500'
        }`}
      >
        {on ? 'Talking' : 'Talk to Kan'}
      </span>
    </button>
  );
}

/* 6 ---------------------------------------------------------------- */

function ShutterRing({ on, onChange }: ButtonProps) {
  const c = 2 * Math.PI * 13;
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2.5 text-[11px]"
    >
      <span className="relative flex h-[30px] w-[30px] items-center justify-center">
        <svg viewBox="0 0 30 30" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="15" cy="15" r="13" fill="none" stroke="rgb(64 64 64)" strokeWidth="2" />
          <circle
            cx="15"
            cy="15"
            r="13"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={on ? 0 : c}
            style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.3,.9,.3,1)' }}
          />
        </svg>
        <span
          className={`flex h-[20px] w-[20px] items-center justify-center rounded-full transition-all duration-200 ${
            on ? 'scale-95 bg-violet-500 text-white' : 'bg-neutral-700 text-neutral-400'
          }`}
        >
          <KanthinkIcon size={12} />
        </span>
      </span>
      <span className={on ? 'font-medium text-violet-300' : 'text-neutral-400'}>
        {on ? 'Locked on Kan' : 'Chat with Kan'}
      </span>
    </button>
  );
}

/* 7 ---------------------------------------------------------------- */

function BoopKan({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className="kb-boop-group flex items-end gap-2 text-[11px]"
    >
      {/* He is the button. Press the cap. */}
      <span className="relative flex h-[28px] w-[28px] items-end justify-center">
        <span
          className={`kb-boop origin-bottom transition-all duration-150 ${
            on ? 'text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,.85)]' : 'text-neutral-500'
          }`}
          style={{ transform: on ? 'scaleY(.86) scaleX(1.08)' : 'none' }}
        >
          <KanthinkIcon size={26} />
        </span>
        {on && (
          <>
            {[
              { x: -11, y: -13 },
              { x: 9, y: -15 },
              { x: 13, y: -5 },
            ].map((s, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full bg-cyan-200"
                style={{
                  boxShadow: '0 0 6px rgba(103,232,249,.9)',
                  ['--sx' as string]: `${s.x}px`,
                  ['--sy' as string]: `${s.y}px`,
                  animation: `kb-spore .9s cubic-bezier(.1,.7,.3,1) ${i * 0.07}s both`,
                }}
              />
            ))}
          </>
        )}
      </span>
      <span className={`pb-1 ${on ? 'font-medium text-violet-300' : 'text-neutral-400'}`}>
        {on ? 'Kan is in' : 'Chat with Kan'}
      </span>
    </button>
  );
}

/* 8 ---------------------------------------------------------------- */

function CordedHandset({ on, onChange }: ButtonProps) {
  return (
    <span className="flex items-center">
      {/* The cord runs back to the composer, and snaps taut when you key it. */}
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden className="flex-shrink-0">
        <path
          d={on ? 'M0 9 q3-6 6 0 t6 0 t6 0 t6 0' : 'M0 9 q2-7 4 0 t4 0 t4 0 t4 0 t4 0 t4 0'}
          fill="none"
          stroke={on ? '#a78bfa' : '#525252'}
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{ transition: 'stroke .2s' }}
          className={on ? 'kb-cord' : ''}
        />
      </svg>
      <button
        type="button"
        aria-pressed={on}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(!on)}
        className={`-ml-1 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-95 ${
          on
            ? 'border-violet-400/60 bg-violet-600 text-white shadow-[0_0_14px_rgba(139,92,246,.55)]'
            : 'border-neutral-600 bg-neutral-700 text-neutral-200'
        }`}
      >
        <KanthinkIcon size={12} />
        {on ? 'Keyed' : 'Chat with Kan'}
      </button>
    </span>
  );
}

/* 9 ---------------------------------------------------------------- */

function MicBar({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className={`flex w-[168px] items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-100 ${
        on
          ? 'translate-y-[2px] border-violet-400/60 bg-violet-500/25 text-violet-100 shadow-none'
          : 'border-neutral-700 bg-neutral-750 bg-neutral-700/70 text-neutral-300 shadow-[0_2px_0_rgb(38,38,38)]'
      }`}
    >
      <KanthinkIcon size={12} />
      <span>{on ? 'Channel open' : 'Chat with Kan'}</span>
      {/* Live only while the channel is. */}
      <span className="ml-auto flex h-[12px] items-end gap-[2px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`w-[2px] rounded-full ${on ? 'kb-wave bg-violet-300' : 'bg-neutral-600'}`}
            style={{ height: on ? undefined : 3, animationDelay: `${i * 0.11}s` }}
          />
        ))}
      </span>
    </button>
  );
}

/* 10 --------------------------------------------------------------- */

function HardShadow({ on, onChange }: ButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-[3px] text-[11px] font-bold transition-all duration-100 ${
        on
          ? 'translate-x-[3px] translate-y-[3px] border-violet-300 bg-violet-500 text-white shadow-none'
          : 'border-neutral-200 bg-neutral-100 text-neutral-900 shadow-[3px_3px_0_rgb(167,139,250)]'
      }`}
    >
      <KanthinkIcon size={12} />
      {on ? 'KAN IS IN' : 'CHAT WITH KAN'}
    </button>
  );
}

/* ------------------------------------------------------------------ */

export const BUTTONS: ButtonOption[] = [
  {
    id: 'ptt',
    name: 'Push to talk',
    note: 'The literal walkie-talkie: a chunky key sitting on a hard shadow that collapses when you press it in, with a red light that blinks while the channel is open. Most obviously a button you press.',
    Component: PushToTalk,
  },
  {
    id: 'rubber',
    name: 'Rubber button',
    note: 'A moulded rubber key with Kan on the face. Press and it squishes into its own socket and starts broadcasting rings. All the feedback is physical — no label change needed to know it went down.',
    Component: RubberButton,
  },
  {
    id: 'keycap',
    name: 'Keycap',
    note: 'A mechanical keycap legended KAN. Presses down into the well and stays there, glowing, like a latched caps lock. Quiet and precise, for people who like keyboards.',
    Component: Keycap,
  },
  {
    id: 'antenna',
    name: 'Aerial',
    note: 'Press it and an aerial telescopes out of the top with a blip on the tip. The signal is the state, so you can read it from the corner of your eye while typing.',
    Component: Antenna,
  },
  {
    id: 'intercom',
    name: 'Intercom',
    note: 'A warm brass TALK button in a plate, the kind on a door buzzer. Sinks and glows amber. Softest and most domestic of the ten — Kan as someone you buzz, not a machine you operate.',
    Component: Intercom,
  },
  {
    id: 'shutter',
    name: 'Lock on',
    note: 'A ring sweeps closed around the button as it locks, like a shutter or a seatbelt. The ring is a big, calm state indicator that reads at a glance.',
    Component: ShutterRing,
  },
  {
    id: 'boop',
    name: 'Boop the cap',
    note: 'No button at all — Kan is the button. Press his cap, he squashes and puffs spores, and stays lit while he\'s on the message. Most personality, least conventional, and the only one that needs no chrome.',
    Component: BoopKan,
  },
  {
    id: 'cord',
    name: 'Corded handset',
    note: 'A curly cord runs from the composer to the key and snaps taut when you key it. The most explicitly walkie-talkie of the set without being a toy.',
    Component: CordedHandset,
  },
  {
    id: 'mic',
    name: 'Mic bar',
    note: 'A wide bar that depresses like a piano key, with a level meter that only moves while the channel is open. The biggest target of the ten, which matters most on a phone.',
    Component: MicBar,
  },
  {
    id: 'hard',
    name: 'Hard shadow',
    note: "A loud pill sitting on a violet block shadow that it drops into when pressed. No metaphor, just a button that is impossible to miss — the opposite of what's there now.",
    Component: HardShadow,
  },
];

export function ButtonStyles() {
  return (
    <style>{`
      @keyframes kb-signal {
        0%   { opacity: .8; transform: scale(.7); }
        100% { opacity: 0; transform: scale(1.5); }
      }
      @keyframes kb-blink {
        0%, 45%   { opacity: 1; }
        55%, 100% { opacity: .25; }
      }
      @keyframes kb-blip {
        0%   { opacity: 0; transform: scale(.2); }
        40%  { opacity: 1; transform: scale(1); }
        100% { opacity: .55; transform: scale(.8); }
      }
      @keyframes kb-spore {
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(.3); }
        20%  { opacity: 1; }
        100% { opacity: 0; transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(1); }
      }
      @keyframes kb-wave {
        0%, 100% { height: 3px; }
        50%      { height: 12px; }
      }
      @keyframes kb-cord {
        0%   { transform: scaleX(.82); }
        60%  { transform: scaleX(1.04); }
        100% { transform: scaleX(1); }
      }
      @keyframes kb-chip {
        0%   { opacity: 0; transform: translateX(-6px) scale(.8); }
        70%  { opacity: 1; transform: translateX(0) scale(1.06); }
        100% { opacity: 1; transform: none; }
      }
      .kb-blink { animation: kb-blink 1s steps(1, end) infinite; }
      .kb-blip  { animation: kb-blip .5s cubic-bezier(.2,1.4,.4,1) .2s both; }
      .kb-wave  { animation: kb-wave .9s ease-in-out infinite; }
      .kb-cord  { animation: kb-cord .4s cubic-bezier(.3,1.4,.4,1); transform-origin: left center; }
      .kb-chip  { animation: kb-chip .32s cubic-bezier(.2,1.4,.4,1) both; }
      .kb-boop-group:active .kb-boop { transform: scaleY(.78) scaleX(1.12) !important; }
      @media (prefers-reduced-motion: reduce) {
        .kb-stage *, .kb-stage { animation: none !important; transition-duration: .01ms !important; }
      }
    `}</style>
  );
}
