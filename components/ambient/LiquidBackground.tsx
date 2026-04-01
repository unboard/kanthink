'use client';

import { memo, useMemo } from 'react';
import { useParams } from 'next/navigation';

// Generate a deterministic color palette from a string (channel ID)
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// HSL color with good saturation and lightness for dark-mode gradients
function hslColor(h: number, s: number, l: number, a: number = 1): string {
  return `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;
}

// Predefined palettes that look great — each is a set of 5 gradient stops
// Inspired by the liquid/abstract landscape aesthetic
const PALETTES = [
  // Azure Dream — sky blue, soft pink, lavender
  { hues: [210, 240, 280, 330, 195], name: 'azure' },
  // Sunset Lagoon — coral, magenta, deep blue
  { hues: [15, 340, 280, 220, 45], name: 'sunset' },
  // Northern Lights — teal, green, violet
  { hues: [170, 145, 200, 270, 190], name: 'aurora' },
  // Tropical Reef — turquoise, warm pink, golden
  { hues: [175, 195, 320, 35, 160], name: 'reef' },
  // Mystic Forest — emerald, deep purple, amber
  { hues: [140, 160, 270, 300, 40], name: 'forest' },
  // Rose Quartz — pink, mauve, soft blue
  { hues: [330, 350, 280, 240, 310], name: 'rose' },
  // Deep Ocean — navy, teal, cyan
  { hues: [220, 200, 185, 250, 170], name: 'ocean' },
  // Volcanic — warm orange, red, deep magenta
  { hues: [20, 350, 310, 35, 0], name: 'volcanic' },
  // Lavender Fields — purple, pink, sky
  { hues: [270, 290, 330, 210, 250], name: 'lavender' },
  // Golden Hour — amber, peach, soft violet
  { hues: [40, 25, 350, 280, 55], name: 'golden' },
];

function getPalette(channelId: string) {
  const hash = hashString(channelId);
  const palette = PALETTES[hash % PALETTES.length];
  // Add a slight hue rotation per channel so even channels sharing a palette feel unique
  const rotation = (hash >> 8) % 30;
  return palette.hues.map(h => (h + rotation) % 360);
}

// Default palette when no channel is active (dashboard/settings)
const DEFAULT_HUES = [210, 240, 280, 330, 195];

interface LiquidBackgroundProps {
  className?: string;
}

export const LiquidBackground = memo(function LiquidBackground({
  className = 'fixed inset-0 z-0 pointer-events-none overflow-hidden',
}: LiquidBackgroundProps) {
  const params = useParams();
  const channelId = params?.channelId as string | undefined;

  const hues = useMemo(() => {
    return channelId ? getPalette(channelId) : DEFAULT_HUES;
  }, [channelId]);

  // Build the gradient layers — 5 large radial gradients that overlap and animate
  const gradientStyle = useMemo(() => {
    const [h1, h2, h3, h4, h5] = hues;
    return {
      // Base dark background with colored tint
      background: `
        radial-gradient(ellipse 80% 60% at 10% 90%, ${hslColor(h1, 75, 25, 0.7)} 0%, transparent 60%),
        radial-gradient(ellipse 70% 80% at 85% 20%, ${hslColor(h2, 70, 22, 0.65)} 0%, transparent 55%),
        radial-gradient(ellipse 90% 50% at 50% 50%, ${hslColor(h3, 60, 18, 0.5)} 0%, transparent 60%),
        radial-gradient(ellipse 60% 70% at 20% 30%, ${hslColor(h4, 65, 20, 0.45)} 0%, transparent 50%),
        radial-gradient(ellipse 50% 90% at 75% 80%, ${hslColor(h5, 70, 23, 0.55)} 0%, transparent 55%),
        linear-gradient(135deg, ${hslColor(h1, 40, 10, 1)} 0%, ${hslColor(h3, 35, 8, 1)} 100%)
      `.trim(),
    } as React.CSSProperties;
  }, [hues]);

  return (
    <div className={className} aria-hidden="true">
      {/* Base gradient layer */}
      <div
        className="absolute inset-0 liquid-base"
        style={gradientStyle}
      />
      {/* Animated blob layers for the liquid motion effect */}
      <div className="absolute inset-0 liquid-blobs">
        <div
          className="liquid-blob liquid-blob-1"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[0], 80, 30, 0.4)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-2"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[1], 75, 28, 0.35)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-3"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[2], 70, 32, 0.3)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-4"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[3], 65, 26, 0.35)} 0%, transparent 70%)`,
          }}
        />
      </div>
      {/* Subtle noise texture overlay for depth */}
      <div className="absolute inset-0 liquid-noise" />
    </div>
  );
});
