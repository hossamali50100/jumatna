import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const isRoom = (id?: string | null) => !!id && id.startsWith('room:')
export const roomKey = (id: string) => id.slice(5)
export type RoomMember = { user_id: string; profiles: { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null } | null }
export type RoomInfo = { id: string; name: string; avatar_url: string | null; created_by: string | null; members: RoomMember[] }
export const refreshRooms = () => window.dispatchEvent(new Event('jm:rooms'))

// بيانات مجموعة الشات: الاسم والصورة والأعضاء
export function useRoom(rid: string | null) {
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    if (!rid) return
    const [r, m] = await Promise.all([
      supabase.from('chat_rooms').select('id,name,avatar_url,created_by').eq('id', rid).maybeSingle(),
      supabase.from('chat_room_members').select('user_id,profiles!user_id(name,avatar_url,plan,plan_until)').eq('room_id', rid),
    ])
    if (r.error || !r.data) { setMissing(true); setRoom(null); return }
    setMissing(false)
    setRoom({ ...(r.data as { id: string; name: string; avatar_url: string | null; created_by: string | null }), members: ((m.data ?? []) as unknown as RoomMember[]) })
  }, [rid])
  useEffect(() => { setRoom(null); setMissing(false); load(); window.addEventListener('jm:rooms', load); return () => window.removeEventListener('jm:rooms', load) }, [load])
  return { room, missing, reload: load }
}
