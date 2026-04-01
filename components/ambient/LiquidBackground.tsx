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

// HSL color with good saturation and lightness for dark-mode gradients
function hslColor(h: number, s: number, l: number, a: number = 1): string {
  return `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;
}

// Predefined palettes that look great — each is a set of 5 gradient stops
const PALETTES = [
  { hues: [210, 240, 280, 330, 195], name: 'azure' },
  { hues: [15, 340, 280, 220, 45], name: 'sunset' },
  { hues: [170, 145, 200, 270, 190], name: 'aurora' },
  { hues: [175, 195, 320, 35, 160], name: 'reef' },
  { hues: [140, 160, 270, 300, 40], name: 'forest' },
  { hues: [330, 350, 280, 240, 310], name: 'rose' },
  { hues: [220, 200, 185, 250, 170], name: 'ocean' },
  { hues: [20, 350, 310, 35, 0], name: 'volcanic' },
  { hues: [270, 290, 330, 210, 250], name: 'lavender' },
  { hues: [40, 25, 350, 280, 55], name: 'golden' },
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

  const gradientStyle = useMemo(() => {
    const [h1, h2, h3, h4, h5] = hues;
    return {
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
      {/* Channel cover image as background (blurred, darkened) */}
      {coverImageUrl && (
        <>
          <img
            src={coverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(40px) saturate(1.4) brightness(0.4)', transform: 'scale(1.15)' }}
          />
          {/* Dark overlay to ensure readability */}
          <div className="absolute inset-0 bg-black/30" />
        </>
      )}
      {/* Gradient layer — always present, provides color when no image */}
      <div
        className="absolute inset-0 liquid-base"
        style={{
          ...gradientStyle,
          // When cover image exists, reduce gradient opacity so image dominates
          opacity: coverImageUrl ? 0.5 : 1,
        }}
      />
      {/* Animated blob layers for the liquid motion effect */}
      <div
        className="absolute inset-0 liquid-blobs"
        style={coverImageUrl ? { opacity: 0.4 } : undefined}
      >
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
