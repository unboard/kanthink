'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

export type NavPanelType = 'channels' | 'shrooms' | 'notifications' | 'account' | 'settings' | null;

interface NavContextValue {
  activePanel: NavPanelType;
  openPanel: (panel: NavPanelType) => void;
  closePanel: () => void;
  togglePanel: (panel: NavPanelType) => void;
  isMobile: boolean;
  showNewChannel: boolean;
  newChannelTargetFolderId: string | null;
  openNewChannel: (targetFolderId?: string | null) => void;
  closeNewChannel: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function useNav() {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error('useNav must be used within a NavProvider');
  }
  return context;
}

interface NavProviderProps {
  children: ReactNode;
}

export function NavProvider({ children }: NavProviderProps) {
  const [activePanel, setActivePanel] = useState<NavPanelType>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelTargetFolderId, setNewChannelTargetFolderId] = useState<string | null>(null);

  // Check for mobile on mount and resize
  useEffect(() => {
    // Initialize on mount
    setIsMobile(window.innerWidth < 768);

    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(prevMobile => {
        // Only close panel when actually switching between mobile/desktop
        if (prevMobile !== mobile) {
          setActivePanel(null);
        }
        return mobile;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty deps - only run on mount

  // Close panel on navigation to full-screen pages (marketplace, public, card detail)
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname && activePanel) {
      const isFullScreenPage =
        pathname.startsWith('/marketplace') ||
        pathname.startsWith('/public') ||
        /\/channel\/[^/]+\/card\//.test(pathname);
      if (isFullScreenPage || isMobile) {
        setActivePanel(null);
      }
    }
    prevPathname.current = pathname;
  }, [pathname, activePanel, isMobile]);

  // Escape key closes panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePanel) {
        setActivePanel(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [activePanel]);

  const openPanel = useCallback((panel: NavPanelType) => {
    // On mobile, blur the active element to dismiss the keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActivePanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const togglePanel = useCallback((panel: NavPanelType) => {
    setActivePanel((current) => {
      if (current !== panel && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return current === panel ? null : panel;
    });
  }, []);

  const openNewChannel = useCallback((targetFolderId: string | null = null) => {
    setActivePanel(null);
    setNewChannelTargetFolderId(targetFolderId);
    setShowNewChannel(true);
  }, []);

  const closeNewChannel = useCallback(() => {
    setShowNewChannel(false);
    setNewChannelTargetFolderId(null);
  }, []);

  return (
    <NavContext.Provider
      value={{
        activePanel,
        openPanel,
        closePanel,
        togglePanel,
        isMobile,
        showNewChannel,
        newChannelTargetFolderId,
        openNewChannel,
        closeNewChannel,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}
