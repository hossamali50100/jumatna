import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// تفضيلات الشات: مين حاظره + إمتى مسحت كل دردشة (الرسائل القديمة بتختفي عندي بس)
export function useChatPrefs() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [clears, setClears] = useState<Record<string, string>>({})
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const load = useCallback(async () => {
    if (!uid) return
    const [c, b, mu] = await Promise.all([
      supabase.from('dm_clears').select('other_id,cleared_at').eq('user_id', uid),
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id', uid),
      supabase.from('chat_mutes').select('chat_key').eq('user_id', uid),
    ])
    if (!mu.error) setMuted(new Set((mu.data ?? []).map((r) => r.chat_key as string)))
    if (!c.error) setClears(Object.fromEntries((c.data ?? []).map((r) => [r.other_id as string, r.cleared_at as string])))
    if (!b.error) setBlocked(new Set((b.data ?? []).map((r) => r.blocked_id as string)))
  }, [uid])
  useEffect(() => { load(); window.addEventListener('jm:prefs', load); return () => window.removeEventListener('jm:prefs', load) }, [load])
  return { clears, blocked, muted }
}
// كتم/تفعيل إشعارات محادثة (مفتاحها: id الشخص أو room:id)
export async function setMute(uid: string, key: string, on: boolean): Promise<string | null> {
  const { error } = on ? await supabase.from('chat_mutes').insert({ user_id: uid, chat_key: key }) : await supabase.from('chat_mutes').delete().eq('user_id', uid).eq('chat_key', key)
  if (error) return /chat_mutes|schema cache|relation/i.test(error.message) ? 'محتاج تحديث 032 في Supabase (مرة واحدة).' : error.message
  refreshChatPrefs(); return null
}
export const refreshChatPrefs = () => window.dispatchEvent(new Event('jm:prefs'))
