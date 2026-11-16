import { useEffect, useState } from 'react'

// لون الخلفية = اللون السائد (متوسط ألوان الصورة). بنحسبه مرة واحدة لكل صورة ونحفظه.
const cache = new Map<string, string>()
function avgColor(url: string): Promise<string | null> {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16
        const x = c.getContext('2d')!; x.drawImage(im, 0, 0, 16, 16)
        const d = x.getImageData(0, 0, 16, 16).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
        res(n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : null)
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
