import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'

type Ctx = { session: Session | null; profile: Profile | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [notice, setNotice] = useState('')

  const loadProfile = async (uid?: string) => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    let p = (data as Profile) ?? null
    // الشخص طلب حذف حسابه ورجع سجّل دخول قبل ما يعدي 24 ساعة: نلغي الحذف
    if (p?.deletion_requested_at) {
      const { error } = await supabase.rpc('cancel_account_deletion')
      if (!error) { p = { ...p, deletion_requested_at: null }; setNotice('تم إلغاء حذف حسابك. أهلًا بعودتك!') }
    }
    setProfile(p)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => loadProfile(s?.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{
      session, profile, loading,
      refresh: () => loadProfile(session?.user.id),
      signOut: async () => { await supabase.auth.signOut() },
    }}>
      {notice && (
        <div role="status" onClick={() => setNotice('')} style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'var(--brand)', color: '#fff', padding: '12px 20px', borderRadius: 14, cursor: 'pointer', maxWidth: '90vw' }}>{notice}</div>
      )}
      {children}
    </AuthCtx.Provider>
  )
}
