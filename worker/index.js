// سيرفر صغير جنب الموقع (Cloudflare Worker)
// شغلته الوحيدة: يدي العضو المسجّل بيانات دخول مؤقتة لسيرفر TURN بتاع Cloudflare عشان المكالمات توصل حتى على نت الموبايل.
// المفتاح السري (TURN_KEY_API_TOKEN) متحط في إعدادات Cloudflare كـ Secret، ومش موجود في الكود ولا بيوصل للمتصفح.
// أي طلب غير /api/... بيروح للموقع العادي زي الأول.

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

async function ice(req, env) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_KEY) return json({ error: 'unauthorized' }, 401)
  // نتأكد إن اللي طالب عضو مسجّل دخول فعلًا
  const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_KEY, authorization: auth } })
  if (!u.ok) return json({ error: 'unauthorized' }, 401)
  // لسه مفيش مفتاح TURN: المكالمات تشتغل بالتوصيل المباشر بس
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ iceServers: STUN, turn: false })
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: 4 * 3600 }),
    })
    if (!r.ok) throw new Error('turn ' + r.status)
    const d = await r.json()
    // المتصفحات بتقفل البورت 53، فبنشيله
    const list = [].concat(d.iceServers || [])
      .map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((x) => !/:53(\?|$)/.test(x)) }))
      .filter((s) => s.urls.length)
    return json({ iceServers: list.length ? list : STUN, turn: list.length > 0 })
  } catch {
    return json({ iceServers: STUN, turn: false })
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/api/ice') return ice(req, env)
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404)
    return env.ASSETS.fetch(req)
  },
}
