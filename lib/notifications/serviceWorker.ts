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

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Subscribe this browser to Web Push, so notifications arrive even with no
 * Kanthink tab open. Needs permission already granted. Safe to call on every
 * load: it reuses the existing subscription and re-sends it, which also moves it
 * to whoever is signed in now. With test, the server sends one right away.
 */
export async function subscribeToPush(opts: { test?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return false
  try {
    if (!swRegistration) await registerServiceWorker()
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }))
    const res = await fetch('/api/notifications/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), test: !!opts.test }),
    })
    return res.ok
  } catch (error) {
    console.warn('[SW] Push subscription failed:', error)
    return false
  }
}

/** Ask for permission if needed, then subscribe. For an explicit "turn on" button. */
export async function enablePushNotifications(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('PushManager' in window)) return 'unsupported'
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return 'denied'
  await subscribeToPush({ test: true })
  return 'granted'
}
