'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useNav, type NavPanelType } from '@/components/providers/NavProvider';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { useNotificationStore } from '@/lib/notificationStore';

interface NavIconButtonProps {
  panel?: NavPanelType;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  isMobile?: boolean;
}

function NavIconButton({ icon, label, isActive, onPointerDown, isMobile }: NavIconButtonProps) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={`
        flex items-center justify-center transition-colors
        ${isMobile
          ? `flex-1 h-12 ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'}`
          : `w-10 h-10 rounded-lg ${isActive
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
              : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`
        }
      `}
      title={label}
      aria-label={label}
    >
      <div className={`${isMobile ? 'flex flex-col items-center gap-0.5' : ''} ${isActive ? '[&_img]:opacity-100' : '[&_img]:opacity-50'}`}>
        {icon}
        {isMobile && (
          <span className={`text-[10px] font-medium ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
            {label}
          </span>
        )}
      </div>
    </button>
  );
}

function NotificationNavButton({ isMobile }: { isMobile?: boolean }) {
  const { activePanel, togglePanel } = useNav();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isActive = activePanel === 'notifications';

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel('notifications');
  };

  const bellIcon = (
    <div className="relative">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-violet-500 rounded-full">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        className={`flex-1 h-12 flex flex-col items-center justify-center transition-colors ${
          isActive ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'
        }`}
        aria-label="Notifications"
      >
        <div className="flex flex-col items-center gap-0.5">
          {bellIcon}
          <span className={`text-[10px] font-medium ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
            Alerts
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
        isActive
          ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
      }`}
      title="Notifications"
      aria-label="Notifications"
    >
      {bellIcon}
    </button>
  );
}

// Desktop vertical nav (left side)
function DesktopNav() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { activePanel, togglePanel, closePanel } = useNav();

  const handleToggle = (panel: NavPanelType) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel(panel);
  };

  const handleNavigate = (href: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activePanel) closePanel();
    router.push(href);
  };

  return (
    <nav
      data-mini-nav
      className="hidden md:flex flex-col items-center w-14 h-full py-4 bg-neutral-100/50 dark:bg-neutral-900/50 border-r border-neutral-200 dark:border-neutral-800"
    >
      {/* Logo - links to home dashboard */}
      <Link href="/" className="mb-6 block hover:opacity-80 transition-opacity">
        <img
          src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
          alt="Kanthink - Go to dashboard"
          className="h-6 w-6"
        />
      </Link>

      {/* Main navigation icons */}
      <div className="flex flex-col items-center gap-2 flex-1">
        <NavIconButton
          panel="channels"
          isActive={activePanel === 'channels'}
          onPointerDown={handleToggle('channels')}
          label="Channels"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          }
        />

        <NavIconButton
          panel="shrooms"
          isActive={activePanel === 'shrooms'}
          onPointerDown={handleToggle('shrooms')}
          label="Shrooms"
          icon={
            <img
              src="https://res.cloudinary.com/dcht3dytz/image/upload/v1770097904/shrooms_ez2c6v.svg"
              alt=""
              className="w-5 h-5"
            />
          }
        />

        <NavIconButton
          isActive={pathname === '/feed'}
          onPointerDown={handleNavigate('/feed')}
          label="Feed"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          }
        />
      </div>

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-2">
        <NotificationNavButton isMobile={false} />

        <NavIconButton
          panel="account"
          isActive={false}
          onPointerDown={handleNavigate('/settings')}
          label="Account"
          icon={
            session?.user?.image ? (
              <img
                src={session.user.image}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )
          }
        />

        <NavIconButton
          panel="settings"
          isActive={false}
          onPointerDown={handleNavigate('/settings')}
          label="Settings"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </div>
    </nav>
  );
}

// Mobile horizontal nav (bottom)
function MobileNav() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { activePanel, togglePanel, closePanel } = useNav();

  // Use onPointerDown + preventDefault to prevent synthesized click from closing sheet
  const handleToggle = (panel: NavPanelType) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel(panel);
  };

  const handleNavigate = (href: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activePanel) closePanel();
    router.push(href);
  };

  return (
    <nav
      data-mini-nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center h-16 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-200 dark:border-neutral-800 safe-area-bottom"
    >
      <NavIconButton
        panel="channels"
        isActive={activePanel === 'channels'}
        onPointerDown={handleToggle('channels')}
        label="Channels"
        isMobile
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        }
      />

      <NavIconButton
        panel="shrooms"
        isActive={activePanel === 'shrooms'}
        onPointerDown={handleToggle('shrooms')}
        label="Shrooms"
        isMobile
        icon={
          <img
            src="https://res.cloudinary.com/dcht3dytz/image/upload/v1770097904/shrooms_ez2c6v.svg"
            alt=""
            className="w-5 h-5"
          />
        }
      />

      <NavIconButton
        isActive={pathname === '/feed'}
        onPointerDown={handleNavigate('/feed')}
        label="Feed"
        isMobile
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        }
      />

      <NotificationNavButton isMobile />

      <NavIconButton
        panel="account"
        isActive={activePanel === 'account'}
        onPointerDown={handleToggle('account')}
        label="Account"
        isMobile
        icon={
          session?.user?.image ? (
            <img
              src={session.user.image}
              alt=""
              className="w-5 h-5 rounded-full"
            />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )
        }
      />

      <NavIconButton
        panel="settings"
        isActive={activePanel === 'settings'}
        onPointerDown={handleToggle('settings')}
        label="Settings"
        isMobile
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      />
    </nav>
  );
}

export function MiniNav() {
  return (
    <>
      <DesktopNav />
      <MobileNav />
    </>
  );
}
