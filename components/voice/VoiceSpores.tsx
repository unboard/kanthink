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

interface VoiceSporesProps {
  isSpeaking: boolean;
  isProcessing?: boolean;
}

export const VoiceSpores = memo(function VoiceSpores({ isSpeaking, isProcessing = false }: VoiceSporesProps) {
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
      {/* Aurora gradient — subtle Northern Lights that flows up from bottom when AI speaks */}
      <div
        className="absolute inset-0 aurora-glow"
        style={{ opacity: isSpeaking ? 1 : isProcessing ? 0.5 : 0 }}
      />
      <style>{`
        .aurora-glow {
          transition: opacity 1.2s ease-in-out;
          background:
            linear-gradient(180deg,
              transparent 30%,
              rgba(139,92,246,0.06) 50%,
              rgba(34,211,238,0.10) 65%,
              rgba(103,232,249,0.08) 80%,
              rgba(139,92,246,0.04) 90%,
              transparent 100%
            );
          background-size: 200% 200%;
          animation: aurora-flow 6s ease-in-out infinite;
        }
        @keyframes aurora-flow {
          0%, 100% {
            background-position: 50% 100%;
            filter: hue-rotate(0deg);
          }
          33% {
            background-position: 30% 80%;
            filter: hue-rotate(15deg);
          }
          66% {
            background-position: 70% 90%;
            filter: hue-rotate(-10deg);
          }
        }
      `}</style>
    </div>
  );
});
