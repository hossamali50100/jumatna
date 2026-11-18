import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Promo = { id: string; post_id: string; body: string; starts_at: string; ends_at: string; target_viewers: number; status: string; views: number; likes: number; comments: number; target_gender: string; age_min: number | null; age_max: number | null }
const who = (p: Promo) => {
  const g = p.target_gender === 'female' ? 'سيدات' : p.target_gender === 'male' ? 'رجال' : 'الجميع'
  const a = p.age_min || p.age_max ? ` · ${p.age_min ?? '13'}–${p.age_max ?? '100'} سنة` : ''
  return g + a
}
const state = (p: Promo) => {
  if (p.status === 'paused') return 'متوقف'
  if (new Date(p.ends_at) < new Date()) return 'انتهى'
  if (p.views >= p.target_viewers) return 'اكتمل العدد'
  return 'شغال'
}

// إحصائيات ترويج بوستات المجموعة (لمشرف المجموعة). الترويج نفسه بتعمله الإدارة.
export default function GroupPromos({ gid }: { gid: string }) {
  const [rows, setRows] = useState<Promo[] | null>(null)
  useEffect(() => {
    supabase.rpc('group_promos', { gid }).then(({ data, error }) => setRows(error ? [] : ((data ?? []) as Promo[])))
  }, [gid])
  return (
    <div className="crd col" style={{ gap: 10 }}>
      <b style={{ fontSize: 18 }}>📣 ترويج المنشورات</b>
      {rows === null && <span className="mut">جاري التحميل…</span>}
      {rows?.length === 0 && <span className="mut" style={{ fontSize: 14, lineHeight: 1.8 }}>مفيش منشورات متروّجة. لو عايز توصّل بوست لناس أكتر برّه المجموعة، <Link to="/support" style={{ color: 'var(--brand)', fontWeight: 700 }}>كلّم الإدارة</Link> وهنحدد معاك المدة والجمهور وطريقة الدفع.</span>}
      {rows?.map((p) => (
        <div key={p.id} className="col" style={{ gap: 6, padding: 12, borderRadius: 12, border: '1px solid #E4E4E7' }}>
          <div className="row" style={{ gap: 8 }}><span className="pill">{state(p)}</span><span className="mut grow" style={{ fontSize: 13 }}>{who(p)} · ينتهي {new Date(p.ends_at).toLocaleDateString('ar-EG-u-nu-latn')}</span></div>
          <Link to={'/post/' + p.post_id} style={{ lineHeight: 1.6 }}>{p.body.length > 90 ? p.body.slice(0, 90) + '…' : p.body}</Link>
          <div className="row" style={{ gap: 14, fontSize: 14, flexWrap: 'wrap' }}><span>👁 ظهر لـ <b>{p.views}</b> من {p.target_viewers}</span><span>❤️ {p.likes}</span><span>💬 {p.comments}</span></div>
        </div>
      ))}
    </div>
  )
}
