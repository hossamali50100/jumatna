import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useFriends } from '../lib/friends'
import { useChatDock } from './ChatDock'
import { Avatar, Name } from '../lib/ui'
import { REACTIONS } from './Reactions'

type Who = { user_id: string; reaction: string; profiles: { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null } | null }
const emojiOf = (k: string) => REACTIONS.find((r) => r.k === k)?.e ?? '👍'
const labelOf = (k: string) => REACTIONS.find((r) => r.k === k)?.t ?? 'أعجبني'

// بيجيب الناس اللي تفاعلوا مع البوست (ولو تحديث الريأكشنز مش متشغّل، بيعتبرهم كلهم "أعجبني")
async function loadWho(postId: string, limit: number): Promise<Who[]> {
  let r = await supabase.from('likes').select('user_id,reaction,profiles!user_id(name,avatar_url,plan,plan_until)').eq('post_id', postId).order('created_at', { ascending: false }).limit(limit)
  if (r.error) r = await supabase.from('likes').select('user_id,profiles!user_id(name,avatar_url,plan,plan_until)').eq('post_id', postId).order('created_at', { ascending: false }).limit(limit) as unknown as typeof r
  return ((r.data ?? []) as unknown as Who[]).map((w) => ({ ...w, reaction: w.reaction ?? 'like' }))
}

// ملخص التفاعلات تحت البوست: وقوف = قايمة أسماء صغيرة، دوسة = نافذة فيها كل الناس بتابات
export function ReactorsSummary({ postId, by, total, me }: { postId: string; by: Record<string, number>; total: number; me: string }) {
  const [tip, setTip] = useState<{ k: string | null; right: number; top: number; up: boolean } | null>(null)
  const [who, setWho] = useState<Who[] | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const top = REACTIONS.filter((r) => (by[r.k] ?? 0) > 0).sort((a, b) => (by[b.k] ?? 0) - (by[a.k] ?? 0)).slice(0, 3)
  // لو العدد اتغيّر (حد تفاعل) نجيب القايمة من جديد المرة الجاية
  useEffect(() => { setWho(null) }, [total, by])

  const show = (k: string | null, el: HTMLElement) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      // الصندوق بيطلع تحت الأيقونة وطرفه اليمين على طرفها (زي فيسبوك). لو مفيش مكان تحت بيطلع فوقها
      const r = el.getBoundingClientRect()
      const up = window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom
      setTip({ k, right: Math.max(8, window.innerWidth - r.right - 4), top: up ? r.top - 6 : r.bottom + 6, up })
      if (!who) setWho(await loadWho(postId, 60))
    }, 250)
  }
  const hide = () => { clearTimeout(timer.current); setTip(null) }
  if (!total) return null

  const list = (who ?? []).filter((w) => !tip?.k || w.reaction === tip.k)
  const tipTotal = tip?.k ? (by[tip.k] ?? 0) : total
  const shown = list.slice(0, 18)

  return (
    <>
      <button type="button" className="rxs" onClick={() => { hide(); setOpen(true) }} onMouseLeave={hide} aria-label={`عرض اللي تفاعلوا (${total})`}>
        <span className="rx-stack">
          {top.map((r) => <i key={r.k} style={{ width: 18, height: 18, fontSize: 13 }} onMouseEnter={(e) => show(r.k, e.currentTarget)}>{r.e}</i>)}
        </span>
        <span onMouseEnter={(e) => show(null, e.currentTarget)}>{total}</span>
      </button>
      {tip && createPortal(
        <div className="rxtip" role="tooltip" style={{ right: tip.right, top: tip.top, transform: tip.up ? 'translateY(-100%)' : undefined }}>
          {tip.k && <b>{labelOf(tip.k)}</b>}
          {!who && <span>…</span>}
          {shown.map((w) => <span key={w.user_id}>{w.profiles?.name ?? 'مستخدم'}</span>)}
          {who && tipTotal > shown.length && <span>و{tipTotal - shown.length} {tipTotal - shown.length === 1 ? 'شخص آخر' : 'أشخاص آخرين'}…</span>}
        </div>, document.body)}
      {open && <ReactorsModal postId={postId} by={by} total={total} me={me} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReactorsModal({ postId, by, total, me, onClose }: { postId: string; by: Record<string, number>; total: number; me: string; onClose: () => void }) {
  const [who, setWho] = useState<Who[] | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const { rels, request, accept } = useFriends()
  const { openChat } = useChatDock()
  const [asked, setAsked] = useState<Set<string>>(new Set())
  useEffect(() => { loadWho(postId, 500).then(setWho) }, [postId])
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
  const tabs = REACTIONS.filter((r) => (by[r.k] ?? 0) > 0).sort((a, b) => (by[b.k] ?? 0) - (by[a.k] ?? 0))
  const list = (who ?? []).filter((w) => !tab || w.reaction === tab)

  const action = (id: string) => {
    if (id === me) return null
    const r = rels.find((x) => x.other === id)
    if (r?.status === 'accepted') return <button className="btn sm" onClick={() => { onClose(); openChat(id) }}>💬 مراسلة</button>
    if (r?.incoming) return <button className="btn sm p" onClick={() => accept(id)}>قبول الطلب</button>
    if (r || asked.has(id)) return <button className="btn sm" disabled>تم إرسال الطلب</button>
    return <button className="btn sm" onClick={() => { setAsked((s) => new Set(s).add(id)); request(id) }}>+ إضافة صديق</button>
  }

  return createPortal(
    <div className="dlg-ov" onMouseDown={onClose}>
      <div className="dlg rxm" role="dialog" aria-modal="true" aria-label="اللي تفاعلوا مع المنشور" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rxm-h">
          <div className="rxm-tabs" role="tablist">
            <button role="tab" aria-selected={!tab} className={!tab ? 'on' : ''} onClick={() => setTab(null)}>الكل</button>
            {tabs.map((r) => (
              <button key={r.k} role="tab" aria-selected={tab === r.k} className={tab === r.k ? 'on' : ''} onClick={() => setTab(r.k)} title={r.t}>
                <span style={{ fontSize: 18 }}>{r.e}</span> {by[r.k]}
              </button>
            ))}
          </div>
          <button type="button" className="dlg-x" style={{ position: 'static', transform: 'none', flex: 'none' }} aria-label="إغلاق" onClick={onClose}>✕</button>
        </div>
        <div className="rxm-l">
          {!who && <div className="mut" style={{ textAlign: 'center', padding: 24 }}>جاري التحميل…</div>}
          {who && list.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 24 }}>مفيش حد.</div>}
          {list.map((w) => (
            <div key={w.user_id} className="row rxm-r">
              <Link to={`/u/${w.user_id}`} onClick={onClose} style={{ position: 'relative', display: 'inline-flex' }}>
                <Avatar name={w.profiles?.name} url={w.profiles?.avatar_url} size={44} />
                <span className="rxm-badge">{emojiOf(w.reaction)}</span>
              </Link>
              <Link to={`/u/${w.user_id}`} onClick={onClose} className="grow" style={{ fontWeight: 600, minWidth: 0 }}><Name p={w.profiles} /></Link>
              {action(w.user_id)}
            </div>
          ))}
          {who && !tab && total > who.length && <div className="mut" style={{ textAlign: 'center', padding: 10, fontSize: 13 }}>ظاهر أحدث {who.length} من {total}.</div>}
        </div>
      </div>
    </div>, document.body)
}
