import { useEffect, useState } from 'react'

// لون الخلفية = اللون السائد (أكتر لون متكرر في الصورة). بنحسبه مرة واحدة لكل صورة ونحفظه.
const cache = new Map<string, string>()
function avgColor(url: string): Promise<string | null> {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 32; c.height = 32
        const x = c.getContext('2d')!; x.drawImage(im, 0, 0, 32, 32)
        const d = x.getImageData(0, 0, 32, 32).data
        // اللون السائد: بنقسّم الألوان لمجموعات متقاربة وناخد متوسط أكبر مجموعة
        const m = new Map<number, [number, number, number, number]>()
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue
          const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5)
          const b = m.get(k) ?? [0, 0, 0, 0]
          b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; m.set(k, b)
        }
        let best: [number, number, number, number] | null = null
        for (const b of m.values()) if (!best || b[3] > best[3]) best = b
        res(best ? `rgb(${Math.round(best[0] / best[3])},${Math.round(best[1] / best[3])},${Math.round(best[2] / best[3])})` : null)
      } catch { res(null) }
    }
    im.onerror = () => res(null)
    im.src = url
  })
}

// صورة البوست: إطار مربع دايمًا، الصورة كاملة في النص، والفراغ بلون الصورة السائد
export default function SquareImage({ src, onClick }: { src: string; onClick?: () => void }) {
  const [bg, setBg] = useState<string | undefined>(cache.get(src))
  useEffect(() => {
    if (cache.has(src)) { setBg(cache.get(src)); return }
    let live = true
    avgColor(src).then((c) => { if (c) cache.set(src, c); if (live && c) setBg(c) })
    return () => { live = false }
  }, [src])
  return <div className="post-sq" style={bg ? { background: bg } : undefined} onClick={onClick}><img src={src} alt="" loading="lazy" /></div>
}
