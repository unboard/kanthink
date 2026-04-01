'use client';

import { memo, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function hsl(h: number, s: number, l: number, a: number = 1): string {
  return `hsla(${h % 360}, ${s}%, ${l}%, ${a})`;
}

// Bright, vivid palettes — like the abstract digital landscape in the reference
const PALETTES = [
  // Sky Dream — the reference image: azure sky, pink mountains, orange fields, teal water
  [205, 330, 25, 280, 175],
  // Coral Sunset — warm pinks fading into deep blue
  [340, 15, 45, 220, 280],
  // Aurora — northern lights: teal, green, violet, soft pink
  [170, 145, 280, 330, 200],
  // Tropical — turquoise water, coral, golden sand
  [175, 340, 40, 195, 310],
  // Wildflower — lavender, rose, amber, sky
  [270, 340, 45, 210, 290],
  // Ocean — deep blue, cyan, teal, soft peach
  [220, 195, 175, 15, 240],
  // Ember — amber, coral red, magenta, deep violet
  [35, 5, 340, 280, 20],
  // Spring — fresh green, sky blue, soft pink, lemon
  [130, 200, 330, 55, 170],
  // Dusk — rose gold, lavender, navy, warm peach
  [350, 270, 225, 25, 310],
  // Glacier — ice blue, white-blue, soft violet, pale teal
  [200, 215, 260, 185, 230],
];

function getPalette(channelId: string) {
  const hash = hashString(channelId);
  const palette = PALETTES[hash % PALETTES.length];
  const rotation = (hash >> 8) % 25;
  return palette.map(h => (h + rotation) % 360);
}

// Default: the sky dream palette (closest to the reference image)
const DEFAULT_HUES = [205, 330, 25, 280, 175];

export const LiquidBackground = memo(function LiquidBackground({
  className = 'fixed inset-0 z-0 pointer-events-none overflow-hidden',
}: { className?: string }) {
  const params = useParams();
  const channelId = params?.channelId as string | undefined;
  const channel = useStore((s) => channelId ? s.channels[channelId] : undefined);
  const coverImageUrl = channel?.coverImageUrl;

  const hues = useMemo(() => {
    return channelId ? getPalette(channelId) : DEFAULT_HUES;
  }, [channelId]);

  // Bright, vivid, light-mode gradients — like a colorful landscape
  const gradientStyle = useMemo(() => {
    const [h1, h2, h3, h4, h5] = hues;
    return {
      background: `
        radial-gradient(ellipse 120% 80% at 50% -20%, ${hsl(h1, 75, 82, 0.95)} 0%, transparent 60%),
        radial-gradient(ellipse 80% 70% at 0% 100%, ${hsl(h2, 80, 65, 0.85)} 0%, transparent 50%),
        radial-gradient(ellipse 60% 80% at 100% 80%, ${hsl(h5, 75, 60, 0.8)} 0%, transparent 50%),
        radial-gradient(ellipse 70% 50% at 80% 30%, ${hsl(h4, 60, 75, 0.7)} 0%, transparent 45%),
        radial-gradient(ellipse 90% 60% at 30% 70%, ${hsl(h3, 85, 60, 0.7)} 0%, transparent 45%),
        linear-gradient(180deg, ${hsl(h1, 65, 88, 1)} 0%, ${hsl(h1, 50, 78, 1)} 40%, ${hsl(h4, 55, 65, 1)} 100%)
      `.trim(),
    } as React.CSSProperties;
  }, [hues]);

  return (
    <div className={className} aria-hidden="true">
      {/* Channel cover image as background */}
      {coverImageUrl && (
        <>
          <img
            src={coverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(30px) saturate(1.8) brightness(1.1)', transform: 'scale(1.15)' }}
          />
          {/* Light wash to keep readability */}
          <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </>
      )}
      {/* Gradient layer */}
      <div
        className="absolute inset-0 liquid-base"
        style={{
          ...gradientStyle,
          opacity: coverImageUrl ? 0.35 : 1,
        }}
      />
      {/* Animated blobs — bright, saturated colors */}
      <div
        className="absolute inset-0 liquid-blobs"
        style={coverImageUrl ? { opacity: 0.3 } : undefined}
      >
        <div
          className="liquid-blob liquid-blob-1"
          style={{ background: `radial-gradient(circle, ${hsl(hues[0], 80, 75, 0.6)} 0%, transparent 70%)` }}
        />
        <div
          className="liquid-blob liquid-blob-2"
          style={{ background: `radial-gradient(circle, ${hsl(hues[1], 85, 65, 0.5)} 0%, transparent 70%)` }}
        />
        <div
          className="liquid-blob liquid-blob-3"
          style={{ background: `radial-gradient(circle, ${hsl(hues[2], 80, 60, 0.45)} 0%, transparent 70%)` }}
        />
        <div
          className="liquid-blob liquid-blob-4"
          style={{ background: `radial-gradient(circle, ${hsl(hues[3], 75, 70, 0.5)} 0%, transparent 70%)` }}
        />
      </div>
      {/* Noise texture */}
      <div className="absolute inset-0 liquid-noise" />
    </div>
  );
});
