import { useCallback, useEffect, useState } from 'react'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/ui'
import ChatBox, { type ChatMsg } from './ChatBox'
import { topicOf, type Channel } from '../lib/topics'

type Msg = { id: string; from_staff: boolean; body: string; image_url: string | null; created_at: string; topic?: string | null }
export type ChatRow = { id: string; user_id: string; channel: Channel; status: 'open' | 'closed'; closed_by: 'user' | 'staff' | 'system' | null; created_at: string; last_activity_at: string }

const IDLE_MS = 30 * 60e3
const CLOSED_TXT = { user: 'أنهيت المحادثة.', staff: 'فريق جمعتنا أنهى المحادثة.', system: 'اتقفلت المحادثة تلقائيًا لأنها ماكانش فيها نشاط 30 دقيقة.' } as const
const note = { alignSelf: 'stretch', textAlign: 'center', fontSize: 13, borderRadius: 12, padding: '8px 12px' } as const

// محادثة دعم بجلسات. العميل: كل زيارة بتبدأ محادثة جديدة (بتتفتح عند أول رسالة).
// الإدارة: بتفتح محادثة معينة بـ chatId. المحادثة بتتقفل بزرار "إنهاء" أو تلقائيًا بعد 30 دقيقة من آخر نشاط.
export default function SupportThread({ userId, staff, topic, hint, channel = 'support', chatId: fixedChat }: { userId: string; staff?: boolean; topic?: string; hint?: string; channel?: Channel; chatId?: string }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [chatId, setChatId] = useState<string | null>(fixedChat ?? null)
  const [chat, setChat] = useState<ChatRow | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [older, setOlder] = useState<ChatRow | null>(null)   // محادثة مفتوحة قديمة للعميل
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState('')

  const load = useCallback(async (id: string | null) => {
    await supabase.rpc('support_sweep')   // يقفل المحادثات اللي عدّى عليها 30 دقيقة من غير نشاط
    if (!id) {
      if (staff) return
      const { data } = await supabase.from('support_chats').select('*').eq('user_id', userId).eq('channel', channel).eq('status', 'open').order('last_activity_at', { ascending: false }).limit(1)
      setOlder(((data ?? [])[0] as ChatRow) ?? null)
      return
    }
    const c = await supabase.from('support_chats').select('*').eq('id', id).maybeSingle()
    if (c.error) return setErr(/support_chats|schema cache/i.test(c.error.message) ? 'المحادثات محتاجة تحديث 018 في Supabase (مرة واحدة).' : errMsg(c.error))
    setChat((c.data as ChatRow) ?? null)
    const q = async (cols: string) => (await supabase.from('support_messages').select(cols).eq('chat_id', id).order('created_at', { ascending: true }).limit(300)) as unknown as { data: Msg[] | null; error: unknown }
    let { data, error } = await q('id,from_staff,body,image_url,created_at,topic')
    if (error) ({ data, error } = await q('id,from_staff,body,image_url,created_at'))
    setMsgs(data ?? [])
  }, [userId, channel, staff])

  // لما الإدارة تغيّر المحادثة المفتوحة، أو العميل يدخل الصفحة: نبدأ من الأول
  useEffect(() => { setChatId(fixedChat ?? null); setChat(null); setMsgs([]); setOlder(null); setErr('') }, [fixedChat, channel, userId])
  useEffect(() => { load(chatId); const t = setInterval(() => { setNow(Date.now()); load(chatId) }, 5000); return () => clearInterval(t) }, [load, chatId])

  const onSend = async (text: string, file: File | null) => {
    setErr('')
    const image_url = file ? await uploadImage(file, uid) : null
    let id = chatId
    if (!id) {
      if (staff) throw new Error('المحادثة مقفولة')
      const r = await supabase.rpc('start_support_chat', { p_channel: channel })
      if (r.error) throw r.error
      id = r.data as string; setChatId(id); setOlder(null)
    }
    const row: Record<string, unknown> = { user_id: userId, sender_id: uid, from_staff: !!staff, body: text, image_url, channel, chat_id: id }
    const ins = async (r: Record<string, unknown>) => (await supabase.from('support_messages').insert(r)) as { error: unknown }
    let { error } = await ins(!staff && topic ? { ...row, topic } : row)
    if (error && !staff && topic) ({ error } = await ins(row))   // لو تحديث 014 لسه ما اتشغلش
    if (error) throw error
    await load(id)
  }
  const finish = async () => {
    if (!chatId || !confirm('إنهاء المحادثة؟')) return
    const { error } = await supabase.rpc('close_support_chat', { p_chat: chatId })
    if (error) return setErr(errMsg(error))
    await load(chatId)
  }
  const del = async () => {
    if (!chatId || !confirm('حذف المحادثة نهائيًا؟ هتتمسح عند الطرفين.')) return
    const { error } = await supabase.rpc('delete_support_chat', { p_chat: chatId })
    if (error) return setErr(errMsg(error))
    setChatId(fixedChat ? fixedChat : null); setChat(null); setMsgs([])
  }
  const fresh = () => { setChatId(null); setChat(null); setMsgs([]); setErr('') }

  const idleLeft = chat ? IDLE_MS - (now - new Date(chat.last_activity_at).getTime()) : IDLE_MS
  const closed = !!chat && (chat.status === 'closed' || idleLeft <= 0)
  const closedBy = chat?.status === 'closed' ? (chat.closed_by ?? 'system') : 'system'
  const mins = Math.max(1, Math.ceil(idleLeft / 60e3))

  const list: ChatMsg[] = msgs.map((m) => ({ id: m.id, mine: staff ? m.from_staff : !m.from_staff, label: staff ? (m.from_staff ? undefined : `العميل${m.topic ? ' · ' + (topicOf(m.topic)?.icon ?? '') + ' ' + (topicOf(m.topic)?.label ?? '') : ''}`) : (m.from_staff ? 'فريق جمعتنا' : undefined), body: m.body, image_url: m.image_url, created_at: m.created_at }))

  return (
    <>
      {err && <div className="err">{err}</div>}
      {!chatId && older && !staff && (
        <div className="row" style={{ ...note, background: '#E7F0FF', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>عندك محادثة مفتوحة من {timeAgo(older.created_at)}.</span>
          <button type="button" className="btn p sm" onClick={() => { setChatId(older.id); setOlder(null) }}>متابعتها</button>
        </div>
      )}
      {!closed && (
        <div style={{ ...note, background: !!chat && idleLeft <= 5 * 60e3 ? '#FFF1E0' : '#F0F2F5', color: !!chat && idleLeft <= 5 * 60e3 ? '#B45309' : '#55555C' }}>
          🔔 تذكير من النظام: لو ماقفلتش المحادثة، هتتقفل تلقائيًا بعد 30 دقيقة من آخر رسالة{chat ? ` (باقي ${mins} دقيقة)` : ''}.
        </div>
      )}
      {msgs.length > 0 && !closed && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" onClick={finish}>✔ إنهاء المحادثة</button>
          {staff && <button type="button" className="btn sm danger" onClick={del}>🗑 حذف</button>}
        </div>
      )}
      <ChatBox readOnly={closed} msgs={list} onSend={onSend} empty={staff ? 'مفيش رسائل.' : (hint ?? 'اكتب رسالتك لفريق جمعتنا وهنرد عليك في أقرب وقت.')} />
      {closed && (
        <div className="col" style={{ ...note, background: '#F0F2F5', gap: 8, alignItems: 'center' }}>
          <span>🔒 {CLOSED_TXT[closedBy]}</span>
          {!staff && <button type="button" className="btn p sm" onClick={fresh}>ابدأ محادثة جديدة</button>}
          {staff && <button type="button" className="btn sm danger" onClick={del}>🗑 حذف المحادثة</button>}
        </div>
      )}
    </>
  )
}
