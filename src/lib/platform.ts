import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// إعدادات المنصة (الاسم/الشعار) من جدول platform_settings. لو تحديث 015 لسه ما اتشغلش نستخدم الافتراضي.
export type Platform = { name: string; logo_url: string; brand: string }
export const DEFAULT_BRAND = '#0866FF'
const DEFAULT: Platform = { name: 'جمعتنا', logo_url: '', brand: DEFAULT_BRAND }
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
  useEffect(() => {
    if (!p.logo_url) return
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="apple-touch-icon"]').forEach((l) => { l.href = p.logo_url; l.removeAttribute('type'); l.removeAttribute('sizes') })
  }, [p.logo_url])
  const reload = useCallback(() => loadPlatform(), [])
  return { ...p, reload }
}
