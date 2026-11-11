import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// عارض الصور بملء الشاشة (زي الفيس): خلفية سودا + تكبير/تصغير + قفل + لوحة جانبية اختيارية
export default function Lightbox({ src, onClose, side }: { src: string; onClose: () => void; side?: ReactNode }) {
  const [z, setZ] = useState(1)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    const o = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = o }
  }, [onClose])
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
        <div className="lb-img" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <img src={src} alt="" style={{ transform: `scale(${z})` }} onClick={() => setZ((v) => (v > 1 ? 1 : 2))} />
        </div>
        {side && <div className="lb-side">{side}</div>}
      </div>
    </div>,
    document.body,
  )
}
