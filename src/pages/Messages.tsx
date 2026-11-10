import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import DmThread from '../components/DmThread'
import { Avatar, AvatarOn, Err, Name, timeAgo, useIsMobile } from '../lib/ui'
import { useOnline } from '../lib/presence'

type P = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Row = { sender_id: string; recipient_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; s: P | null; r: P | null }
type Conv = { other: string; profile: P | null; last: Row; unread: number }

export default function Messages() {
  const { uid: other } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const mobile = useIsMobile()
  const [convs, setConvs] = useState<Conv[]>([])
  const [cur, setCur] = useState<P | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('dm_messages')
      .select('sender_id,recipient_id,body,image_url,created_at,read_at,s:profiles!sender_id(name,avatar_url,plan,plan_until),r:profiles!recipient_id(name,avatar_url,plan,plan_until)')
      .order('created_at', { ascending: false }).limit(300)
    if (error) return setErr(errMsg(error))
    const seen = new Map<string, Conv>(); const out: Conv[] = []
    for (const r of (data as unknown as Row[]) ?? []) {
      const o = r.sender_id === uid ? r.recipient_id : r.sender_id
      let c = seen.get(o)
      if (!c) { c = { other: o, profile: r.sender_id === uid ? r.r : r.s, last: r, unread: 0 }; seen.set(o, c); out.push(c) }
      if (r.recipient_id === uid && !r.read_at) c.unread++
    }
    setConvs(out)
  }, [uid])
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  // اسم الطرف التاني لو مفيش محادثة سابقة معاه
  useEffect(() => {
    setCur(null)
    if (!other) return
    supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', other).maybeSingle().then(({ data }) => setCur((data as P) ?? null))
  }, [other])

  const online = useOnline(convs.map((c) => c.other))
  const list = (
    <div className="crd col" style={{ gap: 6 }}>
      <b style={{ fontSize: 18 }}>الرسائل</b>
      {convs.length === 0 && <span className="mut">لسه مفيش رسائل. ادخل على صفحة أي شخص واضغط "إرسال رسالة".</span>}
      {convs.map((c) => (
        <Link key={c.other} to={`/messages/${c.other}`} className="row" style={{ borderRadius: 12, padding: 8, background: other === c.other ? '#EFEFF1' : 'none' }}>
          <AvatarOn online={online.has(c.other)}><Avatar name={c.profile?.name} url={c.profile?.avatar_url} size={44} /></AvatarOn>
          <span className="grow" style={{ minWidth: 0, fontWeight: c.unread ? 700 : 400 }}><Name p={c.profile} /><div className="mut" style={{ fontWeight: c.unread ? 700 : 400, color: c.unread ? '#111111' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last.sender_id === uid ? 'أنت: ' : ''}{c.last.body || '📷 صورة'}</div></span>
          <span className="mut" style={{ fontSize: 12 }}>{timeAgo(c.last.created_at)}</span>
          {c.unread > 0 && <span style={{ background: '#E5383B', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{c.unread}</span>}
        </Link>
      ))}
    </div>
  )

  const thread = other && (
    <div className="crd col">
      <div className="row">
        <Link to={`/u/${other}`} className="row grow"><Avatar name={cur?.name} url={cur?.avatar_url} size={44} /><Name p={cur} /></Link>
        {mobile && <Link className="btn sm" to="/messages">رجوع</Link>}
      </div>
      <DmThread key={other} otherId={other} height={mobile ? 380 : 440} />
    </div>
  )

  return (
    <>
      <Err>{err}</Err>
      {mobile
        ? (other ? thread : list)
        : <div className="pgrid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>{list}{thread || <div className="crd mut" style={{ textAlign: 'center' }}>اختار محادثة من القايمة.</div>}</div>}
    </>
  )
}
