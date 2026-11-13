import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar, AvatarOn, Icon, Name } from '../lib/ui'
import { useOnline, usePresenceError } from '../lib/presence'
import { useFriends } from '../lib/friends'
import ChatMenu from './ChatMenu'
import RoomMenu from './RoomMenu'
import Thread from './Thread'
import { isRoom, roomKey, useRoom } from '../lib/rooms'
import { useConvItems } from '../lib/convs'
import { useChatPrefs } from '../lib/chatprefs'

type P = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Win = { id: string; min: boolean }
const PANEL = 340
const Ctx = createContext<{ openChat: (id: string) => void }>({ openChat: () => {} })
export const useChatDock = () => useContext(Ctx)

const MAX = 12 // أقصى عدد محادثات (اللي فوق عدد النوافذ اللي بتساع بتبقى فقاعات صغيرة)

function ChatWindow({ id, index, base, min, onMin, onClose }: { id: string; index: number; base: number; min: boolean; onMin: () => void; onClose: () => void }) {
  const [p, setP] = useState<P | null>(null)
  const { openChat: onRoomMade } = useChatDock()
  const online = useOnline([id]).has(id)
  const isR = isRoom(id)
  const { room } = useRoom(isR ? roomKey(id) : null)
  useEffect(() => { if (isR) return; supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', id).maybeSingle().then(({ data }) => setP((data as P) ?? null)) }, [id, isR])
  return (
    <div role="dialog" aria-label="محادثة" style={{ position: 'fixed', bottom: 0, left: base + index * 352, width: 340, zIndex: 60, background: '#fff', borderRadius: '14px 14px 0 0', boxShadow: '0 0 12px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column' }}>
      <div className="row" onClick={onMin} style={{ padding: '8px 12px', borderBottom: min ? 0 : '1px solid #E4E4E7', gap: 8, cursor: 'pointer' }}>
        {isR ? (<>
          <span className="row" style={{ minWidth: 0, gap: 8 }}>
            <Avatar name={room?.name} url={room?.avatar_url} size={32} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room?.name ?? '…'}</b>
              <span className="mut" style={{ fontSize: 12 }}>{room ? `${room.members.length} أعضاء` : ''}</span>
            </span>
          </span>
          {room && <RoomMenu room={room} onLeft={onClose} />}
        </>) : (<>
          <Link to={`/u/${id}`} onClick={(e) => e.stopPropagation()} className="row" style={{ minWidth: 0, gap: 8 }}>
            <AvatarOn online={online}><Avatar name={p?.name} url={p?.avatar_url} size={32} /></AvatarOn>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Name p={p} /></b>
              <span style={{ fontSize: 12, color: online ? '#16A34A' : '#65676B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22C55E' : '#BCC0C4', display: 'inline-block' }} />{online ? 'متصل الآن' : 'غير متصل'}
              </span>
            </span>
          </Link>
          <ChatMenu otherId={id} name={p?.name} onRoom={onRoomMade} />
        </>)}
        <span className="grow" />
        <Link to={`/messages/${id}`} onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="فتح في صفحة الرسائل" title="فتح في صفحة الرسائل" style={{ display: 'grid', placeItems: 'center', width: 28, height: 28 }}><Icon n="msg" s={20} /></Link>
        <button onClick={(e) => { e.stopPropagation(); onMin() }} aria-label={min ? 'تكبير' : 'تصغير'} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}>{min ? '▢' : '–'}</button>
        <button onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="إغلاق" style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
      </div>
      {!min && <div style={{ padding: 8 }}><Thread id={id} height={300} /></div>}
    </div>
  )
}

// شات صغير عايم زي فيسبوك (للكمبيوتر بس)
export function ChatDockProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [wins, setWins] = useState<Win[]>([])
  const openChat = useCallback((id: string) => {
    setWins((w) => [{ id, min: false }, ...w.filter((x) => x.id !== id)].slice(0, MAX))
  }, [])
  const loc = useLocation()
  // رسالة جديدة وصلتني: نفتح نافذتها المصغرة تلقائيًا (لو مش مفتوحة)
  const onPage = !loc.pathname.startsWith('/messages') && !loc.pathname.startsWith('/admin')
  useEffect(() => {
    if (!enabled || !onPage) return
    const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; setWins((w) => w.some((x) => x.id === id) ? w : [{ id, min: false }, ...w].slice(0, MAX)) }
    window.addEventListener('jm:incoming', f); return () => window.removeEventListener('jm:incoming', f)
  }, [enabled, onPage])
  // احتياطي: لو عدّاد الرسائل غير المقروءة زاد لأي محادثة، نفتح نافذتها المصغرة
  const { items: convItems } = useConvItems()
  const { muted } = useChatPrefs()
  const prevUnread = useRef<Record<string, number> | null>(null)
  useEffect(() => {
    const cur: Record<string, number> = Object.fromEntries(convItems.map((i) => [i.other, i.unread]))
    const prev = prevUnread.current
    if (convItems.length) prevUnread.current = cur
    if (!prev || !enabled || !onPage) return
    const add = convItems.filter((i) => i.unread > (prev[i.other] ?? 0) && !muted.has(i.other)).map((i) => i.other)
    if (add.length) setWins((w) => { let n = w; for (const id of add) if (!n.some((x) => x.id === id)) n = [{ id, min: false }, ...n]; return n.slice(0, MAX) })
  }, [convItems, enabled, onPage, muted])
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem('contacts-open'); return v === null ? false : v === '1' } catch { return true } })
  const toggle = (v: boolean) => { setOpen(v); try { localStorage.setItem('contacts-open', v ? '1' : '0') } catch { /* ignore */ } }
  const eligible = enabled && !loc.pathname.startsWith('/messages') && !loc.pathname.startsWith('/admin')
  const left0 = eligible ? 20 + PANEL + 12 : 20
  const visible = Math.max(1, Math.min(3, Math.floor((vw - left0 - 30) / 352)))
  return (
    <Ctx.Provider value={{ openChat }}>
      {children}
      {enabled && (
        <div className="dockcol">
          {eligible && <ContactsPanel open={open} onToggle={toggle} onPick={openChat} />}
          {wins.slice(visible).map((w) => <Bubble key={w.id} id={w.id} onOpen={() => openChat(w.id)} onClose={() => setWins((l) => l.filter((x) => x.id !== w.id))} />)}
        </div>
      )}
      {enabled && wins.slice(0, visible).map((w, i) => (
        <ChatWindow key={w.id} id={w.id} index={i} base={left0} min={w.min}
          onMin={() => setWins((l) => l.map((x) => x.id === w.id ? { ...x, min: !x.min } : x))}
          onClose={() => setWins((l) => l.filter((x) => x.id !== w.id))} />
      ))}
    </Ctx.Provider>
  )
}


// فقاعة صغيرة لمحادثة مفتوحة مش لاقية مكان كنافذة (زي ماسنجر)
function Bubble({ id, onOpen, onClose }: { id: string; onOpen: () => void; onClose: () => void }) {
  const [p, setP] = useState<P | null>(null)
  const { room } = useRoom(isRoom(id) ? roomKey(id) : null)
  useEffect(() => { if (isRoom(id)) return; supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', id).maybeSingle().then(({ data }) => setP((data as P) ?? null)) }, [id])
  return (
    <div className="bub">
      <button type="button" onClick={onOpen} aria-label={`فتح محادثة ${p?.name ?? ''}`} title={room?.name ?? p?.name}><Avatar name={room?.name ?? p?.name} url={room ? room.avatar_url : p?.avatar_url} size={48} /></button>
      <button type="button" className="bub-x" onClick={onClose} aria-label="إغلاق">✕</button>
    </div>
  )
}

// نافذة صغيرة تحت على الشمال (زي الشات المصغر) فيها الأصدقاء المتصلين
function ContactsPanel({ open, onToggle, onPick }: { open: boolean; onToggle: (v: boolean) => void; onPick: (id: string) => void }) {
  const { rels } = useFriends()
  const friends = rels.filter((r) => r.status === 'accepted')
  const online = useOnline(friends.map((f) => f.other))
  const list = friends.filter((f) => online.has(f.other))
  const perr = usePresenceError()
  return (
    <aside aria-label="الأصدقاء المتصلين" className="contacts">
      <button type="button" className="ct-head" aria-expanded={open} onClick={() => onToggle(!open)}>
        <Icon n="friends" s={20} />
        <b className="grow" style={{ textAlign: 'start' }}>الأصدقاء المتصلون</b>
        {list.length > 0 && <span className="ct-n">{list.length}</span>}
      </button>
      {open && (
        <div className="ct-list">
          {list.length === 0 && <div className="mut" style={{ padding: '16px 12px', fontSize: 15, lineHeight: 1.7 }}>{perr || 'مفيش أصدقاء متصلين دلوقتي. الصديق بيظهر هنا لما يكون فاتح الموقع.'}</div>}
          {list.map((f) => (
            <button key={f.other} className="ct-row" onClick={() => onPick(f.other)}>
              <AvatarOn online><Avatar name={f.profile?.name} url={f.profile?.avatar_url} size={40} /></AvatarOn>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}><Name p={f.profile} /></span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
