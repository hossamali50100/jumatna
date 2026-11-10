import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import SupportThread from '../components/SupportThread'
import { Avatar, Err, timeAgo } from '../lib/ui'
import { topicOf, TOPICS } from '../lib/topics'

type Row = { user_id: string; body: string; image_url: string | null; created_at: string; from_staff: boolean; topic?: string | null; profiles: { name: string; avatar_url: string | null; plan: string } | null }

// صندوق الدعم للإدارة: كل المحادثات + الرد (مؤقتًا لحد لوحة الأدمن الكاملة)
export default function StaffSupport({ onlyTopic }: { onlyTopic?: string }) {
  const { profile } = useAuth()
  const [convs, setConvs] = useState<Row[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [topics, setTopics] = useState<Record<string, string>>({})
  const [anyT, setAnyT] = useState<Record<string, Set<string>>>({})   // كل المواضيع اللي اختارها كل عميل
  const [flt, setFlt] = useState<string>(onlyTopic ?? 'all')

  const load = useCallback(async () => {
    const q = async (cols: string) => (await supabase.from('support_messages').select(cols).order('created_at', { ascending: false }).limit(300)) as unknown as { data: Row[] | null; error: { message: string } | null }
    let { data, error } = await q('user_id,body,image_url,created_at,from_staff,topic,profiles!user_id(name,avatar_url,plan)')
    if (error) ({ data, error } = await q('user_id,body,image_url,created_at,from_staff,profiles!user_id(name,avatar_url,plan)'))
    if (error) return setErr(errMsg(error))
    const seen = new Set<string>(); const list: Row[] = []
    const tp: Record<string, string> = {}   // آخر موضوع اختاره كل عميل
    const all: Record<string, Set<string>> = {}
    for (const r of data ?? []) { if (r.topic) (all[r.user_id] ??= new Set()).add(r.topic); if (r.topic && !tp[r.user_id]) tp[r.user_id] = r.topic; if (!seen.has(r.user_id)) { seen.add(r.user_id); list.push(r) } }
    setTopics(tp); setAnyT(all); setConvs(list)
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])

  if (!profile || profile.role === 'user') return <Navigate to="/" replace />
  const shown = flt === 'all' ? convs : convs.filter((c) => anyT[c.user_id]?.has(flt))
  const cur = convs.find((c) => c.user_id === sel)

  const setPlan = async (plan: 'premium' | 'free') => {
    if (!sel || !confirm(plan === 'premium' ? 'تفعيل الباقة المميزة 30 يوم لهذا الحساب؟' : 'إلغاء الباقة المميزة لهذا الحساب؟')) return
    setErr(''); setOk('')
    const { error } = await supabase.rpc('admin_set_plan', { target: sel, new_plan: plan, days: 30 })
    if (error) setErr(errMsg(error)); else { setOk(plan === 'premium' ? 'تم تفعيل المميز 30 يوم' : 'تم الإلغاء'); load() }
  }

  return (
    <div className="pgrid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>
      <div className="crd col">
        <b>صندوق الدعم</b>
        {!onlyTopic && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ k: 'all', icon: '', label: 'الكل' }, ...TOPICS].map((t) => (
              <button key={t.k} className={'adm-chip' + (flt === t.k ? ' on' : '')} style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setFlt(t.k)}>{t.icon} {t.label}</button>
            ))}
          </div>
        )}
        {shown.length === 0 && <span className="mut">مفيش محادثات.</span>}
        {shown.map((c) => (
          <button key={c.user_id} className="row" onClick={() => { setSel(c.user_id); setOk('') }} style={{ fontFamily: 'inherit', textAlign: 'start', background: sel === c.user_id ? '#EFEFF1' : 'none', border: 0, borderRadius: 12, padding: 8, cursor: 'pointer' }}>
            <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={40} />
            <span className="grow" style={{ minWidth: 0 }}><b>{c.profiles?.name}</b>{topicOf(topics[c.user_id]) && <span className="pill" style={{ marginInlineStart: 8, fontSize: 12 }}>{topicOf(topics[c.user_id])!.icon} {topicOf(topics[c.user_id])!.label}</span>}<div className="mut" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.from_staff ? 'أنت: ' : ''}{c.body || '📷 صورة'}</div></span>
            <span className="mut" style={{ fontSize: 12 }}>{timeAgo(c.created_at)}</span>
          </button>
        ))}
      </div>
      <div className="crd col">
        <Err>{err}</Err>{ok && <div className="okmsg">{ok}</div>}
        {!sel ? <span className="mut">اختار محادثة من القايمة.</span> : (<>
          <div className="row"><b className="grow">{cur?.profiles?.name}{topicOf(topics[sel]) && <span className="pill" style={{ marginInlineStart: 8 }}>{topicOf(topics[sel])!.icon} {topicOf(topics[sel])!.label}</span>}</b>
            {profile.role === 'admin' && (cur?.profiles?.plan === 'premium'
              ? <button className="btn sm danger" onClick={() => setPlan('free')}>إلغاء المميز</button>
              : <button className="btn p sm" onClick={() => setPlan('premium')}>تفعيل مميز 30 يوم</button>)}
          </div>
          <SupportThread key={sel} userId={sel} staff />
        </>)}
      </div>
    </div>
  )
}
