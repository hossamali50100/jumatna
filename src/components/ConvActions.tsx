import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useChatPrefs, refreshChatPrefs, setMute } from '../lib/chatprefs'
import { useAuth } from '../lib/auth'
import { usePins, togglePin } from '../lib/pins'
import { refreshRooms } from '../lib/rooms'
import { NewRoomModal } from './RoomDialogs'
import { MI } from './MenuIcons'

export type ActItem = { other: string; name: string; room?: boolean }

// ضغطة مطوّلة (موبايل) أو كليك يمين (كمبيوتر) على صف محادثة
export function useLongPress(onFire: (x: number, y: number) => void) {
  const t = useRef<number | undefined>(undefined); const fired = useRef(false); const st = useRef({ x: 0, y: 0 })
  const clear = () => { if (t.current) { clearTimeout(t.current); t.current = undefined } }
  return {
    onTouchStart: (e: React.TouchEvent) => { fired.current = false; const p = e.touches[0]; st.current = { x: p.clientX, y: p.clientY }; clear(); t.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onFire(st.current.x, st.current.y) }, 450) },
    onTouchMove: (e: React.TouchEvent) => { const p = e.touches[0]; if (Math.abs(p.clientX - st.current.x) > 10 || Math.abs(p.clientY - st.current.y) > 10) clear() },
    onTouchEnd: clear, onTouchCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); fired.current = true; onFire(e.clientX, e.clientY) },
    onClick: (e: React.MouseEvent) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false } },
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
  }
}

export default function ConvActions({ item, at, sheet, onClose }: { item: ActItem; at: { x: number; y: number }; sheet: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { session } = useAuth()
  const { blocked, muted } = useChatPrefs()
  const pins = usePins()
  const [mk, setMk] = useState(false)
  const key = item.other
  const isMuted = muted.has(key), isBlocked = blocked.has(item.other), isPinned = pins.has(key)
  const hint = (e: { message: string }) => /block_user|clear_chat|schema cache|function/i.test(e.message) ? 'محتاج تحديث 030 في Supabase (مرة واحدة).' : errMsg(e)
  const go = (f: () => void | Promise<void>) => () => { onClose(); void f() }
  const mute = go(async () => { const e = await setMute(session!.user.id, key, !isMuted); if (e) alert(e) })
  const pin = go(() => togglePin(key))
  const profile = go(() => nav(`/u/${item.other}`))
  const block = go(async () => {
    if (!isBlocked && !confirm(`تحظر ${item.name}؟ مش هيقدر يبعتلك رسايل ولا طلبات صداقة، والصداقة هتتلغي.`)) return
    const { error } = isBlocked ? await supabase.rpc('unblock_user', { target: item.other }) : await supabase.rpc('block_user', { target: item.other })
    if (error) return alert(hint(error)); refreshChatPrefs()
  })
  const clear = go(async () => {
    if (!confirm('تحذف الدردشة دي من عندك؟ الرسايل هتختفي عندك بس، والطرف التاني هيفضل شايفها.')) return
    const { error } = await supabase.rpc('clear_chat', { other: item.other })
    if (error) return alert(hint(error)); refreshChatPrefs()
  })
  const leave = go(async () => {
    if (!confirm(`تغادر الشات الجماعي «${item.name}»؟`)) return
    const { error } = await supabase.rpc('leave_chat_room', { p_room: item.other.slice(5) })
    if (error) return alert(errMsg(error)); refreshRooms()
  })
  const btns = (<>
    <button type="button" onClick={pin}><MI n="pin" />{isPinned ? 'إلغاء التثبيت' : 'تثبيت'}</button>
    <button type="button" onClick={mute}><MI n={isMuted ? 'bell' : 'bellOff'} />{isMuted ? 'تفعيل الإشعارات' : 'كتم'}</button>
    {!item.room && <button type="button" onClick={() => setMk(true)}><MI n="users" />{`إنشاء شات جماعي مع ${item.name}`}</button>}
    {!item.room && <button type="button" onClick={profile}><MI n="user" />عرض الملف الشخصي</button>}
    {!item.room && <button type="button" onClick={block} style={{ color: isBlocked ? undefined : '#B91C1C' }}><MI n={isBlocked ? 'undo' : 'ban'} />{isBlocked ? 'إلغاء الحظر' : 'حظر'}</button>}
    {!item.room && <button type="button" onClick={clear} style={{ color: '#B91C1C' }}><MI n="trash" />حذف الدردشة</button>}
    {item.room && <button type="button" onClick={leave} style={{ color: '#B91C1C' }}><MI n="logout" />مغادرة الشات الجماعي</button>}
  </>)
  return (<>
    {mk && <NewRoomModal initial={[item.other]} onClose={() => { setMk(false); onClose() }} onCreated={(id) => { setMk(false); onClose(); nav('/messages/' + id) }} />}
    {!mk && <div className="cm-ov" style={{ zIndex: 95, background: sheet ? 'rgba(0,0,0,.45)' : undefined }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />}
    {!mk && (sheet
      ? <div className="cv-sheet" role="menu"><span className="cv-handle" />{btns}</div>
      : <div className="cm-pop" style={{ left: Math.min(at.x, window.innerWidth - 230), top: Math.min(at.y, window.innerHeight - 300), zIndex: 96 }} role="menu">{btns}</div>)}
  </>)
}
