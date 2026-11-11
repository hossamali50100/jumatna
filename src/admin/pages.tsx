import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage, type Profile, type Group } from '../lib/supabase'
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

export function Users() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [users, setUsers] = useState<Profile[]>([])
  const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'premium' | 'banned' | 'staff'>('all')
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setErr(errMsg(error)); else setUsers((data ?? []) as Profile[])
  }, [])
  useEffect(() => { load() }, [load])
  const rpc = async (fn: string, args: Record<string, unknown>, msg: string) => {
    setErr(''); setOk('')
    const { error } = await supabase.rpc(fn, args)
    if (error) setErr(errMsg(error)); else { setOk(msg); load() }
  }
  const list = users.filter((u) => (!q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase()))
    && (f === 'all' || (f === 'premium' && isPremium(u)) || (f === 'banned' && u.banned) || (f === 'staff' && u.role !== 'user')))
  const chips: ['all' | 'premium' | 'banned' | 'staff', string][] = [['all', 'الكل'], ['premium', 'المميزين ⭐'], ['banned', 'المحظورين'], ['staff', 'الفريق']]
  return (
    <>
      <Head title="المستخدمين"><input className="adm-in" placeholder="ابحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} /></Head>
      <div className="adm-chips">{chips.map(([k, t]) => <button key={k} className={'adm-chip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>{t}</button>)}</div>
      <Msg err={err} ok={ok} />
      <div className="adm-table">
        {list.map((u) => (
          <div key={u.id} className="adm-row">
            <Link to={`/u/${u.id}`} target="_blank" className="row grow" style={{ gap: 10 }}>
              <Avatar name={u.name} url={u.avatar_url} size={40} />
              <div><b>{u.name}</b> {isPremium(u) && <span title="مميز">✅</span>}{u.banned && <span style={{ color: '#d33' }}> · محظور</span>}
                <div className="mut" style={{ fontSize: 13 }}>{ROLE[u.role]}{u.plan_until && isPremium(u) ? ' · مميز لحد ' + new Date(u.plan_until).toLocaleDateString('ar-EG') : ''}{u.created_at ? ' · انضم ' + timeAgo(u.created_at) : ''}</div></div>
            </Link>
            {isAdmin && u.id !== profile!.id && (
              <>
                <select className="adm-in" value={u.role} onChange={(e) => confirm(`تغيير دور ${u.name} إلى ${ROLE[e.target.value]}؟`) && rpc('admin_set_role', { target: u.id, new_role: e.target.value }, 'تم تغيير الدور')}>
                  {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {isPremium(u)
                  ? <button className="btn sm line" onClick={() => confirm('إلغاء المميز؟') && rpc('admin_set_plan', { target: u.id, new_plan: 'free', days: 0 }, 'تم إلغاء المميز')}>إلغاء المميز</button>
                  : <button className="btn sm p" onClick={() => confirm('تفعيل المميز 30 يوم؟') && rpc('admin_set_plan', { target: u.id, new_plan: 'premium', days: 30 }, 'تم تفعيل المميز 30 يوم')}>تفعيل مميز</button>}
                <button className="btn sm line danger" onClick={() => confirm(u.banned ? 'فك الحظر؟' : `حظر ${u.name}؟`) && rpc('admin_set_banned', { target: u.id, flag: !u.banned }, u.banned ? 'تم فك الحظر' : 'تم الحظر')}>{u.banned ? 'فك الحظر' : 'حظر'}</button>
              </>
            )}
          </div>
        ))}
        {!list.length && <div className="adm-row mut">لا نتائج</div>}
      </div>
    </>
  )
}

export function Groups() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState<Group[]>([]); const [q, setQ] = useState('')
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setErr(errMsg(error)); else setGroups((data ?? []) as Group[])
  }, [])
  useEffect(() => { load() }, [load])
  const del = async (g: Group) => {
    if (!confirm(`حذف مجموعة «${g.name}» نهائيًا بكل منشوراتها؟`)) return
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setErr(errMsg(error)); else { setOk('تم حذف المجموعة'); load() }
  }
  const list = groups.filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <Head title="المجموعات"><input className="adm-in" placeholder="ابحث باسم المجموعة…" value={q} onChange={(e) => setQ(e.target.value)} /></Head>
      <Msg err={err} ok={ok} />
      <div className="adm-table">
        {list.map((g) => (
          <div key={g.id} className="adm-row">
            <Link to={`/g/${g.id}`} target="_blank" className="row grow" style={{ gap: 10 }}>
              <Avatar name={g.name} url={g.cover_url} size={40} square />
              <div><b>{g.name}</b><div className="mut" style={{ fontSize: 13 }}>{g.privacy === 'public' ? 'عامة' : 'خاصة'} · {timeAgo(g.created_at)}</div></div>
            </Link>
            {profile?.role === 'admin' && <button className="btn sm line danger" onClick={() => del(g)}>حذف</button>}
          </div>
        ))}
        {!list.length && <div className="adm-row mut">لا مجموعات</div>}
      </div>
    </>
  )
}

type PostRow = { id: string; body: string; image_url: string | null; created_at: string; profiles: { name: string } | null; groups: { name: string } | null }
export function Posts() {
  const [posts, setPosts] = useState<PostRow[]>([]); const [q, setQ] = useState('')
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const load = useCallback(async () => {
    const { data, error } = (await supabase.from('posts').select('id,body,image_url,created_at,profiles!author_id(name),groups!group_id(name)').order('created_at', { ascending: false }).limit(200)) as unknown as { data: PostRow[] | null; error: { message: string } | null }
    if (error) setErr(errMsg(error)); else setPosts(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])
  const del = async (p: PostRow) => {
    if (!confirm('حذف المنشور ده نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', p.id)
    if (error) setErr(errMsg(error)); else { setOk('تم حذف المنشور'); load() }
  }
  const list = posts.filter((p) => !q.trim() || p.body.includes(q.trim()) || (p.profiles?.name ?? '').includes(q.trim()))
  return (
    <>
      <Head title="المنشورات"><input className="adm-in" placeholder="ابحث في النص أو اسم الكاتب…" value={q} onChange={(e) => setQ(e.target.value)} /></Head>
      <Msg err={err} ok={ok} />
      <div className="adm-table">
        {list.map((p) => (
          <div key={p.id} className="adm-row">
            <div className="grow">
              <b>{p.profiles?.name ?? 'مستخدم'}</b> <span className="mut" style={{ fontSize: 13 }}>· {p.groups ? p.groups.name : 'منشور شخصي'} · {timeAgo(p.created_at)}</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{p.body.length > 200 ? p.body.slice(0, 200) + '…' : p.body}{p.image_url && ' 📷'}</div>
            </div>
            <button className="btn sm line danger" onClick={() => del(p)}>حذف</button>
          </div>
        ))}
        {!list.length && <div className="adm-row mut">لا منشورات</div>}
      </div>
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
