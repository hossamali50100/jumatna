import { useEffect, useRef, useState } from 'react'
import { ChatDockProvider } from './ChatDock'
import { useBadges } from '../lib/badges'
import { useHeartbeat } from '../lib/presence'
import MessagesMenu from './MessagesMenu'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMyGroups } from '../lib/groups'
import { Badged, Avatar, Check, Icon, useIsMobile } from '../lib/ui'
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
  const [dms, setDms] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dref = useRef<HTMLDivElement>(null)
  useHeartbeat()
  useEffect(() => { setMenu(false); setDms(false) }, [loc.pathname])
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false)
      if (dref.current && !dref.current.contains(e.target as Node)) setDms(false)
    }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [])
  const prem = isPremium(profile)
  const bd = useBadges(loc.pathname)
  const wide = /^\/(profile|u\/|g\/|messages)/.test(loc.pathname) // صفحات البروفايل بعرض كامل زي فيسبوك
  const tabs = [
    { to: '/', end: true, label: 'الرئيسية', i: 'home' },
    { to: '/groups', label: 'مجموعاتي', i: 'groups' },
    { to: '/discover', label: 'اكتشف', i: 'compass' },
    { to: '/friends', label: 'الأصدقاء', i: 'friends' },
  ]
  return (
    <>
      <header className="dtop">
        <div className="row grow" style={{ gap: 10 }}>
          <Link to="/" aria-label="الرئيسية" className="av" style={{ width: 42, height: 42, background: 'var(--brand)', fontSize: 22 }}>ج</Link>
          <form className="dsearch" onSubmit={(e) => { e.preventDefault(); nav(`/discover?q=${encodeURIComponent(q.trim())}`) }}>
            <Icon n="search" s={18} />
            <input placeholder="ابحث في جمعتنا" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </form>
        </div>
        <nav className="tnav" aria-label="التنقل">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} title={t.label} className={({ isActive }) => (isActive ? 'on' : '')}>{({ isActive }) => <>{t.to === '/friends' ? <Badged n={bd.friends}><Icon n={t.i} on={isActive} /></Badged> : <Icon n={t.i} on={isActive} />}{t.label}</>}</NavLink>
          ))}
        </nav>
        <div className="row grow" style={{ justifyContent: 'flex-end', gap: 12 }}>
          <div ref={dref} style={{ position: 'relative' }}>
            <button className="ibtn" aria-label="الرسائل" aria-expanded={dms} title="الرسائل" onClick={() => { setDms(!dms); setMenu(false) }}><Badged n={bd.msgs}><Icon n="msg" on={dms || loc.pathname.startsWith('/messages')} /></Badged></button>
            {dms && <MessagesMenu onClose={() => setDms(false)} />}
          </div>
          <Link to="/soon/notifications" className="ibtn" aria-label="الإشعارات" title="الإشعارات"><Icon n="bell" on={loc.pathname.startsWith('/soon/notifications')} /></Link>
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
                {profile && profile.role !== 'user' && <Link to="/staff/support"><Icon n="msg" />صندوق الدعم</Link>}
                <button onClick={signOut}><Icon n="out" />تسجيل الخروج</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={loc.pathname.startsWith('/messages') ? 'dbody wide full' : wide ? 'dbody wide' : 'dbody'}>
        {!wide && <aside className="dside">
          <b style={{ padding: '4px 12px', fontSize: 15 }}>مجموعاتك</b>
          {groups.filter((g) => g.myStatus === 'active').slice(0, 6).map((g) => (
            <Link key={g.id} className="nav" to={`/g/${g.id}`}><Avatar name={g.name} url={g.cover_url} size={36} square />{g.name}</Link>
          ))}
          <Link className="nav" to="/groups" style={{ color: '#111111', fontWeight: 600 }}>عرض كل مجموعاتي</Link>
          <Link className="btn p" to="/create" style={{ marginTop: 8 }}>+ إنشاء مجموعة</Link>
        </aside>}
        <main className="dmain"><Outlet /></main>
        {!wide && (
          <aside className="dright">
            {!prem && <div className="card col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8 }}><span className="pill">ترقية</span><Check /></div>
              <b style={{ fontSize: 17 }}>قم بترقية حسابك</b>
              <div className="mut" style={{ lineHeight: 1.7 }}>أنشئ حتى 10 مجموعات واحصل على علامة الحساب المميز الخضراء.</div>
              <Link className="btn p" to="/plans">اعرف المزيد</Link>
            </div>}
            <div className="card col" style={{ gap: 6 }}>
              <b style={{ fontSize: 17 }}>الدعم</b>
              <div className="mut" style={{ lineHeight: 1.7, marginBottom: 4 }}>عندك مشكلة أو اقتراح أو سؤال؟ تواصل معنا وإحنا هنساعدك.</div>
              <Link className="btn p" to="/support">تواصل معنا</Link>
            </div>
          </aside>
        )}
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
  const p = loc.pathname
  const bd = useBadges(p)
  const tab = (to: string, label: string, i: string, on: boolean, n = 0) => (
    <Link to={to} className={on ? 'on' : ''}><Badged n={n}><Icon n={i} on={on} /></Badged>{label}</Link>
  )
  const item = (to: string, label: string, i: string, n = 0) => <Link to={to}><Icon n={i} /><span style={{ flex: 1 }}>{label}</span>{n > 0 && <span style={{ background: '#E5383B', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{n}</span>}</Link>
  return (
    <div className="mroot">
      <header className="mbar">
        <Link to="/" className="av" style={{ width: 36, height: 36, background: 'var(--brand)', fontSize: 18, borderRadius: 10 }}>ج</Link>
        <b style={{ fontSize: 21, flex: 1 }}>جمعتنا</b>
        <Link to="/discover" className="mi" aria-label="بحث"><Icon n="search" /></Link>
        <button className="mi" aria-label="القائمة" onClick={() => setOpen(true)}><Badged n={bd.friends}><Icon n="menu" /></Badged></button>
      </header>
      <main className="mmain" ref={main}><Outlet /></main>
      <nav className="mtabs" aria-label="التنقل">
        {tab('/', 'الرئيسية', 'home', p === '/')}
        {tab('/messages', 'الرسائل', 'msg', p.startsWith('/messages'), bd.msgs)}
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
          {item('/friends', 'الأصدقاء', 'friends', bd.friends)}
          {item('/support', 'الدعم والمساعدة', 'msg')}
          {item('/soon/notifications', 'الإشعارات', 'bell')}
          <div className="hr" />
          {item('/plans', 'الباقات والترقية', 'card')}
          {profile && profile.role !== 'user' && item('/staff/support', 'صندوق الدعم', 'msg')}
          <button onClick={signOut}><Icon n="out" /><span style={{ flex: 1 }}>تسجيل الخروج</span></button>
        </aside>
      </>)}
    </div>
  )
}

export default function Layout() {
  const mobile = useIsMobile()
  return <ChatDockProvider enabled={!mobile}>{mobile ? <Mobile /> : <Desktop />}</ChatDockProvider>
}
