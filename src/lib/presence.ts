import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// يسجّل "آخر ظهور" كل دقيقة طول ما الموقع مفتوح
export function useHeartbeat() {
  const { session } = useAuth()
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    // نحدّث الصف الموجود، ولو مفيش نضيفه (الـ upsert كان بيفشل بعد أول مرة بسبب صلاحيات العمود)
    const beat = async () => {
      if (document.visibilityState !== 'visible') return
      const now = new Date().toISOString()
      const { data } = await supabase.from('presence').update({ last_seen: now }).eq('user_id', uid).select('user_id')
      if (!data?.length) await supabase.from('presence').insert({ user_id: uid, last_seen: now })
    }
    beat()
    const t = setInterval(beat, 30000)
    document.addEventListener('visibilitychange', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat) }
  }, [uid])
}

// مين من الأشخاص دول متصل دلوقتي (آخر ظهور من أقل من دقيقتين ونص). بيظهر للأصدقاء بس.
export function useOnline(ids: string[]) {
  const key = ids.join(',')
  const [on, setOn] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!ids.length) { setOn(new Set()); return }
    let live = true
    const load = async () => {
      const { data } = await supabase.from('presence').select('user_id,last_seen').in('user_id', ids)
      if (!live) return
      const now = Date.now()
      setOn(new Set(((data ?? []) as { user_id: string; last_seen: string }[]).filter((r) => now - new Date(r.last_seen).getTime() < 100000).map((r) => r.user_id)))
    }
    load()
    const t = setInterval(load, 15000)
    return () => { live = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return on
}
