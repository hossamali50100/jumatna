import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// إعدادات المنصة (الاسم/الشعار) من جدول platform_settings. لو تحديث 015 لسه ما اتشغلش نستخدم الافتراضي.
export type Platform = { name: string; logo_url: string; brand: string; login_title: string; login_sub: string; tagline: string; logo_layout: 'row' | 'stack'; logo_place: 'inside' | 'outside'; logo_gap: number }
export const DEFAULT_TEXTS = { login_title: 'لمّة أصحابك في مكان واحد', login_sub: 'مجموعات، أصدقاء، ودردشة… كل اللي يخلّيك قريب من ناسك.', tagline: 'مجموعاتك وأصدقاؤك في تطبيق واحد' }
export const DEFAULT_BRAND = '#0866FF'
const DEFAULT: Platform = { name: 'جمعتنا', logo_url: '', brand: DEFAULT_BRAND, ...DEFAULT_TEXTS, logo_layout: 'row', logo_place: 'inside', logo_gap: 12 }
const HEX = /^#[0-9a-fA-F]{6}$/
// درجة أغمق شوية للـ hover
const darken = (hex: string) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.86).toString(16).padStart(2, '0')).join('')
export function applyBrand(hex: string) {
  const c = HEX.test(hex) ? hex : DEFAULT_BRAND
  document.documentElement.style.setProperty('--brand', c)
  document.documentElement.style.setProperty('--brand-dark', darken(c))
}
let cache: Platform | null = null
const subs = new Set<(p: Platform) => void>()

export async function loadPlatform(): Promise<Platform> {
  const { data, error } = await supabase.from('platform_settings').select('key,value')
  const p = { ...DEFAULT }
  if (!error) for (const r of (data ?? []) as { key: string; value: string }[]) {
    if (r.key === 'name' && r.value.trim()) p.name = r.value
    if (r.key === 'logo_url') p.logo_url = r.value
    if (r.key === 'brand' && HEX.test(r.value)) p.brand = r.value
    if ((r.key === 'login_title' || r.key === 'login_sub' || r.key === 'tagline') && r.value.trim()) p[r.key] = r.value
    if (r.key === 'logo_place' && (r.value === 'inside' || r.value === 'outside')) p.logo_place = r.value
    if (r.key === 'logo_gap' && Number.isFinite(Number(r.value))) p.logo_gap = Math.min(60, Math.max(0, Math.round(Number(r.value))))
    if (r.key === 'logo_layout' && (r.value === 'row' || r.value === 'stack')) p.logo_layout = r.value
  }
  applyBrand(p.brand)
  cache = p; subs.forEach((f) => f(p))
  return p
}

export function usePlatform() {
  const [p, setP] = useState<Platform>(cache ?? DEFAULT)
  useEffect(() => {
    subs.add(setP)
    if (!cache) loadPlatform()
    return () => { subs.delete(setP) }
  }, [])
  useEffect(() => { document.title = p.name }, [p.name])
  // لو الأدمن رفع لوجو للمنصة نستخدمه كأيقونة للتبويب
  // ولو مفيش لوجو: أيقونة من أول حرف من الاسم بلون المنصة
  useEffect(() => {
    let href = p.logo_url
    let type: string | null = null
    if (!href) {
      const ch = (p.name.trim().charAt(0) || 'J').replace(/[&<>"']/g, '')
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${p.brand}"/><text x="32" y="46" font-size="40" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif">${ch}</text></svg>`
      href = 'data:image/svg+xml,' + encodeURIComponent(svg); type = 'image/svg+xml'
    }
    let links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]'))
    if (!links.length) { const l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); links = [l] }
    links.forEach((l) => { l.href = href; l.removeAttribute('sizes'); if (type) l.type = type; else l.removeAttribute('type') })
  }, [p.logo_url, p.name, p.brand])
  const reload = useCallback(() => loadPlatform(), [])
  return { ...p, reload }
}
