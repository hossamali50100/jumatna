import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

// المفتاح ده (anon) آمن إنه يبان في الموقع؛ الحماية الحقيقية في RLS اللي في schema.sql
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Profile = {
  id: string; name: string; avatar_url: string | null
  role: 'user' | 'admin' | 'mod' | 'support'; plan: 'free' | 'premium'
  plan_until: string | null; banned: boolean
  bio?: string; cover_url?: string | null; created_at?: string; deletion_requested_at?: string | null; is_locked?: boolean
}
export type Group = {
  id: string; owner_id: string; name: string; description: string
  cover_url: string | null; privacy: 'public' | 'private'; created_at: string
}
export type Post = {
  id: string; group_id: string | null; author_id: string; body: string; image_url: string | null; created_at: string
  profiles: Pick<Profile, 'name' | 'avatar_url' | 'plan' | 'plan_until'> | null
  groups: { name: string; cover_url?: string | null } | null
  likes: { count: number }[]; comments: { count: number }[]
}

export const isPremium = (p?: Pick<Profile, 'plan' | 'plan_until'> | null) =>
  !!p && p.plan === 'premium' && (!p.plan_until || new Date(p.plan_until) > new Date())

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export async function uploadImage(file: File, uid: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('نوع الصورة غير مدعوم (JPG/PNG/WebP/GIF فقط).')
  if (file.size > 5 * 1024 * 1024) throw new Error('الصورة أكبر من 5 ميجا.')
  const ext = file.type.split('/')[1]
  const path = `${uid}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type })
  if (error) throw new Error('تعذّر رفع الصورة: ' + error.message)
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

export const errMsg = (e: unknown) =>
  (e as { message?: string })?.message || 'حصلت مشكلة، جرّب تاني.'
