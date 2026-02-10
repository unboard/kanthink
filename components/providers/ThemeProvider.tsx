'use client';

import { useEffect } from 'react';
import { useSettingsStore, type Theme, fetchAIStatus } from '@/lib/settingsStore';

const VALID_THEMES: Theme[] = ['spores', 'sand'];
const LIGHT_THEMES: Theme[] = ['sand'];

// Migration: fix any corrupted localStorage settings
function migrateSettings() {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem('kanthink-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      let needsMigration = false;

      // Fix invalid theme values
      if (parsed.state?.theme && !VALID_THEMES.includes(parsed.state.theme)) {
        parsed.state.theme = 'spores';
        needsMigration = true;
      }

      // Fix any corrupted structure
      if (!parsed.state) {
        localStorage.removeItem('kanthink-settings');
        return;
      }

      if (needsMigration) {
        localStorage.setItem('kanthink-settings', JSON.stringify(parsed));
      }
    }
  } catch {
    // If localStorage is corrupted, clear it entirely
    localStorage.removeItem('kanthink-settings');
  }
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const safeTheme: Theme = VALID_THEMES.includes(theme) ? theme : 'spores';
  const isLight = LIGHT_THEMES.includes(safeTheme);
  const root = document.documentElement;

  if (isLight) {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }

  root.setAttribute('data-theme', safeTheme);
  // Force a style recalculation - remove all theme classes and add the current one
  document.body.classList.remove('theme-spores', 'theme-stars', 'theme-terminal', 'theme-sand');
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
  // Also migrate any corrupted settings
  useEffect(() => {
    migrateSettings();
    // Read theme from localStorage directly for instant apply before hydration
    try {
      const stored = localStorage.getItem('kanthink-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedTheme = parsed.state?.theme;
        if (storedTheme && VALID_THEMES.includes(storedTheme)) {
          applyTheme(storedTheme);
          return;
        }
      }
    } catch { /* fall through */ }
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
