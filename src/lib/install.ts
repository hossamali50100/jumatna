// تثبيت الموقع كتطبيق على الموبايل/الكمبيوتر (PWA)
import { useEffect, useState } from 'react'
import { tell } from './dialog'

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: BIP | null = null
const subs = new Set<() => void>()
const ping = () => subs.forEach((f) => f())

if (typeof window !== 'undefined') {
  // كروم/أندرويد بيبعت الحدث ده لما الموقع يبقى جاهز يتثبت
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; ping() })
  window.addEventListener('appinstalled', () => { deferred = null; ping() })
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

/** فاتح من جوه التطبيق نفسه (مش من المتصفح) */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
}

const ua = () => navigator.userAgent
export const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstall() {
  const [, set] = useState(0)
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return { show: !isStandalone(), install }
}

async function install() {
  if (deferred) {
    const d = deferred
    deferred = null
    await d.prompt()
    await d.userChoice.catch(() => null)
    ping()
    return
  }
  if (isIOS()) {
    await tell('تثبيت التطبيق على الآيفون', 'افتح الموقع من Safari، ودوس على زرار المشاركة (المربع اللي طالع منه سهم) تحت، وبعدين اختار «إضافة إلى الشاشة الرئيسية». هتلاقي أيقونة Lammmah على الشاشة.')
    return
  }
  await tell('تثبيت التطبيق', 'من قائمة المتصفح (⋮ فوق) اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». لو مش ظاهر، افتح الموقع من Chrome.')
}
