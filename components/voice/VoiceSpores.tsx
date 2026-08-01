'use client';

import { useEffect, useState, useRef, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions, Container } from '@tsparticles/engine';

function buildConfig(): ISourceOptions {
  return {
    particles: {
      number: {
        value: 100,
        density: { enable: true, width: 600, height: 600 },
      },
      color: {
        value: ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'],
      },
      shape: { type: 'circle' },
      opacity: {
        value: { min: 0.15, max: 0.5 },
        animation: {
          enable: true,
          speed: 0.8,
          sync: false, startValue: 'random' as const,
        },
      },
      size: {
        value: { min: 0.5, max: 3 },
      },
      shadow: {
        enable: true,
        color: '#22d3ee',
        blur: 10,
        offset: { x: 0, y: 0 },
      },
      links: { enable: false },
      move: {
        enable: true,
        speed: 1.2,
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
        bubble: {
          distance: 120,
          size: 3,
          duration: 0.4,
          opacity: 0.8,
        },
      },
    },
    detectRetina: true,
    background: { color: 'transparent' },
    fullScreen: { enable: false },
  };
}

/**
 * The spore field only. The "Kan is speaking" layer used to live here as an
 * aurora gradient; it is now VoiceRibbon, rendered separately, so this stays a
 * constant background that never reacts to state.
 */

export const VoiceSpores = memo(function VoiceSpores() {
  const [init, setInit] = useState(false);
  const containerRef = useRef<Container | null>(null);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInit(true));
  }, []);

  if (!init) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Particles — constant, never change based on state */}
      <Particles
        id="voice-spore-particles"
        options={buildConfig()}
        className="absolute inset-0 w-full h-full"
        particlesLoaded={async (container) => {
          if (container) containerRef.current = container;
        }}
      />
    </div>
  );
});
