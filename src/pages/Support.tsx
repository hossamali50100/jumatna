import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import SupportThread from '../components/SupportThread'
import { SUPPORT_TOPICS, topicOf } from '../lib/topics'

export default function Support() {
  const { session } = useAuth()
  const [sp, setSp] = useSearchParams()
  const t = topicOf(sp.get('topic') === 'premium' ? null : sp.get('topic'))
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crd col">
        <div className="row"><b className="grow" style={{ fontSize: 20 }}>الدعم · فريق جمعتنا</b></div>
        <div className="mut">تتواصل معنا في إيه؟ اختار الموضوع عشان نوصّل رسالتك للشخص المناسب:</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {SUPPORT_TOPICS.map((x) => (
            <button key={x.k} onClick={() => setSp(t?.k === x.k ? {} : { topic: x.k }, { replace: true })} aria-pressed={t?.k === x.k}
              style={{ fontFamily: 'inherit', cursor: 'pointer', borderRadius: 20, padding: '8px 14px', fontWeight: 600, fontSize: 14, border: '1px solid ' + (t?.k === x.k ? 'var(--brand)' : '#E4E4E7'), background: t?.k === x.k ? 'var(--brand)' : '#fff', color: t?.k === x.k ? '#fff' : '#111111' }}>{x.icon} {x.label}</button>
          ))}
        </div>
        <SupportThread userId={session!.user.id} topic={t?.k} hint={t?.hint} />
      </div>
    </div>
  )
}
