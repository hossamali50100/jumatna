import { useCallback, useEffect, useState } from 'react'
import { errMsg } from '../lib/supabase'
import { supabase, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'

type Msg = { id: string; sender_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null }

export default function DmThread({ otherId, height, fill }: { otherId: string; height?: number; fill?: boolean }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loadErr, setLoadErr] = useState('')
  const load = useCallback(async () => {
    const q = (cols: string) => supabase.from('dm_messages').select(cols)
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`)
      .order('created_at', { ascending: true }).limit(200)
    let { data, error } = await q('id,sender_id,body,image_url,created_at,read_at')
    // لو عمود read_at لسه متضافش (مهاجرة 008 ما اتشغلتش) نقرأ من غيره بدل ما المحادثة تختفي
    if (error) ({ data, error } = await q('id,sender_id,body,image_url,created_at'))
    if (error) { setLoadErr(errMsg(error)); return }
    setLoadErr('')
    const list = ((data ?? []) as unknown as Msg[]).map((m) => ({ ...m, read_at: m.read_at ?? null }))
    setMsgs((old) => { const keep = old.filter((o) => o.id.startsWith('tmp-') && !list.some((m) => m.sender_id === o.sender_id && m.body === o.body)); return [...list, ...keep] })
    // أي رسالة جاية من الطرف التاني واتفتحت المحادثة: نعلّمها مقروءة
    if (list.some((m) => m.sender_id === otherId && !m.read_at)) {
      await supabase.from('dm_messages').update({ read_at: new Date().toISOString() }).eq('sender_id', otherId).eq('recipient_id', uid).is('read_at', null)
    }
  }, [uid, otherId])
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    // تظهر عندي فورًا، وبعدها السيرفر يأكدها
    const tmp: Msg = { id: 'tmp-' + Date.now(), sender_id: uid, body: text, image_url, created_at: new Date().toISOString(), read_at: null }
    setMsgs((l) => [...l, tmp])
    const { error } = await supabase.from('dm_messages').insert({ sender_id: uid, recipient_id: otherId, body: text, image_url })
    if (error) { setMsgs((l) => l.filter((m) => m.id !== tmp.id)); throw error }
    await load()
  }
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: m.sender_id === uid, body: m.body, image_url: m.image_url, created_at: m.created_at }))
  return <ChatBox msgs={list} onSend={onSend} empty="ابدأ المحادثة بأول رسالة." height={height} error={loadErr} fill={fill} />
}
