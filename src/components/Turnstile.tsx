// علامة "أنا إنسان" من Cloudflare (Turnstile) في صفحات الدخول والتسجيل
// بتمنع البرامج (bots) إنها تعمل حسابات وهمية. المفتاح ده عام (مش سري)، والسري متحط في Supabase.
import { useCallback, useEffect, useRef, useState } from 'react'

export const TURNSTILE_SITE_KEY = '0x4AAAAAAGWxv_NtPmwCTyf5' // ← Site Key من Cloudflare Turnstile

type TS = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: TS; __tsLoad?: Promise<void> } }

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!window.__tsLoad) {
    window.__tsLoad = new Promise((ok, bad) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true; s.defer = true
      s.onload = () => ok(); s.onerror = () => { window.__tsLoad = undefined; bad(new Error('turnstile')) }
      document.head.appendChild(s)
    })
  }
  return window.__tsLoad
}

/** بيرجع: العنصر اللي بيتعرض، والتوكن، ودالة reset بعد كل محاولة */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const wid = useRef<string | null>(null)
  const enabled = !!TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!enabled) return
    let dead = false
    load().then(() => {
      if (dead || !box.current || !window.turnstile) return
      wid.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'ar',
        theme: 'light',
        size: 'flexible',
        callback: (t: string) => { setToken(t); setFailed(false) },
        'expired-callback': () => setToken(null),
        'error-callback': () => { setToken(null); setFailed(true) },
      })
    }).catch(() => setFailed(true))
    return () => { dead = true; if (wid.current) { try { window.turnstile?.remove(wid.current) } catch { /* */ } wid.current = null } }
  }, [enabled])

  const reset = useCallback(() => { setToken(null); if (wid.current) { try { window.turnstile?.reset(wid.current) } catch { /* */ } } }, [])

  const el = enabled ? (
    <div className="col" style={{ gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><span aria-hidden>🛡️</span>تأكيد إنك إنسان مش روبوت</span>
      <div ref={box} style={{ minHeight: 65 }} />
      {failed && <div className="mut" style={{ fontSize: 12, marginTop: 4 }}>علامة التحقق مش راضية تحمّل. حدّث الصفحة، أو جرّب متصفح تاني.</div>}
    </div>
  ) : null

  /** لو الحماية شغالة ومفيش توكن لسه: رسالة للمستخدم */
  const missing = enabled && !token ? 'استنى ثانية لحد ما علامة التحقق ✓ تخلص، وبعدين دوس تاني.' : null
  return { el, token: token ?? undefined, reset, missing }
}
