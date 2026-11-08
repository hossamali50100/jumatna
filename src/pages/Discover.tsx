import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, type Group } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Err } from '../components/ui'

export default function Discover() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [sp] = useSearchParams()
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
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: uid, role: 'member', status: g.privacy === 'public' ? 'active' : 'pending' })
    if (error) return setErr(errMsg(error))
    setMine((m) => ({ ...m, [g.id]: g.privacy === 'public' ? 'active' : 'pending' }))
  }

  return (
    <div className="col">
      <b style={{ fontSize: 20 }}>{q ? `نتائج: ${q}` : 'اكتشف المجموعات'}</b>
      <Err>{err}</Err>
      {groups === null && !err && <div className="mut">جاري التحميل…</div>}
      {groups?.length === 0 && <div className="card mut">مفيش مجموعات مطابقة.</div>}
      {groups?.map((g) => (
        <div key={g.id} className="card row">
          <Link to={`/g/${g.id}`} className="grow col" style={{ gap: 2 }}>
            <b>{g.name}</b><span className="mut">{g.description.slice(0, 90)}</span>
            <span><span className="pill">{g.privacy === 'public' ? 'عامة' : 'خاصة'}</span></span>
          </Link>
          {mine[g.id] === 'active' ? <Link className="btn sm" to={`/g/${g.id}`}>فتح</Link>
            : mine[g.id] === 'pending' ? <span className="mut">بانتظار الموافقة</span>
            : <button className="btn p sm" onClick={() => join(g)}>{g.privacy === 'public' ? 'انضمام' : 'طلب انضمام'}</button>}
        </div>
      ))}
    </div>
  )
}
