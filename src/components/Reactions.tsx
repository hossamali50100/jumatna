import { useRef, useState } from 'react'

export const REACTIONS = [
  { k: 'like', e: '👍', t: 'أعجبني', c: '#2078F4' },
  { k: 'love', e: '❤️', t: 'أحببته', c: '#F33E58' },
  { k: 'care', e: '🥰', t: 'أدعمه', c: '#F7B125' },
  { k: 'haha', e: '😆', t: 'أضحكني', c: '#F7B125' },
  { k: 'wow', e: '😮', t: 'أدهشني', c: '#F7B125' },
  { k: 'sad', e: '😢', t: 'أحزنني', c: '#F7B125' },
  { k: 'angry', e: '😡', t: 'أغضبني', c: '#E9710F' },
] as const
export type Rx = { mine: string | null; by: Record<string, number> }
export const emptyRx = (): Rx => ({ mine: null, by: {} })
export const rxTotal = (r: Rx) => Object.values(r.by).reduce((a, b) => a + b, 0)
const find = (k: string | null) => REACTIONS.find((x) => x.k === k)

// بيبني حالة التفاعل من صفوف (reaction, user_id)
export function buildRx(rows: { user_id: string; reaction?: string | null }[], me: string): Rx {
  const r = emptyRx()
  for (const x of rows) { const k = find(x.reaction ?? 'like') ? (x.reaction ?? 'like') : 'like'; r.by[k] = (r.by[k] ?? 0) + 1; if (x.user_id === me) r.mine = k }
  return r
}
// الحالة بعد ما أغيّر تفاعلي (أو أشيله)
export function applyRx(r: Rx, k: string | null): Rx {
  const by = { ...r.by }
  if (r.mine) by[r.mine] = Math.max(0, (by[r.mine] ?? 0) - 1)
  if (k) by[k] = (by[k] ?? 0) + 1
  return { mine: k, by }
}

// أشهر 3 تفاعلات جنب بعض
export function RxStack({ by, size = 18 }: { by: Record<string, number>; size?: number }) {
  const top = REACTIONS.filter((r) => (by[r.k] ?? 0) > 0).sort((a, b) => (by[b.k] ?? 0) - (by[a.k] ?? 0)).slice(0, 3)
  if (!top.length) return null
  return <span className="rx-stack">{top.map((r) => <i key={r.k} style={{ width: size, height: size, fontSize: size * 0.72 }}>{r.e}</i>)}</span>
}

const Thumb = ({ s = 20 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 10v11M7 10l4-8a2 2 0 012 2v4h6a2 2 0 012 2.3l-1.4 8A2 2 0 0117.600 21H7" /></svg>
)

// زرار "أعجبني": ضغطة = أعجبني/إلغاء، ولما توقف عليه (أو تضغط مطوّلًا في الموبايل) تطلع ردود الفعل
export function ReactButton({ mine, onPick, compact }: { mine: string | null; onPick: (k: string | null) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const t = useRef<number | undefined>(undefined)
  const long = useRef(false)
  const show = (ms: number) => { window.clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(true), ms) }
  const hide = () => { window.clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(false), 280) }
  const cur = find(mine)
  const onClick = () => {
    if (long.current) { long.current = false; return }
    if (open) { setOpen(false); return }
    onPick(mine ? null : 'like')
  }
  return (
    <span className={'rx-wrap' + (compact ? ' c' : '')} onMouseEnter={() => show(compact ? 350 : 400)} onMouseLeave={hide}
      onTouchStart={() => { long.current = false; window.clearTimeout(t.current); t.current = window.setTimeout(() => { long.current = true; setOpen(true) }, 450) }}
      onTouchEnd={() => window.clearTimeout(t.current)} onTouchMove={() => window.clearTimeout(t.current)}>
      {open && (
        <span className="rx-pick" role="menu">
          {REACTIONS.map((r) => <button key={r.k} type="button" className="rx-e" title={r.t} aria-label={r.t} onClick={() => { long.current = false; setOpen(false); onPick(r.k) }}>{r.e}</button>)}
        </span>
      )}
      {compact
        ? <button type="button" className={cur ? 'on' : ''} style={cur ? { color: cur.c } : undefined} onClick={onClick} onContextMenu={(e) => e.preventDefault()}>{cur ? cur.t : 'أعجبني'}</button>
        : <button type="button" className="btn ghost" style={cur ? { fontWeight: 700, color: cur.c } : undefined} onClick={onClick} onContextMenu={(e) => e.preventDefault()}>
            {cur ? <span style={{ fontSize: 20, lineHeight: 1 }}>{cur.e}</span> : <Thumb />}{cur ? cur.t : 'أعجبني'}
          </button>}
    </span>
  )
}
