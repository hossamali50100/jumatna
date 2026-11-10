import { Link } from 'react-router-dom'
import { Check } from '../lib/ui'
import { useAuth } from '../lib/auth'
import { isPremium } from '../lib/supabase'

const prem = ['إنشاء حتى 10 مجموعات', 'علامة التوثيق الخضراء بجانب اسمك', 'دعم مباشر وسريع من فريق جمعتنا']

export default function Plans() {
  const { profile } = useAuth()
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card col" style={{ borderColor: '#111', borderWidth: 2, gap: 12 }}>
        <div className="row"><Check /><b style={{ fontSize: 22 }}>الباقة المميزة</b></div>
        {prem.map((t) => <div key={t} className="row"><span>✓</span>{t}</div>)}
        {isPremium(profile)
          ? <div className="okmsg">حسابك مميز حاليًا.</div>
          : <>
              <div className="mut" style={{ lineHeight: 1.8 }}>للترقية تواصل مع فريق جمعتنا وهنقولك التفاصيل وطريقة التفعيل.</div>
              <Link className="btn p" to="/support?topic=premium">اطلب الترقية</Link>
            </>}
      </div>
    </div>
  )
}
