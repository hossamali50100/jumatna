import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isPremium } from '../lib/supabase'
import { Check } from '../lib/ui'
import SupportThread from '../components/SupportThread'

// صفحة طلب الترقية: محادثة لوحدها مع فريق جمعتنا (منفصلة عن الدعم)
export default function Upgrade() {
  const { session, profile } = useAuth()
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crd col">
        <div className="row"><Check /><b className="grow" style={{ fontSize: 20 }}>ترقية الحساب</b><Link className="btn sm" to="/plans">تفاصيل الباقة</Link></div>
        {isPremium(profile)
          ? <div className="okmsg">حسابك مميز حاليًا ✅</div>
          : <div className="mut" style={{ lineHeight: 1.8 }}>اكتب لنا هنا وهنقولك التفاصيل وطريقة التفعيل. المحادثة دي خاصة بطلبات الترقية بس، ولأي مشكلة تانية استخدم «الدعم».</div>}
        <SupportThread userId={session!.user.id} channel="upgrade" hint="اكتب رسالتك عن الترقية للباقة المميزة وهنرد عليك في أقرب وقت." />
      </div>
    </div>
  )
}
