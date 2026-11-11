import { useNotifs } from '../lib/notifs'
import NotifList from '../components/NotifList'

// صفحة كل الإشعارات (للموبايل ولـ "عرض كل الإشعارات")
export default function Notifications() {
  const { items, markRead, markAll, missing, unread } = useNotifs(100)
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="crd col">
        <div className="row"><b className="grow" style={{ fontSize: 22 }}>الإشعارات</b>{unread > 0 && <button className="btn sm" onClick={markAll}>✔ تحديد الكل كمقروء</button>}</div>
        {missing
          ? <div className="mut" style={{ textAlign: 'center', padding: 24 }}>الإشعارات محتاجة تحديث 019 في Supabase.</div>
          : <NotifList items={items} markRead={markRead} empty="لسه مفيش إشعارات." />}
      </div>
    </div>
  )
}
