'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AudioLines } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { BUTTONS, ButtonStyles, type ButtonOption } from './Buttons';

/**
 * Ten push buttons for bringing Kan into a message.
 *
 * The point of the round: the button is a shortcut for typing `@kan`, not a
 * mode. So in every mock the placeholder stays exactly where it was — the only
 * thing that changes is that the mention appears in the field, which is the
 * same thing you'd get by typing it yourself.
 */
export default function KanButtonPrototype() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ButtonStyles />

      <div className="mx-auto max-w-2xl px-5 py-10">
        <header className="mb-8">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Prototypes
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Chat with Kan — the button</h1>
              <p className="text-sm text-neutral-400">
                Ten press-and-latch buttons, walkie-talkie style. Press one and{' '}
                <span className="font-mono text-violet-300">@kan</span> appears at the front of the
                message — which is all the button does. Type it yourself and you get the same thing.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-xs leading-relaxed text-neutral-400">
            <span className="font-medium text-violet-300">What changed from the toggle:</span>{' '}the
            placeholder no longer swaps between &ldquo;Add a note&rdquo; and &ldquo;Ask Kan a
            question&rdquo;. The field is just a field. Kan being on the message is shown by the
            mention sitting in it, so there is one thing to read instead of three.
          </p>
        </div>

        <div className="space-y-5">
          {BUTTONS.map((option) => (
            <Sample key={option.id} option={option} />
          ))}
        </div>

        <p className="mt-8 text-xs text-neutral-600">
          Say which one and I&rsquo;ll wire it into <span className="font-mono">ChatInput</span>,
          along with <span className="font-mono">@kan</span> as a real mention you can type.
        </p>
      </div>
    </div>
  );
}

function Sample({ option }: { option: ButtonOption }) {
  const [on, setOn] = useState(false);
  const Button = option.Component;

  return (
    <section className="kb-stage rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <h2 className="text-sm font-medium text-neutral-100">{option.name}</h2>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-neutral-500">{option.note}</p>

      <div
        className={`rounded-xl border bg-neutral-800 px-3 py-2.5 transition-colors duration-300 ${
          on ? 'border-violet-500/40' : 'border-neutral-700'
        }`}
      >
        <div className="flex items-start gap-1">
          <span className="flex h-[26px] w-7 flex-shrink-0 items-center justify-center text-neutral-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </span>

          {/* The mention the button types for you, then the same placeholder as ever. */}
          <p className="flex min-w-0 flex-1 items-center gap-1 px-1 text-sm leading-[26px]">
            {on && (
              <span className="kb-chip font-medium text-violet-400">@kan</span>
            )}
            <span className="truncate text-neutral-500">Add a note…</span>
          </p>

          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-neutral-500">
            <AudioLines className="h-4 w-4" />
          </span>

          <span
            className={`flex h-[26px] w-7 flex-shrink-0 items-center justify-center transition-colors duration-300 ${
              on ? 'text-violet-400' : 'text-neutral-300'
            }`}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </span>
        </div>

        <div className="ml-8 mt-1.5 flex items-center">
          <Button on={on} onChange={setOn} />
        </div>
      </div>
    </section>
  );
}
