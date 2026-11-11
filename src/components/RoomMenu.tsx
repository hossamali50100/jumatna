import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { refreshRooms, type RoomInfo } from '../lib/rooms'
import { useChatPrefs, setMute } from '../lib/chatprefs'
import { useAuth } from '../lib/auth'
import { AddMembersModal, EditRoomModal, MembersModal } from './RoomDialogs'

// قايمة السهم ⌄ لمجموعة الشات
export default function RoomMenu({ room, onLeft }: { room: RoomInfo; onLeft?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const { session } = useAuth()
  const { muted } = useChatPrefs()
  const key = 'room:' + room.id
  const isMuted = muted.has(key)
  const doMute = async () => { setPos(null); const e = await setMute(session!.user.id, key, !isMuted); if (e) alert(e) }
  const [dlg, setDlg] = useState<'' | 'members' | 'edit' | 'add'>('')
  const leave = async () => {
    setPos(null)
    if (!confirm(`تغادر مجموعة «${room.name}»؟`)) return
    const { error } = await supabase.rpc('leave_chat_room', { p_room: room.id })
    if (error) return alert(errMsg(error))
    refreshRooms(); onLeft?.()
  }
  const open = (d: 'members' | 'edit' | 'add') => { setPos(null); setDlg(d) }
  return (
    <>
      <button type="button" aria-label="خيارات المجموعة" title="خيارات المجموعة" className="cm-tb" style={{ width: 24, height: 24, fontSize: 16 }}
        onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPos({ x: Math.min(Math.max(8, r.left - 60), window.innerWidth - 210), y: Math.min(r.bottom + 6, window.innerHeight - 220) }) }}>⌄</button>
      {pos && (<>
        <div className="cm-ov" onClick={(e) => { e.stopPropagation(); setPos(null) }} />
        <div className="cm-pop" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => open('members')}>الأعضاء</button>
          <button type="button" onClick={() => open('add')}>إضافة أعضاء</button>
          <button type="button" onClick={() => open('edit')}>تغيير الاسم والصورة</button>
          <button type="button" onClick={doMute}>{isMuted ? 'تفعيل إشعارات المجموعة' : 'كتم إشعارات المجموعة'}</button>
          <button type="button" onClick={leave} style={{ color: '#B91C1C' }}>مغادرة المجموعة</button>
        </div>
      </>)}
      {dlg === 'members' && <MembersModal room={room} onClose={() => setDlg('')} />}
      {dlg === 'add' && <AddMembersModal room={room} onClose={() => setDlg('')} />}
      {dlg === 'edit' && <EditRoomModal room={room} onClose={() => setDlg('')} />}
    </>
  )
}
