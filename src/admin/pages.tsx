import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage, type Profile } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePlatform, applyBrand, DEFAULT_BRAND } from '../lib/platform'
import { Avatar, Err, timeAgo } from '../lib/ui'
import StaffSupport from '../pages/StaffSupport'

const ROLE: Record<string, string> = { admin: 'أدمن', mod: 'مشرف', support: 'دعم', user: 'مستخدم' }
type Counts = { u: number; pr: number; g: number; po: number; rp: number; nu: number }

async function count(table: string, f?: (x: any) => any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  let x = supabase.from(table).select('*', { count: 'exact', head: true })
  if (f) x = f(x)
  const { count: c } = await x
  return c ?? 0
}
export function useCounts(on = true) {
  const [c, setC] = useState<Counts>({ u: 0, pr: 0, g: 0, po: 0, rp: 0, nu: 0 })
  useEffect(() => {
    if (!on) return
    const run = async () => {
      const day = new Date(Date.now() - 86400000).toISOString()
      const [u, pr, g, po, rp, nu] = await Promise.all([
        count('profiles'), count('profiles', (x) => x.eq('plan', 'premium')), count('groups'), count('posts'),
        count('reports', (x) => x.eq('status', 'open')), count('profiles', (x) => x.gte('created_at', day)),
      ])
      setC({ u, pr, g, po, rp, nu })
    }
    run(); const t = setInterval(run, 30000); return () => clearInterval(t)
  }, [on])
  return c
}

const Head = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="adm-h"><h1>{title}</h1><div className="row" style={{ gap: 8 }}>{children}</div></div>
)
const Msg = ({ err, ok }: { err: string; ok: string }) => (<>{err && <Err>{err}</Err>}{ok && <div className="okmsg">{ok}</div>}</>)

export function Overview() {
  const c = useCounts()
  const [users, setUsers] = useState<Profile[]>([])
  useEffect(() => { supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => setUsers((data ?? []) as Profile[])) }, [])
  const cards: [string, number, string][] = [
    ['المستخدمين', c.u, '👥'], ['جدد آخر 24 ساعة', c.nu, '🆕'], ['المميزين', c.pr, '⭐'],
    ['المجموعات', c.g, '🗂️'], ['المنشورات', c.po, '📝'], ['بلاغات مفتوحة', c.rp, '🚩'],
  ]
  return (
    <>
      <Head title="نظرة عامة" />
      <div className="adm-grid">{cards.map(([t, n, e]) => (
        <div key={t} className="adm-stat"><span style={{ fontSize: 24 }}>{e}</span><b>{n}</b><span className="mut">{t}</span></div>
      ))}</div>
      <b>آخر المنضمين</b>
      <div className="adm-table">
        {users.map((u) => (
          <div key={u.id} className="adm-row"><Avatar name={u.name} url={u.avatar_url} size={36} /><b className="grow">{u.name}</b><span className="mut">{u.created_at ? timeAgo(u.created_at) : ''}</span></div>
        ))}
        {!users.length && <div className="adm-row mut">لا مستخدمين لسه</div>}
      </div>
    </>
  )
}

type UserRow = { id: string; name: string; avatar_url: string | null; role: Profile['role']; plan: 'free' | 'premium'; plan_until: string | null; banned: boolean; created_at: string; email: string | null; posts: number; friends: number; groups: number; last_seen: string | null }
const isOnlineTs = (t: string | null) => !!t && Date.now() - new Date(t).getTime() < 150000

function useUsers() {
  const [users, setUsers] = useState<UserRow[] | null>(null); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_users')
    if (error) { setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديث 024 في Supabase.'); setUsers([]) } else { setErr(''); setUsers((data ?? []) as UserRow[]) }
  }, [])
  useEffect(() => { load() }, [load])
  return { users, err, load }
}

// جدول كل المستخدمين
export function Users() {
  const nav = useNavigate()
  const { users, err } = useUsers()
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'premium' | 'banned' | 'staff'>('all')
  const list = (users ?? []).filter((u) => {
    const k = q.trim().toLowerCase()
    return (!k || u.name.toLowerCase().includes(k) || (u.email ?? '').toLowerCase().includes(k))
      && (f === 'all' || (f === 'premium' && isPremium(u)) || (f === 'banned' && u.banned) || (f === 'staff' && u.role !== 'user'))
  })
  const chips: ['all' | 'premium' | 'banned' | 'staff', string][] = [['all', 'الكل'], ['premium', 'المميزين ⭐'], ['banned', 'المحظورين'], ['staff', 'الفريق']]
  return (
    <>
      <Head title={`المستخدمين${users ? ` (${users.length})` : ''}`}><input className="adm-in" placeholder="ابحث بالاسم أو الإيميل…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /></Head>
      <div className="adm-chips">{chips.map(([k, t]) => <button key={k} className={'adm-chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{t}</button>)}</div>
      {err && <Err>{err}</Err>}
      {users === null && <div className="mut">جاري التحميل…</div>}
      {users && (
        <div className="adm-table" style={{ overflowX: 'auto' }}>
          <table className="adm-tbl">
            <thead><tr><th>المستخدم</th><th>الدور</th><th>الباقة</th><th>الحالة</th><th>منشورات</th><th>أصدقاء</th><th>مجموعات</th><th>انضم</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} onClick={() => nav('/admin/users/' + u.id)} style={{ cursor: 'pointer' }}>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={u.name} url={u.avatar_url} size={36} /><div><b>{u.name}</b><div className="mut" style={{ fontSize: 12 }}>{u.email ?? '—'}</div></div></div></td>
                  <td>{ROLE[u.role]}</td>
                  <td>{isPremium(u) ? <span className="pill" style={{ color: '#15803D', background: '#DCFCE7' }}>مميز ✅</span> : <span className="mut">مجاني</span>}</td>
                  <td>{u.banned ? <span className="pill" style={{ color: '#B91C1C', background: '#FEE2E2' }}>محظور</span> : isOnlineTs(u.last_seen) ? <span style={{ color: '#15803D' }}>● متصل</span> : <span className="mut">غير متصل</span>}</td>
                  <td>{u.posts}</td><td>{u.friends}</td><td>{u.groups}</td>
                  <td className="mut" style={{ whiteSpace: 'nowrap' }}>{timeAgo(u.created_at)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="mut" style={{ textAlign: 'center' }}>لا نتائج</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

type Tab = 'info' | 'posts' | 'friends' | 'groups'
type UPostRow = { id: string; body: string; image_url: string | null; created_at: string; group_id: string | null; ad_id?: string | null; groups: { name: string } | null; likes: { count: number }[]; comments: { count: number }[] }
type FriendRow = { requester_id: string; addressee_id: string; created_at?: string; req: { name: string; avatar_url: string | null } | null; adr: { name: string; avatar_url: string | null } | null }
type GroupRow = { role: string; groups: { id: string; name: string; privacy: string; cover_url: string | null } | null }

// تفاصيل مستخدم: بياناته + منشوراته + أصدقاؤه + مجموعاته
export function UserDetail() {
  const { id } = useParams(); const nav = useNavigate()
  const { profile: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const { users, err: loadErr, load } = useUsers()
  const u = users?.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('info')
  const [full, setFull] = useState<Profile | null>(null)
  const [priv, setPriv] = useState<{ birth_date: string; gender: string } | null>(null)
  const [posts, setPosts] = useState<UPostRow[] | null>(null)
  const [friends, setFriends] = useState<FriendRow[] | null>(null)
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  useEffect(() => { setTab('info'); setFull(null); setPriv(null); setPosts(null); setFriends(null); setGroups(null) }, [id])
  useEffect(() => {
    if (!id) return
    supabase.from('profiles').select('*').eq('id', id).maybeSingle().then(({ data }) => setFull((data as Profile) ?? null))
    supabase.from('profile_private').select('birth_date,gender').eq('user_id', id).maybeSingle().then(({ data }) => setPriv(data as { birth_date: string; gender: string } | null))
  }, [id])
  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase.from('posts').select('id,body,image_url,created_at,group_id,groups!group_id(name),likes(count),comments(count)').eq('author_id', id!).is('ad_id', null).order('created_at', { ascending: false }).limit(100)
    if (error) setErr(errMsg(error)); else setPosts((data ?? []) as unknown as UPostRow[])
  }, [id])
  useEffect(() => {
    if (!id) return
    if (tab === 'posts' && posts === null) loadPosts()
    if (tab === 'friends' && friends === null) {
      supabase.from('friendships').select('requester_id,addressee_id,created_at,req:profiles!requester_id(name,avatar_url),adr:profiles!addressee_id(name,avatar_url)')
        .eq('status', 'accepted').or(`requester_id.eq.${id},addressee_id.eq.${id}`).limit(500)
        .then(({ data, error }) => { if (error) setErr(errMsg(error)); else setFriends((data ?? []) as unknown as FriendRow[]) })
    }
    if (tab === 'groups' && groups === null) {
      supabase.from('group_members').select('role,groups!group_id(id,name,privacy,cover_url)').eq('user_id', id).eq('status', 'active').limit(200)
        .then(({ data, error }) => { if (error) setErr(errMsg(error)); else setGroups((data ?? []) as unknown as GroupRow[]) })
    }
  }, [tab, id, posts, friends, groups, loadPosts])
  const rpc = async (fn: string, args: Record<string, unknown>, msg: string) => {
    setErr(''); setOk('')
    const { error } = await supabase.rpc(fn, args)
    if (error) setErr(errMsg(error)); else { setOk(msg); load() }
  }
  const delPost = async (pid: string) => {
    if (!confirm('حذف المنشور نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', pid)
    if (error) setErr(errMsg(error)); else { setOk('تم حذف المنشور'); loadPosts(); load() }
  }
  const back = <Link className="btn line" to="/admin/users">← رجوع للجدول</Link>
  if (users === null) return <div className="mut">جاري التحميل…</div>
  if (!u) return <><Head title="المستخدم">{back}</Head>{loadErr ? <Err>{loadErr}</Err> : <div className="card mut">المستخدم مش موجود.</div>}</>
  const age = priv?.birth_date ? Math.floor((Date.now() - new Date(priv.birth_date).getTime()) / 31557600000) : null
  const tabs: [Tab, string][] = [['info', 'بياناته'], ['posts', `المنشورات (${u.posts})`], ['friends', `الأصدقاء (${u.friends})`], ['groups', `المجموعات (${u.groups})`]]
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="row" style={{ gap: 12, padding: '8px 0', borderTop: '1px solid #F0F0F2' }}><span className="mut" style={{ width: 120 }}>{k}</span><span className="grow">{v}</span></div>
  return (
    <>
      <Head title="تفاصيل المستخدم">{back}</Head>
      <div className="card row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Avatar name={u.name} url={u.avatar_url} size={72} />
        <div className="grow">
          <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 22 }}>{u.name}</b>{isPremium(u) && <span title="مميز">✅</span>}{u.banned && <span className="pill" style={{ color: '#B91C1C', background: '#FEE2E2' }}>محظور</span>}</div>
          <div className="mut">{u.email ?? '—'} · {ROLE[u.role]} · {isOnlineTs(u.last_seen) ? '● متصل الآن' : u.last_seen ? 'آخر ظهور ' + timeAgo(u.last_seen) : 'مفيش آخر ظهور'}</div>
        </div>
        <Link className="btn sm line" to={'/u/' + u.id} target="_blank">فتح صفحته في الموقع ↗</Link>
      </div>
      <div className="adm-chips" style={{ marginTop: 14 }}>{tabs.map(([k, t]) => <button key={k} className={'adm-chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t}</button>)}</div>
      <Msg err={err} ok={ok} />

      {tab === 'info' && (
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: '1 1 380px', maxWidth: 560 }}>
            <b>بيانات الحساب</b>
            <Row k="الإيميل" v={u.email ?? '—'} />
            <Row k="انضم" v={new Date(u.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <Row k="الجنس" v={priv ? (priv.gender === 'male' ? 'ذكر' : 'أنثى') : '—'} />
            <Row k="تاريخ الميلاد" v={priv ? `${new Date(priv.birth_date).toLocaleDateString('ar-EG')}${age !== null ? ` (${age} سنة)` : ''}` : '—'} />
            <Row k="النبذة" v={full?.bio || <span className="mut">—</span>} />
            <Row k="الحساب" v={full?.is_locked ? 'مقفول 🔒' : 'عام'} />
            <Row k="الباقة" v={isPremium(u) ? `مميز${u.plan_until ? ' لحد ' + new Date(u.plan_until).toLocaleDateString('ar-EG') : ''}` : 'مجاني'} />
            {full && full.onboarded === false && <Row k="ملاحظة" v={<span className="mut">لسه ما كمّلش بياناته أول مرة</span>} />}
            {full?.deletion_requested_at && <Row k="حذف الحساب" v={<span style={{ color: '#B91C1C' }}>طلب حذف في {new Date(full.deletion_requested_at).toLocaleDateString('ar-EG')}</span>} />}
          </div>
          {isAdmin && u.id !== me!.id && (
            <div className="card col" style={{ gap: 10, flex: '0 0 280px' }}>
              <b>إجراءات</b>
              <label className="col" style={{ gap: 4 }}><span className="mut">الدور</span>
                <select className="adm-in" value={u.role} onChange={(e) => confirm(`تغيير دور ${u.name} إلى ${ROLE[e.target.value]}؟`) && rpc('admin_set_role', { target: u.id, new_role: e.target.value }, 'تم تغيير الدور')}>
                  {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {isPremium(u)
                ? <button className="btn line" onClick={() => confirm('إلغاء المميز؟') && rpc('admin_set_plan', { target: u.id, new_plan: 'free', days: 0 }, 'تم إلغاء المميز')}>إلغاء المميز</button>
                : <button className="btn p" onClick={() => confirm('تفعيل المميز 30 يوم؟') && rpc('admin_set_plan', { target: u.id, new_plan: 'premium', days: 30 }, 'تم تفعيل المميز 30 يوم')}>تفعيل مميز 30 يوم</button>}
              <button className="btn line" style={{ color: '#B91C1C' }} onClick={() => confirm(u.banned ? 'فك الحظر؟' : `حظر ${u.name}؟`) && rpc('admin_set_banned', { target: u.id, flag: !u.banned }, u.banned ? 'تم فك الحظر' : 'تم الحظر')}>{u.banned ? 'فك الحظر' : 'حظر المستخدم'}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'posts' && (
        <div className="adm-table">
          {posts === null && <div className="adm-row mut">جاري التحميل…</div>}
          {posts?.length === 0 && <div className="adm-row mut">مفيش منشورات.</div>}
          {posts?.map((p) => (
            <div key={p.id} className="adm-row" style={{ alignItems: 'flex-start' }}>
              {p.image_url && <img src={p.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}
              <div className="grow">
                <div style={{ whiteSpace: 'pre-wrap' }}>{p.body.length > 200 ? p.body.slice(0, 200) + '…' : p.body}</div>
                <div className="mut" style={{ fontSize: 13, marginTop: 4 }}>{p.groups?.name ? 'في مجموعة «' + p.groups.name + '»' : 'منشور شخصي'} · {timeAgo(p.created_at)} · ❤️ {p.likes?.[0]?.count ?? 0} · 💬 {p.comments?.[0]?.count ?? 0}</div>
              </div>
              <Link className="btn sm line" to={'/post/' + p.id} target="_blank">فتح</Link>
              {me?.role !== 'support' && <button className="btn sm line" style={{ color: '#B91C1C' }} onClick={() => delPost(p.id)}>حذف</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'friends' && (
        <div className="adm-table">
          {friends === null && <div className="adm-row mut">جاري التحميل…</div>}
          {friends?.length === 0 && <div className="adm-row mut">مفيش أصدقاء.</div>}
          {friends?.map((fr) => {
            const otherId = fr.requester_id === u.id ? fr.addressee_id : fr.requester_id
            const o = fr.requester_id === u.id ? fr.adr : fr.req
            return (
              <div key={otherId} className="adm-row" style={{ cursor: 'pointer' }} onClick={() => nav('/admin/users/' + otherId)}>
                <Avatar name={o?.name} url={o?.avatar_url} size={40} /><b className="grow">{o?.name ?? '—'}</b><span className="mut">فتح ←</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'groups' && (
        <div className="adm-table">
          {groups === null && <div className="adm-row mut">جاري التحميل…</div>}
          {groups?.length === 0 && <div className="adm-row mut">مش عضو في أي مجموعة.</div>}
          {groups?.map((g) => g.groups && (
            <div key={g.groups.id} className="adm-row">
              <Avatar name={g.groups.name} url={g.groups.cover_url} size={40} square /><b className="grow">{g.groups.name}</b>
              <span className="pill">{g.role === 'owner' ? 'مالك' : g.role === 'admin' ? 'مشرف المجموعة' : 'عضو'}</span>
              <span className="mut">{g.groups.privacy === 'public' ? 'عامة' : 'خاصة'}</span>
              <Link className="btn sm line" to={'/g/' + g.groups.id} target="_blank">فتح</Link>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

type GroupAdm = { id: string; name: string; description: string; cover_url: string | null; privacy: string; created_at: string; owner_id: string; owner_name: string | null; owner_avatar: string | null; members: number; posts: number }
function useGroups() {
  const [groups, setGroups] = useState<GroupAdm[] | null>(null); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_groups')
    if (error) { setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديث 025 في Supabase.'); setGroups([]) } else { setErr(''); setGroups((data ?? []) as GroupAdm[]) }
  }, [])
  useEffect(() => { load() }, [load])
  return { groups, err, load }
}

// جدول كل المجموعات
export function Groups() {
  const nav = useNavigate()
  const { groups, err } = useGroups()
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'public' | 'private'>('all')
  const list = (groups ?? []).filter((g) => (!q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase())) && (f === 'all' || g.privacy === f))
  const chips: ['all' | 'public' | 'private', string][] = [['all', 'الكل'], ['public', 'العامة'], ['private', 'الخاصة']]
  return (
    <>
      <Head title={`المجموعات${groups ? ` (${groups.length})` : ''}`}><input className="adm-in" placeholder="ابحث باسم المجموعة…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /></Head>
      <div className="adm-chips">{chips.map(([k, t]) => <button key={k} className={'adm-chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{t}</button>)}</div>
      {err && <Err>{err}</Err>}
      {groups === null && <div className="mut">جاري التحميل…</div>}
      {groups && (
        <div className="adm-table" style={{ overflowX: 'auto' }}>
          <table className="adm-tbl">
            <thead><tr><th>المجموعة</th><th>النوع</th><th>المالك</th><th>الأعضاء</th><th>المنشورات</th><th>أُنشئت</th></tr></thead>
            <tbody>
              {list.map((g) => (
                <tr key={g.id} onClick={() => nav('/admin/groups/' + g.id)} style={{ cursor: 'pointer' }}>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={g.name} url={g.cover_url} size={36} square /><b>{g.name}</b></div></td>
                  <td>{g.privacy === 'public' ? 'عامة' : 'خاصة 🔒'}</td>
                  <td><div className="row" style={{ gap: 8 }}><Avatar name={g.owner_name ?? '؟'} url={g.owner_avatar} size={26} />{g.owner_name ?? '—'}</div></td>
                  <td>{g.members}</td><td>{g.posts}</td>
                  <td className="mut" style={{ whiteSpace: 'nowrap' }}>{timeAgo(g.created_at)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="mut" style={{ textAlign: 'center' }}>لا مجموعات</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

type GPost = { id: string; body: string; image_url: string | null; created_at: string; author_id: string; profiles: { name: string; avatar_url: string | null } | null; likes: { count: number }[]; comments: { count: number }[] }
type GMember = { user_id: string; role: string; profiles: { name: string; avatar_url: string | null } | null }

// تفاصيل مجموعة: بياناتها + منشوراتها + أعضاؤها
export function GroupDetail() {
  const { id } = useParams(); const nav = useNavigate()
  const { profile: me } = useAuth()
  const { groups, err: loadErr, load } = useGroups()
  const g = groups?.find((x) => x.id === id)
  const [tab, setTab] = useState<'info' | 'posts' | 'members'>('info')
  const [posts, setPosts] = useState<GPost[] | null>(null)
  const [members, setMembers] = useState<GMember[] | null>(null)
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  useEffect(() => { setTab('info'); setPosts(null); setMembers(null) }, [id])
  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase.from('posts').select('id,body,image_url,created_at,author_id,profiles!author_id(name,avatar_url),likes(count),comments(count)').eq('group_id', id!).order('created_at', { ascending: false }).limit(100)
    if (error) setErr(errMsg(error)); else setPosts((data ?? []) as unknown as GPost[])
  }, [id])
  useEffect(() => {
    if (!id) return
    if (tab === 'posts' && posts === null) loadPosts()
    if (tab === 'members' && members === null) {
      supabase.from('group_members').select('user_id,role,profiles!user_id(name,avatar_url)').eq('group_id', id).eq('status', 'active').limit(500)
        .then(({ data, error }) => { if (error) setErr(errMsg(error)); else setMembers((data ?? []) as unknown as GMember[]) })
    }
  }, [tab, id, posts, members, loadPosts])
  const delPost = async (pid: string) => {
    if (!confirm('حذف المنشور نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', pid)
    if (error) setErr(errMsg(error)); else { setOk('تم حذف المنشور'); loadPosts(); load() }
  }
  const delGroup = async () => {
    if (!g || !confirm(`حذف مجموعة «${g.name}» نهائيًا بكل منشوراتها؟`)) return
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setErr(errMsg(error)); else nav('/admin/groups')
  }
  const back = <Link className="btn line" to="/admin/groups">← رجوع للجدول</Link>
  if (groups === null) return <div className="mut">جاري التحميل…</div>
  if (!g) return <><Head title="المجموعة">{back}</Head>{loadErr ? <Err>{loadErr}</Err> : <div className="card mut">المجموعة مش موجودة.</div>}</>
  const tabs: ['info' | 'posts' | 'members', string][] = [['info', 'بياناتها'], ['posts', `المنشورات (${g.posts})`], ['members', `الأعضاء (${g.members})`]]
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="row" style={{ gap: 12, padding: '8px 0', borderTop: '1px solid #F0F0F2' }}><span className="mut" style={{ width: 120 }}>{k}</span><span className="grow">{v}</span></div>
  return (
    <>
      <Head title="تفاصيل المجموعة">{back}</Head>
      <div className="card row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Avatar name={g.name} url={g.cover_url} size={72} square />
        <div className="grow">
          <b style={{ fontSize: 22 }}>{g.name}</b>
          <div className="mut">{g.privacy === 'public' ? 'مجموعة عامة' : 'مجموعة خاصة 🔒'} · {g.members} عضو · {g.posts} منشور</div>
        </div>
        <Link className="btn sm line" to={'/g/' + g.id} target="_blank">فتح المجموعة في الموقع ↗</Link>
      </div>
      <div className="adm-chips" style={{ marginTop: 14 }}>{tabs.map(([k, t]) => <button key={k} className={'adm-chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t}</button>)}</div>
      <Msg err={err} ok={ok} />

      {tab === 'info' && (
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: '1 1 380px', maxWidth: 560 }}>
            <b>بيانات المجموعة</b>
            <Row k="الاسم" v={g.name} />
            <Row k="الوصف" v={g.description || <span className="mut">—</span>} />
            <Row k="النوع" v={g.privacy === 'public' ? 'عامة' : 'خاصة'} />
            <Row k="المالك" v={<Link to={'/admin/users/' + g.owner_id} className="row" style={{ gap: 8 }}><Avatar name={g.owner_name ?? '؟'} url={g.owner_avatar} size={28} />{g.owner_name ?? '—'}</Link>} />
            <Row k="أُنشئت" v={new Date(g.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })} />
          </div>
          {me?.role === 'admin' && (
            <div className="card col" style={{ gap: 10, flex: '0 0 260px' }}>
              <b>إجراءات</b>
              <button className="btn line" style={{ color: '#B91C1C' }} onClick={delGroup}>حذف المجموعة</button>
              <span className="mut" style={{ fontSize: 13 }}>الحذف نهائي ومعاه كل المنشورات.</span>
            </div>
          )}
        </div>
      )}

      {tab === 'posts' && (
        <div className="adm-table">
          {posts === null && <div className="adm-row mut">جاري التحميل…</div>}
          {posts?.length === 0 && <div className="adm-row mut">مفيش منشورات.</div>}
          {posts?.map((p) => (
            <div key={p.id} className="adm-row" style={{ alignItems: 'flex-start' }}>
              <Avatar name={p.profiles?.name} url={p.profiles?.avatar_url} size={36} />
              {p.image_url && <img src={p.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}
              <div className="grow">
                <b style={{ fontSize: 14 }}>{p.profiles?.name}</b>
                <div style={{ whiteSpace: 'pre-wrap' }}>{p.body.length > 200 ? p.body.slice(0, 200) + '…' : p.body}</div>
                <div className="mut" style={{ fontSize: 13, marginTop: 4 }}>{timeAgo(p.created_at)} · ❤️ {p.likes?.[0]?.count ?? 0} · 💬 {p.comments?.[0]?.count ?? 0}</div>
              </div>
              <Link className="btn sm line" to={'/post/' + p.id} target="_blank">فتح</Link>
              {me?.role !== 'support' && <button className="btn sm line" style={{ color: '#B91C1C' }} onClick={() => delPost(p.id)}>حذف</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'members' && (
        <div className="adm-table">
          {members === null && <div className="adm-row mut">جاري التحميل…</div>}
          {members?.length === 0 && <div className="adm-row mut">مفيش أعضاء.</div>}
          {members?.map((m) => (
            <div key={m.user_id} className="adm-row" style={{ cursor: 'pointer' }} onClick={() => nav('/admin/users/' + m.user_id)}>
              <Avatar name={m.profiles?.name} url={m.profiles?.avatar_url} size={40} /><b className="grow">{m.profiles?.name ?? '—'}</b>
              <span className="pill">{m.role === 'owner' ? 'مالك' : m.role === 'admin' ? 'مشرف المجموعة' : 'عضو'}</span><span className="mut">فتح ←</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

type Rep = { id: string; reason: string; status: string; created_at: string; post_id: string | null; profiles: { name: string } | null }
export function Reports() {
  const [reps, setReps] = useState<Rep[]>([]); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = (await supabase.from('reports').select('id,reason,status,created_at,post_id,profiles!reporter_id(name)').order('created_at', { ascending: false }).limit(200)) as unknown as { data: Rep[] | null; error: { message: string } | null }
    if (error) setErr(errMsg(error)); else setReps(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])
  const act = async (r: Rep, del: boolean) => {
    if (del && !confirm('حذف المنشور المُبلَّغ عنه؟')) return
    setErr('')
    if (del && r.post_id) { const e1 = await supabase.from('posts').delete().eq('id', r.post_id); if (e1.error) return setErr(errMsg(e1.error)) }
    const { error } = await supabase.from('reports').update({ status: 'done' }).eq('id', r.id)
    if (error) setErr(errMsg(error)); else load()
  }
  return (
    <>
      <Head title="البلاغات" />
      <Err>{err}</Err>
      <div className="adm-table">
        {reps.map((r) => (
          <div key={r.id} className="adm-row">
            <div className="grow"><b>{r.profiles?.name ?? 'مستخدم'}</b> <span className="mut" style={{ fontSize: 13 }}>· {timeAgo(r.created_at)} · {r.status === 'open' ? 'مفتوح' : 'تم'}</span><div>{r.reason}</div></div>
            {r.status === 'open' && <>
              {r.post_id && <button className="btn sm line danger" onClick={() => act(r, true)}>حذف المنشور + إغلاق</button>}
              <button className="btn sm p" onClick={() => act(r, false)}>تم الحل</button>
            </>}
          </div>
        ))}
        {!reps.length && <div className="adm-row mut">لا بلاغات 🎉</div>}
      </div>
    </>
  )
}

export function Inbox() {
  return (<><Head title="صندوق الدعم" /><StaffSupport /></>)
}
export function Upgrades() {
  return (<><Head title="طلبات الترقية ⭐" /><div className="mut">محادثات طلبات الترقية (منفصلة عن الدعم). افتح المحادثة، ولما يتم الدفع دوس «تفعيل مميز 30 يوم».</div><StaffSupport channel="upgrade" /></>)
}

type AdRow = { id: string; title: string; body: string; image_url: string | null; post_id: string; starts_at: string; ends_at: string; target_viewers: number; status: string; views: number; likes: number; comments: number; advertiser_name: string | null; advertiser_avatar: string | null }
const adState = (a: AdRow) => {
  if (a.status === 'paused') return { t: 'متوقف', c: '#B45309', bg: '#FEF3C7' }
  if (new Date(a.ends_at) < new Date()) return { t: 'انتهى', c: '#52525B', bg: '#F4F4F5' }
  if (a.views >= a.target_viewers) return { t: 'اكتمل العدد', c: '#0369A1', bg: '#E0F2FE' }
  return { t: 'شغال', c: '#15803D', bg: '#DCFCE7' }
}
function useAds() {
  const [rows, setRows] = useState<AdRow[] | null>(null); const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_ads')
    if (error) { setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديثات 021 و022 و023 في Supabase.'); setRows([]) } else { setErr(''); setRows((data ?? []) as AdRow[]) }
  }, [])
  useEffect(() => { load() }, [load])
  return { rows, err, load }
}
const dayLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
const dstr = (iso: string) => new Date(iso).toLocaleDateString('ar-EG')

// جدول كل الإعلانات + زرار إضافة إعلان جديد فوقه
export function Ads() {
  const nav = useNavigate()
  const { rows, err } = useAds()
  return (
    <>
      <Head title="الإعلانات 📣"><button className="btn p" onClick={() => nav('/admin/ads/new')}>+ إضافة إعلان جديد</button></Head>
      <div className="card mut" style={{ lineHeight: 1.9 }}>
        الإعلان بيظهر للمستخدمين في صفحتهم الرئيسية كبوست عادي (عليه علامة «إعلان») ويقدروا يعملوا إعجاب وتعليق، وبيوقف لما تعدّي عدد الأيام أو يظهر للعدد المطلوب، أيهما أول. دوس على أي إعلان لتفاصيله وتعديله.
      </div>
      {err && <Err>{err}</Err>}
      {rows === null && <div className="mut" style={{ marginTop: 14 }}>جاري التحميل…</div>}
      {rows?.length === 0 && !err && <div className="card mut" style={{ marginTop: 14, textAlign: 'center' }}>مفيش إعلانات لسه. دوس «إضافة إعلان جديد».</div>}
      {!!rows?.length && (
        <div className="adm-table" style={{ marginTop: 14, overflowX: 'auto' }}>
          <table className="adm-tbl">
            <thead><tr><th>المعلِن</th><th>نص الإعلان</th><th>الحالة</th><th>ظهر لـ</th><th>❤️</th><th>💬</th><th>ينتهي</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const st = adState(a); const pct = Math.min(100, Math.round((a.views / a.target_viewers) * 100))
                return (
                  <tr key={a.id} onClick={() => nav('/admin/ads/' + a.id)} style={{ cursor: 'pointer' }}>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={a.advertiser_name || a.title} url={a.advertiser_avatar} size={36} /><b>{a.advertiser_name || a.title}</b></div></td>
                    <td className="mut" style={{ maxWidth: 260 }}>{a.body.length > 70 ? a.body.slice(0, 70) + '…' : a.body}</td>
                    <td><span className="pill" style={{ color: st.c, background: st.bg }}>{st.t}</span></td>
                    <td style={{ minWidth: 150 }}>
                      <div style={{ fontSize: 13 }}><b>{a.views}</b> / {a.target_viewers} <span className="mut">({pct}%)</span></div>
                      <div style={{ height: 6, background: '#E4E4E7', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}><div style={{ width: pct + '%', height: '100%', background: '#0866FF' }} /></div>
                    </td>
                    <td>{a.likes}</td><td>{a.comments}</td>
                    <td className="mut" style={{ whiteSpace: 'nowrap' }}>{dstr(a.ends_at)}<div style={{ fontSize: 12 }}>باقي {dayLeft(a.ends_at)} يوم</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// حقول الإعلان المشتركة بين صفحة الإضافة وصفحة التعديل
type AdForm = { advName: string; advAv: string; title: string; body: string; img: string }
function AdFields({ f, set, setErr }: { f: AdForm; set: (p: Partial<AdForm>) => void; setErr: (s: string) => void }) {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const up = async (file: File | null, key: 'advAv' | 'img') => {
    if (!file) return
    setErr(''); setBusy(true)
    try { set({ [key]: await uploadImage(file, session!.user.id) } as Partial<AdForm>) } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  return (
    <>
      <div className="col" style={{ gap: 6 }}>
        <b style={{ fontSize: 14 }}>المعلِن (الاسم والصورة اللي هيظهروا على الإعلان)</b>
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={f.advName || '؟'} url={f.advAv || null} size={48} />
          <input className="adm-in grow" placeholder="اسم المعلِن" maxLength={60} value={f.advName} onChange={(e) => set({ advName: e.target.value })} />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(e) => up(e.target.files?.[0] ?? null, 'advAv')} />
          {f.advAv && <button type="button" className="btn sm line" onClick={() => set({ advAv: '' })}>إزالة الصورة</button>}
        </div>
      </div>
      <input className="adm-in" placeholder="اسم داخلي للإعلان (اختياري، بيظهرلك أنت بس)" maxLength={80} value={f.title} onChange={(e) => set({ title: e.target.value })} />
      <textarea className="adm-in" rows={5} placeholder="نص الإعلان (اللي هيظهر للمستخدمين)" maxLength={5000} value={f.body} onChange={(e) => set({ body: e.target.value })} style={{ resize: 'vertical' }} />
      <b style={{ fontSize: 14 }}>صورة الإعلان (اختياري)</b>
      <div className="row" style={{ gap: 12 }}>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(e) => up(e.target.files?.[0] ?? null, 'img')} />
        {f.img && <><img src={f.img} alt="" style={{ height: 56, borderRadius: 8 }} /><button type="button" className="btn sm line" onClick={() => set({ img: '' })}>إزالة الصورة</button></>}
      </div>
    </>
  )
}

export function AdNew() {
  const nav = useNavigate()
  const [f, setF] = useState<AdForm>({ advName: '', advAv: '', title: '', body: '', img: '' })
  const [days, setDays] = useState('3'); const [viewers, setViewers] = useState('1000')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const create = async () => {
    setErr('')
    const d = parseInt(days, 10), v = parseInt(viewers, 10)
    if (!f.advName.trim()) return setErr('اكتب اسم المعلِن (اللي هيظهر على الإعلان).')
    if (!f.body.trim()) return setErr('اكتب نص الإعلان.')
    if (!(d >= 1 && d <= 365)) return setErr('مدة الإعلان من 1 إلى 365 يوم.')
    if (!(v >= 1)) return setErr('اكتب عدد المستخدمين (1 على الأقل).')
    setBusy(true)
    const { error } = await supabase.rpc('admin_create_ad', { p_title: f.title.trim(), p_body: f.body.trim(), p_image: f.img, p_days: d, p_viewers: v, p_adv_name: f.advName.trim(), p_adv_avatar: f.advAv })
    setBusy(false)
    if (error) return setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديثات 021 و022 في Supabase.')
    nav('/admin/ads')
  }
  return (
    <>
      <Head title="إعلان جديد"><Link className="btn line" to="/admin/ads">← رجوع للجدول</Link></Head>
      <div className="card col" style={{ gap: 12, maxWidth: 640 }}>
        <AdFields f={f} set={(p) => setF((x) => ({ ...x, ...p }))} setErr={setErr} />
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="col" style={{ gap: 4 }}><b>مدة الظهور (أيام)</b><input className="adm-in" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 150 }} /></label>
          <label className="col" style={{ gap: 4 }}><b>عدد المستخدمين</b><input className="adm-in" type="number" min={1} value={viewers} onChange={(e) => setViewers(e.target.value)} style={{ width: 150 }} /></label>
        </div>
        {err && <Err>{err}</Err>}
        <button className="btn p" disabled={busy} onClick={create}>{busy ? 'استنى…' : 'نشر الإعلان'}</button>
      </div>
    </>
  )
}

const toDateInput = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function AdDetail() {
  const { id } = useParams(); const nav = useNavigate()
  const { rows, err: loadErr, load } = useAds()
  const a = rows?.find((r) => r.id === id)
  const [f, setF] = useState<AdForm | null>(null)
  const [endDate, setEndDate] = useState(''); const [target, setTarget] = useState(''); const [status, setStatus] = useState('active')
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (a && !f) { setF({ advName: a.advertiser_name ?? '', advAv: a.advertiser_avatar ?? '', title: a.title, body: a.body, img: a.image_url ?? '' }); setEndDate(toDateInput(a.ends_at)); setTarget(String(a.target_viewers)); setStatus(a.status) }
  }, [a, f])
  if (rows === null) return <div className="mut">جاري التحميل…</div>
  if (!a || !f) return <><Head title="الإعلان"><Link className="btn line" to="/admin/ads">← رجوع للجدول</Link></Head>{loadErr ? <Err>{loadErr}</Err> : <div className="card mut">الإعلان مش موجود.</div>}</>
  const st = adState(a); const pct = Math.min(100, Math.round((a.views / a.target_viewers) * 100))
  const save = async () => {
    setErr(''); setOk('')
    const t = parseInt(target, 10)
    if (!f.advName.trim()) return setErr('اكتب اسم المعلِن.')
    if (!f.body.trim()) return setErr('اكتب نص الإعلان.')
    if (!(t >= 1)) return setErr('عدد المستخدمين لازم يكون 1 على الأقل.')
    if (!endDate) return setErr('اختار تاريخ الانتهاء.')
    const ends = new Date(endDate + 'T23:59:59')
    setBusy(true)
    const { error } = await supabase.rpc('admin_update_ad', { p_id: a.id, p_title: f.title.trim(), p_body: f.body.trim(), p_image: f.img, p_adv_name: f.advName.trim(), p_adv_avatar: f.advAv, p_ends_at: ends.toISOString(), p_target: t, p_status: status })
    setBusy(false)
    if (error) return setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديث 023 في Supabase.')
    setOk('تم حفظ التعديلات'); load()
  }
  const del = async () => {
    if (!confirm('حذف الإعلان نهائيًا مع تعليقاته؟')) return
    const { error } = await supabase.rpc('admin_delete_ad', { p_id: a.id })
    if (error) setErr(errMsg(error)); else nav('/admin/ads')
  }
  return (
    <>
      <Head title="تفاصيل الإعلان"><Link className="btn line" to="/admin/ads">← رجوع للجدول</Link></Head>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card col" style={{ gap: 12, flex: '1 1 460px', maxWidth: 640 }}>
          <AdFields f={f} set={(p) => setF((x) => ({ ...x!, ...p }))} setErr={setErr} />
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="col" style={{ gap: 4 }}><b>ينتهي في</b><input className="adm-in" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 170 }} /></label>
            <label className="col" style={{ gap: 4 }}><b>عدد المستخدمين</b><input className="adm-in" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 150 }} /></label>
            <label className="col" style={{ gap: 4 }}><b>الحالة</b>
              <select className="adm-in" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">شغال</option><option value="paused">متوقف مؤقتًا</option></select>
            </label>
          </div>
          <Msg err={err} ok={ok} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn p" disabled={busy} onClick={save}>{busy ? 'استنى…' : 'حفظ التعديلات'}</button>
            <button className="btn line" style={{ color: '#B91C1C' }} onClick={del}>حذف الإعلان</button>
          </div>
        </div>
        <div className="card col" style={{ gap: 12, flex: '0 0 260px' }}>
          <b>الإحصائيات</b>
          <span className="pill" style={{ color: st.c, background: st.bg, alignSelf: 'flex-start' }}>{st.t}</span>
          <div>
            <div style={{ fontSize: 14 }}>ظهر لـ <b>{a.views}</b> من {a.target_viewers} مستخدم</div>
            <div style={{ height: 8, background: '#E4E4E7', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}><div style={{ width: pct + '%', height: '100%', background: '#0866FF' }} /></div>
          </div>
          <div>❤️ {a.likes} إعجاب</div><div>💬 {a.comments} تعليق</div>
          <div className="mut" style={{ fontSize: 14 }}>بدأ: {dstr(a.starts_at)}<br />ينتهي: {dstr(a.ends_at)} (باقي {dayLeft(a.ends_at)} يوم)</div>
          <Link className="btn sm line" to={'/post/' + a.post_id}>فتح الإعلان وتعليقاته</Link>
        </div>
      </div>
    </>
  )
}

export function Team() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState<Profile[]>([]); const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').neq('role', 'user').order('created_at')
    if (error) setErr(errMsg(error)); else setStaff((data ?? []) as Profile[])
  }, [])
  useEffect(() => { load() }, [load])
  const set = async (u: Profile, role: string) => {
    if (!confirm(`تغيير دور ${u.name} إلى ${ROLE[role]}؟`)) return
    setErr(''); setOk('')
    const { error } = await supabase.rpc('admin_set_role', { target: u.id, new_role: role })
    if (error) setErr(errMsg(error)); else { setOk('تم'); load() }
  }
  return (
    <>
      <Head title="الفريق والأدوار" />
      <div className="card mut" style={{ lineHeight: 1.9 }}>
        <b style={{ color: '#111' }}>الأدوار:</b> الأدمن بيتحكم في كل حاجة · المشرف بيدير المجموعات والمنشورات والبلاغات · الدعم بيرد على رسائل المستخدمين.
        <br />لإضافة شخص للفريق: روح لـ «المستخدمين» وغيّر دوره من القايمة.
      </div>
      <Msg err={err} ok={ok} />
      <div className="adm-table">
        {staff.map((u) => (
          <div key={u.id} className="adm-row">
            <Avatar name={u.name} url={u.avatar_url} size={40} /><b className="grow">{u.name}</b>
            {u.id === profile?.id ? <span className="pill">{ROLE[u.role]} (أنت)</span> : (
              <select className="adm-in" value={u.role} onChange={(e) => set(u, e.target.value)}>
                {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{k === 'user' ? 'إزالة من الفريق' : v}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

export function Identity() {
  const { session } = useAuth()
  const pf = usePlatform()
  const [name, setName] = useState(pf.name); const [logo, setLogo] = useState(pf.logo_url); const [brand, setBrand] = useState(pf.brand)
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { setName(pf.name); setLogo(pf.logo_url); setBrand(pf.brand) }, [pf.name, pf.logo_url, pf.brand])
  const pick = async (f: File | null) => {
    if (!f) return
    setErr(''); setBusy(true)
    try { setLogo(await uploadImage(f, session!.user.id)) } catch (e) { setErr(errMsg(e)) }
    setBusy(false)
  }
  const save = async () => {
    setErr(''); setOk(''); setBusy(true)
    const { error } = await supabase.from('platform_settings').upsert([{ key: 'name', value: name.trim() || 'جمعتنا' }, { key: 'logo_url', value: logo }, { key: 'brand', value: brand }])
    setBusy(false)
    if (error) return setErr(errMsg(error) + ' — اتأكد إنك شغّلت تحديث 015 في Supabase.')
    setOk('تم الحفظ'); pf.reload()
  }
  return (
    <>
      <Head title="هوية المنصة" />
      <div className="card col" style={{ gap: 14, maxWidth: 520 }}>
        <label className="col" style={{ gap: 6 }}><b>اسم المنصة</b><input className="adm-in" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
        <div className="col" style={{ gap: 6 }}>
          <b>الشعار</b>
          <div className="row" style={{ gap: 12 }}>
            <div className="adm-brand" style={{ border: 0, padding: 0, margin: 0 }}><div className="av">{logo ? <img src={logo} alt="" /> : (name || 'ج').charAt(0)}</div></div>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {logo && <button className="btn sm line" onClick={() => setLogo('')}>إزالة</button>}
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <b>اللون الأساسي للمنصة</b>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input type="color" value={brand} onChange={(e) => { setBrand(e.target.value); applyBrand(e.target.value) }} style={{ width: 52, height: 40, border: 0, background: 'none', cursor: 'pointer' }} />
            {['#0866FF', '#16A34A', '#7C3AED', '#E11D48', '#EA580C', '#0891B2'].map((c) => (
              <button key={c} aria-label={c} onClick={() => { setBrand(c); applyBrand(c) }} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: brand.toLowerCase() === c.toLowerCase() ? '3px solid #111' : '2px solid #fff', boxShadow: '0 0 0 1px #D4D4D8', cursor: 'pointer' }} />
            ))}
            <button className="btn sm line" onClick={() => { setBrand(DEFAULT_BRAND); applyBrand(DEFAULT_BRAND) }}>الأزرق الأصلي</button>
          </div>
          <span className="mut" style={{ fontSize: 13 }}>اللون بيظهر فورًا قدامك للمعاينة، ومبيتحفظش للمستخدمين غير لما تدوس «حفظ».</span>
        </div>
        <Msg err={err} ok={ok} />
        <button className="btn p" disabled={busy} onClick={save}>{busy ? 'استنى…' : 'حفظ'}</button>
      </div>
    </>
  )
}
