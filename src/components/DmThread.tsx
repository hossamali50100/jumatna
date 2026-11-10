import { useCallback, useEffect, useState } from 'react'
import { supabase, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'

type Msg = { id: string; sender_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null }

export default function DmThread({ otherId, height }: { otherId: string; height?: number }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [msgs, setMsgs] = useState<Msg[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('dm_messages').select('id,sender_id,body,image_url,created_at,read_at')
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`)
      .order('created_at', { ascending: true }).limit(200)
    const list = (data as Msg[]) ?? []
    setMsgs(list)
    // أي رسالة جاية من الطرف التاني واتفتحت المحادثة: نعلّمها مقروءة
    if (list.some((m) => m.sender_id === otherId && !m.read_at)) {
      await supabase.from('dm_messages').update({ read_at: new Date().toISOString() }).eq('sender_id', otherId).eq('recipient_id', uid).is('read_at', null)
    }
  }, [uid, otherId])
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    const { error } = await supabase.from('dm_messages').insert({ sender_id: uid, recipient_id: otherId, body: text, image_url })
    if (error) throw error
    await load()
  }
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: m.sender_id === uid, body: m.body, image_url: m.image_url, created_at: m.created_at }))
  return <ChatBox msgs={list} onSend={onSend} empty="ابدأ المحادثة بأول رسالة." height={height} />
}
