import { useEffect, useState } from 'react'
import { supabase, type Group } from './supabase'
import { useAuth } from './auth'

export type MyGroup = Group & { myRole: string; myStatus: string }

export function useMyGroups(dep?: unknown) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [list, setList] = useState<MyGroup[]>([])
  useEffect(() => {
    if (!uid) return
    supabase.from('group_members').select('role,status,groups(*)').eq('user_id', uid).order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data as unknown as { role: string; status: string; groups: Group | null }[]) ?? []
        setList(rows.filter((r) => r.groups).map((r) => ({ ...r.groups!, myRole: r.role, myStatus: r.status })))
      })
  }, [uid, dep])
  return list
}
