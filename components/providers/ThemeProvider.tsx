'use client';

import { useEffect } from 'react';
import { useSettingsStore, type Theme, fetchAIStatus } from '@/lib/settingsStore';

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  // Force spores theme - other themes disabled for now
  const safeTheme: Theme = 'spores';
  const root = document.documentElement;

  // ALWAYS force dark mode - no light mode support
  root.classList.add('dark');
  root.classList.remove('light');

  root.setAttribute('data-theme', safeTheme);
  // Force a style recalculation - remove all theme classes and add the current one
  document.body.classList.remove('theme-spores', 'theme-stars', 'theme-terminal');
  document.body.classList.add('theme-' + safeTheme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Also apply on initial mount from localStorage (before store hydration)
  // Always force spores theme regardless of stored value
  useEffect(() => {
    applyTheme('spores');
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
