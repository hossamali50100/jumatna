import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHides } from '../lib/hides'
import { Avatar } from '../lib/ui'

type Row = { kind: 'user' | 'group'; id: string; name: string; avatar: string | null }

// المنشورات المخفية: الأشخاص والمجموعات اللي طلبت ماتشوفش منشوراتهم، وزرار "إظهار"
export default function Hidden() {
  const { rows, unhide } = useHides()
  const [info, setInfo] = useState<Record<string, { name: string; avatar: string | null }>>({})
  useEffect(() => {
    const u = rows.filter((r) => r.kind === 'user').map((r) => r.target_id)
    const g = rows.filter((r) => r.kind === 'group').map((r) => r.target_id)
    ;(async () => {
      const out: Record<string, { name: string; avatar: string | null }> = {}
      if (u.length) (await supabase.from('profiles').select('id,name,avatar_url').in('id', u)).data?.forEach((p) => { out['user:' + p.id] = { name: p.name, avatar: p.avatar_url } })
      if (g.length) (await supabase.from('groups').select('id,name,cover_url').in('id', g)).data?.forEach((p) => { out['group:' + p.id] = { name: p.name, avatar: p.cover_url } })
      setInfo(out)
    })()
  }, [rows])
  const list: Row[] = rows.map((r) => ({ kind: r.kind, id: r.target_id, name: info[r.kind + ':' + r.target_id]?.name ?? '…', avatar: info[r.kind + ':' + r.target_id]?.avatar ?? null }))
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="crd col">
        <b style={{ fontSize: 22 }}>المنشورات المخفية</b>
        <span className="mut">منشورات الأشخاص والمجموعات دول مش بتظهر في صفحتك الرئيسية. اضغط "إظهار" لو عايزها ترجع.</span>
        {list.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 24 }}>مفيش حاجة مخفية.</div>}
        {list.map((r) => (
          <div key={r.kind + r.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid #F0F0F2' }}>
            <Link to={r.kind === 'user' ? `/u/${r.id}` : `/g/${r.id}`}><Avatar name={r.name} url={r.avatar} size={44} square={r.kind === 'group'} /></Link>
            <span className="grow col" style={{ gap: 0 }}><b>{r.name}</b><span className="mut" style={{ fontSize: 13 }}>{r.kind === 'user' ? 'شخص' : 'مجموعة'}</span></span>
            <button className="btn sm" onClick={() => unhide(r.kind, r.id)}>إظهار</button>
          </div>
        ))}
      </div>
    </div>
  )
}
