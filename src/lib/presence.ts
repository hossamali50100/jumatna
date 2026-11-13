import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// لو جدول الحضور مش موجود (تحديث 012 ما اتشغّلش) نعرف ونوضّح للمستخدم
let presErr = ''
const subs = new Set<() => void>()
const setPresErr = (m: string) => { if (m !== presErr) { presErr = m; subs.forEach((f) => f()) } }
export const usePresenceError = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => presErr)
const failMsg = (e: { message: string } | null) => e ? (/presence|schema cache|relation|permission/i.test(e.message) ? 'حالة الاتصال مش شغالة: لازم تشغّل تحديث 012 في Supabase (مرة واحدة).' : e.message) : ''

// يسجّل "آخر ظهور" كل دقيقة طول ما الموقع مفتوح
export function useHeartbeat() {
  const { session } = useAuth()
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    // نحدّث الصف الموجود، ولو مفيش نضيفه (الـ upsert كان بيفشل بعد أول مرة بسبب صلاحيات العمود)
    const beat = async () => {
      const now = new Date().toISOString()
      const u = await supabase.from('presence').update({ last_seen: now }).eq('user_id', uid).select('user_id')
      if (u.error) return setPresErr(failMsg(u.error))
      if (!u.data?.length) { const i = await supabase.from('presence').insert({ user_id: uid, last_seen: now }); setPresErr(failMsg(i.error)) } else setPresErr('')
    }
    beat()
    const t = setInterval(beat, 30000)
    document.addEventListener('visibilitychange', beat); window.addEventListener('focus', beat); window.addEventListener('online', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat); window.removeEventListener('focus', beat); window.removeEventListener('online', beat) }
  }, [uid])
}

// مين من الأشخاص دول متصل دلوقتي (آخر ظهور من أقل من دقيقتين ونص). بيظهر للأصدقاء بس.
export function useOnline(allIds: string[]) {
  const ids = allIds.filter((i) => !i.startsWith('room:'))
  const key = ids.join(',')
  const [on, setOn] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!ids.length) { setOn(new Set()); return }
    let live = true
    const load = async () => {
      // الأول: الحساب على السيرفر (تحديث 034) عشان ساعات الأجهزة متفرقش
      const r = await supabase.rpc('online_users', { ids })
      if (!live) return
      if (!r.error) { setPresErr(''); setOn(new Set(((r.data ?? []) as unknown as string[]).map(String))); return }
      // لو 034 لسه ما اتشغّلتش: الطريقة القديمة
      const { data, error } = await supabase.from('presence').select('user_id,last_seen').in('user_id', ids)
      if (!live) return
      if (error) setPresErr(failMsg(error))
      const now = Date.now()
      setOn(new Set(((data ?? []) as { user_id: string; last_seen: string }[]).filter((r2) => now - new Date(r2.last_seen).getTime() < 100000).map((r2) => r2.user_id)))
    }
    load()
    const t = setInterval(load, 15000)
    return () => { live = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return on
}
