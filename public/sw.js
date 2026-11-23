// Lammmah service worker
// الصفحة نفسها بتتجاب من النت كل مرة (عشان أي تحديث يظهر على طول)،
// والملفات الثابتة (الخطوط والأيقونات وملفات /assets اللي اسمها بيتغير مع كل تحديث) بتتحفظ عشان التطبيق يفتح أسرع.
// أي حاجة من Supabase (البيانات والصور والدخول) مبتعديش على الملف ده خالص.
const CACHE = 'lammmah-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/offline.js', '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // فتح صفحة: من النت دايمًا، ولو مفيش نت نعرض صفحة "مفيش اتصال"
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
    return
  }

  // ملفات ثابتة اسمها مبيتغيرش محتواها: من المحفوظ الأول
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})
