import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'

type Msg = { id: string; sender_id: string; body: string; image_url: string | null; created_at: string; profiles: { name: string; avatar_url: string | null } | null }

// محادثة مجموعة شات
export default function RoomThread({ roomId, height, fill }: { roomId: string; height?: number; fill?: boolean }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [err, setErr] = useState('')
  const marked = useRef('')
  const markRead = useCallback(() => { supabase.from('chat_room_members').update({ last_read_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', uid).then(() => {}) }, [roomId, uid])
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('chat_room_messages').select('id,sender_id,body,image_url,created_at,profiles!sender_id(name,avatar_url)').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200)
    if (error) return setErr(/chat_room|schema cache|relation/i.test(error.message) ? 'مجموعات الشات محتاجة تحديث 031 في Supabase (مرة واحدة).' : errMsg(error))
    setErr('')
    const list = (data ?? []) as unknown as Msg[]
    setMsgs((old) => { const keep = old.filter((o) => o.id.startsWith('tmp-') && !list.some((m) => m.sender_id === o.sender_id && m.body === o.body)); return [...list, ...keep] })
    const lastOther = [...list].reverse().find((m) => m.sender_id !== uid)?.created_at ?? ''
    if (lastOther > marked.current) { marked.current = lastOther; markRead() }
  }, [roomId, uid, markRead])
  useEffect(() => {
    setMsgs([]); marked.current = ''; load()
    const t = setInterval(load, 2500)
    const ch = supabase.channel('room-' + roomId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_room_messages' }, () => { load() }).subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [load, roomId])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    const tmp: Msg = { id: 'tmp-' + Date.now(), sender_id: uid, body: text, image_url, created_at: new Date().toISOString(), profiles: null }
    setMsgs((l) => [...l, tmp])
    const { error } = await supabase.from('chat_room_messages').insert({ room_id: roomId, sender_id: uid, body: text, image_url })
    if (error) { setMsgs((l) => l.filter((m) => m.id !== tmp.id)); throw error }
    load()
  }
  const onDelete = async (id: string) => {
    const { error } = await supabase.from('chat_room_messages').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setMsgs((l) => l.filter((m) => m.id !== id))
  }
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: m.sender_id === uid, label: m.sender_id === uid ? undefined : (m.profiles?.name ?? 'عضو'), avatar: m.profiles?.avatar_url ?? null, body: m.body, image_url: m.image_url, created_at: m.created_at }))
  return <ChatBox msgs={list} onSend={onSend} empty="ابدأ المحادثة بأول رسالة." height={height} error={err} fill={fill} onDelete={onDelete} />
}
