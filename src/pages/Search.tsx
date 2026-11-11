import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, type Group } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends } from '../lib/friends'
import { Avatar, Err, Icon, Name } from '../lib/ui'

type Person = { id: string; name: string; avatar_url: string | null; bio: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Kind = 'all' | 'people' | 'groups'
const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&')

// صفحة البحث: أشخاص + مجموعات، وفلتر على اليمين يحدد البحث في إيه
export default function Search() {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels, request, accept, remove } = useFriends()
  const [sp, setSp] = useSearchParams()
  const q = (sp.get('q') ?? '').slice(0, 60)
  const kind = (['people', 'groups'].includes(sp.get('type') ?? '') ? sp.get('type') : 'all') as Kind
  const [people, setPeople] = useState<Person[] | null>(null)
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [mine, setMine] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [text, setText] = useState(q)
  useEffect(() => setText(q), [q])

  useEffect(() => {
    const term = q.trim()
    if (!term) { setPeople([]); setGroups([]); return }
    let live = true
    setErr('')
    const lim = kind === 'all' ? 5 : 40
    ;(async () => {
      const [p, g, m] = await Promise.all([
        kind === 'groups' ? null : supabase.from('profiles').select('id,name,avatar_url,bio,plan,plan_until').ilike('name', `%${esc(term)}%`).neq('id', uid).order('name').limit(lim),
        kind === 'people' ? null : supabase.from('groups').select('*').ilike('name', `%${esc(term)}%`).order('created_at', { ascending: false }).limit(lim),
        supabase.from('group_members').select('group_id,status').eq('user_id', uid),
      ])
      if (!live) return
      if (p?.error) setErr(errMsg(p.error)); if (g?.error) setErr(errMsg(g.error))
      setPeople(kind === 'groups' ? [] : ((p?.data as Person[]) ?? []))
      setGroups(kind === 'people' ? [] : ((g?.data as Group[]) ?? []))
      setMine(Object.fromEntries((m.data ?? []).map((r) => [r.group_id, r.status])))
    })()
    return () => { live = false }
  }, [q, kind, uid])

  const go = (nq: string, nk: Kind) => { const o: Record<string, string> = {}; if (nq.trim()) o.q = nq.trim(); if (nk !== 'all') o.type = nk; setSp(o, { replace: true }) }
  const join = async (g: Group) => {
    const status = g.privacy === 'public' ? 'active' : 'pending'
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: uid, role: 'member', status })
    if (error) return setErr(errMsg(error))
    setMine((m) => ({ ...m, [g.id]: status }))
  }
  const btn = (id: string) => {
    const r = rels.find((x) => x.other === id)
    if (!r) return <button className="btn sm p" onClick={() => request(id)}>إضافة صديق</button>
    if (r.status === 'accepted') return <Link className="btn sm" to={`/u/${id}`}>الصفحة الشخصية</Link>
    if (r.incoming) return <button className="btn sm p" onClick={() => accept(id)}>قبول الطلب</button>
    return <button className="btn sm" onClick={() => remove(id)}>إلغاء الطلب</button>
  }
  const opts: [Kind, string, string][] = [['all', 'الكل', 'search'], ['people', 'الأشخاص', 'friends'], ['groups', 'المجموعات', 'groups']]
  const loading = people === null || groups === null
  const none = !loading && !people!.length && !groups!.length

  return (
    <div className="srch">
      <aside className="card srch-f">
        <b style={{ fontSize: 20 }}>نتائج البحث</b>
        <form onSubmit={(e) => { e.preventDefault(); go(text, kind) }} className="dsearch" style={{ display: 'flex', maxWidth: 'none', width: '100%', boxSizing: 'border-box' }}>
          <Icon n="search" s={18} /><input value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="ابحث في جمعتنا" aria-label="بحث" />
        </form>
        <div className="hr" />
        <b style={{ fontSize: 15 }}>تصفية حسب</b>
        {opts.map(([k, t, ic]) => (
          <button key={k} className={'srch-o' + (kind === k ? ' on' : '')} onClick={() => go(q, k)}>
            <span className="srch-i"><Icon n={ic} s={20} on={kind === k} /></span>{t}
          </button>
        ))}
      </aside>

      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <Err>{err}</Err>
        {!q.trim() && <div className="card mut" style={{ textAlign: 'center' }}>اكتب اسم شخص أو مجموعة في خانة البحث.</div>}
        {q.trim() && loading && !err && <div className="mut" style={{ textAlign: 'center' }}>جاري التحميل…</div>}
        {q.trim() && none && <div className="card mut" style={{ textAlign: 'center' }}>مفيش نتائج لـ «{q}».</div>}

        {!!people?.length && (
          <section className="card">
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>الأشخاص</h2>
            {people.map((p) => (
              <div key={p.id} className="row srch-r">
                <Link to={`/u/${p.id}`}><Avatar name={p.name} url={p.avatar_url} size={64} /></Link>
                <Link to={`/u/${p.id}`} className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17 }}><Name p={p} /></div>
                  {p.bio && <div className="mut" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.bio}</div>}
                </Link>
                {btn(p.id)}
              </div>
            ))}
            {kind === 'all' && people.length >= 5 && <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => go(q, 'people')}>عرض كل الأشخاص</button>}
          </section>
        )}

        {!!groups?.length && (
          <section className="card">
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>المجموعات</h2>
            {groups.map((g) => (
              <div key={g.id} className="row srch-r">
                <Link to={`/g/${g.id}`}><Avatar name={g.name} url={g.cover_url} size={64} square /></Link>
                <Link to={`/g/${g.id}`} className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17 }}><b>{g.name}</b></div>
                  <div className="mut" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.privacy === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة'}{g.description ? ' · ' + g.description : ''}</div>
                </Link>
                {mine[g.id] === 'active' ? <Link className="btn sm" to={`/g/${g.id}`}>فتح</Link>
                  : mine[g.id] === 'pending' ? <button className="btn sm" disabled>بانتظار الموافقة</button>
                  : <button className="btn sm p" onClick={() => join(g)}>{g.privacy === 'public' ? 'انضمام' : 'طلب انضمام'}</button>}
              </div>
            ))}
            {kind === 'all' && groups.length >= 5 && <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => go(q, 'groups')}>عرض كل المجموعات</button>}
          </section>
        )}
      </div>
    </div>
  )
}
