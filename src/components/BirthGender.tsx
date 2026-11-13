import { useState } from 'react'

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export type BG = { d: string; m: string; y: string; gender: '' | 'male' | 'female' }
export const emptyBG: BG = { d: '', m: '', y: '', gender: '' }

// بيرجّع تاريخ الميلاد ISO، أو نص الخطأ لو ناقص/غلط
export function checkBG(v: BG): { iso?: string; error?: string } {
  if (!v.d || !v.m || !v.y) return { error: 'اختار تاريخ ميلادك كامل.' }
  const dt = new Date(Number(v.y), Number(v.m) - 1, Number(v.d))
  if (dt.getMonth() !== Number(v.m) - 1) return { error: 'التاريخ ده مش موجود، راجع اليوم والشهر.' }
  const age = (Date.now() - dt.getTime()) / 31557600000
  if (age < 13) return { error: 'لازم يكون عمرك 13 سنة أو أكتر.' }
  if (!v.gender) return { error: 'اختار الجنس.' }
  return { iso: `${v.y}-${v.m.padStart(2, '0')}-${v.d.padStart(2, '0')}` }
}

const selStyle = (minHeight: number) => ({ minHeight, flex: 1, border: '1px solid #D4D4D8', borderRadius: 12, padding: '0 10px', background: '#fff', fontFamily: 'inherit', fontSize: 15, minWidth: 0 }) as const
type P = { value: BG; onChange: (v: BG) => void; minHeight?: number }

export function BirthField({ value, onChange, minHeight = 46 }: P) {
  const [thisYear] = useState(() => new Date().getFullYear())
  const sel = selStyle(minHeight)
  const set = (p: Partial<BG>) => onChange({ ...value, ...p })
  return (
    <div className="col" style={{ gap: 6 }}><b>تاريخ الميلاد</b>
      <div className="row" style={{ gap: 8 }}>
        <select style={sel} value={value.d} onChange={(e) => set({ d: e.target.value })} aria-label="اليوم"><option value="">اليوم</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
        <select style={{ ...sel, flex: 1.6 }} value={value.m} onChange={(e) => set({ m: e.target.value })} aria-label="الشهر"><option value="">الشهر</option>{MONTHS.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}</select>
        <select style={{ ...sel, flex: 1.3 }} value={value.y} onChange={(e) => set({ y: e.target.value })} aria-label="السنة"><option value="">السنة</option>{Array.from({ length: thisYear - 1925 }, (_, i) => thisYear - i).map((yy) => <option key={yy} value={yy}>{yy}</option>)}</select>
      </div>
      <span className="mut" style={{ fontSize: 12.5 }}>لازم عمرك 13 سنة أو أكتر. تاريخ ميلادك ما بيظهرش لحد غيرك.</span>
    </div>
  )
}
export function GenderField({ value, onChange, minHeight = 46 }: P) {
  return (
    <div className="col" style={{ gap: 6 }}><b>الجنس</b>
      <div className="row" style={{ gap: 10 }}>
        {([['male', 'ذكر'], ['female', 'أنثى']] as const).map(([k, t]) => (
          <button type="button" key={k} onClick={() => onChange({ ...value, gender: k })} className="btn" style={{ flex: 1, minHeight, ...(value.gender === k ? { background: 'var(--brand)', color: '#fff' } : {}) }}>{t}</button>
        ))}
      </div>
    </div>
  )
}
// الاتنين تحت بعض (موبايل)
export default function BirthGender(p: P) { return <><BirthField {...p} /><GenderField {...p} /></> }
