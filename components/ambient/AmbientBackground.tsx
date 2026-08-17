'use client';

import { usePathname } from 'next/navigation';
import { SporeBackground } from './SporeBackground';
// import { Starfield } from './Starfield'; // Disabled - only spores theme available for now

// Routes that paint their own full-viewport surface over the whole app. The
// spore canvas is completely hidden behind them but keeps repainting, and on
// /watch that invisible work competes with video decode for the GPU — which is
// what made desktop playback stutter. Skip it entirely there.
const NO_AMBIENT = [/^\/watch(\/|$)/, /^\/snailblast(\/|$)/];

export function AmbientBackground() {
  const pathname = usePathname();
  if (NO_AMBIENT.some((r) => r.test(pathname ?? ''))) return null;

  // Only spores theme available for now
  return <SporeBackground />;
}
