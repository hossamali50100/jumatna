import { useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

let ctx: AudioContext | null = null
const getCtx = () => {
  if (!ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (AC) ctx = new AC() }
  return ctx
}

// نغمة إشعار قصيرة ومبهجة (نغمتين) متصنّعة بالكود، من غير ملفات صوت
export function playDing() {
  try {
    const c = getCtx(); if (!c) return
    if (c.state === 'suspended') c.resume()
    const t0 = c.currentTime
    ;[[880, 0], [1318.5, 0.11]].forEach(([f, d]) => {
      const o = c.createOscillator(); const g = c.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(0.28, t0 + d + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32)
      o.connect(g); g.connect(c.destination); o.start(t0 + d); o.stop(t0 + d + 0.34)
    })
  } catch { /* الصوت مش متاح */ }
}

// بيشغّل الصوت لما توصلك رسالة جديدة (المتصفح بيسمح بالصوت بعد أول ضغطة في الصفحة)
export function useMessageSound() {
  const { session } = useAuth()
  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    const unlock = () => { const c = getCtx(); if (c && c.state === 'suspended') c.resume() }
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
    let last: string | null | undefined
    let live = true
    const check = async () => {
      const { data } = await supabase.from('dm_messages').select('id').eq('recipient_id', uid).order('created_at', { ascending: false }).limit(1)
      if (!live || !data) return
      const id = (data[0] as { id: string } | undefined)?.id ?? null
      if (last !== undefined && id && id !== last) playDing()
      last = id
    }
    check()
    const t = setInterval(check, 3000)
    const ch = supabase.channel('snd-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => { check() }).subscribe()
    return () => { live = false; clearInterval(t); supabase.removeChannel(ch); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [uid])
}
