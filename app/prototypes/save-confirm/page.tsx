'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { CONFIRMATIONS, CURRENT, ConfirmStyles, type ConfirmOption } from './Confirmations';

const SAMPLE = {
  title: 'GitHub — WhiskeyCoder/Qwen3-Audiobook-Maker',
  channelName: 'Kan Bookmarks',
  columnName: 'Inbox',
};

const ALL: ConfirmOption[] = [CURRENT, ...CONFIRMATIONS];

/**
 * The screen you land on after sharing something into Kanthink.
 *
 * Today it's a green tick that says "Saved" — correct, and completely flat.
 * These five try to make the moment land, without claiming anything about what
 * Kan will do with the item, since that isn't decided at share time.
 */
export default function SaveConfirmPrototype() {
  const [optionId, setOptionId] = useState('spores');
  // Remounting the variant is what restarts every CSS animation at once, so
  // the replay button just bumps this key.
  const [playKey, setPlayKey] = useState(0);

  const option = ALL.find((o) => o.id === optionId) ?? ALL[0];
  const Variant = option.Component;

  const select = (id: string) => {
    setOptionId(id);
    setPlayKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <ConfirmStyles />

      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Prototypes
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Share confirmation</h1>
              <p className="text-sm text-neutral-400">
                The last screen of a share, on a phone. Five ways to make it feel like a win — none of
                them say what Kan will do with the thing, because that isn&rsquo;t known yet.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
          {/* Phone */}
          <div>
            <div
              className="relative mx-auto overflow-hidden rounded-[2.75rem] border-[10px] border-neutral-800 bg-neutral-950 shadow-2xl"
              style={{ width: 340, height: 700 }}
            >
              {/* the browser bar the share target opens under */}
              <div className="h-9 w-full bg-violet-500" />
              <div className="sc-stage h-[calc(100%-2.25rem)] w-full">
                <Variant key={`${option.id}-${playKey}`} {...SAMPLE} />
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setPlayKey((k) => k + 1)}
                className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
              >
                ↻ Replay
              </button>
            </div>
          </div>

          {/* Picker */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Options</h2>
            <p className="mb-3 mt-1 text-xs text-neutral-500">
              Tap one to play it. Nothing here is wired into <span className="font-mono">/save</span> yet.
            </p>
            <div className="space-y-2">
              {ALL.map((o) => {
                const selected = o.id === optionId;
                return (
                  <button
                    key={o.id}
                    onClick={() => select(o.id)}
                    className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? 'border-violet-500 bg-violet-500/5'
                        : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-100">{o.name}</span>
                      {o.id === 'current' && (
                        <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">
                          shipping today
                        </span>
                      )}
                      {selected && <span className="ml-auto text-[11px] text-violet-300">playing</span>}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{o.note}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-neutral-600">
              Say which one and I&rsquo;ll wire it into the real share screen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
