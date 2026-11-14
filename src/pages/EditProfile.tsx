import { MI } from '../components/MenuIcons'
import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err } from '../lib/ui'

// إعدادات الملف الشخصي: الاسم (مرة كل 30 يوم) والنبذة وخصوصية الحساب + حذف الحساب.
// تاريخ الميلاد والجنس مش بيتغيّروا ومش بيظهروا هنا.
export default function EditProfile() {
  const { profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [ok, setOk] = useState('')
  if (!profile) return null

  // الاسم: مرة كل 30 يوم
  const DAY = 86400e3
  const nextChange = profile.name_changed_at ? new Date(profile.name_changed_at).getTime() + 30 * DAY : 0
  const daysLeft = Math.max(0, Math.ceil((nextChange - Date.now()) / DAY))
  const nameLocked = daysLeft > 0
  const nameChanged = name.trim() !== profile.name

  const patch = async (p: Record<string, unknown>, msg: string) => {
    setErr(''); setOk('')
    const { error } = await supabase.from('profiles').update(p).eq('id', profile.id)
    if (error) return setErr(errMsg(error))
    await refresh(); setOk(msg)
  }
  const save = async () => {
    if (nameChanged && !confirm(`تغيير الاسم إلى «${name.trim()}»؟ مش هتقدر تغيّره تاني قبل 30 يوم.`)) return
    setBusy(true)
    const p: Record<string, unknown> = { bio: bio.trim() }
    if (nameChanged) p.name = name.trim()
    await patch(p, 'تم حفظ التعديلات.')
    setBusy(false)
  }

  const deleteAccount = async () => {
    setErr(''); setBusy(true)
    const { error } = await supabase.rpc('request_account_deletion')
    if (error) { setBusy(false); setConfirmDel(false); return setErr(errMsg(error)) }
    await signOut()
  }

  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crd col" style={{ gap: 14 }}>
        <b style={{ fontSize: 20 }}>إعدادات الملف الشخصي</b>

        <label className="col" style={{ gap: 6 }}><span className="mut">الاسم</span>
          <input className="in" value={name} maxLength={60} disabled={nameLocked} onChange={(e) => setName(e.target.value)} />
          <span className="mut" style={{ fontSize: 13 }}>{nameLocked ? `تقدر تغيّر اسمك تاني بعد ${daysLeft} يوم.` : 'تقدر تغيّر اسمك مرة كل 30 يوم.'}</span></label>
        <label className="col" style={{ gap: 6 }}><span className="mut">نبذة شخصية (اختياري)</span>
          <textarea className="in" value={bio} maxLength={300} placeholder="اكتب نبذة قصيرة عنك…" onChange={(e) => setBio(e.target.value)} /></label>
        <div className="mut">لتغيير الصورة أو الغلاف ارجع لصفحتك واضغط على أيقونة الصورة أو "تغيير الغلاف".</div>
        <Err>{err}</Err>{ok && <div className="okmsg">{ok}</div>}
        <button className="btn p" disabled={busy || name.trim().length < 1} onClick={save}>{busy ? 'جاري الحفظ…' : 'حفظ'}</button>
      </div>

      <div className="crd col">
        <b>الخصوصية</b>
        <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!profile.is_locked} style={{ width: 20, height: 20, accentColor: 'var(--brand)' }} onChange={(e) => patch({ is_locked: e.target.checked }, e.target.checked ? 'تم قفل حسابك: الغرباء مش هيشوفوا أصدقاءك ولا مجموعاتك ولا منشوراتك.' : 'تم فتح حسابك.')} />
          <span className="grow"><b className="row" style={{ gap: 6 }}><MI n="lock" s={18} />قفل الحساب</b><span className="mut" style={{ display: 'block', fontSize: 13 }}>الغرباء يشوفوا الاسم والصورة بس. أصدقاءك يشوفوا كل حاجة.</span></span>
        </label>
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
