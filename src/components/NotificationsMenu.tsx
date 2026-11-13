import { useState } from 'react'
import { Link } from 'react-router-dom'
import NotifList from './NotifList'
import NotifSettings from './NotifSettings'
import type { Notif } from '../lib/notifs'

// قايمة الإشعارات المنسدلة زي فيسبوك
export default function NotificationsMenu({ items, markMany, markAll, missing, onClose }: { items: Notif[]; markMany: (ids: string[]) => void; markAll: () => void; missing: boolean; onClose: () => void }) {
  const [more, setMore] = useState(false)
  const [cfg, setCfg] = useState(false)
  return (
    <div className="pop" style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: 0, width: 380, padding: 0, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '14px 16px 6px', position: 'relative' }}>
        <b className="grow" style={{ fontSize: 24 }}>الإشعارات</b>
        <button className="ibtn" aria-label="المزيد" onClick={() => setMore(!more)} style={{ width: 34, height: 34 }}>···</button>
        {more && (
          <div className="pop" style={{ top: 48, left: 12, insetInlineStart: 'auto', minWidth: 200 }}>
            <button onClick={() => { markAll(); setMore(false) }}>✔ تحديد الكل كمقروء</button>
            <button onClick={() => { setCfg(true); setMore(false) }}>⚙ إعدادات الإشعارات</button>
          </div>
        )}
      </div>
      <div style={{ overflowY: 'auto', padding: '0 8px 8px' }}>
        {missing
          ? <div className="mut" style={{ textAlign: 'center', padding: 24 }}>الإشعارات محتاجة تحديث 019 في Supabase.</div>
          : <NotifList items={items} max={10} markMany={markMany} onGo={onClose} empty="لسه مفيش إشعارات." />}
      </div>
      <div style={{ padding: '4px 12px 12px' }}>
        <Link to="/notifications" onClick={onClose} className="btn" style={{ width: '100%', justifyContent: 'center', background: '#E4E6EB', fontWeight: 700 }}>عرض كل الإشعارات</Link>
      </div>
      {cfg && <NotifSettings onClose={() => setCfg(false)} />}
    </div>
  )
}
