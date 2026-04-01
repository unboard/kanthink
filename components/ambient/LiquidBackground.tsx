'use client';

import { memo, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';

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

function hslColor(h: number, s: number, l: number, a: number = 1): string {
  return `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;
}

// Vibrant palettes — high saturation, visible lightness
const PALETTES = [
  { hues: [210, 240, 280, 330, 195] },  // azure dream
  { hues: [15, 340, 280, 220, 45] },    // sunset lagoon
  { hues: [170, 145, 200, 270, 190] },   // aurora
  { hues: [175, 195, 320, 35, 160] },    // tropical reef
  { hues: [140, 160, 270, 300, 40] },    // mystic forest
  { hues: [330, 350, 280, 240, 310] },   // rose quartz
  { hues: [220, 200, 185, 250, 170] },   // deep ocean
  { hues: [20, 350, 310, 35, 0] },      // volcanic
  { hues: [270, 290, 330, 210, 250] },   // lavender fields
  { hues: [40, 25, 350, 280, 55] },     // golden hour
];

function getPalette(channelId: string) {
  const hash = hashString(channelId);
  const palette = PALETTES[hash % PALETTES.length];
  const rotation = (hash >> 8) % 30;
  return palette.hues.map(h => (h + rotation) % 360);
}

const DEFAULT_HUES = [210, 240, 280, 330, 195];

interface LiquidBackgroundProps {
  className?: string;
}

export const LiquidBackground = memo(function LiquidBackground({
  className = 'fixed inset-0 z-0 pointer-events-none overflow-hidden',
}: LiquidBackgroundProps) {
  const params = useParams();
  const channelId = params?.channelId as string | undefined;
  const channel = useStore((s) => channelId ? s.channels[channelId] : undefined);
  const coverImageUrl = channel?.coverImageUrl;

  const hues = useMemo(() => {
    return channelId ? getPalette(channelId) : DEFAULT_HUES;
  }, [channelId]);

  // Much more vibrant gradients — higher saturation (85%), higher lightness (35-45%), more opacity
  const gradientStyle = useMemo(() => {
    const [h1, h2, h3, h4, h5] = hues;
    return {
      background: `
        radial-gradient(ellipse 80% 60% at 10% 85%, ${hslColor(h1, 85, 40, 0.8)} 0%, transparent 55%),
        radial-gradient(ellipse 70% 80% at 90% 15%, ${hslColor(h2, 80, 35, 0.75)} 0%, transparent 50%),
        radial-gradient(ellipse 90% 50% at 50% 50%, ${hslColor(h3, 75, 30, 0.6)} 0%, transparent 55%),
        radial-gradient(ellipse 60% 70% at 25% 25%, ${hslColor(h4, 80, 38, 0.55)} 0%, transparent 45%),
        radial-gradient(ellipse 50% 90% at 80% 75%, ${hslColor(h5, 85, 36, 0.65)} 0%, transparent 50%),
        linear-gradient(135deg, ${hslColor(h1, 50, 12, 1)} 0%, ${hslColor(h3, 45, 10, 1)} 100%)
      `.trim(),
    } as React.CSSProperties;
  }, [hues]);

  return (
    <div className={className} aria-hidden="true">
      {/* Channel cover image as background (blurred, darkened) */}
      {coverImageUrl && (
        <>
          <img
            src={coverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(40px) saturate(1.6) brightness(0.5)', transform: 'scale(1.15)' }}
          />
          <div className="absolute inset-0 bg-black/20" />
        </>
      )}
      {/* Gradient layer */}
      <div
        className="absolute inset-0 liquid-base"
        style={{
          ...gradientStyle,
          opacity: coverImageUrl ? 0.4 : 1,
        }}
      />
      {/* Animated blob layers — brighter, more saturated */}
      <div
        className="absolute inset-0 liquid-blobs"
        style={coverImageUrl ? { opacity: 0.35 } : undefined}
      >
        <div
          className="liquid-blob liquid-blob-1"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[0], 90, 45, 0.55)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-2"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[1], 85, 42, 0.5)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-3"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[2], 80, 48, 0.45)} 0%, transparent 70%)`,
          }}
        />
        <div
          className="liquid-blob liquid-blob-4"
          style={{
            background: `radial-gradient(circle, ${hslColor(hues[3], 85, 40, 0.5)} 0%, transparent 70%)`,
          }}
        />
      </div>
      {/* Subtle noise texture overlay for depth */}
      <div className="absolute inset-0 liquid-noise" />
    </div>
  );
});
