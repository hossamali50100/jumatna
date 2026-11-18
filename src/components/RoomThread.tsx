import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'
import ForwardModal from './ForwardModal'
import { VOICE_BODY, uploadVoice, voiceErr } from '../lib/voice'
import { useTyping } from '../lib/typing'

type Msg = { id: string; sender_id: string; body: string; image_url: string | null; edited_at?: string | null; audio_url?: string | null; audio_secs?: number | null; created_at: string; profiles: { name: string; avatar_url: string | null } | null }

// محادثة مجموعة شات
export default function RoomThread({ roomId, height, fill }: { roomId: string; height?: number; fill?: boolean }) {
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const tp = useTyping('room-' + roomId, uid, profile?.name ?? '')
  const [reads, setReads] = useState<{ user_id: string; last_read_at: string; profiles?: { name: string; avatar_url: string | null } | null }[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [err, setErr] = useState('')
  const [reacts, setReacts] = useState<{ message_id: string; user_id: string; emoji: string }[]>([])
  const marked = useRef('')
  const markRead = useCallback(() => { supabase.from('chat_room_members').update({ last_read_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', uid).then(() => {}) }, [roomId, uid])
  const load = useCallback(async () => {
    const q = (cols: string) => supabase.from('chat_room_messages').select(cols).eq('room_id', roomId).order('created_at', { ascending: true }).limit(200)
    let { data, error } = await q('id,sender_id,body,image_url,audio_url,audio_secs,edited_at,created_at,profiles!sender_id(name,avatar_url)')
    if (error && /edited_at/i.test(error.message)) ({ data, error } = await q('id,sender_id,body,image_url,audio_url,audio_secs,created_at,profiles!sender_id(name,avatar_url)'))
    if (error && /audio_/i.test(error.message)) ({ data, error } = await q('id,sender_id,body,image_url,created_at,profiles!sender_id(name,avatar_url)'))
    if (error) return setErr(/chat_room|schema cache|relation/i.test(error.message) ? 'مجموعات الشات محتاجة تحديث 031 في Supabase (مرة واحدة).' : errMsg(error))
    setErr('')
    let list = (data ?? []) as unknown as Msg[]
    // الرسايل اللي المستخدم شالها من عنده (تحديث 052)
    const allIds = list.map((m) => m.id)
    if (allIds.length) { const h = await supabase.from('message_hides').select('msg_id').in('msg_id', allIds); if (!h.error && h.data?.length) { const hid = new Set(h.data.map((x) => x.msg_id as string)); list = list.filter((m) => !hid.has(m.id)) } }
    setMsgs((old) => { const keep = old.filter((o) => o.id.startsWith('tmp-') && !list.some((m) => m.sender_id === o.sender_id && m.body === o.body)); return [...list, ...keep] })
    // التفاعلات (تحديث 053)
    const ids = list.map((m) => m.id)
    if (ids.length) { const r = await supabase.from('room_reactions').select('message_id,user_id,emoji').in('message_id', ids); if (!r.error) setReacts((r.data ?? []) as typeof reacts) }
    let rd = await supabase.from('chat_room_members').select('user_id,last_read_at,profiles!user_id(name,avatar_url)').eq('room_id', roomId)
    if (rd.error) rd = await supabase.from('chat_room_members').select('user_id,last_read_at').eq('room_id', roomId) as typeof rd
    if (!rd.error) setReads((rd.data ?? []) as unknown as typeof reads)
    const lastOther = [...list].reverse().find((m) => m.sender_id !== uid)?.created_at ?? ''
    if (lastOther > marked.current) { marked.current = lastOther; markRead() }
  }, [roomId, uid, markRead])
  useEffect(() => {
    setMsgs([]); marked.current = ''; load()
    const t = setInterval(load, 2500)
    const ch = supabase.channel('room-' + roomId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_room_messages' }, () => { load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_reactions' }, () => { load() }).subscribe()
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
  const onSendVoice = async (blob: Blob, secs: number) => {
    const audio_url = await uploadVoice(blob, uid)
    const { error } = await supabase.from('chat_room_messages').insert({ room_id: roomId, sender_id: uid, body: VOICE_BODY, audio_url, audio_secs: secs })
    if (error) throw voiceErr(error)
    load()
  }
  const onEdit = async (id: string, body: string) => {
    const { error } = await supabase.rpc('edit_message', { p_kind: 'room', p_id: id, p_body: body })
    if (error) throw new Error(/edit_message|schema cache|function/i.test(error.message) ? 'تعديل الرسائل محتاج تحديث 048 في Supabase (مرة واحدة).' : errMsg(error))
    setMsgs((l) => l.map((m) => (m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m)))
    load()
  }
  const [fwd, setFwd] = useState<ChatMsg | null>(null)
  const onHide = async (id: string) => {
    const { error } = await supabase.from('message_hides').insert({ msg_id: id })
    if (error && !/duplicate/i.test(error.message)) throw new Error(/message_hides|schema cache|relation/i.test(error.message) ? 'الإزالة لديك محتاجة تحديث 052 في Supabase (مرة واحدة).' : errMsg(error))
    setMsgs((l) => l.filter((m) => m.id !== id))
  }
  const onReact = async (id: string, emoji: string | null) => {
    setErr('')
    const prev = reacts
    setReacts((l) => { const o = l.filter((r) => !(r.message_id === id && r.user_id === uid)); return emoji ? [...o, { message_id: id, user_id: uid, emoji }] : o })
    let error
    if (!emoji) ({ error } = await supabase.from('room_reactions').delete().eq('message_id', id).eq('user_id', uid))
    else {
      const u = await supabase.from('room_reactions').update({ emoji }).eq('message_id', id).eq('user_id', uid).select('message_id')
      error = u.error
      if (!error && !u.data?.length) ({ error } = await supabase.from('room_reactions').insert({ message_id: id, user_id: uid, emoji }))
    }
    if (error) { setReacts(prev); setErr(/room_reactions|schema cache|relation/i.test(error.message) ? 'التفاعل على رسايل الشات الجماعي محتاج تحديث 053 في Supabase (مرة واحدة).' : errMsg(error)) }
  }
  const onDelete = async (id: string) => {
    const { error } = await supabase.from('chat_room_messages').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setMsgs((l) => l.filter((m) => m.id !== id))
  }
  const rxOf = (mid: string) => {
    const rs = reacts.filter((r) => r.message_id === mid)
    const rx: Record<string, number> = {}; for (const r of rs) rx[r.emoji] = (rx[r.emoji] ?? 0) + 1
    return { rx, myRx: rs.find((r) => r.user_id === uid)?.emoji ?? null }
  }
  // كل عضو (غيري) صورته بتظهر تحت آخر رسالة قراها (زي فيسبوك)
  const seenAt: Record<string, { id: string; name: string; avatar_url: string | null }[]> = {}
  const realMsgs = msgs.filter((m) => !m.id.startsWith('tmp-'))
  for (const r of reads) {
    if (r.user_id === uid || !r.last_read_at) continue
    const last = [...realMsgs].reverse().find((m) => m.created_at <= r.last_read_at)
    if (!last) continue
    ;(seenAt[last.id] ??= []).push({ id: r.user_id, name: r.profiles?.name ?? 'عضو', avatar_url: r.profiles?.avatar_url ?? null })
  }
  const lastMineM = [...msgs].reverse().find((m) => m.sender_id === uid)
  const lastMine = lastMineM?.id
  const seenN = lastMineM ? reads.filter((r) => r.user_id !== uid && r.last_read_at >= lastMineM.created_at).length : 0
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: m.sender_id === uid, tick: m.id === lastMine ? (m.id.startsWith('tmp-') ? 'sending' : seenN > 0 ? 'read' : 'sent') : undefined, tickTitle: seenN > 0 ? `شاهدها ${seenN}` : undefined, label: m.sender_id === uid ? undefined : (m.profiles?.name ?? 'عضو'), avatar: m.profiles?.avatar_url ?? null, body: m.body, image_url: m.image_url, audio_url: m.audio_url, audio_secs: m.audio_secs, created_at: m.created_at, edited: !!m.edited_at, seenBy: seenAt[m.id], ...rxOf(m.id) }))
  return <>
    <ChatBox onReact={onReact} onHide={onHide} onEdit={onEdit} onForward={(m) => setFwd(m)} onSendVoice={onSendVoice} typing={tp.text} onTyping={tp.ping} onStopTyping={tp.stop} msgs={list} onSend={onSend} empty="ابدأ المحادثة بأول رسالة." height={height} error={err} fill={fill} onDelete={onDelete} />
    {fwd && <ForwardModal msg={{ body: fwd.body, image_url: fwd.image_url, audio_url: fwd.audio_url, audio_secs: fwd.audio_secs }} onClose={() => setFwd(null)} />}
  </>
}
