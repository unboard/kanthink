'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type NavPanelType = 'channels' | 'shrooms' | 'account' | 'settings' | null;

interface NavContextValue {
  activePanel: NavPanelType;
  openPanel: (panel: NavPanelType) => void;
  closePanel: () => void;
  togglePanel: (panel: NavPanelType) => void;
  isMobile: boolean;
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
    setActivePanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const togglePanel = useCallback((panel: NavPanelType) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  return (
    <NavContext.Provider
      value={{
        activePanel,
        openPanel,
        closePanel,
        togglePanel,
        isMobile,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}
