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

  // On mobile or marketplace pages, no margin adjustment needed
  const isMarketplace = pathname.startsWith('/marketplace') || pathname.startsWith('/public');
  const marginLeft = isMobile || isMarketplace ? 0 : getPanelWidth(activePanel);

  // No bottom padding on card pages (mobile nav is hidden, card has its own tabs)
  const isCardPage = /\/channel\/[^/]+\/card\//.test(pathname);
  // Full-viewport routes hide the mobile nav entirely, so they must not reserve
  // the bottom-nav padding (it would push their 100dvh content into a scroll).
  const isFullViewport =
    pathname.startsWith('/watch') ||
    pathname.startsWith('/play') ||
    pathname.startsWith('/wildwood') ||
    pathname.startsWith('/rescue');
  const needsBottomPadding = isMobile && !isCardPage && !isFullViewport;

  return (
    <div
      className={`flex flex-1 flex-col overflow-hidden transition-all duration-200 ${needsBottomPadding ? 'pb-16' : ''}`}
      style={{ marginLeft }}
    >
      {children}
    </div>
  );
}
