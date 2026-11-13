import { useCallback, useEffect, useState } from 'react'
import { errMsg } from '../lib/supabase'
import { supabase, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ChatBox, { type ChatMsg } from './ChatBox'
import ForwardModal from './ForwardModal'
import { useChatPrefs } from '../lib/chatprefs'
import { useTyping } from '../lib/typing'

type Msg = { id: string; sender_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; delivered_at?: string | null }

export default function DmThread({ otherId, height, fill }: { otherId: string; height?: number; fill?: boolean }) {
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const tp = useTyping('dm-' + [uid, otherId].sort().join('-'), uid, profile?.name ?? '')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const { clears, blocked } = useChatPrefs()
  const clearedAt = clears[otherId] ?? ''
  const isBlocked = blocked.has(otherId)
  const [loadErr, setLoadErr] = useState('')
  const [reacts, setReacts] = useState<{ message_id: string; user_id: string; emoji: string }[]>([])
  const [fwd, setFwd] = useState<ChatMsg | null>(null)
  const [rxErr, setRxErr] = useState('')
  const load = useCallback(async () => {
    const q = (cols: string) => supabase.from('dm_messages').select(cols)
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`)
      .order('created_at', { ascending: true }).limit(200)
    let { data, error } = await q('id,sender_id,body,image_url,created_at,read_at,delivered_at')
    if (error) ({ data, error } = await q('id,sender_id,body,image_url,created_at,read_at'))
    // لو عمود read_at لسه متضافش (مهاجرة 008 ما اتشغلتش) نقرأ من غيره بدل ما المحادثة تختفي
    if (error) ({ data, error } = await q('id,sender_id,body,image_url,created_at'))
    if (error) { setLoadErr(errMsg(error)); return }
    setLoadErr('')
    const list = ((data ?? []) as unknown as Msg[]).map((m) => ({ ...m, read_at: m.read_at ?? null })).filter((m) => !clearedAt || m.created_at > clearedAt)
    setMsgs((old) => { const keep = old.filter((o) => o.id.startsWith('tmp-') && !list.some((m) => m.sender_id === o.sender_id && m.body === o.body)); return [...list, ...keep] })
    // تفاعلات الرسائل (لو تحديث 029 متشغّل)
    const ids = list.map((m) => m.id).filter((i) => !i.startsWith('tmp-'))
    if (ids.length) { const r = await supabase.from('dm_reactions').select('message_id,user_id,emoji').in('message_id', ids); if (!r.error) setReacts((r.data ?? []) as typeof reacts) }
    // أي رسالة جاية من الطرف التاني واتفتحت المحادثة: نعلّمها مقروءة
    if (list.some((m) => m.sender_id === otherId && !m.read_at)) {
      await supabase.from('dm_messages').update({ read_at: new Date().toISOString() }).eq('sender_id', otherId).eq('recipient_id', uid).is('read_at', null)
    }
  }, [uid, otherId, clearedAt])
  useEffect(() => { setMsgs([]); load(); const t = setInterval(load, 2500)
    // تحديث لحظي لو الـ Realtime متفعّل (تحديث 026)، والتحديث الدوري شغال كاحتياطي
    const ch = supabase.channel('dm-' + otherId + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, () => { load() }).subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) } }, [load, otherId])

  const onSend = async (text: string, file: File | null) => {
    const image_url = file ? await uploadImage(file, uid) : null
    // تظهر عندي فورًا، وبعدها السيرفر يأكدها
    const tmp: Msg = { id: 'tmp-' + Date.now(), sender_id: uid, body: text, image_url, created_at: new Date().toISOString(), read_at: null }
    setMsgs((l) => [...l, tmp])
    const { error } = await supabase.from('dm_messages').insert({ sender_id: uid, recipient_id: otherId, body: text, image_url })
    if (error) { setMsgs((l) => l.filter((m) => m.id !== tmp.id)); throw /row-level|policy/i.test(error.message) ? new Error('مش تقدر تبعت رسالة للشخص ده (حظر).') : error }
    load()
  }
  const onDelete = async (id: string) => {
    const { error } = await supabase.from('dm_messages').delete().eq('id', id)
    if (error) throw new Error(/permission|policy|denied/i.test(error.message) ? 'شغّل تحديث 027 في Supabase الأول.' : error.message)
    setMsgs((l) => l.filter((m) => m.id !== id))
  }
  const onReact = async (id: string, emoji: string | null) => {
    setRxErr('')
    const prev = reacts
    setReacts((l) => { const o = l.filter((r) => !(r.message_id === id && r.user_id === uid)); return emoji ? [...o, { message_id: id, user_id: uid, emoji }] : o })
    let error
    if (!emoji) ({ error } = await supabase.from('dm_reactions').delete().eq('message_id', id).eq('user_id', uid))
    else {
      const u = await supabase.from('dm_reactions').update({ emoji }).eq('message_id', id).eq('user_id', uid).select('message_id')
      error = u.error
      if (!error && !u.data?.length) ({ error } = await supabase.from('dm_reactions').insert({ message_id: id, user_id: uid, emoji }))
    }
    if (error) { setReacts(prev); setRxErr(/dm_reactions|schema cache|relation/i.test(error.message) ? 'التفاعل على الرسائل محتاج تحديث 029 في Supabase (مرة واحدة).' : errMsg(error)) }
  }
  const lastMine = [...msgs].reverse().find((m) => m.sender_id === uid)?.id
  const list: ChatMsg[] = msgs.map((m) => {
    const rs = reacts.filter((r) => r.message_id === m.id)
    const rx: Record<string, number> = {}; for (const r of rs) rx[r.emoji] = (rx[r.emoji] ?? 0) + 1
    return { id: m.id, mine: m.sender_id === uid, tick: m.id === lastMine ? (m.id.startsWith('tmp-') ? 'sending' : m.read_at ? 'read' : m.delivered_at ? 'delivered' : 'sent') : undefined, body: m.body, image_url: m.image_url, created_at: m.created_at, rx, myRx: rs.find((r) => r.user_id === uid)?.emoji ?? null }
  })
  return <>{isBlocked && <div className="mut" style={{ textAlign: 'center', fontSize: 13, padding: '4px 0' }}>أنت حاظر الشخص ده. ممكن تلغي الحظر من السهم ⌄ فوق.</div>}<ChatBox typing={tp.text} onTyping={tp.ping} onStopTyping={tp.stop} readOnly={isBlocked} msgs={list} onSend={onSend} empty="ابدأ المحادثة بأول رسالة." height={height} error={loadErr || rxErr} fill={fill} onDelete={onDelete} onReact={onReact} onForward={(m) => setFwd(m)} />{fwd && <ForwardModal msg={{ body: fwd.body, image_url: fwd.image_url }} onClose={() => setFwd(null)} />}</>
}
