import { useNavigate } from 'react-router-dom'
import { Avatar, Icon, timeAgo } from '../lib/ui'
import { NOTIF_PLURAL, NOTIF_TEXT, groupNotifs, notifLink, type Notif } from '../lib/notifs'

const BADGE: Record<Notif['type'], { icon: string; bg: string }> = {
  post_like: { icon: 'heart', bg: '#F02849' }, comment_like: { icon: 'heart', bg: '#F02849' },
  post_comment: { icon: 'comment', bg: '#31A24C' }, comment_reply: { icon: 'comment', bg: '#31A24C' },
  friend_request: { icon: 'friends', bg: 'var(--brand)' }, friend_accept: { icon: 'friends', bg: 'var(--brand)' },
  group_invite: { icon: 'groups', bg: '#7C3AED' }, group_join: { icon: 'groups', bg: '#7C3AED' },
}

// قايمة إشعارات بشكل فيسبوك، والمتشابه بيتجمّع في إشعار واحد ("أحمد و3 آخرين علّقوا على منشورك")
export default function NotifList({ items, markMany, onGo, empty, max }: { items: Notif[]; markMany: (ids: string[]) => void; onGo?: () => void; empty: string; max?: number }) {
  const nav = useNavigate()
  const day = 24 * 3600e3
  const all = groupNotifs(items)
  const groups = max ? all.slice(0, max) : all
  const fresh = groups.filter((g) => Date.now() - new Date(g.latest.created_at).getTime() < day)
  const old = groups.filter((g) => Date.now() - new Date(g.latest.created_at).getTime() >= day)
  const row = (g: (typeof groups)[number]) => {
    const n = g.latest; const b = BADGE[n.type]; const unread = g.unread
    const withGroup = n.type === 'group_invite' || n.type === 'group_join'
    const many = g.actors.length > 1
    const a = g.actors
    const names = a.length === 1 ? <b style={{ color: '#111' }}>{a[0].name}</b>
      : a.length === 2 ? <><b style={{ color: '#111' }}>{a[0].name}</b> و<b style={{ color: '#111' }}>{a[1].name}</b></>
      : <><b style={{ color: '#111' }}>{a[0].name}</b> و<b style={{ color: '#111' }}>{a[1].name}</b> و{a.length - 2} {a.length - 2 === 1 ? 'آخر' : 'آخرين'}</>
    return (
      <button key={g.key} className="row ntf" onClick={() => { markMany(g.ids); onGo?.(); nav(notifLink(n)) }}>
        <span style={{ position: 'relative', flex: 'none', display: 'inline-flex', width: 56, height: 56 }}>
          {many
            ? (<>
                <span style={{ position: 'absolute', top: 0, insetInlineEnd: 0, borderRadius: '50%', boxShadow: '0 0 0 2px #fff' }}><Avatar name={a[1].name} url={a[1].avatar} size={38} /></span>
                <span style={{ position: 'absolute', bottom: 0, insetInlineStart: 0, borderRadius: '50%', boxShadow: '0 0 0 2px #fff' }}><Avatar name={a[0].name} url={a[0].avatar} size={38} /></span>
              </>)
            : <Avatar name={a[0].name} url={a[0].avatar} size={56} />}
          <span style={{ position: 'absolute', insetInlineStart: -4, bottom: -2, width: 26, height: 26, borderRadius: '50%', background: b.bg, color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}><Icon n={b.icon} s={14} /></span>
        </span>
        <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: unread ? '#111' : '#65676B' }}>
            {names} {many ? NOTIF_PLURAL[n.type] : NOTIF_TEXT[n.type]}{withGroup && <> <b style={{ color: '#111' }}>{n.groups?.name ?? ''}</b>.</>}
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
