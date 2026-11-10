import { useState, type ReactElement } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePlatform } from '../lib/platform'
import { Err, useIsMobile } from '../lib/ui'
import { Overview, Users, Groups, Posts, Reports, Inbox, Upgrades, Team, Identity, useCounts } from './pages'
import './admin.css'

type Role = 'admin' | 'mod' | 'support'
const NAV: { to: string; label: string; icon: string; roles: Role[]; sec?: string; badge?: 'reports' }[] = [
  { to: '/admin', label: 'نظرة عامة', icon: '📊', roles: ['admin', 'mod', 'support'], sec: 'الرئيسية' },
  { to: '/admin/users', label: 'المستخدمين', icon: '👥', roles: ['admin', 'mod', 'support'], sec: 'المحتوى والناس' },
  { to: '/admin/groups', label: 'المجموعات', icon: '🗂️', roles: ['admin', 'mod'] },
  { to: '/admin/posts', label: 'المنشورات', icon: '📝', roles: ['admin', 'mod'] },
  { to: '/admin/reports', label: 'البلاغات', icon: '🚩', roles: ['admin', 'mod'], badge: 'reports' },
  { to: '/admin/inbox', label: 'صندوق الدعم', icon: '💬', roles: ['admin', 'support'], sec: 'التواصل' },
  { to: '/admin/upgrades', label: 'طلبات الترقية', icon: '⭐', roles: ['admin', 'support'] },
  { to: '/admin/team', label: 'الفريق والأدوار', icon: '🛡️', roles: ['admin'], sec: 'الإعدادات' },
  { to: '/admin/identity', label: 'هوية المنصة', icon: '🎨', roles: ['admin'] },
]

// بوابة دخول الإدارة (منفصلة عن الموقع): إيميل + كلمة سر، ومفيش تسجيل حساب جديد
function Gate({ denied }: { denied?: boolean }) {
  const { signOut } = useAuth()
  const pf = usePlatform()
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) setErr('الإيميل أو كلمة السر غير صحيحة.')
  }
  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/admin' } })
    if (error) setErr(errMsg(error))
  }
  return (
    <div className="adm-gate">
      <div className="box">
        <div className="av">{pf.logo_url ? <img src={pf.logo_url} alt="" /> : pf.name.charAt(0)}</div>
        <div><b style={{ fontSize: 22 }}>لوحة إدارة {pf.name}</b><div className="mut">دخول الفريق فقط</div></div>
        {denied ? (
          <>
            <Err>حسابك مش من فريق الإدارة، فمش مسموحلك تدخل هنا.</Err>
            <button className="btn" onClick={signOut}>تسجيل الخروج</button>
            <a className="mut" href="/">الرجوع للموقع</a>
          </>
        ) : (
          <form onSubmit={submit} className="col" style={{ gap: 10 }}>
            <input className="adm-in" type="email" placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <input className="adm-in" type="password" placeholder="كلمة السر" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <Err>{err}</Err>
            <button className="btn p" disabled={busy}>{busy ? 'جاري الدخول…' : 'دخول'}</button>
            <button type="button" className="btn line" onClick={google}>الدخول بحساب Google</button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function AdminApp() {
  const { session, profile, loading, signOut } = useAuth()
  const mobile = useIsMobile()
  const pf = usePlatform()
  const nav = useNavigate()
  const counts = useCounts(!!profile && profile.role !== 'user')
  if (loading) return <div className="adm-gate mut">جاري التحميل…</div>
  if (!session) return <Gate />
  if (!profile) return <div className="adm-gate mut">جاري تجهيز الحساب…</div>
  if (profile.role === 'user' || profile.banned) return <Gate denied />
  if (mobile) return <div className="adm-gate"><div className="box"><b>لوحة الإدارة متاحة من الكمبيوتر فقط.</b><a className="btn" href="/">الرجوع للموقع</a></div></div>
  const role = profile.role as Role
  const items = NAV.filter((n) => n.roles.includes(role))
  const allowed = (path: string) => items.some((n) => n.to === path)
  const guard = (path: string, el: ReactElement) => (allowed(path) ? el : <Navigate to="/admin" replace />)

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <div className="av">{pf.logo_url ? <img src={pf.logo_url} alt="" /> : pf.name.charAt(0)}</div>
          <div><b>{pf.name}</b><div className="mut" style={{ fontSize: 12 }}>لوحة الإدارة</div></div>
        </div>
        {items.map((n) => (
          <div key={n.to}>
            {n.sec && <div className="adm-sec">{n.sec}</div>}
            <NavLink to={n.to} end={n.to === '/admin'} className={({ isActive }) => 'adm-nav' + (isActive ? ' on' : '')}>
              <span>{n.icon}</span>{n.label}{n.badge === 'reports' && counts.rp > 0 && <span className="n">{counts.rp}</span>}
            </NavLink>
          </div>
        ))}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #EEE', paddingTop: 10 }}>
          <div className="mut" style={{ padding: '0 12px', fontSize: 13 }}>{profile.name}</div>
          <a className="adm-nav" href="/">↩ الرجوع للموقع</a>
          <button className="adm-nav" onClick={async () => { await signOut(); nav('/admin') }}>🚪 تسجيل الخروج</button>
        </div>
      </aside>
      <main className="adm-main">
        <Routes>
          <Route path="/admin" element={<Overview />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/groups" element={guard('/admin/groups', <Groups />)} />
          <Route path="/admin/posts" element={guard('/admin/posts', <Posts />)} />
          <Route path="/admin/reports" element={guard('/admin/reports', <Reports />)} />
          <Route path="/admin/inbox" element={guard('/admin/inbox', <Inbox />)} />
          <Route path="/admin/upgrades" element={guard('/admin/upgrades', <Upgrades />)} />
          <Route path="/admin/team" element={guard('/admin/team', <Team />)} />
          <Route path="/admin/identity" element={guard('/admin/identity', <Identity />)} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
