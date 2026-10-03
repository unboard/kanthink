// Kanthink Service Worker — handles browser notifications when tab is hidden

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, data } = event.data

    self.registration.showNotification(title, {
      body,
      icon: icon || '/icon-192x192.png',
      badge: badge || '/icon-192x192.png',
      data,
      tag: data?.notificationId || undefined,
    })
  }
})

// Web Push from the server: arrives even with no Kanthink tab open.
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (_) { payload = { title: 'Kanthink', body: event.data ? event.data.text() : '' } }
  const title = payload.title || 'Kanthink'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: payload.notificationId || undefined,
      data: { url: payload.url || '/', notificationId: payload.notificationId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const url = data.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if one exists
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url,
            notificationId: data.notificationId,
          })
          return
        }
      }

      // Open new tab
      return self.clients.openWindow(url)
    })
  )
})
