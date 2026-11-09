import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { configured } from './lib/supabase'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Discover from './pages/Discover'
import CreateGroup from './pages/CreateGroup'
import GroupPage from './pages/GroupPage'
import UserPage from './pages/UserPage'
import Plans from './pages/Plans'
import MyGroups from './pages/MyGroups'
import Friends from './pages/Friends'
import ComingSoon from './pages/ComingSoon'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  // رابط دعوة لمجموعة: نفتكره لحد ما الشخص يسجّل دخول وبعدين نوديه عليه
  useEffect(() => {
    try {
      if (!session) { if (loc.pathname.startsWith('/g/')) sessionStorage.setItem('next', loc.pathname) }
      else { const n = sessionStorage.getItem('next'); if (n) { sessionStorage.removeItem('next'); nav(n, { replace: true }) } }
    } catch { /* التخزين مش متاح */ }
  }, [session, loc.pathname, nav])
  if (!configured) return <div className="wrap"><div className="card">لازم تضيف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (راجع README).</div></div>
  if (loading) return <div className="wrap mut">جاري التحميل…</div>
  if (!session) return <Login />
  if (!profile) return <div className="wrap"><div className="card mut">جاري تجهيز حسابك… لو الصفحة فضلت كده أعد التحميل.</div></div>
  if (profile.banned) return <div className="wrap col"><div className="err">تم حظر حسابك. تواصل مع الدعم لو شايف ده خطأ.</div><button className="btn" onClick={signOut}>تسجيل الخروج</button></div>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="discover" element={<Discover />} />
        <Route path="create" element={<CreateGroup />} />
        <Route path="g/:id" element={<GroupPage />} />
        <Route path="profile" element={<UserPage />} />
        <Route path="u/:id" element={<UserPage />} />
        <Route path="plans" element={<Plans />} />
        <Route path="groups" element={<MyGroups />} />
        <Route path="friends" element={<Friends />} />
        <Route path="soon/:what" element={<ComingSoon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
