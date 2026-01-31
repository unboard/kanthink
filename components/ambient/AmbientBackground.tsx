'use client';

import { useSettingsStore } from '@/lib/settingsStore';
import { Starfield } from './Starfield';
import { SporeBackground } from './SporeBackground';

export function AmbientBackground() {
  const theme = useSettingsStore((s) => s.theme);

  // Spores theme uses particles.js
  if (theme === 'spores') {
    return <SporeBackground />;
  }

  // Stars and terminal themes use the starfield
  return <Starfield />;
}
