import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Check, Err } from '../lib/ui'

export default function Profile() {
  const { session, profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  if (!profile) return null
  const prem = isPremium(profile)

  const save = async (patch: { name?: string; avatar_url?: string }) => {
    setErr(''); setOk(''); setBusy(true)
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setOk('تم الحفظ.'); refresh()
  }
  const pick = async (f?: File | null) => {
    if (!f) return
    try { await save({ avatar_url: await uploadImage(f, session!.user.id) }) } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div className="col">
      <div className="card col" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Avatar name={profile.name} url={profile.avatar_url} size={84} />
        <div className="row" style={{ gap: 6 }}>{prem && <Check />}<b style={{ fontSize: 20 }}>{profile.name}</b></div>
        <span className="mut" dir="ltr">{session?.user.email}</span>
        <span className="pill">{prem ? `حساب مميز${profile.plan_until ? ' حتى ' + new Date(profile.plan_until).toLocaleDateString('ar-EG') : ''}` : 'حساب مجاني'}</span>
        {!prem && <Link className="btn p sm" to="/plans">ترقية الحساب</Link>}
      </div>
      <div className="card col">
        <b>تعديل البيانات</b>
        <input className="in" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label className="btn" style={{ cursor: 'pointer' }}>تغيير الصورة<input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <Err>{err}</Err>{ok && <div className="okmsg">{ok}</div>}
        <button className="btn p" disabled={busy || name.trim().length < 1 || name.trim() === profile.name} onClick={() => save({ name: name.trim() })}>حفظ الاسم</button>
      </div>
      <button className="btn line danger" onClick={signOut}>تسجيل الخروج</button>
    </div>
  )
}
