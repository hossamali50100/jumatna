import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { Err, useIsMobile } from '../lib/ui'

export default function Login() {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const google = async () => {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setErr(errMsg(error))
  }
  const go = (m: 'in' | 'up' | 'reset') => (e: React.MouseEvent) => { e.preventDefault(); setMode(m); setErr(''); setInfo('') }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setInfo('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('اكتب إيميل صحيح.')
    if (mode !== 'reset' && pw.length < 8) return setErr('كلمة السر لازم تكون 8 أحرف على الأقل.')
    if (mode === 'up' && name.trim().length < 2) return setErr('اكتب اسمك.')
    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw new Error('الإيميل أو كلمة السر غير صحيحة.')
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (!data.session) setInfo('بعتنالك رسالة تأكيد على الإيميل. افتحها وبعدين سجّل دخول.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('لو الإيميل مسجّل عندنا هيوصلك رابط لتغيير كلمة السر.')
      }
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  const title = mode === 'in' ? 'تسجيل الدخول' : mode === 'up' ? 'إنشاء حساب' : 'استرجاع كلمة السر'
  const inp = { minHeight: mobile ? 48 : 44 }

  const form = (
    <form className={mobile ? 'crd' : 'card'} style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 14 : 16, padding: mobile ? 14 : 24 }} onSubmit={submit}>
      <b style={{ fontSize: mobile ? 20 : 22 }}>{title}</b>
      {mode !== 'reset' && (<>
        <button type="button" className={'btn line' + (mobile ? ' prim' : '')} style={{ gap: 10 }} onClick={google}>
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', background: '#111111', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, fontFamily: 'Arial,sans-serif' }}>G</span>
          تسجيل الدخول بحساب Google
        </button>
        <div className="row mut" style={{ gap: 12 }}><span style={{ flex: 1, height: 1, background: '#E4E4E7' }} />أو بالبريد الإلكتروني<span style={{ flex: 1, height: 1, background: '#E4E4E7' }} /></div>
      </>)}
      {mode === 'up' && <label className="col" style={{ gap: 6 }}><b>الاسم</b><input className="in" style={inp} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
      <label className="col" style={{ gap: 6 }}><b>البريد الإلكتروني</b><input className="in" style={inp} type="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {mode !== 'reset' && <label className="col" style={{ gap: 6 }}><b>كلمة السر</b><input className="in" style={inp} type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>}
      <Err>{err}</Err>
      {info && <div className="okmsg">{info}</div>}
      <button className={'btn p' + (mobile ? ' prim' : '')} disabled={busy}>{busy ? '…' : mode === 'in' ? 'دخول' : mode === 'up' ? 'إنشاء الحساب' : 'إرسال الرابط'}</button>
      {mode === 'in' && <a href="#" onClick={go('reset')} style={{ textAlign: 'center', fontSize: 14 }}>نسيت كلمة السر؟</a>}
      {mode === 'in' && !mobile && <div className="hr" />}
      {mode === 'in' ? <a href="#" className="btn" onClick={go('up')}>إنشاء حساب جديد</a> : <a href="#" className="btn" onClick={go('in')}>رجوع لتسجيل الدخول</a>}
    </form>
  )

  if (mobile) {
    return (
      <div className="mroot"><main className="mmain"><div className="col" style={{ gap: 16, padding: '16px 4px' }}>
        <div className="col" style={{ alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <div className="av" style={{ width: 72, height: 72, background: '#111111', borderRadius: 20, fontSize: 28 }}>ج</div>
          <b style={{ fontSize: 28 }}>جمعتنا</b>
          <span className="mut" style={{ fontSize: 14 }}>مجموعاتك وأصدقاؤك في تطبيق واحد</span>
        </div>
        {form}
      </div></main></div>
    )
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="col" style={{ width: '100%', maxWidth: 420, gap: 16 }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <div className="av" style={{ width: 48, height: 48, background: '#111111', fontSize: 24 }}>ج</div>
          <b style={{ fontSize: 30 }}>جمعتنا</b>
        </div>
        {form}
      </div>
    </div>
  )
}
