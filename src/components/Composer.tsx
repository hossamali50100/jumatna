import { useState } from 'react'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err } from './ui'

export default function Composer({ groupId, onPosted }: { groupId: string; onPosted: () => void }) {
  const { session } = useAuth()
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setErr('')
    try {
      const uid = session!.user.id
      const image_url = file ? await uploadImage(file, uid) : null
      const { error } = await supabase.from('posts').insert({ group_id: groupId, author_id: uid, body: text, image_url })
      if (error) throw error
      setBody(''); setFile(null); onPosted()
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  return (
    <div className="card col" style={{ gap: 8 }}>
      <textarea className="in" placeholder="اكتب حاجة للمجموعة…" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      <div className="row">
        <label className="btn sm" style={{ cursor: 'pointer' }}>
          📷 صورة
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <span className="mut grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>}
        <span className="grow" />
        <button className="btn p" disabled={busy || !body.trim()} onClick={submit}>{busy ? 'جاري النشر…' : 'نشر'}</button>
      </div>
      <Err>{err}</Err>
    </div>
  )
}
