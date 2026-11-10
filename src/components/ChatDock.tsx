import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar, Icon, Name } from '../lib/ui'
import DmThread from './DmThread'

type P = { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Win = { id: string; min: boolean }
const Ctx = createContext<{ openChat: (id: string) => void }>({ openChat: () => {} })
export const useChatDock = () => useContext(Ctx)

const MAX = 3 // أقصى عدد نوافذ شات مفتوحة مع بعض

function ChatWindow({ id, index, min, onMin, onClose }: { id: string; index: number; min: boolean; onMin: () => void; onClose: () => void }) {
  const [p, setP] = useState<P | null>(null)
  useEffect(() => { supabase.from('profiles').select('name,avatar_url,plan,plan_until').eq('id', id).maybeSingle().then(({ data }) => setP((data as P) ?? null)) }, [id])
  return (
    <div role="dialog" aria-label="محادثة" style={{ position: 'fixed', bottom: 0, left: 20 + index * 352, width: 340, zIndex: 60, background: '#fff', borderRadius: '14px 14px 0 0', boxShadow: '0 0 12px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '8px 12px', borderBottom: min ? 0 : '1px solid #E4E4E7', gap: 8 }}>
        <Link to={`/u/${id}`} className="row grow" style={{ minWidth: 0 }}><Avatar name={p?.name} url={p?.avatar_url} size={32} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Name p={p} /></span></Link>
        <Link to={`/messages/${id}`} onClick={onClose} aria-label="فتح في صفحة كاملة" title="فتح في صفحة كاملة" style={{ display: 'grid', placeItems: 'center' }}><Icon n="menu" s={18} /></Link>
        <button onClick={onMin} aria-label={min ? 'تكبير' : 'تصغير'} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}>{min ? '▢' : '–'}</button>
        <button onClick={onClose} aria-label="إغلاق" style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
      </div>
      {!min && <div style={{ padding: 8 }}><DmThread otherId={id} height={300} /></div>}
    </div>
  )
}

// شات صغير عايم زي فيسبوك (للكمبيوتر بس)
export function ChatDockProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [wins, setWins] = useState<Win[]>([])
  const openChat = useCallback((id: string) => {
    setWins((w) => w.some((x) => x.id === id) ? w.map((x) => x.id === id ? { ...x, min: false } : x) : [{ id, min: false }, ...w].slice(0, MAX))
  }, [])
  return (
    <Ctx.Provider value={{ openChat }}>
      {children}
      {enabled && wins.map((w, i) => (
        <ChatWindow key={w.id} id={w.id} index={i} min={w.min}
          onMin={() => setWins((l) => l.map((x) => x.id === w.id ? { ...x, min: !x.min } : x))}
          onClose={() => setWins((l) => l.filter((x) => x.id !== w.id))} />
      ))}
    </Ctx.Provider>
  )
}
