import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// عدّادات الإشعارات: رسائل غير مقروءة + طلبات صداقة ودعوات مجموعات
export function useBadges(dep?: string) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [b, setB] = useState({ msgs: 0, friends: 0 })
  useEffect(() => {
    if (!uid) return
    let live = true
    const load = async () => {
      const [m, f, i] = await Promise.all([
        supabase.from('dm_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', uid).is('read_at', null),
        supabase.from('friendships').select('requester_id', { count: 'exact', head: true }).eq('addressee_id', uid).eq('status', 'pending'),
        supabase.from('group_invites').select('group_id', { count: 'exact', head: true }).eq('invitee_id', uid),
      ])
      if (live) setB({ msgs: m.count ?? 0, friends: (f.count ?? 0) + (i.count ?? 0) })
    }
    load()
    const t = setInterval(load, 12000)
    return () => { live = false; clearInterval(t) }
  }, [uid, dep])
  return b
}
