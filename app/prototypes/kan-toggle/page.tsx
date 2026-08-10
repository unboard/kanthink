'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AudioLines } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { CURRENT_TOGGLE, TOGGLES, ToggleStyles, type ToggleOption } from './Toggles';

const ALL: ToggleOption[] = [CURRENT_TOGGLE, ...TOGGLES];

/**
 * The Note / Ask Kan switch at the bottom of a card.
 *
 * Each one sits in a mock of the real composer, because the control is only
 * half the question — the other half is whether you can tell, at a glance and
 * mid-thought, which of the two things pressing send is about to do.
 */
export default function KanTogglePrototype() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ToggleStyles />

      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Prototypes
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Note / Ask Kan switch</h1>
              <p className="text-sm text-neutral-400">
                Five switches for the bottom of the card composer, each with Kan riding in the knob.
                Flick them — the placeholder and the send arrow follow the mode, the way they really do.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5">
          {ALL.map((option) => (
            <Sample key={option.id} option={option} />
          ))}
        </div>

        <p className="mt-8 text-xs text-neutral-600">
          Say which one and I&rsquo;ll wire it into <span className="font-mono">ChatInput</span>, which
          is every place the choice appears — cards, channel chat, tasks.
        </p>
      </div>
    </div>
  );
}

function Sample({ option }: { option: ToggleOption }) {
  const [on, setOn] = useState(false);
  const Toggle = option.Component;
  const lamp = Boolean(option.lightsUpComposer) && on;

  return (
    <section className="kt-stage rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-medium text-neutral-100">{option.name}</h2>
        {option.id === 'current' && (
          <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">
            shipping today
          </span>
        )}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-neutral-500">{option.note}</p>

      {/* Mock of the card composer, trimmed to what matters here. */}
      <div
        className={`relative rounded-xl border px-3 py-2.5 transition-all duration-300 ${
          lamp
            ? 'border-amber-300/40 bg-neutral-800 shadow-[0_0_28px_-6px_rgba(252,211,77,.35)]'
            : on
              ? 'border-violet-500/40 bg-neutral-800'
              : 'border-neutral-700 bg-neutral-800'
        }`}
      >
        <div className="flex items-start gap-1">
          <span className="flex h-[26px] w-7 flex-shrink-0 items-center justify-center text-neutral-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </span>

          <p
            className={`min-w-0 flex-1 px-1 text-sm leading-[26px] transition-colors duration-300 ${
              lamp ? 'text-amber-100/70' : on ? 'text-violet-200/70' : 'text-neutral-500'
            }`}
          >
            {on ? 'Ask Kan a question…' : 'Add a note…'}
          </p>

          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-neutral-500">
            <AudioLines className="h-4 w-4" />
          </span>

          <span
            className={`flex h-[26px] w-7 flex-shrink-0 items-center justify-center transition-colors duration-300 ${
              lamp ? 'text-amber-300' : on ? 'text-violet-400' : 'text-neutral-300'
            }`}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </span>
        </div>

        <div className="ml-8 mt-1.5 flex items-center">
          <Toggle on={on} onChange={setOn} />
        </div>
      </div>
    </section>
  );
}
