'use client';

import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * The switch at the bottom of the composer, between writing a note and asking Kan.
 *
 * It used to be two small text buttons sitting next to each other with nothing
 * to say they were two halves of one choice — so people wrote notes at Kan and
 * wondered why he never answered.
 *
 * Kan is asleep on the left with a z drifting off him, tipped over. Flick it and
 * he snaps upright, pops a "?", and pulses while he listens. The mascot is a
 * single monochrome path and can't change expression, so the life has to come
 * from motion and from what happens around him.
 *
 * Chosen from five at /prototypes/kan-toggle.
 */

interface AskKanSwitchProps {
  /** True when the composer is in question mode. */
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}

export function AskKanSwitch({ on, onChange, disabled = false }: AskKanSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Ask Kan"
      title={on ? 'Kan will answer this' : 'Switch on to ask Kan instead of writing a note'}
      // Keep the caret in the textarea — this must never steal focus mid-sentence.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`kan-switch flex items-center gap-2 rounded-full text-xs transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <span
        className={`relative h-[22px] w-[42px] rounded-full border transition-colors duration-300 ${
          on
            ? 'border-violet-400 bg-violet-100 dark:border-violet-400/60 dark:bg-violet-500/20'
            : 'border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800'
        }`}
      >
        {/* Asleep, with a z drifting off him. */}
        {!on && (
          <span
            aria-hidden
            className="kan-switch-snooze pointer-events-none absolute left-[15px] top-[-3px] text-[8px] leading-none text-neutral-400 dark:text-neutral-500"
          >
            z
          </span>
        )}

        {/* Listening, once he's awake. */}
        {on && (
          <span
            aria-hidden
            className="kan-switch-pulse pointer-events-none absolute right-[1px] top-[1px] h-[20px] w-[20px] rounded-full border border-violet-400/70"
          />
        )}

        <span
          className={`kan-switch-knob absolute left-[2px] top-[2px] flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all duration-300 ${
            on
              ? 'bg-violet-600 text-white dark:bg-violet-500'
              : 'bg-neutral-300 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-500'
          }`}
          style={{
            transform: on ? 'translateX(20px) rotate(0deg)' : 'rotate(-16deg)',
            transitionTimingFunction: 'cubic-bezier(.34,1.6,.5,1)',
          }}
        >
          <KanthinkIcon size={12} />
        </span>

        {/* What he pops up with. */}
        {on && (
          <span
            aria-hidden
            className="kan-switch-ask pointer-events-none absolute -top-[7px] right-[-2px] rounded-full bg-violet-500 px-[4px] text-[8px] font-bold leading-[12px] text-white dark:bg-violet-400 dark:text-neutral-900"
          >
            ?
          </span>
        )}
      </span>

      <span
        className={
          on
            ? 'font-medium text-violet-700 dark:text-violet-300'
            : 'text-neutral-500 dark:text-neutral-400'
        }
      >
        {on ? 'Ask Kan' : 'Wake Kan'}
      </span>
    </button>
  );
}
