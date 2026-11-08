import { Navigate, Route, Routes } from 'react-router-dom'
import { configured } from './lib/supabase'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Discover from './pages/Discover'
import CreateGroup from './pages/CreateGroup'
import GroupPage from './pages/GroupPage'
import Profile from './pages/Profile'
import Plans from './pages/Plans'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
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
        <Route path="profile" element={<Profile />} />
        <Route path="plans" element={<Plans />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
