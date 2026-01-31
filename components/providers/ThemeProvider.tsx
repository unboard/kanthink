'use client';

import { useEffect } from 'react';
import { useSettingsStore, type Theme, fetchAIStatus } from '@/lib/settingsStore';

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Force a style recalculation - remove all theme classes and add the current one
  document.body.classList.remove('theme-spores', 'theme-stars', 'theme-terminal');
  document.body.classList.add('theme-' + theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Also apply on initial mount from localStorage (before store hydration)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('kanthink-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedTheme = parsed?.state?.theme;
        if (storedTheme === 'spores' || storedTheme === 'stars' || storedTheme === 'terminal') {
          applyTheme(storedTheme);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }, []);

  // Reapply when store hydrates (in case it differs from localStorage read)
  useEffect(() => {
    if (hasHydrated) {
      applyTheme(theme);
    }
  }, [hasHydrated, theme]);

  // Check if server has an owner API key configured
  useEffect(() => {
    fetchAIStatus();
  }, []);

  return <>{children}</>;
}
