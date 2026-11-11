import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useChatPrefs, refreshChatPrefs, setMute } from '../lib/chatprefs'
import { useAuth } from '../lib/auth'

// قايمة السهم ⌄ جنب اسم الشخص في الشات: الملف الشخصي / حظر / حذف الدردشة
export default function ChatMenu({ otherId, name }: { otherId: string; name?: string }) {
  const { session } = useAuth()
  const { blocked, muted } = useChatPrefs()
  const isMuted = muted.has(otherId)
  const doMute = async () => { setPos(null); const e = await setMute(session!.user.id, otherId, !isMuted); if (e) alert(e) }
  const isBlocked = blocked.has(otherId)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const hint = (e: { message: string }) => /block_user|clear_chat|schema cache|function/i.test(e.message) ? 'محتاج تحديث 030 في Supabase (مرة واحدة).' : errMsg(e)
  const doBlock = async () => {
    setPos(null)
    if (!isBlocked && !confirm(`تحظر ${name ?? 'الشخص ده'}؟ مش هيقدر يبعتلك رسايل ولا طلبات صداقة، والصداقة هتتلغي.`)) return
    const { error } = isBlocked ? await supabase.rpc('unblock_user', { target: otherId }) : await supabase.rpc('block_user', { target: otherId })
    if (error) return alert(hint(error))
    refreshChatPrefs()
  }
  const doClear = async () => {
    setPos(null)
    if (!confirm('تحذف الدردشة دي من عندك؟ الرسايل هتختفي عندك بس، والطرف التاني هيفضل شايفها.')) return
    const { error } = await supabase.rpc('clear_chat', { other: otherId })
    if (error) return alert(hint(error))
    refreshChatPrefs()
  }
  return (
    <>
      <button type="button" aria-label="خيارات المحادثة" title="خيارات المحادثة" className="cm-tb" style={{ width: 24, height: 24, fontSize: 16 }}
        onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPos({ x: Math.min(Math.max(8, r.left - 60), window.innerWidth - 210), y: Math.min(r.bottom + 6, window.innerHeight - 170) }) }}>⌄</button>
      {pos && (<>
        <div className="cm-ov" onClick={(e) => { e.stopPropagation(); setPos(null) }} />
        <div className="cm-pop" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
          <Link to={`/u/${otherId}`} onClick={() => setPos(null)} className="cm-pi">عرض الملف الشخصي</Link>
          <button type="button" onClick={doMute}>{isMuted ? 'تفعيل إشعارات الرسائل' : 'كتم إشعارات الرسائل'}</button>
          <button type="button" onClick={doBlock} style={{ color: isBlocked ? undefined : '#B91C1C' }}>{isBlocked ? 'إلغاء الحظر' : 'حظر'}</button>
          <button type="button" onClick={doClear}>حذف الدردشة</button>
        </div>
      </>)}
    </>
  )
}
