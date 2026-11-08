import type { ReactNode } from 'react'
import { isPremium, type Profile } from '../lib/supabase'

export const Check = () => (
  <span className="badge" title="حساب مميز" aria-label="حساب مميز">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
  </span>
)

export function Avatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : (name || '؟').trim().charAt(0)}
    </span>
  )
}

export function Name({ p }: { p: Pick<Profile, 'name' | 'plan' | 'plan_until'> | null }) {
  return <b className="row" style={{ gap: 6 }}>{isPremium(p) && <Check />}{p?.name ?? 'مستخدم'}</b>
}

export const Err = ({ children }: { children?: ReactNode }) => (children ? <div className="err" role="alert">{children}</div> : null)

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`
  return `منذ ${Math.floor(s / 86400)} يوم`
}
