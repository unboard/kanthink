'use client';

import { useEffect, useState, useRef, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions, Container } from '@tsparticles/engine';

function buildConfig(speaking: boolean): ISourceOptions {
  return {
    particles: {
      number: {
        value: speaking ? 150 : 100,
        density: { enable: true, width: 600, height: 600 },
      },
      color: {
        value: speaking
          ? ['#a78bfa', '#67e8f9', '#22d3ee', '#c4b5fd', '#818cf8', '#34d399']
          : ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'],
      },
      shape: { type: 'circle' },
      opacity: {
        value: speaking ? { min: 0.2, max: 0.7 } : { min: 0.15, max: 0.5 },
        animation: {
          enable: true,
          speed: speaking ? 2 : 0.8,
          sync: false, startValue: 'random' as const, //_min: 0.1,
        },
      },
      size: {
        value: speaking ? { min: 1, max: 4 } : { min: 0.5, max: 3 },
        animation: {
          enable: speaking,
          speed: 3,
          sync: false, startValue: 'random' as const, //_min: 0.5,
        },
      },
      shadow: {
        enable: true,
        color: speaking ? '#a78bfa' : '#22d3ee',
        blur: speaking ? 15 : 10,
        offset: { x: 0, y: 0 },
      },
      links: { enable: false },
      move: {
        enable: true,
        speed: speaking ? 2.5 : 1.2,
        direction: speaking ? 'none' : 'bottom-right',
        random: true,
        straight: false,
        outModes: { default: 'out' },
        vibrate: speaking,
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
          size: speaking ? 5 : 3,
          duration: 0.4,
          opacity: speaking ? 1 : 0.8,
        },
      },
    },
    detectRetina: true,
    background: { color: 'transparent' },
    fullScreen: { enable: false },
  };
}

interface VoiceSporesProps {
  isSpeaking: boolean;
}

export const VoiceSpores = memo(function VoiceSpores({ isSpeaking }: VoiceSporesProps) {
  const [init, setInit] = useState(false);
  const containerRef = useRef<Container | null>(null);
  const prevSpeaking = useRef(isSpeaking);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInit(true));
  }, []);

  // React to speaking state changes by updating particle behavior
  useEffect(() => {
    if (!containerRef.current || prevSpeaking.current === isSpeaking) return;
    prevSpeaking.current = isSpeaking;

    const container = containerRef.current;
    const opts = container.options;

    // Update speed
    if (opts.particles.move) {
      (opts.particles.move as { speed: number }).speed = isSpeaking ? 2.5 : 1.2;
      (opts.particles.move as { direction: string }).direction = isSpeaking ? 'none' : 'bottom-right';
    }

    // Update opacity
    if (opts.particles.opacity) {
      (opts.particles.opacity as { value: { min: number; max: number } }).value = isSpeaking
        ? { min: 0.2, max: 0.7 }
        : { min: 0.15, max: 0.5 };
    }

    // Update size
    if (opts.particles.size) {
      (opts.particles.size as { value: { min: number; max: number } }).value = isSpeaking
        ? { min: 1, max: 4 }
        : { min: 0.5, max: 3 };
    }

    container.refresh();
  }, [isSpeaking]);

  if (!init) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <Particles
        id="voice-spore-particles"
        options={buildConfig(isSpeaking)}
        className="absolute inset-0 w-full h-full"
        particlesLoaded={async (container) => {
          if (container) containerRef.current = container;
        }}
      />
    </div>
  );
});
