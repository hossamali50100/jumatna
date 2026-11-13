import { useEffect, useRef, useState } from 'react'
import { errMsg } from '../lib/supabase'
import { Avatar, Err, Icon, timeAgo } from '../lib/ui'

export type ChatMsg = { id: string; mine: boolean; tick?: 'sending' | 'sent' | 'delivered' | 'read'; tickTitle?: string; label?: string; body: string; image_url: string | null; created_at: string; avatar?: string | null; rx?: Record<string, number>; myRx?: string | null }
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
export default function ChatBox({ msgs, onSend, empty, height = 420, error, fill, readOnly, onDelete, onReact, onForward, typing, onTyping, onStopTyping }: { typing?: string; onTyping?: () => void; onStopTyping?: () => void; onDelete?: (id: string) => Promise<void>; onReact?: (id: string, emoji: string | null) => void; onForward?: (m: ChatMsg) => void; msgs: ChatMsg[]; onSend: (text: string, file: File | null) => Promise<void>; empty: string; height?: number; error?: string; fill?: boolean; readOnly?: boolean }) {
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [pop, setPop] = useState<{ m: ChatMsg; kind: 'rx' | 'menu'; x: number; y: number } | null>(null)
  const openPop = (e: React.MouseEvent, m: ChatMsg, kind: 'rx' | 'menu') => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ m, kind, x: Math.min(Math.max(8, r.left - 70), window.innerWidth - 200), y: Math.min(r.bottom + 6, window.innerHeight - 190) })
  }
  const box = useRef<HTMLDivElement>(null)
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight }, [msgs.length, typing])

  const send = async (text = body.trim(), f: File | null = file) => {
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
                {m.body && (/^[\p{Extended_Pictographic}‍️\s]{1,12}$/u.test(m.body)
                  ? <div style={{ fontSize: 34, lineHeight: 1.3, padding: '0 4px' }}>{m.body}</div>
                  : <div style={{ background: m.mine ? 'var(--brand)' : '#EFEFF1', color: m.mine ? '#fff' : '#111111', borderRadius: 18, padding: '8px 14px', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'start' }}>{m.body}</div>)}
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
              {pop.m.mine && onDelete && <button type="button" onClick={() => doDelete(pop.m)}>إلغاء الإرسال</button>}
              {onForward && <button type="button" onClick={() => { onForward(pop.m); setPop(null) }}>إعادة توجيه</button>}
              {pop.m.body && <button type="button" onClick={() => { try { navigator.clipboard.writeText(pop.m.body) } catch { /* ignore */ } setPop(null) }}>نسخ النص</button>}
            </div>}
      </>)}
      <Err>{error || err}</Err>
      {!readOnly && (<>
      {file && <div className="mut row" style={{ fontSize: 13 }}>الصورة: {file.name} <button className="btn sm" onClick={() => setFile(null)}>إزالة</button></div>}
      {emoji && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 2, background: '#fff', border: '1px solid #E4E4E7', borderRadius: 14, padding: 6, maxHeight: 108, overflowY: 'auto' }}>
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)} style={{ ...ib, width: '100%', fontSize: 20 }}>{e}</button>)}
        </div>
      )}
      <div className="row" style={{ gap: 4, padding: '0 2px 6px' }}>
        <label style={ib} aria-label="إرفاق صورة" title="صورة"><Icon n="image" s={22} />
          <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" style={ib} aria-label="إيموجي" title="إيموجي" onClick={() => setEmoji((v) => !v)}>🙂</button>
        <input ref={inp} className="in grow" style={{ borderRadius: 22, minHeight: 40, padding: '8px 16px', minWidth: 0 }} value={body} maxLength={2000} placeholder="اكتب رسالة…" onChange={(e) => { setBody(e.target.value); if (e.target.value) onTyping?.() }} onBlur={() => onStopTyping?.()} onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
        {body.trim() || file
          ? <button type="button" style={ib} aria-label="إرسال" title="إرسال" disabled={busy} onClick={() => send()}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon n="plane" s={22} /></span></button>
          : <button type="button" style={ib} aria-label="لايك" title="لايك" disabled={busy} onClick={() => send('👍', null)}>👍</button>}
      </div>
      </>)}
    </div>
  )
}
