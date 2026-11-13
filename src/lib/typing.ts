import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// مؤشر "يكتب…" عن طريق Realtime Broadcast (مفيش جدول ولا SQL): كل محادثة ليها قناة
export function useTyping(key: string, uid: string, name: string) {
  const [typers, setTypers] = useState<Record<string, string>>({})
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const ready = useRef(false)
  const last = useRef(0)
  useEffect(() => {
    setTypers({}); ready.current = false
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    const ch = supabase.channel('typing:' + key, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { uid?: string; name?: string; stop?: boolean }
        if (!p?.uid || p.uid === uid) return
        clearTimeout(timers[p.uid])
        if (p.stop) { setTypers((t) => { const n = { ...t }; delete n[p.uid!]; return n }); return }
        setTypers((t) => ({ ...t, [p.uid!]: p.name || 'حد' }))
        timers[p.uid] = setTimeout(() => setTypers((t) => { const n = { ...t }; delete n[p.uid!]; return n }), 4000)
      })
      .subscribe((s) => { ready.current = s === 'SUBSCRIBED' })
    chRef.current = ch
    return () => { Object.values(timers).forEach(clearTimeout); supabase.removeChannel(ch); chRef.current = null; ready.current = false }
  }, [key, uid])
  // نبعت إشارة كل ~2.5 ثانية طول ما بيكتب
  const ping = useCallback(() => {
    const now = Date.now()
    if (!ready.current || now - last.current < 2500) return
    last.current = now
    void chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { uid, name } })
  }, [uid, name])
  const stop = useCallback(() => {
    if (!ready.current) return
    last.current = 0
    void chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { uid, name, stop: true } })
  }, [uid, name])
  const names = Object.values(typers)
  const text = names.length === 0 ? '' : names.length === 1 ? `${names[0]} بيكتب…` : `${names.slice(0, 2).join(' و')} بيكتبوا…`
  return { text, ping, stop }
}
