import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Avatar, Check } from './ui'
import { isPremium } from '../lib/supabase'

const I = (d: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)

export default function Layout() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const tabs = [
    { to: '/', end: true, label: 'الرئيسية', d: 'M3 11l9-8 9 8v9a1 1 0 01-1 1H4a1 1 0 01-1-1z' },
    { to: '/discover', label: 'اكتشف', d: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3' },
    { to: '/create', label: 'مجموعة جديدة', d: 'M12 5v14M5 12h14' },
    { to: '/profile', label: 'حسابي', d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  ]
  return (
    <>
      <header className="top">
        <div className="topin">
          <Link to="/" className="row" style={{ gap: 8 }}>
            <span className="av" style={{ background: '#fff', color: '#111', width: 34, height: 34 }}>ج</span>
            <b style={{ fontSize: 18 }}>جمعتنا</b>
          </Link>
          <form className="grow" onSubmit={(e) => { e.preventDefault(); nav(`/discover?q=${encodeURIComponent(q.trim())}`) }}>
            <input className="in" style={{ minHeight: 38 }} placeholder="ابحث عن مجموعة" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </form>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 0, cursor: 'pointer' }} aria-label="القائمة" aria-expanded={open}>
              <Avatar name={profile?.name} url={profile?.avatar_url} size={36} />
            </button>
            {open && (
              <div className="menu" onClick={() => setOpen(false)}>
                <div className="row" style={{ padding: '8px 12px', gap: 6 }}>{isPremium(profile) && <Check />}<b>{profile?.name}</b></div>
                <Link to="/profile">حسابي</Link>
                <Link to="/plans">الباقات والترقية</Link>
                <button onClick={signOut}>تسجيل الخروج</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="wrap"><Outlet /></main>
      <nav className="tabs" aria-label="التنقل">
        <div className="tabsin">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}>{I(t.d)}{t.label}</NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
