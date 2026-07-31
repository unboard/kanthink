'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { SOUND_OPTIONS, SOUND_OPTIONS_2, CURRENT_SOUND, type SoundOption } from './sounds';
import {
  CurrentDots, BreathingCap, GillShimmer, PoppingCaps, SporeOrbit,
  MyceliumWeb, LiquidCap, SoilRipple, TimeLapseGrowth, ScanningBeam,
  CurrentFetching, StageChecklist, MyceliumBar, CompactPulse,
} from './Indicators';

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-neutral-500">{blurb}</p>
      {children}
    </section>
  );
}

function Option({ label, note, current, children }: { label: string; note: string; current?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${current ? 'border-neutral-800 bg-neutral-900/30' : 'border-neutral-800 bg-neutral-900/60'}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-200">{label}</span>
        {current && <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-500">shipping today</span>}
      </div>
      <div className="mb-3">{children}</div>
      <p className="text-[11px] leading-relaxed text-neutral-500">{note}</p>
    </div>
  );
}

function SoundRow({ option, playing, onToggle }: { option: SoundOption; playing: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${playing ? 'border-violet-500/50 bg-violet-500/5' : 'border-neutral-800 bg-neutral-900/60'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
            playing ? 'border-violet-400 bg-violet-500/20 text-violet-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
          }`}
          aria-label={playing ? `Stop ${option.name}` : `Play ${option.name}`}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            {option.name}
            {playing && <span className="ml-2 text-[11px] font-normal text-violet-300">playing…</span>}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">{option.description}</p>
        </div>
      </div>
    </div>
  );
}

export default function KanPresencePage() {
  const [fetching, setFetching] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { stopRef.current?.(); ctxRef.current?.close().catch(() => {}); }, []);

  const toggleSound = (option: SoundOption) => {
    stopRef.current?.();
    stopRef.current = null;

    if (playingId === option.id) { setPlayingId(null); return; }

    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    void ctxRef.current.resume();
    stopRef.current = option.start(ctxRef.current);
    setPlayingId(option.id);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <style>{`
        @keyframes kp-breathe { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.12); opacity: 1 } }
        .kp-breathe { animation: kp-breathe 2.2s ease-in-out infinite; }
        @keyframes kp-spore { 0% { transform: translateY(2px) scale(.6); opacity: 0 } 30% { opacity: .9 } 100% { transform: translateY(-11px) scale(1); opacity: 0 } }
        .kp-spore { bottom: 2px; animation: kp-spore 1.8s ease-out infinite; }
        @keyframes kp-gill { 0%,100% { height: 5px; opacity: .35 } 50% { height: 13px; opacity: 1 } }
        .kp-gill { height: 5px; animation: kp-gill 1s ease-in-out infinite; }
        @keyframes kp-pop { 0%,100% { transform: translateY(2px) scale(.85); opacity: .5 } 40% { transform: translateY(-3px) scale(1); opacity: 1 } }
        .kp-pop { animation: kp-pop 1.3s ease-in-out infinite; }
        @keyframes kp-orbit { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .kp-orbit { animation: kp-orbit 3s linear infinite; }
        @keyframes kp-crawl { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }
        .kp-crawl { animation: kp-crawl 1.8s ease-in-out infinite; }

        /* bolder set */
        @keyframes kp-thread { 0% { stroke-dasharray: 0 20; opacity: 0 } 25% { opacity: 1 } 60% { stroke-dasharray: 20 20; opacity: 1 } 100% { stroke-dasharray: 20 20; opacity: 0 } }
        .kp-thread { stroke-dasharray: 0 20; animation: kp-thread 2.4s ease-in-out infinite; }
        @keyframes kp-node { 0%,20% { transform: scale(0); opacity: 0 } 45% { transform: scale(1); opacity: 1 } 100% { transform: scale(.4); opacity: 0 } }
        .kp-node { transform-origin: center; transform-box: fill-box; animation: kp-node 2.4s ease-in-out infinite; }
        @keyframes kp-blob {
          0%,100% { border-radius: 58% 42% 47% 53% / 62% 55% 45% 38%; transform: rotate(0deg) scale(1) }
          33% { border-radius: 40% 60% 65% 35% / 40% 45% 55% 60%; transform: rotate(120deg) scale(1.08) }
          66% { border-radius: 62% 38% 35% 65% / 52% 63% 37% 48%; transform: rotate(240deg) scale(.94) }
        }
        .kp-blob { animation: kp-blob 3.4s ease-in-out infinite; }
        @keyframes kp-ripple { 0% { transform: scale(.35); opacity: .9 } 100% { transform: scale(1.5); opacity: 0 } }
        .kp-ripple { animation: kp-ripple 2.1s ease-out infinite; }
        @keyframes kp-grow { 0% { transform: scaleY(.15) scaleX(.5); opacity: .3 } 55% { transform: scaleY(1) scaleX(1); opacity: 1 } 85% { transform: scaleY(1) scaleX(1); opacity: 1 } 100% { transform: scaleY(.15) scaleX(.5); opacity: .3 } }
        .kp-grow { animation: kp-grow 2.6s cubic-bezier(.34,1.3,.64,1) infinite; }
        @keyframes kp-scan { 0% { transform: translateX(-140%) } 100% { transform: translateX(340%) } }
        .kp-scan { animation: kp-scan 1.9s ease-in-out infinite; }
      `}</style>

      <div className="mx-auto max-w-4xl px-5 py-10">
        <header className="mb-10">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">← Back</Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={28} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Kan presence</h1>
              <p className="text-sm text-neutral-400">Options for how Kan looks and sounds while it is working. Nothing here is wired into the app yet — pick what you like.</p>
            </div>
          </div>
        </header>

        <Section
          title="1 · Working on a query"
          blurb='Replaces the bare "Fetching analytics data…" line. A Mixpanel export gives no progress signal, so these show honest stages and elapsed time rather than a fake percentage — the elapsed counter also makes a slow query visibly slow instead of ambiguous.'
        >
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setFetching((f) => !f)}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500"
            >
              {fetching ? 'Pause' : 'Replay'}
            </button>
            <span className="text-[11px] text-neutral-600">stages advance on a timer for the demo</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Option current label="Current" note="No sense of progress, and no way to tell a 1s query from a 30s one.">
              <CurrentFetching />
            </Option>
            <Option label="Stage checklist" note="Most informative: names each step and ticks it off. Best when the wait is genuinely multi-step, as an analytics query is.">
              <StageChecklist active={fetching} />
            </Option>
            <Option label="Mycelium bar ✓ chosen" note="Your pick. A thread crawling along the track — motion without claiming a percentage. Lighter than the checklist.">
              <MyceliumBar active={fetching} />
            </Option>
            <Option label="Compact pulse" note="One line with a spore-ping. For tight spots where a full card is too heavy.">
              <CompactPulse active={fetching} />
            </Option>
          </div>
        </Section>

        <Section
          title="2 · Kan is thinking"
          blurb="Replaces the three bouncing dots next to the Kan icon in chat. Each keeps the same row height so it drops straight in."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Option current label="Current — three dots" note="Generic. Reads as any chat app; nothing about it is Kan.">
              <CurrentDots />
            </Option>
            <Option label="Breathing cap" note="The mascot itself breathes while spores drift up. Calmest option and the most clearly Kan.">
              <BreathingCap />
            </Option>
            <Option label="Gill shimmer" note="A wave travelling through gill strokes. Suggests scanning or reading rather than idling.">
              <GillShimmer />
            </Option>
            <Option label="Popping caps" note="Three small caps rise in sequence — closest in rhythm to the dots it replaces, but on-theme.">
              <PoppingCaps />
            </Option>
            <Option label="Spore orbit" note="Two spores circle the cap. Continuous and quiet — no bouncing, so it sits still in a busy thread.">
              <SporeOrbit />
            </Option>
          </div>

          <h3 className="mb-1 mt-8 text-xs font-semibold uppercase tracking-wide text-violet-300">Bolder set</h3>
          <p className="mb-4 max-w-2xl text-sm text-neutral-500">
            The set above keeps the mascot still and animates something beside it. These change shape,
            draw themselves, or move the whole mark — built to be noticed rather than tolerated.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Option label="Mycelium web" note="Threads branch out to nodes and retract. Reads as actively searching — the most literal picture of what Kan is doing.">
              <MyceliumWeb />
            </Option>
            <Option label="Liquid cap" note="An abstract blob morphing continuously. Drops the mushroom shape entirely for something organic and strange. Boldest of the ten.">
              <LiquidCap />
            </Option>
            <Option label="Soil ripple" note="Rings pulse outward from beneath the cap, like a signal underground. Calm but unmistakably active.">
              <SoilRipple />
            </Option>
            <Option label="Time-lapse growth" note="A mushroom grows from spore to full cap and starts over. Playful, and the one that most rewards a second look.">
              <TimeLapseGrowth />
            </Option>
            <Option label="Scanning beam" note="A light sweeps across the mark as if reading it. Suggests machine work rather than biology — the most 'processing' of the set.">
              <ScanningBeam />
            </Option>
          </div>
        </Section>

        <Section
          title="3 · Voice processing sound"
          blurb="Five candidates to replace the current tone while Kan looks things up. All are quiet by design since they play under speech. Press play to audition — one at a time."
        >
          <div className="grid gap-3">
            {[CURRENT_SOUND, ...SOUND_OPTIONS].map((option) => (
              <SoundRow
                key={option.id}
                option={option}
                playing={playingId === option.id}
                onToggle={() => toggleSound(option)}
              />
            ))}
          </div>

          <h3 className="mb-1 mt-8 text-xs font-semibold uppercase tracking-wide text-violet-300">Second batch</h3>
          <p className="mb-4 max-w-2xl text-sm text-neutral-500">
            Further from an ambient drone — these use pitch movement, rhythm and timbre, so they read as
            activity from across a room instead of blending into the background.
          </p>
          <div className="grid gap-3">
            {SOUND_OPTIONS_2.map((option) => (
              <SoundRow
                key={option.id}
                option={option}
                playing={playingId === option.id}
                onToggle={() => toggleSound(option)}
              />
            ))}
          </div>
        </Section>

        <Section
          title="4 · What Kan knows about updates"
          blurb="This one is already wired up, not a mock."
        >
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-400">
            <p>
              Recent updates are now injected into Kan&rsquo;s system prompt on every surface — voice,
              homepage chat, channel chat and card chat. Ask Kan &ldquo;what&rsquo;s new?&rdquo; or &ldquo;what
              features were added recently?&rdquo; and it answers from that list in its own words.
            </p>
            <p className="mt-3">
              The panel that used to sit under the composer is gone. The full history now lives on the{' '}
              <Link href="/system-log" className="text-violet-400 hover:underline">system log page</Link>.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
