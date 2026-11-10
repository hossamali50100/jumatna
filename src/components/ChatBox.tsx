import { useEffect, useRef, useState } from 'react'
import { errMsg } from '../lib/supabase'
import { Err, Icon, timeAgo } from '../lib/ui'

export type ChatMsg = { id: string; mine: boolean; label?: string; body: string; image_url: string | null; created_at: string }

// واجهة شات مشتركة (دعم + رسائل مباشرة): فقاعات + إرسال نص/صورة
export default function ChatBox({ msgs, onSend, empty, height = 420 }: { msgs: ChatMsg[]; onSend: (text: string, file: File | null) => Promise<void>; empty: string; height?: number }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = async () => {
    const text = body.trim()
    if ((!text && !file) || busy) return
    setBusy(true); setErr('')
    try { await onSend(text, file); setBody(''); setFile(null) } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 8, height, overflowY: 'auto', padding: 12, background: '#F7F7F8', borderRadius: 14 }}>
        {msgs.length === 0 && <div className="mut" style={{ textAlign: 'center', margin: 'auto' }}>{empty}</div>}
        {msgs.map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
            <div style={{ background: m.mine ? '#111111' : '#fff', color: m.mine ? '#fff' : '#111111', border: m.mine ? 0 : '1px solid #E4E4E7', borderRadius: 16, padding: '8px 14px', lineHeight: 1.7 }}>
              {m.label && <div style={{ fontSize: 12, fontWeight: 700, opacity: .7 }}>{m.label}</div>}
              {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer noopener"><img src={m.image_url} alt="" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', marginBottom: m.body ? 6 : 0 }} /></a>}
              {m.body && <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>}
            </div>
            <div className="mut" style={{ fontSize: 12, padding: '2px 6px' }}>{timeAgo(m.created_at)}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <Err>{err}</Err>
      {file && <div className="mut">الصورة: {file.name} <button className="btn sm" onClick={() => setFile(null)}>إزالة</button></div>}
      <div className="row">
        <label className="btn" style={{ cursor: 'pointer' }} aria-label="إرفاق صورة"><Icon n="image" s={20} />
          <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <input className="in grow" value={body} maxLength={2000} placeholder="اكتب رسالتك…" onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
        <button className="btn p" disabled={busy || (!body.trim() && !file)} onClick={send}>{busy ? '…' : 'إرسال'}</button>
      </div>
    </div>
  )
}
