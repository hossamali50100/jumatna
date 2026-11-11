import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type Notif = {
  id: string; type: 'post_like' | 'post_comment' | 'comment_reply' | 'comment_like' | 'friend_request' | 'friend_accept' | 'group_invite' | 'group_join'
  actor_id: string | null; post_id: string | null; group_id: string | null; comment_id: string | null
  read_at: string | null; created_at: string
  profiles: { name: string; avatar_url: string | null } | null
  groups: { name: string } | null
}

// نص الإشعار: [اسم اللي عمل الحدث] + الباقي
export const NOTIF_TEXT: Record<Notif['type'], string> = {
  post_like: 'أعجبه منشورك.',
  post_comment: 'علّق على منشورك.',
  comment_reply: 'رد على تعليقك.',
  comment_like: 'أعجبه تعليقك.',
  friend_request: 'أرسل لك طلب صداقة.',
  friend_accept: 'قبل طلب صداقتك.',
  group_invite: 'دعاك للانضمام إلى مجموعة',
  group_join: 'طلب الانضمام إلى مجموعة',
}
export const notifLink = (n: Notif) =>
  n.type.startsWith('post_') || n.type.startsWith('comment_') ? `/post/${n.post_id}`
    : n.type === 'friend_request' || n.type === 'group_invite' ? '/friends'
    : n.type === 'friend_accept' ? `/u/${n.actor_id}`
    : `/g/${n.group_id}`

// قايمة إشعاراتي + عدّاد غير المقروء (تحديث كل 12 ثانية)
export function useNotifs(limit = 40) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [missing, setMissing] = useState(false)
  const load = useCallback(async () => {
    if (!uid) return
    const r = (await supabase.from('notifications').select('id,type,actor_id,post_id,group_id,comment_id,read_at,created_at,profiles!actor_id(name,avatar_url),groups!group_id(name)').order('created_at', { ascending: false }).limit(limit)) as unknown as { data: Notif[] | null; error: unknown }
    if (r.error) return setMissing(true)   // تحديث 019 لسه ما اتشغلش
    setMissing(false); setItems(r.data ?? [])
    const c = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
    setUnread(c.count ?? 0)
  }, [uid, limit])
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])

  const markRead = async (id: string) => {
    setItems((l) => l.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)))
    setUnread((u) => Math.max(0, u - 1))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
  }
  const markAll = async () => {
    setItems((l) => l.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
    setUnread(0)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  }
  return { items, unread, missing, reload: load, markRead, markAll }
}
