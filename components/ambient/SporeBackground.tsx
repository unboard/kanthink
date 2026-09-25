'use client';

import { useEffect, useState, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';

const particlesConfig: ISourceOptions = {
  // The glow is canvas shadowBlur, redrawn for every particle on every frame — costly
  // enough, full-screen, to make a video in another tab stutter. The drift is slow, so
  // 30fps reads the same as 60 at half the work.
  fpsLimit: 30,
  particles: {
    number: {
      value: 60,
      density: {
        enable: true,
        width: 800,
        height: 800,
      },
    },
    color: {
      value: ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'],
    },
    shape: {
      type: 'circle',
    },
    opacity: {
      value: { min: 0.1, max: 0.3 },
    },
    size: {
      value: { min: 0.5, max: 2 },
    },
    shadow: {
      enable: true,
      color: '#22d3ee',
      blur: 8,
      offset: {
        x: 0,
        y: 0,
      },
    },
    links: {
      enable: false,
    },
    move: {
      enable: true,
      speed: 0.8,
      direction: 'bottom-right',
      random: true,
      straight: false,
      outModes: {
        default: 'out',
      },
    },
  },
  interactivity: {
    detectsOn: 'window',
    events: {
      onHover: {
        enable: true,
        mode: 'bubble',
      },
      resize: {
        enable: true,
      },
    },
    modes: {
      bubble: {
        distance: 150,
        size: 3,
        duration: 0.4,
        opacity: 0.8,
      },
    },
  },
  // Soft, blurred glows gain nothing from 2–4x device pixels, and that multiplies the
  // blur's cost. Drawn at CSS resolution they look the same.
  detectRetina: false,
  background: {
    color: 'transparent',
  },
  fullScreen: {
    enable: false,
  },
};

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
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) {
    return null;
  }

  return (
    <div
      className={className}
      aria-hidden="true"
    >
      <Particles
        id={id}
        options={particlesConfig}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
});
