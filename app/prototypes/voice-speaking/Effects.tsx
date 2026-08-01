'use client';

/**
 * Candidate "Kan is speaking" layers, drawn on top of the spore field.
 *
 * The one shipping today is an aurora: a hue-rotating gradient washing up from
 * the bottom. It reads as weather rather than as speech, and it sits over the
 * spores without relating to them.
 *
 * Each of these takes the same prop and covers the same area, so they are
 * swappable. All animate transform/opacity only — this runs on a phone during a
 * live audio session, so layout-triggering properties are off the table.
 */

export interface EffectProps {
  active: boolean;
}

const base = 'pointer-events-none absolute inset-0 transition-opacity duration-700';

/** Shipping today, for comparison. */
export function AuroraCurrent({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div className="vs-aurora absolute inset-0" />
      <style>{`
        .vs-aurora {
          background: linear-gradient(180deg, transparent 30%, rgba(139,92,246,0.06) 50%, rgba(34,211,238,0.10) 65%, rgba(103,232,249,0.08) 80%, rgba(139,92,246,0.04) 90%, transparent 100%);
          background-size: 200% 200%;
          animation: vs-aurora-flow 6s ease-in-out infinite;
        }
        @keyframes vs-aurora-flow {
          0%, 100% { background-position: 50% 100%; filter: hue-rotate(0deg); }
          33% { background-position: 40% 60%; filter: hue-rotate(15deg); }
          66% { background-position: 60% 40%; filter: hue-rotate(-10deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * 1. Spore surge — no overlay at all. The spores themselves brighten and lift,
 *    so speech reads as the field coming alive rather than as a colour wash.
 */
export function SporeSurge({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      {Array.from({ length: 26 }).map((_, i) => (
        <span
          key={i}
          className="vs-surge absolute rounded-full bg-violet-300"
          style={{
            left: `${(i * 37) % 100}%`,
            bottom: '-6%',
            width: i % 4 === 0 ? 3 : 2,
            height: i % 4 === 0 ? 3 : 2,
            animationDelay: `${(i % 13) * 0.42}s`,
            animationDuration: `${5 + (i % 5)}s`,
          }}
        />
      ))}
      <div className="vs-surge-tint absolute inset-0" />
      <style>{`
        @keyframes vs-rise {
          0% { transform: translateY(0) scale(.5); opacity: 0 }
          12% { opacity: .85 }
          100% { transform: translateY(-105vh) scale(1.1); opacity: 0 }
        }
        .vs-surge { animation-name: vs-rise; animation-timing-function: linear; animation-iteration-count: infinite; box-shadow: 0 0 6px rgba(196,181,253,.8); }
        .vs-surge-tint {
          background: radial-gradient(ellipse at 50% 120%, rgba(139,92,246,0.16) 0%, transparent 60%);
          animation: vs-breathe 3.2s ease-in-out infinite;
        }
        @keyframes vs-breathe { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
      `}</style>
    </div>
  );
}

/**
 * 2. Sonar rings — soft rings leaving the centre in time with speech. Reads
 *    unmistakably as emission: something is being sent out from Kan.
 */
export function SonarRings({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="vs-ring absolute left-1/2 top-1/2 block h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ animationDelay: `${i * 1.1}s` }}
          />
        ))}
      </div>
      <style>{`
        .vs-ring {
          border-color: rgba(167,139,250,.5);
          animation: vs-sonar 4.4s cubic-bezier(.2,.6,.3,1) infinite;
        }
        @keyframes vs-sonar {
          0% { transform: translate(-50%,-50%) scale(.25); opacity: 0 }
          14% { opacity: .7 }
          100% { transform: translate(-50%,-50%) scale(4.2); opacity: 0 }
        }
      `}</style>
    </div>
  );
}

/**
 * 3. Bioluminescence — patches of the dark glowing and fading at different
 *    rates, like fungi lighting up. The most on-theme, and the only one that
 *    does not imply a direction.
 */
export function Bioluminescence({ active }: EffectProps) {
  const blobs = [
    { x: 22, y: 28, s: 190, d: 0, dur: 4.6, c: '139,92,246' },
    { x: 74, y: 40, s: 150, d: 1.4, dur: 5.4, c: '34,211,238' },
    { x: 38, y: 68, s: 210, d: 2.6, dur: 6.2, c: '167,139,250' },
    { x: 82, y: 76, s: 130, d: 0.8, dur: 4.2, c: '103,232,249' },
    { x: 12, y: 55, s: 120, d: 3.2, dur: 5 },
  ];
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      {blobs.map((b, i) => (
        <span
          key={i}
          className="vs-bio absolute rounded-full"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.s,
            height: b.s,
            marginLeft: -b.s / 2,
            marginTop: -b.s / 2,
            background: `radial-gradient(circle, rgba(${b.c ?? '139,92,246'},0.20) 0%, transparent 68%)`,
            animationDelay: `${b.d}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
      <style>{`
        .vs-bio { animation-name: vs-bloom; animation-timing-function: ease-in-out; animation-iteration-count: infinite; filter: blur(6px); }
        @keyframes vs-bloom {
          0%, 100% { opacity: .12; transform: scale(.82) }
          50% { opacity: 1; transform: scale(1.08) }
        }
      `}</style>
    </div>
  );
}

/**
 * 4. Voice ribbon — a luminous band across the middle that undulates while Kan
 *    talks. The most literal representation of a voice, and the clearest at a
 *    glance which of the two of you is speaking.
 */
export function VoiceRibbon({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <svg className="absolute inset-x-0 top-1/2 h-48 w-full -translate-y-1/2" viewBox="0 0 390 180" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vs-ribbon-grad" x1="0" x2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0)" />
            <stop offset="25%" stopColor="rgba(167,139,250,0.85)" />
            <stop offset="55%" stopColor="rgba(34,211,238,0.85)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            className="vs-ribbon"
            d="M0,90 C 60,40 120,140 195,90 C 270,40 330,140 390,90"
            fill="none"
            stroke="url(#vs-ribbon-grad)"
            strokeWidth={i === 0 ? 2.5 : 1.2}
            opacity={i === 0 ? 0.95 : 0.4}
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </svg>
      <style>{`
        .vs-ribbon {
          transform-origin: center;
          animation: vs-undulate 3.4s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(139,92,246,.55));
        }
        @keyframes vs-undulate {
          0%, 100% { transform: scaleY(1) translateY(0) }
          25% { transform: scaleY(1.55) translateY(-4px) }
          50% { transform: scaleY(.6) translateY(3px) }
          75% { transform: scaleY(1.3) translateY(-2px) }
        }
      `}</style>
    </div>
  );
}

/**
 * 5. Canopy rays — slow shafts of light leaning through from above, like sun
 *    through trees. Closest in spirit to the aurora, but with a direction and a
 *    source instead of a hue-rotating wash.
 */
export function CanopyRays({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div className="absolute inset-0 overflow-hidden">
        {[
          { x: 18, w: 46, d: 0, dur: 7 },
          { x: 40, w: 28, d: 1.6, dur: 9 },
          { x: 63, w: 54, d: 3.1, dur: 8 },
          { x: 85, w: 32, d: 2.2, dur: 10 },
        ].map((r, i) => (
          <span
            key={i}
            className="vs-ray absolute top-[-20%]"
            style={{
              left: `${r.x}%`,
              width: r.w,
              height: '150%',
              animationDelay: `${r.d}s`,
              animationDuration: `${r.dur}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        .vs-ray {
          background: linear-gradient(180deg, rgba(196,181,253,0.16) 0%, rgba(139,92,246,0.07) 45%, transparent 85%);
          transform: rotate(11deg);
          transform-origin: top center;
          filter: blur(9px);
          animation-name: vs-sway;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes vs-sway {
          0%, 100% { transform: rotate(11deg) translateX(0); opacity: .45 }
          50% { transform: rotate(7deg) translateX(14px); opacity: 1 }
        }
      `}</style>
    </div>
  );
}

export interface EffectOption {
  id: string;
  name: string;
  note: string;
  Component: (props: EffectProps) => React.ReactElement;
  current?: boolean;
}

export const EFFECTS: EffectOption[] = [
  {
    id: 'aurora',
    name: 'Aurora (current)',
    note: 'A hue-rotating gradient washing up from the bottom. Reads as weather rather than speech, and never relates to the spores it sits on top of.',
    Component: AuroraCurrent,
    current: true,
  },
  {
    id: 'spore-surge',
    name: 'Spore surge',
    note: 'No overlay at all — the spores themselves brighten, speed up and lift. Speech becomes the field coming alive, which ties the effect to the thing already on screen instead of covering it.',
    Component: SporeSurge,
  },
  {
    id: 'sonar',
    name: 'Sonar rings',
    note: 'Soft rings leaving the centre. Unmistakably emission — something is being sent out from Kan. The most legible at a glance, and the most repetitive over a long call.',
    Component: SonarRings,
  },
  {
    id: 'bioluminescence',
    name: 'Bioluminescence',
    note: 'Patches of the dark glowing and fading out of sync, like fungi lighting up. Most on-theme, calmest, and the only one with no implied direction.',
    Component: Bioluminescence,
  },
  {
    id: 'ribbon',
    name: 'Voice ribbon',
    note: 'A luminous band across the middle that undulates while Kan talks. The most literal picture of a voice, and the clearest signal of who is speaking.',
    Component: VoiceRibbon,
  },
  {
    id: 'canopy',
    name: 'Canopy rays',
    note: 'Slow shafts of light leaning in from above, like sun through trees. Closest in spirit to the aurora but with a source and a direction rather than a drifting wash.',
    Component: CanopyRays,
  },
];
