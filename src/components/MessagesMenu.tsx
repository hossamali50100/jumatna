import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useConvItems } from '../lib/convs'
import { useOnline } from '../lib/presence'
import { Avatar, AvatarOn, Icon, Name, timeAgo } from '../lib/ui'
import { useChatDock } from './ChatDock'
import { NewRoomModal } from './RoomDialogs'

// قايمة الدردشات المنسدلة زي ماسنجر: المحادثات الأخيرة + كل الأصدقاء
export default function MessagesMenu({ onClose }: { onClose: () => void }) {
  const { openChat } = useChatDock()
  const { items: all } = useConvItems()
  const [q, setQ] = useState('')
  const [newRoom, setNewRoom] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  let items = all
  if (unreadOnly) items = items.filter((i) => i.unread > 0)
  if (q.trim()) items = items.filter((i) => (i.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  const online = useOnline(all.map((i) => i.other))

  return (
    <div className="pop" style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: 0, width: 380, padding: 0, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '14px 16px 6px' }}>
        <b className="grow" style={{ fontSize: 22 }}>الدردشات</b>
        <button type="button" className="btn sm" onClick={() => setNewRoom(true)} title="دردشة جماعية جديدة">＋ مجموعة</button>
        <Link to="/messages" onClick={onClose} aria-label="فتح الرسائل في صفحة كاملة" title="فتح في صفحة كاملة" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%' }}><Icon n="expand" s={18} /></Link>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        <div className="dsearch" style={{ display: 'flex', width: '100%', maxWidth: 'none', boxSizing: 'border-box' }}><Icon n="search" s={18} /><input placeholder="ابحث في الدردشات" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الدردشات" /></div>
      </div>
      <div className="row" style={{ padding: '0 14px 8px', gap: 8 }}>
        {([['الكل', false], ['غير المقروءة', true]] as const).map(([l, v]) => (
          <button key={l} onClick={() => setUnreadOnly(v)} style={{ fontFamily: 'inherit', border: 0, cursor: 'pointer', borderRadius: 18, padding: '8px 14px', flex: 1, display: 'flex', justifyContent: 'center', textAlign: 'center', fontWeight: 700, fontSize: 14, background: unreadOnly === v ? 'var(--brand)' : '#EFEFF1', color: unreadOnly === v ? '#fff' : '#111111' }}>{l}</button>
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
      {newRoom && <NewRoomModal onClose={() => setNewRoom(false)} onCreated={(id) => { openChat(id); onClose() }} />}
    </div>
  )
}
