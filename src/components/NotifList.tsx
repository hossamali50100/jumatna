import { useNavigate } from 'react-router-dom'
import { Avatar, Icon, timeAgo } from '../lib/ui'
import { NOTIF_TEXT, notifLink, type Notif } from '../lib/notifs'

const BADGE: Record<Notif['type'], { icon: string; bg: string }> = {
  post_like: { icon: 'heart', bg: '#F02849' }, comment_like: { icon: 'heart', bg: '#F02849' },
  post_comment: { icon: 'comment', bg: '#31A24C' }, comment_reply: { icon: 'comment', bg: '#31A24C' },
  friend_request: { icon: 'friends', bg: 'var(--brand)' }, friend_accept: { icon: 'friends', bg: 'var(--brand)' },
  group_invite: { icon: 'groups', bg: '#7C3AED' }, group_join: { icon: 'groups', bg: '#7C3AED' },
}

// قايمة إشعارات بشكل فيسبوك: صورة + شارة نوع + نص + وقت + نقطة زرقاء لغير المقروء
export default function NotifList({ items, markRead, onGo, empty }: { items: Notif[]; markRead: (id: string) => void; onGo?: () => void; empty: string }) {
  const nav = useNavigate()
  const day = 24 * 3600e3
  const fresh = items.filter((n) => Date.now() - new Date(n.created_at).getTime() < day)
  const old = items.filter((n) => Date.now() - new Date(n.created_at).getTime() >= day)
  const row = (n: Notif) => {
    const b = BADGE[n.type]; const unread = !n.read_at
    const withGroup = n.type === 'group_invite' || n.type === 'group_join'
    return (
      <button key={n.id} className="row ntf" onClick={() => { markRead(n.id); onGo?.(); nav(notifLink(n)) }}>
        <span style={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
          <Avatar name={n.profiles?.name} url={n.profiles?.avatar_url} size={56} />
          <span style={{ position: 'absolute', insetInlineStart: -4, bottom: -2, width: 26, height: 26, borderRadius: '50%', background: b.bg, color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}><Icon n={b.icon} s={14} on /></span>
        </span>
        <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: unread ? '#111' : '#65676B' }}>
            <b style={{ color: '#111' }}>{n.profiles?.name ?? 'مستخدم'}</b> {NOTIF_TEXT[n.type]}{withGroup && <> <b style={{ color: '#111' }}>{n.groups?.name ?? ''}</b>.</>}
          </span>
          <span style={{ fontSize: 13, fontWeight: unread ? 700 : 400, color: unread ? 'var(--brand)' : '#65676B' }}>{timeAgo(n.created_at)}</span>
        </span>
        {unread && <span aria-label="غير مقروء" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)', flex: 'none' }} />}
      </button>
    )
  }
  if (!items.length) return <div className="mut" style={{ textAlign: 'center', padding: 28 }}>{empty}</div>
  return (
    <div className="col" style={{ gap: 2 }}>
      {fresh.length > 0 && <b style={{ padding: '6px 10px', fontSize: 17 }}>الجديدة</b>}
      {fresh.map(row)}
      {old.length > 0 && <b style={{ padding: '10px 10px 6px', fontSize: 17 }}>الأقدم</b>}
      {old.map(row)}
    </div>
  )
}
