'use client';

import { type ReactNode } from 'react';
import { useNav } from '@/components/providers/NavProvider';
import { getPanelWidth } from './NavPanel';

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const { activePanel, isMobile } = useNav();

  // On mobile, no margin adjustment needed (panels are overlays)
  const marginLeft = isMobile ? 0 : getPanelWidth(activePanel);

  return (
    <div
      className={`flex flex-1 flex-col overflow-hidden transition-all duration-200 ${isMobile ? 'pb-16' : ''}`}
      style={{ marginLeft }}
    >
      {children}
    </div>
  );
}
