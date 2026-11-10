import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, uploadImage, type Group, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { Avatar, Err, Icon, Name, gcolor, useIsMobile } from '../lib/ui'
import { POST_SELECT, likedSet } from './Home'
import { useFriends } from '../lib/friends'

type Member = { user_id: string; role: string; profiles: { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null } | null }
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
  const mobile = useIsMobile()
  const [tab, setTab] = useState<'talk' | 'media' | 'members' | 'requests'>('talk')
  const [members, setMembers] = useState<Member[]>([])
  const [media, setMedia] = useState<{ id: string; image_url: string }[]>([])
  const [invite, setInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const { rels } = useFriends()
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())

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
      const { data } = await supabase.from('group_members').select('user_id,profiles!user_id(name,avatar_url)').eq('group_id', gid).eq('status', 'pending')
      setPend((data as unknown as Pending[]) ?? [])
    }
  }, [id, uid])
  useEffect(() => { setG(null); setTab('talk'); setInvite(false); load() }, [load])
  useEffect(() => {
    if (!g) return
    if (tab === 'members') {
      supabase.from('group_members').select('user_id,role,profiles!user_id(name,avatar_url,plan,plan_until)').eq('group_id', g.id).eq('status', 'active').order('created_at', { ascending: true }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setMembers((data as unknown as Member[]) ?? []) })
    }
    if (tab === 'media') {
      supabase.from('posts').select('id,image_url').eq('group_id', g.id).not('image_url', 'is', null).order('created_at', { ascending: false }).limit(60).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setMedia((data as { id: string; image_url: string }[]) ?? []) })
    }
  }, [tab, g?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const friendsList = rels.filter((r) => r.status === 'accepted')
  const openInvite = async () => {
    const next = !invite; setInvite(next)
    if (!next) return
    const [m, i] = await Promise.all([
      supabase.from('group_members').select('user_id').eq('group_id', g.id),
      supabase.from('group_invites').select('invitee_id').eq('group_id', g.id).eq('inviter_id', uid),
    ])
    setMemberIds(new Set(((m.data ?? []) as { user_id: string }[]).map((x) => x.user_id)))
    setInvited(new Set(((i.data ?? []) as { invitee_id: string }[]).map((x) => x.invitee_id)))
  }
  const inviteFriend = async (u: string) => {
    const { error } = await supabase.from('group_invites').insert({ group_id: g.id, inviter_id: uid, invitee_id: u })
    if (error) setErr(errMsg(error)); else setInvited((x) => new Set(x).add(u))
  }
  const link = `${window.location.origin}/g/${g.id}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('انسخ الرابط:', link) }
  }
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: g.name, text: `انضم لمجموعة "${g.name}" على جمعتنا`, url: link }); return } catch { /* المستخدم لغى */ } }
    copy()
  }
  const changeCover = async (f?: File | null) => {
    if (!f) return
    try {
      const url = await uploadImage(f, uid)
      const { error } = await supabase.from('groups').update({ cover_url: url }).eq('id', g.id)
      if (error) throw error
      setG({ ...g, cover_url: url })
    } catch (e) { setErr(errMsg(e)) }
  }
  const setRole = async (u: string, role: 'admin' | 'member') => {
    const { error } = await supabase.from('group_members').update({ role }).eq('group_id', g.id).eq('user_id', u)
    if (error) setErr(errMsg(error)); else setMembers((l) => l.map((m) => (m.user_id === u ? { ...m, role } : m)))
  }
  const kick = async (u: string) => {
    if (!confirm('إزالة العضو من المجموعة؟')) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', u)
    if (error) setErr(errMsg(error)); else { setMembers((l) => l.filter((m) => m.user_id !== u)); setCount((c) => c - 1) }
  }
  const del = async () => {
    if (!confirm('حذف المجموعة وكل بوستاتها نهائيًا؟')) return
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setErr(errMsg(error)); else nav('/')
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: mobile ? 170 : 330, position: 'relative', background: g.cover_url ? `center/cover url("${g.cover_url}")` : gcolor(g.name) }}>
          {isAdmin && (
            <label className="btn sm" style={{ position: 'absolute', insetInlineEnd: 12, bottom: 12, cursor: 'pointer' }}><Icon n="image" s={18} />تغيير الغلاف
              <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => changeCover(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <div style={{ padding: mobile ? '0 14px 12px' : '0 32px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ alignItems: 'center', gap: mobile ? 12 : 20, flexWrap: 'wrap', paddingTop: mobile ? 14 : 20 }}>
            <div className="grow" style={{ lineHeight: 1.5 }}>
              <b style={{ fontSize: mobile ? 24 : 34 }}>{g.name}</b>
              <div className="mut">{g.privacy === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة'} · {count} عضو</div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
            {!mem && <button className="btn p" onClick={join}>{g.privacy === 'public' ? 'انضم' : 'طلب انضمام'}</button>}
            {mem?.status === 'pending' && <span className="pill">طلبك بانتظار موافقة المشرف</span>}
            {active && <button className="btn p" onClick={openInvite}><Icon n="friends" s={18} />دعوة</button>}
            {(active || g.privacy === 'public') && <button className="btn" onClick={share}><Icon n="send" s={18} />{copied ? 'تم نسخ الرابط ✓' : 'مشاركة'}</button>}
            {active && mem!.role !== 'owner' && <button className="btn" onClick={leave}>مغادرة المجموعة</button>}
            {(mem?.role === 'owner' || profile?.role === 'admin') && <button className="btn danger" onClick={del}>حذف المجموعة</button>}
            </div>
          </div>
          {invite && (
            <div className="crd col" style={{ background: '#F7F7F8' }}>
              <b>ادعُ أصدقاءك للمجموعة</b>
              {friendsList.length === 0 && <div className="mut">لسه مفيش أصدقاء. <Link to="/friends"><u>أضف أصدقاء</u></Link> وبعدين ادعيهم. ولو عايز تبعت لحد برة المنصة استخدم زرار "مشاركة".</div>}
              {friendsList.map((f) => (
                <div key={f.other} className="row"><Avatar name={f.profile?.name} url={f.profile?.avatar_url} size={40} /><span className="grow"><Name p={f.profile} /></span>
                  {memberIds.has(f.other) ? <span className="pill">عضو</span>
                    : invited.has(f.other) ? <span className="pill">تمت الدعوة</span>
                    : <button className="btn p sm" onClick={() => inviteFriend(f.other)}>دعوة</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="row" style={{ borderTop: '1px solid #E4E4E7', padding: '0 12px', gap: 4 }}>
          {([['talk', 'المناقشة'], ['media', 'الوسائط'], ['members', 'الأعضاء'], ...(isAdmin && g.privacy === 'private' ? [['requests', `طلبات الانضمام${pend.length ? ` (${pend.length})` : ''}`]] : [])] as [typeof tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ fontFamily: 'inherit', background: 'none', border: 0, borderBottom: `3px solid ${tab === k ? '#111111' : 'transparent'}`, padding: '14px 16px', fontWeight: tab === k ? 700 : 500, color: tab === k ? '#111111' : '#55555C', fontSize: 15, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>
      <Err>{err}</Err>
      {tab === 'talk' && <div className="pgrid pflip">
      <aside className="col pside" style={{ gap: 16 }}>
        <div className="crd col" style={{ gap: 10 }}>
          <b style={{ fontSize: 18 }}>عن المجموعة</b>
          {g.description ? <div className="body">{g.description}</div> : <span className="mut">مفيش وصف للمجموعة.</span>}
          <div className="mut">{g.privacy === 'public' ? '🌐 مجموعة عامة: أي حد ينضم ويشوف البوستات' : '🔒 مجموعة خاصة: الانضمام بموافقة المشرف'}</div>
          <div className="mut">{count} عضو</div>
          <div className="mut">تأسست في {new Date(g.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}</div>
        </div>
      </aside>
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
      {active && <Composer groups={[{ id: g.id, name: g.name }]} defaultGroup={g.id} onPosted={load} />}
      {posts.length === 0 && <div className="crd mut" style={{ textAlign: 'center' }}>مفيش بوستات لسه.</div>}
      {posts.map((p) => <PostCard key={p.id} post={p} hideGroup liked={liked.has(p.id)} canModerate={isAdmin || staff} onDeleted={(x) => setPosts((l) => l.filter((y) => y.id !== x))} />)}
      </div>
      </div>}
      {tab !== 'talk' && <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {tab === 'media' && (media.length === 0
        ? <div className="crd mut" style={{ textAlign: 'center' }}>مفيش صور أو وسائط لسه.</div>
        : <div className="crd" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
            {media.map((m) => <a key={m.id} href={m.image_url} target="_blank" rel="noreferrer noopener"><img src={m.image_url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' }} /></a>)}
          </div>)}
      {tab === 'requests' && (
        <div className="crd col">
          {pend.length === 0 && <span className="mut">مفيش طلبات انضمام دلوقتي.</span>}
          {pend.map((r) => (
            <div key={r.user_id} className="row"><Link to={`/u/${r.user_id}`}><Avatar name={r.profiles?.name} url={r.profiles?.avatar_url} size={44} /></Link><span className="grow">{r.profiles?.name}</span>
              <button className="btn p sm" onClick={() => decide(r.user_id, true)}>قبول</button>
              <button className="btn sm" onClick={() => decide(r.user_id, false)}>رفض</button></div>
          ))}
        </div>
      )}
      {tab === 'members' && (
        <div className="crd col">
          <b>الأعضاء ({count})</b>
          {members.map((m) => (
            <div key={m.user_id} className="row">
              <Avatar name={m.profiles?.name} url={m.profiles?.avatar_url} size={44} />
              <span className="grow"><Name p={m.profiles} />{m.role !== 'member' && <span className="pill" style={{ marginInlineStart: 8 }}>{m.role === 'owner' ? 'المالك' : 'مشرف'}</span>}</span>
              {isAdmin && m.role !== 'owner' && m.user_id !== uid && (<>
                {mem!.role === 'owner' && <button className="btn sm" onClick={() => setRole(m.user_id, m.role === 'admin' ? 'member' : 'admin')}>{m.role === 'admin' ? 'إلغاء الإشراف' : 'ترقية لمشرف'}</button>}
                <button className="btn sm danger" onClick={() => kick(m.user_id)}>إزالة</button>
              </>)}
            </div>
          ))}
        </div>
      )}
      </div>}
    </>
  )
}
