import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Group, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { Avatar, Err } from '../components/ui'
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
    setG(grp as Group)
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
  useEffect(() => { load() }, [load])

  if (missing) return <div className="card">المجموعة غير موجودة أو مش مسموح لك تشوفها.</div>
  if (!g) return <div className="mut">جاري التحميل…</div>

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
    <div className="col">
      <div className="cover" style={g.cover_url ? { backgroundImage: `url("${g.cover_url}")` } : undefined} />
      <div className="card col" style={{ gap: 8 }}>
        <div className="row"><b className="grow" style={{ fontSize: 20 }}>{g.name}</b><span className="pill">{g.privacy === 'public' ? 'عامة' : 'خاصة'}</span></div>
        {g.description && <div className="body">{g.description}</div>}
        <div className="mut">{count} عضو</div>
        <div className="row">
          {!mem && <button className="btn p" onClick={join}>{g.privacy === 'public' ? 'انضمام' : 'طلب انضمام'}</button>}
          {mem?.status === 'pending' && <span className="mut">طلبك بانتظار موافقة المشرف</span>}
          {active && mem!.role !== 'owner' && <button className="btn" onClick={leave}>مغادرة</button>}
          {(mem?.role === 'owner' || profile?.role === 'admin') && <button className="btn danger" onClick={del}>حذف المجموعة</button>}
        </div>
      </div>
      <Err>{err}</Err>
      {isAdmin && pend.length > 0 && (
        <div className="card col"><b>طلبات الانضمام ({pend.length})</b>
          {pend.map((r) => (
            <div key={r.user_id} className="row"><Avatar name={r.profiles?.name} url={r.profiles?.avatar_url} size={34} /><span className="grow">{r.profiles?.name}</span>
              <button className="btn p sm" onClick={() => decide(r.user_id, true)}>قبول</button>
              <button className="btn sm" onClick={() => decide(r.user_id, false)}>رفض</button></div>
          ))}
        </div>
      )}
      {active && <Composer groupId={g.id} onPosted={load} />}
      {posts.length === 0 && <div className="card mut">مفيش بوستات لسه.</div>}
      {posts.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} canModerate={isAdmin || staff} onDeleted={(x) => setPosts((l) => l.filter((y) => y.id !== x))} />)}
    </div>
  )
}
