import { createPortal } from 'react-dom'
import { NOTIF_PREF_TYPES, useNotifPrefs } from '../lib/notifs'
import { Err } from '../lib/ui'

// إعدادات الإشعارات: مفتاح عام + مفتاح لكل نوع
export default function NotifSettings({ onClose }: { onClose: () => void }) {
  const { off, set, missing, err } = useNotifPrefs()
  const allOn = !off.has('all')
  const sw = (on: boolean, onChange: (v: boolean) => void, label: string, hint?: string, dim?: boolean) => (
    <label className="row" style={{ gap: 12, padding: '10px 4px', cursor: 'pointer', opacity: dim ? 0.45 : 1, borderBottom: '1px solid #F0F0F2' }}>
      <span className="grow col" style={{ gap: 2 }}><b style={{ fontSize: 15 }}>{label}</b>{hint && <span className="mut" style={{ fontSize: 13 }}>{hint}</span>}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--brand)', flex: 'none' }} />
    </label>
  )
  return createPortal(
    <div className="fw-ov" onClick={onClose}>
      <div className="fw" role="dialog" aria-label="إعدادات الإشعارات" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid #E4E4E7' }}>
          <b className="grow" style={{ fontSize: 18 }}>إعدادات الإشعارات</b>
          <button type="button" onClick={onClose} aria-label="إغلاق" style={{ border: 0, background: 'none', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '4px 16px 16px', overflowY: 'auto', maxHeight: '70vh' }}>
          {missing && <div className="mut" style={{ padding: '14px 0' }}>إعدادات الإشعارات محتاجة تحديث 039 في Supabase (مرة واحدة).</div>}
          {sw(allOn, (v) => set('all', v), 'استقبال الإشعارات', 'قفل ده بيوقف كل الإشعارات الجديدة')}
          {NOTIF_PREF_TYPES.map((t) => <div key={t.type}>{sw(!off.has(t.type), (v) => set(t.type, v), t.label, t.hint, !allOn)}</div>)}
          <Err>{err}</Err>
        </div>
      </div>
    </div>, document.body)
}
