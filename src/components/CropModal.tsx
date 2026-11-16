import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type Kind = 'avatar' | 'cover'
const SPEC: Record<Kind, { aspect: number; outW: number; round: boolean; title: string }> = {
  avatar: { aspect: 1, outW: 640, round: true, title: 'اضبط الصورة' },
  cover: { aspect: 2.7, outW: 1600, round: false, title: 'اضبط الغلاف' },
}

function CropModal({ file, kind, onCancel, onDone }: { file: File; kind: Kind; onCancel: () => void; onDone: (f: File) => void }) {
  const sp = SPEC[kind]
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const FW = Math.min(480, (typeof window !== 'undefined' ? window.innerWidth : 400) - 48)
  const FH = Math.round(FW / sp.aspect)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [z, setZ] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  const base = nat ? Math.max(FW / nat.w, FH / nat.h) : 1
  const s = base * z
  const clamp = (x: number, y: number, sc = s) => {
    if (!nat) return { x, y }
    return { x: Math.min(0, Math.max(FW - nat.w * sc, x)), y: Math.min(0, Math.max(FH - nat.h * sc, y)) }
  }
  useEffect(() => {
    if (!nat) return
    const b = Math.max(FW / nat.w, FH / nat.h)
    setPos({ x: (FW - nat.w * b) / 2, y: (FH - nat.h * b) / 2 })
  }, [nat, FW, FH])

  const changeZoom = (nz: number) => {
    if (!nat) return
    const v = Math.min(4, Math.max(1, nz))
    const ns = base * v
    // نثبّت مركز الإطار أثناء التكبير
    const cx = (FW / 2 - pos.x) / s, cy = (FH / 2 - pos.y) / s
    setZ(v); setPos(clamp(FW / 2 - cx * ns, FH / 2 - cy * ns, ns))
  }
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y } }
  const move = (e: React.PointerEvent) => { const d = drag.current; if (d) setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py)) }
  const up = () => { drag.current = null }

  const done = async () => {
    if (!nat) return
    setBusy(true)
    const img = new Image(); img.src = url
    await img.decode().catch(() => undefined)
    const outH = Math.round(sp.outW / sp.aspect)
    const c = document.createElement('canvas'); c.width = sp.outW; c.height = outH
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, -pos.x / s, -pos.y / s, FW / s, FH / s, 0, 0, sp.outW, outH)
    c.toBlob((b) => {
      setBusy(false)
      if (!b) return onCancel()
      onDone(new File([b], 'image.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={onCancel}>
      <div className="card col" style={{ gap: 12, width: FW + 32, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
        <b style={{ fontSize: 18 }}>{sp.title}</b>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={(e) => changeZoom(z - e.deltaY / 500)}
          style={{ width: FW, height: FH, position: 'relative', overflow: 'hidden', borderRadius: sp.round ? '50%' : 12, background: '#111', touchAction: 'none', cursor: 'grab', alignSelf: 'center', userSelect: 'none' }}>
          <img src={url} alt="" draggable={false} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ position: 'absolute', left: 0, top: 0, maxWidth: 'none', width: nat ? nat.w * s : 'auto', height: nat ? nat.h * s : 'auto', transform: `translate(${pos.x}px, ${pos.y}px)`, pointerEvents: 'none' }} />
        </div>
        <label className="row" style={{ gap: 10 }}>
          <span aria-hidden>🔍</span>
          <input type="range" min={1} max={4} step={0.01} value={z} onChange={(e) => changeZoom(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--brand)' }} aria-label="تكبير" />
        </label>
        <span className="mut" style={{ fontSize: 13 }}>اسحب الصورة عشان تظبط مكانها، وكبّر أو صغّر بالشريط.</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn p grow" disabled={busy || !nat} onClick={done}>{busy ? '…' : 'تم'}</button>
          <button type="button" className="btn" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}

// استخدام: const { ask, modal } = useCrop(); ask(file, 'avatar' | 'cover', (cropped) => ...) وحط {modal} في الصفحة
export function useCrop(): { ask: (f: File | null | undefined, kind: Kind, done: (f: File) => void) => void; modal: ReactNode } {
  const [req, setReq] = useState<{ file: File; kind: Kind; done: (f: File) => void } | null>(null)
  const ask = (f: File | null | undefined, kind: Kind, done: (f: File) => void) => {
    if (!f) return
    if (f.type === 'image/gif' && kind === 'avatar') return done(f) // GIF للصورة الشخصية بس بنسيبه زي ما هو. الغلاف دايمًا صورة ثابتة
    setReq({ file: f, kind, done })
  }
  const modal = req ? <CropModal file={req.file} kind={req.kind} onCancel={() => setReq(null)} onDone={(c) => { const d = req.done; setReq(null); d(c) }} /> : null
  return { ask, modal }
}
