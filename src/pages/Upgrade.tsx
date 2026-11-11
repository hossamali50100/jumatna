import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { isPremium } from '../lib/supabase'
import { Check } from '../lib/ui'
import SupportThread from '../components/SupportThread'

// صفحة طلب الترقية: محادثة لوحدها مع فريق جمعتنا (منفصلة عن الدعم)
export default function Upgrade() {
  const { session, profile } = useAuth()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div className="upg">
      <div className="crd col upg-main">
        <div className="row" style={{ minHeight: 36 }}><Check /><b className="grow" style={{ fontSize: 20 }}>ترقية الحساب</b><span ref={setSlot} /></div>
        <SupportThread userId={session!.user.id} channel="upgrade" actionSlot={slot} hint="اكتب رسالتك عن الترقية للباقة المميزة وهنرد عليك في أقرب وقت." />
      </div>
      <aside className="crd col upg-side">
        <b>إزاي أرقّي حسابي؟</b>
        {isPremium(profile)
          ? <div className="okmsg">حسابك مميز حاليًا ✅</div>
          : <div className="mut" style={{ lineHeight: 1.8 }}>اكتب لنا هنا وهنقولك التفاصيل وطريقة التفعيل. المحادثة دي خاصة بطلبات الترقية بس، ولأي مشكلة تانية استخدم «الدعم».</div>}
      </aside>
    </div>
  )
}
