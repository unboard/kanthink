'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { SporeBackground } from '@/components/ambient/SporeBackground';
import { EFFECTS, EFFECTS_V1, EFFECTS_V2, type EffectOption } from './Effects';

/**
 * Voice mode as it appears on a phone, with swappable "Kan is speaking" layers.
 *
 * The spore field is the same SporeBackground the homescreen and voice mode
 * use, so what sits underneath here is exactly what ships and only the layer on
 * top changes. Voice ribbon won and is live; the rest stay for reference.
 */
export default function VoiceSpeakingPrototype() {
  const [effectId, setEffectId] = useState('ribbon');
  const [speaking, setSpeaking] = useState(true);

  const effect = EFFECTS.find(e => e.id === effectId) ?? EFFECTS[0];
  const Effect = effect.Component;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">← Prototypes</Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Voice mode — speaking effect</h1>
              <p className="text-sm text-neutral-400">
                The phone below is the real spore field with the aurora suppressed. Only the layer on
                top changes. Toggle speaking to see each effect come and go.
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
              <SporeBackground
                className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
                id="proto-voice-spores"
              />
              <Effect active={speaking} />

              {/* UI chrome — mirrors the live layout */}
              <div className="relative z-10 flex h-full w-full flex-col px-5 pb-5 pt-4">
                <div className="flex items-center gap-2.5">
                  <KanthinkIcon size={28} className="text-white" />
                  <div className="flex items-center gap-1.5 rounded-full bg-neutral-800/80 px-3 py-1.5">
                    <div className="flex h-4 items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full ${speaking ? 'bg-violet-400' : 'bg-cyan-400'}`}
                          style={{
                            height: speaking ? undefined : `${[5, 9, 13, 9, 5][i]}px`,
                            animation: speaking ? `vs-bar 0.9s ease-in-out ${i * 0.12}s infinite` : undefined,
                          }}
                        />
                      ))}
                    </div>
                    <span className={`ml-1 text-xs ${speaking ? 'text-violet-300' : 'text-neutral-300'}`}>
                      {speaking ? 'Kan is speaking' : 'Listening'}
                    </span>
                  </div>
                  <button className="ml-auto rounded-full p-2 text-neutral-400" aria-label="Settings">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1" />

                {/* Transcript sample */}
                <div className="mb-4 space-y-2">
                  <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2 text-sm text-white">
                    How many print orders today?
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-sm text-neutral-200">
                    Five so far, totalling $1,097. Want the breakdown by product?
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3">
                  <button className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-300" aria-label="Mute">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-14 0m7 7v3m0-3a4 4 0 004-4V7a4 4 0 10-8 0v7a4 4 0 004 4z" />
                    </svg>
                  </button>
                  <button className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white" aria-label="End">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 15.46l-5.27-.61-2.52 2.52a15.05 15.05 0 01-6.59-6.59l2.53-2.53L8.54 3H3.03A17 17 0 0021 20.97v-5.51z" />
                    </svg>
                  </button>
                  <button className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-neutral-300" aria-label="Keyboard">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="2.5" y="6" width="19" height="12" rx="2" strokeWidth={1.6} />
                      <path strokeLinecap="round" strokeWidth={1.6} d="M7 14h10M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setSpeaking(s => !s)}
                className={`rounded-full border px-4 py-2 text-xs transition-colors ${
                  speaking ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-neutral-700 text-neutral-300'
                }`}
              >
                {speaking ? 'Kan is speaking — tap to stop' : 'Listening — tap to speak'}
              </button>
            </div>
          </div>

          {/* Picker */}
          <div>
            {([
              ['Batch one', 'Kept as-is — still on the table.', EFFECTS_V1],
              ['Batch two', 'Other relationships to the spores: connecting them, recolouring the whole scene, moving them as a body, or leaving the middle alone.', EFFECTS_V2],
            ] as [string, string, EffectOption[]][]).map(([heading, sub, list], gi) => (
              <div key={heading} className={gi > 0 ? 'mt-8' : ''}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{heading}</h2>
                <p className="mb-3 mt-1 text-xs text-neutral-500">{sub}</p>
                <div className="space-y-2">
                  {list.map((e) => {
                    const selected = e.id === effectId;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setEffectId(e.id)}
                        className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                          selected ? 'border-violet-500 bg-violet-500/5' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-100">{e.name}</span>
                          {e.current && (
                            <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">
                              shipping today
                            </span>
                          )}
                          {selected && <span className="ml-auto text-[11px] text-violet-300">showing</span>}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{e.note}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="mt-4 text-xs text-neutral-600">
              Nothing here is wired into voice mode yet. Tell me which one and I&rsquo;ll ship it.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vs-bar { 0%,100% { height: 4px } 50% { height: 15px } }
        @media (prefers-reduced-motion: reduce) {
          [class^="vs-"], [class*=" vs-"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
