'use client';

import { useSettingsStore } from '@/lib/settingsStore';
import { SporeBackground } from './SporeBackground';

export function AmbientBackground() {
  const theme = useSettingsStore((s) => s.theme);

  // Sand theme has no ambient particles — clean, calm light background
  if (theme === 'sand') return null;

  return <SporeBackground />;
}
