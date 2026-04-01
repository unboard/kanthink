'use client';

import { useSettingsStore } from '@/lib/settingsStore';
import { SporeBackground } from './SporeBackground';
import { LiquidBackground } from './LiquidBackground';

export function AmbientBackground() {
  const theme = useSettingsStore((s) => s.theme);

  if (theme === 'liquid') {
    return <LiquidBackground />;
  }

  return <SporeBackground />;
}
