import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends } from '../lib/friends'
import { Avatar, Err, Name } from '../lib/ui'

const MAX = 20 // أقصى عدد أشخاص في المرة الواحدة

// نافذة إعادة توجيه رسالة: تختار صديق أو أكتر وتبعتلهم كلهم مرة واحدة
export default function ForwardModal({ msg, onClose }: { msg: { body: string; image_url: string | null; audio_url?: string | null; audio_secs?: number | null }; onClose: () => void }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels } = useFriends()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const list = rels.filter((r) => r.status === 'accepted' && (!q.trim() || (r.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase())))

  const toggle = (id: string) => {
    if (sent.has(id)) return
    setErr(''); setDone('')
    setPick((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else if (n.size >= MAX) { setErr(`تقدر تختار ${MAX} شخص بالكتير في المرة الواحدة.`); return s }
      else n.add(id)
      return n
    })
  }

  const sendAll = async () => {
    const to = [...pick]
    if (!to.length || busy) return
    setBusy(true); setErr(''); setDone('')
    const row = (r: string) => ({ sender_id: uid, recipient_id: r, body: msg.body, image_url: msg.image_url, ...(msg.audio_url ? { audio_url: msg.audio_url, audio_secs: msg.audio_secs } : {}) })
    // بنبعت لكل شخص لوحده عشان لو واحد حاظرك الباقي يوصلهم عادي
    const res = await Promise.all(to.map(async (r) => ({ r, error: (await supabase.from('dm_messages').insert(row(r))).error })))
    setBusy(false)
    const ok = res.filter((x) => !x.error).map((x) => x.r)
    const bad = res.filter((x) => x.error)
    setSent((s) => new Set([...s, ...ok]))
    setPick(new Set(bad.map((x) => x.r)))
    if (bad.length) setErr(`ما وصلتش لـ ${bad.length}: ${errMsg(bad[0].error!)}`)
    if (ok.length) setDone(`اتبعتت لـ ${ok.length} ${ok.length === 1 ? 'شخص' : 'أشخاص'} ✓`)
  }

  return createPortal(
    <div className="fw-ov" onClick={onClose}>
      <div className="fw" role="dialog" aria-label="إعادة توجيه" onClick={(e) => e.stopPropagation()}>
        <div className="fw-h"><span>إعادة توجيه إلى…</span><button className="btn sm" onClick={onClose} aria-label="إغلاق">✕</button></div>
        <div style={{ padding: '10px 14px 0' }}><input className="in" placeholder="ابحث عن صديق" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <div className="fw-l">
          {list.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 18 }}>مفيش أصدقاء.</div>}
          {list.map((r) => {
            const isSent = sent.has(r.other), on = pick.has(r.other)
            return (
              <label key={r.other} className={'fw-r' + (on ? ' on' : '')} style={{ cursor: isSent ? 'default' : 'pointer' }}>
                <Avatar name={r.profile?.name} url={r.profile?.avatar_url} size={40} />
                <div className="grow"><Name p={r.profile} /></div>
                {isSent ? <span className="mut">تم ✓</span>
                  : <input type="checkbox" className="fw-ck" checked={on} onChange={() => toggle(r.other)} aria-label={`اختيار ${r.profile?.name ?? ''}`} />}
              </label>
            )
          })}
        </div>
        <div className="fw-f">
          <Err>{err}</Err>
          {done && <div style={{ color: '#15803D', fontSize: 14, fontWeight: 700 }}>{done}</div>}
          <div className="row" style={{ gap: 8 }}>
            {pick.size > 0 && <button className="btn sm" onClick={() => setPick(new Set())}>إلغاء الاختيار</button>}
            <span className="grow" />
            {sent.size > 0 && pick.size === 0
              ? <button className="btn p" onClick={onClose}>تم</button>
              : <button className="btn p" disabled={!pick.size || busy} onClick={sendAll}>{busy ? 'جاري الإرسال…' : pick.size ? `إرسال (${pick.size})` : 'اختار شخص أو أكتر'}</button>}
          </div>
        </div>
      </div>
    </div>, document.body)
}
