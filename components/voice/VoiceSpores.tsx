'use client';

import { useEffect, useState, useRef, memo } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions, Container } from '@tsparticles/engine';

function buildConfig(processing = false): ISourceOptions {
  return {
    particles: {
      number: {
        value: 100,
        density: { enable: true, width: 600, height: 600 },
      },
      color: {
        value: processing
          ? ['#67e8f9', '#22d3ee', '#06b6d4', '#a78bfa', '#818cf8']
          : ['#ffffff', '#a5f3fc', '#67e8f9', '#22d3ee', '#c4b5fd'],
      },
      shape: { type: 'circle' },
      opacity: {
        value: processing ? { min: 0.1, max: 0.6 } : { min: 0.15, max: 0.5 },
        animation: {
          enable: true,
          speed: processing ? 3 : 0.8,
          sync: processing, startValue: 'random' as const,
        },
      },
      size: {
        value: processing ? { min: 0.5, max: 3.5 } : { min: 0.5, max: 3 },
        animation: {
          enable: processing,
          speed: 4,
          sync: processing, startValue: 'random' as const,
        },
      },
      shadow: {
        enable: true,
        color: '#22d3ee',
        blur: processing ? 20 : 10,
        offset: { x: 0, y: 0 },
      },
      links: { enable: false },
      move: {
        enable: true,
        speed: processing ? 0.6 : 1.2,
        direction: processing ? 'none' : 'bottom-right',
        random: !processing,
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

interface VoiceSporesProps {
  isSpeaking: boolean;
  isProcessing?: boolean;
}

export const VoiceSpores = memo(function VoiceSpores({ isSpeaking, isProcessing = false }: VoiceSporesProps) {
  const [init, setInit] = useState(false);
  const containerRef = useRef<Container | null>(null);
  const prevProcessing = useRef(isProcessing);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setInit(true));
  }, []);

  // Only react to processing state changes (spores stay constant when speaking)
  useEffect(() => {
    if (!containerRef.current) return;
    if (prevProcessing.current === isProcessing) return;
    prevProcessing.current = isProcessing;

    const container = containerRef.current;
    const opts = container.options;

    if (opts.particles.move) {
      (opts.particles.move as { speed: number }).speed = isProcessing ? 0.6 : 1.2;
      (opts.particles.move as { direction: string }).direction = isProcessing ? 'none' : 'bottom-right';
    }

    if (opts.particles.opacity) {
      (opts.particles.opacity as { value: { min: number; max: number } }).value = isProcessing
        ? { min: 0.1, max: 0.6 }
        : { min: 0.15, max: 0.5 };
    }

    container.refresh();
  }, [isProcessing]);

  if (!init) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <Particles
        id="voice-spore-particles"
        options={buildConfig(isProcessing)}
        className="absolute inset-0 w-full h-full"
        particlesLoaded={async (container) => {
          if (container) containerRef.current = container;
        }}
      />
      {/* Aurora gradient — subtle Northern Lights glow when AI speaks */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          isSpeaking ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'linear-gradient(180deg, transparent 40%, rgba(139,92,246,0.08) 60%, rgba(34,211,238,0.12) 75%, rgba(103,232,249,0.06) 90%, transparent 100%)',
          animation: isSpeaking ? 'aurora 4s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`
        @keyframes aurora {
          0%, 100% {
            background-position: 50% 100%;
            opacity: 0.7;
          }
          25% {
            background-position: 30% 80%;
            opacity: 1;
          }
          50% {
            background-position: 70% 90%;
            opacity: 0.85;
          }
          75% {
            background-position: 40% 85%;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
});
