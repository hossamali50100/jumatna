import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, type Group } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err, gcolor, initial } from '../lib/ui'

export function GroupCard({ g, state, onJoin }: { g: Group; state?: string; onJoin?: (g: Group) => void }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 80, background: g.cover_url ? `center/cover url("${g.cover_url}")` : gcolor(g.name) }} />
      <div style={{ padding: 16 }}>
        <Link to={`/g/${g.id}`}><b style={{ fontSize: 18 }}>{g.name}</b></Link>
        <div className="mut" style={{ margin: '4px 0' }}>{g.privacy === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة'}</div>
        <p style={{ fontSize: 14, margin: '0 0 12px', color: '#3F3F46', minHeight: 21 }}>{g.description.slice(0, 90)}</p>
        {state === 'active' ? <Link className="btn" style={{ width: '100%' }} to={`/g/${g.id}`}>انضممت ✓ — فتح</Link>
          : state === 'pending' ? <button className="btn" style={{ width: '100%' }} disabled>بانتظار الموافقة</button>
          : onJoin ? <button className="btn p" style={{ width: '100%' }} onClick={() => onJoin(g)}>{g.privacy === 'public' ? 'انضم' : 'طلب انضمام'}</button> : null}
      </div>
    </div>
  )
}
export { initial }

export default function Discover() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [sp, setSp] = useSearchParams()
  const q = (sp.get('q') ?? '').slice(0, 60)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [mine, setMine] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    let query = supabase.from('groups').select('*').order('created_at', { ascending: false }).limit(40)
    if (q) query = query.ilike('name', `%${q.replace(/[\\%_]/g, '\\$&')}%`)
    const [g, m] = await Promise.all([query, supabase.from('group_members').select('group_id,status').eq('user_id', uid)])
    if (g.error) return setErr(errMsg(g.error))
    setGroups((g.data as Group[]) ?? [])
    setMine(Object.fromEntries((m.data ?? []).map((r) => [r.group_id, r.status])))
  }, [q, uid])
  useEffect(() => { load() }, [load])

  const join = async (g: Group) => {
    const status = g.privacy === 'public' ? 'active' : 'pending'
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: uid, role: 'member', status })
    if (error) return setErr(errMsg(error))
    setMine((m) => ({ ...m, [g.id]: status }))
  }

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 26 }}>اكتشف مجموعات</h1>
      <input className="in" placeholder="ابحث عن مجموعة" aria-label="ابحث" value={q} maxLength={60} onChange={(e) => setSp(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
      <Err>{err}</Err>
      {groups === null && !err && <div className="mut" style={{ textAlign: 'center' }}>جاري التحميل…</div>}
      {groups?.length === 0 && <div className="crd mut" style={{ textAlign: 'center' }}>مفيش مجموعات مطابقة.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
        {groups?.map((g) => <GroupCard key={g.id} g={g} state={mine[g.id]} onJoin={join} />)}
      </div>
    </>
  )
}
