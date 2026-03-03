'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useNav } from '@/components/providers/NavProvider';
import { getPanelWidth } from './NavPanel';

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const { activePanel, isMobile } = useNav();
  const pathname = usePathname();

  // On mobile, no margin adjustment needed (panels are overlays)
  const marginLeft = isMobile ? 0 : getPanelWidth(activePanel);

  // No bottom padding on card pages (mobile nav is hidden, card has its own tabs)
  const isCardPage = /\/channel\/[^/]+\/card\//.test(pathname);
  const needsBottomPadding = isMobile && !isCardPage;

  return (
    <div
      className={`flex flex-1 flex-col overflow-hidden transition-all duration-200 ${needsBottomPadding ? 'pb-16' : ''}`}
      style={{ marginLeft }}
    >
      {children}
    </div>
  );
}
