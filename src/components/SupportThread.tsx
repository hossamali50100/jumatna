import { useCallback, useEffect, useState } from 'react'
import { supabase, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'

type Msg = { id: string; from_staff: boolean; body: string; image_url: string | null; created_at: string }

// محادثة دعم: userId = صاحب المحادثة (العميل). staff=true لما الإدارة هي اللي بترد.
export default function SupportThread({ userId, staff }: { userId: string; staff?: boolean }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [msgs, setMsgs] = useState<Msg[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('support_messages').select('id,from_staff,body,image_url,created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(200)
    setMsgs((data as Msg[]) ?? [])
  }, [userId])
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    const { error } = await supabase.from('support_messages').insert({ user_id: userId, sender_id: uid, from_staff: !!staff, body: text, image_url })
    if (error) throw error
    await load()
  }
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: staff ? m.from_staff : !m.from_staff, label: staff ? (m.from_staff ? undefined : 'العميل') : (m.from_staff ? 'فريق جمعتنا' : undefined), body: m.body, image_url: m.image_url, created_at: m.created_at }))
  return <ChatBox msgs={list} onSend={onSend} empty={staff ? 'مفيش رسائل.' : 'اكتب رسالتك لفريق جمعتنا وهنرد عليك في أقرب وقت. ممكن ترفق صورة (زي إثبات الدفع).'} />
}
