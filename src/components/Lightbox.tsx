import { useEffect, useRef, useState, type ReactNode, type TouchEvent as RTouchEvent } from 'react'
import { createPortal } from 'react-dom'

// عارض الصور بملء الشاشة (زي الفيس): خلفية سودا + تكبير/تصغير + قفل + لوحة جانبية اختيارية
export default function Lightbox({ src, srcs, start = 0, onClose, side }: { src?: string; srcs?: string[]; start?: number; onClose: () => void; side?: ReactNode }) {
  const list = srcs && srcs.length ? srcs : [src ?? '']
  const [i, setI] = useState(Math.min(start, list.length - 1))
  const [z, setZ] = useState(1)
  const go = (d: number) => { setI((v) => (v + d + list.length) % list.length); setZ(1) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (list.length > 1) { if (e.key === 'ArrowLeft') go(1); if (e.key === 'ArrowRight') go(-1) } }
    document.addEventListener('keydown', k)
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, list.length])
  // شريط الصور الصغيرة تحت: نخلي الصورة الحالية دايمًا ظاهرة فيه
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => { strip.current?.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [i])
  // سحب بالصباع يمين وشمال على الموبايل
  const [tx, setTx] = useState<number | null>(null)
  const onTouchStart = (e: RTouchEvent) => { if (z === 1 && e.touches.length === 1) setTx(e.touches[0].clientX) }
  const onTouchEnd = (e: RTouchEvent) => {
    if (tx === null || list.length < 2) return
    const dx = e.changedTouches[0].clientX - tx; setTx(null)
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
  }
  const full = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.() }
  const rb = { background: 'rgba(255,255,255,.14)', border: 0, color: '#fff', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 22, fontFamily: 'inherit' } as const
  return createPortal(
    <div role="dialog" aria-label="عرض الصورة" className="lb">
      <div className="lb-top">
        <button style={rb} aria-label="إغلاق" onClick={onClose}>✕</button>
        <span className="grow" />
        <button style={rb} aria-label="تكبير" onClick={() => setZ((v) => Math.min(4, +(v + 0.5).toFixed(1)))}>＋</button>
        <button style={rb} aria-label="تصغير" onClick={() => setZ((v) => Math.max(1, +(v - 0.5).toFixed(1)))}>－</button>
        <button style={rb} aria-label="ملء الشاشة" onClick={full}>⛶</button>
      </div>
      <div className="lb-body">
        <div className={'lb-stage' + (list.length > 1 ? ' has-thumbs' : '')}>
        <div className="lb-img" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <img src={list[i]} alt="" style={{ transform: `scale(${z})` }} onClick={() => setZ((v) => (v > 1 ? 1 : 2))} />
        </div>
        {list.length > 1 && <><button dir="ltr" className="lb-nav l" aria-label="التالية" onClick={() => go(1)}>‹</button><button dir="ltr" className="lb-nav r" aria-label="السابقة" onClick={() => go(-1)}>›</button><span dir="ltr" className="lb-count">{i + 1} / {list.length}</span>
          <div className="lb-thumbs" ref={strip}>
            {list.map((u, k) => <button key={k} type="button" className={k === i ? 'on' : ''} aria-label={'صورة ' + (k + 1)} aria-current={k === i} onClick={() => { setI(k); setZ(1) }}><img src={u} alt="" loading="lazy" /></button>)}
          </div></>}
        </div>
        {side && <div className="lb-side">{side}</div>}
      </div>
    </div>,
    document.body,
  )
}
