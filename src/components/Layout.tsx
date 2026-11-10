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
import { usePlatform } from '../lib/platform'

function PremName({ name, prem }: { name?: string; prem: boolean }) {
  return <span>{prem && <Check />}<b>{name}</b></span>
}

function Desktop() {
  const { profile, signOut } = useAuth()
  const pf = usePlatform()
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
          <Link to="/" aria-label="الرئيسية" className="av" style={{ width: 42, height: 42, background: 'var(--brand)', fontSize: 22, overflow: 'hidden' }}>{pf.logo_url ? <img src={pf.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : pf.name.charAt(0)}</Link>
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
                {profile && profile.role !== 'user' && <a href="/admin"><Icon n="card" />لوحة الإدارة</a>}
                {profile && profile.role !== 'user' && <Link to="/staff/support"><Icon n="msg" />صندوق الدعم</Link>}
                <button onClick={signOut}><Icon n="out" />تسجيل الخروج</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={loc.pathname.startsWith('/messages') ? 'dbody wide full' : wide ? 'dbody wide' : 'dbody'}>
        {!wide && <aside className="dside">
          <Link className="nav fb" to="/profile"><Avatar name={profile?.name} url={profile?.avatar_url} size={36} /><b><PremName name={profile?.name} prem={prem} /></b></Link>
          {!prem && <Link className="nav fb" to="/plans"><span className="sbi g"><Icon n="check" s={22} /></span><span>الترقية للحساب المميز<small>أنشئ حتى 10 مجموعات وعلامة خضراء</small></span></Link>}
          <Link className="nav fb" to="/support"><span className="sbi"><Icon n="msg" s={22} on /></span><span>الدعم<small>مشكلة أو اقتراح أو سؤال</small></span></Link>
          <div className="hr" style={{ margin: '8px 4px' }} />
          <div className="sbh">مجموعاتك</div>
          {groups.filter((g) => g.myStatus === 'active').slice(0, 6).map((g) => (
            <Link key={g.id} className="nav fb" to={`/g/${g.id}`}><Avatar name={g.name} url={g.cover_url} size={36} square />{g.name}</Link>
          ))}
          <Link className="nav fb" to="/groups"><span className="sbi gr"><Icon n="more" s={22} /></span>عرض كل مجموعاتي</Link>
          <Link className="nav fb" to="/create"><span className="sbi gr"><Icon n="plus" s={22} /></span>إنشاء مجموعة</Link>
        </aside>}
        <main className="dmain"><Outlet /></main>
      </div>
    </>
  )
}

function Mobile() {
  const { profile, signOut } = useAuth()
  const pf = usePlatform()
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
        <Link to="/" className="av" style={{ width: 36, height: 36, background: 'var(--brand)', fontSize: 18, borderRadius: 10, overflow: 'hidden' }}>{pf.logo_url ? <img src={pf.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : pf.name.charAt(0)}</Link>
        <b style={{ fontSize: 21, flex: 1 }}>{pf.name}</b>
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
          {profile && profile.role !== 'user' && item('/admin', 'لوحة الإدارة', 'card')}
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
