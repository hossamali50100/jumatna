import { useCallback, useEffect, useState } from 'react'
import { supabase, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'
import { topicOf } from '../lib/topics'

type Msg = { id: string; from_staff: boolean; body: string; image_url: string | null; created_at: string; topic?: string | null }

// محادثة دعم: userId = صاحب المحادثة (العميل). staff=true لما الإدارة هي اللي بترد.
export default function SupportThread({ userId, staff, topic, hint }: { userId: string; staff?: boolean; topic?: string; hint?: string }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [msgs, setMsgs] = useState<Msg[]>([])
  const load = useCallback(async () => {
    const q = async (cols: string) => (await supabase.from('support_messages').select(cols).eq('user_id', userId).order('created_at', { ascending: true }).limit(200)) as unknown as { data: Msg[] | null; error: unknown }
    // لو تحديث 014 لسه ما اتشغلش نقرأ من غير عمود الموضوع
    let { data, error } = await q('id,from_staff,body,image_url,created_at,topic')
    if (error) ({ data, error } = await q('id,from_staff,body,image_url,created_at'))
    setMsgs(data ?? [])
  }, [userId])
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    const row = { user_id: userId, sender_id: uid, from_staff: !!staff, body: text, image_url }
    const ins = async (r: Record<string, unknown>) => (await supabase.from('support_messages').insert(r)) as { error: unknown }
    let { error } = await ins(!staff && topic ? { ...row, topic } : row)
    if (error && !staff && topic) ({ error } = await ins(row))
    if (error) throw error
    await load()
  }
  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: staff ? m.from_staff : !m.from_staff, label: staff ? (m.from_staff ? undefined : `العميل${m.topic ? ' · ' + (topicOf(m.topic)?.icon ?? '') + ' ' + (topicOf(m.topic)?.label ?? '') : ''}`) : (m.from_staff ? 'فريق جمعتنا' : undefined), body: m.body, image_url: m.image_url, created_at: m.created_at }))
  return <ChatBox msgs={list} onSend={onSend} empty={staff ? 'مفيش رسائل.' : (hint ?? 'اكتب رسالتك لفريق جمعتنا وهنرد عليك في أقرب وقت.')} />
}
