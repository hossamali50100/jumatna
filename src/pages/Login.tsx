import { useState } from 'react'
import { supabase, authErrMsg } from '../lib/supabase'
import { Err, useIsMobile } from '../lib/ui'
import BirthGender, { BirthField, GenderField, checkBG, emptyBG, type BG } from '../components/BirthGender'

export default function Login() {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [bg, setBg] = useState<BG>(emptyBG)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const google = async () => {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setErr(authErrMsg(error))
  }
  const go = (m: 'in' | 'up' | 'reset') => (e: React.MouseEvent) => { e.preventDefault(); setMode(m); setErr(''); setInfo('') }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setInfo('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('اكتب إيميل صحيح.')
    if (mode !== 'reset' && pw.length < 8) return setErr('كلمة السر لازم تكون 8 أحرف على الأقل.')
    if (mode === 'up' && name.trim().length < 2) return setErr('اكتب اسمك.')
    if (mode === 'up' && pw !== pw2) return setErr('كلمتا السر مش متطابقتين.')
    const chk = mode === 'up' ? checkBG(bg) : {}
    if (mode === 'up' && chk.error) return setErr(chk.error)
    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw new Error('الإيميل أو كلمة السر غير صحيحة.')
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name.trim(), birth_date: chk.iso, gender: bg.gender }, emailRedirectTo: window.location.origin } })
        if (error) throw error
        // Supabase بيرجّع نجاح وهمي لو الإيميل مسجّل قبل كده (identities فاضية)
        if (data.user && (data.user.identities?.length ?? 1) === 0) throw new Error('already registered')
        if (!data.session) setInfo('بعتنالك رسالة على الإيميل. دوس على رابط التأكيد اللي فيها وهتدخل حسابك على طول. لو ماوصلتش شوف الـ Spam.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setInfo('لو الإيميل مسجّل عندنا هيوصلك رابط لتغيير كلمة السر.')
      }
    } catch (e) { setErr(authErrMsg(e)) }
    setBusy(false)
  }
  const title = mobile ? (mode === 'in' ? 'تسجيل الدخول' : mode === 'up' ? 'إنشاء حساب' : 'استرجاع كلمة السر') : (mode === 'in' ? 'أهلًا بعودتك' : mode === 'up' ? 'إنشاء حساب جديد' : 'استرجاع كلمة السر')
  const inp = { minHeight: mobile ? 48 : 44 }

  const form = (
    <form className={mobile ? 'crd' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 14 : 14, padding: mobile ? 14 : '18px 32px 0' }} onSubmit={submit}>
      <b style={{ fontSize: mobile ? 20 : 22, textAlign: mobile ? undefined : 'center' }}>{title}</b>
      {mode === 'up' && !mobile ? (<>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <label className="col" style={{ gap: 6 }}><b>الاسم</b><input className="in" style={inp} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="col" style={{ gap: 6 }}><b>البريد الإلكتروني</b><input className="in" style={inp} type="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        </div>
        <label className="col" style={{ gap: 6 }}><b>كلمة السر</b><input className="in" style={inp} type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        <label className="col" style={{ gap: 6 }}><b>تأكيد كلمة السر</b><input className="in" style={inp} type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
        <GenderField value={bg} onChange={setBg} minHeight={inp.minHeight} />
        <BirthField value={bg} onChange={setBg} minHeight={inp.minHeight} />
      </>) : (<>
      {mode === 'up' && <label className="col" style={{ gap: 6 }}><b>الاسم</b><input className="in" style={inp} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
      <label className="col" style={{ gap: 6 }}><b>البريد الإلكتروني</b><input className="in" style={inp} type="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {mode !== 'reset' && <label className="col" style={{ gap: 6 }}><b>كلمة السر</b><input className="in" style={inp} type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>}
      {mode === 'up' && <label className="col" style={{ gap: 6 }}><b>تأكيد كلمة السر</b><input className="in" style={inp} type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>}
        {mode === 'up' && <BirthGender value={bg} onChange={setBg} minHeight={inp.minHeight} />}
      </>)}
      <Err>{err}</Err>
      {info && <div className="okmsg">{info}</div>}
      <button className={'btn p' + (mobile ? ' prim' : '')} disabled={busy}>{busy ? '…' : mode === 'in' ? 'دخول' : mode === 'up' ? 'إنشاء الحساب' : 'إرسال الرابط'}</button>
      {mode === 'in' && <a href="#" onClick={go('reset')} style={{ textAlign: 'center', fontSize: 14 }}>نسيت كلمة السر؟</a>}
      {mobile && mode === 'in' && (<>
        <div className="row mut" style={{ gap: 12 }}><span style={{ flex: 1, height: 1, background: '#E4E4E7' }} />أو<span style={{ flex: 1, height: 1, background: '#E4E4E7' }} /></div>
        <button type="button" className="btn line prim" style={{ gap: 10 }} onClick={google}>
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, fontFamily: 'Arial,sans-serif' }}>G</span>
          تسجيل الدخول بحساب Google
        </button>
      </>)}
      {!mobile && mode === 'in' && <div className="hr" />}
      {!mobile && mode === 'in' && <button type="button" className="btn" style={{ gap: 10, background: '#2B2B2E', color: '#fff', border: 0 }} onClick={google}>
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', color: '#111111', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, fontFamily: 'Arial,sans-serif' }}>G</span>
          تسجيل الدخول بحساب Google
        </button>}
      {mode === 'in'
        ? <div className="mut" style={{ textAlign: 'center', fontSize: 14 }}>ليس لديك حساب؟ <a href="#" onClick={go('up')}><b>أنشئ حسابًا الآن</b></a></div>
        : <div className="mut" style={{ textAlign: 'center', fontSize: 14 }}><a href="#" onClick={go('in')}><b>رجوع لتسجيل الدخول</b></a></div>}
    </form>
  )

  if (mobile) {
    return (
      <div className="mroot"><main className="mmain"><div className="col" style={{ gap: 16, padding: '16px 4px' }}>
        <div className="col" style={{ alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <div className="av" style={{ width: 72, height: 72, background: 'var(--brand)', borderRadius: 20, fontSize: 28 }}>ج</div>
          <b style={{ fontSize: 28 }}>جمعتنا</b>
          <span className="mut" style={{ fontSize: 14 }}>مجموعاتك وأصدقاؤك في تطبيق واحد</span>
        </div>
        {form}
      </div></main></div>
    )
  }
  return (
    <div dir="ltr" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F1F1F1' }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'stretch', width: '100%', maxWidth: 1180, minHeight: 'min(620px, calc(100vh - 48px))' }}>
        <div dir="rtl" className="col" style={{ width: mode === 'up' ? 520 : 420, flex: 'none', transition: 'width .2s', gap: 0, justifyContent: 'center', padding: '44px 0 36px', background: '#fff', border: '1px solid #E4E4E7', borderRadius: 18, boxShadow: '0 10px 40px rgba(0,0,0,.06)' }}>
          {mode !== 'up' && <div className="col" style={{ alignItems: 'center', gap: 10, padding: '0 28px' }}>
            <div className="av" style={{ width: 56, height: 56, background: 'var(--brand)', fontSize: 28 }}>ج</div>
            <b style={{ fontSize: 24 }}>جمعتنا</b>
          </div>}
          {form}
        </div>
        <NetworkMap />
      </div>
    </div>
  )
}

// واجهة جانبية متحركة: مدارات أصدقاء + كروت زجاجية عايمة (تصميم أصلي)
const R = 600
const AV = [
  { ch: 'ن', c: '#16A085', a: -50, r: 190, s: 58, on: true }, { ch: 'أ', c: '#E67E22', a: 15, r: 270, s: 48, on: false },
  { ch: 'م', c: '#8E44AD', a: 105, r: 190, s: 62, on: true }, { ch: 'س', c: '#2980B9', a: 175, r: 270, s: 50, on: true },
  { ch: 'ك', c: '#C0392B', a: 235, r: 110, s: 46, on: false }, { ch: 'ي', c: '#27AE60', a: 320, r: 110, s: 46, on: true },
  { ch: 'ح', c: '#D35400', a: -130, r: 190, s: 46, on: false }, { ch: 'ر', c: '#2C3E50', a: 62, r: 270, s: 44, on: false },
]
const pos = (a: number, r: number) => ({ x: 50 + (r * Math.cos((a * Math.PI) / 180)) / R * 100, y: 50 + (r * Math.sin((a * Math.PI) / 180)) / R * 100 })
const glass: React.CSSProperties = { position: 'absolute', background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid #E4E4E7', boxShadow: '0 8px 26px rgba(0,0,0,.10)', borderRadius: 16, color: '#111111', padding: '10px 14px', fontSize: 13, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }

function NetworkMap() {
  return (
    <div dir="rtl" className="jhero">
      <div style={{ textAlign: 'center', color: '#111111', padding: '0 24px 8px' }}>
        <b style={{ fontSize: 34, lineHeight: 1.4 }}>لمّة أصحابك في مكان واحد</b>
        <div style={{ opacity: .6, fontSize: 16, marginTop: 6 }}>مجموعات، أصدقاء، ودردشة… كل اللي يخلّيك قريب من ناسك.</div>
      </div>
      <div className="jstage">
        <svg viewBox={`0 0 ${R} ${R}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          {[110, 190, 270].map((r) => <circle key={r} cx={R / 2} cy={R / 2} r={r} fill="none" stroke="#D0D0D5" strokeWidth="1.200" strokeDasharray="3 7" />)}
          {AV.map((v, i) => { const p = pos(v.a, v.r); return <line key={i} className="jline" x1={R / 2} y1={R / 2} x2={(p.x / 100) * R} y2={(p.y / 100) * R} stroke="#B4B4BB" strokeWidth="1.400" strokeDasharray="4 8" style={{ animationDelay: `${i * -0.7}s` }} /> })}
        </svg>
        <div className="jcore"><span>ج</span></div>
        {AV.map((v, i) => { const p = pos(v.a, v.r); return (
          <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)' }}>
            <div className="jfloat" style={{ animationDelay: `${i * -0.9}s`, position: 'relative' }}>
              <span style={{ width: v.s, height: v.s, borderRadius: '50%', background: `linear-gradient(145deg,${v.c},${v.c}CC)`, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: v.s * 0.42, boxShadow: '0 8px 22px rgba(0,0,0,.18), 0 0 0 3px #fff' }}>{v.ch}</span>
              {v.on && <span style={{ position: 'absolute', bottom: 1, insetInlineEnd: 1, width: 13, height: 13, borderRadius: '50%', background: '#31A24C', boxShadow: '0 0 0 3px #fff' }} />}
            </div>
          </div>) })}
        <div className="jfloat" style={{ ...glass, top: '3%', right: '-4%', animationDelay: '-1s' }}><span style={{ fontSize: 18 }}>💬</span><span><b>نورة</b><br />هتيجي لمّة الجمعة؟</span></div>
        <div className="jfloat" style={{ ...glass, bottom: '16%', left: '-8%', animationDelay: '-2.4s' }}><span style={{ fontSize: 18 }}>👥</span><span><b>مطورو مصر</b><br /><span style={{ opacity: .7 }}>1.2K عضو</span></span></div>
        <div className="jfloat" style={{ ...glass, top: '9%', left: '-4%', animationDelay: '-3.5s' }}><span style={{ fontSize: 18 }}>🔔</span><span>أحمد قبل طلب صداقتك</span></div>
      </div>
    </div>
  )
}
