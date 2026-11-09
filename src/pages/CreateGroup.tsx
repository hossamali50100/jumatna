import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err } from '../lib/ui'

export default function CreateGroup() {
  const { session, profile } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public')
  const [cover, setCover] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (name.trim().length < 2) return setErr('اسم المجموعة قصير.')
    setBusy(true)
    try {
      const uid = session!.user.id
      const cover_url = cover ? await uploadImage(cover, uid) : null
      const { data, error } = await supabase.from('groups').insert({ owner_id: uid, name: name.trim(), description: description.trim(), privacy, cover_url }).select('id').single()
      if (error) throw error
      nav(`/g/${data.id}`)
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  return (
    <form className="card col" style={{ gap: 14 }} onSubmit={submit}>
      <b style={{ fontSize: 20 }}>مجموعة جديدة</b>
      <div className="okmsg">{isPremium(profile) ? 'حسابك مميز: تقدر تنشئ لحد 10 مجموعات.' : <>الحساب المجاني ينشئ مجموعة واحدة. <Link to="/plans"><u>رقّي حسابك</u></Link> لإنشاء حتى 10.</>}</div>
      <input className="in" placeholder="اسم المجموعة" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <textarea className="in" placeholder="وصف قصير (اختياري)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      <select className="in" value={privacy} onChange={(e) => setPrivacy(e.target.value as 'public' | 'private')}>
        <option value="public">عامة — أي حد ينضم ويشوف البوستات</option>
        <option value="private">خاصة — الانضمام بموافقتك</option>
      </select>
      <label className="btn" style={{ cursor: 'pointer' }}>{cover ? cover.name : '📷 صورة الغلاف (اختياري)'}
        <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
      </label>
      <Err>{err}</Err>
      <button className="btn p" disabled={busy}>{busy ? '…' : 'إنشاء المجموعة'}</button>
    </form>
  )
}
