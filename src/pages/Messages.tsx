import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import DmThread from '../components/DmThread'
import { Avatar, AvatarOn, Err, Icon, Name, timeAgo, useIsMobile } from '../lib/ui'
import { useConvItems } from '../lib/convs'
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

  if (!mobile) return <Messenger other={other} />
  return (
    <>
      <Err>{err}</Err>
      {other ? thread : list}
    </>
  )
}

// ======= واجهة الكمبيوتر: 3 أعمدة زي ماسنجر =======
function Messenger({ other }: { other?: string }) {
  const { items } = useConvItems()
  const online = useOnline(items.map((i) => i.other))
  const [q, setQ] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  let shown = items
  if (unreadOnly) shown = shown.filter((i) => i.unread > 0)
  if (q.trim()) shown = shown.filter((i) => (i.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  const [cur, setCur] = useState<P | null>(null)
  useEffect(() => {
    setCur(null)
    if (!other) return
    supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', other).maybeSingle().then(({ data }) => setCur((data as P) ?? null))
  }, [other])
  const isOn = !!other && online.has(other)

  return (
    <div className="msgr" dir="rtl">
      <aside className="mlist">
        <div style={{ padding: '16px 16px 8px' }}><b style={{ fontSize: 24 }}>الدردشات</b></div>
        <div style={{ padding: '0 14px 8px' }}>
          <div className="dsearch" style={{ display: 'flex', width: '100%', maxWidth: 'none', boxSizing: 'border-box' }}><Icon n="search" s={18} /><input placeholder="ابحث في الدردشات" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الدردشات" /></div>
        </div>
        <div className="row" style={{ padding: '0 14px 8px', gap: 8 }}>
          {([['الكل', false], ['غير المقروءة', true]] as const).map(([l, v]) => (
            <button key={l} onClick={() => setUnreadOnly(v)} style={{ fontFamily: 'inherit', border: 0, cursor: 'pointer', borderRadius: 18, padding: '8px 14px', flex: 1, display: 'flex', justifyContent: 'center', fontWeight: 700, fontSize: 14, background: unreadOnly === v ? '#111111' : '#EFEFF1', color: unreadOnly === v ? '#fff' : '#111111' }}>{l}</button>
          ))}
        </div>
        <div className="col" style={{ gap: 2, overflowY: 'auto', padding: '0 8px 10px', flex: 1, minHeight: 0 }}>
          {shown.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 24 }}>{unreadOnly ? 'مفيش رسائل غير مقروءة.' : 'لسه مفيش أصدقاء أو محادثات.'}</div>}
          {shown.map((i) => (
            <Link key={i.other} to={`/messages/${i.other}`} className="row" style={{ borderRadius: 12, padding: 8, gap: 12, background: other === i.other ? '#EFEFF1' : 'none' }}>
              <AvatarOn online={online.has(i.other)}><Avatar name={i.profile?.name} url={i.profile?.avatar_url} size={56} /></AvatarOn>
              <span className="grow col" style={{ minWidth: 0, gap: 0, fontWeight: i.unread ? 700 : 400 }}>
                <Name p={i.profile} />
                <span className="mut" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: i.unread ? 700 : 400, color: i.unread ? '#111111' : undefined }}>{i.preview}{i.at && ` · ${timeAgo(i.at)}`}</span>
              </span>
              {i.unread > 0 && <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#E5383B', flex: 'none' }} aria-label="رسالة جديدة" />}
            </Link>
          ))}
        </div>
      </aside>

      {!other ? (
        <section className="col" style={{ alignItems: 'center', justifyContent: 'center', gap: 14, background: '#fff' }}>
          <span style={{ width: 150, height: 150, borderRadius: '50%', background: '#F1F1F3', display: 'grid', placeItems: 'center' }}><Icon n="msg" s={64} /></span>
          <b style={{ fontSize: 20 }}>لم يتم تحديد دردشات</b>
          <span className="mut">اختار محادثة من القايمة عشان تبدأ تتكلم.</span>
        </section>
      ) : (
        <>
          <section className="col" style={{ gap: 0, minWidth: 0, minHeight: 0 }}>
            <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid #E4E4E7', gap: 12 }}>
              <AvatarOn online={isOn}><Avatar name={cur?.name} url={cur?.avatar_url} size={44} /></AvatarOn>
              <Link to={`/u/${other}`} className="grow col" style={{ gap: 0 }}><Name p={cur} /><span className="mut" style={{ fontSize: 12 }}>{isOn ? 'نشط الآن' : ''}</span></Link>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '0 12px' }}><DmThread key={other} otherId={other} fill /></div>
          </section>
          <aside className="minfo col" style={{ gap: 6, padding: 20, alignItems: 'stretch' }}>
            <div className="col" style={{ alignItems: 'center', gap: 6, textAlign: 'center' }}>
              <AvatarOn online={isOn}><Avatar name={cur?.name} url={cur?.avatar_url} size={96} /></AvatarOn>
              <Name p={cur} />
              <span className="mut" style={{ fontSize: 13 }}>{isOn ? 'نشط الآن' : ''}</span>
              <span className="pill" style={{ marginTop: 4 }}>🔒 محادثة خاصة بين الطرفين</span>
              <Link to={`/u/${other}`} className="btn" style={{ marginTop: 10 }}><Icon n="user" s={18} />الملف الشخصي</Link>
            </div>
            <MediaPanel other={other} />
            <details>
              <summary>الخصوصية والدعم<span>⌄</span></summary>
              <div className="mut" style={{ padding: '0 8px 12px', lineHeight: 1.8 }}>رسائلك خاصة بينك وبين الطرف التاني بس، حتى الإدارة ما بتقراهاش. لو حد بيضايقك ابعت لنا من صفحة الدعم.</div>
            </details>
          </aside>
        </>
      )}
    </div>
  )
}

function MediaPanel({ other }: { other: string }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const [imgs, setImgs] = useState<string[]>([])
  useEffect(() => {
    supabase.from('dm_messages').select('image_url')
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${uid})`)
      .not('image_url', 'is', null).order('created_at', { ascending: false }).limit(9)
      .then(({ data }) => setImgs(((data ?? []) as { image_url: string }[]).map((x) => x.image_url)))
  }, [uid, other])
  return (
    <details open>
      <summary>الملفات والوسائط<span>⌄</span></summary>
      {imgs.length === 0 ? <div className="mut" style={{ padding: '0 8px 12px' }}>مفيش صور لسه.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, padding: '0 4px 12px' }}>
          {imgs.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener"><img src={u} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} /></a>)}
        </div>
      )}
    </details>
  )
}
