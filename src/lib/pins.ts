import { useSyncExternalStore } from 'react'

// تثبيت المحادثات (محفوظ على الجهاز ده بس)
const KEY = 'jm_pins'
const subs = new Set<() => void>()
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
let cache = read().join('|')
const snap = () => cache
export const togglePin = (id: string) => {
  const cur = read(); const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 10)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  cache = next.join('|'); subs.forEach((f) => f())
}
export function usePins(): Set<string> {
  const v = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, snap)
  return new Set(v ? v.split('|') : [])
}
