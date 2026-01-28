import confetti from 'canvas-confetti';

/**
 * Trigger a subtle confetti burst for task completion.
 * The burst is centered on the provided element (e.g., checkbox).
 */
export function celebrateTaskComplete(element: HTMLElement | null): void {
  if (!element) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;

  // Small, contained confetti burst
  confetti({
    particleCount: 25,
    spread: 40,
    origin: { x, y },
    colors: ['#22c55e', '#16a34a', '#4ade80', '#86efac'], // Green shades
    startVelocity: 15,
    gravity: 0.8,
    scalar: 0.6,
    ticks: 80,
    disableForReducedMotion: true,
  });
}
