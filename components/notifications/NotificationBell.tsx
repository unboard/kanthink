'use client'

import { useRef, useEffect } from 'react'
import { useNotificationStore } from '@/lib/notificationStore'
import { NotificationCenter } from './NotificationCenter'

interface NotificationBellProps {
  isMobile?: boolean
}

export function NotificationBell({ isMobile }: NotificationBellProps) {
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const isOpen = useNotificationStore((s) => s.isOpen)
  const setOpen = useNotificationStore((s) => s.setOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, setOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, setOpen])

  const bellIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )

  if (isMobile) {
    return (
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className={`flex-1 h-12 flex flex-col items-center justify-center ${
            isOpen ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'
          }`}
          aria-label="Notifications"
        >
          <div className="relative">
            {bellIcon}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-violet-500 rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-medium ${isOpen ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
            Alerts
          </span>
        </button>

        {/* Mobile dropdown — slides up from bottom */}
        {isOpen && (
          <div className="fixed bottom-16 left-0 right-0 z-50 mx-2 mb-2 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden safe-area-bottom">
            <NotificationCenter onClose={() => setOpen(false)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
          isOpen
            ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
            : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
        title="Notifications"
        aria-label="Notifications"
      >
        <div className="relative">
          {bellIcon}
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-violet-500 rounded-full">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </button>

      {/* Desktop dropdown */}
      {isOpen && (
        <div className="absolute left-full top-0 ml-2 w-80 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden z-50">
          <NotificationCenter onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
