import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// نوافذ تأكيد وتنبيه جوه الموقع (بدل نوافذ المتصفح confirm / alert / prompt)
type Choice = { value: string; label: string; hint?: string }
type Req = {
  kind: 'confirm' | 'alert' | 'choice' | 'text'
  title: string
  body?: string
  ok?: string
  cancel?: string
  danger?: boolean
  choices?: Choice[]
  placeholder?: string
  resolve: (v: unknown) => void
}

let cur: Req | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
function open<T>(r: Omit<Req, 'resolve'>): Promise<T> {
  return new Promise<T>((resolve) => {
    if (cur) cur.resolve(cur.kind === 'confirm' ? false : null) // نافذة واحدة بس في المرة
    cur = { ...r, resolve: resolve as (v: unknown) => void }
    emit()
  })
}

/** سؤال نعم/لا. بيرجع true لو وافق */
export const askConfirm = (title: string, o: { body?: string; ok?: string; cancel?: string; danger?: boolean } = {}) => {
  // لو السؤال طويل: الجزء لحد علامة الاستفهام يبقى عنوان، والباقي شرح تحته
  const k = title.indexOf('؟')
  if (!o.body && k > 0 && k < title.length - 1) o = { ...o, body: title.slice(k + 1).trim() }, title = title.slice(0, k + 1)
  return open<boolean>({ kind: 'confirm', title, ...o }).then((v) => v === true)
}
/** رسالة تنبيه بزرار "حسنًا" */
export const tell = (title: string, body?: string) => open<null>({ kind: 'alert', title, body }).then(() => undefined)
/** اختيار من كذا اختيار (زي "إلغاء الإرسال لدى الجميع / لديك"). بيرجع القيمة أو null */
export const askChoice = (title: string, choices: Choice[], o: { ok?: string; danger?: boolean } = {}) =>
  open<string | null>({ kind: 'choice', title, choices, ...o })
/** سؤال بخانة كتابة. بيرجع النص أو null */
export const askText = (title: string, o: { body?: string; ok?: string; placeholder?: string } = {}) =>
  open<string | null>({ kind: 'text', title, ...o })

export function DialogHost() {
  const r = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => cur)
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!r) return
    setPick(r.choices?.[0]?.value ?? ''); setText('')
    if (r.kind !== 'text') setTimeout(() => okRef.current?.focus(), 0)
  }, [r])
  if (!r) return null
  const close = (v: unknown) => { const x = cur; cur = null; emit(); x?.resolve(v) }
  const cancelV = r.kind === 'confirm' ? false : null
  const okV = () => (r.kind === 'confirm' ? true : r.kind === 'choice' ? pick : r.kind === 'text' ? (text.trim() || null) : null)
  return createPortal(
    <div className="dlg-ov" onMouseDown={() => close(cancelV)} onKeyDown={(e) => { if (e.key === 'Escape') close(cancelV) }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dlg-h">
          <b id="dlg-t">{r.title}</b>
          <button type="button" className="dlg-x" aria-label="إغلاق" onClick={() => close(cancelV)}>✕</button>
        </div>
        {(r.body || r.kind === 'choice' || r.kind === 'text') && <div className="dlg-b">
          {r.body && <p style={{ margin: 0, lineHeight: 1.7 }}>{r.body}</p>}
          {r.kind === 'choice' && r.choices!.map((c) => (
            <label key={c.value} className="dlg-ch">
              <input type="radio" name="dlg-ch" checked={pick === c.value} onChange={() => setPick(c.value)} />
              <span className="grow"><b>{c.label}</b>{c.hint && <span className="mut" style={{ display: 'block', fontSize: 13, marginTop: 2, lineHeight: 1.6 }}>{c.hint}</span>}</span>
            </label>
          ))}
          {r.kind === 'text' && <textarea className="in" autoFocus placeholder={r.placeholder} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} style={{ minHeight: 80 }} />}
        </div>}
        <div className="dlg-f">
          {r.kind !== 'alert' && <button type="button" className="dlg-c" onClick={() => close(cancelV)}>{r.cancel ?? 'إلغاء'}</button>}
          <button ref={okRef} type="button" className={'btn p' + (r.danger ? ' dlg-danger' : '')} disabled={r.kind === 'text' && !text.trim()} onClick={() => close(okV())}>
            {r.ok ?? (r.kind === 'alert' ? 'حسنًا' : 'تأكيد')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
