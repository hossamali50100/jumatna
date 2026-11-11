import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import SupportThread, { type ChatRow } from '../components/SupportThread'
import { Avatar, Err, timeAgo } from '../lib/ui'
import { topicOf, SUPPORT_TOPICS, type Channel } from '../lib/topics'

type Chat = ChatRow & { profiles: { name: string; avatar_url: string | null; plan: string } | null }
type M = { chat_id: string; body: string; image_url: string | null; from_staff: boolean; topic?: string | null; created_at: string }

// صندوق الدعم للإدارة: كل محادثة (جلسة) ليها سطر لوحدها، مفتوحة أو مقفولة
export default function StaffSupport({ channel = 'support' }: { channel?: Channel }) {
  const { profile } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [last, setLast] = useState<Record<string, M>>({})
  const [topics, setTopics] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<string | null>(null)
  const [flt, setFlt] = useState<string>('all')
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    await supabase.rpc('support_sweep')
    const c = (await supabase.from('support_chats').select('*,profiles!user_id(name,avatar_url,plan)').eq('channel', channel).order('last_activity_at', { ascending: false }).limit(200)) as unknown as { data: Chat[] | null; error: { message: string } | null }
    if (c.error) return setErr(/support_chats|schema cache/i.test(c.error.message) ? 'المحادثات محتاجة تحديث 018 في Supabase (مرة واحدة).' : errMsg(c.error))
    setChats(c.data ?? []); setErr('')
    const q = async (cols: string) => (await supabase.from('support_messages').select(cols).eq('channel', channel).order('created_at', { ascending: false }).limit(600)) as unknown as { data: M[] | null; error: unknown }
    let { data, error } = await q('chat_id,body,image_url,from_staff,topic,created_at')
    if (error) ({ data, error } = await q('chat_id,body,image_url,from_staff,created_at'))
    const lm: Record<string, M> = {}; const tp: Record<string, string> = {}
    for (const m of data ?? []) { if (!lm[m.chat_id]) lm[m.chat_id] = m; if (m.topic && !tp[m.chat_id]) tp[m.chat_id] = m.topic }
    setLast(lm); setTopics(tp)
  }, [channel])
  useEffect(() => { setSel(null); load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  if (!profile || profile.role === 'user') return <Navigate to="/" replace />
  const isOpen = (c: Chat) => c.status === 'open' && Date.now() - new Date(c.last_activity_at).getTime() < 30 * 60e3
  const shown = chats.filter((c) => flt === 'all' || (flt === 'open' && isOpen(c)) || (flt === 'closed' && !isOpen(c)) || topics[c.id] === flt)
  const cur = chats.find((c) => c.id === sel)
  const openCount = chats.filter(isOpen).length

  const setPlan = async (plan: 'premium' | 'free') => {
    if (!cur || !confirm(plan === 'premium' ? 'تفعيل الباقة المميزة 30 يوم لهذا الحساب؟' : 'إلغاء الباقة المميزة لهذا الحساب؟')) return
    setErr(''); setOk('')
    const { error } = await supabase.rpc('admin_set_plan', { target: cur.user_id, new_plan: plan, days: 30 })
    if (error) setErr(errMsg(error)); else { setOk(plan === 'premium' ? 'تم تفعيل المميز 30 يوم' : 'تم الإلغاء'); load() }
  }
  const chips = [{ k: 'all', label: 'الكل' }, { k: 'open', label: `🟢 مفتوحة (${openCount})` }, { k: 'closed', label: '🔒 مقفولة' },
    ...(channel === 'support' ? SUPPORT_TOPICS.map((t) => ({ k: t.k as string, label: `${t.icon} ${t.label}` })) : [])]

  return (
    <div className="pgrid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>
      <div className="crd col">
        <b>{channel === 'upgrade' ? 'طلبات الترقية' : 'صندوق الدعم'}</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((t) => <button key={t.k} className={'adm-chip' + (flt === t.k ? ' on' : '')} style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setFlt(t.k)}>{t.label}</button>)}
        </div>
        {shown.length === 0 && <span className="mut">مفيش محادثات.</span>}
        {shown.map((c) => {
          const m = last[c.id]; const tp = topicOf(topics[c.id])
          return (
            <button key={c.id} className="row" onClick={() => { setSel(c.id); setOk('') }} style={{ fontFamily: 'inherit', textAlign: 'start', background: sel === c.id ? '#EFEFF1' : 'none', border: 0, borderRadius: 12, padding: 8, cursor: 'pointer', gap: 10 }}>
              <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={40} />
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{c.profiles?.name}</b>{tp && <span className="pill" style={{ marginInlineStart: 8, fontSize: 12 }}>{tp.icon} {tp.label}</span>}
                <span className="mut" style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m ? (m.from_staff ? 'أنت: ' : '') + (m.body || '📷 صورة') : '—'}</span>
              </span>
              <span className="mut" style={{ fontSize: 12, textAlign: 'end' }}>{isOpen(c) ? '🟢' : '🔒'}<br />{timeAgo(c.last_activity_at)}</span>
            </button>
          )
        })}
      </div>
      <div className="crd col">
        <Err>{err}</Err>{ok && <div className="okmsg">{ok}</div>}
        {!cur ? <span className="mut">اختار محادثة من القايمة.</span> : (<>
          <div className="row"><b className="grow">{cur.profiles?.name}{topicOf(topics[cur.id]) && <span className="pill" style={{ marginInlineStart: 8 }}>{topicOf(topics[cur.id])!.icon} {topicOf(topics[cur.id])!.label}</span>}</b>
            {profile.role === 'admin' && (cur.profiles?.plan === 'premium'
              ? <button className="btn sm danger" onClick={() => setPlan('free')}>إلغاء المميز</button>
              : <button className="btn p sm" onClick={() => setPlan('premium')}>تفعيل مميز 30 يوم</button>)}
          </div>
          <SupportThread key={cur.id} userId={cur.user_id} chatId={cur.id} staff channel={channel} />
        </>)}
      </div>
    </div>
  )
}
