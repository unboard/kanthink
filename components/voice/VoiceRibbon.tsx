'use client';

import { memo } from 'react';

/**
 * The "Kan is speaking" layer in voice mode.
 *
 * A luminous band across the middle of the screen that undulates while Kan
 * talks. It replaces an aurora gradient that washed up from the bottom — that
 * read as weather rather than as speech, and gave no signal about which of you
 * was talking.
 *
 * Animates transform and opacity only. This runs on a phone during a live audio
 * session, so anything that triggers layout is off the table, and it stills
 * entirely under prefers-reduced-motion.
 */

interface VoiceRibbonProps {
  /** True while Kan is speaking. Fades in and out rather than popping. */
  active: boolean;
  /** Unique per mount — SVG gradient ids are document-global. */
  idSuffix?: string;
}

export const VoiceRibbon = memo(function VoiceRibbon({ active, idSuffix = 'live' }: VoiceRibbonProps) {
  const gradientId = `voice-ribbon-grad-${idSuffix}`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
      style={{ opacity: active ? 1 : 0 }}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-x-0 top-1/2 h-48 w-full -translate-y-1/2"
        viewBox="0 0 390 180"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0)" />
            <stop offset="25%" stopColor="rgba(167,139,250,0.85)" />
            <stop offset="55%" stopColor="rgba(34,211,238,0.85)" />
            <stop offset="100%" stopColor="rgba(103,232,249,0)" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            className="voice-ribbon-path"
            d="M0,90 C 60,40 120,140 195,90 C 270,40 330,140 390,90"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={i === 0 ? 2.5 : 1.2}
            opacity={i === 0 ? 0.95 : 0.4}
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </svg>
      <style>{`
        .voice-ribbon-path {
          transform-origin: center;
          animation: voice-ribbon-undulate 3.4s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(139,92,246,.55));
        }
        @keyframes voice-ribbon-undulate {
          0%, 100% { transform: scaleY(1) translateY(0) }
          25% { transform: scaleY(1.55) translateY(-4px) }
          50% { transform: scaleY(.6) translateY(3px) }
          75% { transform: scaleY(1.3) translateY(-2px) }
        }
        @media (prefers-reduced-motion: reduce) {
          .voice-ribbon-path { animation: none; }
        }
      `}</style>
    </div>
  );
});
