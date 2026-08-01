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

/* ── Batch two ───────────────────────────────────────────────────
   The first batch mostly added something on top of the spores. These try other
   relationships: connecting them, recolouring the whole scene, moving them as a
   body, or leaving the centre alone entirely. */

/**
 * 6. Mycelial threads — light branching between spores, the same idea as the
 *    thinking indicator scaled up to the whole screen. Makes speaking look like
 *    a network firing, and ties voice mode to the mark used everywhere else.
 */
export function MycelialThreads({ active }: EffectProps) {
  const paths = [
    'M195,350 C150,300 90,290 40,240', 'M195,350 C240,300 300,285 345,235',
    'M195,350 C160,420 110,470 55,520', 'M195,350 C235,425 290,470 340,515',
    'M195,350 C185,270 190,190 175,110', 'M195,350 C205,430 200,530 215,610',
    'M40,240 C20,200 15,170 8,140', 'M345,235 C365,195 370,170 378,145',
    'M55,520 C35,560 28,590 20,620', 'M340,515 C360,555 368,585 375,615',
  ];
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
        <g stroke="rgba(167,139,250,0.55)" strokeWidth="1.1" fill="none" strokeLinecap="round">
          {paths.map((d, i) => (
            <path key={d} d={d} className="vs-thread" style={{ animationDelay: `${(i % 5) * 0.45}s` }} />
          ))}
        </g>
        {[[40, 240], [345, 235], [55, 520], [340, 515], [175, 110], [215, 610]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2.4" fill="rgba(196,181,253,0.9)"
            className="vs-thread-node" style={{ animationDelay: `${(i % 5) * 0.45 + 0.6}s` }} />
        ))}
      </svg>
      <style>{`
        .vs-thread { stroke-dasharray: 0 260; animation: vs-branch 3.6s ease-in-out infinite; filter: drop-shadow(0 0 4px rgba(139,92,246,.6)); }
        @keyframes vs-branch {
          0% { stroke-dasharray: 0 260; opacity: 0 }
          20% { opacity: .9 }
          55% { stroke-dasharray: 260 260; opacity: .9 }
          100% { stroke-dasharray: 260 260; opacity: 0 }
        }
        .vs-thread-node { animation: vs-node-pop 3.6s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes vs-node-pop { 0%,25% { opacity: 0; transform: scale(0) } 55% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(.5) } }
      `}</style>
    </div>
  );
}

/**
 * 7. Edge bloom — light gathers at the borders and breathes, leaving the middle
 *    untouched. Nothing sits over the transcript, which makes it the safest of
 *    the lot to read against, and the closest to how phone assistants signal.
 */
export function EdgeBloom({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div className="vs-edge absolute inset-0" />
      <style>{`
        .vs-edge {
          background:
            radial-gradient(120% 42% at 50% -8%, rgba(167,139,250,0.34) 0%, transparent 62%),
            radial-gradient(120% 42% at 50% 108%, rgba(34,211,238,0.30) 0%, transparent 62%),
            radial-gradient(42% 90% at -8% 50%, rgba(139,92,246,0.24) 0%, transparent 60%),
            radial-gradient(42% 90% at 108% 50%, rgba(103,232,249,0.22) 0%, transparent 60%);
          animation: vs-edge-breathe 3.6s ease-in-out infinite;
        }
        @keyframes vs-edge-breathe { 0%,100% { opacity: .5; transform: scale(1) } 50% { opacity: 1; transform: scale(1.03) } }
      `}</style>
    </div>
  );
}

/**
 * 8. Warm shift — no new shapes at all. The scene moves from cool to warm while
 *    Kan talks, so the change is a temperature you feel rather than an object
 *    you notice. The most restrained option by a distance.
 */
export function WarmShift({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div
        className="vs-warm absolute inset-0"
        style={{ mixBlendMode: 'screen' }}
      />
      <style>{`
        .vs-warm {
          background:
            radial-gradient(90% 70% at 50% 60%, rgba(251,191,36,0.16) 0%, rgba(244,114,182,0.08) 45%, transparent 75%),
            radial-gradient(60% 40% at 50% 100%, rgba(251,146,60,0.14) 0%, transparent 70%);
          animation: vs-warm-breathe 4.4s ease-in-out infinite;
        }
        @keyframes vs-warm-breathe { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
      `}</style>
    </div>
  );
}

/**
 * 9. Vortex — faint arms turning slowly about the centre, so the whole field
 *    reads as circulating. Motion rather than brightness, which stays legible
 *    over a long call because there is no repeating flash to catch the eye.
 */
export function Vortex({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      <div className="vs-vortex absolute inset-[-25%]" />
      <style>{`
        .vs-vortex {
          background: conic-gradient(from 0deg,
            transparent 0deg, rgba(139,92,246,0.16) 28deg, transparent 74deg,
            transparent 120deg, rgba(34,211,238,0.14) 150deg, transparent 196deg,
            transparent 240deg, rgba(167,139,250,0.13) 270deg, transparent 318deg);
          -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 12%, black 42%, transparent 78%);
          mask-image: radial-gradient(circle at 50% 50%, transparent 12%, black 42%, transparent 78%);
          animation: vs-spin 26s linear infinite;
          filter: blur(14px);
        }
        @keyframes vs-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

/**
 * 10. Contour ripple — topographic rings expanding outward, like a map of the
 *     sound. More graphic than the rest, and the only one that gives voice mode
 *     a bit of an instrument-panel character.
 */
export function ContourRipple({ active }: EffectProps) {
  return (
    <div className={base} style={{ opacity: active ? 1 : 0 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="vs-contour absolute inset-[-40%]"
          style={{ animationDelay: `${i * 2.2}s` }}
        />
      ))}
      <style>{`
        .vs-contour {
          background: repeating-radial-gradient(circle at 50% 50%,
            transparent 0px, transparent 16px,
            rgba(167,139,250,0.20) 17px, rgba(167,139,250,0.20) 18px,
            transparent 19px, transparent 34px);
          -webkit-mask-image: radial-gradient(circle at 50% 50%, black 8%, transparent 55%);
          mask-image: radial-gradient(circle at 50% 50%, black 8%, transparent 55%);
          animation: vs-contour-out 6.6s ease-out infinite;
        }
        @keyframes vs-contour-out {
          0% { transform: scale(.35); opacity: 0 }
          18% { opacity: .85 }
          100% { transform: scale(1.9); opacity: 0 }
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

export const EFFECTS_V1: EffectOption[] = [
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

export const EFFECTS_V2: EffectOption[] = [
  {
    id: 'mycelial-threads',
    name: 'Mycelial threads',
    note: 'Light branching between points, the thinking indicator scaled to the whole screen. Speaking looks like a network firing, and it ties voice mode to the mark now used everywhere else in the app.',
    Component: MycelialThreads,
  },
  {
    id: 'edge-bloom',
    name: 'Edge bloom',
    note: 'Light gathers at the borders and breathes, leaving the middle clear. Nothing sits over the transcript, so it is the easiest to read against — and the closest to how phone assistants signal.',
    Component: EdgeBloom,
  },
  {
    id: 'warm-shift',
    name: 'Warm shift',
    note: 'No new shapes at all. The scene moves from cool to warm while Kan talks, so the change is a temperature you feel rather than an object you notice. Far and away the most restrained.',
    Component: WarmShift,
  },
  {
    id: 'vortex',
    name: 'Vortex',
    note: 'Faint arms turning slowly about the centre, so the field reads as circulating. Motion rather than brightness, which holds up over a long call because there is no repeating flash to catch the eye.',
    Component: Vortex,
  },
  {
    id: 'contour',
    name: 'Contour ripple',
    note: 'Topographic rings expanding outward, like a map of the sound. The most graphic option, and the only one that gives voice mode an instrument-panel character.',
    Component: ContourRipple,
  },
];

/** Everything, for pickers that want one flat list. */
export const EFFECTS: EffectOption[] = [...EFFECTS_V1, ...EFFECTS_V2];
