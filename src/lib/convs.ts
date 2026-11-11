import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useFriends } from './friends'

export type CP = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Row = { sender_id: string; recipient_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; s: CP | null; r: CP | null }
export type ConvItem = { other: string; profile: CP | null; preview: string; at: string | null; unread: number }

// قايمة المحادثات (الأحدث الأول) + كل الأصدقاء اللي لسه ما اتكلمش معاهم
export function useConvItems() {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels } = useFriends()
  const [rows, setRows] = useState<Row[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('dm_messages')
      .select('sender_id,recipient_id,body,image_url,created_at,read_at,s:profiles!sender_id(name,avatar_url,plan,plan_until),r:profiles!recipient_id(name,avatar_url,plan,plan_until)')
      .order('created_at', { ascending: false }).limit(300)
    setRows((data as unknown as Row[]) ?? [])
  }, [])
  useEffect(() => {
    load(); const t = setInterval(load, 4000)
    const ch = supabase.channel('convs-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => { load() }).subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [load])

  const map = new Map<string, ConvItem>()
  for (const r of rows) {
    const o = r.sender_id === uid ? r.recipient_id : r.sender_id
    let it = map.get(o)
    if (!it) {
      it = { other: o, profile: r.sender_id === uid ? r.r : r.s, preview: (r.sender_id === uid ? 'أنت: ' : '') + (r.body || 'صورة'), at: r.created_at, unread: 0 }
      map.set(o, it)
    }
    if (r.recipient_id === uid && !r.read_at) it.unread++
  }
  for (const f of rels.filter((x) => x.status === 'accepted')) {
    if (!map.has(f.other)) map.set(f.other, { other: f.other, profile: f.profile as CP | null, preview: 'ابدأ محادثة', at: null, unread: 0 })
  }
  return { items: [...map.values()], reload: load }
}
