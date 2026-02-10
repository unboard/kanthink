let swRegistration: ServiceWorkerRegistration | null = null

/**
 * Register the service worker for browser notifications.
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js')
    return true
  } catch (error) {
    console.error('[SW] Registration failed:', error)
    return false
  }
}

/**
 * Request notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }

  return await Notification.requestPermission()
}

/**
 * Show a browser notification via the service worker.
 */
export function showBrowserNotification(opts: {
  title: string
  body: string
  notificationId?: string
  url?: string
}): void {
  if (!swRegistration?.active) {
    return
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
    return
  }

  swRegistration.active.postMessage({
    type: 'SHOW_NOTIFICATION',
    title: opts.title,
    body: opts.body,
    data: {
      notificationId: opts.notificationId,
      url: opts.url || '/',
    },
  })
}
