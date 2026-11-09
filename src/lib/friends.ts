import { useCallback, useEffect, useState } from 'react'
import { supabase, errMsg, type Profile } from './supabase'
import { useAuth } from './auth'

export type PubProfile = Pick<Profile, 'name' | 'avatar_url' | 'plan' | 'plan_until'>
export type Rel = { other: string; profile: PubProfile | null; status: 'pending' | 'accepted'; incoming: boolean }

type Row = {
  requester_id: string; addressee_id: string; status: 'pending' | 'accepted'
  req: PubProfile | null; adr: PubProfile | null
}

// كل علاقات الصداقة بتاعتي: أصدقاء + طلبات واردة + طلبات صادرة
export function useFriends() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [rels, setRels] = useState<Rel[]>([])
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('friendships')
      .select('requester_id,addressee_id,status,req:profiles!requester_id(name,avatar_url,plan,plan_until),adr:profiles!addressee_id(name,avatar_url,plan,plan_until)')
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
    if (error) return setError(errMsg(error))
    setError('')
    setRels(((data as unknown as Row[]) ?? []).map((r) => {
      const incoming = r.addressee_id === uid
      return { other: incoming ? r.requester_id : r.addressee_id, profile: incoming ? r.req : r.adr, status: r.status, incoming }
    }))
  }, [uid])
  useEffect(() => { reload() }, [reload])

  const request = async (to: string) => { const { error } = await supabase.from('friendships').insert({ requester_id: uid, addressee_id: to }); if (error) setError(errMsg(error)); reload() }
  const accept = async (from: string) => { const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('requester_id', from).eq('addressee_id', uid); if (error) setError(errMsg(error)); reload() }
  // إلغاء طلب / رفض طلب / حذف صديق: كلهم حذف الصف
  const remove = async (other: string) => {
    const { error } = await supabase.from('friendships').delete().or(`and(requester_id.eq.${uid},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${uid})`)
    if (error) setError(errMsg(error)); reload()
  }
  return { rels, error, request, accept, remove, reload }
}
