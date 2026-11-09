import { useState } from 'react'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Err, Icon } from '../lib/ui'

type G = { id: string; name: string }
const PERSONAL = ''

// groups: المجموعات اللي ينفع ينشر فيها. allowPersonal: يضيف اختيار "منشور شخصي على صفحتي"
export default function Composer({ groups, defaultGroup, allowPersonal, onPosted }: { groups: G[]; defaultGroup?: string; allowPersonal?: boolean; onPosted: () => void }) {
  const { session, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const targets: G[] = [...(allowPersonal ? [{ id: PERSONAL, name: 'منشور شخصي على صفحتي' }] : []), ...groups]
  const [gid, setGid] = useState<string | null>(defaultGroup ?? null)
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const target = gid !== null && targets.some((t) => t.id === gid) ? gid : (targets[0]?.id ?? PERSONAL)

  const submit = async () => {
    const text = body.trim()
    if (!text || busy || !targets.length) return
    setBusy(true); setErr('')
    try {
      const uid = session!.user.id
      const image_url = file ? await uploadImage(file, uid) : null
      const { error } = await supabase.from('posts').insert({ group_id: target || null, author_id: uid, body: text, image_url })
      if (error) throw error
      setBody(''); setFile(null); setOpen(false); onPosted()
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  if (!targets.length) return null
  if (!open) {
    return (
      <button className="crd row" onClick={() => setOpen(true)} style={{ width: '100%', fontFamily: 'inherit', textAlign: 'start', cursor: 'pointer', color: '#55555C' }}>
        <Avatar name={profile?.name} url={profile?.avatar_url} size={44} />
        <span style={{ flex: 1, background: '#EFEFF1', borderRadius: 22, padding: '11px 16px' }}>{allowPersonal ? 'اكتب شيئًا...' : 'اكتب شيئًا للمجموعة...'}</span>
        <Icon n="image" />
      </button>
    )
  }
  return (
    <div className="crd col" style={{ gap: 10 }}>
      <div className="row">
        <Avatar name={profile?.name} url={profile?.avatar_url} size={40} />
        {targets.length > 1
          ? <select className="in grow" value={target} onChange={(e) => setGid(e.target.value)} aria-label="مكان النشر">{targets.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          : <b className="grow">{targets[0].name}</b>}
      </div>
      <textarea className="in" autoFocus placeholder="اكتب شيئًا..." value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      <div className="row">
        <label className="btn sm" style={{ cursor: 'pointer' }}><Icon n="image" s={18} />صورة
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <span className="mut grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>}
        <span className="grow" />
        <button className="btn sm" onClick={() => { setOpen(false); setErr('') }}>إلغاء</button>
        <button className="btn p sm" disabled={busy || !body.trim()} onClick={submit}>{busy ? 'جاري النشر…' : 'نشر'}</button>
      </div>
      <Err>{err}</Err>
    </div>
  )
}
