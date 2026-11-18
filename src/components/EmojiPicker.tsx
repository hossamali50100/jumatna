import { useEffect, useRef, useState } from 'react'

export const CATS: [string, string, string][] = [
  ['😀', 'وجوه', '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 😴 😪 🤤 😷 🤒 🤕 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🥺 😢 😭 😤 😡 🤬 😱 😨 😰 😥 😓'],
  ['❤️', 'قلوب', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 😍 🥰 😘 💋 💌 🌹 🌸 💐 🌺 🌷 ✨ 💫 ⭐ 🌟'],
  ['👍', 'إيدين', '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 ✍️ 🤳 🫶 🫰'],
  ['🎉', 'احتفال', '🎉 🎊 🎈 🎁 🎂 🍰 🥂 🍾 🏆 🥇 🏅 🎯 🔥 💯 ✅ ❌ ⚡ 💥 🌈 ☀️ 🌙 ⭐ ☕ 🍕 🍔 🍟 🍫 🍎 🍉 🏠 🚗 ✈️ 📣 📸 🎵 🎶 📚 💡 💼 🛍️ 💰'],
]

// نافذة اختيار إيموجي. onPick بيستلم الإيموجي المختار
export default function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn sm" aria-expanded={open} aria-label="إضافة إيموجي" onClick={() => setOpen(!open)}>😊 إيموجي</button>
      {open && (
        <div className="pop" style={{ width: 300, maxWidth: '86vw', padding: 8, insetInlineStart: 0 }}>
          <div className="row" style={{ gap: 4, borderBottom: '1px solid #E4E4E7', paddingBottom: 6, marginBottom: 6 }}>
            {CATS.map(([ic, name], i) => (
              <button key={name} type="button" title={name} onClick={() => setTab(i)} style={{ border: 0, cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 8, background: tab === i ? '#E7F0FF' : 'transparent' }}>{ic}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
            {CATS[tab][2].split(' ').map((e, i) => (
              <button key={e + i} type="button" onClick={() => onPick(e)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 22, padding: 2, borderRadius: 8 }}>{e}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// شبكة الإيموجي لوحدها (بتستخدمها نوافذ تانية زي التفاعل على رسالة)
export function EmojiGrid({ onPick }: { onPick: (e: string) => void }) {
  const [tab, setTab] = useState(0)
  return (
    <>
      <div className="row" style={{ gap: 4, borderBottom: '1px solid #E4E4E7', paddingBottom: 6, marginBottom: 6 }}>
        {CATS.map(([ic, name], i) => (
          <button key={name} type="button" title={name} onClick={() => setTab(i)} style={{ border: 0, cursor: 'pointer', fontSize: 20, padding: '4px 8px', borderRadius: 8, background: tab === i ? '#E7F0FF' : 'transparent' }}>{ic}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
        {CATS[tab][2].split(' ').map((e, i) => (
          <button key={e + i} type="button" onClick={() => onPick(e)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 22, padding: 2, borderRadius: 8 }}>{e}</button>
        ))}
      </div>
    </>
  )
}
