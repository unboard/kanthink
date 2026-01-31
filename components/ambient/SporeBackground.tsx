'use client';

import { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';

const particlesConfig: ISourceOptions = {
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
        mode: ['repulse', 'bubble'],
      },
      onClick: {
        enable: true,
        mode: 'push',
      },
      resize: {
        enable: true,
      },
    },
    modes: {
      repulse: {
        distance: 100,
        duration: 0.4,
      },
      bubble: {
        distance: 150,
        size: 3,
        duration: 0.4,
        opacity: 0.8,
      },
      push: {
        quantity: 3,
      },
    },
  },
  detectRetina: true,
  background: {
    color: 'transparent',
  },
  fullScreen: {
    enable: false,
  },
};

export function SporeBackground() {
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
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <Particles
        id="spore-particles"
        options={particlesConfig}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
