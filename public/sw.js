// النسخة دي بتشيل الـ service worker من أي متصفح كان سجّله، وبتمسح الملفات المحفوظة
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.registration.unregister()
    const list = await self.clients.matchAll({ type: 'window' })
    list.forEach((c) => c.navigate(c.url))
  })())
})
