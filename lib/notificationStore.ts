import { create } from 'zustand'
import type { NotificationData } from '@/lib/notifications/types'

const MAX_NOTIFICATIONS = 100

interface NotificationState {
  notifications: NotificationData[]
  unreadCount: number
  isOpen: boolean
  hasPermission: boolean | null // null = not yet checked

  addNotification: (notification: NotificationData) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  dismissNotification: (id: string) => void
  loadNotifications: (notifications: NotificationData[]) => void
  setOpen: (open: boolean) => void
  setHasPermission: (has: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  hasPermission: null,

  addNotification: (notification) => {
    set((state) => {
      // Prevent duplicates
      if (state.notifications.some(n => n.id === notification.id)) {
        return state
      }

      const updated = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS)
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.isRead).length,
      }
    })
  },

  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map(n =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.isRead).length,
      }
    })

    // Fire-and-forget API call
    fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({
        ...n,
        isRead: true,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }))

    // Fire-and-forget API call
    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  },

  dismissNotification: (id) => {
    set((state) => {
      const updated = state.notifications.filter(n => n.id !== id)
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.isRead).length,
      }
    })
  },

  loadNotifications: (notifications) => {
    set({
      notifications: notifications.slice(0, MAX_NOTIFICATIONS),
      unreadCount: notifications.filter(n => !n.isRead).length,
    })
  },

  setOpen: (open) => set({ isOpen: open }),

  setHasPermission: (has) => set({ hasPermission: has }),
}))
