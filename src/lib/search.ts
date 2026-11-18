import { supabase } from './supabase'

// قواعد البحث في المنصة:
// 1) لازم يكتب 3 حروف على الأقل.
// 2) النتيجة لازم كلمة في الاسم "تبدأ" باللي اتكتب (مش أي حرف في نص الكلمة).
//    مثال: "محب" تجيب "محبين مصر"، "مصر" تجيب "محبين مصر" و"المصريين"، لكن "ص" أو "حبين" ما تجيبش.
export const SEARCH_MIN = 3

export const cleanTerm = (s: string) => s.replace(/[\\%_,()"*.:]/g, ' ').replace(/\s+/g, ' ').trim()

export const searchReady = (s: string) => cleanTerm(s).length >= SEARCH_MIN

// فلتر PostgREST: الاسم يبدأ بالكلمة، أو فيه كلمة تبدأ بيها، أو نفس الكلمة بـ "ال" قبلها
export function wordStart(col: string, raw: string) {
  const t = cleanTerm(raw)
  const pats = [`${t}%`, `% ${t}%`]
  if (!t.startsWith('ال')) pats.push(`ال${t}%`, `% ال${t}%`)
  return pats.map((p) => `${col}.ilike."${p}"`).join(',')
}

// بحث تقريبي من قاعدة البيانات (تحديث 049). لو التحديث لسه ما اتشغّلش بنرجع للبحث العادي من أول الكلمة.
type Res<T> = { data: T[] | null; error: { message: string } | null }
const missing = (e: { message: string } | null) => !!e && /search_(groups|people)|schema cache|function/i.test(e.message)

export async function findGroups<T>(term: string, limit: number): Promise<Res<T>> {
  const r = await supabase.rpc('search_groups', { p_q: term, p_limit: limit })
  if (!missing(r.error)) return r as Res<T>
  return (await supabase.from('groups').select('*').or(wordStart('name', term)).order('created_at', { ascending: false }).limit(limit)) as Res<T>
}

export async function findPeople<T>(term: string, limit: number, me: string): Promise<Res<T>> {
  const r = await supabase.rpc('search_people', { p_q: term, p_limit: limit })
  if (!missing(r.error)) return r as Res<T>
  return (await supabase.from('profiles').select('id,name,avatar_url,bio,plan,plan_until').or(wordStart('name', term)).neq('id', me).order('name').limit(limit)) as Res<T>
}
