import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMyGroups } from '../lib/groups'
import { Avatar, Check, Icon, useIsMobile } from '../lib/ui'
import { isPremium } from '../lib/supabase'

function PremName({ name, prem }: { name?: string; prem: boolean }) {
  return <span>{prem && <Check />}<b>{name}</b></span>
}

function Desktop() {
  const { profile, signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const groups = useMyGroups(loc.pathname)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setMenu(false), [loc.pathname])
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [])
  const prem = isPremium(profile)
  const tabs = [
    { to: '/', end: true, label: 'الرئيسية', i: 'home' },
    { to: '/groups', label: 'مجموعاتي', i: 'groups' },
    { to: '/discover', label: 'اكتشف', i: 'compass' },
    { to: '/soon/friends', label: 'الأصدقاء', i: 'friends' },
  ]
  return (
    <>
      <header className="dtop">
        <div className="row grow" style={{ gap: 10 }}>
          <Link to="/" aria-label="الرئيسية" className="av" style={{ width: 42, height: 42, background: '#111111', fontSize: 22 }}>ج</Link>
          <form className="dsearch" onSubmit={(e) => { e.preventDefault(); nav(`/discover?q=${encodeURIComponent(q.trim())}`) }}>
            <Icon n="search" s={18} />
            <input placeholder="ابحث في جمعتنا" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </form>
        </div>
        <nav className="tnav" aria-label="التنقل">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} title={t.label} className={({ isActive }) => (isActive ? 'on' : '')}><Icon n={t.i} />{t.label}</NavLink>
          ))}
        </nav>
        <div className="row grow" style={{ justifyContent: 'flex-end', gap: 12 }}>
          <Link to="/soon/chat" className="ibtn" aria-label="الرسائل" title="الرسائل"><Icon n="msg" /></Link>
          <Link to="/soon/notifications" className="ibtn" aria-label="الإشعارات" title="الإشعارات"><Icon n="bell" /></Link>
          <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setMenu(!menu)} aria-label="حسابي" aria-expanded={menu} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', borderRadius: '50%' }}>
              <Avatar name={profile?.name} url={profile?.avatar_url} size={42} />
            </button>
            {menu && (
              <div className="pop" style={{ insetInlineStart: 'auto', insetInlineEnd: 'auto', left: 0, width: 260 }}>
                <Link to="/profile" style={{ padding: 10 }}>
                  <Avatar name={profile?.name} url={profile?.avatar_url} size={48} />
                  <div><PremName name={profile?.name} prem={prem} /><div className="mut">عرض ملفك الشخصي</div></div>
                </Link>
                <div className="hr" />
                <Link to="/plans"><Icon n="card" />الباقات والترقية</Link>
                <button onClick={signOut}><Icon n="out" />تسجيل الخروج</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="dbody">
        <aside className="dside">
          <b style={{ padding: '4px 12px', fontSize: 15 }}>مجموعاتك</b>
          {groups.filter((g) => g.myStatus === 'active').slice(0, 6).map((g) => (
            <Link key={g.id} className="nav" to={`/g/${g.id}`}><Avatar name={g.name} url={g.cover_url} size={36} square />{g.name}</Link>
          ))}
          <Link className="nav" to="/groups" style={{ color: '#111111', fontWeight: 600 }}>عرض كل مجموعاتي</Link>
          <Link className="btn p" to="/create" style={{ marginTop: 8 }}>+ إنشاء مجموعة</Link>
        </aside>
        <main className="dmain"><Outlet /></main>
      </div>
    </>
  )
}

function Mobile() {
  const { profile, signOut } = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
  useEffect(() => { setOpen(false); main.current?.scrollTo(0, 0) }, [loc.pathname])
  const prem = isPremium(profile)
  const tab = (to: string, label: string, i: string, on: boolean) => (
    <Link to={to} className={on ? 'on' : ''}><Icon n={i} />{label}</Link>
  )
  const p = loc.pathname
  const item = (to: string, label: string, i: string) => <Link to={to}><Icon n={i} /><span style={{ flex: 1 }}>{label}</span></Link>
  return (
    <div className="mroot">
      <header className="mbar">
        <Link to="/" className="av" style={{ width: 36, height: 36, background: '#111111', fontSize: 18, borderRadius: 10 }}>ج</Link>
        <b style={{ fontSize: 21, flex: 1 }}>جمعتنا</b>
        <Link to="/discover" className="mi" aria-label="بحث"><Icon n="search" /></Link>
        <button className="mi" aria-label="القائمة" onClick={() => setOpen(true)}><Icon n="menu" /></button>
      </header>
      <main className="mmain" ref={main}><Outlet /></main>
      <nav className="mtabs" aria-label="التنقل">
        {tab('/', 'الرئيسية', 'home', p === '/')}
        {tab('/soon/chat', 'الرسائل', 'msg', p.startsWith('/soon/chat'))}
        {tab('/profile', 'حسابي', 'user', p === '/profile')}
      </nav>
      {open && (<>
        <div className="sbg" onClick={() => setOpen(false)} />
        <aside className="drawer" aria-label="القائمة">
          <Link to="/profile" style={{ gap: 12, padding: '8px 8px 14px', borderBottom: '1px solid #E4E4E7', marginBottom: 8, minHeight: 0 }}>
            <Avatar name={profile?.name} url={profile?.avatar_url} size={52} />
            <div style={{ flex: 1 }}><PremName name={profile?.name} prem={prem} /><div className="mut">عرض حسابي</div></div>
          </Link>
          {item('/groups', 'مجموعاتي', 'groups')}
          {item('/discover', 'اكتشف مجموعات', 'compass')}
          {item('/create', 'إنشاء مجموعة', 'plus')}
          <div className="hr" />
          {item('/soon/friends', 'الأصدقاء', 'friends')}
          {item('/soon/notifications', 'الإشعارات', 'bell')}
          <div className="hr" />
          {item('/plans', 'الباقات والترقية', 'card')}
          <button onClick={signOut}><Icon n="out" /><span style={{ flex: 1 }}>تسجيل الخروج</span></button>
        </aside>
      </>)}
    </div>
  )
}

export default function Layout() {
  return useIsMobile() ? <Mobile /> : <Desktop />
}
