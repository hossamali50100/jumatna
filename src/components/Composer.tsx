import { useEffect, useRef, useState } from 'react'
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
  const [sel, setSel] = useState<string[] | null>(defaultGroup ? [defaultGroup] : null)
  const [pick, setPick] = useState(false)
  const pref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const f = (e: MouseEvent) => { if (pref.current && !pref.current.contains(e.target as Node)) setPick(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [])
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = (sel ?? [targets[0]?.id ?? PERSONAL]).filter((id) => targets.some((t) => t.id === id))
  const toggleT = (id: string) => setSel((cur) => { const base = (cur ?? [targets[0]?.id ?? PERSONAL]); return base.includes(id) ? (base.length > 1 ? base.filter((x) => x !== id) : base) : [...base, id] })
  const names = targets.filter((t) => chosen.includes(t.id)).map((t) => t.name).join('، ')

  const submit = async () => {
    const text = body.trim()
    if (!text || busy || !targets.length) return
    setBusy(true); setErr('')
    try {
      const uid = session!.user.id
      const image_url = file ? await uploadImage(file, uid) : null
      const { error } = await supabase.from('posts').insert(chosen.map((id) => ({ group_id: id || null, author_id: uid, body: text, image_url })))
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
        <b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names}</b>
      </div>
      <textarea className="in" autoFocus placeholder="اكتب شيئًا..." value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      <div className="row">
        <label className="btn sm" style={{ cursor: 'pointer' }}><Icon n="image" s={18} />صورة
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {targets.length > 1 && (
          <div ref={pref} style={{ position: 'relative' }}>
            <button type="button" className="btn sm" aria-expanded={pick} onClick={() => setPick(!pick)}><Icon n="groups" s={18} />مكان النشر ({chosen.length})</button>
            {pick && (
              <div className="pop" style={{ top: 'auto', bottom: 'calc(100% + 6px)', minWidth: 260, maxHeight: 280, overflowY: 'auto' }}>
                <b style={{ display: 'block', padding: '6px 10px' }}>انشر في:</b>
                {targets.map((t) => (
                  <label key={t.id} className="row" style={{ padding: '8px 10px', cursor: 'pointer', gap: 10 }}>
                    <input type="checkbox" checked={chosen.includes(t.id)} onChange={() => toggleT(t.id)} style={{ width: 20, height: 20, accentColor: 'var(--brand)' }} />
                    <span>{t.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {file && <span className="mut grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>}
        <span className="grow" />
        <button className="btn sm" onClick={() => { setOpen(false); setErr('') }}>إلغاء</button>
        <button className="btn p sm" disabled={busy || !body.trim()} onClick={submit}>{busy ? 'جاري النشر…' : 'نشر'}</button>
      </div>
      <Err>{err}</Err>
    </div>
  )
}
