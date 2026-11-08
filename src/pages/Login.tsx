import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { Err } from '../components/ui'

export default function Login() {
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="col" style={{ width: '100%', maxWidth: 420, gap: 16 }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="av" style={{ width: 48, height: 48, fontSize: 24 }}>ج</span><b style={{ fontSize: 26 }}>جمعتنا</b>
        </div>
        <form className="card col" onSubmit={submit}>
          <b style={{ fontSize: 20 }}>{mode === 'in' ? 'تسجيل الدخول' : mode === 'up' ? 'إنشاء حساب' : 'استرجاع كلمة السر'}</b>
          {mode !== 'reset' && (<>
            <button type="button" className="btn" onClick={google}>الدخول بحساب جوجل</button>
            <div className="mut" style={{ textAlign: 'center' }}>أو بالبريد الإلكتروني</div>
          </>)}
          {mode === 'up' && <input className="in" placeholder="الاسم" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          <input className="in" type="email" dir="ltr" placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {mode !== 'reset' && <input className="in" type="password" dir="ltr" placeholder="كلمة السر (8 أحرف فأكثر)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />}
          <Err>{err}</Err>
          {info && <div className="okmsg">{info}</div>}
          <button className="btn p" disabled={busy}>{busy ? '…' : mode === 'in' ? 'دخول' : mode === 'up' ? 'إنشاء الحساب' : 'إرسال الرابط'}</button>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            {mode === 'in' ? <>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); setErr('') }}>إنشاء حساب جديد</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); setErr('') }}>نسيت كلمة السر؟</a>
            </> : <a href="#" onClick={(e) => { e.preventDefault(); setMode('in'); setErr(''); setInfo('') }}>رجوع لتسجيل الدخول</a>}
          </div>
        </form>
      </div>
    </div>
  )
}
