'use client';

import { useEffect } from 'react';
import { useSettingsStore, type Theme } from '@/lib/settingsStore';

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Force a style recalculation
  document.body.classList.add('theme-' + theme);
  document.body.classList.remove('theme-' + (theme === 'terminal' ? 'default' : 'terminal'));
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
        if (storedTheme === 'default' || storedTheme === 'terminal') {
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

  return <>{children}</>;
}
