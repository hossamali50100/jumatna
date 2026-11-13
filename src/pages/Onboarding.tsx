import { useEffect, useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePlatform } from '../lib/platform'
import { Err } from '../lib/ui'

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

// شاشة أول دخول (جوجل أو إيميل): الاسم + تاريخ الميلاد + الجنس، وبعدها يدخل المنصة
export default function Onboarding() {
  const { refresh, signOut, session } = useAuth()
  const pf = usePlatform()
  const thisYear = new Date().getFullYear()
  const [name, setName] = useState('')
  const [d, setD] = useState(''); const [m, setM] = useState(''); const [y, setY] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  // لو سجّل بالإيميل وكتب بياناته كلها في شاشة التسجيل: نكمّل تلقائي من غير ما نسأله تاني
  const meta = (session?.user.user_metadata ?? {}) as { full_name?: string; birth_date?: string; gender?: string }
  const auto = !!(meta.full_name && meta.full_name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(meta.birth_date ?? '') && (meta.gender === 'male' || meta.gender === 'female'))
  const [autoing, setAutoing] = useState(auto)
  const tried = useRef(false)
  useEffect(() => {
    if (!auto || tried.current) return
    tried.current = true
    ;(async () => {
      const { error } = await supabase.rpc('complete_onboarding', { p_name: meta.full_name!.trim(), p_birth: meta.birth_date, p_gender: meta.gender })
      if (error) {
        const [yy, mm, dd] = meta.birth_date!.split('-')
        setName(meta.full_name!.trim()); setY(String(Number(yy))); setM(String(Number(mm))); setD(String(Number(dd))); setGender(meta.gender as 'male' | 'female')
        setErr(/complete_onboarding|schema cache/i.test(error.message) ? 'السيرفر محتاج تحديث 016 (مرة واحدة من Supabase).' : errMsg(error)); setAutoing(false)
      } else await refresh()
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (name.trim().length < 2) return setErr('اكتب اسمك (حرفين على الأقل).')
    if (!d || !m || !y) return setErr('اختار تاريخ ميلادك كامل.')
    const dt = new Date(Number(y), Number(m) - 1, Number(d))
    if (dt.getMonth() !== Number(m) - 1) return setErr('التاريخ ده مش موجود، راجع اليوم والشهر.')
    if (!gender) return setErr('اختار الجنس.')
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    setBusy(true)
    const { error } = await supabase.rpc('complete_onboarding', { p_name: name.trim(), p_birth: iso, p_gender: gender })
    setBusy(false)
    if (error) return setErr(/complete_onboarding|schema cache/i.test(error.message) ? 'السيرفر محتاج تحديث 016 (مرة واحدة من Supabase).' : errMsg(error))
    await refresh()
  }
  const sel = { minHeight: 46, flex: 1, border: '1px solid #D4D4D8', borderRadius: 12, padding: '0 10px', background: '#fff', fontFamily: 'inherit', fontSize: 15, minWidth: 0 } as const

  if (autoing) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F2F3F5' }}><span className="mut">جاري تجهيز حسابك…</span></div>
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F2F3F5', padding: 16 }}>
      <form onSubmit={submit} className="card col" style={{ width: 'min(460px,100%)', gap: 16, padding: 26 }}>
        <div className="col" style={{ alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <div className="av" style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--brand)', fontSize: 30, overflow: 'hidden' }}>
            {pf.logo_url ? <img src={pf.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : pf.name.charAt(0)}
          </div>
          <b style={{ fontSize: 22 }}>أهلًا بيك في {pf.name} 👋</b>
          <span className="mut">كمّل بياناتك الأساسية الأول، وبعدها تدخل المنصة على طول.</span>
        </div>

        <label className="col" style={{ gap: 6 }}><b>اسمك جوه المنصة</b>
          <input className="in" style={{ minHeight: 46 }} value={name} placeholder="اكتب اسمك هنا" maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>

        <div className="col" style={{ gap: 6 }}><b>تاريخ الميلاد</b>
          <div className="row" style={{ gap: 8 }}>
            <select style={sel} value={d} onChange={(e) => setD(e.target.value)} aria-label="اليوم"><option value="">اليوم</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
            <select style={{ ...sel, flex: 1.6 }} value={m} onChange={(e) => setM(e.target.value)} aria-label="الشهر"><option value="">الشهر</option>{MONTHS.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}</select>
            <select style={{ ...sel, flex: 1.3 }} value={y} onChange={(e) => setY(e.target.value)} aria-label="السنة"><option value="">السنة</option>{Array.from({ length: thisYear - 1925 }, (_, i) => thisYear - 1 - i).map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </div>
          <span className="mut" style={{ fontSize: 13 }}>لازم يكون عمرك 13 سنة أو أكتر. تاريخ ميلادك ما بيظهرش لحد غيرك.</span>
        </div>

        <div className="col" style={{ gap: 6 }}><b>الجنس</b>
          <div className="row" style={{ gap: 10 }}>
            {([['male', 'ذكر'], ['female', 'أنثى']] as const).map(([k, t]) => (
              <button type="button" key={k} onClick={() => setGender(k)} className="btn" style={{ flex: 1, minHeight: 46, ...(gender === k ? { background: 'var(--brand)', color: '#fff' } : {}) }}>{t}</button>
            ))}
          </div>
        </div>

        <Err>{err}</Err>
        <button className="btn p" style={{ minHeight: 48 }} disabled={busy}>{busy ? 'استنى…' : 'ابدأ'}</button>
        <button type="button" className="mut" style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }} onClick={signOut}>تسجيل الخروج</button>
      </form>
    </div>
  )
}
