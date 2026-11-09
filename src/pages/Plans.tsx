import { Check } from '../lib/ui'
import { useAuth } from '../lib/auth'
import { isPremium } from '../lib/supabase'

const free = ['الانضمام لعدد غير محدود من المجموعات', 'نشر بوستات وتعليقات وصور', 'إنشاء مجموعة واحدة']
const prem = ['إنشاء حتى 10 مجموعات', 'علامة التوثيق الخضراء بجانب اسمك', 'كل مميزات الحساب المجاني']

export default function Plans() {
  const { profile } = useAuth()
  return (
    <div className="col">
      <b style={{ fontSize: 20 }}>الباقات</b>
      <div className="card col"><b>مجاني</b><div className="mut">0 جنيه</div>
        {free.map((t) => <div key={t} className="row"><span>✓</span>{t}</div>)}</div>
      <div className="card col" style={{ borderColor: '#111', borderWidth: 2 }}>
        <div className="row"><Check /><b>مميز</b></div><div><b style={{ fontSize: 22 }}>100 جنيه</b> <span className="mut">/ شهريًا</span></div>
        {prem.map((t) => <div key={t} className="row"><span>✓</span>{t}</div>)}
        {isPremium(profile) ? <div className="okmsg">حسابك مميز حاليًا.</div>
          : <div className="mut">الترقية بتتم عن طريق محادثة مع فريق جمعتنا (بتتفعّل في المرحلة الجاية). لحد ما تتفعّل، التفعيل بيتم يدويًا من الإدارة.</div>}
      </div>
    </div>
  )
}
