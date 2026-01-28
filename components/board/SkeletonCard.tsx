'use client';

import { useEffect, useRef } from 'react';

type HalftoneVariant = 'dot-field' | 'dot-field-wave' | 'dot-field-pulse' | 'dot-field-sparse';

interface SkeletonCardProps {
  variant?: HalftoneVariant;
  className?: string;
}

export function SkeletonCard({ variant = 'dot-field-pulse', className = '' }: SkeletonCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get actual display size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Dot grid settings based on variant
    const settings = getVariantSettings(variant);
    const { dotSpacing, dotRadius, baseOpacity, animationSpeed } = settings;

    // Create dot grid with random phase offsets
    const cols = Math.ceil(width / dotSpacing) + 1;
    const rows = Math.ceil(height / dotSpacing) + 1;
    const dots: { x: number; y: number; phase: number; speed: number }[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({
          x: col * dotSpacing,
          y: row * dotSpacing,
          phase: Math.random() * Math.PI * 2, // Random start phase
          speed: 0.5 + Math.random() * 1.5, // Varied animation speed
        });
      }
    }

    // Check for dark mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dotColor = isDark ? '255, 255, 255' : '0, 0, 0';

    let startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = (currentTime - startTime) / 1000; // seconds

      ctx!.clearRect(0, 0, width, height);

      for (const dot of dots) {
        // Calculate opacity based on sine wave with random phase
        let opacity: number;

        if (variant === 'dot-field-wave') {
          // Wave pattern moving across
          const wavePhase = (dot.x + dot.y) * 0.02 + elapsed * animationSpeed;
          opacity = baseOpacity + Math.sin(wavePhase + dot.phase) * 0.3;
        } else if (variant === 'dot-field-pulse') {
          // Radial pulse from center
          const cx = width / 2;
          const cy = height / 2;
          const dist = Math.sqrt((dot.x - cx) ** 2 + (dot.y - cy) ** 2);
          const pulsePhase = dist * 0.05 - elapsed * animationSpeed * 2;
          opacity = baseOpacity + Math.sin(pulsePhase + dot.phase * 0.3) * 0.25;
        } else if (variant === 'dot-field-sparse') {
          // More dramatic random variation
          const t = elapsed * animationSpeed * dot.speed + dot.phase;
          opacity = baseOpacity * (0.3 + Math.sin(t) * 0.5 + Math.sin(t * 1.7) * 0.3);
        } else {
          // Default: gentle random twinkling
          const t = elapsed * animationSpeed * dot.speed + dot.phase;
          opacity = baseOpacity + Math.sin(t) * 0.2 + Math.sin(t * 2.3) * 0.1;
        }

        opacity = Math.max(0.05, Math.min(0.8, opacity));

        ctx!.beginPath();
        ctx!.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${dotColor}, ${opacity})`;
        ctx!.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [variant]);

  return (
    <div
      className={`
        relative overflow-hidden rounded-md bg-transparent
        ${className}
      `}
      style={{ minHeight: '80px' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

function getVariantSettings(variant: HalftoneVariant) {
  switch (variant) {
    case 'dot-field-wave':
      return { dotSpacing: 12, dotRadius: 1.5, baseOpacity: 0.25, animationSpeed: 0.8 };
    case 'dot-field-pulse':
      return { dotSpacing: 12, dotRadius: 1.5, baseOpacity: 0.2, animationSpeed: 0.6 };
    case 'dot-field-sparse':
      return { dotSpacing: 14, dotRadius: 1.2, baseOpacity: 0.35, animationSpeed: 0.4 };
    case 'dot-field':
    default:
      return { dotSpacing: 12, dotRadius: 1.5, baseOpacity: 0.25, animationSpeed: 0.5 };
  }
}

// Variant descriptions for the prototype page
export const variantDescriptions: Record<HalftoneVariant, { name: string; description: string }> = {
  'dot-field': {
    name: 'Random Twinkle',
    description: 'Each dot has independent random brightness that shifts gently over time',
  },
  'dot-field-wave': {
    name: 'Diagonal Wave',
    description: 'Brightness ripples diagonally across the grid with random variation',
  },
  'dot-field-pulse': {
    name: 'Radial Pulse',
    description: 'Brightness radiates outward from center like a thinking pulse',
  },
  'dot-field-sparse': {
    name: 'Sparse Drama',
    description: 'More contrast between bright and dim dots, slower and moodier',
  },
};
