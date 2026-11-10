import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err } from '../lib/ui'

// صفحة تعديل الملف الشخصي (صفحة لوحدها) + حذف الحساب
export default function EditProfile() {
  const { profile, refresh, signOut } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState(profile?.name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  if (!profile) return null

  const save = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.from('profiles').update({ name: name.trim(), bio: bio.trim() }).eq('id', profile.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    await refresh(); nav('/profile')
  }

  const deleteAccount = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('request_account_deletion')
    if (error) { setBusy(false); setConfirmDel(false); return setErr(errMsg(error)) }
    await signOut()
  }

  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crd col">
        <b style={{ fontSize: 20 }}>تعديل الملف الشخصي</b>
        <label className="col" style={{ gap: 6 }}><span className="mut">الاسم</span>
          <input className="in" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="col" style={{ gap: 6 }}><span className="mut">نبذة شخصية (اختياري)</span>
          <textarea className="in" value={bio} maxLength={300} placeholder="اكتب نبذة قصيرة عنك…" onChange={(e) => setBio(e.target.value)} /></label>
        <div className="mut">لتغيير الصورة أو الغلاف ارجع لصفحتك واضغط على أيقونة الصورة أو "تغيير الغلاف".</div>
        <Err>{err}</Err>
        <button className="btn p" disabled={busy || name.trim().length < 1} onClick={save}>{busy ? 'جاري الحفظ…' : 'حفظ'}</button>
      </div>
      <div className="crd col">
        <button className="btn line danger" onClick={() => setConfirmDel(true)}>حذف الحساب</button>
      </div>

      {confirmDel && (
        <div role="dialog" aria-modal="true" onClick={() => !busy && setConfirmDel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 16 }}>
          <div className="crd col" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%' }}>
            <b style={{ fontSize: 19 }}>حذف الحساب</b>
            <div style={{ lineHeight: 1.8 }}>هيتم حذف حسابك خلال 24 ساعة، وهيتم تسجيل خروجك دلوقتي.<br /><span className="mut">لو سجّلت دخول تاني قبل ما تعدي الـ 24 ساعة، الحذف هيتلغي.</span></div>
            <div className="row">
              <button className="btn danger grow" disabled={busy} onClick={deleteAccount}>{busy ? '…' : 'تأكيد الحذف'}</button>
              <button className="btn grow" disabled={busy} onClick={() => setConfirmDel(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
