import { useEffect, useState, type ReactNode } from 'react'
import { isPremium, type Profile } from './supabase'

const PAL = ['#16A085', '#E67E22', '#8E44AD', '#C0392B', '#2C3E50', '#2980B9', '#27AE60', '#D35400']
export const gcolor = (s?: string | null) => {
  let h = 0
  for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PAL[h % PAL.length]
}
export const initial = (s?: string | null) => (s || '؟').trim().charAt(0) || '؟'

export function useIsMobile() {
  const q = '(max-width: 820px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return m
}

const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1H4a1 1 0 01-1-1z',
  groups: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 11a2.5 2.5 0 100-5M15 14c3 0 6 2 6 5',
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.500l-2 5-5 2 2-5z',
  friends: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.500 2.700-6 6-6s6 2.500 6 6M19 8v6M22 11h-6',
  msg: 'M21 12a8 8 0 01-11.500 7.200L4 20l1-4.500A8 8 0 1121 12z',
  bell: 'M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.300-4.300',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  card: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18',
  out: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  heart: 'M12 21s-7-4.500-9.500-9A5.500 5.500 0 0112 6a5.500 5.500 0 019.500 6c-2.500 4.500-9.500 9-9.500 9z',
  comment: 'M21 12a8 8 0 01-11.500 7.200L4 20l1-4.500A8 8 0 1121 12z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  image: 'M4 5h16v14H4zM8 10a1.500 1.500 0 100-3 1.500 1.500 0 000 3zM20 16l-5-5-8 8',
  check: 'M5 12l5 5 9-10',
  send: 'M4 12v7h16v-7M12 3v12M7 8l5-5 5 5',
}
export function Icon({ n, s = 22 }: { n: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={P[n]} />
    </svg>
  )
}

export const Check = () => (
  <span className="badge" title="حساب مميز" aria-label="حساب مميز">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
  </span>
)

export function Avatar({ name, url, size = 40, square = false }: { name?: string | null; url?: string | null; size?: number; square?: boolean }) {
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.42, background: gcolor(name), borderRadius: square ? Math.round(size * 0.28) : '50%' }}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : initial(name)}
    </span>
  )
}

export function Name({ p }: { p: Pick<Profile, 'name' | 'plan' | 'plan_until'> | null }) {
  return <span>{isPremium(p) && <Check />}<b>{p?.name ?? 'مستخدم'}</b></span>
}

export const Err = ({ children }: { children?: ReactNode }) => (children ? <div className="err" role="alert">{children}</div> : null)

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`
  return `منذ ${Math.floor(s / 86400)} يوم`
}

// نقطة إشعار حمرا بعدد فوق أيقونة
export function Badged({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      {n > 0 && <span aria-label={`${n} جديد`} style={{ position: 'absolute', top: -6, insetInlineEnd: -8, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#E5383B', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', lineHeight: 1, border: '2px solid #fff', boxSizing: 'content-box' }}>{n > 9 ? '9+' : n}</span>}
    </span>
  )
}
