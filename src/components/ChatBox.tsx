import { useEffect, useRef, useState } from 'react'
import { errMsg } from '../lib/supabase'
import { Avatar, Err, Icon, timeAgo } from '../lib/ui'
import { VOICE_MAX, canRecord, pickType } from '../lib/voice'

export type ChatMsg = { id: string; mine: boolean; tick?: 'sending' | 'sent' | 'delivered' | 'read'; tickTitle?: string; label?: string; body: string; image_url: string | null; audio_url?: string | null; audio_secs?: number | null; created_at: string; edited?: boolean; avatar?: string | null; rx?: Record<string, number>; myRx?: string | null }
// علامات الرسالة (زي واتساب): ✓ اتبعتت — ✓✓ وصلت — ✓✓ خضرا اتقرت
function Ticks({ t }: { t: 'sending' | 'sent' | 'delivered' | 'read' }) {
  const col = t === 'read' ? '#16A34A' : '#8A8D91'
  const two = t === 'delivered' || t === 'read'
  return (
    <svg width="24" height="15" viewBox="0 0 24 14" fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={t === 'read' ? 'تمت القراءة' : t === 'delivered' ? 'وصلت' : t === 'sent' ? 'تم الإرسال' : 'جاري الإرسال'} style={{ direction: 'ltr', opacity: t === 'sending' ? 0.5 : 1 }}>
      <path d="M2 7.5l4 4L13 2.500" />
      {two && <path d="M8 7.500l4 4L19 2.500" />}
    </svg>
  )
}
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '😡']

const EMOJIS = ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','😉','😁','😅','🙂','🤔','😢','😭','😡','😴','🙏','👍','👎','👏','🙌','💪','👌','✌️','🤝','❤️','💔','🔥','🎉','✨','💯','🌹','☕','🎁','😇','🤗','😱','🥳']

// واجهة شات مشتركة (دعم + رسائل مباشرة) على شكل شات فيسبوك: فقاعات + إيموجي + لايك + صورة
const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`

export default function ChatBox({ onEdit, onSendVoice, msgs, onSend, empty, height = 420, error, fill, readOnly, onDelete, onReact, onForward, typing, onTyping, onStopTyping }: { onEdit?: (id: string, body: string) => Promise<void>; onSendVoice?: (blob: Blob, secs: number) => Promise<void>; typing?: string; onTyping?: () => void; onStopTyping?: () => void; onDelete?: (id: string) => Promise<void>; onReact?: (id: string, emoji: string | null) => void; onForward?: (m: ChatMsg) => void; msgs: ChatMsg[]; onSend: (text: string, file: File | null) => Promise<void>; empty: string; height?: number; error?: string; fill?: boolean; readOnly?: boolean }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [editing, setEditing] = useState<ChatMsg | null>(null) // الرسالة اللي بتتعدّل دلوقتي
  const [pop, setPop] = useState<{ m: ChatMsg; kind: 'rx' | 'menu'; x: number; y: number } | null>(null)
  const openPop = (e: React.MouseEvent, m: ChatMsg, kind: 'rx' | 'menu') => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ m, kind, x: Math.min(Math.max(8, r.left - 70), window.innerWidth - 200), y: Math.min(r.bottom + 6, window.innerHeight - 190) })
  }
  const box = useRef<HTMLDivElement>(null)
  // ---- تسجيل رسالة صوتية ----
  const [rec, setRec] = useState(false)
  const [secs, setSecs] = useState(0)
  const mr = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const keep = useRef(false)
  const t0 = useRef(0)
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const stopRec = (send: boolean) => { keep.current = send; clearInterval(tick.current); try { mr.current?.stop() } catch { /* ignore */ } setRec(false) }
  const startRec = async () => {
    setErr('')
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { return setErr('مش قادر أوصل للميكروفون. اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح وجرّب تاني.') }
    try {
      const type = pickType()
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined)
      chunks.current = []; keep.current = false
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const dur = Math.min(VOICE_MAX, Math.max(1, Math.round((Date.now() - t0.current) / 1000)))
        if (!keep.current || !onSendVoice) return
        const blob = new Blob(chunks.current, { type: r.mimeType || type || 'audio/webm' })
        if (!blob.size) return setErr('التسجيل طلع فاضي، جرّب تاني.')
        setBusy(true)
        try { await onSendVoice(blob, dur) } catch (e) { setErr(errMsg(e)) }
        setBusy(false)
      }
      mr.current = r; t0.current = Date.now(); setSecs(0); setRec(true); r.start()
      tick.current = setInterval(() => {
        const n = Math.round((Date.now() - t0.current) / 1000)
        setSecs(n); if (n >= VOICE_MAX) stopRec(true)
      }, 500)
    } catch { stream.getTracks().forEach((t) => t.stop()); setErr('التسجيل الصوتي مش مدعوم على المتصفح ده.') }
  }
  // لو الشات اتقفل والتسجيل شغال: نوقفه من غير إرسال
  useEffect(() => () => { keep.current = false; clearInterval(tick.current); try { mr.current?.state === 'recording' && mr.current.stop() } catch { /* ignore */ } }, [])
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight }, [msgs.length, typing])

  const startEdit = (m: ChatMsg) => { setPop(null); setEditing(m); setBody(m.body); setFile(null); setEmoji(false); setErr(''); setTimeout(() => inp.current?.focus(), 0) }
  const cancelEdit = () => { setEditing(null); setBody('') }
  const saveEdit = async () => {
    const t = body.trim()
    if (!editing || !onEdit || busy) return
    if (!t) return setErr('الرسالة فاضية.')
    if (t === editing.body.trim()) return cancelEdit()
    setBusy(true); setErr('')
    try { await onEdit(editing.id, t); cancelEdit() } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  const send = async (text = body.trim(), f: File | null = file) => {
    if (editing) return saveEdit()
    if ((!text && !f) || busy) return
    setBusy(true); setErr('')
    const prev = body; const prevFile = file
    if (text === body.trim()) setBody('')   // نفضّي الخانة فورًا، ولو فشل الإرسال نرجّع النص
    setFile(null); setEmoji(false); onStopTyping?.()
    try { await onSend(text, f) } catch (e) { setErr(errMsg(e)); if (text === prev.trim()) setBody(prev); setFile(prevFile) }
    setBusy(false)
    inp.current?.focus()
  }
  const addEmoji = (e: string) => { setBody((b) => b + e); inp.current?.focus() }
  const ib: React.CSSProperties = { width: 38, height: 38, borderRadius: '50%', border: 0, background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#111111', flexShrink: 0, fontSize: 22, fontFamily: 'inherit', padding: 0 }

  const tools = (m: ChatMsg) => (
    <span className="cm-tools">
      {onReact && <button type="button" className="cm-tb" title="تفاعل" aria-label="تفاعل" onClick={(e) => openPop(e, m, 'rx')}>☺</button>}
      <button type="button" className="cm-tb" title="المزيد" aria-label="المزيد" onClick={(e) => openPop(e, m, 'menu')}>⋮</button>
    </span>
  )
  const doDelete = async (m: ChatMsg) => { setPop(null); if (!onDelete || !confirm('تلغي إرسال الرسالة دي؟ هتتمسح عند الطرفين.')) return; try { await onDelete(m.id) } catch (e) { setErr(errMsg(e)) } }

  return (
    <div className="col" style={{ gap: 8, ...(fill ? { height: '100%', minHeight: 0 } : {}) }}>
      <div ref={box} className="col" style={{ gap: 3, ...(fill ? { flex: 1, minHeight: 0 } : { height }), overflowY: 'auto', padding: '10px 10px', background: '#fff', borderRadius: 14 }}>
        {msgs.length === 0 && <div className="mut" style={{ textAlign: 'center', margin: 'auto' }}>{empty}</div>}
        {msgs.map((m, i) => {
          const gap = i > 0 && new Date(m.created_at).getTime() - new Date(msgs[i - 1].created_at).getTime() > 30 * 60e3
          return (
            <div key={m.id} className="col" style={{ gap: 3 }}>
              {(gap || i === 0) && <div className="mut" style={{ fontSize: 12, textAlign: 'center', margin: '8px 0 4px' }}>{timeAgo(m.created_at)}</div>}
              <div className="cm-wrap" style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '78%', display: 'flex', alignItems: m.label ? 'flex-end' : 'center', gap: 6, flexDirection: 'row' }}>
              {!m.mine && m.label && <Avatar name={m.label} url={m.avatar} size={30} />}
              {m.mine && !m.id.startsWith('tmp-') && (onReact || onDelete || onForward) && tools(m)}
              <div style={{ minWidth: 0, position: 'relative', marginBottom: m.rx && Object.keys(m.rx).length ? 10 : 0 }}>
                {m.label && <div className="mut" style={{ fontSize: 12, padding: '0 8px' }}>{m.label}</div>}
                {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer noopener" style={{ display: 'block' }}><img src={m.image_url} alt="" style={{ width: 'min(240px,100%)', maxHeight: 280, objectFit: 'cover', borderRadius: 16, display: 'block', marginBottom: m.body ? 3 : 0 }} /></a>}
                {m.audio_url && <div className={'cm-voice' + (m.mine ? ' mine' : '')}><audio controls preload="metadata" src={m.audio_url} /></div>}
                {m.body && !m.audio_url && (/^[\p{Extended_Pictographic}‍️\s]{1,12}$/u.test(m.body)
                  ? <div style={{ fontSize: 34, lineHeight: 1.3, padding: '0 4px' }}>{m.body}</div>
                  : <div style={{ background: m.mine ? 'var(--brand)' : '#EFEFF1', color: m.mine ? '#fff' : '#111111', borderRadius: 18, padding: '8px 14px', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'start' }}>{m.body}</div>)}
                {m.edited && <div className="mut" style={{ fontSize: 11, padding: '1px 8px', textAlign: m.mine ? 'end' : 'start' }}>معدّلة</div>}
                {m.rx && Object.keys(m.rx).length > 0 && (
                  <button type="button" className="cm-rxc" onClick={() => onReact && m.myRx && onReact(m.id, null)} title={m.myRx ? 'دوس لإزالة تفاعلك' : undefined}>
                    {Object.entries(m.rx).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => <span key={e}>{e}</span>)}
                    {Object.values(m.rx).reduce((a, b) => a + b, 0) > 1 && <b>{Object.values(m.rx).reduce((a, b) => a + b, 0)}</b>}
                  </button>
                )}
              </div>
              {!m.mine && !m.id.startsWith('tmp-') && (onReact || onForward) && tools(m)}
              </div>
              {m.tick && <div style={{ alignSelf: 'flex-end', padding: '0 8px', lineHeight: 0 }} title={m.tickTitle}><Ticks t={m.tick} /></div>}
            </div>
          )
        })}
        {typing && <div className="cm-typing" aria-live="polite"><span className="dots"><i /><i /><i /></span><span className="mut" style={{ fontSize: 12 }}>{typing}</span></div>}
      </div>
      {pop && (<>
        <div className="cm-ov" onClick={() => setPop(null)} />
        {pop.kind === 'rx'
          ? <div className="cm-pop rx" style={{ left: pop.x, top: pop.y }}>{QUICK.map((e) => <button key={e} type="button" onClick={() => { onReact?.(pop.m.id, pop.m.myRx === e ? null : e); setPop(null) }}>{e}</button>)}</div>
          : <div className="cm-pop" style={{ left: pop.x, top: pop.y }}>
              {pop.m.mine && onEdit && pop.m.body && !pop.m.audio_url && Date.now() - new Date(pop.m.created_at).getTime() < 15 * 60e3 && <button type="button" onClick={() => startEdit(pop.m)}>تعديل الرسالة</button>}
              {pop.m.mine && onDelete && <button type="button" onClick={() => doDelete(pop.m)}>إلغاء الإرسال</button>}
              {onForward && <button type="button" onClick={() => { onForward(pop.m); setPop(null) }}>إعادة توجيه</button>}
              {pop.m.body && !pop.m.audio_url && <button type="button" onClick={() => { try { navigator.clipboard.writeText(pop.m.body) } catch { /* ignore */ } setPop(null) }}>نسخ النص</button>}
            </div>}
      </>)}
      <Err>{error || err}</Err>
      {!readOnly && (<>
      {editing && (
        <div className="row" style={{ gap: 8, background: '#E7F0FF', borderRadius: 12, padding: '6px 10px', fontSize: 13 }}>
          <span aria-hidden>✏️</span>
          <span className="grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>تعديل الرسالة:</b> <span className="mut">{editing.body}</span></span>
          <button type="button" className="btn sm" onClick={cancelEdit} aria-label="إلغاء التعديل">✕</button>
        </div>
      )}
      {file && <div className="mut row" style={{ fontSize: 13 }}>الصورة: {file.name} <button className="btn sm" onClick={() => setFile(null)}>إزالة</button></div>}
      {emoji && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 2, background: '#fff', border: '1px solid #E4E4E7', borderRadius: 14, padding: 6, maxHeight: 108, overflowY: 'auto' }}>
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)} style={{ ...ib, width: '100%', fontSize: 20 }}>{e}</button>)}
        </div>
      )}
      {rec ? (
        <div className="row" style={{ gap: 8, padding: '0 2px 6px' }} role="group" aria-label="تسجيل رسالة صوتية">
          <button type="button" style={{ ...ib, color: '#B91C1C', fontSize: 18 }} aria-label="إلغاء التسجيل" title="إلغاء" onClick={() => stopRec(false)}>✕</button>
          <div className="grow row" style={{ gap: 8, background: '#FEE2E2', borderRadius: 22, minHeight: 40, padding: '8px 16px' }}>
            <span className="rec-dot" aria-hidden />
            <b style={{ direction: 'ltr' }}>{mmss(secs)}</b>
            <span className="mut" style={{ fontSize: 13 }}>جاري التسجيل… (أقصى مدة {VOICE_MAX / 60} دقيقة)</span>
          </div>
          <button type="button" style={ib} aria-label="إرسال التسجيل" title="إرسال" onClick={() => stopRec(true)}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon n="plane" s={22} /></span></button>
        </div>
      ) : (
      <div className="row" style={{ gap: 4, padding: '0 2px 6px' }}>
        <label style={ib} aria-label="إرفاق صورة" title="صورة"><Icon n="image" s={22} />
          <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" style={ib} aria-label="إيموجي" title="إيموجي" onClick={() => setEmoji((v) => !v)}>🙂</button>
        <input ref={inp} className="in grow" style={{ borderRadius: 22, minHeight: 40, padding: '8px 16px', minWidth: 0 }} value={body} maxLength={2000} placeholder="اكتب رسالة…" onChange={(e) => { setBody(e.target.value); if (e.target.value) onTyping?.() }} onBlur={() => onStopTyping?.()} onKeyDown={(e) => { if (e.key === 'Enter') send(); else if (e.key === 'Escape' && editing) cancelEdit() }} />
        {body.trim() || file || editing
          ? <button type="button" style={ib} aria-label={editing ? 'حفظ التعديل' : 'إرسال'} title={editing ? 'حفظ التعديل' : 'إرسال'} disabled={busy} onClick={() => send()}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon n="plane" s={22} /></span></button>
          : <>
              {onSendVoice && canRecord() && <button type="button" style={ib} aria-label="تسجيل رسالة صوتية" title="رسالة صوتية" disabled={busy} onClick={startRec} className="cm-mic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v4" /><path d="M8.5 22h7" /></svg></button>}
              <button type="button" style={ib} aria-label="لايك" title="لايك" disabled={busy} onClick={() => send('👍', null)}>👍</button>
            </>}
      </div>
      )}
      </>)}
    </div>
  )
}
