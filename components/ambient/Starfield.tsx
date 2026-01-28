'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';

interface StarfieldProps {
  state?: 'idle' | 'active';
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkle: boolean;
  twinkleDelay: number;
}

// Seeded random for consistent star positions
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 9973; // Prime number for better distribution
    stars.push({
      id: i,
      x: Math.round(seededRandom(seed) * 10000) / 100, // Round to 2 decimals
      y: Math.round(seededRandom(seed + 1) * 10000) / 100,
      size: Math.round((1 + seededRandom(seed + 2) * 1.5) * 100) / 100,
      opacity: Math.round((0.3 + seededRandom(seed + 3) * 0.5) * 100) / 100,
      twinkle: seededRandom(seed + 4) > 0.85, // ~15% of stars twinkle
      twinkleDelay: Math.round(seededRandom(seed + 5) * 800) / 100, // 0-8s delay
    });
  }
  return stars;
}

export function Starfield({ state = 'idle' }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastShootingStarRef = useRef<number>(0);

  const stars = useMemo(() => generateStars(100), []);

  const drawShootingStar = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const startX = Math.random() * width * 0.8;
    const startY = Math.random() * height * 0.4;
    const length = 150 + Math.random() * 100;
    const angle = Math.PI / 6 + Math.random() * (Math.PI / 6); // 30-60 degrees
    const duration = 800 + Math.random() * 400;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);

      ctx.clearRect(0, 0, width, height);

      if (progress < 1) {
        const currentLength = length * eased;
        const tailLength = Math.min(currentLength, 80);
        const headX = startX + Math.cos(angle) * currentLength;
        const headY = startY + Math.sin(angle) * currentLength;
        const tailX = headX - Math.cos(angle) * tailLength;
        const tailY = headY - Math.sin(angle) * tailLength;

        // Fade out near end
        const opacity = progress > 0.7 ? (1 - progress) / 0.3 : 1;

        const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
        gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
        gradient.addColorStop(0.8, `rgba(255, 255, 255, ${0.4 * opacity})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${0.8 * opacity})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  const maybeSpawnShootingStar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = Date.now();
    const minInterval = state === 'active' ? 8000 : 15000;
    const maxInterval = state === 'active' ? 15000 : 45000;
    const interval = minInterval + Math.random() * (maxInterval - minInterval);

    if (now - lastShootingStarRef.current > interval) {
      lastShootingStarRef.current = now;
      drawShootingStar(ctx, canvas.width, canvas.height);
    }
  }, [state, drawShootingStar]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return () => window.removeEventListener('resize', updateSize);
    }

    // Shooting star loop
    const checkShootingStar = () => {
      maybeSpawnShootingStar();
      animationRef.current = requestAnimationFrame(checkShootingStar);
    };

    // Initial delay before first possible shooting star
    const timeout = setTimeout(() => {
      lastShootingStarRef.current = Date.now() - 10000; // Allow first star after ~5-35s
      checkShootingStar();
    }, 3000);

    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [maybeSpawnShootingStar]);

  return (
    <div
      className="starfield"
      data-state={state}
      aria-hidden="true"
    >
      {/* Generated stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className={`starfield-star ${star.twinkle ? 'starfield-star-twinkle' : ''}`}
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDelay: star.twinkle ? `${star.twinkleDelay}s` : undefined,
          }}
        />
      ))}

      {/* Shooting star canvas */}
      <canvas
        ref={canvasRef}
        className="starfield-canvas"
      />
    </div>
  );
}
