import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type HideKind = 'user' | 'group'
export type HideDetail = { kind: HideKind; id: string; name: string }

// إخفاء منشورات شخص أو مجموعة من الصفحة الرئيسية (تحديث 040). بيرجّع نص خطأ لو فشل.
export async function hideFeed(uid: string, kind: HideKind, id: string, name: string): Promise<string> {
  const { error } = await supabase.from('feed_hides').insert({ user_id: uid, kind, target_id: id })
  if (error && error.code !== '23505') return /feed_hides|schema cache|relation/i.test(error.message) ? 'الإخفاء محتاج تحديث 040 في Supabase (مرة واحدة).' : error.message
  window.dispatchEvent(new CustomEvent<HideDetail>('jm:hid', { detail: { kind, id, name } }))
  window.dispatchEvent(new Event('jm:hides'))
  return ''
}

export function useHides() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [rows, setRows] = useState<{ kind: HideKind; target_id: string }[]>([])
  const load = useCallback(async () => {
    if (!uid) return
    const r = await supabase.from('feed_hides').select('kind,target_id').eq('user_id', uid)
    if (!r.error) setRows((r.data ?? []) as { kind: HideKind; target_id: string }[])
  }, [uid])
  useEffect(() => { load(); window.addEventListener('jm:hides', load); return () => window.removeEventListener('jm:hides', load) }, [load])
  const unhide = async (kind: HideKind, id: string) => {
    setRows((l) => l.filter((x) => !(x.kind === kind && x.target_id === id)))
    await supabase.from('feed_hides').delete().eq('user_id', uid!).eq('kind', kind).eq('target_id', id)
    window.dispatchEvent(new Event('jm:hides'))
  }
  return {
    rows, unhide, reload: load,
    users: new Set(rows.filter((r) => r.kind === 'user').map((r) => r.target_id)),
    groups: new Set(rows.filter((r) => r.kind === 'group').map((r) => r.target_id)),
  }
}
