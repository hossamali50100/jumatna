import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Group, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { Avatar, Err, gcolor } from '../lib/ui'
import { POST_SELECT, likedSet } from './Home'

type Pending = { user_id: string; profiles: { name: string; avatar_url: string | null } | null }

export default function GroupPage() {
  const { id } = useParams()
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const nav = useNavigate()
  const [g, setG] = useState<Group | null>(null)
  const [mem, setMem] = useState<{ role: string; status: string } | null>(null)
  const [count, setCount] = useState(0)
  const [posts, setPosts] = useState<Post[]>([])
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [pend, setPend] = useState<Pending[]>([])
  const [err, setErr] = useState('')
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const gid = id!
    const { data: grp } = await supabase.from('groups').select('*').eq('id', gid).maybeSingle()
    if (!grp) return setMissing(true)
    setMissing(false); setG(grp as Group)
    const [m, c, p] = await Promise.all([
      supabase.from('group_members').select('role,status').eq('group_id', gid).eq('user_id', uid).maybeSingle(),
      supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', gid).eq('status', 'active'),
      supabase.from('posts').select(POST_SELECT).eq('group_id', gid).order('created_at', { ascending: false }).limit(30),
    ])
    setMem(m.data as { role: string; status: string } | null); setCount(c.count ?? 0)
    if (p.error) setErr(errMsg(p.error))
    const list = (p.data as unknown as Post[]) ?? []
    setPosts(list); setLiked(await likedSet(list.map((x) => x.id), uid))
    if (m.data && ['owner', 'admin'].includes((m.data as { role: string }).role)) {
      const { data } = await supabase.from('group_members').select('user_id,profiles(name,avatar_url)').eq('group_id', gid).eq('status', 'pending')
      setPend((data as unknown as Pending[]) ?? [])
    }
  }, [id, uid])
  useEffect(() => { setG(null); load() }, [load])

  if (missing) return <div className="crd">المجموعة غير موجودة أو مش مسموح لك تشوفها.</div>
  if (!g) return <div className="mut" style={{ textAlign: 'center' }}>جاري التحميل…</div>

  const active = mem?.status === 'active'
  const isAdmin = active && ['owner', 'admin'].includes(mem!.role)
  const staff = !!profile && profile.role !== 'user'

  const join = async () => {
    const status = g.privacy === 'public' ? 'active' : 'pending'
    const { error } = await supabase.from('group_members').insert({ group_id: g.id, user_id: uid, role: 'member', status })
    if (error) setErr(errMsg(error)); else load()
  }
  const leave = async () => {
    if (!confirm('تغادر المجموعة؟')) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', uid)
    if (error) setErr(errMsg(error)); else nav('/')
  }
  const decide = async (u: string, ok: boolean) => {
    const { error } = ok
      ? await supabase.from('group_members').update({ status: 'active' }).eq('group_id', g.id).eq('user_id', u)
      : await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', u)
    if (error) setErr(errMsg(error)); else load()
  }
  const del = async () => {
    if (!confirm('حذف المجموعة وكل بوستاتها نهائيًا؟')) return
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setErr(errMsg(error)); else nav('/')
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 150, background: g.cover_url ? `center/cover url("${g.cover_url}")` : gcolor(g.name) }} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
            <div style={{ marginTop: -44, border: '4px solid #fff', borderRadius: 20, background: '#fff' }}><Avatar name={g.name} url={g.cover_url} size={72} square /></div>
            <div className="grow" style={{ lineHeight: 1.4 }}>
              <b style={{ fontSize: 22 }}>{g.name}</b>
              <div className="mut">{g.privacy === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة'} · {count} عضو</div>
            </div>
          </div>
          {g.description && <div className="body" style={{ fontSize: 15 }}>{g.description}</div>}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {!mem && <button className="btn p" onClick={join}>{g.privacy === 'public' ? 'انضم' : 'طلب انضمام'}</button>}
            {mem?.status === 'pending' && <span className="pill">طلبك بانتظار موافقة المشرف</span>}
            {active && mem!.role !== 'owner' && <button className="btn" onClick={leave}>مغادرة المجموعة</button>}
            {(mem?.role === 'owner' || profile?.role === 'admin') && <button className="btn danger" onClick={del}>حذف المجموعة</button>}
          </div>
        </div>
      </div>
      <Err>{err}</Err>
      {isAdmin && pend.length > 0 && (
        <div className="crd col"><b>طلبات الانضمام ({pend.length})</b>
          {pend.map((r) => (
            <div key={r.user_id} className="row"><Avatar name={r.profiles?.name} url={r.profiles?.avatar_url} size={40} /><span className="grow">{r.profiles?.name}</span>
              <button className="btn p sm" onClick={() => decide(r.user_id, true)}>قبول</button>
              <button className="btn sm" onClick={() => decide(r.user_id, false)}>رفض</button></div>
          ))}
        </div>
      )}
      {active && <Composer groups={[{ id: g.id, name: g.name }]} defaultGroup={g.id} onPosted={load} />}
      {posts.length === 0 && <div className="crd mut" style={{ textAlign: 'center' }}>مفيش بوستات لسه.</div>}
      {posts.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} canModerate={isAdmin || staff} onDeleted={(x) => setPosts((l) => l.filter((y) => y.id !== x))} />)}
    </>
  )
}
