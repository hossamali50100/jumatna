import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, AvatarOn, Err, Icon, Name, timeAgo, useIsMobile } from '../lib/ui'
import { useConvItems } from '../lib/convs'
import { useOnline } from '../lib/presence'
import { useChatPrefs } from '../lib/chatprefs'
import ChatMenu from '../components/ChatMenu'
import RoomMenu from '../components/RoomMenu'
import Thread from '../components/Thread'
import { NewRoomModal } from '../components/RoomDialogs'
import { isRoom, roomKey, useRoom } from '../lib/rooms'

type P = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Row = { sender_id: string; recipient_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; s: P | null; r: P | null }
type Conv = { other: string; profile: P | null; last: Row; unread: number }

export default function Messages() {
  const { uid: other } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const mobile = useIsMobile()
  const [convs, setConvs] = useState<Conv[]>([])
  const { clears } = useChatPrefs()
  const { items: ci } = useConvItems()
  const roomItems = ci.filter((i) => i.room)
  const isRm = isRoom(other)
  const { room: rinfo } = useRoom(isRm ? roomKey(other!) : null)
  const navM = useNavigate()
  const [newRm, setNewRm] = useState(false)
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
      if (clears[o] && r.created_at <= clears[o]) continue
      let c = seen.get(o)
      if (!c) { c = { other: o, profile: r.sender_id === uid ? r.r : r.s, last: r, unread: 0 }; seen.set(o, c); out.push(c) }
      if (r.recipient_id === uid && !r.read_at) c.unread++
    }
    setConvs(out)
  }, [uid, clears])
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  // اسم الطرف التاني لو مفيش محادثة سابقة معاه
  useEffect(() => {
    setCur(null)
    if (!other || isRoom(other)) return
    supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', other).maybeSingle().then(({ data }) => setCur((data as P) ?? null))
  }, [other])

  const online = useOnline(convs.map((c) => c.other))
  const list = (
    <div className="crd col" style={{ gap: 6 }}>
      <div className="row"><b className="grow" style={{ fontSize: 18 }}>الرسائل</b><button className="btn sm" onClick={() => setNewRm(true)}>＋ شات جماعي</button></div>
      {roomItems.map((c) => (
        <Link key={c.other} to={`/messages/${c.other}`} className="row" style={{ borderRadius: 12, padding: 8 }}>
          <Avatar name={c.profile?.name} url={c.profile?.avatar_url} size={44} />
          <span className="grow" style={{ minWidth: 0, fontWeight: c.unread ? 700 : 400 }}><b>{c.profile?.name}</b><div className="mut" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview}</div></span>
          {c.unread > 0 && <span style={{ background: '#E5383B', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{c.unread}</span>}
        </Link>
      ))}
      {convs.length === 0 && roomItems.length === 0 && <span className="mut">لسه مفيش رسائل. ادخل على صفحة أي شخص واضغط "إرسال رسالة".</span>}
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
        {isRm
          ? <span className="row grow"><Avatar name={rinfo?.name} url={rinfo?.avatar_url} size={44} /><b>{rinfo?.name}</b>{rinfo && <RoomMenu room={rinfo} onLeft={() => navM('/messages')} />}</span>
          : <Link to={`/u/${other}`} className="row grow"><Avatar name={cur?.name} url={cur?.avatar_url} size={44} /><Name p={cur} /></Link>}
        {mobile && <Link className="btn sm" to="/messages">رجوع</Link>}
      </div>
      <Thread key={other} id={other} height={mobile ? 380 : 440} />
    </div>
  )

  if (!mobile) return <Messenger other={other} />
  return (
    <>
      {newRm && <NewRoomModal onClose={() => setNewRm(false)} onCreated={(id) => navM('/messages/' + id)} />}
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
  const isR = isRoom(other)
  const { room } = useRoom(isR ? roomKey(other!) : null)
  const nav = useNavigate()
  const [newRoom, setNewRoom] = useState(false)
  useEffect(() => {
    setCur(null)
    if (!other || isR) return
    supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', other).maybeSingle().then(({ data }) => setCur((data as P) ?? null))
  }, [other, isR])
  const isOn = !!other && !isR && online.has(other)

  return (
    <div className="msgr" dir="rtl">
      <aside className="mlist">
        <div className="row" style={{ padding: '16px 16px 8px' }}><b className="grow" style={{ fontSize: 24 }}>الدردشات</b><button className="btn sm" onClick={() => setNewRoom(true)} title="شات جماعي جديد">＋ شات جماعي</button></div>
        <div style={{ padding: '0 14px 8px' }}>
          <div className="dsearch" style={{ display: 'flex', width: '100%', maxWidth: 'none', boxSizing: 'border-box' }}><Icon n="search" s={18} /><input placeholder="ابحث في الدردشات" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الدردشات" /></div>
        </div>
        <div className="row" style={{ padding: '0 14px 8px', gap: 8 }}>
          {([['الكل', false], ['غير المقروءة', true]] as const).map(([l, v]) => (
            <button key={l} onClick={() => setUnreadOnly(v)} style={{ fontFamily: 'inherit', border: 0, cursor: 'pointer', borderRadius: 18, padding: '8px 14px', flex: 1, display: 'flex', justifyContent: 'center', fontWeight: 700, fontSize: 14, background: unreadOnly === v ? 'var(--brand)' : '#EFEFF1', color: unreadOnly === v ? '#fff' : '#111111' }}>{l}</button>
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

      {newRoom && <NewRoomModal onClose={() => setNewRoom(false)} onCreated={(id) => nav('/messages/' + id)} />}
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
              {isR ? (<>
                <Avatar name={room?.name} url={room?.avatar_url} size={44} />
                <div className="grow col" style={{ gap: 0 }}><b>{room?.name ?? '…'}</b><span className="mut" style={{ fontSize: 12 }}>{room ? `${room.members.length} أعضاء` : ''}</span></div>
                {room && <RoomMenu room={room} onLeft={() => nav('/messages')} />}
              </>) : (<>
                <AvatarOn online={isOn}><Avatar name={cur?.name} url={cur?.avatar_url} size={44} /></AvatarOn>
                <Link to={`/u/${other}`} className="grow col" style={{ gap: 0 }}><Name p={cur} /><span className="mut" style={{ fontSize: 12 }}>{isOn ? 'نشط الآن' : ''}</span></Link>
                <ChatMenu otherId={other!} name={cur?.name} onRoom={(id) => nav('/messages/' + id)} />
              </>)}
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '0 12px' }}><Thread key={other} id={other} fill /></div>
          </section>
          {isR ? (
            <aside className="minfo col" style={{ gap: 8, padding: 20, alignItems: 'stretch' }}>
              <div className="col" style={{ alignItems: 'center', gap: 6, textAlign: 'center' }}>
                <Avatar name={room?.name} url={room?.avatar_url} size={96} />
                <b style={{ fontSize: 18 }}>{room?.name}</b>
                <span className="pill">👥 {room?.members.length ?? 0} أعضاء</span>
              </div>
              <b style={{ marginTop: 10 }}>الأعضاء</b>
              {room?.members.map((m) => (
                <Link key={m.user_id} to={`/u/${m.user_id}`} className="row" style={{ gap: 10, padding: '4px 0' }}><Avatar name={m.profiles?.name} url={m.profiles?.avatar_url} size={36} /><Name p={m.profiles} /></Link>
              ))}
            </aside>
          ) : (
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
          )}
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
