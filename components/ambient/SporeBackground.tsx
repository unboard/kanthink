'use client';

import { useEffect, useState, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';

const CORE_COLORS = ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'];
const GLOW = '34, 211, 238'; // #22d3ee
/** Share of a sprite's radius that is the bright core; the rest is the cyan halo. */
const CORE = 0.18;

/**
 * One glowing spore, drawn once per colour and reused every frame.
 *
 * The spores used to glow via canvas `shadowBlur`, which re-blurs every particle on
 * every frame — among the most expensive things a canvas can do, across a full-screen
 * canvas at display resolution. With another tab playing video, that was enough to make
 * it stutter and buffer. Stamping a pre-drawn sprite looks the same and costs little.
 */
function sprite(color: string): string {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const r = size / 2;
  const halo = ctx.createRadialGradient(r, r, 0, r, r, r);
  halo.addColorStop(0, `rgba(${GLOW}, 0.9)`);
  halo.addColorStop(CORE, `rgba(${GLOW}, 0.55)`);
  halo.addColorStop(0.5, `rgba(${GLOW}, 0.15)`);
  halo.addColorStop(1, `rgba(${GLOW}, 0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(r, r, r * CORE, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL('image/png');
}

function buildConfig(): ISourceOptions {
  return {
    // Slow drift reads as smooth at 30fps; there's nothing to gain from more.
    fpsLimit: 30,
    particles: {
      number: {
        value: 60,
        density: { enable: true, width: 800, height: 800 },
      },
      shape: {
        type: 'image',
        options: {
          image: CORE_COLORS.map((color) => ({ src: sprite(color), width: 64, height: 64 })),
        },
      },
      opacity: { value: { min: 0.1, max: 0.3 } },
      // Sprite radius: the old 0.5–2px core, scaled up so the core stays that size
      // inside its halo.
      size: { value: { min: 0.5 / CORE, max: 2 / CORE } },
      links: { enable: false },
      move: {
        enable: true,
        speed: 0.8,
        direction: 'bottom-right',
        random: true,
        straight: false,
        outModes: { default: 'out' },
      },
    },
    interactivity: {
      detectsOn: 'window',
      events: {
        onHover: { enable: true, mode: 'bubble' },
        resize: { enable: true },
      },
      modes: {
        // The old bloom grew the core to 3px; same in sprite terms.
        bubble: { distance: 150, size: 3 / CORE, duration: 0.4, opacity: 0.8 },
      },
    },
    detectRetina: true,
    background: { color: 'transparent' },
    fullScreen: { enable: false },
  };
}

interface SporeBackgroundProps {
  /** Custom class for the container (default: fixed positioning for page background) */
  className?: string;
  /** Unique ID for particles instance (needed if multiple on page) */
  id?: string;
}

export const SporeBackground = memo(function SporeBackground({
  className = "fixed inset-0 z-0 pointer-events-none overflow-hidden",
  id = "spore-particles"
}: SporeBackgroundProps) {
  const [config, setConfig] = useState<ISourceOptions | null>(null);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      // Sprites need a document, so the config is built here rather than at import.
      setConfig(buildConfig());
    });
  }, []);

  if (!config) {
    return null;
  }

  return (
    <div
      className={className}
      aria-hidden="true"
    >
      <Particles
        id={id}
        options={config}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
});
