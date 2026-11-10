import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends, type PubProfile } from '../lib/friends'
import { Avatar, Err, Name } from '../lib/ui'

type Found = { id: string; name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null }
type Inv = { group_id: string; groups: { name: string } | null; profiles: { name: string } | null }

const P = (p: PubProfile | null) => p

export default function Friends() {
  const { session } = useAuth()
  const uid = session!.user.id
  const { rels, error, request, accept, remove } = useFriends()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [invs, setInvs] = useState<Inv[]>([])
  const [err, setErr] = useState('')

  const loadInv = useCallback(async () => {
    const { data, error } = await supabase.from('group_invites').select('group_id,groups!group_id(name),profiles!inviter_id(name)').eq('invitee_id', uid).order('created_at', { ascending: false })
    if (error) return setErr(errMsg(error))
    setInvs((data as unknown as Inv[]) ?? [])
  }, [uid])
  useEffect(() => { loadInv() }, [loadInv])

  useEffect(() => {
    const t = q.trim().replace(/[%_,()]/g, ' ')
    if (t.length < 2) { setFound([]); return }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,name,avatar_url,plan,plan_until').ilike('name', `%${t}%`).neq('id', uid).limit(10)
      setFound((data as Found[]) ?? [])
    }, 300)
    return () => clearTimeout(h)
  }, [q, uid])

  const answer = async (gid: string, ok: boolean) => {
    setErr('')
    const { error } = ok ? await supabase.rpc('accept_group_invite', { gid }) : await supabase.from('group_invites').delete().eq('group_id', gid).eq('invitee_id', uid)
    if (error) setErr(errMsg(error)); else loadInv()
  }

  const incoming = rels.filter((r) => r.status === 'pending' && r.incoming)
  const sent = rels.filter((r) => r.status === 'pending' && !r.incoming)
  const friends = rels.filter((r) => r.status === 'accepted')
  const relOf = (id: string) => rels.find((r) => r.other === id)

  return (
    <>
      <Err>{error || err}</Err>
      {invs.length > 0 && (
        <div className="crd col"><b>دعوات للمجموعات ({invs.length})</b>
          {invs.map((i) => (
            <div key={i.group_id} className="row">
              <Avatar name={i.groups?.name} size={44} square />
              <span className="grow" style={{ lineHeight: 1.5 }}><b>{i.groups?.name ?? 'مجموعة خاصة'}</b><div className="mut">دعوة من {i.profiles?.name ?? 'صديق'}</div></span>
              <button className="btn p sm" onClick={() => answer(i.group_id, true)}>انضمام</button>
              <button className="btn sm" onClick={() => answer(i.group_id, false)}>رفض</button>
            </div>
          ))}
        </div>
      )}
      {incoming.length > 0 && (
        <div className="crd col"><b>طلبات صداقة ({incoming.length})</b>
          {incoming.map((r) => (
            <div key={r.other} className="row"><Link to={`/u/${r.other}`} className="row grow"><Avatar name={P(r.profile)?.name} url={P(r.profile)?.avatar_url} size={44} /><Name p={r.profile} /></Link>
              <button className="btn p sm" onClick={() => accept(r.other)}>قبول</button>
              <button className="btn sm" onClick={() => remove(r.other)}>رفض</button></div>
          ))}
        </div>
      )}
      <div className="crd col">
        <b>ابحث عن أصدقاء</b>
        <input className="in" placeholder="اكتب اسم الشخص…" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.map((f) => {
          const r = relOf(f.id)
          return (
            <div key={f.id} className="row"><Link to={`/u/${f.id}`} className="row grow"><Avatar name={f.name} url={f.avatar_url} size={44} /><Name p={f} /></Link>
              {!r && <button className="btn p sm" onClick={() => request(f.id)}>إضافة صديق</button>}
              {r?.status === 'accepted' && <span className="pill">صديق</span>}
              {r?.status === 'pending' && !r.incoming && <button className="btn sm" onClick={() => remove(f.id)}>إلغاء الطلب</button>}
              {r?.status === 'pending' && r.incoming && <button className="btn p sm" onClick={() => accept(f.id)}>قبول</button>}
            </div>
          )
        })}
        {q.trim().length >= 2 && found.length === 0 && <span className="mut">مفيش نتائج.</span>}
      </div>
      <div className="crd col">
        <b>أصدقائي ({friends.length})</b>
        {friends.length === 0 && <span className="mut">لسه مفيش أصدقاء. ابحث بالاسم فوق وابعت طلب صداقة.</span>}
        {friends.map((r) => (
          <div key={r.other} className="row"><Link to={`/u/${r.other}`} className="row grow"><Avatar name={P(r.profile)?.name} url={P(r.profile)?.avatar_url} size={44} /><Name p={r.profile} /></Link>
            <button className="btn sm danger" onClick={() => confirm('حذف الصديق؟') && remove(r.other)}>حذف</button></div>
        ))}
      </div>
      {sent.length > 0 && (
        <div className="crd col"><b>طلبات أرسلتها</b>
          {sent.map((r) => (
            <div key={r.other} className="row"><Link to={`/u/${r.other}`} className="row grow"><Avatar name={P(r.profile)?.name} url={P(r.profile)?.avatar_url} size={40} /><Name p={r.profile} /></Link>
              <button className="btn sm" onClick={() => remove(r.other)}>إلغاء</button></div>
          ))}
        </div>
      )}
      <Link className="mut" to="/discover" style={{ textAlign: 'center' }}>أو اكتشف مجموعات جديدة</Link>
    </>
  )
}
