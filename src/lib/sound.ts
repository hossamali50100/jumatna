import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useChatPrefs } from './chatprefs'

let ctx: AudioContext | null = null
const getCtx = () => {
  if (!ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (AC) ctx = new AC() }
  return ctx
}

// نغمة إشعار قصيرة ومبهجة (نغمتين) متصنّعة بالكود، من غير ملفات صوت
export async function playDing() {
  try {
    const c = getCtx(); if (!c) return
    if (c.state !== 'running') { try { await c.resume() } catch { /* محتاج ضغطة من المستخدم */ } }
    const t0 = c.currentTime + 0.02
    ;[[880, 0], [1318.5, 0.11]].forEach(([f, d]) => {
      const o = c.createOscillator(); const g = c.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(0.5, t0 + d + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35)
      o.connect(g); g.connect(c.destination); o.start(t0 + d); o.stop(t0 + d + 0.38)
    })
  } catch { /* الصوت مش متاح */ }
}

// بيشغّل الصوت لما توصلك رسالة جديدة (المتصفح بيسمح بالصوت بعد أول ضغطة في الصفحة)
export function useMessageSound() {
  const { session } = useAuth()
  const uid = session?.user.id
  const { muted } = useChatPrefs()
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  useEffect(() => {
    if (!uid) return
    const unlock = () => { const c = getCtx(); if (c && c.state === 'suspended') c.resume() }
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
    let last: string | null = null   // أحدث رسالة وصلتني وقت ما فتحت
    let lastRoom: string | null = null
    let started = false
    let live = true
    const check = async () => {
      const { data } = await supabase.from('dm_messages').select('id,sender_id,created_at').eq('recipient_id', uid).order('created_at', { ascending: false }).limit(10)
      if (!live || !data) return
      const rows = data as { id: string; sender_id: string; created_at: string }[]
      // رسائل مجموعات الشات
      const rr = await supabase.from('chat_room_messages').select('room_id,created_at').neq('sender_id', uid).order('created_at', { ascending: false }).limit(10)
      const rrows = rr.error ? [] : ((rr.data ?? []) as { room_id: string; created_at: string }[])
      if (!started) { started = true; last = rows[0]?.created_at ?? null; lastRoom = rrows[0]?.created_at ?? null; return }
      const freshR = rrows.filter((r) => !lastRoom || r.created_at > lastRoom)
      const liveR = freshR.filter((r) => !mutedRef.current.has('room:' + r.room_id))
      if (freshR.length) lastRoom = freshR[0].created_at
      if (liveR.length) {
        playDing()
        for (const rid of new Set(liveR.map((r) => r.room_id))) window.dispatchEvent(new CustomEvent('jm:incoming', { detail: 'room:' + rid }))
      }
      const fresh = rows.filter((r) => !last || r.created_at > last)
      if (!fresh.length) return
      last = fresh[0].created_at
      const audible = fresh.filter((r) => !mutedRef.current.has(r.sender_id))
      if (!audible.length) return
      playDing()
      // نفتح نافذة الشات المصغرة لكل شخص جديد بعتلي
      for (const sid of new Set(audible.map((r) => r.sender_id))) window.dispatchEvent(new CustomEvent('jm:incoming', { detail: sid }))
    }
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    check()
    const t = setInterval(check, 2500)
    const ch = supabase.channel('snd-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => { check() }).subscribe()
    return () => { live = false; clearInterval(t); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [uid])
}
