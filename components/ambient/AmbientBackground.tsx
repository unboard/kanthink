'use client';

import { useSettingsStore } from '@/lib/settingsStore';
import { Starfield } from './Starfield';
import { SporeBackground } from './SporeBackground';

export function AmbientBackground() {
  const theme = useSettingsStore((s) => s.theme);

  // Dark spore theme uses particles.js
  if (theme === 'dark-spore') {
    return <SporeBackground />;
  }

  // Default and terminal themes use the starfield
  return <Starfield />;
}
