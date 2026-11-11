import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useFriends } from './friends'
import { useChatPrefs } from './chatprefs'

export type CP = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Row = { sender_id: string; recipient_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; s: CP | null; r: CP | null }
export type ConvItem = { other: string; profile: CP | null; preview: string; at: string | null; unread: number; room?: boolean }
type RoomRow = { id: string; name: string; avatar_url: string | null; created_at: string }
type RMsg = { room_id: string; sender_id: string; body: string; image_url: string | null; created_at: string; s: { name: string } | null }

// قايمة المحادثات (الأحدث الأول) + كل الأصدقاء اللي لسه ما اتكلمش معاهم
export function useConvItems() {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels } = useFriends()
  const { clears } = useChatPrefs()
  const [rows, setRows] = useState<Row[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([]); const [rmsgs, setRmsgs] = useState<RMsg[]>([]); const [reads, setReads] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const { data } = await supabase.from('dm_messages')
      .select('sender_id,recipient_id,body,image_url,created_at,read_at,s:profiles!sender_id(name,avatar_url,plan,plan_until),r:profiles!recipient_id(name,avatar_url,plan,plan_until)')
      .order('created_at', { ascending: false }).limit(300)
    setRows((data as unknown as Row[]) ?? [])
    // مجموعات الشات (لو تحديث 031 متشغّل)
    const [r, m, rd] = await Promise.all([
      supabase.from('chat_rooms').select('id,name,avatar_url,created_at'),
      supabase.from('chat_room_messages').select('room_id,sender_id,body,image_url,created_at,s:profiles!sender_id(name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('chat_room_members').select('room_id,last_read_at').eq('user_id', uid),
    ])
    if (!r.error) { setRooms((r.data ?? []) as RoomRow[]); setRmsgs((m.data ?? []) as unknown as RMsg[]); setReads(Object.fromEntries((rd.data ?? []).map((x) => [x.room_id as string, x.last_read_at as string]))) }
  }, [uid])
  useEffect(() => {
    load(); const t = setInterval(load, 4000)
    const ch = supabase.channel('convs-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_room_messages' }, () => { load() }).subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [load])

  const map = new Map<string, ConvItem>()
  for (const r of rows) {
    const o = r.sender_id === uid ? r.recipient_id : r.sender_id
    if (clears[o] && r.created_at <= clears[o]) continue
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
  for (const rm of rooms) {
    const msgs = rmsgs.filter((x) => x.room_id === rm.id)
    const last = msgs[0]
    const unread = msgs.filter((x) => x.sender_id !== uid && x.created_at > (reads[rm.id] ?? '')).length
    map.set('room:' + rm.id, {
      other: 'room:' + rm.id, room: true, profile: { name: rm.name, avatar_url: rm.avatar_url, plan: 'free', plan_until: null },
      preview: last ? (last.sender_id === uid ? 'أنت: ' : (last.s?.name ? last.s.name + ': ' : '')) + (last.body || 'صورة') : 'تم إنشاء المجموعة',
      at: last?.created_at ?? rm.created_at, unread,
    })
  }
  const items = [...map.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return { items, reload: load }
}
