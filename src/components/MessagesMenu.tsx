import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends } from '../lib/friends'
import { useOnline } from '../lib/presence'
import { Avatar, AvatarOn, Icon, Name, timeAgo } from '../lib/ui'
import { useChatDock } from './ChatDock'

type P = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Row = { sender_id: string; recipient_id: string; body: string; image_url: string | null; created_at: string; read_at: string | null; s: P | null; r: P | null }
type Item = { other: string; profile: P | null; preview: string; at: string | null; unread: number }

// قايمة الدردشات المنسدلة زي ماسنجر: المحادثات الأخيرة + كل الأصدقاء
export default function MessagesMenu({ onClose }: { onClose: () => void }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels } = useFriends()
  const { openChat } = useChatDock()
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('dm_messages')
      .select('sender_id,recipient_id,body,image_url,created_at,read_at,s:profiles!sender_id(name,avatar_url,plan,plan_until),r:profiles!recipient_id(name,avatar_url,plan,plan_until)')
      .order('created_at', { ascending: false }).limit(300)
    setRows((data as unknown as Row[]) ?? [])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  const map = new Map<string, Item>()
  for (const r of rows) {
    const o = r.sender_id === uid ? r.recipient_id : r.sender_id
    let it = map.get(o)
    if (!it) {
      const text = r.body || 'صورة'
      it = { other: o, profile: r.sender_id === uid ? r.r : r.s, preview: (r.sender_id === uid ? 'أنت: ' : '') + text, at: r.created_at, unread: 0 }
      map.set(o, it)
    }
    if (r.recipient_id === uid && !r.read_at) it.unread++
  }
  for (const f of rels.filter((x) => x.status === 'accepted')) {
    if (!map.has(f.other)) map.set(f.other, { other: f.other, profile: f.profile as P | null, preview: 'ابدأ محادثة', at: null, unread: 0 })
  }
  let items = [...map.values()]
  if (unreadOnly) items = items.filter((i) => i.unread > 0)
  if (q.trim()) items = items.filter((i) => (i.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  const online = useOnline([...map.keys()])

  return (
    <div className="pop" style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: 0, width: 380, padding: 0, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '14px 16px 6px' }}>
        <b className="grow" style={{ fontSize: 22 }}>الدردشات</b>
        <Link to="/messages" onClick={onClose} aria-label="فتح الرسائل في صفحة كاملة" title="فتح في صفحة كاملة" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%' }}><Icon n="expand" s={18} /></Link>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        <div className="dsearch" style={{ width: '100%' }}><Icon n="search" s={18} /><input placeholder="ابحث في الدردشات" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الدردشات" /></div>
      </div>
      <div className="row" style={{ padding: '0 14px 8px', gap: 6 }}>
        {([['الكل', false], ['غير المقروءة', true]] as const).map(([l, v]) => (
          <button key={l} onClick={() => setUnreadOnly(v)} style={{ fontFamily: 'inherit', border: 0, cursor: 'pointer', borderRadius: 18, padding: '6px 14px', fontWeight: 700, fontSize: 14, background: unreadOnly === v ? '#111111' : '#EFEFF1', color: unreadOnly === v ? '#fff' : '#111111' }}>{l}</button>
        ))}
      </div>
      <div className="col" style={{ gap: 2, overflowY: 'auto', padding: '0 8px 10px' }}>
        {items.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 24 }}>{unreadOnly ? 'مفيش رسائل غير مقروءة.' : 'لسه مفيش أصدقاء أو محادثات.'}</div>}
        {items.map((i) => (
          <button key={i.other} onClick={() => { openChat(i.other); onClose() }} className="row" style={{ fontFamily: 'inherit', textAlign: 'start', width: '100%', border: 0, background: 'none', cursor: 'pointer', borderRadius: 12, padding: 8, gap: 12 }}>
            <AvatarOn online={online.has(i.other)}><Avatar name={i.profile?.name} url={i.profile?.avatar_url} size={52} /></AvatarOn>
            <span className="grow col" style={{ minWidth: 0, gap: 0, fontWeight: i.unread ? 700 : 400 }}>
              <Name p={i.profile} />
              <span className="mut" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: i.unread ? 700 : 400, color: i.unread ? '#111111' : undefined }}>{i.preview}{i.at && ` · ${timeAgo(i.at)}`}</span>
            </span>
            {i.unread > 0 && <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#E5383B', flex: 'none' }} aria-label="رسالة جديدة" />}
          </button>
        ))}
      </div>
    </div>
  )
}
