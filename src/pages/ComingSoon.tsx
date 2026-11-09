import { Link, useParams } from 'react-router-dom'

const T: Record<string, string> = { chat: 'الرسائل', friends: 'الأصدقاء', notifications: 'الإشعارات' }
export default function ComingSoon() {
  const { what } = useParams()
  return (
    <div className="crd col" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
      <b style={{ fontSize: 20 }}>{T[what ?? ''] ?? 'الميزة دي'}</b>
      <span className="mut" style={{ fontSize: 14 }}>الميزة دي قيد التطوير وهتكون متاحة قريبًا.</span>
      <Link className="btn p" to="/">الرجوع للرئيسية</Link>
    </div>
  )
}
