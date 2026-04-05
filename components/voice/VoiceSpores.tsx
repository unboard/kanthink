'use client';

import { useEffect, useState, useRef, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions, Container } from '@tsparticles/engine';

function buildConfig(speaking: boolean, processing = false): ISourceOptions {
  // Processing: calm, focused pulsing in cyan/violet
  const speed = processing ? 0.6 : speaking ? 2.5 : 1.2;
  const opacityRange = processing ? { min: 0.1, max: 0.6 } : speaking ? { min: 0.2, max: 0.7 } : { min: 0.15, max: 0.5 };
  const sizeRange = processing ? { min: 0.5, max: 3.5 } : speaking ? { min: 1, max: 4 } : { min: 0.5, max: 3 };
  const colors = processing
    ? ['#67e8f9', '#22d3ee', '#06b6d4', '#a78bfa', '#818cf8']
    : speaking
      ? ['#a78bfa', '#67e8f9', '#22d3ee', '#c4b5fd', '#818cf8', '#34d399']
      : ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'];

  return {
    particles: {
      number: {
        value: processing ? 120 : speaking ? 150 : 100,
        density: { enable: true, width: 600, height: 600 },
      },
      color: { value: colors },
      shape: { type: 'circle' },
      opacity: {
        value: opacityRange,
        animation: {
          enable: true,
          speed: processing ? 3 : speaking ? 2 : 0.8,
          sync: processing, startValue: 'random' as const,
        },
      },
      size: {
        value: sizeRange,
        animation: {
          enable: speaking || processing,
          speed: processing ? 4 : 3,
          sync: processing, startValue: 'random' as const,
        },
      },
      shadow: {
        enable: true,
        color: processing ? '#22d3ee' : speaking ? '#a78bfa' : '#22d3ee',
        blur: processing ? 20 : speaking ? 15 : 10,
        offset: { x: 0, y: 0 },
      },
      links: { enable: false },
      move: {
        enable: true,
        speed,
        direction: processing ? 'none' : speaking ? 'none' : 'bottom-right',
        random: !processing,
        straight: false,
        outModes: { default: 'out' },
        vibrate: speaking && !processing,
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
  isProcessing?: boolean;
}

export const VoiceSpores = memo(function VoiceSpores({ isSpeaking, isProcessing = false }: VoiceSporesProps) {
  const [init, setInit] = useState(false);
  const containerRef = useRef<Container | null>(null);
  const prevSpeaking = useRef(isSpeaking);
  const prevProcessing = useRef(isProcessing);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInit(true));
  }, []);

  // React to speaking/processing state changes by updating particle behavior
  useEffect(() => {
    if (!containerRef.current) return;
    if (prevSpeaking.current === isSpeaking && prevProcessing.current === isProcessing) return;
    prevSpeaking.current = isSpeaking;
    prevProcessing.current = isProcessing;

    const container = containerRef.current;
    const opts = container.options;
    const speed = isProcessing ? 0.6 : isSpeaking ? 2.5 : 1.2;

    if (opts.particles.move) {
      (opts.particles.move as { speed: number }).speed = speed;
      (opts.particles.move as { direction: string }).direction = isProcessing || isSpeaking ? 'none' : 'bottom-right';
    }

    if (opts.particles.opacity) {
      (opts.particles.opacity as { value: { min: number; max: number } }).value = isProcessing
        ? { min: 0.1, max: 0.6 }
        : isSpeaking ? { min: 0.2, max: 0.7 } : { min: 0.15, max: 0.5 };
    }

    if (opts.particles.size) {
      (opts.particles.size as { value: { min: number; max: number } }).value = isProcessing
        ? { min: 0.5, max: 3.5 }
        : isSpeaking ? { min: 1, max: 4 } : { min: 0.5, max: 3 };
    }

    container.refresh();
  }, [isSpeaking, isProcessing]);

  if (!init) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <Particles
        id="voice-spore-particles"
        options={buildConfig(isSpeaking, isProcessing)}
        className="absolute inset-0 w-full h-full"
        particlesLoaded={async (container) => {
          if (container) containerRef.current = container;
        }}
      />
    </div>
  );
});
