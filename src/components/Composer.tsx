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
  const [files, setFiles] = useState<File[]>([])
  const [prevs, setPrevs] = useState<string[]>([])
  useEffect(() => {
    const us = files.map((f) => URL.createObjectURL(f)); setPrevs(us)
    return () => us.forEach((u) => URL.revokeObjectURL(u))
  }, [files])
  const addFiles = (list: FileList | null) => {
    if (!list) return
    const room = 4 - files.length
    const add = Array.from(list).slice(0, Math.max(0, room))
    if (list.length > room) setErr('الحد الأقصى 4 صور في المنشور الواحد.'); else setErr('')
    if (add.length) setFiles((cur) => [...cur, ...add])
  }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const chosen = (sel ?? [targets[0]?.id ?? PERSONAL]).filter((id) => targets.some((t) => t.id === id))
  const toggleT = (id: string) => setSel((cur) => { const base = (cur ?? [targets[0]?.id ?? PERSONAL]); return base.includes(id) ? (base.length > 1 ? base.filter((x) => x !== id) : base) : [...base, id] })
  const names = targets.filter((t) => chosen.includes(t.id)).map((t) => t.name).join('، ')

  const submit = async () => {
    const text = body.trim()
    if (!text || busy || !targets.length) return
    setBusy(true); setErr('')
    try {
      const uid = session!.user.id
      const urls = await Promise.all(files.map((f) => uploadImage(f, uid)))
      // الصورة الأولى في image_url، والباقي في extra_images (تحديث 036)؛ لو صورة واحدة منبعتش العمود الجديد
      const extra = urls.length > 1 ? { extra_images: urls.slice(1) } : {}
      const t0 = new Date(Date.now() - 2000).toISOString()
      const { error } = await supabase.from('posts').insert(chosen.map((id) => ({ group_id: id || null, author_id: uid, body: text, image_url: urls[0] ?? null, ...extra })))
      if (error) throw error
      // لو أي بوست منهم بانتظار موافقة مشرف (تحديث 037) نقول للكاتب (لو العمود مش موجود نتجاهل)
      const pn = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', uid).eq('approval', 'pending').gte('created_at', t0)
      if (!pn.error && (pn.count ?? 0) > 0) { setNote('منشورك اتبعت لمشرف المجموعة، وهيظهر للأعضاء بعد ما يوافق.'); setTimeout(() => setNote(''), 12000) }
      setBody(''); setFiles([]); setOpen(false); onPosted()
    } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  if (!targets.length) return null
  if (!open) {
    return (<>
      {note && <div className="crd" style={{ background: '#ECFDF3', color: '#166534', fontWeight: 600 }}>✓ {note}</div>}
      <button className="crd row" onClick={() => setOpen(true)} style={{ width: '100%', fontFamily: 'inherit', textAlign: 'start', cursor: 'pointer', color: '#55555C' }}>
        <Avatar name={profile?.name} url={profile?.avatar_url} size={44} />
        <span style={{ flex: 1, background: '#EFEFF1', borderRadius: 22, padding: '11px 16px' }}>{allowPersonal ? 'اكتب شيئًا...' : 'اكتب شيئًا للمجموعة...'}</span>
        <Icon n="image" />
      </button>
    </>)
  }
  return (
    <div className="crd col" style={{ gap: 10 }}>
      <div className="row">
        <Avatar name={profile?.name} url={profile?.avatar_url} size={40} />
        <b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names}</b>
      </div>
      <textarea className="in" autoFocus placeholder="اكتب شيئًا..." value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      {prevs.length > 0 && <div className={'cp-grid n' + prevs.length}>{prevs.map((u, i) => <div key={u} className="cp-prev"><img src={u} alt="معاينة الصورة" /><button type="button" aria-label="إزالة الصورة" onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}>✕</button></div>)}</div>}
      <div className="row">
        {files.length < 4 && <label className="btn sm" style={{ cursor: 'pointer' }}><Icon n="image" s={18} />{files.length ? `إضافة صورة (${files.length}/4)` : 'صور'}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </label>}
        {targets.length > 1 && (
          <div ref={pref} style={{ position: 'relative' }}>
            <button type="button" className="btn sm" aria-expanded={pick} onClick={() => setPick(!pick)}><Icon n="groups" s={18} />مكان النشر ({chosen.length})</button>
            {pick && (
              <div className="pop" style={{ minWidth: 260, maxHeight: 280, overflowY: 'auto' }}>
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
        <span className="grow" />
        <button className="btn sm" onClick={() => { setOpen(false); setErr('') }}>إلغاء</button>
        <button className="btn p sm" disabled={busy || !body.trim()} onClick={submit}>{busy ? 'جاري النشر…' : 'نشر'}</button>
      </div>
      <Err>{err}</Err>
    </div>
  )
}
