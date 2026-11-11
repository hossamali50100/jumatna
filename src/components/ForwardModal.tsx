import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends } from '../lib/friends'
import { Avatar, Err, Name } from '../lib/ui'

// نافذة اختيار صديق لإعادة توجيه رسالة له
export default function ForwardModal({ msg, onClose }: { msg: { body: string; image_url: string | null }; onClose: () => void }) {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels } = useFriends()
  const [q, setQ] = useState(''); const [sent, setSent] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(''); const [err, setErr] = useState('')
  const list = rels.filter((r) => r.status === 'accepted' && (!q.trim() || (r.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase())))
  const send = async (to: string) => {
    setBusy(to); setErr('')
    const { error } = await supabase.from('dm_messages').insert({ sender_id: uid, recipient_id: to, body: msg.body, image_url: msg.image_url })
    setBusy('')
    if (error) return setErr(errMsg(error))
    setSent((s) => new Set(s).add(to))
  }
  return createPortal(
    <div className="fw-ov" onClick={onClose}>
      <div className="fw" role="dialog" aria-label="إعادة توجيه" onClick={(e) => e.stopPropagation()}>
        <div className="fw-h"><span>إعادة توجيه إلى…</span><button className="btn sm" onClick={onClose} aria-label="إغلاق">✕</button></div>
        <div style={{ padding: '10px 14px 0' }}><input className="in" placeholder="ابحث عن صديق" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <div style={{ padding: '0 14px' }}><Err>{err}</Err></div>
        <div className="fw-l">
          {list.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 18 }}>مفيش أصدقاء.</div>}
          {list.map((r) => (
            <div key={r.other} className="fw-r">
              <Avatar name={r.profile?.name} url={r.profile?.avatar_url} size={40} />
              <div className="grow"><Name p={r.profile} /></div>
              {sent.has(r.other) ? <span className="mut">تم ✓</span> : <button className="btn sm p" disabled={busy === r.other} onClick={() => send(r.other)}>إرسال</button>}
            </div>
          ))}
        </div>
      </div>
    </div>, document.body)
}
