'use client';

import { NavPanel } from './NavPanel';
import { ThemeSection } from '@/components/settings/ThemeSection';
import { AISettings } from '@/components/settings/AISettings';
import { SystemInstructions } from '@/components/settings/SystemInstructions';

export function SettingsPanel() {
  return (
    <NavPanel panelKey="settings" title="Settings" width="lg">
      <div className="p-4 space-y-8">
        <ThemeSection />

        <hr className="border-neutral-200 dark:border-neutral-800" />

        <AISettings />

        <hr className="border-neutral-200 dark:border-neutral-800" />

        <SystemInstructions />
      </div>
    </NavPanel>
  );
}
