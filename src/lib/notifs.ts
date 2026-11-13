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
  post_like: 'تفاعل مع منشورك.',
  post_comment: 'علّق على منشورك.',
  comment_reply: 'رد على تعليقك.',
  comment_like: 'تفاعل مع تعليقك.',
  friend_request: 'أرسل لك طلب صداقة.',
  friend_accept: 'قبل طلب صداقتك.',
  group_invite: 'دعاك للانضمام إلى مجموعة',
  group_join: 'طلب الانضمام إلى مجموعة',
}
export const NOTIF_PLURAL: Record<Notif['type'], string> = {
  post_like: 'تفاعلوا مع منشورك.',
  post_comment: 'علّقوا على منشورك.',
  comment_reply: 'ردّوا على تعليقك.',
  comment_like: 'تفاعلوا مع تعليقك.',
  friend_request: 'أرسلوا لك طلبات صداقة.',
  friend_accept: 'قبلوا طلب صداقتك.',
  group_invite: 'دعوك للانضمام إلى مجموعة',
  group_join: 'طلبوا الانضمام إلى مجموعة',
}
// تجميع الإشعارات المتشابهة (نفس النوع على نفس المنشور/التعليق/المجموعة) في إشعار واحد: "أحمد و3 آخرين علّقوا على منشورك"
export type NGroup = { key: string; type: Notif['type']; latest: Notif; ids: string[]; actors: { id: string | null; name: string; avatar: string | null }[]; unread: boolean }
export function groupNotifs(items: Notif[]): NGroup[] {
  const day = (d: string) => new Date(d).toDateString()
  const keyOf = (n: Notif) => {
    switch (n.type) {
      case 'post_like': case 'post_comment': case 'comment_reply': return `${n.type}:${n.post_id}`
      case 'comment_like': return `${n.type}:${n.comment_id}`
      case 'group_join': case 'group_invite': return `${n.type}:${n.group_id}`
      default: return `${n.type}:${day(n.created_at)}`   // طلبات/قبول الصداقة: لكل يوم
    }
  }
  const map = new Map<string, NGroup>()
  for (const n of items) {   // items مرتبة من الأحدث للأقدم
    const k = keyOf(n)
    let g = map.get(k)
    if (!g) { g = { key: k, type: n.type, latest: n, ids: [], actors: [], unread: false }; map.set(k, g) }
    g.ids.push(n.id)
    if (!n.read_at) g.unread = true
    if (!g.actors.some((a) => a.id === n.actor_id)) g.actors.push({ id: n.actor_id, name: n.profiles?.name ?? 'مستخدم', avatar: n.profiles?.avatar_url ?? null })
  }
  return [...map.values()]
}

// أنواع الإشعارات اللي المستخدم يقدر يقفلها
export const NOTIF_PREF_TYPES: { type: Notif['type']; label: string; hint: string }[] = [
  { type: 'friend_request', label: 'طلبات الصداقة', hint: 'لما حد يبعتلك طلب صداقة' },
  { type: 'friend_accept', label: 'قبول طلب صداقتك', hint: 'لما حد يقبل طلبك' },
  { type: 'post_comment', label: 'التعليقات على منشوراتك', hint: 'لما حد يعلّق على منشورك' },
  { type: 'comment_reply', label: 'الردود على تعليقاتك', hint: 'لما حد يرد على تعليقك' },
  { type: 'post_like', label: 'التفاعلات على منشوراتك', hint: 'أعجبني وباقي التفاعلات' },
  { type: 'comment_like', label: 'التفاعلات على تعليقاتك', hint: 'لما حد يتفاعل مع تعليقك' },
  { type: 'group_invite', label: 'دعوات المجموعات', hint: 'لما حد يدعوك لمجموعة' },
  { type: 'group_join', label: 'طلبات الانضمام لمجموعاتك', hint: 'لما حد يطلب ينضم لمجموعتك' },
]
export function useNotifPrefs() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [off, setOff] = useState<Set<string>>(new Set())
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    if (!uid) return
    const r = await supabase.from('notification_prefs').select('type,enabled').eq('user_id', uid)
    if (r.error) return setMissing(true)
    setMissing(false); setOff(new Set(((r.data ?? []) as { type: string; enabled: boolean }[]).filter((x) => !x.enabled).map((x) => x.type)))
  }, [uid])
  useEffect(() => { load() }, [load])
  const set = async (type: string, enabled: boolean) => {
    if (!uid) return
    setErr('')
    const prev = off
    setOff((o) => { const n = new Set(o); if (enabled) n.delete(type); else n.add(type); return n })
    const { error } = await supabase.from('notification_prefs').upsert({ user_id: uid, type, enabled }, { onConflict: 'user_id,type' })
    if (error) { setOff(prev); setErr(error.message) }
  }
  return { off, set, missing, err }
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
  const markMany = async (ids: string[]) => {
    const now = new Date().toISOString()
    const fresh = items.filter((n) => ids.includes(n.id) && !n.read_at).length
    setItems((l) => l.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)))
    setUnread((u) => Math.max(0, u - fresh))
    await supabase.from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null)
  }
  return { items, unread, missing, reload: load, markRead, markAll, markMany }
}
